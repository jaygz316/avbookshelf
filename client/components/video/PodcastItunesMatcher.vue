<template>
  <div class="w-full p-2">
    <div class="p-3 bg-primary/10 border border-primary/30 rounded-lg space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="material-symbols text-yellow-400 text-lg">podcasts</span>
          <p class="font-semibold text-sm text-gray-100">{{ $strings.LabelLinkApplePodcast || 'Link with Apple Podcasts' }}</p>
        </div>
        <span v-if="selectedItunesPodcast && matchedEpisodesCount > 0" class="inline-flex items-center gap-1 px-2 py-0.5 bg-success/20 text-success border border-success/30 rounded text-xs font-medium">
          <span class="material-symbols text-xs">check_circle</span> {{ $getString('MessageMatchedEpisodesCount', [matchedEpisodesCount, totalEpisodesCount]) }}
        </span>
      </div>

      <!-- Unlinked: Search Apple Podcasts -->
      <div v-if="!selectedItunesPodcast">
        <p class="text-xs text-gray-300 mb-2 leading-relaxed">{{ $strings.MessageSearchApplePodcastsHelp || 'Link this YouTube channel with a podcast on Apple Podcasts to sync episode numbers, season numbers, accurate publication dates, and canonical metadata.' }}</p>
        <form @submit.prevent="searchItunes" class="flex gap-2 mb-2">
          <ui-text-input v-model="itunesSearchQuery" :placeholder="$strings.ButtonSearchApplePodcasts || 'Search Apple Podcasts...'" class="grow text-xs md:text-sm" />
          <ui-btn type="submit" small :disabled="searchingItunes">{{ $strings.ButtonSearch || 'Search' }}</ui-btn>
        </form>

        <div v-if="searchingItunes" class="py-3 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
          <ui-loading-indicator class="h-4 w-4" /> {{ $strings.MessageLoading || 'Searching Apple Podcasts...' }}
        </div>

        <div v-else-if="itunesSearchResults.length" class="max-h-48 overflow-y-auto space-y-1.5 pr-1 mt-2">
          <div
            v-for="res in itunesSearchResults"
            :key="res.id"
            class="flex items-center justify-between p-2 rounded bg-black/40 hover:bg-primary/30 cursor-pointer border border-white/5 transition-colors"
            @click="linkItunesPodcast(res)"
          >
            <div class="flex items-center gap-3 min-w-0 pr-2">
              <img v-if="res.cover" :src="res.cover" class="w-10 h-10 object-cover rounded shadow" />
              <div class="min-w-0">
                <p class="text-xs font-semibold text-gray-100 truncate">{{ res.title }}</p>
                <p class="text-xs text-gray-400 truncate">{{ res.artistName }} • {{ res.trackCount || 0 }} {{ $strings.HeaderEpisodes || 'episodes' }}</p>
              </div>
            </div>
            <ui-btn small color="bg-primary" class="shrink-0" @click.stop="linkItunesPodcast(res)">{{ $strings.ButtonLinkPodcast || 'Link' }}</ui-btn>
          </div>
        </div>
        <p v-else-if="hasSearchedItunes && !itunesSearchResults.length" class="text-xs text-gray-400 text-center py-2">{{ $strings.MessageNoResults || 'No matching Apple Podcasts found' }}</p>
      </div>

      <!-- Linked Apple Podcast Card -->
      <div v-else class="space-y-3">
        <div class="flex items-center justify-between p-2.5 rounded bg-black/50 border border-success/40">
          <div class="flex items-center gap-3 min-w-0 pr-2">
            <img v-if="selectedItunesPodcast.cover" :src="selectedItunesPodcast.cover" class="w-12 h-12 object-cover rounded shadow" />
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-xs md:text-sm font-semibold text-gray-100 truncate">{{ selectedItunesPodcast.title }}</p>
                <a v-if="selectedItunesPodcast.pageUrl" :href="selectedItunesPodcast.pageUrl" target="_blank" class="text-gray-400 hover:text-white" @click.stop>
                  <span class="material-symbols text-sm">open_in_new</span>
                </a>
              </div>
              <p class="text-xs text-gray-300 truncate">{{ selectedItunesPodcast.artistName }}</p>
              <p class="text-xs text-gray-400">{{ selectedItunesPodcast.trackCount }} {{ $strings.HeaderEpisodes || 'Episodes' }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <ui-btn small :disabled="matchingEpisodes" @click="matchEpisodesWithItunes(selectedItunesPodcast)">
              <span class="material-symbols text-xs mr-1">sync</span> {{ $strings.ButtonRematchEpisodes || 'Re-match' }}
            </ui-btn>
            <ui-btn small color="bg-error" @click="unlinkItunesPodcast">{{ $strings.ButtonUnlink || 'Unlink' }}</ui-btn>
          </div>
        </div>

        <div v-if="matchingEpisodes" class="py-2 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
          <ui-loading-indicator class="h-4 w-4" /> Matching YouTube episodes with Apple Podcasts feed...
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    podcast: {
      type: Object,
      required: true
    },
    podcastFeedData: {
      type: Object,
      default: () => ({})
    },
    initialQuery: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      itunesSearchQuery: this.initialQuery || this.podcast?.title || '',
      searchingItunes: false,
      hasSearchedItunes: false,
      itunesSearchResults: [],
      selectedItunesPodcast: null,
      matchingEpisodes: false,
      matchedEpisodesCount: 0,
      totalEpisodesCount: 0
    }
  },
  watch: {
    initialQuery(val) {
      if (val && !this.itunesSearchQuery) {
        this.itunesSearchQuery = val
      }
    }
  },
  methods: {
    async searchItunes() {
      if (!this.itunesSearchQuery?.trim()) return
      this.searchingItunes = true
      this.hasSearchedItunes = true
      try {
        const results = await this.$axios.$get('/api/search/podcast', {
          params: { term: this.itunesSearchQuery.trim() }
        })
        this.itunesSearchResults = results || []
      } catch (err) {
        console.error('Failed to search Apple Podcasts', err)
        this.itunesSearchResults = []
      } finally {
        this.searchingItunes = false
      }
    },
    async linkItunesPodcast(itunesPodcast) {
      if (!itunesPodcast) return
      this.selectedItunesPodcast = itunesPodcast

      this.$emit('link', itunesPodcast)
      await this.matchEpisodesWithItunes(itunesPodcast)
    },
    unlinkItunesPodcast() {
      this.selectedItunesPodcast = null
      this.matchedEpisodesCount = 0
      this.$emit('unlink')
    },
    async matchEpisodesWithItunes(itunesPodcast) {
      if (!itunesPodcast) return
      const episodes = this.podcastFeedData?.episodes || []
      if (!episodes.length) return

      this.matchingEpisodes = true
      try {
        const res = await this.$axios.$post('/api/podcasts/feed/match-itunes', {
          episodes,
          itunesFeedUrl: itunesPodcast.feedUrl,
          itunesId: itunesPodcast.id,
          podcastTitle: this.podcast.title
        })

        if (res?.podcast?.episodes?.length) {
          this.matchedEpisodesCount = res.matchedCount || 0
          this.totalEpisodesCount = res.totalCount || res.podcast.episodes.length
          this.$emit('matched', {
            episodes: res.podcast.episodes,
            matchedCount: this.matchedEpisodesCount,
            totalCount: this.totalEpisodesCount
          })
          this.$toast.success(this.$getString('MessageMatchedEpisodesCount', [this.matchedEpisodesCount, this.totalEpisodesCount]))
        }
      } catch (err) {
        console.error('Failed to match episodes with Apple Podcasts feed', err)
        this.$toast.error(err.response?.data || 'Failed to match episodes with Apple Podcasts')
      } finally {
        this.matchingEpisodes = false
      }
    }
  }
}
</script>
