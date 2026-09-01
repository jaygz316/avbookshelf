const { expect } = require('chai')
const YtDlpManager = require('../../../server/managers/YtDlpManager')
const which = require('../../../server/utils/which')

describe('which utility', () => {
  it('should find system node binary', async () => {
    const nodePath = await which('node')
    expect(nodePath).to.be.a('string')
    expect(nodePath).to.include('node')
  })

  it('should return null for non-existent binary', async () => {
    const result = await which('non_existent_binary_xyz_123')
    expect(result).to.be.null
  })
})

describe('YtDlpManager', () => {
  it('should initialize and report status', async () => {
    const manager = new YtDlpManager()
    await manager.init()
    expect(manager.isAvailable).to.be.a('boolean')
    if (manager.isAvailable) {
      expect(manager.ytDlpPath).to.be.a('string')
    } else {
      expect(manager.ytDlpPath).to.be.null
    }
  })

  describe('getFormatForQuality', () => {
    it('should return correct format strings for quality settings', () => {
      const manager = new YtDlpManager()
      expect(manager.getFormatForQuality('480p_compatible')).to.equal('bestvideo[height<=480][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=480][vcodec^=avc1]+bestaudio/bestvideo[height<=480]+bestaudio/best[height<=480]/best')
      expect(manager.getFormatForQuality('720p_compatible')).to.equal('bestvideo[height<=720][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=720][vcodec^=avc1]+bestaudio/bestvideo[height<=720]+bestaudio/best[height<=720]/best')
      expect(manager.getFormatForQuality('1080p_compatible')).to.equal('bestvideo[height<=1080][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080][vcodec^=avc1]+bestaudio/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best')
      expect(manager.getFormatForQuality('best_compatible')).to.equal('bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best')
      expect(manager.getFormatForQuality('best')).to.equal('bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best')
      expect(manager.getFormatForQuality('1080p')).to.equal('bestvideo[height<=1080][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080][vcodec^=avc1]+bestaudio/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best')
      expect(manager.getFormatForQuality('480p_source')).to.equal('bestvideo[height<=480]+bestaudio/best[height<=480]')
      expect(manager.getFormatForQuality('720p_source')).to.equal('bestvideo[height<=720]+bestaudio/best[height<=720]')
      expect(manager.getFormatForQuality('1080p_source')).to.equal('bestvideo[height<=1080]+bestaudio/best[height<=1080]')
      expect(manager.getFormatForQuality('best_source')).to.equal('bestvideo+bestaudio/best')
      expect(manager.getFormatForQuality('unknown')).to.equal('bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best')
      expect(manager.getFormatForQuality()).to.equal('bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best')
    })
  })

  describe('downloadVideo', () => {
    const sinon = require('sinon')
    const childProcess = require('child_process')

    afterEach(() => {
      sinon.restore()
    })

    it('should pass correct format string to yt-dlp args based on quality parameter', async () => {
      const { EventEmitter } = require('events')
      const manager = new YtDlpManager()
      manager.ytDlpPath = '/usr/bin/yt-dlp'
      manager.isAvailable = true

      let capturedArgs = []
      sinon.stub(childProcess, 'spawn').callsFake((path, args) => {
        capturedArgs.push(args)
        const proc = new EventEmitter()
        proc.stdout = new EventEmitter()
        proc.stderr = new EventEmitter()
        setImmediate(() => {
          proc.stdout.emit('data', Buffer.from('/path/to/downloaded.mp4\n'))
          proc.emit('close', 0)
        })
        return proc
      })

      const res720 = await manager.downloadVideo('https://youtube.com/watch?v=123', '/tmp/out', 'episode1', '720p_source')
      expect(res720.filepath).to.equal('/path/to/downloaded.mp4')
      const formatIdx720 = capturedArgs[0].indexOf('-f')
      expect(formatIdx720).to.be.greaterThan(-1)
      expect(capturedArgs[0][formatIdx720 + 1]).to.equal('bestvideo[height<=720]+bestaudio/best[height<=720]')

      const res1080 = await manager.downloadVideo('https://youtube.com/watch?v=456', '/tmp/out', 'episode2', '1080p_source')
      const formatIdx1080 = capturedArgs[1].indexOf('-f')
      expect(capturedArgs[1][formatIdx1080 + 1]).to.equal('bestvideo[height<=1080]+bestaudio/best[height<=1080]')

      const resBest = await manager.downloadVideo('https://youtube.com/watch?v=789', '/tmp/out', 'episode3', 'best_compatible')
      const formatIdxBest = capturedArgs[2].indexOf('-f')
      expect(capturedArgs[2][formatIdxBest + 1]).to.equal('bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best')
    })
  })

  describe('getChannelFeed', () => {
    const sinon = require('sinon')
    const childProcess = require('child_process')

    afterEach(() => {
      sinon.restore()
    })

    it('should parse entries and return metadata and episodes with enclosures', async () => {
      const manager = new YtDlpManager()
      manager.ytDlpPath = '/usr/bin/yt-dlp'
      manager.isAvailable = true

      const mockEntries = [
        JSON.stringify({
          id: 'vid1',
          title: 'Episode 1',
          channel: 'Test Channel',
          uploader: 'Test Channel',
          playlist_title: 'My Playlist',
          playlist_description: 'Playlist Description',
          description: 'Episode 1 Desc',
          upload_date: '20260101',
          duration: 3600,
          thumbnail: 'https://img.youtube.com/vi/vid1/default.jpg'
        }),
        JSON.stringify({
          id: 'vid2',
          title: 'Episode 2',
          channel: 'Test Channel',
          description: 'Episode 2 Desc',
          upload_date: '20260102',
          duration: 1800,
          thumbnail: 'https://img.youtube.com/vi/vid2/default.jpg'
        })
      ].join('\n')

      sinon.stub(childProcess, 'execFile').callsFake((path, args, opts, callback) => {
        callback(null, mockEntries, '')
      })

      const feed = await manager.getChannelFeed('https://www.youtube.com/playlist?list=PL123')
      expect(feed.metadata.title).to.equal('My Playlist')
      expect(feed.metadata.author).to.equal('Test Channel')
      expect(feed.metadata.feedType).to.equal('youtube')
      expect(feed.episodes).to.have.length(2)
      expect(feed.numEpisodes).to.equal(2)

      const ep1 = feed.episodes[0]
      expect(ep1.title).to.equal('Episode 1')
      expect(ep1.isVideo).to.be.true
      expect(ep1.isYtDlp).to.be.true
      expect(ep1.enclosure).to.deep.equal({
        url: 'https://www.youtube.com/watch?v=vid1',
        type: 'video/mp4'
      })
      expect(ep1.durationSeconds).to.equal(3600)
      expect(ep1.guid).to.equal('vid1')
    })

    it('should use yt-dlp season_number and episode_number when available', async () => {
      const manager = new YtDlpManager()
      manager.ytDlpPath = '/usr/bin/yt-dlp'
      manager.isAvailable = true

      const mockEntries = [
        JSON.stringify({
          id: 'vid1', title: 'Some Video Title',
          channel: 'Test Channel', upload_date: '20260101', duration: 3600,
          season_number: 2, episode_number: 5
        })
      ]

      sinon.stub(childProcess, 'execFile').callsFake((path, args, opts, callback) => {
        callback(null, mockEntries.join('\n'), '')
      })

      const feed = await manager.getChannelFeed('https://www.youtube.com/playlist?list=PL123')
      expect(feed.episodes[0].season).to.equal('2')
      expect(feed.episodes[0].episode).to.equal('5')
    })
  })
})
