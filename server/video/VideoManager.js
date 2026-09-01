const childProcess = require('child_process')
const Path = require('path')
const axios = require('axios')
const Logger = require('../Logger')
const which = require('../utils/which')
const { extractEpisodeNumbers } = require('./VideoEpisodeMatcher')
const { VideoMimeType } = require('../utils/constants')
const { parseDateToTimestampAndString } = require('../utils/parsers/parseInfoJsonMetadata')
const { xmlToJSON } = require('../utils')

class VideoManager {
  constructor() {
    this.ytDlpPath = null
    this.isAvailable = false
  }

  /**
   * Fetch official YouTube Atom RSS feed to get exact publish dates for latest channel/playlist videos
   * @param {string|null} channelId
   * @param {string|null} [playlistId]
   * @returns {Promise<Record<string, { publishedAt: number, pubDate: string }>>}
   */
  async fetchYouTubeFeedDates(channelId, playlistId = null) {
    if (!channelId && !playlistId) return {}
    try {
      const feedUrl = playlistId
        ? `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`
        : `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
      const res = await axios.get(feedUrl, { timeout: 4000 })
      const json = await xmlToJSON(res.data)
      const dateMap = {}
      const entries = json?.feed?.entry
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          const videoId = entry['yt:videoId']?.[0] || entry['id']?.[0]?.replace('yt:video:', '')
          const published = entry['published']?.[0]
          if (videoId && published) {
            const { publishedAt, pubDate } = parseDateToTimestampAndString(published)
            if (publishedAt) {
              dateMap[videoId] = { publishedAt, pubDate }
            }
          }
        }
      }
      return dateMap
    } catch (err) {
      Logger.debug(`[VideoManager] Failed to fetch YouTube Atom feed dates: ${err.message}`)
      return {}
    }
  }

  /**
   * Fetch accurate publish dates for multiple videos via a single yt-dlp --batch-file invocation.
   * Writing all URLs to a temp file and running one process is drastically faster than
   * spawning one process per video (the old approach).
   *
   * @param {string[]} videoIds - YouTube video IDs to fetch dates for
   * @returns {Promise<Record<string, { publishedAt: number, pubDate: string }>>}
   */
  async fetchVideoDatesViaDlp(videoIds) {
    if (!this.isAvailable || !videoIds.length) return {}

    const fs = require('fs')
    const os = require('os')
    const tmpFile = require('path').join(os.tmpdir(), `abs-yt-dates-${Date.now()}-${process.pid}.txt`)

    try {
      // Write one URL per line for yt-dlp --batch-file
      const urls = videoIds.map((id) => `https://www.youtube.com/watch?v=${id}`)
      fs.writeFileSync(tmpFile, urls.join('\n'), 'utf8')

      const args = ['--dump-json', '--no-download', '--no-playlist', '-a', tmpFile]
      const entries = await this.execYtDlp(args)

      const dateMap = {}
      for (const info of entries) {
        if (!info?.id) continue
        const rawDate = info.release_date || info.upload_date || info.published_at || info.publish_date
        const rawTimestamp = info.release_timestamp || info.timestamp || info.published_timestamp
        const { publishedAt, pubDate } = parseDateToTimestampAndString(rawDate, rawTimestamp)
        if (publishedAt) {
          dateMap[info.id] = { publishedAt, pubDate }
        }
      }
      return dateMap
    } catch (err) {
      Logger.debug(`[VideoManager] fetchVideoDatesViaDlp batch failed: ${err.message}`)
      return {}
    } finally {
      try { require('fs').unlinkSync(tmpFile) } catch { /* ignore */ }
    }
  }

  /**
   * Parse upload date string or number to timestamp in milliseconds
   * @param {string|number} uploadDate
   * @param {string|number} [timestamp]
   * @returns {number|null}
   */
  parseUploadDate(uploadDate, timestamp = null) {
    const { publishedAt } = parseDateToTimestampAndString(uploadDate, timestamp)
    return publishedAt
  }

  /**
   * Check if yt-dlp binary is available
   */
  async init() {
    try {
      this.ytDlpPath = process.env.YTDLP_PATH || (await which('yt-dlp').catch(() => null))
    } catch {
      this.ytDlpPath = null
    }
    this.isAvailable = !!this.ytDlpPath
    if (this.isAvailable) {
      Logger.info(`[VideoManager] Found yt-dlp at ${this.ytDlpPath}`)
    } else {
      Logger.warn(`[VideoManager] yt-dlp not found - YouTube/video download features disabled`)
    }
  }

  /**
   * Get yt-dlp format selector string for quality setting
   * @param {string} quality
   * @returns {string}
   */
  getFormatForQuality(quality = 'best') {
    switch (quality) {
      case '480p_compatible':
      case '480p_h264':
        return 'bestvideo[height<=480][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=480][vcodec^=avc1]+bestaudio/bestvideo[height<=480]+bestaudio/best[height<=480]/best'
      case '720p_compatible':
      case '720p_h264':
        return 'bestvideo[height<=720][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=720][vcodec^=avc1]+bestaudio/bestvideo[height<=720]+bestaudio/best[height<=720]/best'
      case '1080p_compatible':
      case '1080p_h264':
      case '1080p':
        return 'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080][vcodec^=avc1]+bestaudio/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best'
      case '480p':
      case '480p_source':
        return 'bestvideo[height<=480]+bestaudio/best[height<=480]'
      case '720p':
      case '720p_source':
        return 'bestvideo[height<=720]+bestaudio/best[height<=720]'
      case '1080p_source':
        return 'bestvideo[height<=1080]+bestaudio/best[height<=1080]'
      case 'best_source':
        return 'bestvideo+bestaudio/best'
      case 'best':
      case 'best_compatible':
      case 'best_h264':
      default:
        return 'bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best'
    }
  }

  /**
   * Download a single video from URL
   * @param {string} url
   * @param {string} outputDir
   * @param {string} filename
   * @param {string} [quality='best']
   * @param {function({percent: number, speed: string, eta: string})|null} [onProgress=null]
   * @returns {Promise<{filepath: string}>}
   */
  async downloadVideo(url, outputDir, filename, quality = 'best', onProgress = null) {
    if (!this.isAvailable) throw new Error('yt-dlp is not available')

    const format = this.getFormatForQuality(quality)
    const outputTemplate = Path.join(outputDir, `${filename}.%(ext)s`)
    const args = [
      '--no-playlist',
      '--no-colors',
      '-f',
      format,
      '--merge-output-format',
      'mp4',
      '--embed-metadata',
      '--embed-chapters',
      '--write-info-json',
      '--write-thumbnail',
      '--convert-thumbnails',
      'jpg',
      '-o',
      outputTemplate,
      '--print',
      'after_move:filepath',
      '--progress',
      '--progress-template',
      'download:PROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress._downloaded_bytes_str)s|%(progress._total_bytes_str)s|%(progress._total_bytes_estimate_str)s',
      '--newline',
      url
    ]

    // Apply configured download speed limit to avoid IP bans
    const speedLimit = global.ServerSettings?.ytdlpDownloadSpeedLimit
    if (speedLimit && typeof speedLimit === 'string' && /^\d+(\.\d+)?[KMGkmg]?$/i.test(speedLimit)) {
      // Insert before url arg: args = [...optionArgs, url] so splice at args.length-1
      args.splice(args.length - 1, 0, '--limit-rate', speedLimit)
    }

    return new Promise((resolve, reject) => {
      const proc = childProcess.spawn(this.ytDlpPath, args)

      let stdoutBuffer = ''
      let lineBuffer = ''
      let stderrBuffer = ''

      const isIgnoredLine = (l) => /^(\[[a-zA-Z0-9_.-]+\]|PROGRESS:|WARNING:|ERROR:)/.test(l)

      const processLine = (rawLine) => {
        const line = rawLine.replace(/\r/g, '').trim()
        if (!line) return

        // 1. Check for structured PROGRESS template
        const progressMatch = line.match(/^PROGRESS:\s*([^|]*)\|([^|]*)\|([^|]*)(?:\|([^|]*)\|([^|]*)\|([^|]*))?/)
        if (progressMatch) {
          const rawPct = progressMatch[1].trim()
          const rawSpeed = progressMatch[2].trim()
          const rawEta = progressMatch[3].trim()

          let percent = null
          if (rawPct && rawPct !== 'NA' && rawPct !== 'Unknown') {
            const parsed = parseFloat(rawPct.replace('%', ''))
            if (!isNaN(parsed)) percent = parsed
          }

          const speed = rawSpeed && rawSpeed !== 'NA' && rawSpeed !== 'Unknown' && rawSpeed !== 'Unknown B/s' ? rawSpeed : null
          const eta = rawEta && rawEta !== 'NA' && rawEta !== 'Unknown' ? rawEta : null

          if (onProgress && (percent !== null || speed !== null)) {
            try {
              onProgress({ percent, speed, eta })
            } catch (err) {
              Logger.error(`[VideoManager] onProgress error:`, err)
            }
          }
          return
        }

        // 2. Fallback regex for standard yt-dlp [download] progress output
        const pctMatch = line.match(/\[download\]\s+([\d.]+)%/)
        if (pctMatch) {
          const percent = parseFloat(pctMatch[1])
          const speedMatch = line.match(/at\s+([\d.]+\s*\S+\/s)/)
          const etaMatch = line.match(/ETA\s+(\S+)/)
          if (onProgress) {
            try {
              onProgress({
                percent,
                speed: speedMatch ? speedMatch[1].trim() : null,
                eta: etaMatch ? etaMatch[1].trim() : null
              })
            } catch (err) {
              Logger.error(`[VideoManager] onProgress error:`, err)
            }
          }
          return
        }

        // 3. Fallback for yt-dlp byte-only progress lines (e.g. [download]   15.00KiB at  890.98KiB/s)
        const byteProgressMatch = line.match(/\[download\]\s+[\d.]+\s*\S+\s+at\s+([\d.]+\s*\S+\/s)/)
        if (byteProgressMatch) {
          if (onProgress) {
            try {
              onProgress({
                percent: null,
                speed: byteProgressMatch[1].trim(),
                eta: null
              })
            } catch (err) {
              Logger.error(`[VideoManager] onProgress error:`, err)
            }
          }
          return
        }

        // If not a progress line or tag line, save for capturing final filepath from --print after_move:filepath
        if (!isIgnoredLine(line)) {
          stdoutBuffer += line + '\n'
        }
      }

      proc.stdout.on('data', (data) => {
        try {
          lineBuffer += data.toString()
          const lines = lineBuffer.split('\n')
          lineBuffer = lines.pop()
          for (const line of lines) {
            processLine(line)
          }
        } catch (err) {
          Logger.error(`[VideoManager] stdout error:`, err)
        }
      })

      proc.stderr.on('data', (data) => {
        try {
          stderrBuffer += data.toString()
          const lines = stderrBuffer.split('\n')
          stderrBuffer = lines.pop()
          for (const line of lines) {
            const trimmed = line.replace(/\r/g, '').trim()
            if (!trimmed) continue
            const pctMatch = trimmed.match(/\[download\]\s+([\d.]+)%/)
            if (pctMatch) {
              if (onProgress) {
                try {
                  const speedMatch = trimmed.match(/at\s+([\d.]+\s*\S+\/s)/)
                  const etaMatch = trimmed.match(/ETA\s+(\S+)/)
                  onProgress({
                    percent: parseFloat(pctMatch[1]),
                    speed: speedMatch ? speedMatch[1].trim() : null,
                    eta: etaMatch ? etaMatch[1] : null
                  })
                } catch (err) {
                  Logger.error(`[VideoManager] onProgress error:`, err)
                }
              }
            } else if (!trimmed.startsWith('WARNING:')) {
              Logger.debug(`[VideoManager] ${trimmed}`)
            }
          }
        } catch (err) {
          Logger.error(`[VideoManager] stderr error:`, err)
        }
      })

      proc.stdout.on('error', (err) => {
        Logger.error(`[VideoManager] stdout stream error: ${err.message}`)
      })

      proc.stderr.on('error', (err) => {
        Logger.error(`[VideoManager] stderr stream error: ${err.message}`)
      })

      proc.on('close', (code) => {
        if (lineBuffer) processLine(lineBuffer)
        if (code !== 0) {
          const err = new Error(`yt-dlp exited with code ${code}`)
          Logger.error(`[VideoManager] Download failed: ${err.message}`)
          return reject(err)
        }
        const filepath = stdoutBuffer
          .trim()
          .split('\n')
          .filter((l) => l && !isIgnoredLine(l.trim()))
          .pop()
          ?.trim()

        if (!filepath) {
          const err = new Error('yt-dlp completed successfully but output filepath could not be resolved')
          Logger.error(`[VideoManager] ${err.message}`)
          return reject(err)
        }
        resolve({ filepath })
      })

      proc.on('error', (err) => {
        Logger.error(`[VideoManager] spawn error: ${err.message}`)
        reject(err)
      })
    })
  }

  /**
   * Get video metadata without downloading
   * @param {string} url
   * @returns {Promise<Object>}
   */
  async getVideoInfo(url) {
    if (!this.isAvailable) throw new Error('yt-dlp is not available')

    const args = ['--dump-json', '--no-download', '--no-playlist', url]
    return new Promise((resolve, reject) => {
      childProcess.execFile(
        this.ytDlpPath,
        args,
        {
          maxBuffer: 1024 * 1024 * 10
        },
        (error, stdout) => {
          if (error) return reject(error)
          try {
            resolve(JSON.parse(stdout))
          } catch (e) {
            reject(new Error('Failed to parse yt-dlp output'))
          }
        }
      )
    })
  }

  /**
   * Helper to execute yt-dlp with arguments and return parsed JSON lines
   * @param {string[]} args
   * @returns {Promise<Array<Object>>}
   */
  execYtDlp(args) {
    return new Promise((resolve, reject) => {
      childProcess.execFile(
        this.ytDlpPath,
        args,
        {
          maxBuffer: 1024 * 1024 * 50
        },
        (error, stdout, stderr) => {
          if (error) {
            return reject(new Error(stderr || error.message))
          }

          const entries = stdout
            .trim()
            .split('\n')
            .filter((line) => line.trim())
            .map((line) => {
              try {
                return JSON.parse(line)
              } catch {
                return null
              }
            })
            .filter(Boolean)

          if (!entries.length) {
            return reject(new Error('No entries found'))
          }

          resolve(entries)
        }
      )
    })
  }

  /**
   * Get channel/playlist entries as pseudo-RSS episodes
   * @param {string} url
   * @param {number|null} [limit=null]
   * @returns {Promise<{metadata: Object, episodes: Array}>}
   */
  async getChannelFeed(url, limit = null) {
    if (!this.isAvailable) throw new Error('yt-dlp is not available')

    let fetchUrl = url
    if (fetchUrl.includes('youtube.com/') || fetchUrl.includes('youtu.be/')) {
      const cleanUrl = fetchUrl.split('?')[0].replace(/\/+$/, '')
      if (
        !cleanUrl.endsWith('/videos') &&
        !cleanUrl.endsWith('/podcasts') &&
        !cleanUrl.endsWith('/streams') &&
        !cleanUrl.endsWith('/releases') &&
        !cleanUrl.includes('/playlist') &&
        !fetchUrl.includes('list=') &&
        !cleanUrl.includes('/watch') &&
        !cleanUrl.endsWith('.xml')
      ) {
        fetchUrl = `${cleanUrl}/videos`
      }
    }

    let entries = null

    // Strategy 1: Normalized fetchUrl with youtubetab:approximate_date
    try {
      const args1 = ['--dump-json', '--no-download', '--flat-playlist', '--extractor-args', 'youtubetab:approximate_date']
      if (limit != null && Number(limit) > 0) args1.push('--playlist-end', String(limit))
      args1.push(fetchUrl)
      entries = await this.execYtDlp(args1)
    } catch (err1) {
      Logger.debug(`[VideoManager] getChannelFeed strategy 1 failed for "${fetchUrl}": ${err1.message}`)
    }

    // Strategy 2: Original URL with youtubetab:approximate_date (if fetchUrl was different)
    if (!entries?.length && fetchUrl !== url) {
      try {
        const args2 = ['--dump-json', '--no-download', '--flat-playlist', '--extractor-args', 'youtubetab:approximate_date']
        if (limit != null && Number(limit) > 0) args2.push('--playlist-end', String(limit))
        args2.push(url)
        entries = await this.execYtDlp(args2)
      } catch (err2) {
        Logger.debug(`[VideoManager] getChannelFeed strategy 2 failed for "${url}": ${err2.message}`)
      }
    }

    // Strategy 3: Original URL without extractor-args
    if (!entries?.length) {
      try {
        const args3 = ['--dump-json', '--no-download', '--flat-playlist']
        if (limit != null && Number(limit) > 0) args3.push('--playlist-end', String(limit))
        args3.push(url)
        entries = await this.execYtDlp(args3)
      } catch (err3) {
        Logger.error(`[VideoManager] getChannelFeed all strategies failed for "${url}": ${err3.message}`)
        throw err3
      }
    }

    const firstEntry = entries[0]
    const image = firstEntry.playlist_thumbnails?.[0]?.url || (firstEntry.thumbnails?.length ? firstEntry.thumbnails[firstEntry.thumbnails.length - 1].url : null) || firstEntry.thumbnail || ''

    const metadata = {
      title: firstEntry.playlist_title || firstEntry.channel || firstEntry.uploader || firstEntry.title || 'Unknown',
      author: firstEntry.channel || firstEntry.uploader || '',
      description: firstEntry.playlist_description || firstEntry.description || '',
      descriptionPlain: firstEntry.playlist_description || firstEntry.description || '',
      image,
      feedUrl: url,
      feedType: 'youtube',
      type: 'episodic'
    }

    const channelId = firstEntry.channel_id || firstEntry.playlist_channel_id || firstEntry.uploader_id || null
    const playlistId = firstEntry.playlist_id && !firstEntry.playlist_id.startsWith('UC') ? firstEntry.playlist_id : null
    const dateMap = await this.fetchYouTubeFeedDates(channelId, playlistId).catch(() => ({}))

    const episodes = entries.map((entry) => {
      const videoUrl = entry.url || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : url)
      const rawDate =
        entry.release_date ||
        entry.upload_date ||
        entry.published_at ||
        entry.publish_date ||
        entry.published_time ||
        entry.publish_time ||
        entry.pubDate ||
        entry.pubdate ||
        entry.publication_date ||
        entry.modified_date ||
        entry.datetime ||
        entry.date ||
        entry.release_year ||
        entry.year
      const rawTimestamp =
        entry.release_timestamp ||
        entry.timestamp ||
        entry.published_timestamp ||
        entry.modified_timestamp ||
        entry.start_time
      let { publishedAt, pubDate } = parseDateToTimestampAndString(rawDate, rawTimestamp)

      // If date is mapped from official YouTube Atom feed
      if (entry.id && dateMap[entry.id]) {
        publishedAt = publishedAt || dateMap[entry.id].publishedAt
        pubDate = pubDate || dateMap[entry.id].pubDate
      }

      // If date is still missing, attempt to extract a strict date from entry title
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
      // Use playlist_index as fallback episode number when no structured episode data is present
      const episodeFromPlaylist = (!season && entry.season_number == null && entry.episode_number == null && entry.playlist_index != null)
        ? String(entry.playlist_index)
        : null
      const episode = entry.episode_number != null ? String(entry.episode_number) : null
      const extracted = (!season && !episode) ? extractEpisodeNumbers(entry.title || '') : {}

      let chapters = []
      if (Array.isArray(entry.chapters) && entry.chapters.length) {
        chapters = entry.chapters.map((ch, idx) => ({
          id: idx,
          start: typeof ch.start_time === 'number' ? ch.start_time : 0,
          end: typeof ch.end_time === 'number' ? ch.end_time : 0,
          title: ch.title || `Chapter ${idx + 1}`
        }))
      }

      const tags = Array.isArray(entry.tags) ? entry.tags.filter((t) => typeof t === 'string' && t.trim()) : []
      const categories = Array.isArray(entry.categories) ? entry.categories.filter((c) => typeof c === 'string' && c.trim()) : []
      const author = entry.uploader || entry.channel || metadata.author || ''

      return {
        title: entry.title || 'Untitled',
        subtitle: author,
        description: entry.description || '',
        descriptionPlain: entry.description || '',
        pubDate,
        episodeType: 'full',
        season: season || extracted.season || '',
        episode: episode || extracted.episode || episodeFromPlaylist || '',
        author,
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
    })

    // Fetch accurate dates for episodes still missing publishedAt via per-video yt-dlp lookups.
    // The Atom RSS feed only covers the last 15 videos, and --flat-playlist dates are unreliable,
    // so this fallback is necessary for older videos in the channel/playlist.
    const missingDateIds = episodes
      .filter((ep) => !ep.publishedAt && ep.guid && ep.guid !== url)
      .map((ep) => ep.guid)
    if (missingDateIds.length > 0) {
      Logger.info(`[VideoManager] Fetching accurate dates for ${missingDateIds.length} videos missing publishedAt`)
      const dlpDateMap = await this.fetchVideoDatesViaDlp(missingDateIds).catch((err) => {
        Logger.debug(`[VideoManager] fetchVideoDatesViaDlp failed: ${err.message}`)
        return {}
      })
      for (const ep of episodes) {
        if (!ep.publishedAt && ep.guid && dlpDateMap[ep.guid]) {
          ep.publishedAt = dlpDateMap[ep.guid].publishedAt
          ep.pubDate = dlpDateMap[ep.guid].pubDate
        }
      }
    }

    return { metadata, episodes, numEpisodes: episodes.length }
  }
}

module.exports = VideoManager
