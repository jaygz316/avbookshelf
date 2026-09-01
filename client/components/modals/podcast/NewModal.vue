<template>
  <modals-modal v-model="show" name="new-podcast-modal" :width="1000" :height="'unset'" :processing="processing">
    <template #outer>
      <div class="absolute top-0 left-0 p-5 w-3/4 overflow-hidden">
        <p class="text-xl md:text-3xl text-white truncate">{{ title }}</p>
      </div>
    </template>
    <div ref="wrapper" id="podcast-wrapper" class="p-2 md:p-8 w-full text-sm py-2 rounded-lg bg-bg shadow-lg border border-black-300 relative overflow-x-hidden overflow-y-auto" style="max-height: 80vh">
      <div class="w-full">
        <div class="flex items-center justify-between px-2 mb-2">
          <p class="text-lg font-semibold">{{ $strings.HeaderDetails }}</p>
          <span v-if="isYouTubeFeed" class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-600 text-white rounded text-xs font-semibold uppercase tracking-wider">
            <span class="material-symbols text-sm">smart_display</span> {{ $strings.LabelYouTubeFeed || 'YouTube Feed' }}
          </span>
        </div>

        <!-- YouTube to Apple Podcasts Link Section -->
        <video-podcast-itunes-matcher
          v-if="isYouTubeFeed"
          :podcast="podcast"
          :podcast-feed-data="podcastFeedData"
          :initial-query="podcast.title"
          @link="linkItunesPodcast"
          @unlink="unlinkItunesPodcast"
          @matched="onEpisodesMatched"
        />

        <div v-if="podcast.imageUrl" class="p-2 w-full">
          <img :src="podcast.imageUrl" class="h-16 w-16 object-contain" />
        </div>
        <div class="flex flex-wrap">
          <div class="w-full md:w-1/2 p-2">
            <ui-text-input-with-label v-model="podcast.title" :label="$strings.LabelTitle" @input="titleUpdated" />
          </div>
          <div class="w-full md:w-1/2 p-2">
            <ui-text-input-with-label v-model="podcast.author" :label="$strings.LabelAuthor" />
          </div>
        </div>
        <div class="flex flex-wrap">
          <div class="w-full md:w-1/2 p-2">
            <ui-text-input-with-label v-model="podcast.feedUrl" :label="$strings.LabelFeedURL" readonly />
          </div>
          <div class="w-full md:w-1/2 p-2">
            <ui-multi-select v-model="podcast.genres" :items="podcast.genres" :label="$strings.LabelGenres" />
          </div>
        </div>
        <div class="flex flex-wrap">
          <div class="md:w-1/4 p-2">
            <ui-dropdown :label="$strings.LabelPodcastType" v-model="podcast.type" :items="podcastTypes" small />
          </div>
          <div class="md:w-1/4 p-2">
            <ui-text-input-with-label v-model="podcast.language" :label="$strings.LabelLanguage" />
          </div>
          <div class="md:w-1/4 px-2 pt-7">
            <ui-checkbox v-model="podcast.explicit" :label="$strings.LabelExplicit" checkbox-bg="primary" border-color="gray-600" label-class="pl-2 text-base font-semibold" />
          </div>
        </div>
        <div class="p-2 w-full">
          <ui-textarea-with-label v-model="podcast.description" :label="$strings.LabelDescription" :rows="3" />
        </div>
        <div class="flex flex-wrap">
          <div class="w-full md:w-1/2 p-2">
            <ui-dropdown v-model="selectedFolderId" :items="folderItems" :disabled="processing" :label="$strings.LabelFolder" @input="folderUpdated" />
          </div>
          <div class="w-full md:w-1/2 p-2">
            <ui-text-input-with-label v-model="fullPath" :label="`${$strings.LabelPodcast} ${$strings.LabelPath}`" input-class="h-10" readonly />
          </div>
        </div>
        <div class="flex flex-wrap">
          <div class="w-full md:w-1/2 p-2">
            <ui-dropdown v-model="podcast.maxDownloadResolution" :items="resolutionOptions" :disabled="processing" :label="$strings.LabelMaxVideoDownloadQuality || 'Max Video Download Quality'" />
          </div>
        </div>

        <!-- Ordered Episodes Preview -->
        <div v-if="localEpisodes.length" class="px-2 py-2 mt-2">
          <div class="flex items-center justify-between cursor-pointer py-1.5 border-t border-b border-white/10 hover:text-gray-200" @click="showEpisodePreview = !showEpisodePreview">
            <div class="flex items-center gap-2">
              <span class="material-symbols text-sm">{{ showEpisodePreview ? 'expand_less' : 'expand_more' }}</span>
              <p class="font-semibold text-xs text-gray-300 uppercase tracking-wider">{{ $strings.LabelPreviewEpisodes || 'Preview Ordered Episodes' }} ({{ localEpisodes.length }})</p>
            </div>
            <p class="text-xs text-gray-400">{{ showEpisodePreview ? 'Hide' : 'Show' }}</p>
          </div>

          <div v-if="showEpisodePreview" class="max-h-60 overflow-y-auto mt-2 space-y-1 pr-1">
            <div
              v-for="(ep, idx) in localEpisodes"
              :key="ep.guid || idx"
              class="flex items-center justify-between p-2 rounded bg-black/20 hover:bg-white/5 text-xs border border-white/5"
            >
              <div class="flex items-center gap-2 min-w-0 pr-2">
                <span v-if="ep.episode || ep.season" class="px-1.5 py-0.5 rounded text-2xs font-bold" :class="ep.itunesMatched ? 'bg-success/20 text-success border border-success/30' : 'bg-primary/30 text-gray-300'">
                  {{ ep.season ? `S${ep.season} ` : '' }}Ep {{ ep.episode || '?' }}
                </span>
                <span v-else class="px-1.5 py-0.5 rounded text-2xs bg-white/10 text-gray-400">#{{ localEpisodes.length - idx }}</span>
                <p class="font-medium text-gray-200 truncate">{{ ep.title }}</p>
              </div>
              <div class="flex items-center gap-3 shrink-0 text-gray-400 text-2xs">
                <span v-if="ep.durationSeconds" class="whitespace-nowrap">{{ formatDuration(ep.durationSeconds) }}</span>
                <span v-if="ep.pubDate" class="whitespace-nowrap">{{ ep.pubDate.split('T')[0] || ep.pubDate }}</span>
                <span v-if="ep.itunesMatched" class="material-symbols text-success text-xs" :title="$strings.LabelMatchedWithApplePodcasts || 'Matched with Apple Podcasts'">check_circle</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="flex items-center py-4 px-2">
        <div class="grow" />
        <div class="px-4">
          <ui-checkbox v-model="podcast.autoDownloadEpisodes" :label="$strings.LabelAutoDownloadEpisodes" checkbox-bg="primary" border-color="gray-600" label-class="pl-2 text-sm md:text-base font-semibold" />
        </div>
        <ui-btn color="bg-success" @click="submit">{{ $strings.ButtonSubmit }}</ui-btn>
      </div>
    </div>
  </modals-modal>
</template>

<script>
import Path from 'path'

export default {
  props: {
    value: Boolean,
    podcastData: {
      type: Object,
      default: () => null
    },
    podcastFeedData: {
      type: Object,
      default: () => null
    }
  },
  data() {
    return {
      processing: false,
      selectedFolderId: null,
      fullPath: null,
      searchingItunes: false,
      itunesSearchQuery: '',
      itunesSearchResults: [],
      hasSearchedItunes: false,
      selectedItunesPodcast: null,
      matchingEpisodes: false,
      matchedEpisodesCount: 0,
      totalEpisodesCount: 0,
      showEpisodePreview: false,
      localEpisodes: [],
      applyItunesMetadata: true,
      podcast: {
        title: '',
        author: '',
        description: '',
        releaseDate: '',
        genres: [],
        feedUrl: '',
        feedType: 'rss',
        feedImageUrl: '',
        itunesPageUrl: '',
        itunesId: '',
        itunesArtistId: '',
        autoDownloadEpisodes: false,
        language: '',
        explicit: false,
        type: '',
        maxDownloadResolution: 'best'
      }
    }
  },
  watch: {
    show: {
      immediate: true,
      handler(newVal) {
        if (newVal) {
          this.init()
        }
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
    title() {
      return this._podcastData.title
    },
    isYouTubeFeed() {
      return this.podcast.feedType === 'youtube' || (this.podcast.feedUrl && (this.podcast.feedUrl.includes('youtube.com') || this.podcast.feedUrl.includes('youtu.be')))
    },
    currentLibrary() {
      return this.$store.getters['libraries/getCurrentLibrary']
    },
    folders() {
      if (!this.currentLibrary) return []
      return this.currentLibrary.folders || []
    },
    folderItems() {
      return this.folders.map((fold) => {
        return {
          value: fold.id,
          text: fold.fullPath
        }
      })
    },
    _podcastData() {
      return this.podcastData || {}
    },
    feedMetadata() {
      if (!this.podcastFeedData) return {}
      return this.podcastFeedData.metadata || {}
    },
    episodes() {
      if (!this.podcastFeedData) return []
      return this.podcastFeedData.episodes || []
    },
    selectedFolder() {
      return this.folders.find((f) => f.id === this.selectedFolderId)
    },
    selectedFolderPath() {
      if (!this.selectedFolder) return ''
      return this.selectedFolder.fullPath
    },
    podcastTypes() {
      return this.$store.state.globals.podcastTypes.map((e) => {
        return {
          text: this.$strings[e.descriptionKey] || e.text,
          value: e.value
        }
      })
    },
    resolutionOptions() {
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
    titleUpdated() {
      this.folderUpdated()
    },
    folderUpdated() {
      if (!this.selectedFolderPath || !this.podcast.title) {
        this.fullPath = ''
        return
      }
      this.fullPath = Path.join(this.selectedFolderPath, this.$sanitizeFilename(this.podcast.title))
    },
    formatDuration(seconds) {
      if (!seconds || isNaN(seconds)) return ''
      const totalSec = Math.round(Number(seconds))
      const hrs = Math.floor(totalSec / 3600)
      const mins = Math.floor((totalSec % 3600) / 60)
      const secs = totalSec % 60
      if (hrs > 0) return `${hrs}h ${mins}m`
      if (mins > 0) return `${mins}m ${secs}s`
      return `${secs}s`
    },
    linkItunesPodcast(itunesPodcast) {
      if (!itunesPodcast) return
      this.selectedItunesPodcast = itunesPodcast
      this.podcast.itunesId = String(itunesPodcast.id || '')
      this.podcast.itunesPageUrl = itunesPodcast.pageUrl || ''
      this.podcast.itunesArtistId = String(itunesPodcast.artistId || '')

      if (this.applyItunesMetadata) {
        if (itunesPodcast.artistName) this.podcast.author = itunesPodcast.artistName
        if (itunesPodcast.genres?.length) this.podcast.genres = [...itunesPodcast.genres]
        if (itunesPodcast.descriptionPlain) this.podcast.description = itunesPodcast.descriptionPlain
        if (itunesPodcast.cover) this.podcast.imageUrl = itunesPodcast.cover
        if (itunesPodcast.releaseDate) this.podcast.releaseDate = itunesPodcast.releaseDate
        if (itunesPodcast.explicit !== undefined) this.podcast.explicit = !!itunesPodcast.explicit
      }
    },
    unlinkItunesPodcast() {
      this.selectedItunesPodcast = null
      this.podcast.itunesId = ''
      this.podcast.itunesPageUrl = ''
      this.podcast.itunesArtistId = ''
      this.matchedEpisodesCount = 0
      this.localEpisodes = [...(this.podcastFeedData?.episodes || [])]
    },
    onEpisodesMatched({ episodes, matchedCount, totalCount }) {
      this.localEpisodes = episodes
      this.matchedEpisodesCount = matchedCount
      this.totalEpisodesCount = totalCount
      if (this.podcastFeedData) {
        this.podcastFeedData.episodes = episodes
      }
    },
    submit() {
      const feedType = this.podcast.feedType || (this.isYouTubeFeed ? 'youtube' : 'rss')
      const podcastPayload = {
        path: this.fullPath,
        folderId: this.selectedFolderId,
        libraryId: this.currentLibrary.id,
        media: {
          metadata: {
            title: this.podcast.title,
            author: this.podcast.author,
            description: this.podcast.description,
            releaseDate: this.podcast.releaseDate,
            genres: [...this.podcast.genres],
            feedUrl: this.podcast.feedUrl,
            feedType,
            imageUrl: this.podcast.imageUrl,
            itunesPageUrl: this.podcast.itunesPageUrl,
            itunesId: this.podcast.itunesId,
            itunesArtistId: this.podcast.itunesArtistId,
            language: this.podcast.language,
            explicit: this.podcast.explicit,
            type: this.podcast.type,
            maxDownloadResolution: this.podcast.maxDownloadResolution || 'best'
          },
          feedType,
          maxDownloadResolution: this.podcast.maxDownloadResolution || 'best',
          autoDownloadEpisodes: this.podcast.autoDownloadEpisodes
        }
      }
      console.log('Podcast payload', podcastPayload)

      this.processing = true
      this.$axios
        .$post('/api/podcasts', podcastPayload)
        .then((libraryItem) => {
          this.processing = false
          this.$toast.success(this.$strings.ToastPodcastCreateSuccess)
          this.show = false
          this.$router.push(`/item/${libraryItem.id}`)
        })
        .catch((error) => {
          var errorMsg = error.response && error.response.data ? error.response.data : this.$strings.ToastPodcastCreateFailed
          console.error('Failed to create podcast', error)
          this.processing = false
          this.$toast.error(errorMsg)
        })
    },
    init() {
      // Prefer using itunes podcast data but not always passed in if manually entering rss feed
      this.podcast.title = this._podcastData.title || this.feedMetadata.title || ''
      this.podcast.author = this._podcastData.artistName || this.feedMetadata.author || ''
      this.podcast.description = this._podcastData.description || this.feedMetadata.descriptionPlain || ''
      this.podcast.releaseDate = this._podcastData.releaseDate || ''
      this.podcast.genres = this._podcastData.genres || this.feedMetadata.categories || []
      this.podcast.feedUrl = this._podcastData.feedUrl || this.feedMetadata.feedUrl || ''
      this.podcast.feedType = this._podcastData.feedType || this.feedMetadata.feedType || ((this.podcast.feedUrl && (this.podcast.feedUrl.includes('youtube.com') || this.podcast.feedUrl.includes('youtu.be'))) ? 'youtube' : 'rss')
      this.podcast.imageUrl = this._podcastData.cover || this.feedMetadata.image || ''
      this.podcast.itunesPageUrl = this._podcastData.pageUrl || ''
      this.podcast.itunesId = this._podcastData.id || ''
      this.podcast.itunesArtistId = this._podcastData.artistId || ''
      this.podcast.language = this._podcastData.language || this.feedMetadata.language || ''
      this.podcast.autoDownloadEpisodes = false
      this.podcast.type = this._podcastData.type || this.feedMetadata.type || 'episodic'
      this.podcast.maxDownloadResolution = this._podcastData.maxDownloadResolution || this.feedMetadata.maxDownloadResolution || 'best'

      this.podcast.explicit = this._podcastData.explicit || this.feedMetadata.explicit === 'yes' || this.feedMetadata.explicit == 'true'
      this.localEpisodes = [...(this.podcastFeedData?.episodes || [])]
      this.selectedItunesPodcast = null
      this.matchedEpisodesCount = 0
      this.totalEpisodesCount = this.localEpisodes.length

      if (this.folderItems[0]) {
        this.selectedFolderId = this.folderItems[0].value
        this.folderUpdated()
      }

      if (this.isYouTubeFeed) {
        this.itunesSearchQuery = this.podcast.title || this.podcast.author || ''
        if (this.itunesSearchQuery) {
          this.searchItunes()
        }
      }
    }
  },
  mounted() {}
}
</script>

<style scoped>
#podcast-wrapper {
  min-height: 400px;
  max-height: 80vh;
}
#episodes-scroll {
  max-height: calc(80vh - 200px);
}
</style>
