const childProcess = require('child_process')
const Path = require('path')
const Logger = require('../Logger')
const which = require('../utils/which')
const { extractEpisodeNumbers } = require('./VideoEpisodeMatcher')
const { VideoMimeType } = require('../utils/constants')
const { parseDateToTimestampAndString } = require('../utils/parsers/parseInfoJsonMetadata')

class VideoManager {
  constructor() {
    this.ytDlpPath = null
    this.isAvailable = false
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
   * Get channel/playlist entries as pseudo-RSS episodes
   * @param {string} url
   * @param {number|null} [limit=null]
   * @returns {Promise<{metadata: Object, episodes: Array}>}
   */
  async getChannelFeed(url, limit = null) {
    if (!this.isAvailable) throw new Error('yt-dlp is not available')

    const args = [
      '--dump-json',
      '--no-download',
      '--flat-playlist'
    ]

    if (limit != null && Number(limit) > 0) {
      args.push('--playlist-end', String(limit))
    }

    args.push(url)

    return new Promise((resolve, reject) => {
      childProcess.execFile(
        this.ytDlpPath,
        args,
        {
          maxBuffer: 1024 * 1024 * 50
        },
        (error, stdout) => {
          if (error) return reject(error)

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

          if (!entries.length) return reject(new Error('No entries found'))

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
              entry.epoch ||
              entry.start_time
            let { publishedAt, pubDate } = parseDateToTimestampAndString(rawDate, rawTimestamp)

            // If date is still missing, attempt to extract date from entry title or description
            if (!publishedAt || !pubDate) {
              const fallbackDate = entry.title || entry.description || ''
              const parsedFallback = parseDateToTimestampAndString(fallbackDate)
              if (parsedFallback.publishedAt) {
                publishedAt = publishedAt || parsedFallback.publishedAt
                pubDate = pubDate || parsedFallback.pubDate
              }
            }
            const thumbnail = entry.thumbnails?.length
              ? entry.thumbnails[entry.thumbnails.length - 1].url
              : (entry.thumbnail || null)
            const season = entry.season_number != null ? String(entry.season_number) : null
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
              episode: episode || extracted.episode || '',
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

          resolve({ metadata, episodes, numEpisodes: episodes.length })
        }
      )
    })
  }
}

module.exports = VideoManager
