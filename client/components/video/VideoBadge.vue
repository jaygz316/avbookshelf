<template>
  <span v-if="isVideo" class="material-symbols text-yellow-400 text-base align-middle select-none mr-1" title="Video Episode">videocam</span>
</template>

<script>
export default {
  props: {
    episode: {
      type: Object,
      default: () => ({})
    },
    isVideoFile: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    isVideo() {
      if (this.isVideoFile) return true
      return this.episode?.episodeMediaType === 'video' || !!this.episode?.videoFile || !!this.episode?.isVideo
    }
  }
}
</script>
