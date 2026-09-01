const { extractEpisodeNumbers } = require('../../video/VideoEpisodeMatcher')

/**
 * Robust date parser for dates from yt-dlp, RSS, tags, and APIs.
 * Supports timestamp (seconds or ms), YYYYMMDD string, ISO strings, RFC2822, etc.
 *
 * @param {string|number} rawDate
 * @param {string|number} [rawTimestamp]
 * @returns {{ publishedAt: number|null, pubDate: string }}
 */
function parseDateToTimestampAndString(rawDate, rawTimestamp = null) {
  // If timestamp is provided
  if (rawTimestamp != null && rawTimestamp !== '' && !isNaN(Number(rawTimestamp))) {
    const num = Number(rawTimestamp)
    if (num > 0) {
      const tsMs = num > 1e11 ? num : num * 1000
      const d = new Date(tsMs)
      if (!isNaN(d.valueOf())) {
        const year = d.getUTCFullYear()
        const month = String(d.getUTCMonth() + 1).padStart(2, '0')
        const day = String(d.getUTCDate()).padStart(2, '0')
        return {
          publishedAt: d.valueOf(),
          pubDate: `${year}-${month}-${day}`
        }
      }
    }
  }

  // If rawDate is numeric timestamp
  if (typeof rawDate === 'number' && !isNaN(rawDate) && rawDate > 0) {
    const tsMs = rawDate > 1e11 ? rawDate : rawDate * 1000
    const d = new Date(tsMs)
    if (!isNaN(d.valueOf())) {
      const year = d.getUTCFullYear()
      const month = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      return {
        publishedAt: d.valueOf(),
        pubDate: `${year}-${month}-${day}`
      }
    }
  }

  if (typeof rawDate === 'string' && rawDate.trim()) {
    const str = rawDate.trim()
    // YYYYMMDD format (e.g. "20230514")
    if (/^\d{8}$/.test(str)) {
      const year = parseInt(str.slice(0, 4), 10)
      const month = parseInt(str.slice(4, 6), 10)
      const day = parseInt(str.slice(6, 8), 10)
      const ts = Date.UTC(year, month - 1, day)
      const pubDate = `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`
      return {
        publishedAt: ts,
        pubDate
      }
    }

    // Standard Date parsing (YYYY-MM-DD, ISO 8601, RFC2822)
    const d = new Date(str)
    if (!isNaN(d.valueOf())) {
      const year = d.getUTCFullYear()
      const month = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      return {
        publishedAt: d.valueOf(),
        pubDate: `${year}-${month}-${day}`
      }
    }
  }

  return {
    publishedAt: null,
    pubDate: ''
  }
}

/**
 * Parse yt-dlp .info.json metadata text or object
 *
 * @param {string|Object} info
 * @returns {Object|null}
 */
function parseInfoJsonMetadata(info) {
  if (!info) return null

  let data = info
  if (typeof info === 'string') {
    try {
      data = JSON.parse(info)
    } catch {
      return null
    }
  }

  if (!data || typeof data !== 'object') return null

  const title = data.title || data.fulltitle || data.track || ''
  const description = data.description || ''
  const author = data.uploader || data.channel || data.artist || data.creator || ''
  const subtitle = author

  // Date parsing
  const rawDate = data.release_date || data.upload_date || data.modified_date || data.datetime || data.date
  const rawTimestamp = data.release_timestamp || data.timestamp || data.epoch
  const { publishedAt, pubDate } = parseDateToTimestampAndString(rawDate, rawTimestamp)

  // Season / Episode
  const extracted = extractEpisodeNumbers(title)
  const season = data.season_number != null ? String(data.season_number) : (extracted.season || '')
  const episode = data.episode_number != null ? String(data.episode_number) : (extracted.episode || '')

  // Chapters
  let chapters = []
  if (Array.isArray(data.chapters) && data.chapters.length) {
    chapters = data.chapters.map((ch, idx) => ({
      id: idx,
      start: typeof ch.start_time === 'number' ? ch.start_time : 0,
      end: typeof ch.end_time === 'number' ? ch.end_time : 0,
      title: ch.title || `Chapter ${idx + 1}`
    }))
  }

  // Thumbnail
  const thumbnail = (data.thumbnails?.length ? data.thumbnails[data.thumbnails.length - 1].url : null) || data.thumbnail || null

  // Tags & Categories
  const tags = Array.isArray(data.tags) ? data.tags.filter((t) => typeof t === 'string' && t.trim()) : []
  const categories = Array.isArray(data.categories) ? data.categories.filter((c) => typeof c === 'string' && c.trim()) : []

  // Duration
  const duration = data.duration != null && !isNaN(Number(data.duration)) ? Number(data.duration) : null

  return {
    title,
    subtitle,
    description,
    descriptionPlain: description,
    author,
    pubDate,
    publishedAt,
    season,
    episode,
    episodeType: data.episode_type || 'full',
    duration: duration ? String(duration) : '',
    durationSeconds: duration,
    thumbnail,
    chapters,
    tags,
    categories,
    guid: data.id || data.webpage_url || '',
    extraData: {
      guid: data.id || data.webpage_url || '',
      webpageUrl: data.webpage_url || data.url || (data.id ? `https://www.youtube.com/watch?v=${data.id}` : ''),
      uploader: data.uploader || '',
      uploaderId: data.uploader_id || '',
      uploaderUrl: data.uploader_url || '',
      channel: data.channel || '',
      channelId: data.channel_id || '',
      channelUrl: data.channel_url || '',
      viewCount: data.view_count != null ? Number(data.view_count) : null,
      likeCount: data.like_count != null ? Number(data.like_count) : null,
      tags,
      categories
    }
  }
}

module.exports = {
  parseDateToTimestampAndString,
  parseInfoJsonMetadata
}
