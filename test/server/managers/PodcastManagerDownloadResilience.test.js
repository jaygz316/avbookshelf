const { expect } = require('chai')
const Path = require('path')
const os = require('os')
const fs = require('../../../server/libs/fsExtra')
const { isNetworkError, checkDns } = require('../../../server/utils/networkUtils')
const PodcastEpisodeDownload = require('../../../server/objects/PodcastEpisodeDownload')
const PodcastManager = require('../../../server/managers/PodcastManager')
const Database = require('../../../server/Database')

describe('PodcastManager & Download Resilience', () => {
  describe('networkUtils.isNetworkError', () => {
    it('should correctly identify DNS failure error codes and messages', () => {
      expect(isNetworkError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND audio.example.com' })).to.be.true
      expect(isNetworkError({ code: 'EAI_AGAIN', message: 'getaddrinfo EAI_AGAIN audio.example.com' })).to.be.true
      expect(isNetworkError(new Error('Temporary failure in name resolution'))).to.be.true
    })

    it('should correctly identify timeout and connection reset errors', () => {
      expect(isNetworkError({ code: 'ETIMEDOUT', message: 'Connection timed out' })).to.be.true
      expect(isNetworkError({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' })).to.be.true
      expect(isNetworkError({ code: 'ECONNRESET', message: 'read ECONNRESET' })).to.be.true
      expect(isNetworkError(new Error('socket hang up'))).to.be.true
      expect(isNetworkError(new Error('Client network socket disconnected before secure TLS connection was established'))).to.be.true
    })

    it('should correctly identify yt-dlp stderr network errors', () => {
      const ytdlpDnsStderr = 'ERROR: Unable to download webpage: <urlopen error [Errno -3] Temporary failure in name resolution>'
      expect(isNetworkError(new Error('yt-dlp exited with code 1'), ytdlpDnsStderr)).to.be.true

      const ytdlpUnreachStderr = 'ERROR: Unable to download webpage: <urlopen error [Errno 101] Network is unreachable>'
      expect(isNetworkError(new Error('yt-dlp exited with code 1'), ytdlpUnreachStderr)).to.be.true

      const ytdlpResetStderr = 'ERROR: unable to download video data: <urlopen error [Errno 104] Connection reset by peer>'
      expect(isNetworkError(new Error('yt-dlp exited with code 1'), ytdlpResetStderr)).to.be.true

      const ytdlpHangupStderr = 'ERROR: unable to download video data: RemoteDisconnected("Remote end closed connection without response")'
      expect(isNetworkError(new Error('yt-dlp exited with code 1'), ytdlpHangupStderr)).to.be.true

      const ytdlpRetriesStderr = 'ERROR: [download] Got error: Connection timed out. Giving up after 10 retries'
      expect(isNetworkError(new Error('yt-dlp exited with code 1'), ytdlpRetriesStderr)).to.be.true
    })

    it('should return false for non-network errors', () => {
      expect(isNetworkError(new Error('Request failed with status code 404'))).to.be.false
      expect(isNetworkError(new Error('Request failed with status code 401'))).to.be.false
      expect(isNetworkError(new Error('Invalid video format or codec'))).to.be.false
      expect(isNetworkError(null)).to.be.false
      expect(isNetworkError(undefined)).to.be.false
    })
  })

  describe('PodcastEpisodeDownload Serialization & Recovery', () => {
    it('should serialize to JSON for storage and restore completely via fromJSON', () => {
      const dl = new PodcastEpisodeDownload()
      const mockItem = {
        id: 'podcast-item-123',
        path: '/library/podcasts/test-podcast',
        libraryId: 'lib-abc',
        media: { title: 'Test Podcast', explicit: false }
      }
      const mockEpisode = {
        title: 'Episode 42 - The Answer',
        season: '2',
        episode: '42',
        episodeType: 'full',
        publishedAt: 1700000000000,
        enclosure: { url: 'https://example.com/ep42.mp3', length: 1234567, type: 'audio/mpeg' }
      }

      dl.setData(mockEpisode, mockItem, false, 'lib-abc')
      dl.networkRetryCount = 2

      const serialized = dl.toJSONForStorage()
      expect(serialized.id).to.equal(dl.id)
      expect(serialized.url).to.equal(dl.url)
      expect(serialized.libraryItemId).to.equal('podcast-item-123')
      expect(serialized.libraryId).to.equal('lib-abc')
      expect(serialized.targetFilename).to.equal('Episode 42 - The Answer.mp3')
      expect(serialized.networkRetryCount).to.equal(2)

      const restored = PodcastEpisodeDownload.fromJSON(serialized, mockItem)
      expect(restored).to.not.be.null
      expect(restored.id).to.equal(dl.id)
      expect(restored.url).to.equal(dl.url)
      expect(restored.libraryItemId).to.equal('podcast-item-123')
      expect(restored.libraryItem).to.equal(mockItem)
      expect(restored.targetFilename).to.equal('Episode 42 - The Answer.mp3')
      expect(restored.networkRetryCount).to.equal(2)
      expect(restored.fileExtension).to.equal('mp3')
    })
  })

  describe('PodcastManager Queue Persistence & Recovery', () => {
    let testMetaDir
    let originalMetadataPath
    let manager

    before(async () => {
      originalMetadataPath = global.MetadataPath
      testMetaDir = Path.join(os.tmpdir(), `abs-test-meta-${Date.now()}`)
      await fs.ensureDir(testMetaDir)
      global.MetadataPath = testMetaDir
    })

    after(async () => {
      global.MetadataPath = originalMetadataPath
      await fs.remove(testMetaDir).catch(() => {})
    })

    beforeEach(() => {
      manager = new PodcastManager()
    })

    afterEach(async () => {
      if (manager.networkRecoveryTimer) {
        clearInterval(manager.networkRecoveryTimer)
        manager.networkRecoveryTimer = null
      }
      const queueFile = Path.join(testMetaDir, 'downloadQueue.json')
      await fs.remove(queueFile).catch(() => {})
    })

    it('should save queue to disk and verify file creation', async () => {
      const mockItem = {
        id: 'item-1',
        path: Path.join(testMetaDir, 'item1'),
        libraryId: 'lib-1'
      }
      await fs.ensureDir(mockItem.path)

      const dl1 = new PodcastEpisodeDownload()
      dl1.setData({ title: 'Ep 1', enclosure: { url: 'https://example.com/1.mp3' } }, mockItem, false, 'lib-1')

      manager.downloadQueue.push(dl1)
      await manager.saveQueue()

      const queueFile = Path.join(testMetaDir, 'downloadQueue.json')
      expect(await fs.pathExists(queueFile)).to.be.true

      const data = JSON.parse(await fs.readFile(queueFile, 'utf-8'))
      expect(data.queue).to.be.an('array').with.lengthOf(1)
      expect(data.queue[0].url).to.equal('https://example.com/1.mp3')
    })

    it('should restore active in-flight download and pending queue items upon crash/restart', async () => {
      const mockItem = {
        id: 'item-2',
        path: Path.join(testMetaDir, 'item2'),
        libraryId: 'lib-1'
      }
      await fs.ensureDir(mockItem.path)

      // Mock Database.sequelize.models.libraryItem
      const origSequelize = Database.sequelize
      Database.sequelize = {
        models: {
          libraryItem: {
            getExpandedById: async (id) => (id === 'item-2' ? mockItem : null)
          }
        }
      }

      const activeDl = new PodcastEpisodeDownload()
      activeDl.setData({ title: 'Active Ep', enclosure: { url: 'https://example.com/active.mp3' } }, mockItem, false, 'lib-1')

      const queuedDl = new PodcastEpisodeDownload()
      queuedDl.setData({ title: 'Queued Ep', enclosure: { url: 'https://example.com/queued.mp3' } }, mockItem, false, 'lib-1')

      // Simulate a server crash: write queue file with active currentDownload and queued items
      const crashPayload = {
        isPausedForNetwork: false,
        currentDownload: activeDl.toJSONForStorage(),
        queue: [queuedDl.toJSONForStorage()]
      }
      await fs.writeFile(Path.join(testMetaDir, 'downloadQueue.json'), JSON.stringify(crashPayload, null, 2), 'utf-8')

      // Create a stale partial file for the active download
      const partialPath = activeDl.targetPath
      await fs.writeFile(partialPath, 'corrupted partial content')
      expect(await fs.pathExists(partialPath)).to.be.true

      // Initialize a new manager instance and load queue
      const rebootedManager = new PodcastManager()
      await rebootedManager.loadQueue()

      // The active download should have been placed at the front of the queue, and its partial file deleted
      expect(rebootedManager.downloadQueue).to.have.lengthOf(2)
      expect(rebootedManager.downloadQueue[0].url).to.equal('https://example.com/active.mp3')
      expect(rebootedManager.downloadQueue[0].isRetrying).to.be.true
      expect(await fs.pathExists(partialPath)).to.be.false
      expect(rebootedManager.downloadQueue[1].url).to.equal('https://example.com/queued.mp3')

      Database.sequelize = origSequelize
    })

    it('should pause queue on network outage and resume when network is restored', async () => {
      expect(manager.isQueuePausedForNetwork).to.be.false

      // Pause queue
      manager.pauseQueueForNetwork()
      expect(manager.isQueuePausedForNetwork).to.be.true
      expect(manager.networkRecoveryTimer).to.not.be.null

      const mockItem = { id: 'item-3', path: Path.join(testMetaDir, 'item3'), libraryId: 'lib-1' }
      await fs.ensureDir(mockItem.path)

      const dl = new PodcastEpisodeDownload()
      dl.setData({ title: 'Queued While Offline', enclosure: { url: 'https://example.com/offline.mp3' } }, mockItem, false, 'lib-1')

      // Items enqueued while paused should not attempt to start immediately
      await manager.startPodcastEpisodeDownload(dl)
      expect(manager.currentDownload).to.be.null
      expect(manager.downloadQueue).to.have.lengthOf(1)
      expect(manager.downloadQueue[0].url).to.equal('https://example.com/offline.mp3')

      // Verify getDownloadQueueDetails reports isPausedForNetwork
      const details = manager.getDownloadQueueDetails()
      expect(details.isPausedForNetwork).to.be.true
      expect(details.queue).to.have.lengthOf(1)

      // Stop recovery monitor
      clearInterval(manager.networkRecoveryTimer)
      manager.networkRecoveryTimer = null
    })

    it('should preserve in-flight download on graceful stop()', async () => {
      const mockItem = { id: 'item-4', path: Path.join(testMetaDir, 'item4'), libraryId: 'lib-1' }
      await fs.ensureDir(mockItem.path)

      const dl = new PodcastEpisodeDownload()
      dl.setData({ title: 'Stopping Ep', enclosure: { url: 'https://example.com/stopping.mp3' } }, mockItem, false, 'lib-1')

      manager.currentDownload = dl
      await manager.stop()

      expect(manager.currentDownload).to.be.null
      expect(manager.downloadQueue).to.have.lengthOf(1)
      expect(manager.downloadQueue[0].url).to.equal('https://example.com/stopping.mp3')

      const savedData = JSON.parse(await fs.readFile(Path.join(testMetaDir, 'downloadQueue.json'), 'utf-8'))
      expect(savedData.queue).to.have.lengthOf(1)
      expect(savedData.queue[0].url).to.equal('https://example.com/stopping.mp3')
    })
  })
})
