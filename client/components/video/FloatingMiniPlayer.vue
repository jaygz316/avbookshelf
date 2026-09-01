<template>
  <transition name="mini-player-slide">
    <div
      v-if="visible"
      id="floating-mini-player"
      class="fixed bottom-24 right-4 sm:bottom-28 sm:right-6 w-72 sm:w-96 aspect-video z-50 rounded-xl shadow-2xl border border-gray-700 bg-black overflow-hidden group select-none transition-all duration-300"
    >
            <div id="floating-mini-video-container" ref="miniVideoContainer" class="w-full h-full relative flex items-center justify-center bg-black">
                <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-black/60 z-10 pointer-events-none">
          <svg class="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>

                <div class="absolute inset-0 bg-black/60 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2.5 z-20">
                    <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-white text-xs font-semibold truncate drop-shadow-sm">
                {{ title || 'No Title' }}
              </p>
              <p v-if="author" class="text-gray-300 text-xxs truncate">
                {{ author }}
              </p>
            </div>
            <div class="flex items-center gap-1 shrink-0">
                            <ui-tooltip direction="bottom" text="Expand to Player">
                <button
                  aria-label="Expand to Player"
                  class="p-1 rounded bg-white/20 hover:bg-white/30 text-white transition active:scale-95 flex items-center justify-center"
                  @click.stop="$emit('returnToPlayer')"
                >
                  <span class="material-symbols text-sm sm:text-base">open_in_full</span>
                </button>
              </ui-tooltip>

                            <ui-tooltip direction="bottom" text="Close Mini Player">
                <button
                  aria-label="Close Mini Player"
                  class="p-1 rounded bg-white/20 hover:bg-white/30 text-white transition active:scale-95 flex items-center justify-center"
                  @click.stop="$emit('close')"
                >
                  <span class="material-symbols text-sm sm:text-base">close</span>
                </button>
              </ui-tooltip>
            </div>
          </div>

                    <div class="flex items-center justify-center gap-3">
            <button
              aria-label="Jump Backward"
              class="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition active:scale-95 flex items-center justify-center"
              @click.stop="$emit('jumpBackward')"
            >
              <span class="material-symbols text-lg sm:text-xl">replay</span>
            </button>

            <button
              :aria-label="paused ? 'Play' : 'Pause'"
              class="p-2 sm:p-2.5 rounded-full bg-accent text-primary hover:scale-105 active:scale-95 transition shadow-lg flex items-center justify-center"
              @click.stop="$emit('playPause')"
            >
              <span class="material-symbols fill text-xl sm:text-2xl">{{ paused ? 'play_arrow' : 'pause' }}</span>
            </button>

            <button
              aria-label="Jump Forward"
              class="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition active:scale-95 flex items-center justify-center"
              @click.stop="$emit('jumpForward')"
            >
              <span class="material-symbols text-lg sm:text-xl">forward_media</span>
            </button>
          </div>

                    <div class="w-full">
            <div class="flex items-center justify-between text-xxs font-mono text-gray-300 mb-1 px-0.5">
              <span>{{ currentTimestamp }}</span>
              <span>{{ durationTimestamp }}</span>
            </div>
            <div class="w-full h-1 bg-white/25 rounded-full overflow-hidden">
              <div class="h-full bg-accent transition-all duration-75" :style="{ width: progressPercent + '%' }" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script>
export default {
  props: {
    visible: {
      type: Boolean,
      default: false
    },
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
    playbackRate: {
      type: Number,
      default: 1
    },
    loading: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    progressPercent() {
      if (!this.duration) return 0
      return Math.min(100, Math.max(0, (this.currentTime / this.duration) * 100))
    },
    currentTimestamp() {
      return this.$secondsToTimestamp(this.currentTime / (this.playbackRate || 1))
    },
    durationTimestamp() {
      return this.$secondsToTimestamp(this.duration / (this.playbackRate || 1))
    }
  }
}
</script>

<style scoped>
#floating-mini-player {
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1);
}

.mini-player-slide-enter-active,
.mini-player-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.mini-player-slide-enter {
  transform: translateY(100%) scale(0.9);
  opacity: 0;
}

.mini-player-slide-leave-to {
  transform: translateY(100%) scale(0.9);
  opacity: 0;
}
</style>
