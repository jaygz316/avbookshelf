const { DataTypes, Model } = require('sequelize')
const libraryItemsPodcastFilters = require('../utils/queries/libraryItemsPodcastFilters')
/**
 * @typedef ChapterObject
 * @property {number} id
 * @property {number} start
 * @property {number} end
 * @property {string} title
 */

class PodcastEpisode extends Model {
  constructor(values, options) {
    super(values, options)

    /** @type {string} */
    this.id
    /** @type {number} */
    this.index
    /** @type {string} */
    this.season
    /** @type {string} */
    this.episode
    /** @type {string} */
    this.episodeType
    /** @type {string} */
    this.title
    /** @type {string} */
    this.subtitle
    /** @type {string} */
    this.description
    /** @type {string} */
    this.pubDate
    /** @type {string} */
    this.enclosureURL
    /** @type {BigInt} */
    this.enclosureSize
    /** @type {string} */
    this.enclosureType
    /** @type {Date} */
    this.publishedAt
    /** @type {import('./Book').AudioFileObject} */
    this.audioFile
    /** @type {Object} */
    this.videoFile
    /** @type {string} */
    this.episodeMediaType
    /** @type {ChapterObject[]} */
    this.chapters
    /** @type {Object} */
    this.extraData
    /** @type {string} */
    this.podcastId
    /** @type {string} */
    this.thumbnail
    /** @type {Date} */
    this.createdAt
    /** @type {Date} */
    this.updatedAt
  }

  /**
   *
   * @param {import('../utils/podcastUtils').RssPodcastEpisode} rssPodcastEpisode
   * @param {string} podcastId
   * @param {import('../objects/files/AudioFile')|import('../objects/files/VideoFile')} mediaFile
   * @param {boolean} isVideo
   */
  static async createFromRssPodcastEpisode(rssPodcastEpisode, podcastId, mediaFile, isVideo = false) {
    const globals = require('../utils/globals')
    const mediaFileIsVideo = mediaFile && (mediaFile.constructor?.name === 'VideoFile' || mediaFile.mimeType?.startsWith('video/') || (mediaFile.metadata?.ext && globals.SupportedVideoTypes?.includes(mediaFile.metadata.ext.replace(/^\./, '').toLowerCase())))
    const isVideoEpisode = isVideo || !!rssPodcastEpisode?.isVideo || mediaFileIsVideo
    const infoJson = mediaFile?.infoJson || null

    const season = rssPodcastEpisode?.season || infoJson?.season || null
    const episode = rssPodcastEpisode?.episode || infoJson?.episode || null
    const episodeType = rssPodcastEpisode?.episodeType || infoJson?.episodeType || 'full'
    const title = rssPodcastEpisode?.title || infoJson?.title || 'Untitled'
    const subtitle = rssPodcastEpisode?.subtitle || infoJson?.subtitle || null
    let pubDate = rssPodcastEpisode?.pubDate || infoJson?.pubDate || null
    let publishedAt = rssPodcastEpisode?.publishedAt || infoJson?.publishedAt || null

    const { parseDateToTimestampAndString } = require('../utils/parsers/parseInfoJsonMetadata')
    if (!publishedAt && pubDate) {
      const parsed = parseDateToTimestampAndString(pubDate)
      if (parsed.publishedAt) publishedAt = parsed.publishedAt
    } else if (publishedAt && !pubDate) {
      const parsed = parseDateToTimestampAndString(null, publishedAt)
      if (parsed.pubDate) pubDate = parsed.pubDate
    }

    if (!publishedAt && !pubDate && mediaFile?.metaTags?.tagDate) {
      const parsed = parseDateToTimestampAndString(mediaFile.metaTags.tagDate)
      if (parsed.publishedAt) publishedAt = parsed.publishedAt
      if (parsed.pubDate) pubDate = parsed.pubDate
    }

    const thumbnail = rssPodcastEpisode?.thumbnail || infoJson?.thumbnail || null

    const extraData = {
      ...(infoJson?.extraData || {}),
      ...(rssPodcastEpisode?.extraData || {})
    }
    if (rssPodcastEpisode?.guid) {
      extraData.guid = rssPodcastEpisode.guid
    }
    if (rssPodcastEpisode?.itunesGuid) {
      extraData.itunesGuid = rssPodcastEpisode.itunesGuid
    }

    let chapters = []
    if (mediaFile?.chapters?.length) {
      chapters = mediaFile.chapters.map((ch) => ({ ...ch }))
    } else if (rssPodcastEpisode?.chapters?.length) {
      chapters = rssPodcastEpisode.chapters.map((ch) => ({ ...ch }))
    } else if (infoJson?.chapters?.length) {
      chapters = infoJson.chapters.map((ch) => ({ ...ch }))
    }

    const podcastEpisode = {
      index: null,
      season,
      episode,
      episodeType,
      title,
      subtitle,
      description,
      pubDate,
      enclosureURL: rssPodcastEpisode?.enclosure?.url || null,
      enclosureSize: rssPodcastEpisode?.enclosure?.length || null,
      enclosureType: rssPodcastEpisode?.enclosure?.type || null,
      publishedAt,
      podcastId,
      audioFile: isVideoEpisode ? null : mediaFile.toJSON(),
      videoFile: isVideoEpisode ? mediaFile.toJSON() : null,
      episodeMediaType: isVideoEpisode ? 'video' : 'audio',
      thumbnail,
      chapters,
      extraData
    }

    return this.create(podcastEpisode)
  }

  /**
   * Initialize model
   * @param {import('../Database').sequelize} sequelize
   */
  static init(sequelize) {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        index: DataTypes.INTEGER,
        season: DataTypes.STRING,
        episode: DataTypes.STRING,
        episodeType: DataTypes.STRING,
        title: DataTypes.STRING,
        subtitle: DataTypes.STRING(1000),
        description: DataTypes.TEXT,
        pubDate: DataTypes.STRING,
        enclosureURL: DataTypes.STRING,
        enclosureSize: DataTypes.BIGINT,
        enclosureType: DataTypes.STRING,
        publishedAt: DataTypes.DATE,

        audioFile: DataTypes.JSON,
        videoFile: DataTypes.JSON,
        episodeMediaType: {
          type: DataTypes.STRING,
          defaultValue: 'audio'
        },
        thumbnail: DataTypes.STRING,
        chapters: DataTypes.JSON,
        extraData: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'podcastEpisode',
        indexes: [
          {
            name: 'podcastEpisode_createdAt_podcastId',
            fields: ['createdAt', 'podcastId']
          },
          {
            name: 'podcast_episodes_published_at',
            fields: ['publishedAt']
          }
        ]
      }
    )

    const { podcast } = sequelize.models
    podcast.hasMany(PodcastEpisode, {
      onDelete: 'CASCADE'
    })
    PodcastEpisode.belongsTo(podcast)

    PodcastEpisode.addHook('afterDestroy', async (instance) => {
      libraryItemsPodcastFilters.clearCountCache('podcastEpisode', 'afterDestroy')
    })

    PodcastEpisode.addHook('afterCreate', async (instance) => {
      libraryItemsPodcastFilters.clearCountCache('podcastEpisode', 'afterCreate')
    })
    return this
  }

  get size() {
    return (this.isVideo && this.videoFile?.metadata?.size) || this.videoFile?.metadata?.size || this.audioFile?.metadata?.size || 0
  }

  get duration() {
    return (this.isVideo && this.videoFile?.duration) || this.videoFile?.duration || this.audioFile?.duration || 0
  }

  get isVideo() {
    return this.episodeMediaType === 'video' || !!this.videoFile
  }

  /**
   * Check if episode matches guid or enclosure url
   *
   * @param {string} guid
   * @param {string} enclosureURL
   * @returns {boolean}
   */
  checkMatchesGuidOrEnclosureUrl(guid, enclosureURL) {
    if (guid && this.extraData?.guid && String(this.extraData.guid) === String(guid)) {
      return true
    }
    if (guid && this.extraData?.itunesGuid && String(this.extraData.itunesGuid) === String(guid)) {
      return true
    }
    if (enclosureURL && this.enclosureURL && this.enclosureURL === enclosureURL) {
      return true
    }
    return false
  }

  /**
   * Used for matching the episode with a feed episode (by guid, url, season/episode, or title)
   *
   * @param {Object} feedEpisode
   * @returns {boolean}
   */
  checkMatchesFeedEpisode(feedEpisode) {
    if (!feedEpisode) return false
    if (this.checkMatchesGuidOrEnclosureUrl(feedEpisode.guid, feedEpisode.enclosure?.url)) {
      return true
    }
    // Check itunesGuid against extraData guid or itunesGuid
    if (feedEpisode.itunesGuid && this.extraData?.guid && String(this.extraData.guid) === String(feedEpisode.itunesGuid)) {
      return true
    }
    if (feedEpisode.guid && this.extraData?.itunesGuid && String(this.extraData.itunesGuid) === String(feedEpisode.guid)) {
      return true
    }
    if (feedEpisode.itunesGuid && this.extraData?.itunesGuid && String(this.extraData.itunesGuid) === String(feedEpisode.itunesGuid)) {
      return true
    }
    if (feedEpisode.season && this.season && feedEpisode.episode && this.episode) {
      if (String(this.season).trim() === String(feedEpisode.season).trim() && String(this.episode).trim() === String(feedEpisode.episode).trim()) {
        return true
      }
    } else if (feedEpisode.episode && this.episode) {
      const feedSeason = String(feedEpisode.season || '1').trim()
      const thisSeason = String(this.season || '1').trim()
      if (feedSeason === thisSeason && String(this.episode).trim() === String(feedEpisode.episode).trim()) {
        return true
      }
    }
    if (this.title && feedEpisode.title && this.title.trim().toLowerCase() === feedEpisode.title.trim().toLowerCase()) {
      return true
    }
    if (this.title && feedEpisode.canonicalTitle && this.title.trim().toLowerCase() === feedEpisode.canonicalTitle.trim().toLowerCase()) {
      return true
    }
    // Clean title match (stripping brackets, tags, etc.)
    try {
      const { cleanTitleForMatching } = require('../utils/podcastUtils')
      const cleanThis = cleanTitleForMatching(this.title)
      if (cleanThis && cleanThis.length > 3) {
        if (feedEpisode.title && cleanTitleForMatching(feedEpisode.title) === cleanThis) {
          return true
        }
        if (feedEpisode.canonicalTitle && cleanTitleForMatching(feedEpisode.canonicalTitle) === cleanThis) {
          return true
        }
      }
    } catch (_) {}
    return false
  }

  /**
   * Used in client video players
   *
   * @param {string} libraryItemId
   * @returns {Object|null}
   */
  getVideoTrack(libraryItemId) {
    if (!this.videoFile) return null
    const track = structuredClone(this.videoFile)
    track.startOffset = 0
    track.title = this.videoFile.metadata?.filename
    track.index = 1
    track.contentUrl = `/api/items/${libraryItemId}/file/${track.ino}`
    return track
  }

  /**
   * Used in client players
   *
   * @param {string} libraryItemId
   * @returns {import('./Book').AudioTrack}
   */
  getAudioTrack(libraryItemId) {
    if (this.isVideo && this.videoFile) {
      return this.getVideoTrack(libraryItemId)
    }
    if (this.audioFile) {
      const track = structuredClone(this.audioFile)
      track.startOffset = 0
      track.title = this.audioFile.metadata?.filename
      track.index = 1 // Podcast episodes only have one track
      track.contentUrl = `/api/items/${libraryItemId}/file/${track.ino}`
      return track
    }
    if (this.videoFile) {
      return this.getVideoTrack(libraryItemId)
    }
    return null
  }

  toOldJSON(libraryItemId) {
    if (!libraryItemId) {
      throw new Error(`[PodcastEpisode] Cannot convert to old JSON because libraryItemId is not provided`)
    }

    let enclosure = null
    if (this.enclosureURL) {
      enclosure = {
        url: this.enclosureURL,
        type: this.enclosureType,
        length: this.enclosureSize !== null ? String(this.enclosureSize) : null
      }
    }

    const isVideo = this.isVideo

    let publishedAt = this.publishedAt?.valueOf?.() || (this.publishedAt ? new Date(this.publishedAt).getTime() : null)
    let pubDate = this.pubDate || null

    if (!publishedAt && pubDate) {
      const { parseDateToTimestampAndString } = require('../utils/parsers/parseInfoJsonMetadata')
      const parsed = parseDateToTimestampAndString(pubDate)
      if (parsed.publishedAt) publishedAt = parsed.publishedAt
    }

    if (!publishedAt && this.videoFile?.metadata?.filename) {
      const { parseDateToTimestampAndString } = require('../utils/parsers/parseInfoJsonMetadata')
      const parsed = parseDateToTimestampAndString(this.videoFile.metadata.filename)
      if (parsed.publishedAt) {
        publishedAt = parsed.publishedAt
        pubDate = pubDate || parsed.pubDate
      }
    }

    if (!publishedAt && this.audioFile?.metadata?.filename) {
      const { parseDateToTimestampAndString } = require('../utils/parsers/parseInfoJsonMetadata')
      const parsed = parseDateToTimestampAndString(this.audioFile.metadata.filename)
      if (parsed.publishedAt) {
        publishedAt = parsed.publishedAt
        pubDate = pubDate || parsed.pubDate
      }
    }

    if (!publishedAt && this.title) {
      const { parseDateToTimestampAndString } = require('../utils/parsers/parseInfoJsonMetadata')
      const parsed = parseDateToTimestampAndString(this.title)
      if (parsed.publishedAt) {
        publishedAt = parsed.publishedAt
        pubDate = pubDate || parsed.pubDate
      }
    }

    if (publishedAt && !pubDate) {
      const { parseDateToTimestampAndString } = require('../utils/parsers/parseInfoJsonMetadata')
      const parsed = parseDateToTimestampAndString(null, publishedAt)
      if (parsed.pubDate) pubDate = parsed.pubDate
    }

    return {
      libraryItemId: libraryItemId,
      podcastId: this.podcastId,
      id: this.id,
      oldEpisodeId: this.extraData?.oldEpisodeId || null,
      index: this.index,
      season: this.season,
      episode: this.episode,
      episodeType: this.episodeType,
      title: this.title,
      subtitle: this.subtitle,
      description: this.description,
      enclosure,
      guid: this.extraData?.guid || null,
      pubDate,
      chapters: this.chapters ? structuredClone(this.chapters) : [],
      audioFile: this.audioFile ? structuredClone(this.audioFile) : null,
      videoFile: this.videoFile ? structuredClone(this.videoFile) : null,
      episodeMediaType: isVideo ? 'video' : 'audio',
      isVideo,
      thumbnail: this.thumbnail || null,
      publishedAt,
      addedAt: this.createdAt?.valueOf?.() || (this.createdAt ? new Date(this.createdAt).getTime() : Date.now()),
      updatedAt: this.updatedAt?.valueOf?.() || (this.updatedAt ? new Date(this.updatedAt).getTime() : Date.now())
    }
  }

  toOldJSONExpanded(libraryItemId) {
    const json = this.toOldJSON(libraryItemId)

    json.audioTrack = this.getAudioTrack(libraryItemId)
    if (this.isVideo) {
      json.videoTrack = this.getVideoTrack(libraryItemId)
    }
    json.size = this.size
    json.duration = this.duration

    return json
  }
}

module.exports = PodcastEpisode
