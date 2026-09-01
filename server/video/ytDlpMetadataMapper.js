/**
 * ytDlpMetadataMapper.js
 * Centralized mapping from yt-dlp video info objects to normalized episode metadata.
 * Used by PodcastController.downloadYtDlpEpisode and VideoManager.getChannelFeed.
 */

const { VideoMimeType } = require('../utils/constants')
const { parseDateToTimestampAndString } = require('../utils/parsers/parseInfoJsonMetadata')
const { extractEpisodeNumbers } = require('./VideoEpisodeMatcher')

/**
 * Extract raw date fields from a yt-dlp info object
 * @param {Object} info - yt-dlp video info JSON
 * @returns {{ rawDate: string|null, rawTimestamp: number|null }}
 */
function extractRawDateFields(info) {
  const rawDate = info.release_date || info.upload_date || info.published_at || info.publish_date ||
    info.published_time || info.publish_time || info.pubDate || info.pubdate ||
    info.publication_date || info.modified_date || info.datetime || info.date ||
    info.release_year || info.year
  const rawTimestamp = info.release_timestamp || info.timestamp || info.published_timestamp ||
    info.modified_timestamp || info.start_time
  return { rawDate, rawTimestamp }
}

/**
 * Parse a yt-dlp chapters array into normalized chapter objects
 * @param {Array} chapters
 * @returns {Array<{id: number, start: number, end: number, title: string}>}
 */
function parseChapters(chapters) {
  if (!Array.isArray(chapters) || !chapters.length) return []
  return chapters.map((ch, idx) => ({
    id: idx,
    start: typeof ch.start_time === 'number' ? ch.start_time : 0,
    end: typeof ch.end_time === 'number' ? ch.end_time : 0,
    title: ch.title || `Chapter ${idx + 1}`
  }))
}

/**
 * Extract tags and categories arrays from a yt-dlp info object
 * @param {Object} info
 * @returns {{ tags: string[], categories: string[] }}
 */
function extractTagsAndCategories(info) {
  const tags = Array.isArray(info.tags) ? info.tags.filter((t) => typeof t === 'string' && t.trim()) : []
  const categories = Array.isArray(info.categories) ? info.categories.filter((c) => typeof c === 'string' && c.trim()) : []
  return { tags, categories }
}

/**
 * Map a single yt-dlp video info object to a normalized podcast episode object.
 * This is used when downloading a single video via downloadYtDlpEpisode.
 * @param {Object} videoInfo - yt-dlp --dump-json output
 * @param {string} url - Original video URL
 * @param {Object} [options]
 * @param {string} [options.quality] - Download quality setting
 * @returns {Object} Normalized episode object
 */
function mapVideoInfoToEpisode(videoInfo, url, options = {}) {
  const { rawDate, rawTimestamp } = extractRawDateFields(videoInfo)
  let { publishedAt, pubDate } = parseDateToTimestampAndString(rawDate, rawTimestamp)
  if (!publishedAt || !pubDate) {
    const fallback = parseDateToTimestampAndString(videoInfo.title || '')
    if (fallback.publishedAt) {
      publishedAt = publishedAt || fallback.publishedAt
      pubDate = pubDate || fallback.pubDate
    }
  }

  const extracted = extractEpisodeNumbers(videoInfo.title || '')
  const season = videoInfo.season_number != null ? String(videoInfo.season_number) : (extracted.season || '')
  const episodeNum = videoInfo.episode_number != null ? String(videoInfo.episode_number) : (extracted.episode || '')
  const author = videoInfo.uploader || videoInfo.channel || videoInfo.artist || videoInfo.creator || ''
  const chapters = parseChapters(videoInfo.chapters)
  const { tags, categories } = extractTagsAndCategories(videoInfo)
  const thumbnail = (videoInfo.thumbnails?.length ? videoInfo.thumbnails[videoInfo.thumbnails.length - 1].url : null) || videoInfo.thumbnail || null
  const duration = videoInfo.duration != null && !isNaN(Number(videoInfo.duration)) ? Number(videoInfo.duration) : null

  return {
    title: videoInfo.title || 'Untitled',
    subtitle: author,
    description: videoInfo.description || '',
    descriptionPlain: videoInfo.description || '',
    pubDate,
    episodeType: videoInfo.episode_type || 'full',
    season,
    episode: episodeNum,
    author,
    duration: duration ? String(duration) : '',
    durationSeconds: duration,
    explicit: '',
    enclosure: { url, type: 'video/mp4' },
    publishedAt,
    guid: videoInfo.id || url,
    isVideo: true,
    isYtDlp: true,
    quality: options.quality || 'best_compatible',
    thumbnail,
    chapters,
    extraData: {
      guid: videoInfo.id || url,
      webpageUrl: videoInfo.webpage_url || url,
      uploader: videoInfo.uploader || '',
      uploaderId: videoInfo.uploader_id || '',
      uploaderUrl: videoInfo.uploader_url || '',
      channel: videoInfo.channel || '',
      channelId: videoInfo.channel_id || '',
      channelUrl: videoInfo.channel_url || '',
      viewCount: videoInfo.view_count != null ? Number(videoInfo.view_count) : null,
      likeCount: videoInfo.like_count != null ? Number(videoInfo.like_count) : null,
      tags,
      categories
    }
  }
}

/**
 * Map a yt-dlp flat-playlist entry to a normalized podcast episode object.
 * This is used when fetching channel/playlist feeds via getChannelFeed.
 * @param {Object} entry - yt-dlp flat-playlist JSON entry
 * @param {number} index - Position in the playlist
 * @param {Object} context
 * @param {string} context.url - Original feed URL
 * @param {string} context.author - Channel/playlist author
 * @param {Record<string, {publishedAt: number, pubDate: string}>} [context.dateMap] - Atom feed date map
 * @returns {Object} Normalized episode object
 */
function mapPlaylistEntryToEpisode(entry, index, context = {}) {
  const { url = '', author = '', dateMap = {} } = context
  const videoUrl = entry.url || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : url)
  const { rawDate, rawTimestamp } = extractRawDateFields(entry)
  let { publishedAt, pubDate } = parseDateToTimestampAndString(rawDate, rawTimestamp)

  if (entry.id && dateMap[entry.id]) {
    publishedAt = publishedAt || dateMap[entry.id].publishedAt
    pubDate = pubDate || dateMap[entry.id].pubDate
  }

  if (!publishedAt || !pubDate) {
    const parsedFallback = parseDateToTimestampAndString(entry.title || '')
    if (parsedFallback.publishedAt) {
      publishedAt = publishedAt || parsedFallback.publishedAt
      pubDate = pubDate || parsedFallback.pubDate
    }
  }

  const thumbnail = entry.thumbnails?.length
    ? entry.thumbnails[entry.thumbnails.length - 1].url
    : (entry.thumbnail || null)
  const season = entry.season_number != null ? String(entry.season_number) : null
  const episodeFromPlaylist = (!season && entry.season_number == null && entry.episode_number == null && entry.playlist_index != null)
    ? String(entry.playlist_index)
    : null
  const episode = entry.episode_number != null ? String(entry.episode_number) : null
  const extracted = (!season && !episode) ? extractEpisodeNumbers(entry.title || '') : {}
  const chapters = parseChapters(entry.chapters)
  const { tags, categories } = extractTagsAndCategories(entry)
  const entryAuthor = entry.uploader || entry.channel || author || ''

  return {
    title: entry.title || 'Untitled',
    subtitle: entryAuthor,
    description: entry.description || '',
    descriptionPlain: entry.description || '',
    pubDate,
    episodeType: 'full',
    season: season || extracted.season || '',
    episode: episode || extracted.episode || episodeFromPlaylist || String(index + 1),
    author: entryAuthor,
    duration: entry.duration ? String(entry.duration) : '',
    durationSeconds: entry.duration ? Number(entry.duration) : null,
    explicit: '',
    publishedAt,
    enclosure: {
      url: videoUrl,
      type: entry.ext ? (VideoMimeType[entry.ext.toUpperCase()] || 'video/mp4') : 'video/mp4'
    },
    guid: entry.id || videoUrl,
    isVideo: true,
    isYtDlp: true,
    thumbnail,
    chaptersUrl: null,
    chaptersType: null,
    chapters,
    extraData: {
      guid: entry.id || videoUrl,
      webpageUrl: entry.webpage_url || videoUrl,
      uploader: entry.uploader || '',
      uploaderId: entry.uploader_id || '',
      uploaderUrl: entry.uploader_url || '',
      channel: entry.channel || '',
      channelId: entry.channel_id || '',
      channelUrl: entry.channel_url || '',
      viewCount: entry.view_count != null ? Number(entry.view_count) : null,
      likeCount: entry.like_count != null ? Number(entry.like_count) : null,
      tags,
      categories
    }
  }
}

module.exports = {
  extractRawDateFields,
  parseChapters,
  extractTagsAndCategories,
  mapVideoInfoToEpisode,
  mapPlaylistEntryToEpisode
}
