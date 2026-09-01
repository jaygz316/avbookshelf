const { extractEpisodeNumbers } = require('../../video/VideoEpisodeMatcher')

/**
 * Strict, robust date parser for dates from yt-dlp, RSS, tags, and APIs.
 * Supports timestamp (seconds or ms), YYYYMMDD string, ISO strings, RFC2822, YYYY-MM-DD, etc.
 * Validates that resulting year is within a realistic modern era (1990 - 2040)
 * to avoid misparsing episode numbers ("Episode 300", "#1", "2001") as ancient or arbitrary dates.
 *
 * @param {string|number} rawDate
 * @param {string|number} [rawTimestamp]
 * @returns {{ publishedAt: number|null, pubDate: string }}
 */
function parseDateToTimestampAndString(rawDate, rawTimestamp = null) {
  const MIN_YEAR = 1990
  const MAX_YEAR = 2040
  const MIN_UNIX_SEC = 631152000 // 1990-01-01T00:00:00Z

  // 1. If timestamp is provided (number or numeric string)
  if (rawTimestamp != null && rawTimestamp !== '' && !isNaN(Number(rawTimestamp))) {
    const num = Number(rawTimestamp)
    if (num >= MIN_UNIX_SEC) {
      const tsMs = num > 1e11 ? num : num * 1000
      const d = new Date(tsMs)
      const year = d.getUTCFullYear()
      if (!isNaN(d.valueOf()) && year >= MIN_YEAR && year <= MAX_YEAR) {
        const month = String(d.getUTCMonth() + 1).padStart(2, '0')
        const day = String(d.getUTCDate()).padStart(2, '0')
        return {
          publishedAt: d.valueOf(),
          pubDate: `${year}-${month}-${day}`
        }
      }
    }
  }

  // 2. If rawDate is numeric or numeric string
  if (rawDate != null && rawDate !== '' && !isNaN(Number(rawDate)) && typeof rawDate !== 'boolean') {
    const rawStr = String(rawDate).trim()

    // Exact 4-digit year (e.g. 2025)
    if (/^(199\d|20[0-4]\d)$/.test(rawStr)) {
      const year = parseInt(rawStr, 10)
      const ts = Date.UTC(year, 0, 1)
      return {
        publishedAt: ts,
        pubDate: `${year}-01-01`
      }
    }

    // 8 digits YYYYMMDD as a number (e.g. 20230514)
    if (rawStr.length === 8 && /^\d{8}$/.test(rawStr)) {
      const year = parseInt(rawStr.slice(0, 4), 10)
      const month = parseInt(rawStr.slice(4, 6), 10)
      const day = parseInt(rawStr.slice(6, 8), 10)
      if (year >= MIN_YEAR && year <= MAX_YEAR && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const ts = Date.UTC(year, month - 1, day)
        return {
          publishedAt: ts,
          pubDate: `${rawStr.slice(0, 4)}-${rawStr.slice(4, 6)}-${rawStr.slice(6, 8)}`
        }
      }
    }

    // Unix timestamp in seconds or ms
    const num = Number(rawDate)
    if (num >= MIN_UNIX_SEC) {
      const tsMs = num > 1e11 ? num : num * 1000
      const d = new Date(tsMs)
      const year = d.getUTCFullYear()
      if (!isNaN(d.valueOf()) && year >= MIN_YEAR && year <= MAX_YEAR) {
        const month = String(d.getUTCMonth() + 1).padStart(2, '0')
        const day = String(d.getUTCDate()).padStart(2, '0')
        return {
          publishedAt: d.valueOf(),
          pubDate: `${year}-${month}-${day}`
        }
      }
    }
  }

  // 3. If rawDate is a string
  if (typeof rawDate === 'string' && rawDate.trim()) {
    const str = rawDate.trim()

    // Exact 4-digit year format (e.g. "2025")
    if (/^(199\d|20[0-4]\d)$/.test(str)) {
      const year = parseInt(str, 10)
      const ts = Date.UTC(year, 0, 1)
      return {
        publishedAt: ts,
        pubDate: `${year}-01-01`
      }
    }

    // YYYYMMDD format (e.g. "20230514")
    if (/^\d{8}$/.test(str)) {
      const year = parseInt(str.slice(0, 4), 10)
      const month = parseInt(str.slice(4, 6), 10)
      const day = parseInt(str.slice(6, 8), 10)
      if (year >= MIN_YEAR && year <= MAX_YEAR && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const ts = Date.UTC(year, month - 1, day)
        return {
          publishedAt: ts,
          pubDate: `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`
        }
      }
    }

    // YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD (with optional time)
    const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/)
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10)
      const month = parseInt(ymdMatch[2], 10)
      const day = parseInt(ymdMatch[3], 10)
      if (year >= MIN_YEAR && year <= MAX_YEAR && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const hour = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 0
        const min = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 0
        const sec = ymdMatch[6] ? parseInt(ymdMatch[6], 10) : 0
        const ts = Date.UTC(year, month - 1, day, hour, min, sec)
        const d = new Date(ts)
        const yStr = d.getUTCFullYear()
        const mStr = String(d.getUTCMonth() + 1).padStart(2, '0')
        const dStr = String(d.getUTCDate()).padStart(2, '0')
        return {
          publishedAt: d.valueOf(),
          pubDate: `${yStr}-${mStr}-${dStr}`
        }
      }
    }

    // RFC 2822 date or ISO string or Month Day, Year
    if (/^(?:[A-Za-z]{3},\s+)?\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/.test(str) || /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}/.test(str) || /^\d{4}-\d{2}-\d{2}T/.test(str)) {
      const d = new Date(str)
      const year = d.getUTCFullYear()
      if (!isNaN(d.valueOf()) && year >= MIN_YEAR && year <= MAX_YEAR) {
        const month = String(d.getUTCMonth() + 1).padStart(2, '0')
        const day = String(d.getUTCDate()).padStart(2, '0')
        return {
          publishedAt: d.valueOf(),
          pubDate: `${year}-${month}-${day}`
        }
      }
    }

    // Strict embedded date pattern search in filename or title strings: e.g. "2023-05-14", "2023.05.14"
    const embeddedMatch = str.match(/(?:^|[\s_(\[-])(20\d{2})[-_./](0[1-9]|1[0-2])[-_./](0[1-9]|[12]\d|3[01])(?:[\s_)\]-]|$)/)
    if (embeddedMatch) {
      const year = parseInt(embeddedMatch[1], 10)
      const month = parseInt(embeddedMatch[2], 10)
      const day = parseInt(embeddedMatch[3], 10)
      if (year >= MIN_YEAR && year <= MAX_YEAR) {
        const ts = Date.UTC(year, month - 1, day)
        const d = new Date(ts)
        if (!isNaN(d.valueOf())) {
          const yStr = d.getUTCFullYear()
          const mStr = String(d.getUTCMonth() + 1).padStart(2, '0')
          const dStr = String(d.getUTCDate()).padStart(2, '0')
          return {
            publishedAt: d.valueOf(),
            pubDate: `${yStr}-${mStr}-${dStr}`
          }
        }
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

  // Comprehensive date parsing across all yt-dlp, YouTube API, and RSS fields
  const rawDate =
    data.release_date ||
    data.upload_date ||
    data.published_at ||
    data.publish_date ||
    data.published_time ||
    data.publish_time ||
    data.pubDate ||
    data.pubdate ||
    data.publication_date ||
    data.modified_date ||
    data.datetime ||
    data.date ||
    data.release_year ||
    data.year

  const rawTimestamp =
    data.release_timestamp ||
    data.timestamp ||
    data.published_timestamp ||
    data.modified_timestamp ||
    data.start_time

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
