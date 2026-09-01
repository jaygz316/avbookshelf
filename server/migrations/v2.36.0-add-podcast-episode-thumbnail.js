/**
 * @typedef MigrationContext
 * @property {import('sequelize').QueryInterface} queryInterface - a Sequelize QueryInterface object.
 * @property {import('../Logger')} logger - a Logger object.
 *
 * @typedef MigrationOptions
 * @property {MigrationContext} context - an object containing the migration context.
 */

const migrationVersion = '2.36.0'
const migrationName = `${migrationVersion}-add-podcast-episode-thumbnail`
const loggerPrefix = `[${migrationVersion} migration]`

/**
 * Ensures thumbnail column exists on podcastEpisodes table and checks video podcast columns.
 *
 * @param {MigrationOptions} options - an object containing the migration context.
 * @returns {Promise<void>} - A promise that resolves when the migration is complete.
 */
async function up({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} UPGRADE BEGIN: ${migrationName}`)

  if (await queryInterface.tableExists('podcastEpisodes')) {
    const tableDescription = await queryInterface.describeTable('podcastEpisodes')

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

    if (!tableDescription.videoFile) {
      logger.info(`${loggerPrefix} Adding videoFile column to podcastEpisodes table`)
      await queryInterface.addColumn('podcastEpisodes', 'videoFile', {
        type: queryInterface.sequelize.Sequelize.DataTypes.JSON,
        allowNull: true,
        defaultValue: null
      })
    }

    if (!tableDescription.episodeMediaType) {
      logger.info(`${loggerPrefix} Adding episodeMediaType column to podcastEpisodes table`)
      await queryInterface.addColumn('podcastEpisodes', 'episodeMediaType', {
        type: queryInterface.sequelize.Sequelize.DataTypes.STRING,
        allowNull: true,
        defaultValue: 'audio'
      })
    }
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
    }

    if (!tableDescription.maxDownloadResolution) {
      logger.info(`${loggerPrefix} Adding maxDownloadResolution column to podcasts table`)
      await queryInterface.addColumn('podcasts', 'maxDownloadResolution', {
        type: queryInterface.sequelize.Sequelize.DataTypes.STRING,
        allowNull: true,
        defaultValue: 'best'
      })
    }
  }

  logger.info(`${loggerPrefix} UPGRADE END: ${migrationName}`)
}

/**
 * Removes the thumbnail column from podcastEpisodes.
 *
 * @param {MigrationOptions} options - an object containing the migration context.
 * @returns {Promise<void>} - A promise that resolves when the migration is complete.
 */
async function down({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} DOWNGRADE BEGIN: ${migrationName}`)

  if (await queryInterface.tableExists('podcastEpisodes')) {
    const tableDescription = await queryInterface.describeTable('podcastEpisodes')

    if (tableDescription.thumbnail) {
      logger.info(`${loggerPrefix} Removing thumbnail column from podcastEpisodes table`)
      await queryInterface.removeColumn('podcastEpisodes', 'thumbnail')
    }
  }

  logger.info(`${loggerPrefix} DOWNGRADE END: ${migrationName}`)
}

module.exports = { up, down }
