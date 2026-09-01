const childProcess = require('child_process')
const Path = require('path')
const Logger = require('../Logger')
const which = require('../utils/which')
const { extractEpisodeNumbers } = require('./VideoEpisodeMatcher')
const { VideoMimeType } = require('../utils/constants')

class VideoManager {
  constructor() {
    this.ytDlpPath = null
    this.isAvailable = false
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
      '-f',
      format,
      '--merge-output-format',
      'mp4',
      '--write-info-json',
      '--write-thumbnail',
      '--convert-thumbnails',
      'jpg',
      '-o',
      outputTemplate,
      '--print',
      'after_move:filepath',
      '--progress',
      '--newline',
      url
    ]

    return new Promise((resolve, reject) => {
      const proc = childProcess.spawn(this.ytDlpPath, args)

      let stdoutBuffer = ''

      proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          const pctMatch = trimmed.match(/\[download\]\s+([\d.]+)%/)
          if (pctMatch && onProgress) {
            const speedMatch = trimmed.match(/at\s+([\d.]+\s*\S+\/s)/)
            const etaMatch = trimmed.match(/ETA\s+(\S+)/)
            onProgress({
              percent: parseFloat(pctMatch[1]),
              speed: speedMatch ? speedMatch[1].trim() : null,
              eta: etaMatch ? etaMatch[1] : null
            })
          } else {
            stdoutBuffer += trimmed + '\n'
          }
        }
      })

      proc.stderr.on('data', (data) => {
        const lines = data.toString().split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          const pctMatch = trimmed.match(/\[download\]\s+([\d.]+)%/)
          if (pctMatch) {
            if (onProgress) {
              const speedMatch = trimmed.match(/at\s+([\d.]+\s*\S+\/s)/)
              const etaMatch = trimmed.match(/ETA\s+(\S+)/)
              onProgress({
                percent: parseFloat(pctMatch[1]),
                speed: speedMatch ? speedMatch[1].trim() : null,
                eta: etaMatch ? etaMatch[1] : null
              })
            }
          } else {
            Logger.debug(`[VideoManager] ${trimmed}`)
          }
        }
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          const err = new Error(`yt-dlp exited with code ${code}`)
          Logger.error(`[VideoManager] Download failed: ${err.message}`)
          return reject(err)
        }
        const filepath = stdoutBuffer.trim().split('\n').pop().trim()
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
   * @param {number} [limit=50]
   * @returns {Promise<{metadata: Object, episodes: Array}>}
   */
  async getChannelFeed(url, limit = 50) {
    if (!this.isAvailable) throw new Error('yt-dlp is not available')

    const args = [
      '--dump-json',
      '--no-download',
      '--flat-playlist',
      '--playlist-end',
      String(limit),
      url
    ]

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
            const pubDate = entry.upload_date ? `${entry.upload_date.slice(0, 4)}-${entry.upload_date.slice(4, 6)}-${entry.upload_date.slice(6, 8)}` : ''
            const publishedAt = entry.timestamp ? entry.timestamp * 1000 : (entry.upload_date ? new Date(pubDate || entry.upload_date).valueOf() : null)
            const thumbnail = entry.thumbnails?.length
              ? entry.thumbnails[entry.thumbnails.length - 1].url
              : (entry.thumbnail || null)
            const season = entry.season_number != null ? String(entry.season_number) : null
            const episode = entry.episode_number != null ? String(entry.episode_number) : null
            const extracted = (!season && !episode) ? extractEpisodeNumbers(entry.title || '') : {}

            return {
              title: entry.title || 'Untitled',
              subtitle: '',
              description: entry.description || '',
              descriptionPlain: entry.description || '',
              pubDate,
              episodeType: 'full',
              season: season || extracted.season || '',
              episode: episode || extracted.episode || '',
              author: entry.uploader || entry.channel || metadata.author || '',
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
              chapters: []
            }
          })

          resolve({ metadata, episodes, numEpisodes: episodes.length })
        }
      )
    })
  }
}

module.exports = VideoManager
