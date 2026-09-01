<template>
  <div class="flex items-center h-full px-1 overflow-hidden">
    <covers-book-cover :library-item="libraryItem" :width="coverWidth" :book-cover-aspect-ratio="bookCoverAspectRatio" />
    <div class="grow px-2 episodeSearchCardContent">
      <p class="truncate text-sm flex items-center">
        <span class="truncate">{{ episodeTitle }}</span>
        <span v-if="isVideo" class="material-symbols text-sm text-yellow-400 ml-1" aria-hidden="true">videocam</span>
      </p>
      <p class="text-xs text-gray-200 truncate">{{ podcastTitle }}</p>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    libraryItem: {
      type: Object,
      default: () => {}
    },
    episode: {
      type: Object,
      default: () => {}
    }
  },
  data() {
    return {}
  },
  computed: {
    bookCoverAspectRatio() {
      return this.$store.getters['libraries/getBookCoverAspectRatio']
    },
    coverWidth() {
      if (this.bookCoverAspectRatio === 1) return 50 * 1.2
      return 50
    },
    media() {
      return this.libraryItem?.media || {}
    },
    mediaMetadata() {
      return this.media.metadata || {}
    },
    isVideo() {
      return this.episode?.episodeMediaType === 'video' || !!this.episode?.videoFile || this.episode?.isVideo
    },
    episodeTitle() {
      return this.episode.title || 'No Title'
    },
    podcastTitle() {
      return this.mediaMetadata.title || 'No Title'
    }
  },
  methods: {},
  mounted() {}
}
</script>

<style>
.episodeSearchCardContent {
  width: calc(100% - 80px);
  height: 75px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
</style>
