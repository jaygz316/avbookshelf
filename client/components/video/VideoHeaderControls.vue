<template>
  <div class="flex items-center">
        <ui-tooltip direction="top" text="Detach Mini Player">
      <button
        aria-label="Detach Mini Player"
        class="material-symbols sm:px-2 py-1 lg:p-4 cursor-pointer text-xl sm:text-2xl text-gray-300 hover:text-white"
        @click="detachToMiniPlayer"
      >
        tab_move
      </button>
    </ui-tooltip>

        <ui-tooltip v-if="isPiPSupported" direction="top" :text="isPiPActive ? 'Exit Picture in Picture (P)' : 'Picture in Picture (P)'">
      <button
        :aria-label="isPiPActive ? 'Exit Picture in Picture' : 'Picture in Picture'"
        class="material-symbols sm:px-2 py-1 lg:p-4 cursor-pointer text-xl sm:text-2xl text-gray-300 hover:text-white"
        :class="{ 'text-accent': isPiPActive }"
        @click="togglePiP"
      >
        {{ isPiPActive ? 'pip_exit' : 'picture_in_picture_alt' }}
      </button>
    </ui-tooltip>

        <ui-tooltip direction="top" :text="playerSizeLabel">
      <button
        :aria-label="playerSizeLabel"
        class="material-symbols sm:px-2 py-1 lg:p-4 cursor-pointer text-xl sm:text-2xl text-gray-300 hover:text-white"
        @click="cyclePlayerSize"
      >
        {{ playerSizeIcon }}
      </button>
    </ui-tooltip>

        <ui-tooltip direction="top" :text="isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'">
      <button
        :aria-label="isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'"
        class="material-symbols sm:px-2 py-1 lg:p-4 cursor-pointer text-xl sm:text-2xl text-gray-300 hover:text-white"
        @click="toggleFullscreen"
      >
        {{ isFullscreen ? 'fullscreen_exit' : 'fullscreen' }}
      </button>
    </ui-tooltip>
  </div>
</template>

<script>
export default {
  props: {
    playerHandler: {
      type: Object,
      default: () => null
    }
  },
  computed: {
    videoPlayerSize() {
      return this.$store.state.videoPlayerSize || 'compact'
    },
    isPiPActive() {
      return this.$store.state.isPiPActive || false
    },
    isPiPSupported() {
      return typeof document !== 'undefined' && document.pictureInPictureEnabled
    },
    isFullscreen() {
      return this.$store.state.videoPlayerSize === 'fullscreen'
    },
    playerSizeLabel() {
      if (this.videoPlayerSize === 'compact') return 'Theater Mode'
      if (this.videoPlayerSize === 'theater') return 'Expanded Mode'
      return 'Compact Mode'
    },
    playerSizeIcon() {
      if (this.videoPlayerSize === 'compact') return 'branding_watermark'
      if (this.videoPlayerSize === 'theater') return 'aspect_ratio'
      return 'vertical_align_bottom'
    }
  },
  methods: {
    detachToMiniPlayer() {
      this.$store.commit('setIsFloatingMiniPlayer', true)
    },
    togglePiP() {
      this.playerHandler?.togglePiP?.()
    },
    cyclePlayerSize() {
      const sizes = ['compact', 'theater', 'expanded']
      const nextIdx = (sizes.indexOf(this.videoPlayerSize) + 1) % sizes.length
      this.$store.commit('setVideoPlayerSize', sizes[nextIdx])
    },
    toggleFullscreen() {
      if (this.isFullscreen) {
        this.$store.commit('setVideoPlayerSize', 'compact')
      } else {
        this.$store.commit('setVideoPlayerSize', 'fullscreen')
      }
    }
  }
}
</script>
