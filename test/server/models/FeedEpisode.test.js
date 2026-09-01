const { expect } = require('chai')
const { Sequelize } = require('sequelize')
const Database = require('../../../server/Database')
const FeedEpisode = require('../../../server/models/FeedEpisode')

describe('FeedEpisode', () => {
  beforeEach(async () => {
    global.ServerSettings = {}
    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()
  })

  afterEach(async () => {
    await Database.sequelize.sync({ force: true })
  })

  describe('getFeedEpisodeObjFromPodcastEpisode', () => {
    it('should derive pubDate from publishedAt when pubDate is null', () => {
      const mockLibraryItem = {
        media: { explicit: false }
      }
      const mockFeed = {
        id: 'feed1',
        author: 'Podcast Host',
        siteURL: '/feed/podcast1'
      }
      const mockEpisode = {
        title: 'Episode 1',
        description: 'Description 1',
        pubDate: null,
        publishedAt: 1775001600000,
        season: '1',
        episode: '1',
        episodeType: 'full',
        audioFile: {
          metadata: { path: '/path/ep1.mp3', filename: 'ep1.mp3', size: 1000 },
          duration: 300,
          mimeType: 'audio/mpeg'
        }
      }

      const res = FeedEpisode.getFeedEpisodeObjFromPodcastEpisode(mockLibraryItem, mockFeed, 'podcast1', mockEpisode)
      expect(res.pubDate).to.equal(new Date(1775001600000).toUTCString())
      expect(res.title).to.equal('Episode 1')
      expect(res.enclosureType).to.equal('audio/mpeg')
    })
  })

  describe('createFromPodcastEpisodes', () => {
    it('should sort episodic podcast episodes newest to oldest without failing on null/invalid pubDate', async () => {
      const epOld = {
        title: 'Old Episode',
        pubDate: '2023-01-01',
        publishedAt: 1672531200000,
        audioFile: { metadata: { path: '/path/old.mp3', filename: 'old.mp3' }, duration: 100, mimeType: 'audio/mpeg' }
      }
      const epMid = {
        title: 'Mid Episode',
        pubDate: null,
        publishedAt: 1700000000000,
        audioFile: { metadata: { path: '/path/mid.mp3', filename: 'mid.mp3' }, duration: 100, mimeType: 'audio/mpeg' }
      }
      const epNew = {
        title: 'New Episode',
        pubDate: '2026-03-15',
        publishedAt: 1773532800000,
        audioFile: { metadata: { path: '/path/new.mp3', filename: 'new.mp3' }, duration: 100, mimeType: 'audio/mpeg' }
      }
      const epNoDate = {
        title: 'No Date Episode',
        pubDate: null,
        publishedAt: null,
        audioFile: { metadata: { path: '/path/nodate.mp3', filename: 'nodate.mp3' }, duration: 100, mimeType: 'audio/mpeg' }
      }

      const mockLibraryItem = {
        media: {
          explicit: false,
          podcastEpisodes: [epOld, epNew, epNoDate, epMid]
        }
      }

      const library = await Database.libraryModel.create({ name: 'Lib', mediaType: 'podcast' })
      const libraryFolder = await Database.libraryFolderModel.create({ path: '/lib', libraryId: library.id })
      const podcast = await Database.podcastModel.create({ title: 'Pod', autoDownloadEpisodes: false })
      const li = await Database.libraryItemModel.create({ mediaId: podcast.id, mediaType: 'podcast', libraryId: library.id, libraryFolderId: libraryFolder.id })
      const dbFeed = await Database.feedModel.create({
        id: 'feed_test',
        entityId: li.id,
        entityType: 'podcast',
        slug: 'test-feed',
        podcastType: 'episodic'
      })

      const result = await FeedEpisode.createFromPodcastEpisodes(mockLibraryItem, dbFeed, 'test-feed', null)
      expect(result).to.have.length(4)
      expect(result[0].title).to.equal('New Episode')
      expect(result[1].title).to.equal('Mid Episode')
      expect(result[2].title).to.equal('Old Episode')
      expect(result[3].title).to.equal('No Date Episode')
    })
  })

  describe('getRSSData', () => {
    it('should provide valid date for RSS feed', () => {
      const feedEp = Database.feedEpisodeModel.build({
        title: 'Test RSS Ep',
        description: 'Description',
        siteURL: '/test',
        enclosureURL: '/test.mp3',
        author: 'Author',
        pubDate: '2026-03-15',
        enclosureType: 'audio/mpeg',
        enclosureSize: 1000
      })

      const rssData = feedEp.getRSSData('http://localhost:3333')
      expect(rssData.date).to.equal('2026-03-15')
      expect(rssData.title).to.equal('Test RSS Ep')
    })
  })
})
