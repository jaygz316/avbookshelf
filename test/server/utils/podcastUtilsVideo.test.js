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
  it('should detect video from URL extension when enclosure type is application/octet-stream or missing', () => {
    const item = {
      title: ['Video Episode with Generic Mime'],
      enclosure: [
        {
          $: {
            url: 'https://example.com/podcast/ep10.mp4?source=feed',
            type: 'application/octet-stream',
            length: '50000000'
          }
        }
      ]
    }

    const episode = extractEpisodeData(item)
    expect(episode).to.not.be.null
    const cleaned = cleanEpisodeData(episode)
    expect(cleaned.isVideo).to.be.true
  })

  it('should detect video from URL extension when enclosure type is audio/mp4 for an mp4 file', () => {
    const item = {
      title: ['Video Episode with audio/mp4 Mime'],
      enclosure: [
        {
          $: {
            url: 'https://example.com/podcast/ep20.m4v',
            type: 'audio/mp4',
            length: '60000000'
          }
        }
      ]
    }

    const episode = extractEpisodeData(item)
    expect(episode).to.not.be.null
    const cleaned = cleanEpisodeData(episode)
    expect(cleaned.isVideo).to.be.true
  })

  it('should preserve isVideo true if already set on episode data', () => {
    const data = {
      title: 'YouTube video episode',
      isVideo: true,
      enclosure: {
        url: 'https://youtube.com/watch?v=123',
        type: ''
      }
    }
    const cleaned = cleanEpisodeData(data)
    expect(cleaned.isVideo).to.be.true
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

  it('should detect video from url extension even when isVideo is not set on rssPodcastEpisode', () => {
    const download = new PodcastEpisodeDownload()
    download.setData(
      {
        title: 'Auto Detected Video',
        enclosure: {
          url: 'https://example.com/media/episode.mp4?token=abc',
          type: 'application/octet-stream'
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

describe('PodcastEpisode Model Video Support & Fallbacks', () => {
  const PodcastEpisode = require('../../../server/models/PodcastEpisode')

  it('should return isVideo true when videoFile exists even if episodeMediaType is audio', () => {
    const ep = new PodcastEpisode({
      id: 'ep_1',
      title: 'Video Ep',
      episodeMediaType: 'audio',
      videoFile: {
        ino: '123',
        duration: 300,
        metadata: { filename: 'ep1.mp4', size: 1000000 }
      },
      audioFile: null,
      createdAt: new Date(),
      updatedAt: new Date()
    })

    expect(ep.isVideo).to.be.true
    expect(ep.duration).to.equal(300)
    expect(ep.size).to.equal(1000000)

    const json = ep.toOldJSON('lib_item_1')
    expect(json.isVideo).to.be.true
    expect(json.episodeMediaType).to.equal('video')

    const expanded = ep.toOldJSONExpanded('lib_item_1')
    expect(expanded.isVideo).to.be.true
    expect(expanded.videoTrack).to.not.be.null
    expect(expanded.audioTrack).to.not.be.null
    expect(expanded.audioTrack.contentUrl).to.equal('/api/items/lib_item_1/file/123')
  })
})

describe('LibraryFile Video File Type Detection', () => {
  const LibraryFile = require('../../../server/objects/files/LibraryFile')

  it('should classify mp4 and webm as video fileType and isVideoFile true', () => {
    const lfMp4 = new LibraryFile({
      metadata: { format: 'mp4', ext: '.mp4', filename: 'test.mp4' }
    })
    expect(lfMp4.fileType).to.equal('video')
    expect(lfMp4.isVideoFile).to.be.true

    const lfWebm = new LibraryFile({
      metadata: { format: 'webm', ext: '.webm', filename: 'test.webm' }
    })
    expect(lfWebm.fileType).to.equal('video')
    expect(lfWebm.isVideoFile).to.be.true
  })

  it('should support synchronous metadata loading with setDataFromPathSync', () => {
    const Path = require('path')
    const lf = new LibraryFile()
    const testPath = Path.join(__dirname, '../../../package.json')
    const res = lf.setDataFromPathSync(testPath, 'package.json')
    expect(res).to.be.true
    expect(lf.ino).to.not.be.null
    expect(lf.metadata.filename).to.equal('package.json')
  })
})

describe('MediaProbeData Video Stream & Cover Art Separation', () => {
  const MediaProbeData = require('../../../server/scanner/MediaProbeData')

  it('should distinguish attached_pic cover art from real video stream', () => {
    const probe = new MediaProbeData()
    probe.setData({
      format: { name: 'mp3', duration: 120 },
      video_stream: {
        codec: 'mjpeg',
        attached_pic: true,
        frame_rate: 0
      },
      audio_stream: {
        codec: 'mp3',
        channels: 2
      }
    })

    expect(probe.videoStream).to.be.null
    expect(probe.embeddedCoverArt).to.equal('mjpeg')
  })

  it('should preserve mjpeg video stream when frame_rate is present and not attached_pic', () => {
    const probe = new MediaProbeData()
    probe.setData({
      format: { name: 'avi', duration: 60 },
      video_stream: {
        codec: 'mjpeg',
        attached_pic: false,
        frame_rate: 30,
        width: 1920,
        height: 1080
      },
      audio_stream: {
        codec: 'pcm',
        channels: 2
      }
    })

    expect(probe.videoStream).to.not.be.null
    expect(probe.videoStream.codec).to.equal('mjpeg')
    expect(probe.embeddedCoverArt).to.be.null
  })
})

describe('LibraryItemScanData fileType Change Detection', () => {
  const LibraryItemScanData = require('../../../server/scanner/LibraryItemScanData')
  const LibraryFile = require('../../../server/objects/files/LibraryFile')

  it('should flag hasChanges true when fileType transitions from audio to video', () => {
    const scanData = new LibraryItemScanData({
      mediaType: 'podcast',
      path: '/podcasts/test',
      relPath: 'test',
      libraryFiles: []
    })

    const existingFile = {
      ino: '100',
      fileType: 'audio',
      metadata: { path: '/podcasts/test/ep1.mp4', relPath: 'ep1.mp4', filename: 'ep1.mp4', ext: '.mp4', size: 1000 }
    }

    const scannedFile = new LibraryFile({
      ino: '100',
      fileType: 'video',
      metadata: { path: '/podcasts/test/ep1.mp4', relPath: 'ep1.mp4', filename: 'ep1.mp4', ext: '.mp4', size: 1000 }
    })

    const dummyScan = { addLog: () => {} }
    const changed = scanData.compareUpdateLibraryFile('/podcasts/test', existingFile, scannedFile, dummyScan)
    expect(changed).to.be.true
    expect(existingFile.fileType).to.equal('video')
  })
})

