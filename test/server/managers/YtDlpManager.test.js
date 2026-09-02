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
      global.ServerSettings = null
    })

    it('should pass correct format string, --embed-metadata, and --embed-chapters to yt-dlp args', async () => {
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
      expect(capturedArgs[0]).to.include('--embed-metadata')
      expect(capturedArgs[0]).to.include('--embed-chapters')
      expect(capturedArgs[0]).to.include('--write-info-json')

      const res1080 = await manager.downloadVideo('https://youtube.com/watch?v=456', '/tmp/out', 'episode2', '1080p_source')
      const formatIdx1080 = capturedArgs[1].indexOf('-f')
      expect(capturedArgs[1][formatIdx1080 + 1]).to.equal('bestvideo[height<=1080]+bestaudio/best[height<=1080]')

      const resBest = await manager.downloadVideo('https://youtube.com/watch?v=789', '/tmp/out', 'episode3', 'best_compatible')
      const formatIdxBest = capturedArgs[2].indexOf('-f')
      expect(capturedArgs[2][formatIdxBest + 1]).to.equal('bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best')
      expect(capturedArgs[2]).to.include('--progress-template')
    })

    it('should parse PROGRESS template and invoke onProgress with percentage, speed, and ETA', async () => {
      const { EventEmitter } = require('events')
      const manager = new YtDlpManager()
      manager.ytDlpPath = '/usr/bin/yt-dlp'
      manager.isAvailable = true

      const progressUpdates = []
      sinon.stub(childProcess, 'spawn').callsFake(() => {
        const proc = new EventEmitter()
        proc.stdout = new EventEmitter()
        proc.stderr = new EventEmitter()
        setImmediate(() => {
          proc.stdout.emit('data', Buffer.from('PROGRESS:  25.5%|  4.50MiB/s|00:30|  25.50MiB| 100.00MiB|       N/A\n'))
          proc.stdout.emit('data', Buffer.from('PROGRESS:  50.0%|  5.12MiB/s|00:15|  50.00MiB| 100.00MiB|       N/A\n'))
          proc.stdout.emit('data', Buffer.from('PROGRESS: 100.0%|  6.00MiB/s|00:00| 100.00MiB| 100.00MiB|       N/A\n/path/to/final.mp4\n'))
          proc.emit('close', 0)
        })
        return proc
      })

      const res = await manager.downloadVideo('https://youtube.com/watch?v=123', '/tmp/out', 'ep1', 'best_compatible', (info) => {
        progressUpdates.push(info)
      })

      expect(res.filepath).to.equal('/path/to/final.mp4')
      expect(progressUpdates).to.have.length(3)
      expect(progressUpdates[0]).to.deep.equal({ percent: 25.5, speed: '4.50MiB/s', eta: '00:30' })
      expect(progressUpdates[1]).to.deep.equal({ percent: 50.0, speed: '5.12MiB/s', eta: '00:15' })
      expect(progressUpdates[2]).to.deep.equal({ percent: 100.0, speed: '6.00MiB/s', eta: '00:00' })
    })

    it('should parse standard yt-dlp download lines and split chunk buffers correctly', async () => {
      const { EventEmitter } = require('events')
      const manager = new YtDlpManager()
      manager.ytDlpPath = '/usr/bin/yt-dlp'
      manager.isAvailable = true

      const progressUpdates = []
      sinon.stub(childProcess, 'spawn').callsFake(() => {
        const proc = new EventEmitter()
        proc.stdout = new EventEmitter()
        proc.stderr = new EventEmitter()
        setImmediate(() => {
          // Simulate chunk split across 'data' events
          proc.stdout.emit('data', Buffer.from('[download]  33.3% of 90.00MiB at 3.'))
          proc.stdout.emit('data', Buffer.from('20MiB/s ETA 00:20\n'))
          proc.stdout.emit('data', Buffer.from('[download]   15.00KiB at  890.98KiB/s\n'))
          proc.stdout.emit('data', Buffer.from('/path/to/split.mp4\n'))
          proc.emit('close', 0)
        })
        return proc
      })

      const res = await manager.downloadVideo('https://youtube.com/watch?v=123', '/tmp/out', 'ep1', 'best_compatible', (info) => {
        progressUpdates.push(info)
      })

      expect(res.filepath).to.equal('/path/to/split.mp4')
      expect(progressUpdates).to.have.length(2)
      expect(progressUpdates[0]).to.deep.equal({ percent: 33.3, speed: '3.20MiB/s', eta: '00:20' })
      expect(progressUpdates[1]).to.deep.equal({ percent: null, speed: '890.98KiB/s', eta: null })
    })

    it('should dynamically restart active download with new speed limit when applySpeedLimit is called', async () => {
      const { EventEmitter } = require('events')
      const manager = new YtDlpManager()
      manager.ytDlpPath = '/usr/bin/yt-dlp'
      manager.isAvailable = true

      const spawnedProcesses = []
      const capturedArgs = []
      let killedSignals = []

      sinon.stub(childProcess, 'spawn').callsFake((path, args) => {
        capturedArgs.push(args)
        const proc = new EventEmitter()
        proc.stdout = new EventEmitter()
        proc.stderr = new EventEmitter()
        proc.kill = sinon.spy((sig) => {
          killedSignals.push(sig)
          setImmediate(() => {
            proc.emit('close', 1, sig)
          })
        })
        spawnedProcesses.push(proc)
        return proc
      })

      const progressUpdates = []
      const downloadPromise = manager.downloadVideo('https://youtube.com/watch?v=active123', '/tmp/out', 'active_ep', 'best_compatible', (info) => {
        progressUpdates.push(info)
      })

      expect(spawnedProcesses).to.have.length(1)
      expect(capturedArgs[0]).to.not.include('--limit-rate')
      expect(manager.activeDownloads.size).to.equal(1)

      // Emit some initial progress from process 1
      spawnedProcesses[0].stdout.emit('data', Buffer.from('PROGRESS:  20.0%|  10.0MiB/s|00:30|  20.00MiB| 100.00MiB|       N/A\n'))

      // Now change speed limit dynamically while download is in progress!
      manager.applySpeedLimit('1M')

      // Process 1 should have received SIGINT to allow graceful restart
      expect(killedSignals).to.include('SIGINT')

      // Wait for process 2 to spawn
      await new Promise((r) => setImmediate(r))
      await new Promise((r) => setImmediate(r))

      expect(spawnedProcesses).to.have.length(2)
      expect(capturedArgs[1]).to.include('--limit-rate')
      expect(capturedArgs[1]).to.include('1M')

      // Emit more progress from process 2 and complete download
      spawnedProcesses[1].stdout.emit('data', Buffer.from('PROGRESS:  60.0%|  1.00MiB/s|00:40|  60.00MiB| 100.00MiB|       N/A\n/tmp/out/active_ep.mp4\n'))
      spawnedProcesses[1].emit('close', 0)

      const result = await downloadPromise
      expect(result.filepath).to.equal('/tmp/out/active_ep.mp4')
      expect(manager.activeDownloads.size).to.equal(0)
      expect(progressUpdates).to.have.length(2)
      expect(progressUpdates[0].percent).to.equal(20.0)
      expect(progressUpdates[1].percent).to.equal(60.0)
      expect(progressUpdates[1].speed).to.equal('1.00MiB/s')
    })

    it('should dynamically remove speed limit when applySpeedLimit(null) is called', async () => {
      const { EventEmitter } = require('events')
      global.ServerSettings = { ytdlpDownloadSpeedLimit: '2M' }

      const manager = new YtDlpManager()
      manager.ytDlpPath = '/usr/bin/yt-dlp'
      manager.isAvailable = true

      const spawnedProcesses = []
      const capturedArgs = []

      sinon.stub(childProcess, 'spawn').callsFake((path, args) => {
        capturedArgs.push(args)
        const proc = new EventEmitter()
        proc.stdout = new EventEmitter()
        proc.stderr = new EventEmitter()
        proc.kill = sinon.spy((sig) => {
          setImmediate(() => {
            proc.emit('close', 1, sig)
          })
        })
        spawnedProcesses.push(proc)
        return proc
      })

      const downloadPromise = manager.downloadVideo('https://youtube.com/watch?v=unlim', '/tmp/out', 'unlim_ep', 'best_compatible')

      expect(capturedArgs[0]).to.include('--limit-rate')
      expect(capturedArgs[0]).to.include('2M')

      // Switch to unlimited
      manager.applySpeedLimit(null)

      await new Promise((r) => setImmediate(r))
      await new Promise((r) => setImmediate(r))

      expect(spawnedProcesses).to.have.length(2)
      expect(capturedArgs[1]).to.not.include('--limit-rate')

      spawnedProcesses[1].stdout.emit('data', Buffer.from('/tmp/out/unlim_ep.mp4\n'))
      spawnedProcesses[1].emit('close', 0)

      const result = await downloadPromise
      expect(result.filepath).to.equal('/tmp/out/unlim_ep.mp4')
      global.ServerSettings = null
    })

    it('should not restart process if applySpeedLimit is called with same limit', async () => {
      const { EventEmitter } = require('events')
      const manager = new YtDlpManager()
      manager.ytDlpPath = '/usr/bin/yt-dlp'
      manager.isAvailable = true

      const spawnedProcesses = []
      sinon.stub(childProcess, 'spawn').callsFake(() => {
        const proc = new EventEmitter()
        proc.stdout = new EventEmitter()
        proc.stderr = new EventEmitter()
        proc.kill = sinon.spy()
        spawnedProcesses.push(proc)
        return proc
      })

      const downloadPromise = manager.downloadVideo('https://youtube.com/watch?v=same', '/tmp/out', 'same_ep', 'best_compatible')
      expect(spawnedProcesses).to.have.length(1)

      manager.applySpeedLimit(null)
      expect(spawnedProcesses[0].kill.called).to.be.false

      spawnedProcesses[0].stdout.emit('data', Buffer.from('/tmp/out/same_ep.mp4\n'))
      spawnedProcesses[0].emit('close', 0)

      await downloadPromise
    })

    it('should pick up latest rate limit on rapid changes during restart', async () => {
      const { EventEmitter } = require('events')
      const manager = new YtDlpManager()
      manager.ytDlpPath = '/usr/bin/yt-dlp'
      manager.isAvailable = true

      const capturedArgs = []
      const spawnedProcesses = []
      sinon.stub(childProcess, 'spawn').callsFake((path, args) => {
        capturedArgs.push(args)
        const proc = new EventEmitter()
        proc.stdout = new EventEmitter()
        proc.stderr = new EventEmitter()
        proc.kill = sinon.spy((sig) => {
          // Delayed exit to simulate process winding down
          setTimeout(() => {
            proc.emit('close', 1, sig)
          }, 10)
        })
        spawnedProcesses.push(proc)
        return proc
      })

      const downloadPromise = manager.downloadVideo('https://youtube.com/watch?v=rapid', '/tmp/out', 'rapid_ep', 'best_compatible')

      // First change to 500K
      manager.applySpeedLimit('500K')
      // Immediate second change to 10M before first process has closed
      manager.applySpeedLimit('10M')

      await new Promise((r) => setTimeout(r, 30))

      expect(spawnedProcesses).to.have.length(2)
      expect(capturedArgs[1]).to.include('--limit-rate')
      expect(capturedArgs[1]).to.include('10M')

      spawnedProcesses[1].stdout.emit('data', Buffer.from('/tmp/out/rapid_ep.mp4\n'))
      spawnedProcesses[1].emit('close', 0)

      const result = await downloadPromise
      expect(result.filepath).to.equal('/tmp/out/rapid_ep.mp4')
    })

    it('should trigger applySpeedLimit when ServerSettings.update modifies ytdlpDownloadSpeedLimit', () => {
      global.MetadataPath = '/tmp'
      const ServerSettings = require('../../../server/objects/settings/ServerSettings')
      const settings = new ServerSettings()

      const manager = new YtDlpManager()
      manager.applySpeedLimit = sinon.spy()
      global.ytDlpManager = manager

      settings.update({ ytdlpDownloadSpeedLimit: '5M' })
      expect(manager.applySpeedLimit.calledWith('5M')).to.be.true
      expect(settings.ytdlpDownloadSpeedLimit).to.equal('5M')

      global.ytDlpManager = null
      global.MetadataPath = null
    })
  })

  describe('getChannelFeed', () => {
    const sinon = require('sinon')
    const childProcess = require('child_process')

    afterEach(() => {
      sinon.restore()
    })

    it('should parse entries and return metadata and episodes with published date, chapters, and extraData', async () => {
      const manager = new YtDlpManager()
      manager.ytDlpPath = '/usr/bin/yt-dlp'
      manager.isAvailable = true

      const mockEntries = [
        JSON.stringify({
          id: 'vid1',
          title: 'Episode 1',
          channel: 'Test Channel',
          uploader: 'Test Channel',
          uploader_id: '@TestChannel',
          playlist_title: 'My Playlist',
          playlist_description: 'Playlist Description',
          description: 'Episode 1 Desc',
          upload_date: '20260101',
          duration: 3600,
          thumbnail: 'https://img.youtube.com/vi/vid1/default.jpg',
          tags: ['Tech', 'News'],
          categories: ['Science'],
          chapters: [
            { start_time: 0, end_time: 60, title: 'Intro' }
          ]
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
      expect(ep1.pubDate).to.equal('2026-01-01')
      expect(ep1.publishedAt).to.equal(Date.UTC(2026, 0, 1))
      expect(ep1.enclosure).to.deep.equal({
        url: 'https://www.youtube.com/watch?v=vid1',
        type: 'video/mp4'
      })
      expect(ep1.durationSeconds).to.equal(3600)
      expect(ep1.guid).to.equal('vid1')
      expect(ep1.chapters).to.deep.equal([
        { id: 0, start: 0, end: 60, title: 'Intro' }
      ])
      expect(ep1.extraData.uploaderId).to.equal('@TestChannel')
      expect(ep1.extraData.tags).to.deep.equal(['Tech', 'News'])

      const ep2 = feed.episodes[1]
      expect(ep2.pubDate).to.equal('2026-01-02')
      expect(ep2.publishedAt).to.equal(Date.UTC(2026, 0, 2))
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
      expect(feed.episodes[0].publishedAt).to.equal(Date.UTC(2026, 0, 1))
      expect(feed.episodes[0].pubDate).to.equal('2026-01-01')
    })

    it('should omit --playlist-end when limit is not specified', async () => {
      const manager = new YtDlpManager()
      manager.ytDlpPath = '/usr/bin/yt-dlp'
      manager.isAvailable = true

      const allCapturedArgs = []
      sinon.stub(childProcess, 'execFile').callsFake((path, args, opts, callback) => {
        allCapturedArgs.push(args)
        callback(null, JSON.stringify({ id: 'vid1', title: 'Ep 1' }), '')
      })

      await manager.getChannelFeed('https://www.youtube.com/playlist?list=PL123')
      // First call should be the flat-playlist call
      expect(allCapturedArgs[0]).to.include('--flat-playlist')
      expect(allCapturedArgs[0]).to.not.include('--playlist-end')
    })

    it('should include --playlist-end when limit is specified', async () => {
      const manager = new YtDlpManager()
      manager.ytDlpPath = '/usr/bin/yt-dlp'
      manager.isAvailable = true

      const allCapturedArgs = []
      sinon.stub(childProcess, 'execFile').callsFake((path, args, opts, callback) => {
        allCapturedArgs.push(args)
        callback(null, JSON.stringify({ id: 'vid1', title: 'Ep 1' }), '')
      })

      await manager.getChannelFeed('https://www.youtube.com/playlist?list=PL123', 20)
      // First call should be the flat-playlist call with --playlist-end
      expect(allCapturedArgs[0]).to.include('--playlist-end')
      expect(allCapturedArgs[0]).to.include('20')
    })
  })

  describe('normalizeYouTubeUrl', () => {
    it('should normalize YouTube show URLs to playlist URLs', () => {
      const manager = new YtDlpManager()
      expect(
        manager.normalizeYouTubeUrl('https://www.youtube.com/show/VLPLRDOtN2snjg4?sbp=KgtVNjFHWVF1LVEwRUAB')
      ).to.equal('https://www.youtube.com/playlist?list=PLRDOtN2snjg4')
      expect(
        manager.normalizeYouTubeUrl('https://www.youtube.com/show/PLRDOtN2snjg4')
      ).to.equal('https://www.youtube.com/playlist?list=PLRDOtN2snjg4')
    })

    it('should normalize watch URL with playlist list param', () => {
      const manager = new YtDlpManager()
      expect(
        manager.normalizeYouTubeUrl('https://www.youtube.com/watch?v=U61GYQu-Q0E&list=VLPLRDOtN2snjg4&pp=iAQB')
      ).to.equal('https://www.youtube.com/playlist?list=PLRDOtN2snjg4')
    })

    it('should strip VL prefix in playlist list param', () => {
      const manager = new YtDlpManager()
      expect(
        manager.normalizeYouTubeUrl('https://www.youtube.com/playlist?list=VLPLRDOtN2snjg4')
      ).to.equal('https://www.youtube.com/playlist?list=PLRDOtN2snjg4')
    })

    it('should append /videos to channel URLs without subpath', () => {
      const manager = new YtDlpManager()
      expect(
        manager.normalizeYouTubeUrl('https://www.youtube.com/@AIForHumansShow')
      ).to.equal('https://www.youtube.com/@AIForHumansShow/videos')
      expect(
        manager.normalizeYouTubeUrl('https://www.youtube.com/@AIForHumansShow/podcasts')
      ).to.equal('https://www.youtube.com/@AIForHumansShow/podcasts')
    })
  })

  describe('duration and relative date parsers', () => {
    it('should parse duration strings to seconds', () => {
      const manager = new YtDlpManager()
      expect(manager.parseDurationString('1:08:59')).to.equal(4139)
      expect(manager.parseDurationString('27:59')).to.equal(1679)
      expect(manager.parseDurationString('45')).to.equal(45)
      expect(manager.parseDurationString(null)).to.be.null
      expect(manager.parseDurationString('invalid')).to.be.null
    })

    it('should parse relative date strings to timestamp', () => {
      const manager = new YtDlpManager()
      const now = Date.now()
      const dayAgo = manager.parseRelativeDate('1 day ago')
      expect(dayAgo).to.be.a('number')
      expect(now - dayAgo).to.be.closeTo(24 * 3600 * 1000, 2000)

      const weeksAgo = manager.parseRelativeDate('3 weeks ago')
      expect(now - weeksAgo).to.be.closeTo(3 * 7 * 24 * 3600 * 1000, 2000)

      expect(manager.parseRelativeDate(null)).to.be.null
      expect(manager.parseRelativeDate('unknown')).to.be.null
    })
  })

  describe('scrapeYouTubePlaylist', () => {
    const sinon = require('sinon')
    const axios = require('axios')

    afterEach(() => {
      sinon.restore()
    })

    it('should scrape playlist with lockupViewModel and return ordered episodes', async () => {
      const manager = new YtDlpManager()
      const mockInitialData = {
        microformat: {
          microformatDataRenderer: {
            title: 'Test Podcast Show',
            description: 'A great show about AI'
          }
        },
        contents: {
          twoColumnBrowseResultsRenderer: {
            tabs: [
              {
                tabRenderer: {
                  content: {
                    sectionListRenderer: {
                      contents: [
                        {
                          itemSectionRenderer: {
                            contents: [
                              {
                                lockupViewModel: {
                                  metadata: {
                                    lockupMetadataViewModel: {
                                      title: { content: 'Episode 1: Intro to AI' },
                                      metadata: {
                                        contentMetadataViewModel: {
                                          metadataRows: [
                                            { metadataParts: [{ text: { content: '1.2K views' } }, { text: { content: '2 years ago' } }] }
                                          ]
                                        }
                                      }
                                    }
                                  },
                                  contentImage: {
                                    thumbnailViewModel: {
                                      image: {
                                        sources: [{ url: 'https://img.youtube.com/vi/vid123/hqdefault.jpg' }]
                                      }
                                    }
                                  },
                                  rendererContext: {
                                    commandContext: {
                                      onTap: {
                                        innertubeCommand: {
                                          watchEndpoint: { videoId: 'vid123' }
                                        }
                                      }
                                    }
                                  }
                                }
                              },
                              {
                                lockupViewModel: {
                                  metadata: {
                                    lockupMetadataViewModel: {
                                      title: { content: 'Episode 2: Deep Learning' },
                                      metadata: {
                                        contentMetadataViewModel: {
                                          metadataRows: [
                                            { metadataParts: [{ text: { content: '500 views' } }, { text: { content: '1 year ago' } }] }
                                          ]
                                        }
                                      }
                                    }
                                  },
                                  contentImage: {
                                    thumbnailViewModel: {
                                      image: {
                                        sources: [{ url: 'https://img.youtube.com/vi/vid456/hqdefault.jpg' }]
                                      }
                                    }
                                  },
                                  rendererContext: {
                                    commandContext: {
                                      onTap: {
                                        innertubeCommand: {
                                          watchEndpoint: { videoId: 'vid456' }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  }
                }
              }
            ]
          }
        }
      }

      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <script>var ytInitialData = ${JSON.stringify(mockInitialData)};</script>
        </head>
        </html>
      `

      sinon.stub(axios, 'get').resolves({ data: mockHtml })

      const res = await manager.scrapeYouTubePlaylist('https://www.youtube.com/show/VLPLRDOtN2snjg4')
      expect(res.metadata.title).to.equal('Test Podcast Show')
      expect(res.metadata.description).to.equal('A great show about AI')
      expect(res.episodes).to.have.length(2)
      expect(res.numEpisodes).to.equal(2)

      const ep1 = res.episodes[0]
      expect(ep1.title).to.equal('Episode 1: Intro to AI')
      expect(ep1.guid).to.equal('vid123')
      expect(ep1.episode).to.equal('1')
      expect(ep1.isVideo).to.be.true
      expect(ep1.isYtDlp).to.be.true
      expect(ep1.enclosure.url).to.equal('https://www.youtube.com/watch?v=vid123')

      const ep2 = res.episodes[1]
      expect(ep2.title).to.equal('Episode 2: Deep Learning')
      expect(ep2.guid).to.equal('vid456')
      expect(ep2.episode).to.equal('2')
    })
  })
})
