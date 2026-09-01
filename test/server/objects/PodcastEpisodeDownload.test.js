const { expect } = require('chai')
const PodcastEpisodeDownload = require('../../../server/objects/PodcastEpisodeDownload')

describe('PodcastEpisodeDownload', () => {
  it('should safely handle missing or undefined url without throwing', () => {
    const dl = new PodcastEpisodeDownload()
    expect(dl.urlFileExtension).to.equal('')
    expect(dl.fileExtension).to.equal('mp3')

    const mockItem = { id: 'lib-1', path: '/media/podcasts/test' }
    const mockEpisode = {
      title: 'Episode Without URL',
      enclosure: null
    }

    expect(() => {
      dl.setData(mockEpisode, mockItem, false, 'lib-1')
    }).to.not.throw()

    expect(dl.url).to.equal('')
    expect(dl.urlFileExtension).to.equal('')
    expect(dl.fileExtension).to.equal('mp3')
    expect(dl.targetFilename).to.equal('Episode Without URL.mp3')
  })

  it('should safely handle enclosure with undefined url and isVideo = true', () => {
    const dl = new PodcastEpisodeDownload()
    const mockItem = { id: 'lib-1', path: '/media/podcasts/test' }
    const mockEpisode = {
      title: 'Video Episode Without URL',
      isVideo: true,
      enclosure: { url: undefined, type: 'video/mp4' }
    }

    expect(() => {
      dl.setData(mockEpisode, mockItem, false, 'lib-1')
    }).to.not.throw()

    expect(dl.url).to.equal('')
    expect(dl.isVideo).to.be.true
    expect(dl.fileExtension).to.equal('mp4')
    expect(dl.targetFilename).to.equal('Video Episode Without URL.mp4')
  })

  it('should handle standard video enclosure with valid URL', () => {
    const dl = new PodcastEpisodeDownload()
    const mockItem = { id: 'lib-1', path: '/media/podcasts/test' }
    const mockEpisode = {
      title: 'Valid Video Episode',
      isVideo: true,
      publishedAt: 1700000000000,
      enclosure: { url: 'https://youtube.com/watch?v=12345', type: 'video/mp4' }
    }

    dl.setData(mockEpisode, mockItem, false, 'lib-1')
    expect(dl.url).to.equal('https://youtube.com/watch?v=12345')
    expect(dl.isVideo).to.be.true
    expect(dl.fileExtension).to.equal('mp4')
    expect(dl.targetFilename).to.equal('Valid Video Episode.mp4')
    expect(dl.targetPath).to.equal('/media/podcasts/test/Valid Video Episode.mp4')
    expect(dl.pubYear).to.equal(new Date(1700000000000).getFullYear())
  })

  it('should safely handle malformed URL with unescaped percent character', () => {
    const dl = new PodcastEpisodeDownload()
    const mockItem = { id: 'lib-1', path: '/media/podcasts/test', media: { title: 'Test Podcast', explicit: false } }
    const mockEpisode = {
      title: 'Episode With % Sign In URL',
      enclosure: { url: 'https://example.com/audio_100%_final.mp3', type: 'audio/mpeg' }
    }

    expect(() => {
      dl.setData(mockEpisode, mockItem, false, 'lib-1')
    }).to.not.throw()

    expect(dl.url).to.equal('https://example.com/audio_100%_final.mp3')
    const clientJson = dl.toJSONForClient()
    expect(clientJson.podcastTitle).to.equal('Test Podcast')
  })

  it('should safely serialize toJSONForClient when media is undefined', () => {
    const dl = new PodcastEpisodeDownload()
    const mockItem = { id: 'lib-1', path: '/media/podcasts/test', media: null }
    const mockEpisode = { title: 'Episode' }

    dl.setData(mockEpisode, mockItem, false, 'lib-1')
    expect(() => {
      const json = dl.toJSONForClient()
      expect(json.podcastTitle).to.be.null
      expect(json.podcastExplicit).to.be.false
    }).to.not.throw()
  })
})
