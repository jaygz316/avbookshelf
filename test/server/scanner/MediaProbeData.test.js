const { expect } = require('chai')
const MediaProbeData = require('../../../server/scanner/MediaProbeData')

describe('MediaProbeData', () => {
  it('should identify embedded cover art (mjpeg)', () => {
    const probeData = new MediaProbeData()
    probeData.setData({
      format: { format_long_name: 'MP3 (MPEG audio)' },
      duration: 300,
      size: 5000000,
      bit_rate: 128000,
      audio_stream: { codec: 'mp3', channels: 2, sample_rate: 44100, bit_rate: 128000 },
      video_stream: { codec: 'mjpeg', width: 600, height: 600 },
      tags: { title: 'Test Audio' }
    })

    expect(probeData.embeddedCoverArt).to.equal('mjpeg')
    expect(probeData.videoStream).to.be.null
    expect(probeData.audioStream).to.not.be.null
  })

  it('should identify embedded cover art (small square with audio)', () => {
    const probeData = new MediaProbeData()
    probeData.setData({
      format: { format_long_name: 'MP3' },
      duration: 300,
      size: 5000000,
      bit_rate: 128000,
      audio_stream: { codec: 'mp3', channels: 2, sample_rate: 44100, bit_rate: 128000 },
      video_stream: { codec: 'png', width: 500, height: 500 },
      tags: {}
    })

    expect(probeData.embeddedCoverArt).to.equal('png')
    expect(probeData.videoStream).to.be.null
  })

  it('should identify actual video stream (e.g. h264)', () => {
    const probeData = new MediaProbeData()
    probeData.setData({
      format: { format_long_name: 'QuickTime / MOV' },
      duration: 3600,
      size: 1500000000,
      bit_rate: 3500000,
      audio_stream: { codec: 'aac', channels: 2, sample_rate: 48000, bit_rate: 128000 },
      video_stream: { codec: 'h264', width: 1920, height: 1080, bit_rate: 3300000, frame_rate: 30 },
      tags: { title: 'Test Video Episode' }
    })

    expect(probeData.embeddedCoverArt).to.be.null
    expect(probeData.videoStream).to.not.be.null
    expect(probeData.videoStream.codec).to.equal('h264')
    expect(probeData.videoStream.width).to.equal(1920)
    expect(probeData.videoStream.height).to.equal(1080)
  })
})
