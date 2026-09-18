const Path = require('path')
const chai = require('chai')
const expect = chai.expect
const scanUtils = require('../../../server/utils/scandir')

describe('scanUtils', async () => {
  it('should properly group files into potential book library items', async () => {
    global.isWin = process.platform === 'win32'
    global.ServerSettings = {
      scannerParseSubtitle: true
    }

    const filePaths = [
      'randomfile.txt', // Should be ignored because it's not a book media file
      'Book1.m4b', // Root single file audiobook
      'Book2/audiofile.m4b',
      'Book2/disk 001/audiofile.m4b',
      'Book2/disk 002/audiofile.m4b',
      'Author/Book3/audiofile.mp3',
      'Author/Book3/Disc 1/audiofile.mp3',
      'Author/Book3/Disc 2/audiofile.mp3',
      'Author/Series/Book4/cover.jpg',
      'Author/Series/Book4/CD1/audiofile.mp3',
      'Author/Series/Book4/CD2/audiofile.mp3',
      'Author/Series2/Book5/deeply/nested/cd 01/audiofile.mp3',
      'Author/Series2/Book5/deeply/nested/cd 02/audiofile.mp3',
      'Author/Series2/Book5/randomfile.js' // Should be ignored because it's not a book media file
    ]

    // Create fileItems to match the format of fileUtils.recurseFiles
    const fileItems = []
    for (const filePath of filePaths) {
      const dirname = Path.dirname(filePath)
      fileItems.push({
        name: Path.basename(filePath),
        reldirpath: dirname === '.' ? '' : dirname,
        extension: Path.extname(filePath),
        deep: filePath.split('/').length - 1
      })
    }

    const libraryItemGrouping = scanUtils.groupFileItemsIntoLibraryItemDirs('book', fileItems, false)

    expect(libraryItemGrouping).to.deep.equal({
      'Book1.m4b': 'Book1.m4b',
      Book2: ['audiofile.m4b', 'disk 001/audiofile.m4b', 'disk 002/audiofile.m4b'],
      'Author/Book3': ['audiofile.mp3', 'Disc 1/audiofile.mp3', 'Disc 2/audiofile.mp3'],
      'Author/Series/Book4': ['CD1/audiofile.mp3', 'CD2/audiofile.mp3', 'cover.jpg'],
      'Author/Series2/Book5/deeply/nested': ['cd 01/audiofile.mp3', 'cd 02/audiofile.mp3']
    })
  })

  describe('getBookDataFromDir', () => {
    it('should parse author, series, title, and publishedYear without strict mode reference errors', () => {
      const data = scanUtils.getBookDataFromDir('J.K. Rowling/Harry Potter/2001 - Harry Potter and the Sorcerer\'s Stone')
      expect(data.seriesName).to.equal('Harry Potter')
      expect(data.authors).to.deep.equal(['J.K. Rowling'])
      expect(data.title).to.equal('Harry Potter and the Sorcerer\'s Stone')
      expect(data.publishedYear).to.equal('2001')
    })

    it('should handle single directory without throwing reference errors', () => {
      const data = scanUtils.getBookDataFromDir('Standalone Audiobook')
      expect(data.seriesName).to.be.null
      expect(data.authors).to.deep.equal([])
      expect(data.title).to.equal('Standalone Audiobook')
    })
  })

  describe('getPublishedYear', () => {
    it('should extract published year using regex pattern', () => {
      const [folder, year] = scanUtils.getPublishedYear('1999 - Some Great Book')
      expect(year).to.equal('1999')
      expect(folder).to.equal('Some Great Book')
    })
  })
})

