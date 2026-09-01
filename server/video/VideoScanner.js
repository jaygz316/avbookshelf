const Path = require('path')
const Logger = require('../Logger')
const prober = require('../utils/prober')
const fsExtra = require('../libs/fsExtra')
const { filePathToPOSIX } = require('../utils/index')
const { extractVideoFrame } = require('../utils/ffmpegHelpers')
const { LogLevel } = require('../utils/constants')
const globals = require('../utils/globals')
const VideoFile = require('./VideoFile')
const LibraryFile = require('../objects/files/LibraryFile')
const Database = require('../Database')
const { extractEpisodeNumbers } = require('./VideoEpisodeMatcher')
const { parseInfoJsonMetadata, parseDateToTimestampAndString } = require('../utils/parsers/parseInfoJsonMetadata')

class VideoScanner {
  constructor() {}

  /**
   * Scan a video library file and return VideoFile and probe data
   * @param {import('../objects/files/LibraryFile')} libraryFile
   * @returns {Promise<{videoFile: VideoFile, probeData: Object, infoJson: Object|null}|null>}
   */
  async scanVideoLibraryFile(libraryFile) {
    if (!libraryFile?.metadata?.path) {
      Logger.error('[VideoScanner] Invalid libraryFile or missing metadata path')
      return null
    }
    const probeData = await prober.probe(libraryFile.metadata.path)
    if (probeData.error) {
      Logger.error(`[VideoScanner] ${probeData.error} : "${libraryFile.metadata.path}"`)
      return null
    }
    const videoFile = new VideoFile()
    videoFile.setDataFromProbe(libraryFile, probeData)
    videoFile.index = 1

    let infoJson = null

    try {
      const filenameNoExt = libraryFile.metadata.filenameNoExt || Path.parse(libraryFile.metadata.path).name
      const videoDir = Path.dirname(libraryFile.metadata.path)
      const filename = libraryFile.metadata.filename || Path.basename(libraryFile.metadata.path)

      // Look for companion .info.json created by yt-dlp or other tools
      const candidateJsonPaths = [
        Path.join(videoDir, `${filenameNoExt}.info.json`),
        Path.join(videoDir, `${filename}.info.json`),
        Path.join(videoDir, `${filenameNoExt}.json`),
        Path.join(videoDir, `${filename}.json`)
      ]

      // Check if filename contains a YouTube video ID (e.g. 11 characters like [dQw4w9WgXcQ])
      const ytIdMatch = filenameNoExt.match(/(?:^|[\[\s_-])([a-zA-Z0-9_-]{11})(?:[\]\s_.-]|$)/)
      if (ytIdMatch) {
        const ytId = ytIdMatch[1]
        candidateJsonPaths.push(Path.join(videoDir, `${ytId}.info.json`))
        candidateJsonPaths.push(Path.join(videoDir, `${ytId}.json`))
      }

      let infoJsonPathToUse = null
      for (const candPath of candidateJsonPaths) {
        if (await fsExtra.pathExists(candPath)) {
          infoJsonPathToUse = candPath
          break
        }
      }

      if (infoJsonPathToUse) {
        try {
          const infoRawText = await fsExtra.readFile(infoJsonPathToUse, 'utf-8')
          infoJson = parseInfoJsonMetadata(infoRawText)
          if (infoJson) {
            Logger.debug(`[VideoScanner] Loaded .info.json metadata from "${infoJsonPathToUse}"`)
          }
        } catch (e) {
          Logger.warn(`[VideoScanner] Failed to parse .info.json at "${infoJsonPathToUse}":`, e)
        }
      }

      if (!videoFile.metaTags) videoFile.metaTags = {}

      // Enrich videoFile.metaTags if .info.json is available
      if (infoJson) {
        if (infoJson.title) videoFile.metaTags.tagTitle = infoJson.title
        if (infoJson.pubDate) videoFile.metaTags.tagDate = infoJson.pubDate
        if (!videoFile.metaTags.tagDescription && infoJson.description) videoFile.metaTags.tagDescription = infoJson.description
        if (!videoFile.metaTags.tagComment && infoJson.description) videoFile.metaTags.tagComment = infoJson.description
        if (!videoFile.metaTags.tagArtist && infoJson.author) videoFile.metaTags.tagArtist = infoJson.author
        if (!videoFile.metaTags.tagTrack && infoJson.episode) videoFile.metaTags.tagTrack = infoJson.episode
        if (!videoFile.metaTags.tagDisc && infoJson.season) videoFile.metaTags.tagDisc = infoJson.season
        if (!videoFile.metaTags.tagSubtitle && infoJson.subtitle) videoFile.metaTags.tagSubtitle = infoJson.subtitle

        if (!probeData.chapters?.length && infoJson.chapters?.length) {
          probeData.chapters = infoJson.chapters
          videoFile.chapters = infoJson.chapters
        }
        videoFile.infoJson = infoJson
      } else {
        // When .info.json is missing, attempt to extract publication date from filename or container tags
        if (!videoFile.metaTags.tagDate) {
          const parsedFromFilename = parseDateToTimestampAndString(filenameNoExt)
          if (parsedFromFilename.pubDate) {
            videoFile.metaTags.tagDate = parsedFromFilename.pubDate
          } else if (probeData.audioMetaTags?.tagDate) {
            const parsedFromTag = parseDateToTimestampAndString(probeData.audioMetaTags.tagDate)
            if (parsedFromTag.pubDate) {
              videoFile.metaTags.tagDate = parsedFromTag.pubDate
            }
          } else if (libraryFile.metadata?.birthtimeMs || libraryFile.metadata?.mtimeMs) {
            const fileTime = libraryFile.metadata.birthtimeMs || libraryFile.metadata.mtimeMs
            const parsedFromFileTime = parseDateToTimestampAndString(null, fileTime)
            if (parsedFromFileTime.pubDate) {
              videoFile.metaTags.tagDate = parsedFromFileTime.pubDate
            }
          }
        }
      }

      const thumbFilename = `${filenameNoExt}-thumb.jpg`
      const thumbPath = Path.join(videoDir, thumbFilename)

      const relDir = Path.dirname(libraryFile.metadata.relPath || '')
      const relativeThumbnailPath = relDir && relDir !== '.' ? Path.posix.join(filePathToPOSIX(relDir), thumbFilename) : thumbFilename

      let thumbExists = await fsExtra.pathExists(thumbPath)
      if (!thumbExists) {
        // yt-dlp writes the thumbnail with the same base name as the video (e.g. "My Video.jpg")
        // rather than with the "-thumb" suffix we expect. Check for that file first before
        // falling back to an ffmpeg frame extraction.
        const ytDlpThumbPath = Path.join(videoDir, `${filenameNoExt}.jpg`)
        const ytDlpThumbExists = await fsExtra.pathExists(ytDlpThumbPath)
        if (ytDlpThumbExists) {
          Logger.debug(`[VideoScanner] Found yt-dlp thumbnail at "${ytDlpThumbPath}", copying to "${thumbPath}"`)
          await fsExtra.copy(ytDlpThumbPath, thumbPath)
          thumbExists = true
        }
      }

      if (!thumbExists) {
        const seekSeconds = probeData.duration && probeData.duration < 5 ? Math.floor(probeData.duration / 2) : 5
        const extractRes = await extractVideoFrame(libraryFile.metadata.path, thumbPath, seekSeconds)
        if (extractRes) {
          thumbExists = true
        }
      }

      if (thumbExists) {
        videoFile.thumbnail = relativeThumbnailPath
      }
    } catch (err) {
      Logger.error(`[VideoScanner] Failed to extract video thumbnail/metadata for "${libraryFile.metadata.path}"`, err)
    }

    return { videoFile, probeData, infoJson }
  }

  /**
   * Helper for probing a video file and creating a VideoFile object
   * @param {import('../objects/files/LibraryFile')} libraryFile
   * @returns {Promise<VideoFile|null>}
   */
  async probeVideoFile(libraryFile) {
    const res = await this.scanVideoLibraryFile(libraryFile)
    return res ? res.videoFile : null
  }

  /**
   * Handle modified video files during existing podcast rescan
   */
  async handleModifiedVideoFiles(existingLibraryItem, libraryItemData, existingPodcastEpisodes, AudioFileScanner, libraryScan) {
    let hasChanges = false
    const videoLibraryFilesModified = libraryItemData.videoLibraryFilesModified || (libraryItemData.libraryFilesModified || []).filter((lf) => globals.SupportedVideoTypes.includes((lf.old?.metadata?.ext || lf.new?.metadata?.ext)?.slice(1).toLowerCase() || ''))
    if (!videoLibraryFilesModified.length) return hasChanges

    for (const podcastEpisode of existingPodcastEpisodes) {
      const currentMediaFile = podcastEpisode.videoFile || podcastEpisode.audioFile
      if (!currentMediaFile) continue
      const modifiedMatch = videoLibraryFilesModified.find((lf) =>
        (lf.old && (lf.old.metadata?.path === currentMediaFile.metadata?.path || lf.old.ino === currentMediaFile.ino)) ||
        (lf.new && (lf.new.metadata?.path === currentMediaFile.metadata?.path || lf.new.ino === currentMediaFile.ino))
      )
      if (modifiedMatch) {
        const res = await this.scanVideoLibraryFile(modifiedMatch.new)
        if (res) {
          podcastEpisode.videoFile = res.videoFile.toJSON()
          podcastEpisode.episodeMediaType = 'video'
          podcastEpisode.changed('videoFile', true)
          podcastEpisode.changed('episodeMediaType', true)
          if (podcastEpisode.audioFile) {
            podcastEpisode.audioFile = null
            podcastEpisode.changed('audioFile', true)
          }
          AudioFileScanner.setPodcastEpisodeMetadataFromAudioMetaTags(podcastEpisode, libraryScan)

          if (res.infoJson) {
            if (res.infoJson.publishedAt && (!podcastEpisode.publishedAt || !podcastEpisode.pubDate)) {
              podcastEpisode.publishedAt = res.infoJson.publishedAt
              podcastEpisode.pubDate = res.infoJson.pubDate || podcastEpisode.pubDate
              podcastEpisode.changed('publishedAt', true)
              podcastEpisode.changed('pubDate', true)
            } else if (res.infoJson.pubDate && !podcastEpisode.pubDate) {
              podcastEpisode.pubDate = res.infoJson.pubDate
              podcastEpisode.changed('pubDate', true)
            }
            if (!podcastEpisode.description && res.infoJson.description) {
              podcastEpisode.description = res.infoJson.description
              podcastEpisode.changed('description', true)
            }
            if (!podcastEpisode.subtitle && res.infoJson.subtitle) {
              podcastEpisode.subtitle = res.infoJson.subtitle
              podcastEpisode.changed('subtitle', true)
            }
            if (!podcastEpisode.season && res.infoJson.season) {
              podcastEpisode.season = res.infoJson.season
              podcastEpisode.changed('season', true)
            }
            if (!podcastEpisode.episode && res.infoJson.episode) {
              podcastEpisode.episode = res.infoJson.episode
              podcastEpisode.changed('episode', true)
            }
            if (!podcastEpisode.chapters?.length && res.infoJson.chapters?.length) {
              podcastEpisode.chapters = res.infoJson.chapters
              podcastEpisode.changed('chapters', true)
            }
            if (res.infoJson.extraData && !podcastEpisode.extraData?.guid) {
              podcastEpisode.extraData = { ...(podcastEpisode.extraData || {}), ...res.infoJson.extraData }
              podcastEpisode.changed('extraData', true)
            }
          }

          libraryScan.addLog(LogLevel.INFO, `Podcast video episode "${podcastEpisode.title}" keys changed [${podcastEpisode.changed()?.join(', ')}]`)
          await podcastEpisode.save()
          hasChanges = true

          if (res.videoFile.thumbnail) {
            const thumbFilename = Path.basename(res.videoFile.thumbnail)
            const thumbPath = Path.join(Path.dirname(modifiedMatch.new.metadata.path), thumbFilename)
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
        }
      }
    }
    return hasChanges
  }

  /**
   * Handle added video files during existing podcast rescan
   */
  async handleAddedVideoFiles(existingLibraryItem, libraryItemData, existingPodcastEpisodes, media, AudioFileScanner, libraryScan) {
    let hasChanges = false
    const videoLibraryFilesAdded = libraryItemData.videoLibraryFilesAdded || (libraryItemData.libraryFilesAdded || []).filter((lf) => globals.SupportedVideoTypes.includes(lf.metadata?.ext?.slice(1).toLowerCase() || ''))
    
    for (const videoLf of videoLibraryFilesAdded) {
      const res = await this.scanVideoLibraryFile(videoLf)
      if (!res) continue

      const videoFilenameNoExt = videoLf.metadata?.filenameNoExt || res.videoFile.metadata?.filenameNoExt || Path.parse(videoLf.metadata?.filename || '').name
      const infoJson = res.infoJson
      const videoTitle = infoJson?.title || res.probeData?.audioMetaTags?.tagTitle || videoFilenameNoExt || res.videoFile.metadata?.filename?.replace(/\.[^.]+$/, '')
      const extracted = extractEpisodeNumbers(videoTitle)
      const season = infoJson?.season || extracted.season || null
      const episode = infoJson?.episode || extracted.episode || null

      // Check if this video file is already linked to an existing episode or matches an existing audio episode
      const matchingEpisode = existingPodcastEpisodes.find((ep) => {
        if (ep.videoFile && (ep.videoFile.ino === videoLf.ino || (ep.videoFile.metadata?.path && videoLf.metadata?.path && filePathToPOSIX(ep.videoFile.metadata.path) === filePathToPOSIX(videoLf.metadata.path)))) {
          return true
        }
        if (ep.audioFile && (ep.audioFile.ino === videoLf.ino || (ep.audioFile.metadata?.path && videoLf.metadata?.path && filePathToPOSIX(ep.audioFile.metadata.path) === filePathToPOSIX(videoLf.metadata.path)))) {
          return true
        }
        if (ep.videoFile) {
          const epVideoFilenameNoExt = ep.videoFile.metadata?.filenameNoExt || Path.parse(ep.videoFile.metadata?.filename || '').name
          if (videoFilenameNoExt && epVideoFilenameNoExt && videoFilenameNoExt.toLowerCase() === epVideoFilenameNoExt.toLowerCase()) {
            return true
          }
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
        matchingEpisode.changed('videoFile', true)
        matchingEpisode.changed('episodeMediaType', true)
        if (matchingEpisode.audioFile) {
          matchingEpisode.audioFile = null
          matchingEpisode.changed('audioFile', true)
        }
        if (!matchingEpisode.chapters?.length) {
          if (res.probeData.chapters?.length) {
            matchingEpisode.chapters = res.probeData.chapters
            matchingEpisode.changed('chapters', true)
          } else if (infoJson?.chapters?.length) {
            matchingEpisode.chapters = infoJson.chapters
            matchingEpisode.changed('chapters', true)
          }
        }
        if (infoJson?.publishedAt && (!matchingEpisode.publishedAt || !matchingEpisode.pubDate)) {
          matchingEpisode.publishedAt = infoJson.publishedAt
          matchingEpisode.pubDate = infoJson.pubDate || matchingEpisode.pubDate
          matchingEpisode.changed('publishedAt', true)
          matchingEpisode.changed('pubDate', true)
        } else if (infoJson?.pubDate && !matchingEpisode.pubDate) {
          matchingEpisode.pubDate = infoJson.pubDate
          matchingEpisode.changed('pubDate', true)
        }
        if (!matchingEpisode.description && infoJson?.description) {
          matchingEpisode.description = infoJson.description
          matchingEpisode.changed('description', true)
        }
        if (!matchingEpisode.subtitle && infoJson?.subtitle) {
          matchingEpisode.subtitle = infoJson.subtitle
          matchingEpisode.changed('subtitle', true)
        }
        if (!matchingEpisode.season && season) {
          matchingEpisode.season = season
          matchingEpisode.changed('season', true)
        }
        if (!matchingEpisode.episode && episode) {
          matchingEpisode.episode = episode
          matchingEpisode.changed('episode', true)
        }
        if (infoJson?.extraData && !matchingEpisode.extraData?.guid) {
          matchingEpisode.extraData = { ...(matchingEpisode.extraData || {}), ...infoJson.extraData }
          matchingEpisode.changed('extraData', true)
        }
        AudioFileScanner.setPodcastEpisodeMetadataFromAudioMetaTags(matchingEpisode, libraryScan)
        libraryScan.addLog(LogLevel.INFO, `Updated existing podcast episode "${matchingEpisode.title}" with video file`)
        await matchingEpisode.save()
        hasChanges = true
      } else {
        let episodePubDate = infoJson?.pubDate || res.videoFile?.metaTags?.tagDate || null
        let episodePublishedAt = infoJson?.publishedAt || null
        if (!episodePublishedAt && episodePubDate) {
          const parsed = parseDateToTimestampAndString(episodePubDate)
          if (parsed.publishedAt) episodePublishedAt = parsed.publishedAt
        } else if (episodePublishedAt && !episodePubDate) {
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
          chapters: res.probeData.chapters?.length ? res.probeData.chapters : (infoJson?.chapters || []),
          podcastId: media.id,
          extraData: infoJson?.extraData || {}
        }
        const newPodcastEpisode = Database.podcastEpisodeModel.build(newEpisode)
        AudioFileScanner.setPodcastEpisodeMetadataFromAudioMetaTags(newPodcastEpisode, libraryScan)
        libraryScan.addLog(LogLevel.INFO, `New Podcast video episode "${newPodcastEpisode.title}" added`)
        await newPodcastEpisode.save()
        existingPodcastEpisodes.push(newPodcastEpisode)
        hasChanges = true
      }

      if (res.videoFile.thumbnail) {
        const thumbFilename = Path.basename(res.videoFile.thumbnail)
        const thumbPath = Path.join(Path.dirname(videoLf.metadata.path), thumbFilename)
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
    }
    return hasChanges
  }

  /**
   * Process scanned video files for a new podcast library item
   */
  processScannedVideoFilesForNewItem(libraryItemData, scannedVideoFiles, newPodcastEpisodes, AudioFileScanner, libraryScan) {
    for (const { videoFile, probeData, infoJson } of scannedVideoFiles) {
      const videoFilenameNoExt = videoFile.metadata?.filenameNoExt || Path.parse(videoFile.metadata?.filename || '').name
      const videoTitle = infoJson?.title || probeData.audioMetaTags?.tagTitle || videoFilenameNoExt || videoFile.metadata.filename.replace(/\.[^.]+$/, '')
      const extracted = extractEpisodeNumbers(videoTitle)
      const season = infoJson?.season || extracted.season || null
      const episode = infoJson?.episode || extracted.episode || null

      const existingMatchingEp = newPodcastEpisodes.find((ep) => {
        if (ep.videoFile) {
          const epVideoFilenameNoExt = ep.videoFile.metadata?.filenameNoExt || Path.parse(ep.videoFile.metadata?.filename || '').name
          if (videoFilenameNoExt && epVideoFilenameNoExt && videoFilenameNoExt.toLowerCase() === epVideoFilenameNoExt.toLowerCase()) {
            return true
          }
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

      if (existingMatchingEp) {
        existingMatchingEp.videoFile = videoFile.toJSON()
        existingMatchingEp.audioFile = null
        existingMatchingEp.episodeMediaType = 'video'
        if (videoFile.thumbnail) {
          existingMatchingEp.thumbnail = videoFile.thumbnail
        }
        if (!existingMatchingEp.chapters?.length) {
          if (probeData.chapters?.length) {
            existingMatchingEp.chapters = probeData.chapters
          } else if (infoJson?.chapters?.length) {
            existingMatchingEp.chapters = infoJson.chapters
          }
        }
        if (infoJson?.publishedAt && (!existingMatchingEp.publishedAt || !existingMatchingEp.pubDate)) {
          existingMatchingEp.publishedAt = infoJson.publishedAt
          existingMatchingEp.pubDate = infoJson.pubDate || existingMatchingEp.pubDate
        } else if (infoJson?.pubDate && !existingMatchingEp.pubDate) {
          existingMatchingEp.pubDate = infoJson.pubDate
        }
        if (!existingMatchingEp.description && infoJson?.description) {
          existingMatchingEp.description = infoJson.description
        }
        if (!existingMatchingEp.subtitle && infoJson?.subtitle) {
          existingMatchingEp.subtitle = infoJson.subtitle
        }
        if (!existingMatchingEp.season && season) {
          existingMatchingEp.season = season
        }
        if (!existingMatchingEp.episode && episode) {
          existingMatchingEp.episode = episode
        }
        if (infoJson?.extraData && !existingMatchingEp.extraData?.guid) {
          existingMatchingEp.extraData = { ...(existingMatchingEp.extraData || {}), ...infoJson.extraData }
        }
        AudioFileScanner.setPodcastEpisodeMetadataFromAudioMetaTags(existingMatchingEp, libraryScan)
        libraryScan.addLog(LogLevel.INFO, `Linked video file to existing podcast episode "${existingMatchingEp.title}"`)
      } else {
        let episodePubDate = infoJson?.pubDate || videoFile.metaTags?.tagDate || null
        let episodePublishedAt = infoJson?.publishedAt || null
        if (!episodePublishedAt && episodePubDate) {
          const parsed = parseDateToTimestampAndString(episodePubDate)
          if (parsed.publishedAt) episodePublishedAt = parsed.publishedAt
        } else if (episodePublishedAt && !episodePubDate) {
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
          videoFile: videoFile.toJSON(),
          episodeMediaType: 'video',
          thumbnail: videoFile.thumbnail || null,
          chapters: probeData.chapters?.length ? probeData.chapters : (infoJson?.chapters || []),
          extraData: infoJson?.extraData || {}
        }

        AudioFileScanner.setPodcastEpisodeMetadataFromAudioMetaTags(newEpisode, libraryScan)
        libraryScan.addLog(LogLevel.INFO, `New Podcast video episode "${newEpisode.title}" found`)
        newPodcastEpisodes.push(newEpisode)
      }

      if (videoFile.thumbnail && videoFile.metadata?.path) {
        const thumbFilename = Path.basename(videoFile.thumbnail)
        const thumbPath = Path.join(Path.dirname(videoFile.metadata.path), thumbFilename)
        const thumbExistsSync = fsExtra.pathExistsSync(thumbPath)
        if (thumbExistsSync) {
          const existingLf = libraryItemData.libraryFiles?.find((lf) => lf.metadata?.path === filePathToPOSIX(thumbPath))
          if (!existingLf) {
            const thumbLf = new LibraryFile()
            thumbLf.setDataFromPathSync(thumbPath, videoFile.thumbnail)
            if (!Array.isArray(libraryItemData.libraryFiles)) {
              libraryItemData.libraryFiles = []
            }
            libraryItemData.libraryFiles.push(thumbLf)
          }
        }
      }
    }
  }
}

module.exports = VideoScanner
