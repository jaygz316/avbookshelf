const AudioMetaTags = require('../objects/metadata/AudioMetaTags')

class MediaProbeData {
  constructor(probeData) {
    this.embeddedCoverArt = null
    this.format = null
    this.duration = null
    this.size = null

    this.audioStream = null
    this.videoStream = null

    this.bitRate = null
    this.codec = null
    this.timeBase = null
    this.language = null
    this.channelLayout = null
    this.channels = null
    this.sampleRate = null
    this.chapters = []

    this.audioMetaTags = null

    this.trackNumber = null
    this.trackTotal = null

    this.discNumber = null
    this.discTotal = null

    if (probeData) {
      this.construct(probeData)
    }
  }

  construct(probeData) {
    for (const key in probeData) {
      if (key === 'audioMetaTags' && probeData[key]) {
        this[key] = new AudioMetaTags(probeData[key])
      } else if (this[key] !== undefined) {
        this[key] = probeData[key]
      }
    }
  }

  setData(data) {
    const videoStream = data.video_stream
    if (videoStream) {
      const isCoverArt = videoStream.codec === 'mjpeg' || videoStream.codec === 'png' || (data.audio_stream && !videoStream.frame_rate)
      this.embeddedCoverArt = isCoverArt ? videoStream.codec : null
      this.videoStream = isCoverArt ? null : videoStream
    } else {
      this.embeddedCoverArt = null
      this.videoStream = null
    }

    this.format = data.format
    this.duration = data.duration
    this.size = data.size

    this.audioStream = data.audio_stream

    this.bitRate = this.audioStream?.bit_rate || this.videoStream?.bit_rate || data.bit_rate || null
    this.codec = this.audioStream?.codec || this.videoStream?.codec || null
    this.timeBase = this.audioStream?.time_base || this.videoStream?.time_base || null
    this.language = this.audioStream?.language || this.videoStream?.language || null
    this.channelLayout = this.audioStream?.channel_layout || null
    this.channels = this.audioStream?.channels || null
    this.sampleRate = this.audioStream?.sample_rate || null
    this.chapters = data.chapters || []

    this.audioMetaTags = new AudioMetaTags()
    this.audioMetaTags.setData(data.tags)
  }
}
module.exports = MediaProbeData
