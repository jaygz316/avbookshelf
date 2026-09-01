const { existsSync } = require('fs')
const Logger = require('../Logger')

class VideoStreamHandler {
  constructor() {}

  /**
   * Detect available hardware encoder
   * @returns {'h264_vaapi'|'libx264'}
   */
  getVideoEncoder() {
    if (existsSync('/dev/dri/renderD128')) {
      Logger.info('[VideoStreamHandler] VA-API device detected at /dev/dri/renderD128')
      return 'h264_vaapi'
    }
    return 'libx264'
  }

  /**
   * Configure FFmpeg command and codec options for video streaming/transcoding
   * @param {import('../libs/fluentFfmpeg')} ffmpeg
   * @param {Object} transcodeOptions
   * @param {Array} tracks
   * @param {Array<string>} codecOptions
   * @param {string|null} [encoder=null]
   */
  applyVideoTranscodeOptions(ffmpeg, transcodeOptions = {}, tracks = [], codecOptions = [], encoder = null) {
    codecOptions.push('-map 0:v:0', '-map 0:a:0?')

    const opts = transcodeOptions || {}
    const trackList = Array.isArray(tracks) ? tracks : []
    const videoTrack = trackList[0]
    const isH264 = videoTrack?.codec === 'h264'
    const forceVideoReEncode = !!opts.forceVideoReEncode || !!opts.forceVideoTranscode || !!opts.maxResolution

    if (isH264 && !forceVideoReEncode) {
      codecOptions.push('-c:v copy')
    } else {
      const activeEncoder = encoder || this.getVideoEncoder()
      if (activeEncoder === 'h264_vaapi') {
        ffmpeg.inputOption('-hwaccel vaapi')
        ffmpeg.inputOption('-hwaccel_device /dev/dri/renderD128')
        ffmpeg.inputOption('-hwaccel_output_format vaapi')
        codecOptions.push('-c:v h264_vaapi', '-qp 23')
      } else {
        codecOptions.push('-c:v libx264', '-preset veryfast', '-crf 23', '-pix_fmt yuv420p', '-threads 4')
      }
      if (opts.maxResolution) {
        const allowedResolutions = [360, 480, 720, 1080, 1440, 2160]
        const res = parseInt(String(opts.maxResolution).replace(/p$/i, ''), 10)
        if (!isNaN(res) && allowedResolutions.includes(res)) {
          if (activeEncoder === 'h264_vaapi') {
            codecOptions.push('-vf', `scale_vaapi=w=-2:h=${res}`)
          } else {
            codecOptions.push('-vf', `scale=-2:${res}`)
          }
        } else {
          Logger.warn(`[VideoStreamHandler] Invalid maxResolution "${opts.maxResolution}" - ignoring`)
        }
      }
    }

    // Always encode audio to clean AAC with 2 channels for HLS segments to prevent packet corruption and desync
    Logger.debug('[VideoStreamHandler] Encoding audio track to AAC (192k stereo)')
    codecOptions.push('-c:a aac', '-b:a 192k', '-ac 2')
  }

  /**
   * Build a video track object for client player
   * @param {string} libraryItemId
   * @param {Object} episode
   * @param {Object} videoFile
   * @returns {Object}
   */
  getVideoTrack(libraryItemId, episode = {}, videoFile = null) {
    const ep = episode || {}
    const vf = videoFile || ep.videoFile
    if (!vf) return null

    const metadata = vf.metadata || {}
    const contentUrl = `/local/${libraryItemId}/${metadata.filename || metadata.path || ''}`

    return {
      index: vf.index || 1,
      startOffset: 0,
      duration: vf.duration || 0,
      title: ep.title || metadata.filename || 'Video',
      contentUrl,
      mimeType: vf.mimeType || 'video/mp4',
      codec: vf.codec || null,
      width: vf.width || null,
      height: vf.height || null,
      bitRate: vf.bitRate || null,
      frameRate: vf.frameRate || null,
      audioCodec: vf.audioCodec || null,
      audioChannels: vf.audioChannels || null,
      audioSampleRate: vf.audioSampleRate || null,
      audioBitRate: vf.audioBitRate || null,
      thumbnail: vf.thumbnail ? `/local/${libraryItemId}/${vf.thumbnail}` : (ep.thumbnail || null),
      isVideo: true
    }
  }
}

module.exports = VideoStreamHandler
