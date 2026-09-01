<template>
  <div>
    <!-- Main Media Player Container -->
    <div
      v-if="streamLibraryItem"
      id="mediaPlayerContainer"
      class="w-full fixed bottom-0 left-0 right-0 z-50 bg-primary px-2 lg:px-4 pb-1 lg:pb-4 pt-2 transition-all duration-300 flex flex-col justify-between"
      :class="containerHeightClass"
    >
      <!-- Metadata Header Bar: Shown in compact mode or when video panel is collapsed -->
      <div class="relative" :class="{ 'hidden': videoVisible }">
        <div class="absolute left-0 top-0 cursor-pointer">
          <covers-book-cover expand-on-click :library-item="streamLibraryItem" :width="bookCoverWidth" :book-cover-aspect-ratio="coverAspectRatio" />
        </div>
        <div class="flex items-start" :class="[isSquareCover ? 'pl-18 sm:pl-24' : 'pl-12 sm:pl-16', 'mb-6 lg:mb-0']">
          <div class="min-w-0 w-full">
            <div class="flex items-center">
              <nuxt-link :to="`/item/${streamLibraryItem.id}`" class="hover:underline cursor-pointer text-sm sm:text-lg block truncate">
                {{ title }}
              </nuxt-link>
              <widgets-explicit-indicator v-if="isExplicit" />
              <ui-tooltip v-if="isVideoEpisode" text="Video" direction="top">
                <span class="material-symbols text-yellow-400 text-base ml-1.5" aria-hidden="true">videocam</span>
              </ui-tooltip>
            </div>
            <div class="text-gray-400 flex items-center w-1/2 sm:w-4/5 lg:w-2/5">
              <span class="material-symbols text-sm">person</span>
              <div v-if="podcastAuthor" class="pl-1 sm:pl-1.5 text-xs sm:text-base truncate">{{ podcastAuthor }}</div>
              <div v-else-if="authors.length" class="pl-1 sm:pl-1.5 text-xs sm:text-base truncate">
                <nuxt-link v-for="(author, index) in authors" :key="index" :to="`/author/${author.id}`" class="hover:underline">{{ author.name }}<span v-if="index < authors.length - 1">,&nbsp;</span></nuxt-link>
              </div>
              <div v-else class="text-xs sm:text-base cursor-pointer pl-1 sm:pl-1.5">{{ $strings.LabelUnknown }}</div>
            </div>

            <div class="text-gray-400 flex items-center">
              <span class="material-symbols text-xs">schedule</span>
              <p class="font-mono text-xs sm:text-sm pl-1 sm:pl-1.5 pb-px">{{ totalDurationPretty }}</p>
            </div>
          </div>
          <div class="grow" />

          <!-- Video Controls in Header Bar when video is available -->
          <video-header-controls v-if="isVideoEpisode" :player-handler="playerHandler" />

          <ui-tooltip direction="top" :text="$strings.LabelClosePlayer">
            <button :aria-label="$strings.LabelClosePlayer" class="material-symbols sm:px-2 py-1 lg:p-4 cursor-pointer text-xl sm:text-2xl" @click="closePlayer">close</button>
          </ui-tooltip>
        </div>
      </div>

      <!-- Video Canvas Panel: Rendered when video is active and in theater/expanded mode -->
      <video-player-viewport
        v-show="videoVisible"
        :title="title"
        :author="podcastAuthor || (authors.length ? authors[0].name : '')"
        :paused="!isPlaying"
        :loading="playerLoading && isVideoEpisode"
        :current-time="currentTime"
        :duration="totalDuration"
        :buffer-time="bufferTime"
        :volume="currentVolume"
        :playback-rate="currentPlaybackRate"
        :chapters="chapters"
        :current-chapter="currentChapter"
        :play-method="currentPlayMethod"
        @playPause="playPause"
        @jumpForward="jumpForward"
        @jumpBackward="jumpBackward"
        @prevChapter="prevChapter"
        @nextChapter="nextChapter"
        @seek="seek"
        @setVolume="setVolume"
        @toggleMute="toggleMute"
        @toggleFullscreen="toggleFullscreen"
        @togglePiP="togglePiP"
        @detachMiniPlayer="detachToMiniPlayer"
        @cycleSize="cyclePlayerSize"
        @setVideoFit="setVideoFit"
        @showChapters="showChapters"
        @setPlaybackRate="setPlaybackRate"
      />

      <!-- Bottom Audio / Main Control Bar: Only shown when video canvas is NOT active -->
      <player-ui
        v-show="!videoVisible"
        ref="audioPlayer"
        :chapters="chapters"
        :current-chapter="currentChapter"
        :paused="!isPlaying"
        :loading="playerLoading"
        :bookmarks="bookmarks"
        :sleep-timer-set="sleepTimerSet"
        :sleep-timer-remaining="sleepTimerRemaining"
        :sleep-timer-type="sleepTimerType"
        :is-podcast="isPodcast"
        :hasNextItemInQueue="hasNextItemInQueue"
        @playPause="playPause"
        @jumpForward="jumpForward"
        @jumpBackward="jumpBackward"
        @setVolume="setVolume"
        @setPlaybackRate="setPlaybackRate"
        @seek="seek"
        @nextItemInQueue="playNextItemInQueue"
        @close="closePlayer"
        @showBookmarks="showBookmarks"
        @showSleepTimer="showSleepTimerModal = true"
        @showPlayerQueueItems="showPlayerQueueItemsModal = true"
        @toggleFullscreen="toggleFullscreen"
        @togglePiP="togglePiP"
        @cycleSize="cyclePlayerSize"
        @cycleVideoFit="cycleVideoFit"
      />

      <!-- Modals -->
      <modals-bookmarks-modal v-model="showBookmarksModal" :bookmarks="bookmarks" :current-time="bookmarkCurrentTime" :playback-rate="currentPlaybackRate" :library-item-id="libraryItemId" @select="selectBookmark" />
      <modals-sleep-timer-modal v-model="showSleepTimerModal" :timer-set="sleepTimerSet" :timer-type="sleepTimerType" :remaining="sleepTimerRemaining" :has-chapters="!!chapters.length" @set="setSleepTimer" @cancel="cancelSleepTimer" @increment="incrementSleepTimer" @decrement="decrementSleepTimer" />
      <modals-player-queue-items-modal v-model="showPlayerQueueItemsModal" />
    </div>

    <!-- Detached Floating In-App Mini Player -->
    <player-floating-mini-player
      :visible="isVideoEpisode && isFloatingMiniPlayer"
      :title="title"
      :author="podcastAuthor || (authors.length ? authors[0].name : '')"
      :paused="!isPlaying"
      :current-time="currentTime"
      :duration="totalDuration"
      :playback-rate="currentPlaybackRate"
      :loading="playerLoading"
      @playPause="playPause"
      @jumpForward="jumpForward"
      @jumpBackward="jumpBackward"
      @returnToPlayer="returnFromMiniPlayer"
      @close="closeMiniPlayer"
    />
  </div>
</template>

<script>
import PlayerHandler from '@/players/PlayerHandler'
import { isVideoEpisode } from '@/video/videoUtils'
import { updatePlayerHeightCss, mountVideoElement } from '@/video/videoMountManager'

export default {
  data() {
    return {
      playerHandler: new PlayerHandler(this),
      isFullscreen: false,
      previousVideoPlayerSize: null,
      previousWasFloatingMini: false,
      totalDuration: 0,
      showBookmarksModal: false,
      bookmarkCurrentTime: 0,
      playerLoading: false,
      isPlaying: false,
      currentTime: 0,
      bufferTime: 0,
      currentVolume: 1,
      showSleepTimerModal: false,
      showPlayerQueueItemsModal: false,
      sleepTimerSet: false,
      sleepTimerRemaining: 0,
      sleepTimerType: null,
      sleepTimer: null,
      displayTitle: null,
      currentPlaybackRate: 1,
      syncFailedToast: null,
      coverAspectRatio: 1,
      lastChapterId: null
    }
  },
  watch: {
    isVideoEpisode(val) {
      if (!val) {
        this.$store.commit('setVideoPlayerSize', 'compact')
        this.$store.commit('setFloatingMiniPlayer', false)
      }
      this.updatePlayerHeightCss()
      this.updateVideoElementMount()
    },
    videoPlayerSize() {
      this.updatePlayerHeightCss()
      this.updateVideoElementMount()
    },
    isFloatingMiniPlayer() {
      this.updatePlayerHeightCss()
      this.updateVideoElementMount()
    },
    videoFitMode(mode) {
      this.playerHandler.setVideoFit(mode)
      const videoEl = document.getElementById('video-player')
      if (videoEl) {
        videoEl.style.objectFit = mode || 'contain'
      }
    },
    videoPoster(newPoster) {
      this.$nextTick(() => {
        const videoEl = document.getElementById('video-player')
        if (videoEl) {
          if (newPoster) {
            videoEl.setAttribute('poster', newPoster)
          } else {
            videoEl.removeAttribute('poster')
          }
        }
      })
    }
  },
  computed: {
    videoPlayerSize() {
      return this.$store.state.videoPlayerSize || 'compact'
    },
    isFloatingMiniPlayer() {
      return this.$store.state.isFloatingMiniPlayer || false
    },
    isPiPActive() {
      return this.$store.state.isPiPActive || false
    },
    videoFitMode() {
      return this.$store.state.videoFitMode || 'contain'
    },
    isPiPSupported() {
      return typeof document !== 'undefined' && !!document.pictureInPictureEnabled
    },
    videoVisible() {
      return this.isVideoEpisode && !this.isFloatingMiniPlayer && ['theater', 'expanded', 'fullscreen'].includes(this.videoPlayerSize)
    },
    containerHeightClass() {
      if (this.isFloatingMiniPlayer || !this.isVideoEpisode || this.videoPlayerSize === 'compact') {
        return 'h-48 lg:h-40'
      }
      if (this.videoPlayerSize === 'theater') {
        return 'h-[60vh] max-h-[650px] p-2'
      }
      if (this.videoPlayerSize === 'expanded' || this.videoPlayerSize === 'fullscreen') {
        return 'h-[85vh] max-h-[950px] p-2'
      }
      return 'h-48 lg:h-40'
    },
    playerSizeLabel() {
      if (this.videoPlayerSize === 'compact') return 'Theater Mode (T)'
      if (this.videoPlayerSize === 'theater') return 'Expanded Mode (T)'
      if (this.videoPlayerSize === 'expanded') return 'Compact Bar (T)'
      return 'Player Size (T)'
    },
    playerSizeIcon() {
      if (this.videoPlayerSize === 'compact') return 'fit_screen'
      if (this.videoPlayerSize === 'theater') return 'fullscreen'
      if (this.videoPlayerSize === 'expanded') return 'crop_landscape'
      return 'fit_screen'
    },
    currentPlayMethod() {
      if (!this.isVideoEpisode) return ''
      return this.playerHandler?.isHlsTranscode ? 'HLS Transcode' : 'Direct Play'
    },
    videoPoster() {
      if (!this.streamLibraryItem) return ''
      return this.$store.getters['globals/getLibraryItemCoverSrc'](this.streamLibraryItem) || ''
    },
    isSquareCover() {
      return this.coverAspectRatio === 1
    },
    isMobile() {
      return this.$store.state.globals.isMobile
    },
    bookCoverWidth() {
      if (this.isMobile) return 64 / this.coverAspectRatio
      return 77 / this.coverAspectRatio
    },
    cover() {
      if (this.media.coverPath) return this.media.coverPath
      return 'Logo.png'
    },
    user() {
      return this.$store.state.user.user
    },
    userMediaProgress() {
      if (!this.libraryItemId) return
      return this.$store.getters['user/getUserMediaProgress'](this.libraryItemId)
    },
    userItemCurrentTime() {
      return this.userMediaProgress ? this.userMediaProgress.currentTime || 0 : 0
    },
    bookmarks() {
      if (!this.libraryItemId) return []
      return this.$store.getters['user/getUserBookmarksForItem'](this.libraryItemId)
    },
    streamLibraryItem() {
      return this.$store.state.streamLibraryItem
    },
    streamEpisode() {
      if (!this.$store.state.streamEpisodeId) return null
      const episodes = this.streamLibraryItem.media.episodes || []
      return episodes.find((ep) => ep.id === this.$store.state.streamEpisodeId)
    },
    libraryItemId() {
      return this.streamLibraryItem?.id || null
    },
    media() {
      return this.streamLibraryItem?.media || {}
    },
    isPodcast() {
      return this.streamLibraryItem?.mediaType === 'podcast'
    },
    isVideoEpisode() {
      return isVideoEpisode(this.streamEpisode)
    },
    isExplicit() {
      return !!this.mediaMetadata.explicit
    },
    mediaMetadata() {
      return this.media.metadata || {}
    },
    chapters() {
      if (this.streamEpisode) return this.streamEpisode.chapters || []
      return this.media.chapters || []
    },
    currentChapter() {
      return this.chapters.find((chapter) => chapter.start <= this.currentTime && this.currentTime < chapter.end)
    },
    title() {
      if (this.playerHandler.displayTitle) return this.playerHandler.displayTitle
      return this.mediaMetadata.title || 'No Title'
    },
    authors() {
      return this.mediaMetadata.authors || []
    },
    libraryId() {
      return this.streamLibraryItem?.libraryId || null
    },
    totalDurationPretty() {
      return this.$secondsToTimestamp(this.totalDuration / this.currentPlaybackRate)
    },
    podcastAuthor() {
      if (!this.isPodcast) return null
      return this.mediaMetadata.author || this.$strings.LabelUnknown
    },
    hasNextItemInQueue() {
      return this.currentPlayerQueueIndex < this.playerQueueItems.length - 1
    },
    currentPlayerQueueIndex() {
      if (!this.libraryItemId) return -1
      return this.playerQueueItems.findIndex((i) => {
        if (this.streamEpisode?.id) return i.episodeId === this.streamEpisode.id
        return i.libraryItemId === this.libraryItemId
      })
    },
    playerQueueItems() {
      return this.$store.state.playerQueueItems || []
    }
  },
  methods: {
    updatePlayerHeightCss() {
      updatePlayerHeightCss({
        isVideoEpisode: this.isVideoEpisode,
        videoPlayerSize: this.videoPlayerSize,
        isFloatingMiniPlayer: this.isFloatingMiniPlayer
      })
    },
    cyclePlayerSize() {
      if (this.isFullscreen) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {})
        }
      }
      const sizes = ['theater', 'expanded', 'compact']
      const current = this.videoPlayerSize
      const idx = sizes.indexOf(current)
      const next = sizes[(idx + 1) % sizes.length]

      if (this.isFloatingMiniPlayer) {
        this.$store.commit('setFloatingMiniPlayer', false)
      }
      this.$store.commit('setVideoPlayerSize', next)
      this.updateVideoElementMount()
    },
    toggleFullscreen() {
      if (!this.isVideoEpisode) return

      if (!this.isFullscreen) {
        this.previousVideoPlayerSize = this.videoPlayerSize
        this.previousWasFloatingMini = this.isFloatingMiniPlayer

        if (this.isFloatingMiniPlayer) {
          this.$store.commit('setFloatingMiniPlayer', false)
        }
        if (!['theater', 'expanded', 'fullscreen'].includes(this.videoPlayerSize)) {
          this.$store.commit('setVideoPlayerSize', 'expanded')
        }

        this.$nextTick(() => {
          this.updateVideoElementMount()
          this.$nextTick(() => {
            const container = this.$refs.videoContainer || document.getElementById('video-player-container')
            if (container) {
              container.requestFullscreen().then(() => {
                this.isFullscreen = true
                this.$store.commit('setPlayerIsFullscreen', true)
              }).catch((err) => {
                console.warn('Fullscreen request failed:', err)
              })
            }
          })
        })
      } else {
        // Exiting Fullscreen
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {})
        }
        this.isFullscreen = false
        this.$store.commit('setPlayerIsFullscreen', false)
        if (this.previousWasFloatingMini) {
          this.$store.commit('setFloatingMiniPlayer', true)
          this.$store.commit('setVideoPlayerSize', 'compact')
        } else if (this.previousVideoPlayerSize) {
          this.$store.commit('setVideoPlayerSize', this.previousVideoPlayerSize)
        }
        this.$nextTick(() => {
          this.updateVideoElementMount()
        })
      }
    },
    onFullscreenChange() {
      const isFs = !!document.fullscreenElement
      this.isFullscreen = isFs
      this.$store.commit('setPlayerIsFullscreen', isFs)
      if (!isFs) {
        if (this.previousWasFloatingMini) {
          this.$store.commit('setFloatingMiniPlayer', true)
          this.$store.commit('setVideoPlayerSize', 'compact')
        } else if (this.previousVideoPlayerSize && this.previousVideoPlayerSize === 'compact') {
          this.$store.commit('setVideoPlayerSize', 'compact')
        }
        this.$nextTick(() => {
          this.updateVideoElementMount()
        })
      }
    },
    togglePiP() {
      if (this.isFloatingMiniPlayer) {
        this.returnFromMiniPlayer()
      } else {
        this.detachToMiniPlayer()
      }
    },
    setVideoFit(mode) {
      if (this.$store.state.videoFitMode !== mode) {
        this.$store.commit('setVideoFitMode', mode)
      }
      this.playerHandler.setVideoFit(mode)
      const videoEl = document.getElementById('video-player')
      if (videoEl) {
        videoEl.style.objectFit = mode || 'contain'
      }
    },
    cycleVideoFit() {
      const modes = ['contain', 'cover', 'fill']
      const idx = modes.indexOf(this.videoFitMode)
      const next = modes[(idx + 1) % modes.length]
      this.setVideoFit(next)
    },
    detachToMiniPlayer() {
      this.$store.commit('setFloatingMiniPlayer', true)
      this.$store.commit('setVideoPlayerSize', 'compact')
      this.updateVideoElementMount()
    },
    returnFromMiniPlayer() {
      this.$store.commit('setFloatingMiniPlayer', false)
      this.$store.commit('setVideoPlayerSize', 'theater')
      this.updateVideoElementMount()
    },
    closeMiniPlayer() {
      this.$store.commit('setFloatingMiniPlayer', false)
      this.updateVideoElementMount()
    },
    updateVideoElementMount() {
      this.$nextTick(() => {
        const videoEl = document.getElementById('video-player')
        if (!videoEl) return

        if (this.videoPoster) {
          videoEl.setAttribute('poster', this.videoPoster)
        } else {
          videoEl.removeAttribute('poster')
        }

        if (this.videoFitMode) {
          videoEl.style.objectFit = this.videoFitMode
        }

        mountVideoElement({
          isVideoEpisode: this.isVideoEpisode,
          isFloatingMiniPlayer: this.isFloatingMiniPlayer,
          videoVisible: this.videoVisible
        })
      })
    },
    closePlayer() {
      this.$store.commit('setVideoPlayerSize', 'compact')
      this.$store.commit('setFloatingMiniPlayer', false)
      this.$store.commit('setPiPActive', false)
      this.updatePlayerHeightCss()
      this.updateVideoElementMount()
      this.playerHandler.closePlayer()
      this.$store.commit('setMediaPlaying', null)
    },
    mediaFinished(libraryItemId, episodeId) {
      // Play next item in queue
      if (!this.playerQueueItems.length || !this.$store.state.playerQueueAutoPlay) {
        return
      }
      var currentQueueIndex = this.playerQueueItems.findIndex((i) => {
        if (episodeId) return i.libraryItemId === libraryItemId && i.episodeId === episodeId
        return i.libraryItemId === libraryItemId
      })
      if (currentQueueIndex < 0) {
        currentQueueIndex = -1
      }
      if (currentQueueIndex === this.playerQueueItems.length - 1) {
        return
      }
      const nextItemInQueue = this.playerQueueItems[currentQueueIndex + 1]
      if (nextItemInQueue) {
        this.playLibraryItem({
          libraryItemId: nextItemInQueue.libraryItemId,
          episodeId: nextItemInQueue.episodeId || null,
          queueItems: this.playerQueueItems
        })
      }
    },
    setPlaying(isPlaying) {
      this.isPlaying = isPlaying
      this.$store.commit('setIsPlaying', isPlaying)
      this.updateMediaSessionPlaybackState()
    },
    setSleepTimer(time) {
      this.sleepTimerSet = true
      this.showSleepTimerModal = false

      this.sleepTimerType = time.timerType
      if (this.sleepTimerType === this.$constants.SleepTimerTypes.COUNTDOWN) {
        this.runSleepTimer(time)
      }
    },
    runSleepTimer(time) {
      this.sleepTimerRemaining = time.seconds

      var lastTick = Date.now()
      clearInterval(this.sleepTimer)
      this.sleepTimer = setInterval(() => {
        var elapsed = Date.now() - lastTick
        lastTick = Date.now()
        this.sleepTimerRemaining -= elapsed / 1000

        if (this.sleepTimerRemaining <= 0) {
          this.sleepTimerEnd()
        }
      }, 1000)
    },
    checkChapterEnd() {
      if (!this.currentChapter) return

      // Track chapter transitions by comparing current chapter with last chapter
      if (this.lastChapterId !== this.currentChapter.id) {
        if (this.lastChapterId) {
          this.sleepTimerEnd()
        }
        this.lastChapterId = this.currentChapter.id
      }
    },
    sleepTimerEnd() {
      this.clearSleepTimer()
      this.playerHandler.pause()
      this.$toast.info(this.$strings.ToastSleepTimerDone)
    },
    cancelSleepTimer() {
      this.showSleepTimerModal = false
      this.clearSleepTimer()
    },
    clearSleepTimer() {
      clearInterval(this.sleepTimer)
      this.sleepTimerRemaining = 0
      this.sleepTimer = null
      this.sleepTimerSet = false
      this.sleepTimerType = null
    },
    incrementSleepTimer(amount) {
      if (!this.sleepTimerSet) return
      this.sleepTimerRemaining += amount
    },
    decrementSleepTimer(amount) {
      if (this.sleepTimerRemaining < amount) {
        this.sleepTimerRemaining = 3
        return
      }
      this.sleepTimerRemaining = Math.max(0, this.sleepTimerRemaining - amount)
    },
    playPause() {
      this.playerHandler.playPause()
    },
    jumpForward() {
      this.playerHandler.jumpForward()
    },
    jumpBackward() {
      this.playerHandler.jumpBackward()
    },
    prevChapter() {
      if (this.$refs.audioPlayer) {
        this.$refs.audioPlayer.prevChapter()
      }
    },
    nextChapter() {
      if (this.$refs.audioPlayer) {
        this.$refs.audioPlayer.goToNext()
      }
    },
    showChapters() {
      if (this.$refs.audioPlayer) {
        this.$refs.audioPlayer.showChapters()
      }
    },
    toggleMute() {
      if (this.$refs.audioPlayer) {
        this.$refs.audioPlayer.toggleMute()
      }
    },
    setVolume(volume) {
      this.currentVolume = volume
      this.playerHandler.setVolume(volume)
      if (this.$refs.audioPlayer) {
        this.$refs.audioPlayer.volume = volume
      }
    },
    setPlaybackRate(playbackRate) {
      this.currentPlaybackRate = playbackRate
      this.playerHandler.setPlaybackRate(playbackRate)
      if (this.$refs.audioPlayer) {
        this.$refs.audioPlayer.playbackRate = playbackRate
      }
    },
    seek(time) {
      this.playerHandler.seek(time)
    },
    playbackTimeUpdate(time) {
      this.playerHandler.seek(time, false)
    },
    setCurrentTime(time) {
      this.currentTime = time
      if (this.$refs.audioPlayer) {
        this.$refs.audioPlayer.setCurrentTime(time)
      }

      if (this.sleepTimerType === this.$constants.SleepTimerTypes.CHAPTER && this.sleepTimerSet) {
        this.checkChapterEnd()
      }
    },
    setDuration(duration) {
      this.totalDuration = duration
      if (this.$refs.audioPlayer) {
        this.$refs.audioPlayer.setDuration(duration)
      }
    },
    setBufferTime(buffertime) {
      this.bufferTime = buffertime
      if (this.$refs.audioPlayer) {
        this.$refs.audioPlayer.setBufferTime(buffertime)
      }
    },
    showBookmarks() {
      this.bookmarkCurrentTime = this.currentTime
      this.showBookmarksModal = true
    },
    selectBookmark(bookmark) {
      this.seek(bookmark.time)
      this.showBookmarksModal = false
    },
    mediaSessionPlay() {
      this.playerHandler.play()
    },
    mediaSessionPause() {
      this.playerHandler.pause()
    },
    mediaSessionStop() {
      this.playerHandler.pause()
    },
    mediaSessionSeekBackward() {
      this.playerHandler.jumpBackward()
    },
    mediaSessionSeekForward() {
      this.playerHandler.jumpForward()
    },
    mediaSessionSeekTo(e) {
      if (e.seekTime !== null && !isNaN(e.seekTime)) {
        this.playerHandler.seek(e.seekTime)
      }
    },
    mediaSessionPreviousTrack() {
      if (this.$refs.audioPlayer) {
        this.$refs.audioPlayer.prevChapter()
      }
    },
    mediaSessionNextTrack() {
      if (this.$refs.audioPlayer) {
        this.$refs.audioPlayer.nextChapter()
      }
    },
    updateMediaSessionPlaybackState() {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused'
      }
    },
    setMediaSession() {
      if (!this.streamLibraryItem) {
        console.error('setMediaSession: No library item set')
        return
      }

      if ('mediaSession' in navigator) {
        const chapterInfo = []
        if (this.chapters.length) {
          this.chapters.forEach((chapter) => {
            chapterInfo.push({
              title: chapter.title,
              startTime: chapter.start
            })
          })
        }

        navigator.mediaSession.metadata = new MediaMetadata({
          title: this.title,
          artist: this.playerHandler.displayAuthor || this.mediaMetadata.authorName || 'Unknown',
          album: this.mediaMetadata.seriesName || '',
          artwork: [
            {
              src: this.$store.getters['globals/getLibraryItemCoverSrc'](this.streamLibraryItem, '/Logo.png', true)
            }
          ],
          chapterInfo
        })

        navigator.mediaSession.setActionHandler('play', this.mediaSessionPlay)
        navigator.mediaSession.setActionHandler('pause', this.mediaSessionPause)
        navigator.mediaSession.setActionHandler('stop', this.mediaSessionStop)
        navigator.mediaSession.setActionHandler('seekbackward', this.mediaSessionSeekBackward)
        navigator.mediaSession.setActionHandler('seekforward', this.mediaSessionSeekForward)
        navigator.mediaSession.setActionHandler('seekto', this.mediaSessionSeekTo)
        navigator.mediaSession.setActionHandler('previoustrack', this.mediaSessionSeekBackward)
        navigator.mediaSession.setActionHandler('nexttrack', this.mediaSessionSeekForward)
      }
    },
    streamProgress(data) {
      if (this.playerHandler.isPlayingLocalItem && this.playerHandler.currentStreamId === data.stream) {
        if (!data.numSegments) return
        var chunks = data.chunks
        if (this.$refs.audioPlayer) {
          this.$refs.audioPlayer.setChunksReady(chunks, data.numSegments)
        }
      }
    },
    sessionOpen(session) {
      this.$store.commit('setMediaPlaying', {
        libraryItem: session.libraryItem,
        episodeId: session.episodeId
      })
      this.playerHandler.prepareOpenSession(session, this.currentPlaybackRate)
    },
    streamOpen(session) {
    },
    streamClosed(streamId) {
      if (this.playerHandler.isPlayingLocalItem && this.playerHandler.currentStreamId === streamId) {
        this.playerHandler.closePlayer()
      }
    },
    streamReady() {
      if (this.$refs.audioPlayer) {
        this.$refs.audioPlayer.setStreamReady()
      }
    },
    streamError(streamId) {
      if (this.playerHandler.isPlayingLocalItem && this.playerHandler.currentStreamId === streamId) {
        this.playerHandler.closePlayer()
      }
    },
    streamReset({ startTime, streamId }) {
      this.playerHandler.resetStream(startTime, streamId)
    },
    castSessionActive(isActive) {
      if (isActive && this.playerHandler.isPlayingLocalItem) {
        this.playerHandler.switchPlayer()
      } else if (!isActive && this.playerHandler.isPlayingCastedItem) {
        this.playerHandler.switchPlayer()
      }
    },
    playNextItemInQueue() {
      if (this.hasNextItemInQueue) {
        this.playQueueItem({ index: this.currentPlayerQueueIndex + 1 })
      }
    },
    playQueueItem(payload) {
      if (payload?.index === undefined) {
        console.error('playQueueItem: No index provided')
        return
      }
      if (!this.playerQueueItems[payload.index]) {
        console.error('playQueueItem: No item found at index', payload.index)
        return
      }
      const item = this.playerQueueItems[payload.index]
      this.playLibraryItem({
        libraryItemId: item.libraryItemId,
        episodeId: item.episodeId || null,
        queueItems: this.playerQueueItems
      })
    },
    async playLibraryItem(payload) {
      const libraryItemId = payload.libraryItemId
      const episodeId = payload.episodeId || null

      if (this.playerHandler.libraryItemId == libraryItemId && this.playerHandler.episodeId == episodeId) {
        if (payload.startTime !== null && !isNaN(payload.startTime)) {
          this.seek(payload.startTime)
        } else {
          this.playerHandler.play()
        }
        return
      }

      const libraryItem = await this.$axios.$get(`/api/items/${libraryItemId}?expanded=1`).catch((error) => {
        console.error('Failed to fetch full item', error)
        return null
      })
      if (!libraryItem) return

      this.$store.commit('setMediaPlaying', {
        libraryItem,
        episodeId,
        queueItems: payload.queueItems || []
      })
      this.coverAspectRatio = this.$store.getters['libraries/getBookCoverAspectRatio']

      const episodes = libraryItem.media?.episodes || []
      const episode = episodes.find((ep) => ep.id === episodeId)
      const isVideo = isVideoEpisode(episode)

      if (isVideo) {
        this.$store.commit('setVideoPlayerSize', 'expanded')
        this.$store.commit('setFloatingMiniPlayer', false)
      } else {
        this.$store.commit('setVideoPlayerSize', 'compact')
        this.$store.commit('setFloatingMiniPlayer', false)
      }

      this.updatePlayerHeightCss()

      this.$nextTick(() => {
        if (this.$refs.audioPlayer) this.$refs.audioPlayer.checkUpdateChapterTrack()
        this.updateVideoElementMount()
      })

      this.playerHandler.load(libraryItem, episodeId, true, this.currentPlaybackRate, payload.startTime)
    },
    pauseItem() {
      this.playerHandler.pause()
    },
    showFailedProgressSyncs() {
      if (!isNaN(this.syncFailedToast)) this.$toast.dismiss(this.syncFailedToast)
      this.syncFailedToast = this.$toast(this.$strings.ToastProgressIsNotBeingSynced, { timeout: false, type: 'error' })
    },
    sessionClosedEvent(sessionId) {
      if (this.playerHandler.currentSessionId === sessionId) {
        console.log('sessionClosedEvent closing current session', sessionId)
        this.playerHandler.resetPlayer()
        this.$store.commit('setMediaPlaying', null)
      }
    }
  },
  mounted() {
    this.updatePlayerHeightCss()
    document.addEventListener('fullscreenchange', this.onFullscreenChange)
    this.$eventBus.$on('cast-session-active', this.castSessionActive)
    this.$eventBus.$on('playback-seek', this.seek)
    this.$eventBus.$on('playback-time-update', this.playbackTimeUpdate)
    this.$eventBus.$on('play-queue-item', this.playQueueItem)
    this.$eventBus.$on('play-item', this.playLibraryItem)
    this.$eventBus.$on('pause-item', this.pauseItem)
  },
  beforeDestroy() {
    document.removeEventListener('fullscreenchange', this.onFullscreenChange)
    this.$eventBus.$off('cast-session-active', this.castSessionActive)
    this.$eventBus.$off('playback-seek', this.seek)
    this.$eventBus.$off('playback-time-update', this.playbackTimeUpdate)
    this.$eventBus.$off('play-queue-item', this.playQueueItem)
    this.$eventBus.$off('play-item', this.playLibraryItem)
    this.$eventBus.$off('pause-item', this.pauseItem)
  }
}
</script>

<style>
#mediaPlayerContainer {
  box-shadow: 0px -6px 8px #1111113f;
}
</style>
