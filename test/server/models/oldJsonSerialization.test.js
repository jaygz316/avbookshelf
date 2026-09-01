const { expect } = require('chai')
const { Sequelize } = require('sequelize')

const Database = require('../../../server/Database')

/**
 * Assert that `expanded` contains every key from `minified` with matching values.
 * Used to enforce the contract: toOldJSONExpanded() is a strict superset of toOldJSONMinified().
 *
 * @param {object} minified
 * @param {object} expanded
 * @param {string} [path]
 */
function assertExpandedSuperset(minified, expanded, path = '') {
  for (const key of Object.keys(minified)) {
    const keyPath = path ? `${path}.${key}` : key
    expect(expanded, `missing key ${keyPath}`).to.have.property(key)

    const minifiedValue = minified[key]
    const expandedValue = expanded[key]

    if (minifiedValue !== null && typeof minifiedValue === 'object' && !Array.isArray(minifiedValue)) {
      assertExpandedSuperset(minifiedValue, expandedValue, keyPath)
    } else if (Array.isArray(minifiedValue)) {
      expect(expandedValue, `expected array at ${keyPath}`).to.be.an('array')
      expect(expandedValue).to.deep.equal(minifiedValue)
    } else {
      expect(expandedValue, `value mismatch at ${keyPath}`).to.equal(minifiedValue)
    }
  }
}

describe('old JSON serialization', () => {
  let bookLibraryItemId
  let podcastLibraryItemId

  beforeEach(async () => {
    global.ServerSettings = {}
    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()

    const bookLibrary = await Database.libraryModel.create({ name: 'Book Library', mediaType: 'book' })
    const bookLibraryFolder = await Database.libraryFolderModel.create({ path: '/books', libraryId: bookLibrary.id })

    const book = await Database.bookModel.create({
      title: 'Test Book',
      audioFiles: [{ index: 1, ino: '1', metadata: { filename: 'track.mp3', ext: '.mp3', path: '/track.mp3', relPath: 'track.mp3', size: 1000 } }],
      tags: ['fiction'],
      narrators: ['Narrator One'],
      genres: ['Fantasy'],
      chapters: [{ id: 0, start: 0, end: 100, title: 'Chapter 1' }],
      ebookFile: { ino: '2', metadata: { filename: 'book.epub', ext: '.epub', path: '/book.epub', relPath: 'book.epub', size: 500 }, ebookFormat: 'epub' }
    })
    const bookLibraryItem = await Database.libraryItemModel.create({
      libraryFiles: [{ ino: '1', metadata: { filename: 'track.mp3', ext: '.mp3', path: '/track.mp3', relPath: 'track.mp3' } }],
      mediaId: book.id,
      mediaType: 'book',
      libraryId: bookLibrary.id,
      libraryFolderId: bookLibraryFolder.id
    })
    bookLibraryItemId = bookLibraryItem.id

    const author = await Database.authorModel.create({ name: 'Test Author', libraryId: bookLibrary.id })
    await Database.bookAuthorModel.create({ bookId: book.id, authorId: author.id })

    const series = await Database.seriesModel.create({ name: 'Test Series', libraryId: bookLibrary.id })
    await Database.bookSeriesModel.create({ bookId: book.id, seriesId: series.id, sequence: '2' })

    const podcastLibrary = await Database.libraryModel.create({ name: 'Podcast Library', mediaType: 'podcast' })
    const podcastLibraryFolder = await Database.libraryFolderModel.create({ path: '/podcasts', libraryId: podcastLibrary.id })

    const podcast = await Database.podcastModel.create({
      title: 'Test Podcast',
      tags: ['news'],
      genres: ['Technology'],
      autoDownloadEpisodes: false
    })
    const podcastLibraryItem = await Database.libraryItemModel.create({
      libraryFiles: [],
      mediaId: podcast.id,
      mediaType: 'podcast',
      libraryId: podcastLibrary.id,
      libraryFolderId: podcastLibraryFolder.id
    })
    podcastLibraryItemId = podcastLibraryItem.id

    await Database.podcastEpisodeModel.create({
      podcastId: podcast.id,
      title: 'Episode 1',
      index: 1,
      audioFile: { ino: '3', metadata: { filename: 'ep1.mp3', ext: '.mp3', path: '/ep1.mp3', relPath: 'ep1.mp3' } }
    })

    await Database.podcastEpisodeModel.create({
      podcastId: podcast.id,
      title: 'Episode 2 (Video)',
      index: 2,
      episodeMediaType: 'video',
      videoFile: {
        ino: '4',
        metadata: { filename: 'ep2.mp4', ext: '.mp4', path: '/ep2.mp4', relPath: 'ep2.mp4', size: 50000000 },
        duration: 1200,
        mimeType: 'video/mp4',
        codec: 'h264',
        width: 1920,
        height: 1080
      }
    })
  })

  afterEach(async () => {
    await Database.sequelize.sync({ force: true })
  })

  describe('Book', () => {
    it('toOldJSONExpanded is a strict superset of toOldJSONMinified', async () => {
      const libraryItem = await Database.libraryItemModel.getExpandedById(bookLibraryItemId)
      const minified = libraryItem.media.toOldJSONMinified()
      const expanded = libraryItem.media.toOldJSONExpanded(libraryItem.id)

      assertExpandedSuperset(minified, expanded)

      expect(expanded).to.have.property('libraryItemId', libraryItem.id)
      expect(expanded).to.have.property('audioFiles')
      expect(expanded).to.have.property('chapters')
      expect(expanded).to.have.property('tracks')
      expect(expanded.numTracks).to.equal(expanded.tracks.length)
      expect(expanded.numAudioFiles).to.equal(expanded.audioFiles.length)
      expect(expanded.numChapters).to.equal(expanded.chapters.length)
      expect(expanded.ebookFormat).to.equal('epub')
    })
  })

  describe('Podcast', () => {
    it('toOldJSONExpanded is a strict superset of toOldJSONMinified', async () => {
      const libraryItem = await Database.libraryItemModel.getExpandedById(podcastLibraryItemId)
      const minified = libraryItem.media.toOldJSONMinified()
      const expanded = libraryItem.media.toOldJSONExpanded(libraryItem.id)

      assertExpandedSuperset(minified, expanded)

      expect(expanded).to.have.property('libraryItemId', libraryItem.id)
      expect(expanded).to.have.property('episodes')
      expect(expanded.numEpisodes).to.equal(expanded.episodes.length)

      const videoEp = expanded.episodes.find((e) => e.episodeMediaType === 'video')
      expect(videoEp).to.not.be.undefined
      expect(videoEp.videoFile).to.not.be.null
      expect(videoEp.videoTrack).to.not.be.undefined
      expect(videoEp.videoTrack.contentUrl).to.equal(`/api/items/${libraryItem.id}/file/4`)
      expect(videoEp.videoTrack.width).to.equal(1920)
      expect(videoEp.videoTrack.height).to.equal(1080)

      const videoEpisodeInstance = libraryItem.media.podcastEpisodes.find((e) => e.isVideo)
      expect(videoEpisodeInstance.isVideo).to.be.true
      expect(videoEpisodeInstance.duration).to.equal(1200)

      const trackList = libraryItem.media.getTracklist(libraryItem.id, videoEpisodeInstance.id)
      expect(trackList).to.have.lengthOf(1)
      expect(trackList[0].contentUrl).to.equal(`/api/items/${libraryItem.id}/file/4`)

      const canPlay = libraryItem.media.checkCanDirectPlay(['video/mp4'], videoEpisodeInstance.id)
      expect(canPlay).to.be.true
      const cannotPlay = libraryItem.media.checkCanDirectPlay(['audio/mpeg'], videoEpisodeInstance.id)
      expect(cannotPlay).to.be.false

      expect(minified).to.have.property('maxDownloadResolution', 'best')
      expect(expanded).to.have.property('maxDownloadResolution', 'best')
      expect(minified.metadata).to.have.property('maxDownloadResolution', 'best')
      expect(expanded.metadata).to.have.property('maxDownloadResolution', 'best')
      expect(libraryItem.media.getAbsMetadataJson()).to.have.property('maxDownloadResolution', 'best')
    })

    it('createFromRequest and updateFromRequest should handle maxDownloadResolution', async () => {
      const created = await Database.podcastModel.createFromRequest({
        metadata: {
          title: 'Quality Test Podcast',
          maxDownloadResolution: '720p'
        }
      })
      expect(created.maxDownloadResolution).to.equal('720p')
      expect(created.oldMetadataToJSON().maxDownloadResolution).to.equal('720p')

      const updated = await created.updateFromRequest({
        metadata: {
          maxDownloadResolution: '1080p'
        }
      })
      expect(updated).to.be.true
      expect(created.maxDownloadResolution).to.equal('1080p')
    })
  })

  describe('LibraryItem', () => {
    it('book library item expanded is a strict superset of minified', async () => {
      const libraryItem = await Database.libraryItemModel.getExpandedById(bookLibraryItemId)
      const minified = libraryItem.toOldJSONMinified()
      const expanded = libraryItem.toOldJSONExpanded()

      assertExpandedSuperset(minified, expanded)

      expect(expanded).to.have.property('libraryFiles')
      expect(expanded).to.have.property('lastScan')
      expect(expanded.numFiles).to.equal(expanded.libraryFiles.length)
      expect(expanded.media.numTracks).to.equal(expanded.media.tracks.length)
    })

    it('podcast library item expanded is a strict superset of minified', async () => {
      const libraryItem = await Database.libraryItemModel.getExpandedById(podcastLibraryItemId)
      const minified = libraryItem.toOldJSONMinified()
      const expanded = libraryItem.toOldJSONExpanded()

      assertExpandedSuperset(minified, expanded)

      expect(expanded).to.have.property('libraryFiles')
      expect(expanded.media.numEpisodes).to.equal(expanded.media.episodes.length)
    })
  })
})
