<template>
  <div class="w-full flex-1 min-h-0 flex justify-center items-center bg-black rounded-lg overflow-hidden relative">
    <div id="video-player-container" ref="videoContainer" class="relative w-full h-full flex items-center justify-center">
      <!-- Video DOM element is reparented here dynamically -->

      <!-- On-Video Overlay HUD with Auto-Hide, Scrubber, Gestures & Metadata -->
      <video-overlay-controls
        :title="title"
        :author="author"
        :paused="paused"
        :current-time="currentTime"
        :duration="duration"
        :buffer-time="bufferTime"
        :volume="volume"
        :playback-rate="playbackRate"
        :is-fullscreen="isFullscreen"
        :video-fit-mode="videoFitMode"
        :video-player-size="videoPlayerSize"
        :chapters="chapters"
        :current-chapter="currentChapter"
        :play-method="playMethod"
        :is-pi-p-active="isPiPActive"
        @playPause="$emit('playPause')"
        @jumpForward="$emit('jumpForward')"
        @jumpBackward="$emit('jumpBackward')"
        @prevChapter="$emit('prevChapter')"
        @nextChapter="$emit('nextChapter')"
        @seek="$emit('seek', $event)"
        @setVolume="$emit('setVolume', $event)"
        @toggleMute="$emit('toggleMute')"
        @toggleFullscreen="$emit('toggleFullscreen')"
        @togglePiP="$emit('togglePiP')"
        @detachMiniPlayer="$emit('detachMiniPlayer')"
        @cycleSize="$emit('cycleSize')"
        @setVideoFit="$emit('setVideoFit', $event)"
        @showChapters="$emit('showChapters')"
        @setPlaybackRate="$emit('setPlaybackRate', $event)"
      />

      <!-- Buffering Spinner -->
      <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-black/60 z-10 pointer-events-none">
        <svg class="animate-spin h-12 w-12 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
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
      default: true
    },
    loading: {
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
    chapters: {
      type: Array,
      default: () => []
    },
    currentChapter: {
      type: Object,
      default: () => null
    },
    playMethod: {
      type: Number,
      default: 0
    }
  },
  computed: {
    videoPlayerSize() {
      return this.$store.state.videoPlayerSize || 'compact'
    },
    videoFitMode() {
      return this.$store.state.videoFitMode || 'contain'
    },
    isPiPActive() {
      return this.$store.state.isPiPActive || false
    },
    isFullscreen() {
      return this.videoPlayerSize === 'fullscreen'
    }
  }
}
</script>
