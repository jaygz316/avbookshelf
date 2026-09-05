<template>
  <div class="relative">
    <!-- Track -->
    <div
      ref="track"
      class="w-full h-2 bg-gray-700 relative cursor-pointer transform duration-100 hover:scale-y-125 overflow-hidden select-none"
      @mousemove="mousemoveTrack"
      @mouseleave="mouseleaveTrack"
      @click.stop="clickTrack"
      @mousedown.stop.prevent="startScrub"
      @touchstart.stop.prevent="startTouchScrub"
    >
      <div ref="readyTrack" class="h-full bg-gray-600 absolute top-0 left-0 pointer-events-none" />
      <div ref="bufferTrack" class="h-full bg-gray-500 absolute top-0 left-0 pointer-events-none" />
      <div ref="playedTrack" class="h-full bg-gray-200 absolute top-0 left-0 pointer-events-none" />
      <div ref="trackCursor" class="h-full w-0.5 bg-gray-50 absolute top-0 left-0 opacity-0 pointer-events-none" />
      <div v-if="loading" class="h-full w-1/4 absolute left-0 top-0 loadingTrack pointer-events-none bg-white/25" />
    </div>
    <div class="w-full h-2 relative overflow-hidden" :class="useChapterTrack ? 'opacity-0' : ''">
      <template v-for="(tick, index) in chapterTicks">
        <div :key="index" :style="{ left: tick.left + 'px' }" class="absolute top-0 w-px bg-white/30 h-1 pointer-events-none" />
      </template>
    </div>

    <!-- Hover timestamp -->
    <div ref="hoverTimestamp" class="absolute -top-8 left-0 bg-white text-black rounded-full opacity-0 pointer-events-none z-10">
      <p ref="hoverTimestampText" class="text-xs font-mono text-center px-2 py-0.5 truncate whitespace-nowrap">00:00</p>
    </div>
    <div ref="hoverTimestampArrow" class="absolute -top-3 left-0 bg-white text-black rounded-full opacity-0 pointer-events-none">
      <div class="absolute -bottom-1.5 left-0 right-0 w-full flex justify-center">
        <div class="arrow-down" />
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    loading: Boolean,
    duration: Number,
    chapters: {
      type: Array,
      default: () => []
    },
    currentChapter: {
      type: Object,
      default: () => {}
    },
    playbackRate: Number
  },
  data() {
    return {
      trackWidth: 0,
      currentTime: 0,
      percentReady: 0,
      bufferTime: 0,
      chapterTicks: [],
      trackOffsetLeft: 16, // Track is 16px from edge
      playedTrackWidth: 0,
      readyTrackWidth: 0,
      bufferTrackWidth: 0,
      useChapterTrack: false,
      isScrubbing: false,
      scrubTime: null,
      resizeObserver: null
    }
  },
  watch: {
    duration: {
      handler() {
        this.setChapterTicks()
      }
    }
  },
  computed: {
    _playbackRate() {
      if (!this.playbackRate || isNaN(this.playbackRate)) return 1
      return this.playbackRate
    },
    currentChapterDuration() {
      if (!this.currentChapter) return 0
      return this.currentChapter.end - this.currentChapter.start
    },
    currentChapterStart() {
      if (!this.currentChapter) return 0
      return this.currentChapter.start
    },
    isMobile() {
      return this.$store.state.globals.isMobile
    }
  },
  methods: {
    setUseChapterTrack(useChapterTrack) {
      this.useChapterTrack = useChapterTrack
      this.updateBufferTrack()
      this.updatePlayedTrackWidth()
    },
    getTimeFromEvent(e) {
      if (!this.$refs.track) return 0
      const rect = this.$refs.track.getBoundingClientRect()
      const width = Math.max(rect.width || this.trackWidth || 1, 1)
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const offsetX = Math.max(0, Math.min(clientX - rect.left, width))
      const perc = offsetX / width
      const baseTime = this.useChapterTrack ? this.currentChapterStart : 0
      const duration = this.useChapterTrack ? this.currentChapterDuration : this.duration
      return baseTime + perc * duration
    },
    clickTrack(e) {
      if (this.loading) return
      const time = this.getTimeFromEvent(e)
      if (isNaN(time) || time === null) return
      this.$emit('seek', time)
    },
    startScrub(e) {
      if (this.loading) return
      this.isScrubbing = true
      const time = this.getTimeFromEvent(e)
      this.scrubTime = time
      this.updatePlayedTrackWidth()
      this.$emit('seek', time)

      window.addEventListener('mousemove', this.onScrubMove)
      window.addEventListener('mouseup', this.onScrubEnd)
    },
    onScrubMove(e) {
      if (!this.isScrubbing) return
      const time = this.getTimeFromEvent(e)
      this.scrubTime = time
      this.updatePlayedTrackWidth()
      this.$emit('seek', time)
    },
    onScrubEnd(e) {
      if (!this.isScrubbing) return
      this.isScrubbing = false
      const time = this.getTimeFromEvent(e)
      this.scrubTime = null
      this.$emit('seek', time)

      window.removeEventListener('mousemove', this.onScrubMove)
      window.removeEventListener('mouseup', this.onScrubEnd)
    },
    startTouchScrub(e) {
      if (this.loading) return
      this.isScrubbing = true
      const time = this.getTimeFromEvent(e)
      this.scrubTime = time
      this.updatePlayedTrackWidth()
      this.$emit('seek', time)

      window.addEventListener('touchmove', this.onTouchScrubMove, { passive: false })
      window.addEventListener('touchend', this.onTouchScrubEnd)
    },
    onTouchScrubMove(e) {
      if (!this.isScrubbing) return
      e.preventDefault()
      const time = this.getTimeFromEvent(e)
      this.scrubTime = time
      this.updatePlayedTrackWidth()
      this.$emit('seek', time)
    },
    onTouchScrubEnd(e) {
      if (!this.isScrubbing) return
      this.isScrubbing = false
      this.scrubTime = null
      window.removeEventListener('touchmove', this.onTouchScrubMove)
      window.removeEventListener('touchend', this.onTouchScrubEnd)
    },
    setBufferTime(time) {
      this.bufferTime = time
      this.updateBufferTrack()
    },
    updateBufferTrack() {
      if (!this.$refs.track) return
      if (!this.trackWidth) this.setTrackWidth()
      const time = this.useChapterTrack ? Math.max(0, this.bufferTime - this.currentChapterStart) : this.bufferTime
      const duration = this.useChapterTrack ? this.currentChapterDuration : this.duration
      if (!duration || !this.trackWidth) return

      var bufferlen = (time / duration) * this.trackWidth
      bufferlen = Math.round(bufferlen)
      if (this.bufferTrackWidth === bufferlen || !this.$refs.bufferTrack) return
      if (this.$refs.bufferTrack) this.$refs.bufferTrack.style.width = bufferlen + 'px'
      this.bufferTrackWidth = bufferlen
    },
    setPercentageReady(percent) {
      this.percentReady = percent
      this.updateReadyTrack()
    },
    updateReadyTrack() {
      if (!this.$refs.track) return
      if (!this.trackWidth) this.setTrackWidth()
      const widthReady = Math.round(this.trackWidth * this.percentReady)
      if (this.readyTrackWidth === widthReady) return
      this.readyTrackWidth = widthReady
      if (this.$refs.readyTrack) this.$refs.readyTrack.style.width = widthReady + 'px'
    },
    setCurrentTime(time) {
      this.currentTime = time
      this.updatePlayedTrackWidth()
    },
    updatePlayedTrackWidth() {
      if (!this.$refs.track) return
      if (!this.trackWidth) this.setTrackWidth()
      const activeTime = this.isScrubbing && this.scrubTime !== null ? this.scrubTime : this.currentTime
      const time = this.useChapterTrack ? Math.max(0, activeTime - this.currentChapterStart) : activeTime
      const duration = this.useChapterTrack ? this.currentChapterDuration : this.duration
      if (!duration || !this.trackWidth) return

      const ptWidth = Math.round((time / duration) * this.trackWidth)
      if (this.playedTrackWidth === ptWidth) {
        return
      }
      if (this.$refs.playedTrack) this.$refs.playedTrack.style.width = ptWidth + 'px'
      this.playedTrackWidth = ptWidth
    },
    setChapterTicks() {
      if (!this.duration) return
      this.chapterTicks = this.chapters.map((chap) => {
        const perc = chap.start / this.duration
        return {
          title: chap.title,
          left: perc * this.trackWidth
        }
      })
    },
    mousemoveTrack(e) {
      if (this.isMobile || !this.$refs.track) {
        return
      }
      const rect = this.$refs.track.getBoundingClientRect()
      const width = Math.max(rect.width || this.trackWidth || 1, 1)
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const offsetX = Math.max(0, Math.min(clientX - rect.left, width))

      const baseTime = this.useChapterTrack ? this.currentChapterStart : 0
      const duration = this.useChapterTrack ? this.currentChapterDuration : this.duration
      const progressTime = (offsetX / width) * duration
      const totalTime = baseTime + progressTime

      if (this.$refs.hoverTimestamp) {
        var hoverWidth = this.$refs.hoverTimestamp.clientWidth
        this.$refs.hoverTimestamp.style.opacity = 1
        var posLeft = offsetX - hoverWidth / 2
        const trackLeft = rect.left
        if (posLeft + hoverWidth + trackLeft > window.innerWidth) {
          posLeft = window.innerWidth - hoverWidth - trackLeft
        } else if (posLeft < -trackLeft) {
          posLeft = -trackLeft
        }
        this.$refs.hoverTimestamp.style.left = posLeft + 'px'
      }

      if (this.$refs.hoverTimestampArrow) {
        var arrowWidth = this.$refs.hoverTimestampArrow.clientWidth
        var arrowPosLeft = offsetX - arrowWidth / 2
        this.$refs.hoverTimestampArrow.style.opacity = 1
        this.$refs.hoverTimestampArrow.style.left = arrowPosLeft + 'px'
      }
      if (this.$refs.hoverTimestampText) {
        var hoverText = this.$secondsToTimestamp(progressTime / this._playbackRate)

        var chapter = this.chapters.find((chapter) => chapter.start <= totalTime && totalTime < chapter.end)
        if (chapter && chapter.title) {
          hoverText += ` - ${chapter.title}`
        }
        this.$refs.hoverTimestampText.innerText = hoverText
      }
      if (this.$refs.trackCursor) {
        this.$refs.trackCursor.style.opacity = 1
        this.$refs.trackCursor.style.left = offsetX - 1 + 'px'
      }
    },
    mouseleaveTrack() {
      if (this.$refs.hoverTimestamp) {
        this.$refs.hoverTimestamp.style.opacity = 0
      }
      if (this.$refs.hoverTimestampArrow) {
        this.$refs.hoverTimestampArrow.style.opacity = 0
      }
      if (this.$refs.trackCursor) {
        this.$refs.trackCursor.style.opacity = 0
      }
    },
    setTrackWidth() {
      if (this.$refs.track) {
        const rect = this.$refs.track.getBoundingClientRect()
        this.trackWidth = rect.width || this.$refs.track.clientWidth
        this.trackOffsetLeft = rect.left
      } else {
        console.error('Track not loaded', this.$refs)
      }
    },
    windowResize() {
      this.setTrackWidth()
      this.setChapterTicks()
      this.updatePlayedTrackWidth()
      this.updateBufferTrack()
    }
  },
  mounted() {
    this.setTrackWidth()
    this.setChapterTicks()
    window.addEventListener('resize', this.windowResize)
    if (typeof ResizeObserver !== 'undefined' && this.$refs.track) {
      this.resizeObserver = new ResizeObserver(() => {
        this.windowResize()
      })
      this.resizeObserver.observe(this.$refs.track)
    }
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.windowResize)
    window.removeEventListener('mousemove', this.onScrubMove)
    window.removeEventListener('mouseup', this.onScrubEnd)
    window.removeEventListener('touchmove', this.onTouchScrubMove)
    window.removeEventListener('touchend', this.onTouchScrubEnd)
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
  }
}
</script>
