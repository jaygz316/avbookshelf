const chai = require('chai')
const sinon = require('sinon')
const { expect } = chai

const { DataTypes } = require('sequelize')
const { up, down } = require('../../../server/migrations/v2.36.0-add-podcast-episode-thumbnail')

describe('Migration v2.36.0-add-podcast-episode-thumbnail', () => {
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
    it('should add thumbnail to podcastEpisodes when missing', async () => {
      await up({ context: { queryInterface, logger } })

      expect(
        queryInterface.addColumn.calledWith('podcastEpisodes', 'thumbnail', {
          type: DataTypes.STRING,
          allowNull: true,
          defaultValue: null
        })
      ).to.be.true
    })

    it('should skip adding thumbnail if it already exists', async () => {
      queryInterface.describeTable.callsFake(async (table) => {
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
    it('should remove thumbnail from podcastEpisodes if present', async () => {
      queryInterface.describeTable.callsFake(async (table) => {
        if (table === 'podcastEpisodes') {
          return { thumbnail: true }
        }
        return {}
      })

      await down({ context: { queryInterface, logger } })

      expect(queryInterface.removeColumn.calledWith('podcastEpisodes', 'thumbnail')).to.be.true
    })
  })
})
