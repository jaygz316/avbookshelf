const { expect } = require('chai')
const VideoFile = require('../../../server/objects/files/VideoFile')
const LibraryFile = require('../../../server/objects/files/LibraryFile')
const MediaProbeData = require('../../../server/scanner/MediaProbeData')

describe('VideoFile', () => {
  it('should initialize with default null properties', () => {
    const vf = new VideoFile()
    expect(vf.index).to.be.null
    expect(vf.ino).to.be.null
    expect(vf.metadata).to.be.null
    expect(vf.duration).to.be.null
    expect(vf.codec).to.be.null
    expect(vf.width).to.be.null
    expect(vf.height).to.be.null
    expect(vf.bitRate).to.be.null
    expect(vf.frameRate).to.be.null
    expect(vf.audioCodec).to.be.null
    expect(vf.audioChannels).to.be.null
    expect(vf.audioSampleRate).to.be.null
    expect(vf.audioBitRate).to.be.null
    expect(vf.thumbnail).to.be.null
  })

  it('should construct from data object', () => {
    const data = {
      index: 1,
      ino: '12345',
      metadata: {
        filename: 'episode.mp4',
        ext: '.mp4',
        path: '/podcasts/Show/episode.mp4',
        relPath: 'episode.mp4',
        size: 524288000
      },
      addedAt: 1693000000000,
      updatedAt: 1693000000000,
      duration: 3600.5,
      mimeType: 'video/mp4',
      codec: 'h264',
      width: 1920,
      height: 1080,
      bitRate: 5000000,
      frameRate: 30,
      audioCodec: 'aac',
      audioChannels: 2,
      audioSampleRate: 44100,
      audioBitRate: 128000,
      thumbnail: 'episode-thumb.jpg'
    }

    const vf = new VideoFile(data)
    expect(vf.index).to.equal(1)
    expect(vf.ino).to.equal('12345')
    expect(vf.duration).to.equal(3600.5)
    expect(vf.mimeType).to.equal('video/mp4')
    expect(vf.codec).to.equal('h264')
    expect(vf.width).to.equal(1920)
    expect(vf.height).to.equal(1080)
    expect(vf.bitRate).to.equal(5000000)
    expect(vf.frameRate).to.equal(30)
    expect(vf.audioCodec).to.equal('aac')
    expect(vf.audioChannels).to.equal(2)
    expect(vf.audioSampleRate).to.equal(44100)
    expect(vf.audioBitRate).to.equal(128000)
    expect(vf.thumbnail).to.equal('episode-thumb.jpg')
    expect(vf.metadata.filename).to.equal('episode.mp4')
  })

  it('should get correct mime types from extensions', () => {
    const vf = new VideoFile()
    expect(vf.getMimeTypeFromExtension('.mp4')).to.equal('video/mp4')
    expect(vf.getMimeTypeFromExtension('mp4')).to.equal('video/mp4')
    expect(vf.getMimeTypeFromExtension('.mkv')).to.equal('video/x-matroska')
    expect(vf.getMimeTypeFromExtension('.webm')).to.equal('video/webm')
    expect(vf.getMimeTypeFromExtension('.mov')).to.equal('video/quicktime')
    expect(vf.getMimeTypeFromExtension('.avi')).to.equal('video/x-msvideo')
    expect(vf.getMimeTypeFromExtension('.unknown')).to.equal('video/mp4')
  })

  it('should set data from probe', () => {
    const libraryFile = new LibraryFile({
      ino: 'ino-999',
      metadata: {
        filename: 'video.mkv',
        ext: '.mkv',
        path: '/media/video.mkv',
        relPath: 'video.mkv',
        size: 1000000
      }
    })

    const probeData = new MediaProbeData()
    probeData.duration = 1800
    probeData.bitRate = 2500000
    probeData.thumbnail = 'video-thumb.jpg'
    probeData.videoStream = {
      codec: 'hevc',
      width: 3840,
      height: 2160,
      bit_rate: 2400000,
      frame_rate: 60
    }
    probeData.audioStream = {
      codec: 'opus',
      channels: 6,
      sample_rate: 48000,
      bit_rate: 192000
    }

    const vf = new VideoFile()
    vf.setDataFromProbe(libraryFile, probeData)

    expect(vf.ino).to.equal('ino-999')
    expect(vf.duration).to.equal(1800)
    expect(vf.mimeType).to.equal('video/x-matroska')
    expect(vf.codec).to.equal('hevc')
    expect(vf.width).to.equal(3840)
    expect(vf.height).to.equal(2160)
    expect(vf.bitRate).to.equal(2400000)
    expect(vf.frameRate).to.equal(60)
    expect(vf.audioCodec).to.equal('opus')
    expect(vf.audioChannels).to.equal(6)
    expect(vf.audioSampleRate).to.equal(48000)
    expect(vf.audioBitRate).to.equal(192000)
    expect(vf.thumbnail).to.equal('video-thumb.jpg')
  })

  it('should correctly serialize to JSON and clone', () => {
    const vf = new VideoFile({
      index: 1,
      ino: 'ino-1',
      metadata: { filename: 'test.mp4', ext: '.mp4' },
      duration: 120,
      codec: 'h264',
      thumbnail: 'test-thumb.jpg'
    })

    const json = vf.toJSON()
    expect(json.ino).to.equal('ino-1')
    expect(json.duration).to.equal(120)
    expect(json.codec).to.equal('h264')
    expect(json.mimeType).to.equal('video/mp4')
    expect(json.thumbnail).to.equal('test-thumb.jpg')

    const cloned = vf.clone()
    expect(cloned).to.be.instanceOf(VideoFile)
    expect(cloned.ino).to.equal('ino-1')
    expect(cloned.thumbnail).to.equal('test-thumb.jpg')
    expect(cloned.toJSON()).to.deep.equal(json)
  })
})
