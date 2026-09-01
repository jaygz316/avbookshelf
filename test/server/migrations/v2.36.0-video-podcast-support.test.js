const chai = require('chai')
const sinon = require('sinon')
const { expect } = chai

const { DataTypes } = require('sequelize')
const { up, down } = require('../../../server/migrations/v2.36.0-video-podcast-support')

describe('Migration v2.36.0-video-podcast-support', () => {
  let queryInterface, logger

  beforeEach(() => {
    queryInterface = {
      addColumn: sinon.stub().resolves(),
      removeColumn: sinon.stub().resolves(),
      tableExists: sinon.stub().resolves(true),
      describeTable: sinon.stub().callsFake(async (table) => {
        if (table === 'podcastEpisodes') {
          return { videoFile: undefined, episodeMediaType: undefined, thumbnail: undefined }
        }
        if (table === 'podcasts') {
          return { feedType: undefined, maxDownloadResolution: undefined }
        }
        return {}
      }),
      sequelize: {
        Sequelize: {
          DataTypes: {
            STRING: DataTypes.STRING,
            JSON: DataTypes.JSON
          }
        }
      }
    }

    logger = {
      info: sinon.stub(),
      error: sinon.stub()
    }
  })

  describe('up', () => {
    it('should add videoFile, episodeMediaType and thumbnail to podcastEpisodes, and feedType and maxDownloadResolution to podcasts', async () => {
      await up({ context: { queryInterface, logger } })

      expect(queryInterface.addColumn.callCount).to.equal(5)
      expect(
        queryInterface.addColumn.calledWith('podcastEpisodes', 'videoFile', {
          type: DataTypes.JSON,
          allowNull: true,
          defaultValue: null
        })
      ).to.be.true
      expect(
        queryInterface.addColumn.calledWith('podcastEpisodes', 'episodeMediaType', {
          type: DataTypes.STRING,
          allowNull: true,
          defaultValue: 'audio'
        })
      ).to.be.true
      expect(
        queryInterface.addColumn.calledWith('podcastEpisodes', 'thumbnail', {
          type: DataTypes.STRING,
          allowNull: true,
          defaultValue: null
        })
      ).to.be.true
      expect(
        queryInterface.addColumn.calledWith('podcasts', 'feedType', {
          type: DataTypes.STRING,
          allowNull: true,
          defaultValue: 'rss'
        })
      ).to.be.true
      expect(
        queryInterface.addColumn.calledWith('podcasts', 'maxDownloadResolution', {
          type: DataTypes.STRING,
          allowNull: true,
          defaultValue: 'best'
        })
      ).to.be.true
    })

    it('should be idempotent when columns already exist', async () => {
      queryInterface.describeTable = sinon.stub().callsFake(async (table) => {
        if (table === 'podcastEpisodes') {
          return { videoFile: true, episodeMediaType: true, thumbnail: true }
        }
        if (table === 'podcasts') {
          return { feedType: true, maxDownloadResolution: true }
        }
        return {}
      })

      await up({ context: { queryInterface, logger } })
      expect(queryInterface.addColumn.called).to.be.false
    })
  })

  describe('down', () => {
    it('should remove columns when they exist', async () => {
      queryInterface.describeTable = sinon.stub().callsFake(async (table) => {
        if (table === 'podcastEpisodes') {
          return { videoFile: true, episodeMediaType: true, thumbnail: true }
        }
        if (table === 'podcasts') {
          return { feedType: true, maxDownloadResolution: true }
        }
        return {}
      })

      await down({ context: { queryInterface, logger } })

      expect(queryInterface.removeColumn.callCount).to.equal(5)
      expect(queryInterface.removeColumn.calledWith('podcastEpisodes', 'videoFile')).to.be.true
      expect(queryInterface.removeColumn.calledWith('podcastEpisodes', 'episodeMediaType')).to.be.true
      expect(queryInterface.removeColumn.calledWith('podcastEpisodes', 'thumbnail')).to.be.true
      expect(queryInterface.removeColumn.calledWith('podcasts', 'feedType')).to.be.true
      expect(queryInterface.removeColumn.calledWith('podcasts', 'maxDownloadResolution')).to.be.true
    })
  })
})
