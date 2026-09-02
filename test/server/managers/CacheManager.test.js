const { expect } = require('chai')
const sinon = require('sinon')
const { Readable, Writable } = require('stream')
const CacheManager = require('../../../server/managers/CacheManager')
const fs = require('../../../server/libs/fsExtra')
const Database = require('../../../server/Database')
const ffmpegHelpers = require('../../../server/utils/ffmpegHelpers')

describe('CacheManager', function () {
  let mockRes
  let fakeReadStream
  let mockLibraryItemModel
  let mockAuthorModel

  beforeEach(function () {
    CacheManager.CoverCachePath = '/metadata/cache/covers'
    CacheManager.ImageCachePath = '/metadata/cache/images'

    mockRes = new Writable({
      write(chunk, encoding, callback) {
        callback()
      }
    })
    mockRes.type = sinon.stub()
    mockRes.sendStatus = sinon.stub()
    mockRes.status = sinon.stub().returns({ header: sinon.stub().returns({ send: sinon.stub() }) })
    mockRes.headersSent = false

    fakeReadStream = new Readable({
      read() {
        this.push(null)
      }
    })
    sinon.spy(fakeReadStream, 'pipe')

    mockLibraryItemModel = {
      getCoverPath: sinon.stub().resolves('/books/Book1/cover.jpg')
    }
    mockAuthorModel = {
      findByPk: sinon.stub().resolves({ imagePath: '/authors/author1.jpg' })
    }

    sinon.stub(Database, 'libraryItemModel').get(() => mockLibraryItemModel)
    sinon.stub(Database, 'authorModel').get(() => mockAuthorModel)
  })

  afterEach(function () {
    sinon.restore()
  })

  describe('handleCoverCache', function () {
    it('should handle cached cover and attach error handler to readStream', async function () {
      sinon.stub(fs, 'pathExists').resolves(true)
      sinon.stub(fs, 'createReadStream').returns(fakeReadStream)

      await CacheManager.handleCoverCache(mockRes, 'item-1')

      expect(mockRes.type.calledWith('image/webp')).to.be.true
      expect(fakeReadStream.pipe.calledWith(mockRes)).to.be.true
      expect(fakeReadStream.listenerCount('error')).to.be.greaterThan(0)
    })

    it('should handle uncached cover generation and attach error handler to readStream', async function () {
      sinon.stub(fs, 'pathExists').callsFake(async (path) => {
        if (path.includes('cache')) return false
        return true
      })
      sinon.stub(ffmpegHelpers, 'resizeImage').resolves('/cache/covers/item-1_400.webp')
      sinon.stub(fs, 'createReadStream').returns(fakeReadStream)

      await CacheManager.handleCoverCache(mockRes, 'item-1')

      expect(fakeReadStream.pipe.calledWith(mockRes)).to.be.true
      expect(fakeReadStream.listenerCount('error')).to.be.greaterThan(0)
    })
  })

  describe('handleAuthorCache', function () {
    it('should handle cached author image and attach error handler to readStream', async function () {
      sinon.stub(fs, 'pathExists').resolves(true)
      sinon.stub(fs, 'createReadStream').returns(fakeReadStream)

      await CacheManager.handleAuthorCache(mockRes, 'author-1')

      expect(mockRes.type.calledWith('image/webp')).to.be.true
      expect(fakeReadStream.pipe.calledWith(mockRes)).to.be.true
      expect(fakeReadStream.listenerCount('error')).to.be.greaterThan(0)
    })

    it('should handle uncached author image generation and attach error handler to readStream', async function () {
      sinon.stub(fs, 'pathExists').callsFake(async (path) => {
        if (path.includes('cache')) return false
        return true
      })
      sinon.stub(ffmpegHelpers, 'resizeImage').resolves('/cache/images/author-1_400.webp')
      sinon.stub(fs, 'createReadStream').returns(fakeReadStream)

      await CacheManager.handleAuthorCache(mockRes, 'author-1')

      expect(fakeReadStream.pipe.calledWith(mockRes)).to.be.true
      expect(fakeReadStream.listenerCount('error')).to.be.greaterThan(0)
    })
  })
})
