const uuidv4 = require('uuid').v4
const Path = require('path')
const { LogLevel } = require('../utils/constants')
const { getTitleIgnorePrefix } = require('../utils/index')
const AudioFileScanner = require('./AudioFileScanner')
const Database = require('../Database')
const { filePathToPOSIX, getFileTimestampsWithIno } = require('../utils/fileUtils')
const Logger = require('../Logger')
const AudioFile = require('../objects/files/AudioFile')
const VideoFile = require('../objects/files/VideoFile')
const globals = require('../utils/globals')
const prober = require('../utils/prober')
const CoverManager = require('../managers/CoverManager')
const LibraryFile = require('../objects/files/LibraryFile')
const fsExtra = require('../libs/fsExtra')
const PodcastEpisode = require('../models/PodcastEpisode')
const AbsMetadataFileScanner = require('./AbsMetadataFileScanner')
const htmlSanitizer = require('../utils/htmlSanitizer')
const { extractVideoFrame } = require('../utils/ffmpegHelpers')
const { videoScanner } = require('../video')

/**
 * Metadata for podcasts pulled from files
 * @typedef PodcastMetadataObject
 * @property {string} title
 * @property {string} titleIgnorePrefix
 * @property {string} author
 * @property {string} releaseDate
 * @property {string} feedURL
 * @property {string} imageURL
 * @property {string} description
 * @property {string} itunesPageURL
 * @property {string} itunesId
 * @property {string} language
 * @property {string} podcastType
 * @property {string[]} genres
 * @property {string[]} tags
 * @property {boolean} explicit
 */

class PodcastScanner {
  constructor() {}

  /**
   * Scan a video library file and return VideoFile and probe data
   * @param {import('../objects/files/LibraryFile')} libraryFile
   * @returns {Promise<{videoFile: VideoFile, probeData: Object}|null>}
   */
  async scanVideoLibraryFile(libraryFile) {
    return videoScanner.scanVideoLibraryFile(libraryFile)
  }

  /**
   * @param {import('../models/LibraryItem')} existingLibraryItem
   * @param {import('./LibraryItemScanData')} libraryItemData
   * @param {import('../models/Library').LibrarySettingsObject} librarySettings
   * @param {import('./LibraryScan')} libraryScan
   * @returns {Promise<{libraryItem:import('../models/LibraryItem'), wasUpdated:boolean}>}
   */
  async rescanExistingPodcastLibraryItem(existingLibraryItem, libraryItemData, librarySettings, libraryScan) {
    /** @type {import('../models/Podcast')} */
    const media = await existingLibraryItem.getMedia({
      include: [
        {
          model: Database.podcastEpisodeModel
        }
      ]
    })

    /** @type {import('../models/PodcastEpisode')[]} */
    let existingPodcastEpisodes = media.podcastEpisodes

    /** @type {AudioFile[]} */
    let newAudioFiles = []

    // Track episode add/remove/update so item_updated includes the current episode list
    let hasEpisodeChanges = false

    const hasMediaFileChanges = libraryItemData.hasMediaFileChanges || (libraryItemData.mediaLibraryFiles.length !== existingPodcastEpisodes.length)

    if (hasMediaFileChanges) {
      // Filter out and destroy episodes that were removed.
      // filter() returns a new array — reassign to media.podcastEpisodes before emit.
      const episodesToRemove = []
      existingPodcastEpisodes = existingPodcastEpisodes.filter((ep) => {
        if (!ep.audioFile && !ep.videoFile) return true
        const fileToCheck = ep.episodeMediaType === 'video' ? (ep.videoFile || ep.audioFile) : (ep.audioFile || ep.videoFile)
        if (libraryItemData.checkMediaFileRemoved(fileToCheck)) {
          episodesToRemove.push(ep)
          return false
        }
        return true
      })

      if (episodesToRemove.length) {
        hasEpisodeChanges = true
        // Remove episodes from playlists and media progress
        const episodeIds = episodesToRemove.map((ep) => ep.id)
        await Database.playlistModel.removeMediaItemsFromPlaylists(episodeIds)
        const mediaProgressRemoved = await Database.mediaProgressModel.destroy({
          where: {
            mediaItemId: episodeIds
          }
        })
        if (mediaProgressRemoved) {
          libraryScan.addLog(LogLevel.INFO, `Removed ${mediaProgressRemoved} media progress for episodes`)
        }

        // Remove episodes
        await Promise.all(
          episodesToRemove.map(async (ep) => {
            await ep.destroy()
            libraryScan.addLog(LogLevel.INFO, `Podcast episode "${ep.title}" media file was removed`)
          })
        )
      }

      // Update audio files that were modified
      if (libraryItemData.audioLibraryFilesModified.length) {
        let scannedAudioFiles = await AudioFileScanner.executeMediaFileScans(
          existingLibraryItem.mediaType,
          libraryItemData,
          libraryItemData.audioLibraryFilesModified.map((lf) => lf.new)
        )

        for (const podcastEpisode of existingPodcastEpisodes) {
          if (!podcastEpisode.audioFile) continue
          let matchedScannedAudioFile = scannedAudioFiles.find((saf) => saf.metadata.path === podcastEpisode.audioFile.metadata.path)
          if (!matchedScannedAudioFile) {
            matchedScannedAudioFile = scannedAudioFiles.find((saf) => saf.ino === podcastEpisode.audioFile.ino)
          }

          if (matchedScannedAudioFile) {
            scannedAudioFiles = scannedAudioFiles.filter((saf) => saf !== matchedScannedAudioFile)
            const audioFile = new AudioFile(podcastEpisode.audioFile)
            audioFile.updateFromScan(matchedScannedAudioFile)
            podcastEpisode.audioFile = audioFile.toJSON()
            podcastEpisode.changed('audioFile', true)

            // Set metadata and save episode
            AudioFileScanner.setPodcastEpisodeMetadataFromAudioMetaTags(podcastEpisode, libraryScan)
            libraryScan.addLog(LogLevel.INFO, `Podcast episode "${podcastEpisode.title}" keys changed [${podcastEpisode.changed()?.join(', ')}]`)
            await podcastEpisode.save()
            hasEpisodeChanges = true
          }
        }

        // Modified audio files that were not found as a podcast episode
        if (scannedAudioFiles.length) {
          newAudioFiles.push(...scannedAudioFiles)
        }
      }

      // Update video files that were modified
      if (await videoScanner.handleModifiedVideoFiles(existingLibraryItem, libraryItemData, existingPodcastEpisodes, AudioFileScanner, libraryScan)) {
        hasEpisodeChanges = true
      }

      // Add new audio files scanned in
      if (libraryItemData.audioLibraryFilesAdded.length) {
        const scannedAudioFiles = await AudioFileScanner.executeMediaFileScans(existingLibraryItem.mediaType, libraryItemData, libraryItemData.audioLibraryFilesAdded)
        newAudioFiles.push(...scannedAudioFiles)
      }

      // Create new podcast episodes from new found audio files
      for (const newAudioFile of newAudioFiles) {
        // Podcast episode audio files always have index 1
        newAudioFile.index = 1
        const audioFilenameNoExt = newAudioFile.metadata?.filenameNoExt || Path.parse(newAudioFile.metadata?.filename || '').name
        const audioTitle = newAudioFile.metaTags?.tagTitle || audioFilenameNoExt

        // Check if an existing episode (e.g. video episode) matches this audio file
        const matchingExistingEpisode = existingPodcastEpisodes.find((ep) => {
          if (ep.audioFile && (ep.audioFile.ino === newAudioFile.ino || ep.audioFile.metadata?.path === newAudioFile.metadata?.path)) {
            return true
          }
          if (ep.videoFile) {
            const epVideoFilenameNoExt = ep.videoFile.metadata?.filenameNoExt || Path.parse(ep.videoFile.metadata?.filename || '').name
            if (audioFilenameNoExt && epVideoFilenameNoExt && audioFilenameNoExt.toLowerCase() === epVideoFilenameNoExt.toLowerCase()) {
              return true
            }
          }
          if (ep.title && audioTitle && ep.title.trim().toLowerCase() === audioTitle.trim().toLowerCase()) {
            return true
          }
          return false
        })

        if (matchingExistingEpisode) {
          matchingExistingEpisode.audioFile = newAudioFile.toJSON()
          matchingExistingEpisode.changed('audioFile', true)
          if (!matchingExistingEpisode.chapters?.length && newAudioFile.chapters?.length) {
            matchingExistingEpisode.chapters = newAudioFile.chapters
            matchingExistingEpisode.changed('chapters', true)
          }
          AudioFileScanner.setPodcastEpisodeMetadataFromAudioMetaTags(matchingExistingEpisode, libraryScan)
          libraryScan.addLog(LogLevel.INFO, `Updated existing podcast episode "${matchingExistingEpisode.title}" with audio file`)
          await matchingExistingEpisode.save()
          hasEpisodeChanges = true
        } else {
          const newEpisode = {
            title: audioTitle,
            subtitle: null,
            season: null,
            episode: null,
            episodeType: null,
            pubDate: null,
            publishedAt: null,
            description: null,
            audioFile: newAudioFile.toJSON(),
            videoFile: null,
            episodeMediaType: 'audio',
            chapters: newAudioFile.chapters || [],
            podcastId: media.id
          }
          const newPodcastEpisode = Database.podcastEpisodeModel.build(newEpisode)
          // Set metadata and save new episode
          AudioFileScanner.setPodcastEpisodeMetadataFromAudioMetaTags(newPodcastEpisode, libraryScan)
          libraryScan.addLog(LogLevel.INFO, `New Podcast episode "${newPodcastEpisode.title}" added`)
          await newPodcastEpisode.save()
          existingPodcastEpisodes.push(newPodcastEpisode)
          hasEpisodeChanges = true
        }
      }

      // Add new video files scanned in
      if (await videoScanner.handleAddedVideoFiles(existingLibraryItem, libraryItemData, existingPodcastEpisodes, media, AudioFileScanner, libraryScan)) {
        hasEpisodeChanges = true
      }
    }

    // Check and upgrade any existing episodes that have video files or video extensions
    for (const ep of existingPodcastEpisodes) {
      if (!ep.videoFile && ep.audioFile) {
        const afExt = (ep.audioFile.metadata?.ext || ep.audioFile.metadata?.format || '').replace(/^\./, '').toLowerCase()
        const isVideoExt = globals.SupportedVideoTypes.some((vExt) => afExt === vExt || afExt.includes(vExt))
        if (isVideoExt) {
          const matchingLf = libraryItemData.libraryFiles?.find((lf) =>
            lf.ino === ep.audioFile.ino ||
            lf.metadata?.path === ep.audioFile.metadata?.path ||
            (lf.metadata?.filenameNoExt && ep.audioFile.metadata?.filenameNoExt && lf.metadata.filenameNoExt.toLowerCase() === ep.audioFile.metadata.filenameNoExt.toLowerCase())
          )
          if (matchingLf) {
            const res = await this.scanVideoLibraryFile(matchingLf)
            if (res) {
              ep.videoFile = res.videoFile.toJSON()
              ep.episodeMediaType = 'video'
              ep.audioFile = null
              ep.changed('videoFile', true)
              ep.changed('episodeMediaType', true)
              ep.changed('audioFile', true)
              if (res.videoFile.thumbnail) {
                ep.thumbnail = res.videoFile.thumbnail
                ep.changed('thumbnail', true)
                const thumbFilename = Path.basename(res.videoFile.thumbnail)
                const thumbPath = Path.join(Path.dirname(matchingLf.metadata.path), thumbFilename)
                if (await fsExtra.pathExists(thumbPath)) {
                  const existingLf = existingLibraryItem.libraryFiles?.find((lf) => lf.metadata?.path === filePathToPOSIX(thumbPath))
                  if (!existingLf) {
                    const thumbLf = new LibraryFile()
                    await thumbLf.setDataFromPath(thumbPath, res.videoFile.thumbnail)
                    existingLibraryItem.libraryFiles.push(thumbLf.toJSON())
                    existingLibraryItem.changed('libraryFiles', true)
                  }
                }
              }
              if (res.infoJson) {
                if (res.infoJson.publishedAt && (!ep.publishedAt || !ep.pubDate)) {
                  ep.publishedAt = res.infoJson.publishedAt
                  ep.pubDate = res.infoJson.pubDate || ep.pubDate
                  ep.changed('publishedAt', true)
                  ep.changed('pubDate', true)
                } else if (res.infoJson.pubDate && !ep.pubDate) {
                  ep.pubDate = res.infoJson.pubDate
                  ep.changed('pubDate', true)
                }
                if (!ep.description && res.infoJson.description) {
                  ep.description = res.infoJson.description
                  ep.changed('description', true)
                }
                if (!ep.subtitle && res.infoJson.subtitle) {
                  ep.subtitle = res.infoJson.subtitle
                  ep.changed('subtitle', true)
                }
                if (!ep.season && res.infoJson.season) {
                  ep.season = res.infoJson.season
                  ep.changed('season', true)
                }
                if (!ep.episode && res.infoJson.episode) {
                  ep.episode = res.infoJson.episode
                  ep.changed('episode', true)
                }
                if (!ep.chapters?.length && res.infoJson.chapters?.length) {
                  ep.chapters = res.infoJson.chapters
                  ep.changed('chapters', true)
                }
                if (res.infoJson.extraData && !ep.extraData?.guid) {
                  ep.extraData = { ...(ep.extraData || {}), ...res.infoJson.extraData }
                  ep.changed('extraData', true)
                }
              }
              await ep.save()
              hasEpisodeChanges = true
            }
          }
        }
      } else if (ep.videoFile && ep.episodeMediaType !== 'video') {
        ep.episodeMediaType = 'video'
        ep.changed('episodeMediaType', true)
        await ep.save()
        hasEpisodeChanges = true
      }
    }

    // Check all video library files on disk to ensure every video file has a corresponding video episode
    const allVideoLibraryFiles = libraryItemData.videoLibraryFiles || []
    for (const videoLf of allVideoLibraryFiles) {
      const alreadyAttached = existingPodcastEpisodes.some((ep) =>
        ep.videoFile && (ep.videoFile.ino === videoLf.ino || filePathToPOSIX(ep.videoFile.metadata?.path) === filePathToPOSIX(videoLf.metadata.path))
      )
      if (!alreadyAttached) {
        const res = await this.scanVideoLibraryFile(videoLf)
        if (res) {
          const videoFilenameNoExt = videoLf.metadata?.filenameNoExt || res.videoFile.metadata?.filenameNoExt || Path.parse(videoLf.metadata?.filename || '').name
          const infoJson = res.infoJson
          const videoTitle = infoJson?.title || res.probeData.audioMetaTags?.tagTitle || videoFilenameNoExt || res.videoFile.metadata.filename.replace(/\.[^.]+$/, '')
          const extracted = require('../utils/podcastUtils').extractEpisodeNumbers(videoTitle)
          const season = infoJson?.season || extracted.season || null
          const episode = infoJson?.episode || extracted.episode || null

          // Match by audioFile or title
          const matchingEpisode = existingPodcastEpisodes.find((ep) => {
            if (ep.audioFile && (ep.audioFile.ino === videoLf.ino || filePathToPOSIX(ep.audioFile.metadata?.path) === filePathToPOSIX(videoLf.metadata.path))) {
              return true
            }
            if (ep.audioFile) {
              const audioFilenameNoExt = ep.audioFile.metadata?.filenameNoExt || Path.parse(ep.audioFile.metadata?.filename || '').name
              if (videoFilenameNoExt && audioFilenameNoExt && videoFilenameNoExt.toLowerCase() === audioFilenameNoExt.toLowerCase()) {
                return true
              }
            }
            if (ep.title && videoTitle && ep.title.trim().toLowerCase() === videoTitle.trim().toLowerCase()) {
              return true
            }
            return false
          })

          if (matchingEpisode) {
            matchingEpisode.videoFile = res.videoFile.toJSON()
            matchingEpisode.episodeMediaType = 'video'
            matchingEpisode.audioFile = null
            matchingEpisode.changed('videoFile', true)
            matchingEpisode.changed('episodeMediaType', true)
            matchingEpisode.changed('audioFile', true)
            if (res.videoFile.thumbnail) {
              matchingEpisode.thumbnail = res.videoFile.thumbnail
              matchingEpisode.changed('thumbnail', true)
            }
            if (!matchingEpisode.chapters?.length && res.probeData.chapters?.length) {
              matchingEpisode.chapters = res.probeData.chapters
              matchingEpisode.changed('chapters', true)
            }
            if (res.infoJson) {
              if (res.infoJson.publishedAt && (!matchingEpisode.publishedAt || !matchingEpisode.pubDate)) {
                matchingEpisode.publishedAt = res.infoJson.publishedAt
                matchingEpisode.pubDate = res.infoJson.pubDate || matchingEpisode.pubDate
                matchingEpisode.changed('publishedAt', true)
                matchingEpisode.changed('pubDate', true)
              } else if (res.infoJson.pubDate && !matchingEpisode.pubDate) {
                matchingEpisode.pubDate = res.infoJson.pubDate
                matchingEpisode.changed('pubDate', true)
              }
              if (!matchingEpisode.description && res.infoJson.description) {
                matchingEpisode.description = res.infoJson.description
                matchingEpisode.changed('description', true)
              }
              if (!matchingEpisode.subtitle && res.infoJson.subtitle) {
                matchingEpisode.subtitle = res.infoJson.subtitle
                matchingEpisode.changed('subtitle', true)
              }
              if (!matchingEpisode.season && res.infoJson.season) {
                matchingEpisode.season = res.infoJson.season
                matchingEpisode.changed('season', true)
              }
              if (!matchingEpisode.episode && res.infoJson.episode) {
                matchingEpisode.episode = res.infoJson.episode
                matchingEpisode.changed('episode', true)
              }
              if (res.infoJson.extraData && !matchingEpisode.extraData?.guid) {
                matchingEpisode.extraData = { ...(matchingEpisode.extraData || {}), ...res.infoJson.extraData }
                matchingEpisode.changed('extraData', true)
              }
            }
            await matchingEpisode.save()
            hasEpisodeChanges = true
          } else {
            let episodePubDate = infoJson?.pubDate || res.videoFile?.metaTags?.tagDate || null
            let episodePublishedAt = infoJson?.publishedAt || null
            if (!episodePublishedAt && episodePubDate) {
              const { parseDateToTimestampAndString } = require('../utils/parsers/parseInfoJsonMetadata')
              const parsed = parseDateToTimestampAndString(episodePubDate)
              if (parsed.publishedAt) episodePublishedAt = parsed.publishedAt
            } else if (episodePublishedAt && !episodePubDate) {
              const { parseDateToTimestampAndString } = require('../utils/parsers/parseInfoJsonMetadata')
              const parsed = parseDateToTimestampAndString(null, episodePublishedAt)
              if (parsed.pubDate) episodePubDate = parsed.pubDate
            }

            const newEpisode = {
              title: videoTitle,
              subtitle: infoJson?.subtitle || null,
              season,
              episode,
              episodeType: infoJson?.episodeType || 'full',
              pubDate: episodePubDate,
              publishedAt: episodePublishedAt,
              description: infoJson?.description || null,
              audioFile: null,
              videoFile: res.videoFile.toJSON(),
              episodeMediaType: 'video',
              thumbnail: res.videoFile.thumbnail || null,
              chapters: res.probeData.chapters?.length ? res.probeData.chapters : (infoJson?.chapters || []),
              podcastId: media.id,
              extraData: infoJson?.extraData || {}
            }
            const newPodcastEpisode = Database.podcastEpisodeModel.build(newEpisode)
            AudioFileScanner.setPodcastEpisodeMetadataFromAudioMetaTags(newPodcastEpisode, libraryScan)
            await newPodcastEpisode.save()
            existingPodcastEpisodes.push(newPodcastEpisode)
            hasEpisodeChanges = true
          }
        }
      }
    }

    // Ensure all existing episodes have publishedAt and pubDate populated
    for (const ep of existingPodcastEpisodes) {
      let epChanged = false
      const { parseDateToTimestampAndString, parseInfoJsonMetadata } = require('../utils/parsers/parseInfoJsonMetadata')
      if (!ep.publishedAt && ep.pubDate) {
        const parsed = parseDateToTimestampAndString(ep.pubDate)
        if (parsed.publishedAt) {
          ep.publishedAt = parsed.publishedAt
          ep.changed('publishedAt', true)
          epChanged = true
        }
      } else if (ep.publishedAt && !ep.pubDate) {
        const parsed = parseDateToTimestampAndString(null, ep.publishedAt)
        if (parsed.pubDate) {
          ep.pubDate = parsed.pubDate
          ep.changed('pubDate', true)
          epChanged = true
        }
      }

      if (!ep.publishedAt || !ep.pubDate) {
        const mediaFile = ep.videoFile || ep.audioFile
        const mediaPath = mediaFile?.metadata?.path
          ? (Path.isAbsolute(mediaFile.metadata.path) ? mediaFile.metadata.path : Path.join(libraryItemData.path, mediaFile.metadata.path))
          : null
        if (mediaPath) {
          const companionPath = await videoScanner.findCompanionInfoJson(mediaPath)
          if (companionPath) {
            try {
              const infoJsonRaw = await fsExtra.readJson(companionPath)
              const parsedInfo = parseInfoJsonMetadata(infoJsonRaw)
              if (parsedInfo?.publishedAt && !ep.publishedAt) {
                ep.publishedAt = parsedInfo.publishedAt
                ep.changed('publishedAt', true)
                epChanged = true
              }
              if (parsedInfo?.pubDate && !ep.pubDate) {
                ep.pubDate = parsedInfo.pubDate
                ep.changed('pubDate', true)
                epChanged = true
              }
            } catch (_) {}
          }
        }
      }

      if (!ep.publishedAt || !ep.pubDate) {
        const mediaFile = ep.videoFile || ep.audioFile
        const tagDate = mediaFile?.metaTags?.tagDate
        const filename = mediaFile?.metadata?.filenameNoExt || mediaFile?.metadata?.filename
        const parsedTag = tagDate ? parseDateToTimestampAndString(tagDate) : null
        const parsedFilename = filename ? parseDateToTimestampAndString(filename) : null
        const parsedTitle = ep.title ? parseDateToTimestampAndString(ep.title) : null
        const candidate = (parsedTag?.publishedAt ? parsedTag : null) || (parsedFilename?.publishedAt ? parsedFilename : null) || (parsedTitle?.publishedAt ? parsedTitle : null)
        if (candidate?.publishedAt && !ep.publishedAt) {
          ep.publishedAt = candidate.publishedAt
          ep.changed('publishedAt', true)
          epChanged = true
        }
        if (candidate?.pubDate && !ep.pubDate) {
          ep.pubDate = candidate.pubDate
          ep.changed('pubDate', true)
          epChanged = true
        }
      }
      if (epChanged) {
        await ep.save()
        hasEpisodeChanges = true
      }
    }

    // Keep association in sync for toOldJSONExpanded() / item_updated socket payload
    media.podcastEpisodes = existingPodcastEpisodes

    let hasMediaChanges = false
    if (existingPodcastEpisodes.length !== media.numEpisodes) {
      media.numEpisodes = existingPodcastEpisodes.length
      hasMediaChanges = true
    }

    // Check if cover was removed
    if (media.coverPath && libraryItemData.imageLibraryFilesRemoved.some((lf) => lf.metadata.path === media.coverPath)) {
      media.coverPath = null
      hasMediaChanges = true
    }

    // Update cover if it was modified
    if (media.coverPath && libraryItemData.imageLibraryFilesModified.length) {
      let coverMatch = libraryItemData.imageLibraryFilesModified.find((iFile) => iFile.old.metadata.path === media.coverPath)
      if (coverMatch) {
        const coverPath = coverMatch.new.metadata.path
        if (coverPath !== media.coverPath) {
          libraryScan.addLog(LogLevel.DEBUG, `Updating podcast cover "${media.coverPath}" => "${coverPath}" for podcast "${media.title}"`)
          media.coverPath = coverPath
          media.changed('coverPath', true)
          hasMediaChanges = true
        }
      }
    }

    // Check if cover is not set and image files were found
    if (!media.coverPath && libraryItemData.imageLibraryFiles.length) {
      // Prefer using a cover image with the name "cover" otherwise use the first non-thumbnail image
      const coverMatch = libraryItemData.imageLibraryFiles.find((iFile) => /\/cover\.[^.\/]*$/.test(iFile.metadata.path))
      const nonThumbImages = libraryItemData.imageLibraryFiles.filter((iFile) => !iFile.metadata?.filenameNoExt?.endsWith('-thumb'))
      if (coverMatch) {
        media.coverPath = coverMatch.metadata.path
        hasMediaChanges = true
      } else if (nonThumbImages.length) {
        media.coverPath = nonThumbImages[0].metadata.path
        hasMediaChanges = true
      }
    }

    const podcastMetadata = await this.getPodcastMetadataFromScanData(existingPodcastEpisodes, libraryItemData, libraryScan, existingLibraryItem.id)

    for (const key in podcastMetadata) {
      // Ignore unset metadata and empty arrays
      if (podcastMetadata[key] === undefined || (Array.isArray(podcastMetadata[key]) && !podcastMetadata[key].length)) continue

      if (key === 'genres') {
        const existingGenres = media.genres || []
        if (podcastMetadata.genres.some((g) => !existingGenres.includes(g)) || existingGenres.some((g) => !podcastMetadata.genres.includes(g))) {
          libraryScan.addLog(LogLevel.DEBUG, `Updating podcast genres "${existingGenres.join(',')}" => "${podcastMetadata.genres.join(',')}" for podcast "${podcastMetadata.title}"`)
          media.genres = podcastMetadata.genres
          media.changed('genres', true)
          hasMediaChanges = true
        }
      } else if (key === 'tags') {
        const existingTags = media.tags || []
        if (podcastMetadata.tags.some((t) => !existingTags.includes(t)) || existingTags.some((t) => !podcastMetadata.tags.includes(t))) {
          libraryScan.addLog(LogLevel.DEBUG, `Updating podcast tags "${existingTags.join(',')}" => "${podcastMetadata.tags.join(',')}" for podcast "${podcastMetadata.title}"`)
          media.tags = podcastMetadata.tags
          media.changed('tags', true)
          hasMediaChanges = true
        }
      } else if (podcastMetadata[key] !== media[key]) {
        libraryScan.addLog(LogLevel.DEBUG, `Updating podcast ${key} "${media[key]}" => "${podcastMetadata[key]}" for podcast "${podcastMetadata.title}"`)
        media[key] = podcastMetadata[key]
        hasMediaChanges = true
      }
    }

    // If no cover then extract cover from audio file if available, or fall back to video thumbnail
    if (!media.coverPath && existingPodcastEpisodes.length) {
      const audioFiles = existingPodcastEpisodes.map((ep) => ep.audioFile).filter(Boolean)
      if (audioFiles.length) {
        const extractedCoverPath = await CoverManager.saveEmbeddedCoverArt(audioFiles, existingLibraryItem.id, existingLibraryItem.path)
        if (extractedCoverPath) {
          libraryScan.addLog(LogLevel.DEBUG, `Updating podcast "${podcastMetadata.title}" extracted embedded cover art from audio file to path "${extractedCoverPath}"`)
          media.coverPath = extractedCoverPath
          hasMediaChanges = true
        }
      }
      if (!media.coverPath) {
        const videoEpisodeWithThumb = existingPodcastEpisodes.find((ep) => ep.videoFile?.thumbnail || ep.thumbnail)
        if (videoEpisodeWithThumb) {
          const thumbRel = videoEpisodeWithThumb.videoFile?.thumbnail || videoEpisodeWithThumb.thumbnail
          const thumbPath = Path.join(existingLibraryItem.path, Path.basename(thumbRel))
          if (await fsExtra.pathExists(thumbPath)) {
            media.coverPath = filePathToPOSIX(thumbPath)
            hasMediaChanges = true
          }
        }
      }
    }

    existingLibraryItem.media = media

    let libraryItemUpdated = false

    // Save Podcast changes to db
    if (hasMediaChanges) {
      await media.save()
      await this.saveMetadataFile(existingLibraryItem, libraryScan)
      libraryItemUpdated = global.ServerSettings.storeMetadataWithItem
    }

    if (libraryItemUpdated) {
      existingLibraryItem.changed('libraryFiles', true)
      await existingLibraryItem.save()
    }

    return {
      libraryItem: existingLibraryItem,
      wasUpdated: hasMediaChanges || libraryItemUpdated || hasEpisodeChanges
    }
  }

  /**
   *
   * @param {import('./LibraryItemScanData')} libraryItemData
   * @param {import('../models/Library').LibrarySettingsObject} librarySettings
   * @param {import('./LibraryScan')} libraryScan
   * @returns {Promise<import('../models/LibraryItem')>}
   */
  async scanNewPodcastLibraryItem(libraryItemData, librarySettings, libraryScan) {
    // Scan audio files found
    let scannedAudioFiles = await AudioFileScanner.executeMediaFileScans(libraryItemData.mediaType, libraryItemData, libraryItemData.audioLibraryFiles)

    // Scan video files found
    const videoLibraryFiles = libraryItemData.videoLibraryFiles || libraryItemData.libraryFiles.filter(lf => globals.SupportedVideoTypes.includes(lf.metadata.ext?.slice(1).toLowerCase() || ''))
    const scannedVideoFiles = []
    for (const vf of videoLibraryFiles) {
      const res = await this.scanVideoLibraryFile(vf)
      if (res) scannedVideoFiles.push(res)
    }

    // Do not add library items that have no valid audio or video files
    if (!scannedAudioFiles.length && !scannedVideoFiles.length) {
      libraryScan.addLog(LogLevel.WARN, `Library item at path "${libraryItemData.relPath}" has no audio or video files - ignoring`)
      return null
    }

    const newPodcastEpisodes = []

    // Create podcast episodes from audio files
    for (const audioFile of scannedAudioFiles) {
      // Podcast episode audio files always have index 1
      audioFile.index = 1

      const newEpisode = {
        title: audioFile.metaTags.tagTitle || audioFile.metadata.filenameNoExt,
        subtitle: null,
        season: null,
        episode: null,
        episodeType: null,
        pubDate: null,
        publishedAt: null,
        description: null,
        audioFile: audioFile.toJSON(),
        videoFile: null,
        episodeMediaType: 'audio',
        chapters: audioFile.chapters || []
      }

      // Set metadata and save new episode
      AudioFileScanner.setPodcastEpisodeMetadataFromAudioMetaTags(newEpisode, libraryScan)
      const { parseDateToTimestampAndString } = require('../utils/parsers/parseInfoJsonMetadata')
      if (!newEpisode.publishedAt && newEpisode.pubDate) {
        const parsed = parseDateToTimestampAndString(newEpisode.pubDate)
        if (parsed.publishedAt) newEpisode.publishedAt = parsed.publishedAt
      } else if (newEpisode.publishedAt && !newEpisode.pubDate) {
        const parsed = parseDateToTimestampAndString(null, newEpisode.publishedAt)
        if (parsed.pubDate) newEpisode.pubDate = parsed.pubDate
      }
      if (!newEpisode.publishedAt && !newEpisode.pubDate) {
        const filename = audioFile.metadata?.filenameNoExt || audioFile.metadata?.filename
        const parsedFilename = filename ? parseDateToTimestampAndString(filename) : null
        if (parsedFilename?.publishedAt) {
          newEpisode.publishedAt = parsedFilename.publishedAt
          newEpisode.pubDate = parsedFilename.pubDate
        }
      }
      libraryScan.addLog(LogLevel.INFO, `New Podcast episode "${newEpisode.title}" found`)
      newPodcastEpisodes.push(newEpisode)
    }

    // Create podcast episodes from video files
    videoScanner.processScannedVideoFilesForNewItem(libraryItemData, scannedVideoFiles, newPodcastEpisodes, AudioFileScanner, libraryScan)

    const podcastMetadata = await this.getPodcastMetadataFromScanData(newPodcastEpisodes, libraryItemData, libraryScan)
    podcastMetadata.explicit = !!podcastMetadata.explicit // Ensure boolean

    // Set cover image from library file
    if (libraryItemData.imageLibraryFiles.length) {
      // Prefer using a cover image with the name "cover" otherwise use the first non-thumbnail image
      const coverMatch = libraryItemData.imageLibraryFiles.find((iFile) => /\/cover\.[^.\/]*$/.test(iFile.metadata.path))
      const nonThumbImages = libraryItemData.imageLibraryFiles.filter((iFile) => !iFile.metadata?.filenameNoExt?.endsWith('-thumb'))
      if (coverMatch) {
        podcastMetadata.coverPath = coverMatch.metadata.path
      } else if (nonThumbImages.length) {
        podcastMetadata.coverPath = nonThumbImages[0].metadata.path
      }
    }

    // Set default podcastType to episodic
    if (!podcastMetadata.podcastType) {
      podcastMetadata.podcastType = 'episodic'
    }

    const podcastObject = {
      ...podcastMetadata,
      autoDownloadEpisodes: false,
      autoDownloadSchedule: '0 * * * *',
      lastEpisodeCheck: 0,
      maxEpisodesToKeep: 0,
      maxNewEpisodesToDownload: 3,
      podcastEpisodes: newPodcastEpisodes,
      numEpisodes: newPodcastEpisodes.length
    }

    const libraryItemObj = libraryItemData.libraryItemObject
    libraryItemObj.id = uuidv4() // Generate library item id ahead of time to use for saving extracted cover image
    libraryItemObj.isMissing = false
    libraryItemObj.isInvalid = false
    libraryItemObj.extraData = {}
    libraryItemObj.title = podcastObject.title
    libraryItemObj.titleIgnorePrefix = getTitleIgnorePrefix(podcastObject.title)

    // If cover was not found in folder then check embedded covers in audio files
    if (!podcastObject.coverPath && scannedAudioFiles.length) {
      // Extract and save embedded cover art
      podcastObject.coverPath = await CoverManager.saveEmbeddedCoverArt(scannedAudioFiles, libraryItemObj.id, libraryItemObj.path)
    }

    libraryItemObj.podcast = podcastObject
    const libraryItem = await Database.libraryItemModel.create(libraryItemObj, {
      include: {
        model: Database.podcastModel,
        include: Database.podcastEpisodeModel
      }
    })

    Database.addGenresToFilterData(libraryItemData.libraryId, libraryItem.podcast.genres)
    Database.addTagsToFilterData(libraryItemData.libraryId, libraryItem.podcast.tags)

    // Load for emitting to client
    libraryItem.media = await libraryItem.getMedia({
      include: Database.podcastEpisodeModel
    })

    await this.saveMetadataFile(libraryItem, libraryScan)
    if (global.ServerSettings.storeMetadataWithItem) {
      libraryItem.changed('libraryFiles', true)
      await libraryItem.save()
    }

    return libraryItem
  }

  /**
   *
   * @param {PodcastEpisode[]} podcastEpisodes Not the models for new podcasts
   * @param {import('./LibraryItemScanData')} libraryItemData
   * @param {import('./LibraryScan')} libraryScan
   * @param {string} [existingLibraryItemId]
   * @returns {Promise<PodcastMetadataObject>}
   */
  async getPodcastMetadataFromScanData(podcastEpisodes, libraryItemData, libraryScan, existingLibraryItemId = null) {
    const podcastMetadata = {
      title: libraryItemData.mediaMetadata.title,
      titleIgnorePrefix: undefined,
      author: undefined,
      releaseDate: undefined,
      feedURL: undefined,
      imageURL: undefined,
      description: undefined,
      itunesPageURL: undefined,
      itunesId: undefined,
      itunesArtistId: undefined,
      language: undefined,
      podcastType: undefined,
      explicit: undefined,
      tags: [],
      genres: []
    }

    // Use audio meta tags
    if (podcastEpisodes.length) {
      const mediaFile = podcastEpisodes[0].audioFile || podcastEpisodes[0].videoFile
      AudioFileScanner.setPodcastMetadataFromAudioMetaTags(mediaFile, podcastMetadata, libraryScan)
    }

    // Use metadata.json file
    await AbsMetadataFileScanner.scanPodcastMetadataFile(libraryScan, libraryItemData, podcastMetadata, existingLibraryItemId)

    podcastMetadata.titleIgnorePrefix = getTitleIgnorePrefix(podcastMetadata.title)

    if (typeof podcastMetadata.description === 'string' && podcastMetadata.description) {
      podcastMetadata.description = htmlSanitizer.sanitize(podcastMetadata.description)
    }

    return podcastMetadata
  }

  /**
   *
   * @param {import('../models/LibraryItem')} libraryItem
   * @param {import('./LibraryScan')} libraryScan
   * @returns {Promise}
   */
  async saveMetadataFile(libraryItem, libraryScan) {
    let metadataPath = Path.join(global.MetadataPath, 'items', libraryItem.id)
    let storeMetadataWithItem = global.ServerSettings.storeMetadataWithItem
    if (storeMetadataWithItem) {
      metadataPath = libraryItem.path
    } else {
      // Make sure metadata book dir exists
      storeMetadataWithItem = false
      await fsExtra.ensureDir(metadataPath)
    }

    const metadataFilePath = Path.join(metadataPath, `metadata.${global.ServerSettings.metadataFileFormat}`)

    /**
     * Keys must match abmetadataGenerator.js
     */
    const jsonObject = {
      tags: libraryItem.media.tags || [],
      title: libraryItem.media.title,
      author: libraryItem.media.author,
      description: libraryItem.media.description,
      releaseDate: libraryItem.media.releaseDate,
      genres: libraryItem.media.genres || [],
      feedURL: libraryItem.media.feedURL,
      feedType: libraryItem.media.feedType || 'rss',
      imageURL: libraryItem.media.imageURL,
      itunesPageURL: libraryItem.media.itunesPageURL,
      itunesId: libraryItem.media.itunesId,
      itunesArtistId: libraryItem.media.itunesArtistId,
      asin: libraryItem.media.asin,
      language: libraryItem.media.language,
      explicit: !!libraryItem.media.explicit,
      podcastType: libraryItem.media.podcastType,
      maxDownloadResolution: libraryItem.media.maxDownloadResolution || 'best'
    }
    return fsExtra
      .writeFile(metadataFilePath, JSON.stringify(jsonObject, null, 2))
      .then(async () => {
        // Add metadata.json to libraryFiles array if it is new
        let metadataLibraryFile = (libraryItem.libraryFiles || []).find((lf) => lf.metadata?.path === filePathToPOSIX(metadataFilePath))
        if (storeMetadataWithItem) {
          if (!metadataLibraryFile) {
            const newLibraryFile = new LibraryFile()
            await newLibraryFile.setDataFromPath(metadataFilePath, `metadata.json`)
            metadataLibraryFile = newLibraryFile.toJSON()
            libraryItem.libraryFiles.push(metadataLibraryFile)
          } else {
            const fileTimestamps = await getFileTimestampsWithIno(metadataFilePath)
            if (fileTimestamps) {
              metadataLibraryFile.metadata.mtimeMs = fileTimestamps.mtimeMs
              metadataLibraryFile.metadata.ctimeMs = fileTimestamps.ctimeMs
              metadataLibraryFile.metadata.size = fileTimestamps.size
              metadataLibraryFile.ino = fileTimestamps.ino
            }
          }
          const libraryItemDirTimestamps = await getFileTimestampsWithIno(libraryItem.path)
          if (libraryItemDirTimestamps) {
            libraryItem.mtime = libraryItemDirTimestamps.mtimeMs
            libraryItem.ctime = libraryItemDirTimestamps.ctimeMs
            let size = 0
            libraryItem.libraryFiles.forEach((lf) => (size += !isNaN(lf.metadata.size) ? Number(lf.metadata.size) : 0))
            libraryItem.size = size
          }
        }

        libraryScan.addLog(LogLevel.DEBUG, `Success saving abmetadata to "${metadataFilePath}"`)

        return metadataLibraryFile
      })
      .catch((error) => {
        libraryScan.addLog(LogLevel.ERROR, `Failed to save json file at "${metadataFilePath}"`, error)
        return null
      })
  }
}
module.exports = new PodcastScanner()
