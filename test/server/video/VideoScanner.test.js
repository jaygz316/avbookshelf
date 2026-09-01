const { expect } = require('chai')
const sinon = require('sinon')
const VideoScanner = require('../../../server/video/VideoScanner')
const prober = require('../../../server/utils/prober')
const fsExtra = require('../../../server/libs/fsExtra')
const LibraryFile = require('../../../server/objects/files/LibraryFile')

describe('VideoScanner', () => {
  let videoScanner

  beforeEach(() => {
    videoScanner = new VideoScanner()
  })

  afterEach(() => {
    sinon.restore()
  })

  describe('scanVideoLibraryFile', () => {
    it('should read companion .info.json and enrich videoFile metadata and chapters', async () => {
      const mockLibraryFile = {
        metadata: {
          path: '/library/podcast/episode1.mp4',
          filename: 'episode1.mp4',
          filenameNoExt: 'episode1',
          ext: '.mp4',
          size: 1048576
        },
        ino: '12345'
      }

      sinon.stub(prober, 'probe').resolves({
        format: 'mp4',
        duration: 3600,
        size: 1048576,
        chapters: [],
        audio_stream: { codec: 'aac' },
        video_stream: { codec: 'h264' }
      })

      const mockInfoJson = {
        id: 'vid123',
        title: 'Video Episode 1 - My Topic',
        description: 'Comprehensive show notes and description',
        upload_date: '20260315',
        timestamp: 1773532800,
        uploader: 'Show Host',
        uploader_id: '@ShowHost',
        channel: 'Show Channel',
        duration: 3600,
        tags: ['Tech', 'News'],
        categories: ['Education'],
        chapters: [
          { start_time: 0, end_time: 300, title: 'Intro' },
          { start_time: 300, end_time: 3600, title: 'Deep Dive' }
        ]
      }

      sinon.stub(fsExtra, 'pathExists').callsFake(async (path) => {
        if (path.endsWith('episode1.info.json')) return true
        if (path.endsWith('episode1-thumb.jpg')) return true
        return false
      })

      sinon.stub(fsExtra, 'readFile').resolves(JSON.stringify(mockInfoJson))

      const result = await videoScanner.scanVideoLibraryFile(mockLibraryFile)
      expect(result).to.not.be.null
      expect(result.infoJson).to.not.be.null
      expect(result.infoJson.title).to.equal('Video Episode 1 - My Topic')
      expect(result.infoJson.pubDate).to.equal('2026-03-15')
      expect(result.infoJson.publishedAt).to.equal(1773532800000)
      expect(result.infoJson.description).to.equal('Comprehensive show notes and description')
      expect(result.infoJson.author).to.equal('Show Host')

      // VideoFile metaTags enriched
      expect(result.videoFile.metaTags.tagTitle).to.equal('Video Episode 1 - My Topic')
      expect(result.videoFile.metaTags.tagDate).to.equal('2026-03-15')
      expect(result.videoFile.metaTags.tagDescription).to.equal('Comprehensive show notes and description')
      expect(result.videoFile.metaTags.tagArtist).to.equal('Show Host')

      // Chapters enriched
      expect(result.videoFile.chapters).to.have.length(2)
      expect(result.videoFile.chapters[0].title).to.equal('Intro')
    })

    it('should fallback to extracting date from filename when info.json is absent', async () => {
      const mockLibraryFile = {
        metadata: {
          path: '/library/podcast/Podcast Ep 5 - 2025-11-20.mp4',
          filename: 'Podcast Ep 5 - 2025-11-20.mp4',
          filenameNoExt: 'Podcast Ep 5 - 2025-11-20',
          ext: '.mp4',
          size: 1048576
        },
        ino: '12346'
      }

      sinon.stub(prober, 'probe').resolves({
        format: 'mp4',
        duration: 1800,
        size: 1048576,
        chapters: [],
        audioMetaTags: {},
        audio_stream: { codec: 'aac' },
        video_stream: { codec: 'h264' }
      })

      sinon.stub(fsExtra, 'pathExists').resolves(false)

      const result = await videoScanner.scanVideoLibraryFile(mockLibraryFile)
      expect(result).to.not.be.null
      expect(result.infoJson).to.be.null
      expect(result.videoFile.metaTags.tagDate).to.equal('2025-11-20')
    })

    it('should find companion json file with youtube video ID in filename', async () => {
      const mockLibraryFile = {
        metadata: {
          path: '/library/podcast/My Video [dQw4w9WgXcQ].mp4',
          filename: 'My Video [dQw4w9WgXcQ].mp4',
          filenameNoExt: 'My Video [dQw4w9WgXcQ]',
          ext: '.mp4',
          size: 1048576
        },
        ino: '12347'
      }

      sinon.stub(prober, 'probe').resolves({
        format: 'mp4',
        duration: 213,
        size: 1048576,
        chapters: []
      })

      sinon.stub(fsExtra, 'pathExists').callsFake(async (path) => {
        if (path.endsWith('dQw4w9WgXcQ.info.json')) return true
        return false
      })

      sinon.stub(fsExtra, 'readFile').resolves(
        JSON.stringify({
          id: 'dQw4w9WgXcQ',
          title: 'YouTube Track Title',
          upload_date: '20230514'
        })
      )

      const result = await videoScanner.scanVideoLibraryFile(mockLibraryFile)
      expect(result).to.not.be.null
      expect(result.infoJson).to.not.be.null
      expect(result.infoJson.title).to.equal('YouTube Track Title')
      expect(result.infoJson.pubDate).to.equal('2023-05-14')
    })
  })

  describe('processScannedVideoFilesForNewItem', () => {
    it('should create new podcast episode with full metadata from infoJson', () => {
      const scannedVideoFiles = [
        {
          videoFile: {
            metadata: {
              path: '/podcasts/test/ep1.mp4',
              filename: 'ep1.mp4',
              filenameNoExt: 'ep1'
            },
            toJSON: () => ({ metadata: { filename: 'ep1.mp4' } })
          },
          probeData: {
            chapters: []
          },
          infoJson: {
            title: 'Episode 10 - Exciting News',
            subtitle: 'Host Name',
            description: 'Episode Description text',
            pubDate: '2026-04-01',
            publishedAt: 1775001600000,
            season: '1',
            episode: '10',
            episodeType: 'full',
            chapters: [{ id: 0, start: 0, end: 100, title: 'Chapter 1' }],
            extraData: { guid: 'yt_ep10', viewCount: 5000 }
          }
        }
      ]

      const newPodcastEpisodes = []
      const AudioFileScanner = {
        setPodcastEpisodeMetadataFromAudioMetaTags: sinon.stub()
      }
      const libraryScan = {
        addLog: sinon.stub()
      }

      videoScanner.processScannedVideoFilesForNewItem({}, scannedVideoFiles, newPodcastEpisodes, AudioFileScanner, libraryScan)

      expect(newPodcastEpisodes).to.have.length(1)
      const ep = newPodcastEpisodes[0]
      expect(ep.title).to.equal('Episode 10 - Exciting News')
      expect(ep.subtitle).to.equal('Host Name')
      expect(ep.description).to.equal('Episode Description text')
      expect(ep.pubDate).to.equal('2026-04-01')
      expect(ep.publishedAt).to.equal(1775001600000)
      expect(ep.season).to.equal('1')
      expect(ep.episode).to.equal('10')
      expect(ep.episodeMediaType).to.equal('video')
      expect(ep.chapters).to.have.length(1)
      expect(ep.extraData.guid).to.equal('yt_ep10')
    })

    it('should link video file to existing matching episode and sync publishedAt and pubDate', () => {
      const existingEpisode = {
        title: 'Episode 10',
        pubDate: null,
        publishedAt: null,
        description: null,
        audioFile: { metadata: { filename: 'ep1.mp3', filenameNoExt: 'ep1' } },
        videoFile: null
      }
      const newPodcastEpisodes = [existingEpisode]

      const scannedVideoFiles = [
        {
          videoFile: {
            metadata: {
              path: '/podcasts/test/ep1.mp4',
              filename: 'ep1.mp4',
              filenameNoExt: 'ep1'
            },
            toJSON: () => ({ metadata: { filename: 'ep1.mp4', filenameNoExt: 'ep1' } })
          },
          probeData: {
            chapters: []
          },
          infoJson: {
            title: 'Episode 10 - Exciting News',
            pubDate: '2026-04-01',
            publishedAt: 1775001600000,
            description: 'Updated Description'
          }
        }
      ]

      const AudioFileScanner = {
        setPodcastEpisodeMetadataFromAudioMetaTags: sinon.stub()
      }
      const libraryScan = {
        addLog: sinon.stub()
      }

      videoScanner.processScannedVideoFilesForNewItem({}, scannedVideoFiles, newPodcastEpisodes, AudioFileScanner, libraryScan)

      expect(newPodcastEpisodes).to.have.length(1)
      expect(existingEpisode.pubDate).to.equal('2026-04-01')
      expect(existingEpisode.publishedAt).to.equal(1775001600000)
      expect(existingEpisode.description).to.equal('Updated Description')
      expect(existingEpisode.episodeMediaType).to.equal('video')
    })
  })
})
