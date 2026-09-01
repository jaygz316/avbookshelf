const Path = require('path')
const uuidv4 = require('uuid').v4
const { sanitizeFilename, filePathToPOSIX } = require('../utils/fileUtils')
const globals = require('../utils/globals')

class PodcastEpisodeDownload {
  constructor() {
    this.id = null
    /** @type {import('../utils/podcastUtils').RssPodcastEpisode} */
    this.rssPodcastEpisode = null

    this.url = null
    /** @type {import('../models/LibraryItem')} */
    this.libraryItem = null
    this.libraryId = null

    this.isAutoDownload = false
    this.isFinished = false
    this.failed = false

    this.appendRandomId = false

    this.targetFilename = null

    this.startedAt = null
    this.createdAt = null
    this.finishedAt = null

    this.progress = null // 0-100 percent
    this.progressSpeed = null // e.g. '5.23MiB/s'
    this.progressEta = null // e.g. '00:05'
  }

  toJSONForClient() {
    return {
      id: this.id,
      episodeDisplayTitle: this.rssPodcastEpisode?.title ?? null,
      url: this.url,
      libraryItemId: this.libraryItemId,
      libraryId: this.libraryId || null,
      isFinished: this.isFinished,
      failed: this.failed,
      appendRandomId: this.appendRandomId,
      startedAt: this.startedAt,
      createdAt: this.createdAt,
      finishedAt: this.finishedAt,
      podcastTitle: this.libraryItem?.media.title ?? null,
      podcastExplicit: !!this.libraryItem?.media.explicit,
      season: this.rssPodcastEpisode?.season ?? null,
      episode: this.rssPodcastEpisode?.episode ?? null,
      episodeType: this.rssPodcastEpisode?.episodeType ?? 'full',
      publishedAt: this.rssPodcastEpisode?.publishedAt ?? null,
      guid: this.rssPodcastEpisode?.guid ?? null,
      progress: this.progress,
      progressSpeed: this.progressSpeed,
      progressEta: this.progressEta
    }
  }

  get urlFileExtension() {
    if (!this.url || typeof this.url !== 'string') return ''
    const cleanUrl = this.url.split('?')[0] // Remove query string
    return Path.extname(cleanUrl).substring(1).toLowerCase()
  }
  get isVideo() {
    return this.rssPodcastEpisode?.isVideo || false
  }
  get fileExtension() {
    const extname = this.urlFileExtension
    if (globals.SupportedAudioTypes.includes(extname)) return extname
    if (globals.SupportedVideoTypes?.includes(extname)) return extname
    return this.isVideo ? 'mp4' : 'mp3'
  }
  get enclosureType() {
    const enclosureType = this.rssPodcastEpisode?.enclosure?.type
    return typeof enclosureType === 'string' ? enclosureType : null
  }
  get episodeTitle() {
    return this.rssPodcastEpisode?.title || ''
  }
  get targetPath() {
    if (!this.libraryItem?.path || !this.targetFilename) return null
    return filePathToPOSIX(Path.join(this.libraryItem.path, this.targetFilename))
  }
  set targetPath(val) {
    if (val && this.libraryItem?.path) {
      this.targetFilename = Path.basename(val)
    }
  }
  get targetRelPath() {
    return this.targetFilename
  }
  get libraryItemId() {
    return this.libraryItem?.id || null
  }
  get pubYear() {
    if (!this.rssPodcastEpisode?.publishedAt) return null
    return new Date(this.rssPodcastEpisode.publishedAt).getFullYear()
  }

  /**
   * @param {string} title
   */
  getSanitizedFilename(title) {
    const appendage = this.appendRandomId ? ` (${this.id})` : ''
    const filename = `${(title || '').trim()}${appendage}.${this.fileExtension}`
    return sanitizeFilename(filename)
  }

  /**
   * @param {boolean} appendRandomId
   */
  setAppendRandomId(appendRandomId) {
    this.appendRandomId = appendRandomId
    this.targetFilename = this.getSanitizedFilename(this.rssPodcastEpisode?.title || '')
  }

  /**
   *
   * @param {import('../utils/podcastUtils').RssPodcastEpisode} rssPodcastEpisode - from rss feed
   * @param {import('../models/LibraryItem')} libraryItem
   * @param {*} isAutoDownload
   * @param {*} libraryId
   */
  setData(rssPodcastEpisode, libraryItem, isAutoDownload, libraryId) {
    this.id = uuidv4()
    this.rssPodcastEpisode = rssPodcastEpisode

    const url = rssPodcastEpisode?.enclosure?.url || rssPodcastEpisode?.url || ''
    if (url && typeof url === 'string') {
      if (decodeURIComponent(url) !== url) {
        // Already encoded
        this.url = url
      } else {
        this.url = encodeURI(url)
      }
    } else {
      this.url = ''
    }

    this.targetFilename = this.getSanitizedFilename(this.rssPodcastEpisode?.title || '')

    this.libraryItem = libraryItem
    this.isAutoDownload = isAutoDownload
    this.createdAt = Date.now()
    this.libraryId = libraryId
  }

  setFinished(success) {
    this.finishedAt = Date.now()
    this.isFinished = true
    this.failed = !success
  }

  setProgress(percent, speed, eta) {
    this.progress = percent
    this.progressSpeed = speed || null
    this.progressEta = eta || null
  }
}
module.exports = PodcastEpisodeDownload
