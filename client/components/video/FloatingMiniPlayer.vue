<template>
  <div v-if="visible">
    <!-- Global capture overlay to guarantee seamless drag and resize tracking across entire viewport -->
    <div
      v-if="isDragging || isResizing"
      class="fixed inset-0 z-[99999] select-none pointer-events-auto"
      :style="{ cursor: activeCursor }"
    />

    <transition name="mini-player-slide">
      <div
        id="floating-mini-player"
        ref="floatingPlayer"
        class="fixed z-50 border border-gray-700 bg-black select-none"
        :class="[
          isMinimized ? 'rounded-full shadow-2xl' : 'rounded-xl shadow-2xl overflow-hidden group',
          isDragging ? 'ring-2 ring-accent/60' : ''
        ]"
        :style="playerStyle"
      >
        <!-- Minimized Floating Pill View -->
        <div
          v-if="isMinimized"
          class="w-full h-full flex items-center justify-between px-3 py-1 bg-black/95 backdrop-blur-md rounded-full border border-gray-700 shadow-2xl text-white cursor-grab active:cursor-grabbing select-none"
          @mousedown="startDrag"
          @touchstart="startTouchDrag"
        >
          <div class="flex items-center gap-1.5 min-w-0 pr-2 pointer-events-none">
            <span class="material-symbols text-white/40 text-xs shrink-0 select-none">drag_indicator</span>
            <span class="material-symbols text-yellow-400 text-sm shrink-0">videocam</span>
            <div class="min-w-0">
              <p class="text-white text-xs font-semibold truncate leading-tight">{{ title || 'No Title' }}</p>
              <p class="text-gray-400 text-xxs truncate leading-tight">{{ currentTimestamp }} / {{ durationTimestamp }}</p>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              :aria-label="paused ? 'Play' : 'Pause'"
              class="p-1 rounded-full bg-accent text-primary hover:scale-105 active:scale-95 transition flex items-center justify-center"
              @click.stop="$emit('playPause')"
            >
              <span class="material-symbols fill text-sm">{{ paused ? 'play_arrow' : 'pause' }}</span>
            </button>
            <ui-tooltip direction="top" text="Restore Video Player">
              <button
                aria-label="Restore Video Player"
                class="p-1 rounded-full bg-white/15 hover:bg-white/25 text-white transition active:scale-95 flex items-center justify-center"
                @click.stop="toggleMinimize"
              >
                <span class="material-symbols text-sm">expand_less</span>
              </button>
            </ui-tooltip>
            <ui-tooltip direction="top" text="Expand to Main Player">
              <button
                aria-label="Expand to Main Player"
                class="p-1 rounded-full bg-white/15 hover:bg-white/25 text-white transition active:scale-95 flex items-center justify-center"
                @click.stop="$emit('returnToPlayer')"
              >
                <span class="material-symbols text-sm">open_in_full</span>
              </button>
            </ui-tooltip>
            <ui-tooltip direction="top" text="Close Video">
              <button
                aria-label="Close Video"
                class="p-1 rounded-full bg-white/15 hover:bg-white/25 text-white transition active:scale-95 flex items-center justify-center"
                @click.stop="$emit('close')"
              >
                <span class="material-symbols text-sm">close</span>
              </button>
            </ui-tooltip>
          </div>
        </div>

        <!-- Full Floating Video Player View -->
        <div v-show="!isMinimized" class="w-full h-full relative flex items-center justify-center bg-black">
          <!-- Video Container: DOM element is mounted here -->
          <div
            id="floating-mini-video-container"
            ref="miniVideoContainer"
            class="relative flex items-center justify-center bg-black"
            :style="videoContainerStyle"
          >
            <!-- Center Loading Spinner -->
            <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-black/60 z-10 pointer-events-none">
              <svg class="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>

            <!-- Hover Overlay: Controls & Metadata -->
            <div
              class="absolute inset-0 bg-black/60 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2.5 z-20 cursor-grab active:cursor-grabbing"
              @mousedown="startDrag"
              @touchstart="startTouchDrag"
            >
              <!-- Top Bar: Title & Action Buttons -->
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 min-w-0 pr-2 pointer-events-none">
                  <span class="material-symbols text-white/50 group-hover:text-white/80 text-sm shrink-0 select-none">drag_indicator</span>
                  <div class="min-w-0">
                    <p class="text-white text-xs font-semibold truncate drop-shadow-sm">
                      {{ title || 'No Title' }}
                    </p>
                    <p v-if="author" class="text-gray-300 text-xxs truncate">
                      {{ author }}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <!-- Minimize Button -->
                  <ui-tooltip direction="bottom" text="Minimize Player (M)">
                    <button
                      aria-label="Minimize Player"
                      class="p-1 rounded bg-white/20 hover:bg-white/30 text-white transition active:scale-95 flex items-center justify-center cursor-pointer"
                      @click.stop="toggleMinimize"
                    >
                      <span class="material-symbols text-sm sm:text-base">minimize</span>
                    </button>
                  </ui-tooltip>

                  <!-- Expand / Return to Main Player -->
                  <ui-tooltip direction="bottom" text="Expand to Main Player">
                    <button
                      aria-label="Expand to Main Player"
                      class="p-1 rounded bg-white/20 hover:bg-white/30 text-white transition active:scale-95 flex items-center justify-center cursor-pointer"
                      @click.stop="$emit('returnToPlayer')"
                    >
                      <span class="material-symbols text-sm sm:text-base">open_in_full</span>
                    </button>
                  </ui-tooltip>

                  <!-- Close Mini Player -->
                  <ui-tooltip direction="bottom" text="Close Mini Player">
                    <button
                      aria-label="Close Mini Player"
                      class="p-1 rounded bg-white/20 hover:bg-white/30 text-white transition active:scale-95 flex items-center justify-center cursor-pointer"
                      @click.stop="$emit('close')"
                    >
                      <span class="material-symbols text-sm sm:text-base">close</span>
                    </button>
                  </ui-tooltip>
                </div>
              </div>

              <!-- Center Controls: Jump Back, Play/Pause, Jump Forward -->
              <div class="flex items-center justify-center gap-3">
                <button
                  aria-label="Jump Backward"
                  class="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition active:scale-95 flex items-center justify-center cursor-pointer"
                  @click.stop="$emit('jumpBackward')"
                >
                  <span class="material-symbols text-lg sm:text-xl">replay</span>
                </button>

                <button
                  :aria-label="paused ? 'Play' : 'Pause'"
                  class="p-2 sm:p-2.5 rounded-full bg-accent text-primary hover:scale-105 active:scale-95 transition shadow-lg flex items-center justify-center cursor-pointer"
                  @click.stop="$emit('playPause')"
                >
                  <span class="material-symbols fill text-xl sm:text-2xl">{{ paused ? 'play_arrow' : 'pause' }}</span>
                </button>

                <button
                  aria-label="Jump Forward"
                  class="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition active:scale-95 flex items-center justify-center cursor-pointer"
                  @click.stop="$emit('jumpForward')"
                >
                  <span class="material-symbols text-lg sm:text-xl">forward_media</span>
                </button>
              </div>

              <!-- Bottom: Timestamp and Progress Track -->
              <div
                class="w-full cursor-pointer py-1 select-none mini-scrubber"
                @mousedown.stop.prevent="startScrub"
                @touchstart.stop.prevent="startTouchScrub"
                @click.stop="onScrubberClick"
              >
                <div class="flex items-center justify-between text-xxs font-mono text-gray-300 mb-1 px-0.5 pointer-events-none">
                  <span>{{ displayCurrentTimestamp }}</span>
                  <span>{{ durationTimestamp }}</span>
                </div>
                <div ref="scrubberTrack" class="w-full h-1 sm:h-1.5 hover:h-2 bg-white/25 rounded-full overflow-hidden relative transition-all">
                  <div class="h-full bg-accent transition-all duration-75" :style="{ width: displayProgressPercent + '%' }" />
                </div>
              </div>
            </div>
          </div>

          <!-- Mouse Resize Handles: 4 corners + 4 edges -->
          <div class="resize-handle resize-handle-tl" @mousedown.stop.prevent="startResize('top-left', $event)" @touchstart.stop.prevent="startTouchResize('top-left', $event)" />
          <div class="resize-handle resize-handle-tr" @mousedown.stop.prevent="startResize('top-right', $event)" @touchstart.stop.prevent="startTouchResize('top-right', $event)" />
          <div class="resize-handle resize-handle-bl" @mousedown.stop.prevent="startResize('bottom-left', $event)" @touchstart.stop.prevent="startTouchResize('bottom-left', $event)" />
          <div class="resize-handle resize-handle-br" @mousedown.stop.prevent="startResize('bottom-right', $event)" @touchstart.stop.prevent="startTouchResize('bottom-right', $event)" />
          <div class="resize-handle resize-handle-t" @mousedown.stop.prevent="startResize('top', $event)" @touchstart.stop.prevent="startTouchResize('top', $event)" />
          <div class="resize-handle resize-handle-b" @mousedown.stop.prevent="startResize('bottom', $event)" @touchstart.stop.prevent="startTouchResize('bottom', $event)" />
          <div class="resize-handle resize-handle-l" @mousedown.stop.prevent="startResize('left', $event)" @touchstart.stop.prevent="startTouchResize('left', $event)" />
          <div class="resize-handle resize-handle-r" @mousedown.stop.prevent="startResize('right', $event)" @touchstart.stop.prevent="startTouchResize('right', $event)" />

          <!-- Visual Resize Grip in Bottom-Right Corner -->
          <div class="absolute bottom-1 right-1 pointer-events-none text-white/40 group-hover:text-white/80 transition-opacity z-30" title="Drag to resize">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 2L2 8M8 5L5 8M8 8L8 8.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </div>
        </div>
      </div>
    </transition>
  </div>
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
  data() {
    return {
      isMinimized: false,
      minimizedWidth: 320,
      minimizedHeight: 46,
      width: 384,
      height: 216,
      position: {
        left: null,
        top: null
      },
      isDragging: false,
      isResizing: false,
      activeHandle: null,
      startMouse: { x: 0, y: 0 },
      startPos: { left: 0, top: 0 },
      startSize: { width: 0, height: 0 },
      dragMouseStart: { x: 0, y: 0 },
      dragPosStart: { left: 0, top: 0 },
      isScrubbing: false,
      scrubPercent: null,
      scrubTime: null
    }
  },
  computed: {
    progressPercent() {
      if (!this.duration) return 0
      return Math.min(100, Math.max(0, (this.currentTime / this.duration) * 100))
    },
    displayProgressPercent() {
      if (this.isScrubbing && this.scrubPercent !== null) {
        return this.scrubPercent
      }
      return this.progressPercent
    },
    currentTimestamp() {
      return this.$secondsToTimestamp ? this.$secondsToTimestamp(this.currentTime / (this.playbackRate || 1)) : '00:00'
    },
    displayCurrentTimestamp() {
      if (this.isScrubbing && this.scrubTime !== null) {
        return this.$secondsToTimestamp ? this.$secondsToTimestamp(this.scrubTime / (this.playbackRate || 1)) : '00:00'
      }
      return this.currentTimestamp
    },
    durationTimestamp() {
      return this.$secondsToTimestamp ? this.$secondsToTimestamp(this.duration / (this.playbackRate || 1)) : '00:00'
    },
    playerStyle() {
      const left = this.position.left !== null ? `${this.position.left}px` : 'auto'
      const top = this.position.top !== null ? `${this.position.top}px` : 'auto'
      const right = this.position.left === null ? '24px' : 'auto'
      const bottom = this.position.top === null ? '100px' : 'auto'

      if (this.isMinimized) {
        return {
          left,
          top,
          right,
          bottom,
          width: `${this.minimizedWidth}px`,
          height: `${this.minimizedHeight}px`,
          transition: this.isDragging ? 'none' : 'width 0.25s ease, height 0.25s ease',
          touchAction: 'none'
        }
      }

      return {
        left,
        top,
        right,
        bottom,
        width: `${this.width}px`,
        height: `${this.height}px`,
        transition: (this.isDragging || this.isResizing) ? 'none' : 'width 0.2s ease, height 0.2s ease',
        touchAction: 'none'
      }
    },
    videoContainerStyle() {
      if (this.isMinimized) {
        return {
          position: 'absolute',
          width: '1px',
          height: '1px',
          opacity: '0.001',
          pointerEvents: 'none',
          overflow: 'hidden'
        }
      }
      return {
        width: '100%',
        height: '100%'
      }
    },
    activeCursor() {
      if (this.isDragging) return 'grabbing'
      if (this.activeHandle === 'top-left' || this.activeHandle === 'bottom-right') return 'nwse-resize'
      if (this.activeHandle === 'top-right' || this.activeHandle === 'bottom-left') return 'nesw-resize'
      if (this.activeHandle === 'top' || this.activeHandle === 'bottom') return 'ns-resize'
      if (this.activeHandle === 'left' || this.activeHandle === 'right') return 'ew-resize'
      return 'default'
    }
  },
  watch: {
    visible(val) {
      if (val) {
        this.$nextTick(() => {
          this.clampPositionAndSize()
        })
      }
    }
  },
  mounted() {
    if (typeof window !== 'undefined') {
      this.initPositionAndSize()
      window.addEventListener('resize', this.onWindowResize)
      window.addEventListener('keydown', this.onKeyDown)
    }
  },
  beforeDestroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onWindowResize)
      window.removeEventListener('keydown', this.onKeyDown)
      window.removeEventListener('mousemove', this.onDragMove)
      window.removeEventListener('mouseup', this.onDragEnd)
      window.removeEventListener('touchmove', this.onDragMove)
      window.removeEventListener('touchend', this.onDragEnd)
      window.removeEventListener('mousemove', this.onResizeMove)
      window.removeEventListener('mouseup', this.onResizeEnd)
      window.removeEventListener('touchmove', this.onResizeMove)
      window.removeEventListener('touchend', this.onResizeEnd)
      this.stopScrubbing()
    }

    const videoEl = document.getElementById('video-player')
    if (videoEl && this.$refs.miniVideoContainer && videoEl.parentElement === this.$refs.miniVideoContainer) {
      const mainContainer = document.getElementById('video-player-container')
      if (mainContainer) {
        mainContainer.appendChild(videoEl)
        videoEl.style.display = 'block'
        videoEl.style.width = '100%'
        videoEl.style.height = '100%'
        videoEl.style.opacity = '1'
        videoEl.style.position = 'static'
      } else {
        document.body.appendChild(videoEl)
      }
    }
  },
  methods: {
    initPositionAndSize() {
      if (typeof window === 'undefined') return

      let savedSize = null
      let savedPos = null

      try {
        const rawSize = localStorage.getItem('abs_floating_video_size')
        if (rawSize) savedSize = JSON.parse(rawSize)
        const rawPos = localStorage.getItem('abs_floating_video_pos')
        if (rawPos) savedPos = JSON.parse(rawPos)
      } catch (e) {}

      const defaultW = Math.min(420, Math.max(280, Math.round(window.innerWidth * 0.28)))
      this.width = savedSize?.width ? Number(savedSize.width) : defaultW
      this.height = Math.round(this.width * (9 / 16))

      const minW = 220
      const maxW = Math.max(minW, window.innerWidth - 16)
      this.width = Math.min(maxW, Math.max(minW, this.width))
      this.height = Math.round(this.width * (9 / 16))

      if (savedPos && savedPos.left !== null && savedPos.top !== null) {
        this.position.left = Number(savedPos.left)
        this.position.top = Number(savedPos.top)
      } else {
        const rightOffset = 24
        const bottomOffset = window.innerWidth < 768 ? 90 : 120
        this.position.left = Math.max(8, window.innerWidth - this.width - rightOffset)
        this.position.top = Math.max(8, window.innerHeight - this.height - bottomOffset)
      }

      this.clampPositionAndSize()
    },
    clampPositionAndSize() {
      if (typeof window === 'undefined') return

      const curW = this.isMinimized ? this.minimizedWidth : this.width
      const curH = this.isMinimized ? this.minimizedHeight : this.height

      if (this.position.left === null || this.position.top === null) {
        const rightOffset = 24
        const bottomOffset = window.innerWidth < 768 ? 90 : 120
        this.position.left = Math.max(8, window.innerWidth - curW - rightOffset)
        this.position.top = Math.max(8, window.innerHeight - curH - bottomOffset)
      } else {
        this.position.left = Math.max(8, Math.min(window.innerWidth - curW - 8, this.position.left))
        this.position.top = Math.max(8, Math.min(window.innerHeight - curH - 8, this.position.top))
      }
    },
    onWindowResize() {
      this.clampPositionAndSize()
    },
    onKeyDown(e) {
      if (!this.visible) return
      // Don't trigger if an input or textarea is active
      const activeEl = document.activeElement
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
        return
      }
      if (e.key === 'm' || e.key === 'M') {
        // Toggle minimize state
        this.toggleMinimize()
      }
    },
    toggleMinimize() {
      this.isMinimized = !this.isMinimized
      this.$nextTick(() => {
        this.clampPositionAndSize()
      })
    },
    getTimeFromEvent(e) {
      if (!this.duration || !this.$refs.scrubberTrack) return { time: 0, perc: 0 }
      const rect = this.$refs.scrubberTrack.getBoundingClientRect()
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width))
      const pct = rect.width ? offsetX / rect.width : 0
      return { time: pct * this.duration, perc: pct * 100 }
    },
    onScrubberClick(e) {
      const { time } = this.getTimeFromEvent(e)
      this.$emit('seek', time)
    },
    startScrub(e) {
      if (!this.duration || !this.$refs.scrubberTrack) return
      this.isScrubbing = true
      const { time, perc } = this.getTimeFromEvent(e)
      this.scrubPercent = perc
      this.scrubTime = time
      this.$emit('seek', time)

      window.addEventListener('mousemove', this.onScrubMove)
      window.addEventListener('mouseup', this.onScrubEnd)
    },
    onScrubMove(e) {
      if (!this.isScrubbing) return
      const { time, perc } = this.getTimeFromEvent(e)
      this.scrubPercent = perc
      this.scrubTime = time
      this.$emit('seek', time)
    },
    onScrubEnd(e) {
      if (!this.isScrubbing) return
      this.isScrubbing = false
      const { time } = this.getTimeFromEvent(e)
      this.scrubPercent = null
      this.scrubTime = null
      this.$emit('seek', time)

      window.removeEventListener('mousemove', this.onScrubMove)
      window.removeEventListener('mouseup', this.onScrubEnd)
    },
    startTouchScrub(e) {
      if (!this.duration || !this.$refs.scrubberTrack) return
      this.isScrubbing = true
      const { time, perc } = this.getTimeFromEvent(e)
      this.scrubPercent = perc
      this.scrubTime = time
      this.$emit('seek', time)

      window.addEventListener('touchmove', this.onTouchScrubMove, { passive: false })
      window.addEventListener('touchend', this.onTouchScrubEnd)
    },
    onTouchScrubMove(e) {
      if (!this.isScrubbing) return
      e.preventDefault()
      const { time, perc } = this.getTimeFromEvent(e)
      this.scrubPercent = perc
      this.scrubTime = time
      this.$emit('seek', time)
    },
    onTouchScrubEnd(e) {
      if (!this.isScrubbing) return
      this.isScrubbing = false
      const { time } = this.getTimeFromEvent(e)
      this.scrubPercent = null
      this.scrubTime = null
      this.$emit('seek', time)

      window.removeEventListener('touchmove', this.onTouchScrubMove)
      window.removeEventListener('touchend', this.onTouchScrubEnd)
    },
    stopScrubbing() {
      this.isScrubbing = false
      this.scrubPercent = null
      this.scrubTime = null
      window.removeEventListener('mousemove', this.onScrubMove)
      window.removeEventListener('mouseup', this.onScrubEnd)
      window.removeEventListener('touchmove', this.onTouchScrubMove)
      window.removeEventListener('touchend', this.onTouchScrubEnd)
    },
    // ================= Dragging =================
    startDrag(event) {
      if (this.isResizing || this.isScrubbing) return
      if (event.target.closest('button, a, input, .resize-handle, .mini-scrubber')) return

      this.isDragging = true
      const clientX = event.touches ? event.touches[0].clientX : event.clientX
      const clientY = event.touches ? event.touches[0].clientY : event.clientY

      this.dragMouseStart = { x: clientX, y: clientY }
      this.dragPosStart = {
        left: this.position.left !== null ? this.position.left : 8,
        top: this.position.top !== null ? this.position.top : 8
      }

      window.addEventListener('mousemove', this.onDragMove)
      window.addEventListener('mouseup', this.onDragEnd)
      window.addEventListener('touchmove', this.onDragMove, { passive: false })
      window.addEventListener('touchend', this.onDragEnd)
    },
    startTouchDrag(event) {
      this.startDrag(event)
    },
    onDragMove(event) {
      if (!this.isDragging) return
      if (event.cancelable) event.preventDefault()

      const clientX = event.touches ? event.touches[0].clientX : event.clientX
      const clientY = event.touches ? event.touches[0].clientY : event.clientY
      const dx = clientX - this.dragMouseStart.x
      const dy = clientY - this.dragMouseStart.y

      const curW = this.isMinimized ? this.minimizedWidth : this.width
      const curH = this.isMinimized ? this.minimizedHeight : this.height

      let nextLeft = this.dragPosStart.left + dx
      let nextTop = this.dragPosStart.top + dy

      nextLeft = Math.max(8, Math.min(window.innerWidth - curW - 8, nextLeft))
      nextTop = Math.max(8, Math.min(window.innerHeight - curH - 8, nextTop))

      this.position.left = Math.round(nextLeft)
      this.position.top = Math.round(nextTop)
    },
    onDragEnd() {
      this.isDragging = false
      window.removeEventListener('mousemove', this.onDragMove)
      window.removeEventListener('mouseup', this.onDragEnd)
      window.removeEventListener('touchmove', this.onDragMove)
      window.removeEventListener('touchend', this.onDragEnd)

      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('abs_floating_video_pos', JSON.stringify(this.position))
        } catch (e) {}
      }
    },
    // ================= Resizing =================
    startResize(handle, event) {
      if (this.isMinimized) return
      this.isResizing = true
      this.activeHandle = handle

      const clientX = event.touches ? event.touches[0].clientX : event.clientX
      const clientY = event.touches ? event.touches[0].clientY : event.clientY

      this.startMouse = { x: clientX, y: clientY }
      this.startPos = {
        left: this.position.left !== null ? this.position.left : 8,
        top: this.position.top !== null ? this.position.top : 8
      }
      this.startSize = { width: this.width, height: this.height }

      window.addEventListener('mousemove', this.onResizeMove)
      window.addEventListener('mouseup', this.onResizeEnd)
      window.addEventListener('touchmove', this.onResizeMove, { passive: false })
      window.addEventListener('touchend', this.onResizeEnd)
    },
    startTouchResize(handle, event) {
      this.startResize(handle, event)
    },
    onResizeMove(event) {
      if (!this.isResizing) return
      if (event.cancelable) event.preventDefault()

      const clientX = event.touches ? event.touches[0].clientX : event.clientX
      const clientY = event.touches ? event.touches[0].clientY : event.clientY
      const dx = clientX - this.startMouse.x
      const dy = clientY - this.startMouse.y

      const minW = 220
      const maxW = Math.max(minW, Math.min(window.innerWidth - 16, 1280))
      const minH = Math.round(minW * (9 / 16))
      const maxH = Math.round(maxW * (9 / 16))

      let newWidth = this.startSize.width
      let newHeight = this.startSize.height
      let newLeft = this.startPos.left
      let newTop = this.startPos.top

      switch (this.activeHandle) {
        case 'bottom-right':
        case 'right': {
          newWidth = Math.min(maxW, Math.max(minW, this.startSize.width + dx))
          newHeight = Math.round(newWidth * (9 / 16))
          break
        }
        case 'bottom': {
          newHeight = Math.min(maxH, Math.max(minH, this.startSize.height + dy))
          newWidth = Math.round(newHeight * (16 / 9))
          break
        }
        case 'bottom-left':
        case 'left': {
          newWidth = Math.min(maxW, Math.max(minW, this.startSize.width - dx))
          newHeight = Math.round(newWidth * (9 / 16))
          newLeft = this.startPos.left + (this.startSize.width - newWidth)
          break
        }
        case 'top-right': {
          newWidth = Math.min(maxW, Math.max(minW, this.startSize.width + dx))
          newHeight = Math.round(newWidth * (9 / 16))
          newTop = this.startPos.top + (this.startSize.height - newHeight)
          break
        }
        case 'top': {
          newHeight = Math.min(maxH, Math.max(minH, this.startSize.height - dy))
          newWidth = Math.round(newHeight * (16 / 9))
          newTop = this.startPos.top + (this.startSize.height - newHeight)
          break
        }
        case 'top-left': {
          newWidth = Math.min(maxW, Math.max(minW, this.startSize.width - dx))
          newHeight = Math.round(newWidth * (9 / 16))
          newLeft = this.startPos.left + (this.startSize.width - newWidth)
          newTop = this.startPos.top + (this.startSize.height - newHeight)
          break
        }
      }

      // Keep within viewport bounds
      if (newLeft < 8) {
        newWidth -= (8 - newLeft)
        newHeight = Math.round(newWidth * (9 / 16))
        newLeft = 8
      }
      if (newTop < 8) {
        newHeight -= (8 - newTop)
        newWidth = Math.round(newHeight * (16 / 9))
        newTop = 8
      }
      if (newLeft + newWidth > window.innerWidth - 8) {
        newWidth = window.innerWidth - 8 - newLeft
        newHeight = Math.round(newWidth * (9 / 16))
      }
      if (newTop + newHeight > window.innerHeight - 8) {
        newHeight = window.innerHeight - 8 - newTop
        newWidth = Math.round(newHeight * (16 / 9))
      }

      this.width = Math.round(Math.max(minW, newWidth))
      this.height = Math.round(Math.max(minH, newHeight))
      this.position.left = Math.round(newLeft)
      this.position.top = Math.round(newTop)
    },
    onResizeEnd() {
      this.isResizing = false
      this.activeHandle = null
      window.removeEventListener('mousemove', this.onResizeMove)
      window.removeEventListener('mouseup', this.onResizeEnd)
      window.removeEventListener('touchmove', this.onResizeMove)
      window.removeEventListener('touchend', this.onResizeEnd)

      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('abs_floating_video_size', JSON.stringify({ width: this.width, height: this.height }))
          localStorage.setItem('abs_floating_video_pos', JSON.stringify(this.position))
        } catch (e) {}
      }
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

.resize-handle {
  position: absolute;
  z-index: 40;
}
.resize-handle-tl {
  top: -4px;
  left: -4px;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
}
.resize-handle-tr {
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  cursor: nesw-resize;
}
.resize-handle-bl {
  bottom: -4px;
  left: -4px;
  width: 14px;
  height: 14px;
  cursor: nesw-resize;
}
.resize-handle-br {
  bottom: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
}
.resize-handle-t {
  top: -3px;
  left: 10px;
  right: 10px;
  height: 8px;
  cursor: ns-resize;
}
.resize-handle-b {
  bottom: -3px;
  left: 10px;
  right: 10px;
  height: 8px;
  cursor: ns-resize;
}
.resize-handle-l {
  left: -3px;
  top: 10px;
  bottom: 10px;
  width: 8px;
  cursor: ew-resize;
}
.resize-handle-r {
  right: -3px;
  top: 10px;
  bottom: 10px;
  width: 8px;
  cursor: ew-resize;
}
</style>

