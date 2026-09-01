const { VideoMimeType } = require('../utils/constants')
const FileMetadata = require('../objects/metadata/FileMetadata')

class VideoFile {
  constructor(data) {
    this.index = null
    this.ino = null
    /** @type {FileMetadata} */
    this.metadata = null
    this.addedAt = null
    this.updatedAt = null
    this.duration = null
    this.mimeType = null
    this.codec = null
    this.width = null
    this.height = null
    this.bitRate = null
    this.frameRate = null
    this.audioCodec = null
    this.audioChannels = null
    this.audioSampleRate = null
    this.audioBitRate = null
    this.chapters = []
    this.thumbnail = null
    this.error = null

    if (data) this.construct(data)
  }

  toJSON() {
    return {
      index: this.index,
      ino: this.ino,
      metadata: this.metadata?.toJSON ? this.metadata.toJSON() : this.metadata,
      addedAt: this.addedAt,
      updatedAt: this.updatedAt,
      duration: this.duration,
      mimeType: this.mimeType,
      codec: this.codec,
      width: this.width,
      height: this.height,
      bitRate: this.bitRate,
      frameRate: this.frameRate,
      audioCodec: this.audioCodec,
      audioChannels: this.audioChannels,
      audioSampleRate: this.audioSampleRate,
      audioBitRate: this.audioBitRate,
      chapters: this.chapters,
      thumbnail: this.thumbnail || null,
      error: this.error || null
    }
  }

  construct(data) {
    this.index = data.index
    this.ino = data.ino
    this.metadata = new FileMetadata(data.metadata || {})
    this.addedAt = data.addedAt
    this.updatedAt = data.updatedAt
    this.duration = data.duration
    this.mimeType = data.mimeType || this.getMimeTypeFromExtension(this.metadata?.ext)
    this.codec = data.codec || null
    this.width = data.width || null
    this.height = data.height || null
    this.bitRate = data.bitRate || null
    this.frameRate = data.frameRate || null
    this.audioCodec = data.audioCodec || null
    this.audioChannels = data.audioChannels || null
    this.audioSampleRate = data.audioSampleRate || null
    this.audioBitRate = data.audioBitRate || null
    this.chapters = data.chapters || []
    this.thumbnail = data.thumbnail || null
    this.error = data.error || null
  }

  getMimeTypeFromExtension(ext) {
    if (!ext) {
      return 'video/mp4'
    }
    const cleanExt = ext.replace(/^\./, '').toUpperCase()
    const mimeType = VideoMimeType[cleanExt]
    if (!mimeType) {
      const Logger = require('../Logger')
      Logger.debug(`[VideoFile] Unknown video extension "${ext}" - defaulting to video/mp4`)
    }
    return mimeType || 'video/mp4'
  }

  setDataFromProbe(libraryFile, probeData) {
    this.index = null
    this.ino = libraryFile.ino || null

    if (libraryFile.metadata instanceof FileMetadata) {
      this.metadata = libraryFile.metadata.clone()
    } else {
      this.metadata = new FileMetadata(libraryFile.metadata)
    }

    this.addedAt = Date.now()
    this.updatedAt = Date.now()
    this.duration = probeData.duration
    this.mimeType = this.getMimeTypeFromExtension(libraryFile.metadata.ext)

    // Video stream
    this.codec = probeData.videoStream?.codec || probeData.codec || null
    this.width = probeData.videoStream?.width || null
    this.height = probeData.videoStream?.height || null
    this.bitRate = probeData.videoStream?.bit_rate || probeData.bitRate || null
    this.frameRate = probeData.videoStream?.frame_rate || null

    // Audio stream (embedded in video)
    this.audioCodec = probeData.audioStream?.codec || null
    this.audioChannels = probeData.audioStream?.channels || null
    this.audioSampleRate = probeData.audioStream?.sample_rate || null
    this.audioBitRate = probeData.audioStream?.bit_rate || null
    this.chapters = probeData.chapters || []
    this.thumbnail = probeData.thumbnail || this.thumbnail || null
  }

  clone() {
    return new VideoFile(this.toJSON())
  }
}

module.exports = VideoFile
