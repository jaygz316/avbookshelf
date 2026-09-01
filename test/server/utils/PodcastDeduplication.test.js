const { expect } = require('chai')
const { Sequelize } = require('sequelize')
const Database = require('../../../server/Database')
const LibraryItemScanData = require('../../../server/scanner/LibraryItemScanData')

describe('Podcast Episode Audio/Video Deduplication & Matching', () => {
  let podcast
  let episode1

  beforeEach(async () => {
    global.ServerSettings = {}
    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()

    podcast = await Database.podcastModel.create({
      title: 'Tech Talk Daily',
      author: 'Host Name',
      feedURL: 'https://example.com/feed.xml',
      feedType: 'rss'
    })

    episode1 = await Database.podcastEpisodeModel.create({
      title: 'Episode 101: The Future of AI',
      season: '2',
      episode: '1',
      podcastId: podcast.id,
      enclosureURL: 'https://cdn.example.com/ep101.mp3',
      extraData: { guid: 'guid-ep-101' },
      episodeMediaType: 'audio',
      audioFile: {
        ino: '1010',
        metadata: { filename: 'Episode 101 - The Future of AI.mp3', filenameNoExt: 'Episode 101 - The Future of AI', path: '/podcasts/tech/Episode 101 - The Future of AI.mp3' }
      }
    })

    podcast.podcastEpisodes = [episode1]
  })

  describe('checkMatchesFeedEpisode', () => {
    it('should match by GUID', () => {
      const feedEpisode = {
        guid: 'guid-ep-101',
        title: 'Different Title in Feed',
        enclosure: { url: 'https://different.url/file.mp4' }
      }
      expect(episode1.checkMatchesFeedEpisode(feedEpisode)).to.be.true
    })

    it('should match by itunesGuid', () => {
      const feedEpisode = {
        guid: 'youtube-video-id-12345',
        itunesGuid: 'guid-ep-101',
        title: 'YouTube Video Title',
        enclosure: { url: 'https://youtube.com/watch?v=12345' }
      }
      expect(episode1.checkMatchesFeedEpisode(feedEpisode)).to.be.true
    })

    it('should match by canonicalTitle', () => {
      const feedEpisode = {
        guid: 'youtube-guid-999',
        title: 'Tech Talk Daily #101 - The Future of AI [Official Video]',
        canonicalTitle: 'Episode 101: The Future of AI',
        enclosure: { url: 'https://youtube.com/watch?v=ai101' }
      }
      expect(episode1.checkMatchesFeedEpisode(feedEpisode)).to.be.true
    })

    it('should match by cleaned title stripping tags and brackets', () => {
      const feedEpisode = {
        guid: 'youtube-guid-888',
        title: 'Episode 101: The Future of AI [Official Video]',
        enclosure: { url: 'https://youtube.com/watch?v=ai101' }
      }
      expect(episode1.checkMatchesFeedEpisode(feedEpisode)).to.be.true
    })

    it('should match by enclosure URL', () => {
      const feedEpisode = {
        guid: 'some-other-guid',
        title: 'Different Title',
        enclosure: { url: 'https://cdn.example.com/ep101.mp3' }
      }
      expect(episode1.checkMatchesFeedEpisode(feedEpisode)).to.be.true
    })

    it('should match by season and episode numbers', () => {
      const feedEpisode = {
        guid: 'different-guid-123',
        season: '2',
        episode: '1',
        title: 'Ep 101 Special',
        enclosure: { url: 'https://video.example.com/ep101.mp4' }
      }
      expect(episode1.checkMatchesFeedEpisode(feedEpisode)).to.be.true
    })

    it('should match by exact title (case-insensitive)', () => {
      const feedEpisode = {
        guid: 'random-guid-999',
        title: 'episode 101: the future of ai',
        enclosure: { url: 'https://youtube.com/watch?v=ai101' }
      }
      expect(episode1.checkMatchesFeedEpisode(feedEpisode)).to.be.true
    })

    it('should return false when nothing matches', () => {
      const feedEpisode = {
        guid: 'guid-unrelated',
        season: '3',
        episode: '5',
        title: 'Unrelated Show Title',
        enclosure: { url: 'https://example.com/other.mp3' }
      }
      expect(episode1.checkMatchesFeedEpisode(feedEpisode)).to.be.false
    })
  })

  describe('checkHasEpisodeByFeedEpisode on Podcast model', () => {
    it('should correctly report existing episode for matching feed item', () => {
      const feedEpisode = {
        title: 'Episode 101: The Future of AI',
        enclosure: { url: 'https://youtube.com/watch?v=xyz' }
      }
      expect(podcast.checkHasEpisodeByFeedEpisode(feedEpisode)).to.be.true
    })

    it('should match YouTube feed episode paired with iTunes canonical title', () => {
      const feedEpisode = {
        title: 'The Future of AI [4K Video]',
        canonicalTitle: 'Episode 101: The Future of AI',
        enclosure: { url: 'https://youtube.com/watch?v=ai4k' }
      }
      expect(podcast.checkHasEpisodeByFeedEpisode(feedEpisode)).to.be.true
    })

    it('should return false for unmatched episode', () => {
      const feedEpisode = {
        title: 'Brand New Episode 102',
        enclosure: { url: 'https://youtube.com/watch?v=new' }
      }
      expect(podcast.checkHasEpisodeByFeedEpisode(feedEpisode)).to.be.false
    })
  })

  describe('LibraryItemScanData Audio vs Video separation', () => {
    it('should separate .mp4 and .webm into videoLibraryFiles and exclude from audioLibraryFiles for podcasts', () => {
      const scanData = new LibraryItemScanData({
        mediaType: 'podcast',
        libraryFiles: [
          { ino: '1', metadata: { ext: '.mp3', filename: 'ep1.mp3' } },
          { ino: '2', metadata: { ext: '.mp4', filename: 'ep1.mp4' } },
          { ino: '3', metadata: { ext: '.webm', filename: 'ep2.webm' } },
          { ino: '4', metadata: { ext: '.m4a', filename: 'ep2.m4a' } }
        ]
      })

      expect(scanData.audioLibraryFiles.map(f => f.metadata.filename)).to.deep.equal(['ep1.mp3', 'ep2.m4a'])
      expect(scanData.videoLibraryFiles.map(f => f.metadata.filename)).to.deep.equal(['ep1.mp4', 'ep2.webm'])
    })

    it('should keep .mp4 in audioLibraryFiles for book libraries', () => {
      const scanData = new LibraryItemScanData({
        mediaType: 'book',
        libraryFiles: [
          { ino: '1', metadata: { ext: '.mp3', filename: 'ch1.mp3' } },
          { ino: '2', metadata: { ext: '.mp4', filename: 'ch2.mp4' } }
        ]
      })

      expect(scanData.audioLibraryFiles.map(f => f.metadata.filename)).to.deep.equal(['ch1.mp3', 'ch2.mp4'])
    })
  })

  describe('Single PodcastEpisode holding both Audio and Video', () => {
    it('should support attaching both audioFile and videoFile without splitting', async () => {
      episode1.videoFile = {
        ino: '1011',
        metadata: { filename: 'Episode 101 - The Future of AI.mp4', filenameNoExt: 'Episode 101 - The Future of AI', path: '/podcasts/tech/Episode 101 - The Future of AI.mp4' }
      }
      episode1.episodeMediaType = 'video'
      await episode1.save()

      const reloaded = await Database.podcastEpisodeModel.findByPk(episode1.id)
      expect(reloaded.audioFile).to.not.be.null
      expect(reloaded.videoFile).to.not.be.null
      expect(reloaded.episodeMediaType).to.equal('video')
      expect(reloaded.audioFile.metadata.filenameNoExt).to.equal('Episode 101 - The Future of AI')
      expect(reloaded.videoFile.metadata.filenameNoExt).to.equal('Episode 101 - The Future of AI')
    })
  })
})
