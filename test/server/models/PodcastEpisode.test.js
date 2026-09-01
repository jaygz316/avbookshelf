const { expect } = require('chai')
const { Sequelize } = require('sequelize')
const Database = require('../../../server/Database')
const PodcastEpisode = require('../../../server/models/PodcastEpisode')

describe('PodcastEpisode', () => {
  beforeEach(async () => {
    global.ServerSettings = {}
    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()
  })

  afterEach(async () => {
    await Database.sequelize.sync({ force: true })
  })

  describe('createFromRssPodcastEpisode', () => {
    it('should create podcast episode with description, title, dates and video attributes', async () => {
      const library = await Database.libraryModel.create({
        name: 'Podcasts',
        mediaType: 'podcast',
        folders: []
      })
      const libraryFolder = await Database.libraryFolderModel.create({
        path: '/podcasts',
        libraryId: library.id
      })
      const libraryItem = await Database.libraryItemModel.create({
        path: '/podcasts/test',
        libraryId: library.id,
        folderId: libraryFolder.id,
        mediaType: 'podcast',
        mediaId: 'pod1'
      })
      const podcast = await Database.podcastModel.create({
        id: 'pod1',
        title: 'Test Podcast',
        libraryItemId: libraryItem.id
      })

      const mockMediaFile = {
        constructor: { name: 'VideoFile' },
        toJSON: () => ({
          metadata: { path: '/path/ep.mp4', filename: 'ep.mp4' },
          duration: 1800,
          mimeType: 'video/mp4'
        }),
        infoJson: {
          description: 'info.json description fallback',
          title: 'Fallback Title'
        }
      }

      const mockRssEpisode = {
        title: 'Episode Title',
        subtitle: 'Host Subtitle',
        description: 'Episode Description from feed',
        pubDate: '2026-01-01',
        publishedAt: 1767225600000,
        season: '1',
        episode: '2',
        episodeType: 'full',
        isVideo: true,
        isYtDlp: true,
        enclosure: {
          url: 'https://www.youtube.com/watch?v=123',
          length: 5000,
          type: 'video/mp4'
        },
        guid: 'vid123'
      }

      const ep = await PodcastEpisode.createFromRssPodcastEpisode(mockRssEpisode, podcast.id, mockMediaFile, true)
      expect(ep).to.exist
      expect(ep.title).to.equal('Episode Title')
      expect(ep.description).to.equal('Episode Description from feed')
      expect(ep.subtitle).to.equal('Host Subtitle')
      expect(ep.episode).to.equal('2')
      expect(ep.season).to.equal('1')
      expect(ep.episodeMediaType).to.equal('video')
      expect(ep.videoFile).to.exist
      expect(ep.audioFile).to.be.null
    })
  })
})
