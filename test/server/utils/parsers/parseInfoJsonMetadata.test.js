const { expect } = require('chai')
const { parseDateToTimestampAndString, parseInfoJsonMetadata } = require('../../../../server/utils/parsers/parseInfoJsonMetadata')

describe('parseInfoJsonMetadata', () => {
  describe('parseDateToTimestampAndString', () => {
    it('should parse YYYYMMDD string format correctly', () => {
      const res = parseDateToTimestampAndString('20230514')
      expect(res.pubDate).to.equal('2023-05-14')
      expect(res.publishedAt).to.equal(Date.UTC(2023, 4, 14))
    })

    it('should parse epoch timestamp in seconds correctly', () => {
      const timestampSec = 1684022400
      const res = parseDateToTimestampAndString(null, timestampSec)
      expect(res.publishedAt).to.equal(1684022400000)
      expect(res.pubDate).to.equal('2023-05-14')
    })

    it('should parse numeric rawDate in seconds or milliseconds', () => {
      const resSec = parseDateToTimestampAndString(1684022400)
      expect(resSec.publishedAt).to.equal(1684022400000)

      const resMs = parseDateToTimestampAndString(1684022400000)
      expect(resMs.publishedAt).to.equal(1684022400000)
    })

    it('should parse standard ISO date string', () => {
      const res = parseDateToTimestampAndString('2023-05-14T12:00:00Z')
      expect(res.publishedAt).to.equal(new Date('2023-05-14T12:00:00Z').valueOf())
      expect(res.pubDate).to.equal('2023-05-14')
    })

    it('should parse YYYY-MM-DD, YYYY/MM/DD, and YYYY.MM.DD strings', () => {
      const res1 = parseDateToTimestampAndString('2024-06-20')
      expect(res1.pubDate).to.equal('2024-06-20')
      expect(res1.publishedAt).to.equal(Date.UTC(2024, 5, 20))

      const res2 = parseDateToTimestampAndString('2024/06/20')
      expect(res2.pubDate).to.equal('2024-06-20')
      expect(res2.publishedAt).to.equal(Date.UTC(2024, 5, 20))

      const res3 = parseDateToTimestampAndString('2024.06.20')
      expect(res3.pubDate).to.equal('2024-06-20')
      expect(res3.publishedAt).to.equal(Date.UTC(2024, 5, 20))
    })

    it('should parse 4-digit year format', () => {
      const res1 = parseDateToTimestampAndString('2025')
      expect(res1.pubDate).to.equal('2025-01-01')
      expect(res1.publishedAt).to.equal(Date.UTC(2025, 0, 1))

      const res2 = parseDateToTimestampAndString(2025)
      expect(res2.pubDate).to.equal('2025-01-01')
      expect(res2.publishedAt).to.equal(Date.UTC(2025, 0, 1))
    })

    it('should parse string timestamp in seconds or ms', () => {
      const res1 = parseDateToTimestampAndString('1684022400')
      expect(res1.publishedAt).to.equal(1684022400000)
      expect(res1.pubDate).to.equal('2023-05-14')

      const res2 = parseDateToTimestampAndString('1684022400000')
      expect(res2.publishedAt).to.equal(1684022400000)
      expect(res2.pubDate).to.equal('2023-05-14')
    })

    it('should extract embedded date pattern from filename or title string', () => {
      const res1 = parseDateToTimestampAndString('My Show - 2024-08-15 - Episode 1')
      expect(res1.pubDate).to.equal('2024-08-15')
      expect(res1.publishedAt).to.equal(Date.UTC(2024, 7, 15))

      const res2 = parseDateToTimestampAndString('My Show 2024.08.15 Episode 1')
      expect(res2.pubDate).to.equal('2024-08-15')
      expect(res2.publishedAt).to.equal(Date.UTC(2024, 7, 15))
    })

    it('should return null and empty string for invalid dates', () => {
      const res1 = parseDateToTimestampAndString(null)
      expect(res1.publishedAt).to.be.null
      expect(res1.pubDate).to.equal('')

      const res2 = parseDateToTimestampAndString('invalid_date')
      expect(res2.publishedAt).to.be.null
      expect(res2.pubDate).to.equal('')
    })
  })

  describe('parseInfoJsonMetadata', () => {
    it('should return null for empty input', () => {
      expect(parseInfoJsonMetadata(null)).to.be.null
      expect(parseInfoJsonMetadata('')).to.be.null
      expect(parseInfoJsonMetadata('invalid json')).to.be.null
    })

    it('should parse full yt-dlp .info.json payload', () => {
      const info = {
        id: 'dQw4w9WgXcQ',
        title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
        description: 'The official video for Never Gonna Give You Up by Rick Astley',
        upload_date: '20091025',
        timestamp: 1256469440,
        uploader: 'Rick Astley',
        uploader_id: '@RickAstleyYT',
        channel: 'Rick Astley',
        channel_id: 'UCuAXFkgsw1L7xaCfnd5JJOw',
        duration: 213,
        thumbnails: [
          { url: 'https://img.youtube.com/vi/small.jpg' },
          { url: 'https://img.youtube.com/vi/maxresdefault.jpg' }
        ],
        tags: ['Rick Astley', 'Pop'],
        categories: ['Music'],
        webpage_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        chapters: [
          { start_time: 0.0, end_time: 30.0, title: 'Intro' },
          { start_time: 30.0, end_time: 213.0, title: 'Main' }
        ],
        season_number: 1,
        episode_number: 1
      }

      const parsed = parseInfoJsonMetadata(info)
      expect(parsed).to.not.be.null
      expect(parsed.title).to.equal('Rick Astley - Never Gonna Give You Up (Official Music Video)')
      expect(parsed.author).to.equal('Rick Astley')
      expect(parsed.subtitle).to.equal('Rick Astley')
      expect(parsed.description).to.equal('The official video for Never Gonna Give You Up by Rick Astley')
      expect(parsed.publishedAt).to.equal(1256469440000)
      expect(parsed.pubDate).to.equal('2009-10-25')
      expect(parsed.durationSeconds).to.equal(213)
      expect(parsed.thumbnail).to.equal('https://img.youtube.com/vi/maxresdefault.jpg')
      expect(parsed.season).to.equal('1')
      expect(parsed.episode).to.equal('1')
      expect(parsed.chapters).to.deep.equal([
        { id: 0, start: 0.0, end: 30.0, title: 'Intro' },
        { id: 1, start: 30.0, end: 213.0, title: 'Main' }
      ])
      expect(parsed.tags).to.deep.equal(['Rick Astley', 'Pop'])
      expect(parsed.categories).to.deep.equal(['Music'])
      expect(parsed.guid).to.equal('dQw4w9WgXcQ')
      expect(parsed.extraData.uploaderId).to.equal('@RickAstleyYT')
      expect(parsed.extraData.channelId).to.equal('UCuAXFkgsw1L7xaCfnd5JJOw')
    })

    it('should parse dates from published_at, release_date, and published_timestamp', () => {
      const info1 = {
        title: 'Video with published_at',
        published_at: '2025-07-04T10:00:00Z'
      }
      const parsed1 = parseInfoJsonMetadata(info1)
      expect(parsed1.pubDate).to.equal('2025-07-04')
      expect(parsed1.publishedAt).to.equal(new Date('2025-07-04T10:00:00Z').valueOf())

      const info2 = {
        title: 'Video with release_date and release_timestamp',
        release_date: '20250801',
        release_timestamp: 1754049600
      }
      const parsed2 = parseInfoJsonMetadata(info2)
      expect(parsed2.pubDate).to.equal('2025-08-01')
      expect(parsed2.publishedAt).to.equal(1754049600000)
    })

    it('should extract episode number from title when not in json fields', () => {
      const info = {
        title: 'Tech Show - Episode 42 (Season 3)',
        upload_date: '20260215'
      }

      const parsed = parseInfoJsonMetadata(info)
      expect(parsed.episode).to.equal('42')
      expect(parsed.season).to.equal('3')
      expect(parsed.pubDate).to.equal('2026-02-15')
      expect(parsed.publishedAt).to.equal(Date.UTC(2026, 1, 15))
    })

    it('should handle JSON string input', () => {
      const jsonStr = JSON.stringify({
        id: 'test1234',
        title: 'Video Title',
        upload_date: '20260101',
        description: 'Test description'
      })

      const parsed = parseInfoJsonMetadata(jsonStr)
      expect(parsed.title).to.equal('Video Title')
      expect(parsed.publishedAt).to.equal(Date.UTC(2026, 0, 1))
      expect(parsed.pubDate).to.equal('2026-01-01')
    })
  })
})
