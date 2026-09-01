<template>
  <modals-modal v-model="show" name="podcast-download-video-modal" :width="650" :height="'unset'" :processing="processing">
    <template #outer>
      <div class="absolute top-0 left-0 p-5 w-2/3 overflow-hidden">
        <p class="text-2xl md:text-3xl text-white truncate">{{ $strings.LabelDownloadVideoFromUrl || 'Download Video from URL' }}</p>
      </div>
    </template>
    <div ref="wrapper" class="px-6 py-6 w-full text-sm rounded-lg bg-bg shadow-lg border border-black-300 relative overflow-hidden">
      <form @submit.prevent="submit">
        <div class="mb-4">
          <p class="text-sm text-gray-300 mb-3">
            Download a video directly from YouTube or other supported video sites into <strong class="text-white">{{ podcastTitle }}</strong>.
          </p>
          <ui-text-input-with-label
            ref="urlInput"
            v-model="videoUrl"
            :label="$strings.LabelFeedURL || 'Video URL'"
            :placeholder="$strings.PlaceholderEnterVideoUrl || 'https://www.youtube.com/watch?v=...'"
            :disabled="processing"
            class="mb-3"
          />

          <ui-dropdown
            v-model="quality"
            :items="qualityOptions"
            :label="$strings.LabelMaxVideoDownloadQuality || 'Download Format & Quality'"
            :disabled="processing"
            class="mb-3"
          />

          <div class="p-3 bg-primary/10 border border-primary/20 rounded-md text-xs text-gray-300">
            <div v-if="isCompatibleQuality" class="flex items-start gap-2">
              <span class="material-symbols text-base text-success">check_circle</span>
              <div>
                <p class="font-semibold text-white">Compatible Format (H.264 + AAC)</p>
                <p class="mt-0.5">Direct play on web browsers and mobile apps with <strong class="text-success">0% CPU transcoding</strong> and instant playback start.</p>
              </div>
            </div>
            <div v-else class="flex items-start gap-2">
              <span class="material-symbols text-base text-warning">warning</span>
              <div>
                <p class="font-semibold text-white">Source Quality (AV1 / VP9)</p>
                <p class="mt-0.5">Highest quality compression from YouTube, but may require <strong class="text-warning">server-side transcoding</strong> (higher CPU/GPU load) during browser playback.</p>
              </div>
            </div>
          </div>
        </div>
        <div class="flex justify-end items-center gap-3 pt-2">
          <ui-btn :disabled="processing" color="bg-primary hover:bg-primary/80" @click="show = false">{{ $strings.ButtonCancel || 'Cancel' }}</ui-btn>
          <ui-btn type="submit" :loading="processing" :disabled="!isValidUrl || processing" color="bg-success">
            <span class="material-symbols text-base mr-1">download</span>
            {{ $strings.LabelDownload || 'Download' }}
          </ui-btn>
        </div>
      </form>
    </div>
  </modals-modal>
</template>

<script>
export default {
  props: {
    value: Boolean,
    libraryItem: {
      type: Object,
      default: () => {}
    }
  },
  data() {
    return {
      videoUrl: '',
      quality: 'best_compatible',
      processing: false
    }
  },
  watch: {
    value(newVal) {
      if (newVal) {
        this.videoUrl = ''
        this.quality = this.libraryItem?.media?.maxDownloadResolution || 'best_compatible'
        this.$nextTick(() => {
          if (this.$refs.urlInput?.$refs?.input) {
            this.$refs.urlInput.$refs.input.focus()
          }
        })
      }
    }
  },
  computed: {
    show: {
      get() {
        return this.value
      },
      set(val) {
        this.$emit('input', val)
      }
    },
    podcastTitle() {
      return this.libraryItem?.media?.metadata?.title || this.libraryItem?.media?.title || 'Podcast'
    },
    isValidUrl() {
      if (!this.videoUrl?.trim()) return false
      return this.videoUrl.startsWith('http://') || this.videoUrl.startsWith('https://')
    },
    isCompatibleQuality() {
      return !this.quality?.includes('source')
    },
    qualityOptions() {
      return [
        { text: 'Best Compatible (H.264 / AAC) — Recommended', value: 'best_compatible' },
        { text: '1080p (H.264 Compatible)', value: '1080p_compatible' },
        { text: '720p (H.264 Compatible)', value: '720p_compatible' },
        { text: '480p (H.264 Compatible)', value: '480p_compatible' },
        { text: 'Best Source Quality (AV1 / VP9)', value: 'best_source' },
        { text: '1080p (Source Quality - AV1/VP9)', value: '1080p_source' },
        { text: '720p (Source Quality - AV1/VP9)', value: '720p_source' },
        { text: '480p (Source Quality - AV1/VP9)', value: '480p_source' }
      ]
    }
  },
  methods: {
    async submit() {
      if (!this.isValidUrl) return

      this.processing = true
      try {
        const response = await this.$axios.$post(`/api/podcasts/${this.libraryItem.id}/download-yt-episode`, {
          url: this.videoUrl.trim(),
          quality: this.quality
        })
        this.processing = false
        this.show = false
        const title = response?.title ? ` "${response.title}"` : ''
        this.$toast.success(`${this.$strings.ToastDownloadVideoSuccess || 'Started downloading video'}${title}`)
      } catch (error) {
        this.processing = false
        const errorMsg = error.response?.data?.error || error.response?.data || this.$strings.ToastDownloadVideoFailed || 'Failed to download video'
        console.error('Failed to download video episode', error)
        this.$toast.error(typeof errorMsg === 'string' ? errorMsg : 'Failed to download video')
      }
    }
  }
}
</script>
