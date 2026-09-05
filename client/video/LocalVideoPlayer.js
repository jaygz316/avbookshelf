import Hls from "hls.js"
import EventEmitter from "events"

export default class LocalVideoPlayer extends EventEmitter {
  constructor(ctx) {
    super()

    this.ctx = ctx
    this.player = null

    this.libraryItem = null
    this.videoTracks = []
    this.audioTracks = []
    this.currentTrackIndex = 0
    this.isHlsTranscode = null
    this.hlsInstance = null
    this.usingNativeplayer = false
    this.startTime = 0
    this.trackStartTime = 0
    this.playWhenReady = false
    this.defaultPlaybackRate = 1

    this.playableMimeTypes = []

    this.initialize()
  }

  get currentTrack() {
    return this.videoTracks[this.currentTrackIndex] || this.audioTracks[this.currentTrackIndex] || {}
  }

  initialize() {
    if (document.getElementById("video-player")) {
      document.getElementById("video-player").remove()
    }
    var videoEl = document.createElement("video")
    videoEl.id = "video-player"
    videoEl.style.display = "none"
    videoEl.setAttribute("playsinline", "")
    videoEl.setAttribute("webkit-playsinline", "")
    videoEl.className = "w-full h-full bg-black rounded"
    videoEl.style.objectFit = this.ctx?.$store?.state?.videoFitMode || "contain"
    document.body.appendChild(videoEl)
    this.player = videoEl

    this.player.addEventListener("play", this.evtPlay.bind(this))
    this.player.addEventListener("pause", this.evtPause.bind(this))
    this.player.addEventListener("progress", this.evtProgress.bind(this))
    this.player.addEventListener("ended", this.evtEnded.bind(this))
    this.player.addEventListener("error", this.evtError.bind(this))
    this.player.addEventListener("loadedmetadata", this.evtLoadedMetadata.bind(this))
    this.player.addEventListener("timeupdate", this.evtTimeupdate.bind(this))
    this.player.addEventListener("enterpictureinpicture", this.evtEnterPiP.bind(this))
    this.player.addEventListener("leavepictureinpicture", this.evtLeavePiP.bind(this))

    var mimeTypes = [
      "video/mp4",
      "video/webm",
      "video/ogg",
      "video/x-matroska",
      "video/quicktime"
    ]
    mimeTypes.forEach((mt) => {
      var canPlay = this.player.canPlayType(mt)
      if (canPlay) this.playableMimeTypes.push(mt)
    })
  }

  evtPlay() {
    this.emit("stateChange", "PLAYING")
  }
  evtPause() {
    this.emit("stateChange", "PAUSED")
  }
  evtProgress() {
    var lastBufferTime = this.getLastBufferedTime()
    this.emit("buffertimeUpdate", lastBufferTime)
  }
  evtEnded() {
    if (this.currentTrackIndex < this.videoTracks.length - 1) {
      this.currentTrackIndex++
      this.startTime = this.currentTrack.startOffset
      this.loadCurrentTrack()
    } else {
      this.emit("finished")
    }
  }
  evtError(error) {
    console.error("Player error", error)
    this.emit("error", error)
  }
  evtLoadedMetadata(data) {
    if (!this.isHlsTranscode) {
      this.player.currentTime = this.trackStartTime
    }

    this.emit("stateChange", "LOADED")

    if (this.playWhenReady) {
      this.playWhenReady = false
      this.play()
    }
  }
  evtTimeupdate() {
    if (this.player.paused) {
      this.emit("timeupdate", this.getCurrentTime())
    }
  }
  evtEnterPiP() {
    this.emit("pipChange", true)
  }
  evtLeavePiP() {
    this.emit("pipChange", false)
  }

  destroy() {
    this.destroyHlsInstance()
    if (this.player) {
      this.player.remove()
    }
  }

  set(libraryItem, tracks, isHlsTranscode, startTime, playWhenReady = false) {
    this.libraryItem = libraryItem
    this.videoTracks = tracks || []
    this.audioTracks = tracks || []
    this.isHlsTranscode = isHlsTranscode
    this.playWhenReady = playWhenReady
    this.startTime = startTime

    if (this.hlsInstance) {
      this.destroyHlsInstance()
    }

    if (this.isHlsTranscode) {
      this.setHlsStream()
    } else {
      this.setDirectPlay()
    }
  }

  setHlsStream() {
    this.trackStartTime = 0
    this.currentTrackIndex = 0

    if (!Hls.isSupported()) {
      console.warn("HLS is not supported - fallback to using video element")
      this.usingNativeplayer = true
      this.player.src = this.currentTrack.relativeContentUrl
      this.player.currentTime = this.startTime
      return
    }

    var hlsOptions = {
      startPosition: this.startTime || -1,
      fragLoadPolicy: {
        default: {
          maxTimeToFirstByteMs: 10000,
          maxLoadTimeMs: 120000,
          timeoutRetry: {
            maxNumRetry: 4,
            retryDelayMs: 0,
            maxRetryDelayMs: 0
          },
          errorRetry: {
            maxNumRetry: 8,
            retryDelayMs: 1000,
            maxRetryDelayMs: 8000,
            shouldRetry: (retryConfig, retryCount, isTimeout, httpStatus, retry) => {
              if (httpStatus?.code === 404 && retryConfig?.maxNumRetry > retryCount) {
                return true
              }
              return retry
            }
          }
        }
      }
    }
    this.hlsInstance = new Hls(hlsOptions)

    this.hlsInstance.attachMedia(this.player)
    this.hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => {
      this.hlsInstance.loadSource(this.currentTrack.relativeContentUrl)

      this.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      })

      this.hlsInstance.on(Hls.Events.ERROR, (e, data) => {
        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
          console.warn("[HLS] BUFFER STALLED ERROR")
        } else if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR) {
          if (data.errorAction?.action !== 5) {
            console.warn("[HLS] FRAG LOAD ERROR", data)
          }
        } else {
          console.error("[HLS] Error", data.type, data.details, data)
        }

        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn("[HLS] Fatal network error encountered, recovering...")
              this.hlsInstance.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn("[HLS] Fatal media error (audio/video buffer corruption), recovering...")
              this.hlsInstance.recoverMediaError()
              break
            default:
              console.error("[HLS] Unrecoverable fatal error, destroying instance", data)
              this.destroyHlsInstance()
              break
          }
        }
      })
      this.hlsInstance.on(Hls.Events.DESTROYING, () => {
      })
    })
  }

  setDirectPlay() {
    var trackIndex = this.videoTracks.findIndex((t) => this.startTime >= t.startOffset && this.startTime < t.startOffset + t.duration)
    this.currentTrackIndex = trackIndex >= 0 ? trackIndex : 0

    this.loadCurrentTrack()
  }

  loadCurrentTrack() {
    if (!this.currentTrack) return
    this.trackStartTime = Math.max(0, this.startTime - (this.currentTrack.startOffset || 0))
    this.player.src = this.currentTrack.relativeContentUrl
    this.player.load()
  }

  destroyHlsInstance() {
    if (!this.hlsInstance) return
    if (this.hlsInstance.destroy) {
      var temp = this.hlsInstance
      temp.destroy()
    }
    this.hlsInstance = null
  }

  async resetStream(startTime) {
    this.destroyHlsInstance()
    await new Promise((resolve) => setTimeout(resolve, 1000))
    this.set(this.libraryItem, this.videoTracks, this.isHlsTranscode, startTime, true)
  }

  playPause() {
    if (!this.player) return
    if (this.player.paused) this.play()
    else this.pause()
  }

  play() {
    this.playWhenReady = true
    if (this.player) this.player.play()
  }

  pause() {
    this.playWhenReady = false
    if (this.player) this.player.pause()
  }

  getCurrentTime() {
    var currentTrackOffset = this.currentTrack.startOffset || 0
    return this.player ? currentTrackOffset + this.player.currentTime : 0
  }

  getDuration() {
    if (!this.videoTracks.length) return this.player?.duration || 0
    var lastTrack = this.videoTracks[this.videoTracks.length - 1]
    const trackDuration = lastTrack.startOffset + (lastTrack.duration || 0)
    return trackDuration || this.player?.duration || 0
  }

  setPlaybackRate(playbackRate) {
    if (!this.player) return
    this.defaultPlaybackRate = playbackRate
    this.player.playbackRate = playbackRate
  }

  seek(time, playWhenReady) {
    if (!this.player) return

    this.playWhenReady = playWhenReady

    if (this.isHlsTranscode || this.videoTracks.length <= 1) {
      var offsetTime = time - (this.currentTrack?.startOffset || 0)
      this.player.currentTime = Math.max(0, offsetTime)
    } else {
      if (time < this.currentTrack.startOffset || (this.currentTrack.duration && time > this.currentTrack.startOffset + this.currentTrack.duration)) {
        // Change Track
        var trackIndex = this.videoTracks.findIndex((t) => time >= t.startOffset && time < t.startOffset + t.duration)
        if (trackIndex >= 0) {
          this.startTime = time
          this.currentTrackIndex = trackIndex

          if (!this.player.paused) {
            this.playWhenReady = true
          }
          this.loadCurrentTrack()
        } else {
          var offsetTime = time - (this.currentTrack?.startOffset || 0)
          this.player.currentTime = Math.max(0, offsetTime)
        }
      } else {
        var offsetTime = time - (this.currentTrack?.startOffset || 0)
        this.player.currentTime = Math.max(0, offsetTime)
      }
    }
  }

  setVolume(volume) {
    if (!this.player) return
    this.player.volume = volume
  }

  isValidDuration(duration) {
    if (duration && !isNaN(duration) && duration !== Number.POSITIVE_INFINITY && duration !== Number.NEGATIVE_INFINITY) {
      return true
    }
    return false
  }

  getBufferedRanges() {
    if (!this.player) return []
    const ranges = []
    const seekable = this.player.buffered || []

    let offset = 0

    for (let i = 0, length = seekable.length; i < length; i++) {
      let start = seekable.start(i)
      let end = seekable.end(i)
      if (!this.isValidDuration(start)) {
        start = 0
      }
      if (!this.isValidDuration(end)) {
        end = 0
        continue
      }

      ranges.push({
        start: start + offset,
        end: end + offset
      })
    }
    return ranges
  }

  getLastBufferedTime() {
    var bufferedRanges = this.getBufferedRanges()
    if (!bufferedRanges.length) return 0

    var buff = bufferedRanges.find((buff) => buff.start < this.player.currentTime && buff.end > this.player.currentTime)
    if (buff) return buff.end

    var last = bufferedRanges[bufferedRanges.length - 1]
    return last.end
  }

  get isPiPSupported() {
    return typeof document !== 'undefined' && !!document.pictureInPictureEnabled && !this.player?.disablePictureInPicture
  }

  get isPiPActive() {
    return typeof document !== 'undefined' && document.pictureInPictureElement === this.player
  }

  async requestPiP() {
    if (!this.player || !this.isPiPSupported) return false
    try {
      await this.player.requestPictureInPicture()
      return true
    } catch (err) {
      console.warn("[LocalVideoPlayer] Picture-in-Picture request failed:", err)
      return false
    }
  }

  async exitPiP() {
    if (!this.isPiPActive) return
    try {
      await document.exitPictureInPicture()
    } catch (err) {
      console.warn("[LocalVideoPlayer] Picture-in-Picture exit failed:", err)
    }
  }

  setVideoFit(mode) {
    if (!this.player) return
    this.player.style.objectFit = mode || 'contain'
  }
}
