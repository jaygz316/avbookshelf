<template>
  <div
    class="absolute inset-0 z-20 flex flex-col justify-between select-none overflow-hidden transition-opacity duration-300"
    :class="controlsVisible || paused ? 'opacity-100' : 'opacity-0 cursor-none'"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
    @wheel="onWheel"
  >
        <div class="w-full flex items-center justify-between px-4 pt-3 pb-8 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-auto">
      <div class="flex items-center gap-2 min-w-0 pr-4">
        <!-- Minimize Player (Down Arrow) -->
        <ui-tooltip direction="bottom" text="Minimize Player (M)">
          <button
            aria-label="Minimize Player"
            class="overlay-btn mr-1 shrink-0"
            @click.stop="$emit('detachMiniPlayer')"
          >
            <span class="material-symbols text-lg sm:text-xl">keyboard_arrow_down</span>
          </button>
        </ui-tooltip>

        <div class="min-w-0">
          <p class="text-white text-sm sm:text-base font-semibold truncate drop-shadow-md">
            {{ title || 'No Title' }}
          </p>
          <p v-if="author" class="text-gray-300 text-xs truncate">
            {{ author }}
          </p>
        </div>
        <span v-if="playMethod" class="text-xxs bg-white/20 text-white font-mono px-2 py-0.5 rounded-full border border-white/10 hidden sm:inline-block shrink-0">
          {{ playMethod }}
        </span>
      </div>

      <div class="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <ui-tooltip direction="bottom" :text="`Fit: ${videoFitLabel}`">
          <button
            :aria-label="`Fit: ${videoFitLabel}`"
            class="overlay-btn"
            @click.stop="cycleVideoFit"
          >
            <span class="material-symbols text-lg sm:text-xl">aspect_ratio</span>
          </button>
        </ui-tooltip>

        <ui-tooltip v-if="isPiPSupported" direction="bottom" :text="isPiPActive ? 'Exit Picture in Picture' : 'Picture in Picture'">
          <button
            :aria-label="isPiPActive ? 'Exit Picture in Picture' : 'Picture in Picture'"
            class="overlay-btn"
            :class="{ 'text-accent': isPiPActive }"
            @click.stop="$emit('togglePiP')"
          >
            <span class="material-symbols text-lg sm:text-xl">{{ isPiPActive ? 'pip_exit' : 'picture_in_picture_alt' }}</span>
          </button>
        </ui-tooltip>

        <!-- Pop Out Floating Player -->
        <ui-tooltip direction="bottom" text="Pop Out Floating Player (I)">
          <button
            aria-label="Pop Out Floating Player"
            class="overlay-btn"
            @click.stop="$emit('detachMiniPlayer')"
          >
            <span class="material-symbols text-lg sm:text-xl">tab_move</span>
          </button>
        </ui-tooltip>

                <ui-tooltip direction="bottom" :text="playerSizeLabel">
          <button
            :aria-label="playerSizeLabel"
            class="overlay-btn"
            @click.stop="$emit('cycleSize')"
          >
            <span class="material-symbols text-lg sm:text-xl">{{ playerSizeIcon }}</span>
          </button>
        </ui-tooltip>

                <ui-tooltip direction="bottom" :text="isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'">
          <button
            :aria-label="isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'"
            class="overlay-btn"
            @click.stop="$emit('toggleFullscreen')"
          >
            <span class="material-symbols text-lg sm:text-xl">{{ isFullscreen ? 'fullscreen_exit' : 'fullscreen' }}</span>
          </button>
        </ui-tooltip>
      </div>
    </div>

        <div class="flex-1 w-full relative flex items-center justify-center pointer-events-auto" @click="handleCenterSingleClick">
            <div
        class="absolute left-0 top-0 w-1/4 sm:w-1/3 h-full cursor-pointer z-10"
        @dblclick.stop="triggerDoubleSeekBackward"
      />

            <div
        class="absolute right-0 top-0 w-1/4 sm:w-1/3 h-full cursor-pointer z-10"
        @dblclick.stop="triggerDoubleSeekForward"
      />

            <div
        class="absolute left-1/4 sm:left-1/3 right-1/4 sm:right-1/3 top-0 h-full cursor-pointer z-10"
        @dblclick.stop="$emit('toggleFullscreen')"
      />

            <transition name="scale-fade">
        <div
          v-if="showPlayIndicator"
          class="pointer-events-none p-4 rounded-full bg-black/60 backdrop-blur-xs border border-white/15 text-white shadow-2xl flex items-center justify-center z-20"
        >
          <span class="material-symbols fill text-4xl sm:text-5xl">{{ paused ? 'play_arrow' : 'pause' }}</span>
        </div>
      </transition>

            <transition name="scale-fade">
        <div
          v-if="showSeekBackIndicator"
          class="absolute left-8 sm:left-16 pointer-events-none p-3.5 rounded-full bg-black/60 backdrop-blur-xs border border-white/15 text-white shadow-2xl flex items-center justify-center gap-1 z-20"
        >
          <span class="material-symbols text-2xl sm:text-3xl">replay_10</span>
          <span class="text-xs sm:text-sm font-semibold pr-1">-10s</span>
        </div>
      </transition>

            <transition name="scale-fade">
        <div
          v-if="showSeekFwdIndicator"
          class="absolute right-8 sm:right-16 pointer-events-none p-3.5 rounded-full bg-black/60 backdrop-blur-xs border border-white/15 text-white shadow-2xl flex items-center justify-center gap-1 z-20"
        >
          <span class="text-xs sm:text-sm font-semibold pl-1">+10s</span>
          <span class="material-symbols text-2xl sm:text-3xl">forward_10</span>
        </div>
      </transition>

            <transition name="scale-fade">
        <div
          v-if="showVolumeOsd"
          class="absolute top-6 pointer-events-none px-4 py-2 rounded-full bg-black/70 backdrop-blur-xs border border-white/15 text-white shadow-2xl flex items-center gap-2 z-20"
        >
          <span class="material-symbols text-lg sm:text-xl">{{ volumeIcon }}</span>
          <span class="text-xs sm:text-sm font-mono font-bold">{{ Math.round(volume * 100) }}%</span>
          <div class="w-16 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div class="h-full bg-accent" :style="{ width: (volume * 100) + '%' }" />
          </div>
        </div>
      </transition>
    </div>

        <div class="w-full px-4 pb-3 pt-8 bg-gradient-to-t from-black/85 via-black/50 to-transparent pointer-events-auto">
            <div class="w-full relative py-2 group/scrubber cursor-pointer" @mousemove="onScrubberHover" @mouseleave="onScrubberLeave" @click.stop="onScrubberClick">
        <div ref="scrubberTrack" class="w-full h-1 sm:h-1.5 group-hover/scrubber:h-2.5 bg-white/25 relative rounded-full transition-all duration-150 overflow-visible">
                    <div class="h-full bg-white/40 absolute top-0 left-0 rounded-full pointer-events-none transition-all duration-100" :style="{ width: bufferPercent + '%' }" />

                    <div class="h-full bg-accent absolute top-0 left-0 rounded-full pointer-events-none transition-all duration-75" :style="{ width: progressPercent + '%' }" />

                    <template v-for="(tick, idx) in chapterTicks">
            <div :key="idx" :style="{ left: tick.left + '%' }" class="absolute top-0 w-0.5 bg-white/70 h-full pointer-events-none" />
          </template>

                    <div
            class="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-accent rounded-full opacity-0 group-hover/scrubber:opacity-100 shadow-md transition-opacity duration-150 pointer-events-none"
            :style="{ left: `calc(${progressPercent}% - 7px)` }"
          />
        </div>

                <div
          ref="scrubberTooltip"
          class="absolute -top-7 pointer-events-none bg-black/90 text-white text-xs font-mono px-2 py-0.5 rounded shadow-lg border border-white/20 whitespace-nowrap transition-opacity duration-150"
          :class="isHoveringScrubber ? 'opacity-100' : 'opacity-0'"
          :style="{ left: hoverTooltipLeft + 'px' }"
        >
          {{ hoverTooltipText }}
        </div>
      </div>

            <div class="flex items-center justify-between mt-1 text-white">
                <div class="flex items-center gap-1.5 sm:gap-3">
                    <button
            :aria-label="paused ? 'Play' : 'Pause'"
            class="p-2 sm:p-2.5 rounded-full bg-accent text-primary hover:scale-105 active:scale-95 transition-transform shadow-md flex items-center justify-center"
            @click.stop="$emit('playPause')"
          >
            <span class="material-symbols fill text-xl sm:text-2xl">{{ paused ? 'play_arrow' : 'pause' }}</span>
          </button>

                    <ui-tooltip direction="top" text="Previous Chapter">
            <button class="overlay-btn" @click.stop="$emit('prevChapter')">
              <span class="material-symbols text-lg sm:text-xl">first_page</span>
            </button>
          </ui-tooltip>

                    <ui-tooltip direction="top" text="Jump Backward (-10s)">
            <button class="overlay-btn" @click.stop="$emit('jumpBackward')">
              <span class="material-symbols text-lg sm:text-xl">replay</span>
            </button>
          </ui-tooltip>

                    <ui-tooltip direction="top" text="Jump Forward (+10s)">
            <button class="overlay-btn" @click.stop="$emit('jumpForward')">
              <span class="material-symbols text-lg sm:text-xl">forward_media</span>
            </button>
          </ui-tooltip>

                    <ui-tooltip direction="top" text="Next Chapter">
            <button class="overlay-btn" :disabled="!hasNextChapter" :class="{ 'opacity-40 cursor-not-allowed': !hasNextChapter }" @click.stop="$emit('nextChapter')">
              <span class="material-symbols text-lg sm:text-xl">last_page</span>
            </button>
          </ui-tooltip>

                    <div class="flex items-center group/vol relative">
            <ui-tooltip direction="top" :text="volume <= 0 ? 'Unmute' : 'Mute'">
              <button class="overlay-btn" @click.stop="$emit('toggleMute')">
                <span class="material-symbols text-lg sm:text-xl">{{ volumeIcon }}</span>
              </button>
            </ui-tooltip>
            <div class="w-0 group-hover/vol:w-20 transition-all duration-200 overflow-hidden flex items-center pl-1 pr-1">
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                :value="volume"
                class="w-full accent-accent h-1 bg-white/30 rounded-lg cursor-pointer"
                @input="$emit('setVolume', parseFloat($event.target.value))"
              />
            </div>
          </div>

                    <div class="hidden sm:flex items-center text-xs font-mono text-gray-200 pl-1">
            <span>{{ currentTimestamp }}</span>
            <span class="mx-1 text-gray-400">/</span>
            <span>{{ durationTimestamp }}</span>
            <span v-if="currentChapterName" class="ml-2 text-gray-300 font-sans text-xs truncate max-w-48 hidden lg:inline">
              • {{ currentChapterName }}
            </span>
          </div>
        </div>

                <div class="flex items-center gap-1.5 sm:gap-2">
                    <div class="relative">
            <button
              aria-label="Playback Speed"
              class="px-2 sm:px-2.5 py-1 text-xs font-mono font-semibold rounded-full bg-white/15 hover:bg-white/25 border border-white/15 text-white transition active:scale-95 flex items-center gap-0.5"
              @click.stop="toggleSpeedMenu"
            >
              <span>{{ playbackRateDisplay }}</span>
            </button>

                        <div
              v-if="showSpeedMenu"
              class="absolute bottom-full right-0 mb-2 p-1 bg-primary/95 backdrop-blur-md rounded-lg shadow-xl border border-gray-700 flex flex-col gap-0.5 z-30 min-w-20"
            >
              <button
                v-for="rate in presetRates"
                :key="rate"
                class="px-2.5 py-1 text-xs font-mono text-left rounded hover:bg-white/10 transition"
                :class="playbackRate === rate ? 'text-accent font-bold bg-white/5' : 'text-gray-200'"
                @click.stop="selectSpeed(rate)"
              >
                {{ rate }}x
              </button>
            </div>
          </div>

                    <ui-tooltip v-if="chapters.length" direction="top" text="Chapters">
            <button class="overlay-btn" @click.stop="$emit('showChapters')">
              <span class="material-symbols text-lg sm:text-xl">format_list_bulleted</span>
            </button>
          </ui-tooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    title: {
      type: String,
      default: ''
    },
    author: {
      type: String,
      default: ''
    },
    paused: {
      type: Boolean,
      default: false
    },
    currentTime: {
      type: Number,
      default: 0
    },
    duration: {
      type: Number,
      default: 0
    },
    bufferTime: {
      type: Number,
      default: 0
    },
    volume: {
      type: Number,
      default: 1
    },
    playbackRate: {
      type: Number,
      default: 1
    },
    isFullscreen: {
      type: Boolean,
      default: false
    },
    videoFitMode: {
      type: String,
      default: 'contain'
    },
    videoPlayerSize: {
      type: String,
      default: 'expanded'
    },
    chapters: {
      type: Array,
      default: () => []
    },
    currentChapter: {
      type: Object,
      default: () => null
    },
    playMethod: {
      type: String,
      default: ''
    },
    isPiPActive: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      controlsVisible: true,
      hideTimeout: null,
      showPlayIndicator: false,
      showSeekBackIndicator: false,
      showSeekFwdIndicator: false,
      showVolumeOsd: false,
      volumeOsdTimeout: null,
      showSpeedMenu: false,
      presetRates: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
      isHoveringScrubber: false,
      hoverTooltipLeft: 0,
      hoverTooltipText: '00:00',
      singleClickTimeout: null
    }
  },
  computed: {
    isPiPSupported() {
      return typeof document !== 'undefined' && !!document.pictureInPictureEnabled
    },
    progressPercent() {
      if (!this.duration) return 0
      return Math.min(100, Math.max(0, (this.currentTime / this.duration) * 100))
    },
    bufferPercent() {
      if (!this.duration) return 0
      return Math.min(100, Math.max(0, (this.bufferTime / this.duration) * 100))
    },
    currentTimestamp() {
      return this.$secondsToTimestamp(this.currentTime / (this.playbackRate || 1))
    },
    durationTimestamp() {
      return this.$secondsToTimestamp(this.duration / (this.playbackRate || 1))
    },
    playbackRateDisplay() {
      return `${this.playbackRate}x`
    },
    volumeIcon() {
      if (this.volume <= 0) return 'volume_off'
      if (this.volume <= 0.5) return 'volume_down'
      return 'volume_up'
    },
    videoFitLabel() {
      if (this.videoFitMode === 'cover') return 'Cover (Fill/Crop)'
      if (this.videoFitMode === 'fill') return 'Stretch (Fill)'
      return 'Fit (Contain)'
    },
    playerSizeLabel() {
      if (this.videoPlayerSize === 'theater') return 'Theater Mode (T)'
      if (this.videoPlayerSize === 'expanded') return 'Expanded Mode (T)'
      return 'Player Size (T)'
    },
    playerSizeIcon() {
      if (this.videoPlayerSize === 'theater') return 'fit_screen'
      if (this.videoPlayerSize === 'expanded') return 'fullscreen'
      return 'crop_landscape'
    },
    currentChapterName() {
      return this.currentChapter?.title || ''
    },
    currentChapterIndex() {
      if (!this.currentChapter) return -1
      return this.chapters.findIndex((ch) => ch.id === this.currentChapter.id)
    },
    hasNextChapter() {
      if (!this.chapters.length) return false
      return this.currentChapterIndex < this.chapters.length - 1
    },
    chapterTicks() {
      if (!this.duration || !this.chapters.length) return []
      return this.chapters.map((ch) => ({
        title: ch.title,
        left: Math.min(100, Math.max(0, (ch.start / this.duration) * 100))
      }))
    }
  },
  watch: {
    paused(val) {
      if (val) {
        this.controlsVisible = true
        clearTimeout(this.hideTimeout)
      } else {
        this.scheduleHide()
      }
    }
  },
  mounted() {
    this.scheduleHide()
    window.addEventListener('click', this.onWindowClick)
  },
  beforeDestroy() {
    clearTimeout(this.hideTimeout)
    clearTimeout(this.volumeOsdTimeout)
    clearTimeout(this.singleClickTimeout)
    window.removeEventListener('click', this.onWindowClick)
  },
  methods: {
    onMouseMove() {
      this.controlsVisible = true
      this.scheduleHide()
    },
    onMouseLeave() {
      if (!this.paused) {
        this.controlsVisible = false
      }
    },
    scheduleHide() {
      clearTimeout(this.hideTimeout)
      if (!this.paused && !this.showSpeedMenu) {
        this.hideTimeout = setTimeout(() => {
          this.controlsVisible = false
        }, 2500)
      }
    },
    handleCenterSingleClick() {
      // Delay single click slightly to allow double clicks without flickering play/pause
      if (this.singleClickTimeout) {
        clearTimeout(this.singleClickTimeout)
        this.singleClickTimeout = null
        return
      }
      this.singleClickTimeout = setTimeout(() => {
        this.$emit('playPause')
        this.flashPlayIndicator()
        this.singleClickTimeout = null
      }, 220)
    },
    flashPlayIndicator() {
      this.showPlayIndicator = true
      setTimeout(() => {
        this.showPlayIndicator = false
      }, 600)
    },
    triggerDoubleSeekBackward() {
      if (this.singleClickTimeout) {
        clearTimeout(this.singleClickTimeout)
        this.singleClickTimeout = null
      }
      this.$emit('jumpBackward')
      this.showSeekBackIndicator = true
      setTimeout(() => {
        this.showSeekBackIndicator = false
      }, 600)
    },
    triggerDoubleSeekForward() {
      if (this.singleClickTimeout) {
        clearTimeout(this.singleClickTimeout)
        this.singleClickTimeout = null
      }
      this.$emit('jumpForward')
      this.showSeekFwdIndicator = true
      setTimeout(() => {
        this.showSeekFwdIndicator = false
      }, 600)
    },
    onWheel(e) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.05 : 0.05
      const newVol = Math.min(1, Math.max(0, parseFloat((this.volume + delta).toFixed(2))))
      this.$emit('setVolume', newVol)
      this.showVolumeOsd = true
      clearTimeout(this.volumeOsdTimeout)
      this.volumeOsdTimeout = setTimeout(() => {
        this.showVolumeOsd = false
      }, 1200)
    },
    onScrubberHover(e) {
      if (!this.$refs.scrubberTrack || !this.duration) return
      this.isHoveringScrubber = true
      const rect = this.$refs.scrubberTrack.getBoundingClientRect()
      const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
      const perc = offsetX / rect.width
      const time = perc * this.duration

      this.hoverTooltipLeft = Math.max(10, Math.min(offsetX, rect.width - 60))
      let hoverText = this.$secondsToTimestamp(time / (this.playbackRate || 1))

      const chapter = this.chapters.find((ch) => ch.start <= time && time < ch.end)
      if (chapter?.title) {
        hoverText += ` • ${chapter.title}`
      }
      this.hoverTooltipText = hoverText
    },
    onScrubberLeave() {
      this.isHoveringScrubber = false
    },
    onScrubberClick(e) {
      if (!this.$refs.scrubberTrack || !this.duration) return
      const rect = this.$refs.scrubberTrack.getBoundingClientRect()
      const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
      const perc = offsetX / rect.width
      const time = perc * this.duration
      this.$emit('seek', time)
    },
    cycleVideoFit() {
      const modes = ['contain', 'cover', 'fill']
      const idx = modes.indexOf(this.videoFitMode)
      const next = modes[(idx + 1) % modes.length]
      this.$emit('setVideoFit', next)
    },
    toggleSpeedMenu() {
      this.showSpeedMenu = !this.showSpeedMenu
      if (this.showSpeedMenu) {
        clearTimeout(this.hideTimeout)
      } else {
        this.scheduleHide()
      }
    },
    selectSpeed(rate) {
      this.$emit('setPlaybackRate', rate)
      this.showSpeedMenu = false
      this.scheduleHide()
    },
    onWindowClick(e) {
      if (this.showSpeedMenu && !e.target.closest('.relative')) {
        this.showSpeedMenu = false
      }
    }
  }
}
</script>

<style scoped>
.overlay-btn {
  padding: 0.375rem;
  border-radius: 9999px;
  color: #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

@media (min-width: 640px) {
  .overlay-btn {
    padding: 0.5rem;
  }
}

.overlay-btn:hover {
  color: #ffffff;
  background-color: rgba(255, 255, 255, 0.2);
}

.overlay-btn:active {
  transform: scale(0.95);
}

.scale-fade-enter-active,
.scale-fade-leave-active {
  transition: all 0.25s ease-out;
}

.scale-fade-enter {
  opacity: 0;
  transform: scale(0.7);
}

.scale-fade-leave-to {
  opacity: 0;
  transform: scale(1.15);
}
</style>
