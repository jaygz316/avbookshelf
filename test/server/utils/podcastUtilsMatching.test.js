const { expect } = require('chai')
const {
  extractEpisodeNumbers,
  cleanTitleForMatching,
  scoreEpisodeMatch,
  matchYouTubeEpisodesWithItunesFeed
} = require('../../../server/utils/podcastUtils')

describe('podcastUtils Episode Extraction & Matching', () => {
  describe('extractEpisodeNumbers', () => {
    it('should extract episode and season from S01E02 format', () => {
      expect(extractEpisodeNumbers('Show Name S02E05: The Title')).to.deep.equal({ season: '2', episode: '5' })
      expect(extractEpisodeNumbers('Podcast s1e12 - Another Title')).to.deep.equal({ season: '1', episode: '12' })
      expect(extractEpisodeNumbers('Season 3 Episode 14 - Dark Waters')).to.deep.equal({ season: '3', episode: '14' })
    })

    it('should extract episode from #123 or Ep 123 formats', () => {
      expect(extractEpisodeNumbers('Joe Rogan Experience #2100 - Graham Hancock')).to.deep.equal({ season: '', episode: '2100' })
      expect(extractEpisodeNumbers('Lex Fridman Podcast #400 - Yann LeCun')).to.deep.equal({ season: '', episode: '400' })
      expect(extractEpisodeNumbers('Ep. 45 - Why We Sleep')).to.deep.equal({ season: '', episode: '45' })
      expect(extractEpisodeNumbers('Episode 12 | The Art of Strategy')).to.deep.equal({ season: '', episode: '12' })
      expect(extractEpisodeNumbers('Show Title (Ep 99)')).to.deep.equal({ season: '', episode: '99' })
    })

    it('should extract prefix or suffix numbers', () => {
      expect(extractEpisodeNumbers('142. What\'s Next for AI')).to.deep.equal({ season: '', episode: '142' })
      expect(extractEpisodeNumbers('The Big Story - 88')).to.deep.equal({ season: '', episode: '88' })
    })

    it('should return empty strings when no numbers found', () => {
      expect(extractEpisodeNumbers('A Video Without Episode Number')).to.deep.equal({ season: '', episode: '' })
      expect(extractEpisodeNumbers(null)).to.deep.equal({ season: '', episode: '' })
    })
  })

  describe('cleanTitleForMatching', () => {
    it('should strip podcast title, episode tags, brackets, and special characters', () => {
      const cleaned = cleanTitleForMatching('Joe Rogan Experience #2100 - Graham Hancock [Video]', 'The Joe Rogan Experience')
      expect(cleaned).to.include('graham hancock')
      expect(cleaned).to.not.include('2100')
      expect(cleaned).to.not.include('video')
    })
  })

  describe('scoreEpisodeMatch', () => {
    it('should score high when episode numbers and titles match', () => {
      const ytEp = {
        title: 'Joe Rogan Experience #2100 - Graham Hancock',
        publishedAt: new Date('2024-03-15T18:00:00Z').valueOf(),
        durationSeconds: 7200
      }
      const itunesEp = {
        title: '#2100 - Graham Hancock',
        episode: '2100',
        publishedAt: new Date('2024-03-15T14:30:00Z').valueOf(),
        durationSeconds: 7180
      }

      const score = scoreEpisodeMatch(ytEp, itunesEp, 'The Joe Rogan Experience')
      expect(score).to.be.greaterThan(0.9)
    })

    it('should match by date proximity and fuzzy title when episode numbers are missing', () => {
      const ytEp = {
        title: 'The Future of Artificial Intelligence with Sam Altman',
        publishedAt: new Date('2024-04-10T12:00:00Z').valueOf(),
        durationSeconds: 3600
      }
      const itunesEp = {
        title: 'Sam Altman on the Future of AI',
        publishedAt: new Date('2024-04-10T10:00:00Z').valueOf(),
        durationSeconds: 3580
      }

      const score = scoreEpisodeMatch(ytEp, itunesEp)
      expect(score).to.be.greaterThan(0.5)
    })
  })

  describe('matchYouTubeEpisodesWithItunesFeed', () => {
    it('should match, enrich, and sort YouTube episodes with iTunes episodes', () => {
      const ytEpisodes = [
        {
          title: 'Podcast Show #101 - First Topic',
          pubDate: '2024-01-01',
          publishedAt: new Date('2024-01-01T00:00:00Z').valueOf(),
          enclosure: { url: 'https://youtube.com/watch?v=yt1' },
          durationSeconds: 3600
        },
        {
          title: 'Podcast Show #103 - Third Topic',
          pubDate: '2024-01-15',
          publishedAt: new Date('2024-01-15T00:00:00Z').valueOf(),
          enclosure: { url: 'https://youtube.com/watch?v=yt3' },
          durationSeconds: 4000
        },
        {
          title: 'Podcast Show #102 - Second Topic',
          pubDate: '2024-01-08',
          publishedAt: new Date('2024-01-08T00:00:00Z').valueOf(),
          enclosure: { url: 'https://youtube.com/watch?v=yt2' },
          durationSeconds: 3800
        }
      ]

      const itunesEpisodes = [
        {
          title: '101: First Topic',
          episode: '101',
          season: '1',
          pubDate: 'Mon, 01 Jan 2024 15:30:00 GMT',
          publishedAt: new Date('2024-01-01T15:30:00Z').valueOf(),
          description: 'Official notes for 101',
          durationSeconds: 3590,
          guid: 'guid-101'
        },
        {
          title: '102: Second Topic',
          episode: '102',
          season: '1',
          pubDate: 'Mon, 08 Jan 2024 16:00:00 GMT',
          publishedAt: new Date('2024-01-08T16:00:00Z').valueOf(),
          description: 'Official notes for 102',
          durationSeconds: 3790,
          guid: 'guid-102'
        },
        {
          title: '103: Third Topic',
          episode: '103',
          season: '1',
          pubDate: 'Mon, 15 Jan 2024 14:00:00 GMT',
          publishedAt: new Date('2024-01-15T14:00:00Z').valueOf(),
          description: 'Official notes for 103',
          durationSeconds: 3995,
          guid: 'guid-103'
        }
      ]

      const result = matchYouTubeEpisodesWithItunesFeed(ytEpisodes, itunesEpisodes, { podcastTitle: 'Podcast Show' })
      expect(result.matchedCount).to.equal(3)
      expect(result.totalCount).to.equal(3)
      expect(result.matchedEpisodes).to.have.length(3)

      // Episodes should be ordered newest publishedAt first (#103, #102, #101)
      expect(result.matchedEpisodes[0].episode).to.equal('103')
      expect(result.matchedEpisodes[0].season).to.equal('1')
      expect(result.matchedEpisodes[0].itunesMatched).to.be.true
      expect(result.matchedEpisodes[0].enclosure.url).to.equal('https://youtube.com/watch?v=yt3')
      expect(result.matchedEpisodes[0].description).to.equal('Official notes for 103')

      expect(result.matchedEpisodes[1].episode).to.equal('102')
      expect(result.matchedEpisodes[1].enclosure.url).to.equal('https://youtube.com/watch?v=yt2')

      expect(result.matchedEpisodes[2].episode).to.equal('101')
      expect(result.matchedEpisodes[2].enclosure.url).to.equal('https://youtube.com/watch?v=yt1')
    })

    it('should only use iTunes for episode information and details matching, preserving video enclosure', () => {
      const ytEpisodes = [
        {
          title: 'Episode 50 - Big Video Episode',
          pubDate: '2024-02-01',
          publishedAt: new Date('2024-02-01T00:00:00Z').valueOf(),
          enclosure: { url: 'https://youtube.com/watch?v=video50', type: 'video/mp4' },
          isVideo: true,
          isYtDlp: true,
          durationSeconds: 1800
        }
      ]

      const itunesEpisodes = [
        {
          title: '50: Big Video Episode (Official)',
          episode: '50',
          season: '2',
          pubDate: 'Thu, 01 Feb 2024 10:00:00 GMT',
          publishedAt: new Date('2024-02-01T10:00:00Z').valueOf(),
          description: 'Official iTunes show notes',
          descriptionPlain: 'Official iTunes show notes plain',
          subtitle: 'Official subtitle',
          enclosure: { url: 'https://cdn.libsyn.com/audio/audio50.mp3', type: 'audio/mpeg' },
          durationSeconds: 1795,
          guid: 'itunes-guid-50',
          chapters: [{ id: 1, title: 'Intro', start: 0, end: 60 }]
        }
      ]

      const result = matchYouTubeEpisodesWithItunesFeed(ytEpisodes, itunesEpisodes, { podcastTitle: 'Show' })
      expect(result.matchedCount).to.equal(1)
      const matched = result.matchedEpisodes[0]

      // iTunes metadata should be enriched
      expect(matched.canonicalTitle).to.equal('50: Big Video Episode (Official)')
      expect(matched.season).to.equal('2')
      expect(matched.episode).to.equal('50')
      expect(matched.description).to.equal('Official iTunes show notes')
      expect(matched.subtitle).to.equal('Official subtitle')
      expect(matched.chapters).to.have.length(1)
      expect(matched.itunesGuid).to.equal('itunes-guid-50')
      expect(matched.itunesMatched).to.be.true

      // Video download URL and flags must remain untouched
      expect(matched.enclosure.url).to.equal('https://youtube.com/watch?v=video50')
      expect(matched.enclosure.type).to.equal('video/mp4')
      expect(matched.isVideo).to.be.true
      expect(matched.isYtDlp).to.be.true
    })
  })
})
