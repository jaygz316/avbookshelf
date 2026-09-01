/**
 * @typedef MigrationContext
 * @property {import('sequelize').QueryInterface} queryInterface - a Sequelize QueryInterface object.
 * @property {import('../Logger')} logger - a Logger object.
 *
 * @typedef MigrationOptions
 * @property {MigrationContext} context - an object containing the migration context.
 */

const migrationVersion = '2.36.0'
const migrationName = `${migrationVersion}-video-podcast-support`
const loggerPrefix = `[${migrationVersion} migration]`

/**
 * This migration script adds videoFile and episodeMediaType columns to podcastEpisodes table,
 * adds thumbnail column to podcastEpisodes table,
 * and feedType column to podcasts table.
 *
 * @param {MigrationOptions} options - an object containing the migration context.
 * @returns {Promise<void>} - A promise that resolves when the migration is complete.
 */
async function up({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} UPGRADE BEGIN: ${migrationName}`)

  if (await queryInterface.tableExists('podcastEpisodes')) {
    const tableDescription = await queryInterface.describeTable('podcastEpisodes')

    if (!tableDescription.videoFile) {
      logger.info(`${loggerPrefix} Adding videoFile column to podcastEpisodes table`)
      await queryInterface.addColumn('podcastEpisodes', 'videoFile', {
        type: queryInterface.sequelize.Sequelize.DataTypes.JSON,
        allowNull: true,
        defaultValue: null
      })
    } else {
      logger.info(`${loggerPrefix} videoFile column already exists in podcastEpisodes table`)
    }

    if (!tableDescription.episodeMediaType) {
      logger.info(`${loggerPrefix} Adding episodeMediaType column to podcastEpisodes table`)
      await queryInterface.addColumn('podcastEpisodes', 'episodeMediaType', {
        type: queryInterface.sequelize.Sequelize.DataTypes.STRING,
        allowNull: true,
        defaultValue: 'audio'
      })
    } else {
      logger.info(`${loggerPrefix} episodeMediaType column already exists in podcastEpisodes table`)
    }

    if (!tableDescription.thumbnail) {
      logger.info(`${loggerPrefix} Adding thumbnail column to podcastEpisodes table`)
      await queryInterface.addColumn('podcastEpisodes', 'thumbnail', {
        type: queryInterface.sequelize.Sequelize.DataTypes.STRING,
        allowNull: true,
        defaultValue: null
      })
    } else {
      logger.info(`${loggerPrefix} thumbnail column already exists in podcastEpisodes table`)
    }
  } else {
    logger.info(`${loggerPrefix} podcastEpisodes table does not exist`)
  }

  if (await queryInterface.tableExists('podcasts')) {
    const tableDescription = await queryInterface.describeTable('podcasts')

    if (!tableDescription.feedType) {
      logger.info(`${loggerPrefix} Adding feedType column to podcasts table`)
      await queryInterface.addColumn('podcasts', 'feedType', {
        type: queryInterface.sequelize.Sequelize.DataTypes.STRING,
        allowNull: true,
        defaultValue: 'rss'
      })
    } else {
      logger.info(`${loggerPrefix} feedType column already exists in podcasts table`)
    }

    if (!tableDescription.maxDownloadResolution) {
      logger.info(`${loggerPrefix} Adding maxDownloadResolution column to podcasts table`)
      await queryInterface.addColumn('podcasts', 'maxDownloadResolution', {
        type: queryInterface.sequelize.Sequelize.DataTypes.STRING,
        allowNull: true,
        defaultValue: 'best'
      })
    } else {
      logger.info(`${loggerPrefix} maxDownloadResolution column already exists in podcasts table`)
    }
  } else {
    logger.info(`${loggerPrefix} podcasts table does not exist`)
  }

  logger.info(`${loggerPrefix} UPGRADE END: ${migrationName}`)
}

/**
 * This migration script removes the videoFile and episodeMediaType columns from podcastEpisodes,
 * and feedType column from podcasts.
 *
 * @param {MigrationOptions} options - an object containing the migration context.
 * @returns {Promise<void>} - A promise that resolves when the migration is complete.
 */
async function down({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} DOWNGRADE BEGIN: ${migrationName}`)

  if (await queryInterface.tableExists('podcastEpisodes')) {
    const tableDescription = await queryInterface.describeTable('podcastEpisodes')

    if (tableDescription.videoFile) {
      logger.info(`${loggerPrefix} Removing videoFile column from podcastEpisodes table`)
      await queryInterface.removeColumn('podcastEpisodes', 'videoFile')
    } else {
      logger.info(`${loggerPrefix} videoFile column does not exist in podcastEpisodes table`)
    }

    if (tableDescription.episodeMediaType) {
      logger.info(`${loggerPrefix} Removing episodeMediaType column from podcastEpisodes table`)
      await queryInterface.removeColumn('podcastEpisodes', 'episodeMediaType')
    } else {
      logger.info(`${loggerPrefix} episodeMediaType column does not exist in podcastEpisodes table`)
    }

    if (tableDescription.thumbnail) {
      logger.info(`${loggerPrefix} Removing thumbnail column from podcastEpisodes table`)
      await queryInterface.removeColumn('podcastEpisodes', 'thumbnail')
    } else {
      logger.info(`${loggerPrefix} thumbnail column does not exist in podcastEpisodes table`)
    }
  } else {
    logger.info(`${loggerPrefix} podcastEpisodes table does not exist`)
  }

  if (await queryInterface.tableExists('podcasts')) {
    const tableDescription = await queryInterface.describeTable('podcasts')

    if (tableDescription.feedType) {
      logger.info(`${loggerPrefix} Removing feedType column from podcasts table`)
      await queryInterface.removeColumn('podcasts', 'feedType')
    } else {
      logger.info(`${loggerPrefix} feedType column does not exist in podcasts table`)
    }

    if (tableDescription.maxDownloadResolution) {
      logger.info(`${loggerPrefix} Removing maxDownloadResolution column from podcasts table`)
      await queryInterface.removeColumn('podcasts', 'maxDownloadResolution')
    } else {
      logger.info(`${loggerPrefix} maxDownloadResolution column does not exist in podcasts table`)
    }
  } else {
    logger.info(`${loggerPrefix} podcasts table does not exist`)
  }

  logger.info(`${loggerPrefix} DOWNGRADE END: ${migrationName}`)
}

module.exports = { up, down }
