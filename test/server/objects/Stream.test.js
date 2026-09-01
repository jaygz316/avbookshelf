const { expect } = require('chai')
const sinon = require('sinon')
const EventEmitter = require('events')
const Stream = require('../../../server/objects/Stream')
const ffmpegHelpers = require('../../../server/utils/ffmpegHelpers')
const fs = require('../../../server/libs/fsExtra')

describe('Stream', () => {
  let mockUser
  let mockAudioLibraryItem
  let mockVideoLibraryItem
  let mockVideoEpisode
  let mockAudioEpisode

  beforeEach(() => {
    mockUser = { id: 'user-1', token: 'token-abc' }

    mockAudioEpisode = {
      id: 'ep-audio-1',
      title: 'Audio Episode',
      isVideo: false,
      duration: 1800,
      toOldJSONExpanded: sinon.stub().returns({ id: 'ep-audio-1', title: 'Audio Episode' })
    }

    mockVideoEpisode = {
      id: 'ep-video-1',
      title: 'Video Episode',
      isVideo: true,
      duration: 3600,
      toOldJSONExpanded: sinon.stub().returns({ id: 'ep-video-1', title: 'Video Episode' })
    }

    mockAudioLibraryItem = {
      id: 'lib-audio-1',
      isPodcast: true,
      media: {
        podcastEpisodes: [mockAudioEpisode],
        getPlaybackTitle: sinon.stub().returns('Audio Episode'),
        getPlaybackDuration: sinon.stub().returns(1800)
      },
      getTrackList: sinon.stub().returns([
        {
          index: 1,
          duration: 1800,
          mimeType: 'audio/mpeg',
          codec: 'mp3',
          metadata: { ext: '.mp3', path: '/podcasts/test.mp3' }
        }
      ]),
      toOldJSONExpanded: sinon.stub().returns({ id: 'lib-audio-1' })
    }

    mockVideoLibraryItem = {
      id: 'lib-video-1',
      isPodcast: true,
      media: {
        podcastEpisodes: [mockVideoEpisode],
        getPlaybackTitle: sinon.stub().returns('Video Episode'),
        getPlaybackDuration: sinon.stub().returns(3600)
      },
      getTrackList: sinon.stub().returns([
        {
          index: 1,
          duration: 3600,
          mimeType: 'video/mp4',
          codec: 'h264',
          width: 1920,
          height: 1080,
          metadata: { ext: '.mp4', path: '/podcasts/test.mp4' }
        }
      ]),
      toOldJSONExpanded: sinon.stub().returns({ id: 'lib-video-1' })
    }

    sinon.stub(fs, 'writeFile').resolves()
    sinon.stub(fs, 'ensureDir').resolves()
  })

  afterEach(() => {
    sinon.restore()
  })

  describe('isVideo getter', () => {
    it('should return true when episode.isVideo is true', () => {
      const stream = new Stream('session-1', '/tmp/streams', mockUser, mockVideoLibraryItem, 'ep-video-1', 0)
      expect(stream.isVideo).to.be.true
    })

    it('should return true when track has width even if episode is not set', () => {
      const nonPodcastItem = {
        id: 'book-1',
        isPodcast: false,
        media: {
          getPlaybackTitle: sinon.stub().returns('Video File'),
          getPlaybackDuration: sinon.stub().returns(3600)
        },
        getTrackList: sinon.stub().returns([{ width: 1280, height: 720, codec: 'h264', metadata: { ext: '.mp4' } }]),
        toOldJSONExpanded: sinon.stub().returns({ id: 'book-1' })
      }
      const stream = new Stream('session-2', '/tmp/streams', mockUser, nonPodcastItem, null, 0)
      expect(stream.isVideo).to.be.true
    })

    it('should return false for audio-only episode', () => {
      const stream = new Stream('session-3', '/tmp/streams', mockUser, mockAudioLibraryItem, 'ep-audio-1', 0)
      expect(stream.isVideo).to.be.false
    })
  })

  describe('toJSON', () => {
    it('should include isVideo in serialized JSON for video stream', () => {
      const stream = new Stream('session-1', '/tmp/streams', mockUser, mockVideoLibraryItem, 'ep-video-1', 0)
      const json = stream.toJSON()

      expect(json).to.have.property('isVideo', true)
      expect(json).to.have.property('id', 'session-1')
      expect(json).to.have.property('userId', 'user-1')
      expect(json).to.have.property('clientPlaylistUri', '/hls/session-1/output.m3u8')
    })

    it('should include isVideo: false for audio stream', () => {
      const stream = new Stream('session-3', '/tmp/streams', mockUser, mockAudioLibraryItem, 'ep-audio-1', 0)
      const json = stream.toJSON()

      expect(json).to.have.property('isVideo', false)
    })
  })

  describe('getVideoTrack and getAudioTrack', () => {
    it('should return AudioTrack with stream playlist URI for getAudioTrack and getVideoTrack', () => {
      const stream = new Stream('session-1', '/tmp/streams', mockUser, mockVideoLibraryItem, 'ep-video-1', 0)
      const audioTrack = stream.getAudioTrack()
      const videoTrack = stream.getVideoTrack()

      expect(audioTrack.contentUrl).to.equal('/hls/session-1/output.m3u8')
      expect(audioTrack.mimeType).to.equal('application/vnd.apple.mpegurl')
      expect(videoTrack.contentUrl).to.equal('/hls/session-1/output.m3u8')
      expect(videoTrack.mimeType).to.equal('application/vnd.apple.mpegurl')
    })
  })

  describe('start transcoding options', () => {
    let addedOptions
    const FfmpegCommand = require('../../../server/libs/fluentFfmpeg')

    beforeEach(() => {
      addedOptions = []
      // Stub hardware encoder detection to return software encoder for deterministic tests
      sinon.stub(Stream, 'getVideoEncoder').returns('libx264')
      sinon.stub(FfmpegCommand.prototype, 'addInput').callsFake(function () {
        return this
      })
      sinon.stub(FfmpegCommand.prototype, 'inputOption').callsFake(function () {
        return this
      })
      sinon.stub(FfmpegCommand.prototype, 'inputFormat').callsFake(function () {
        return this
      })
      sinon.stub(FfmpegCommand.prototype, 'addOption').callsFake(function (opts) {
        if (Array.isArray(opts)) {
          addedOptions = addedOptions.concat(opts)
        } else {
          addedOptions.push(opts)
        }
        return this
      })
      sinon.stub(FfmpegCommand.prototype, 'output').callsFake(function () {
        return this
      })
      sinon.stub(FfmpegCommand.prototype, 'run').callsFake(function () {
        return this
      })
      sinon.stub(FfmpegCommand.prototype, 'kill')

      sinon.stub(ffmpegHelpers, 'writeConcatFile').resolves(0)
    })

    it('should use -c:v copy for h264 video when no maxResolution is set', async () => {
      const stream = new Stream('session-1', '/tmp/streams', mockUser, mockVideoLibraryItem, 'ep-video-1', 0)
      sinon.stub(stream, 'startLoop')
      await stream.start()

      expect(addedOptions).to.include('-map 0:v:0')
      expect(addedOptions).to.include('-map 0:a:0?')
      expect(addedOptions).to.include('-c:v copy')
      expect(addedOptions).to.include('-c:a aac')
      expect(addedOptions).to.include('-b:a 192k')
    })

    it('should use libx264 re-encoding for non-h264 video', async () => {
      mockVideoLibraryItem.getTrackList = sinon.stub().returns([
        {
          index: 1,
          duration: 3600,
          mimeType: 'video/webm',
          codec: 'vp9',
          width: 1920,
          height: 1080,
          metadata: { ext: '.webm', path: '/podcasts/test.webm' }
        }
      ])

      const stream = new Stream('session-2', '/tmp/streams', mockUser, mockVideoLibraryItem, 'ep-video-1', 0)
      sinon.stub(stream, 'startLoop')
      await stream.start()

      expect(addedOptions).to.include('-map 0:v:0')
      expect(addedOptions).to.include('-c:v libx264')
      expect(addedOptions).to.include('-preset veryfast')
      expect(addedOptions).to.include('-crf 23')
      expect(addedOptions).to.include('-pix_fmt yuv420p')
      expect(addedOptions).to.include('-c:a aac')
      expect(addedOptions).to.include('-b:a 192k')
    })

    it('should scale video when maxResolution is set (e.g. 720p)', async () => {
      const stream = new Stream('session-3', '/tmp/streams', mockUser, mockVideoLibraryItem, 'ep-video-1', 0, { maxResolution: '720p' })
      sinon.stub(stream, 'startLoop')
      await stream.start()

      expect(addedOptions).to.include('-c:v libx264')
      expect(addedOptions).to.include('-vf')
      expect(addedOptions).to.include('scale=-2:720')
      expect(addedOptions).to.include('-c:a aac')
      expect(addedOptions).to.include('-b:a 192k')
    })

    it('should use audio-only options when isVideo is false', async () => {
      const stream = new Stream('session-4', '/tmp/streams', mockUser, mockAudioLibraryItem, 'ep-audio-1', 0)
      sinon.stub(stream, 'startLoop')
      await stream.start()

      expect(addedOptions).to.include('-map 0:a')
      expect(addedOptions).to.include('-c:a copy')
      expect(addedOptions).to.not.include('-map 0:v:0')
    })

    it('should reject invalid maxResolution values (injection attempt)', async () => {
      const stream = new Stream('session-5', '/tmp/streams', mockUser, mockVideoLibraryItem, 'ep-video-1', 0, { maxResolution: '1080,drawtext=text=INJECT' })
      sinon.stub(stream, 'startLoop')
      await stream.start()

      expect(addedOptions).to.not.include('scale=-2:1080,drawtext=text=INJECT')
      expect(addedOptions.some(o => o.includes('drawtext'))).to.be.false
    })

    it('should accept valid maxResolution values from allowlist', async () => {
      const stream = new Stream('session-6', '/tmp/streams', mockUser, mockVideoLibraryItem, 'ep-video-1', 0, { maxResolution: '1080p' })
      sinon.stub(stream, 'startLoop')
      await stream.start()

      expect(addedOptions).to.include('scale=-2:1080')
    })

    it('should copy audio when source audio codec is AAC (skip re-encode)', async () => {
      mockVideoLibraryItem.getTrackList = sinon.stub().returns([
        {
          index: 1, duration: 3600, mimeType: 'video/mp4',
          codec: 'h264', audioCodec: 'aac',
          width: 1920, height: 1080,
          metadata: { ext: '.mp4', path: '/podcasts/test.mp4' }
        }
      ])

      const stream = new Stream('session-7', '/tmp/streams', mockUser, mockVideoLibraryItem, 'ep-video-1', 0)
      sinon.stub(stream, 'startLoop')
      await stream.start()

      expect(addedOptions).to.include('-c:a copy')
      expect(addedOptions).to.not.include('-c:a aac')
    })

    it('should transcode audio to AAC when source is not AAC', async () => {
      mockVideoLibraryItem.getTrackList = sinon.stub().returns([
        {
          index: 1, duration: 3600, mimeType: 'video/webm',
          codec: 'vp9', audioCodec: 'opus',
          width: 1920, height: 1080,
          metadata: { ext: '.webm', path: '/podcasts/test.webm' }
        }
      ])

      const stream = new Stream('session-8', '/tmp/streams', mockUser, mockVideoLibraryItem, 'ep-video-1', 0)
      sinon.stub(stream, 'startLoop')
      await stream.start()

      expect(addedOptions).to.include('-c:a aac')
      expect(addedOptions).to.include('-b:a 192k')
    })
  })
})
