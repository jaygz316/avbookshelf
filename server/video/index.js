const VideoFile = require('./VideoFile')
const VideoManager = require('./VideoManager')
const VideoScanner = require('./VideoScanner')
const VideoEpisodeMatcher = require('./VideoEpisodeMatcher')
const VideoStreamHandler = require('./VideoStreamHandler')
const ytDlpMetadataMapper = require('./ytDlpMetadataMapper')

const videoManager = new VideoManager()
const videoScanner = new VideoScanner()
const videoStreamHandler = new VideoStreamHandler()

module.exports = {
  VideoFile,
  VideoManager,
  VideoScanner,
  VideoEpisodeMatcher,
  VideoStreamHandler,
  ytDlpMetadataMapper,
  videoManager,
  videoScanner,
  videoStreamHandler
}
