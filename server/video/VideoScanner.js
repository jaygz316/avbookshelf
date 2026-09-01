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

class VideoScanner {
  constructor() {}

  /**
   * Scan a video library file and return VideoFile and probe data
   * @param {import('../objects/files/LibraryFile')} libraryFile
   * @returns {Promise<{videoFile: VideoFile, probeData: Object}|null>}
   */
  async scanVideoLibraryFile(libraryFile) {
    const probeData = await prober.probe(libraryFile.metadata.path)
    if (probeData.error) {
      Logger.error(`[VideoScanner] ${probeData.error} : "${libraryFile.metadata.path}"`)
      return null
    }
    const videoFile = new VideoFile()
    videoFile.setDataFromProbe(libraryFile, probeData)
    videoFile.index = 1

    try {
      const filenameNoExt = libraryFile.metadata.filenameNoExt || Path.parse(libraryFile.metadata.path).name
      const videoDir = Path.dirname(libraryFile.metadata.path)
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
      Logger.error(`[VideoScanner] Failed to extract video thumbnail for "${libraryFile.metadata.path}"`, err)
    }

    return { videoFile, probeData }
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
    const videoLibraryFilesModified = libraryItemData.videoLibraryFilesModified || libraryItemData.libraryFilesModified.filter((lf) => globals.SupportedVideoTypes.includes(lf.old.metadata.ext?.slice(1).toLowerCase() || ''))
    if (!videoLibraryFilesModified.length) return hasChanges

    for (const podcastEpisode of existingPodcastEpisodes) {
      if (!podcastEpisode.videoFile) continue
      const modifiedMatch = videoLibraryFilesModified.find((lf) => lf.old.metadata.path === podcastEpisode.videoFile.metadata.path || lf.old.ino === podcastEpisode.videoFile.ino)
      if (modifiedMatch) {
        const res = await this.scanVideoLibraryFile(modifiedMatch.new)
        if (res) {
          podcastEpisode.videoFile = res.videoFile.toJSON()
          podcastEpisode.changed('videoFile', true)
          AudioFileScanner.setPodcastEpisodeMetadataFromAudioMetaTags(podcastEpisode, libraryScan)
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
    const videoLibraryFilesAdded = libraryItemData.videoLibraryFilesAdded || libraryItemData.libraryFilesAdded.filter((lf) => globals.SupportedVideoTypes.includes(lf.metadata.ext?.slice(1).toLowerCase() || ''))
    
    for (const videoLf of videoLibraryFilesAdded) {
      const res = await this.scanVideoLibraryFile(videoLf)
      if (!res) continue

      const videoFilenameNoExt = videoLf.metadata?.filenameNoExt || res.videoFile.metadata?.filenameNoExt || Path.parse(videoLf.metadata?.filename || '').name
      const videoTitle = res.probeData.audioMetaTags?.tagTitle || videoFilenameNoExt || res.videoFile.metadata.filename.replace(/\.[^.]+$/, '')

      // Check if this video file is already linked to an existing episode or matches an existing audio episode
      const matchingEpisode = existingPodcastEpisodes.find((ep) => {
        if (ep.videoFile && (ep.videoFile.ino === videoLf.ino || filePathToPOSIX(ep.videoFile.metadata?.path) === filePathToPOSIX(videoLf.metadata.path))) {
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
        if (!matchingEpisode.chapters?.length && res.probeData.chapters?.length) {
          matchingEpisode.chapters = res.probeData.chapters
          matchingEpisode.changed('chapters', true)
        }
        AudioFileScanner.setPodcastEpisodeMetadataFromAudioMetaTags(matchingEpisode, libraryScan)
        libraryScan.addLog(LogLevel.INFO, `Updated existing podcast episode "${matchingEpisode.title}" with video file`)
        await matchingEpisode.save()
        hasChanges = true
      } else {
        const newEpisode = {
          title: videoTitle,
          subtitle: null,
          season: null,
          episode: null,
          episodeType: null,
          pubDate: null,
          publishedAt: null,
          description: null,
          audioFile: null,
          videoFile: res.videoFile.toJSON(),
          episodeMediaType: 'video',
          chapters: res.probeData.chapters || [],
          podcastId: media.id
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
    for (const { videoFile, probeData } of scannedVideoFiles) {
      const videoFilenameNoExt = videoFile.metadata?.filenameNoExt || Path.parse(videoFile.metadata?.filename || '').name
      const videoTitle = probeData.audioMetaTags?.tagTitle || videoFilenameNoExt || videoFile.metadata.filename.replace(/\.[^.]+$/, '')

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
        existingMatchingEp.episodeMediaType = 'video'
        if (!existingMatchingEp.chapters?.length && probeData.chapters?.length) {
          existingMatchingEp.chapters = probeData.chapters
        }
        AudioFileScanner.setPodcastEpisodeMetadataFromAudioMetaTags(existingMatchingEp, libraryScan)
        libraryScan.addLog(LogLevel.INFO, `Linked video file to existing podcast episode "${existingMatchingEp.title}"`)
      } else {
        const newEpisode = {
          title: videoTitle,
          subtitle: null,
          season: null,
          episode: null,
          episodeType: null,
          pubDate: null,
          publishedAt: null,
          description: null,
          audioFile: null,
          videoFile: videoFile.toJSON(),
          episodeMediaType: 'video',
          chapters: probeData.chapters || []
        }

        AudioFileScanner.setPodcastEpisodeMetadataFromAudioMetaTags(newEpisode, libraryScan)
        libraryScan.addLog(LogLevel.INFO, `New Podcast video episode "${newEpisode.title}" found`)
        newPodcastEpisodes.push(newEpisode)
      }

      if (videoFile.thumbnail) {
        const thumbFilename = Path.basename(videoFile.thumbnail)
        const thumbPath = Path.join(Path.dirname(videoFile.metadata.path), thumbFilename)
        const thumbExistsSync = fsExtra.pathExistsSync(thumbPath)
        if (thumbExistsSync) {
          const existingLf = libraryItemData.libraryFiles?.find((lf) => lf.metadata?.path === filePathToPOSIX(thumbPath))
          if (!existingLf) {
            const thumbLf = new LibraryFile()
            thumbLf.setDataFromPathSync(thumbPath, videoFile.thumbnail)
            libraryItemData.libraryFiles.push(thumbLf)
          }
        }
      }
    }
  }
}

module.exports = VideoScanner
