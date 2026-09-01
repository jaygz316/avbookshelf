const { expect } = require('chai')
const { extractEpisodeData, cleanEpisodeData } = require('../../../server/utils/podcastUtils')
const PodcastEpisodeDownload = require('../../../server/objects/PodcastEpisodeDownload')

describe('podcastUtils Video Support', () => {
  it('should extract video enclosure from standard enclosure tag', () => {
    const item = {
      title: ['Video Episode 1'],
      enclosure: [
        {
          $: {
            url: 'https://example.com/video1.mp4',
            type: 'video/mp4',
            length: '10485760'
          }
        }
      ],
      pubDate: ['2026-08-30T12:00:00Z']
    }

    const episode = extractEpisodeData(item)
    expect(episode).to.not.be.null
    expect(episode.enclosure.url).to.equal('https://example.com/video1.mp4')
    expect(episode.enclosure.type).to.equal('video/mp4')

    const cleaned = cleanEpisodeData(episode)
    expect(cleaned.isVideo).to.be.true
    expect(cleaned.title).to.equal('Video Episode 1')
  })

  it('should extract video enclosure from media:content tag', () => {
    const item = {
      title: ['Media Content Video'],
      'media:content': [
        {
          $: {
            url: 'https://example.com/stream.m4v',
            type: 'video/x-m4v'
          }
        }
      ]
    }

    const episode = extractEpisodeData(item)
    expect(episode).to.not.be.null
    expect(episode.enclosure.url).to.equal('https://example.com/stream.m4v')

    const cleaned = cleanEpisodeData(episode)
    expect(cleaned.isVideo).to.be.true
  })

  it('should mark audio enclosure as isVideo: false', () => {
    const item = {
      title: ['Audio Episode 1'],
      enclosure: [
        {
          $: {
            url: 'https://example.com/audio1.mp3',
            type: 'audio/mpeg',
            length: '5000000'
          }
        }
      ]
    }

    const episode = extractEpisodeData(item)
    const cleaned = cleanEpisodeData(episode)
    expect(cleaned.isVideo).to.be.false
  })
})

describe('PodcastEpisodeDownload Video Extension Support', () => {
  it('should detect video and return mp4 for unknown video url extension', () => {
    const download = new PodcastEpisodeDownload()
    download.setData(
      {
        title: 'Test Episode',
        isVideo: true,
        enclosure: {
          url: 'https://example.com/download?id=12345',
          type: 'video/mp4'
        }
      },
      {
        id: 'lib_123',
        path: '/podcasts/test'
      },
      false,
      'lib_1'
    )

    expect(download.isVideo).to.be.true
    expect(download.fileExtension).to.equal('mp4')
  })

  it('should keep native video extension like mkv or webm', () => {
    const download = new PodcastEpisodeDownload()
    download.setData(
      {
        title: 'MKV Episode',
        isVideo: true,
        enclosure: {
          url: 'https://example.com/feed/ep1.mkv',
          type: 'video/x-matroska'
        }
      },
      {
        id: 'lib_123',
        path: '/podcasts/test'
      },
      false,
      'lib_1'
    )

    expect(download.isVideo).to.be.true
    expect(download.fileExtension).to.equal('mkv')
  })

  it('should compute targetPath correctly and allow setting targetPath', () => {
    const download = new PodcastEpisodeDownload()
    download.setData(
      {
        title: 'Episode One',
        isVideo: true,
        enclosure: {
          url: 'https://youtube.com/watch?v=abc',
          type: 'video/mp4'
        }
      },
      {
        id: 'lib_123',
        path: '/podcasts/test'
      },
      false,
      'lib_1'
    )

    expect(download.targetPath).to.equal('/podcasts/test/Episode One.mp4')
    download.targetPath = '/podcasts/test/Custom Video.mp4'
    expect(download.targetFilename).to.equal('Custom Video.mp4')
    expect(download.targetPath).to.equal('/podcasts/test/Custom Video.mp4')
  })
})
