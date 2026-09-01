<template>
  <div class="w-full my-2">
    <!-- Currently downloading episode with progress -->
    <div v-if="downloading" class="w-full bg-success/10 border border-success/30 rounded-md px-4 py-3 mb-3">
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-2 min-w-0">
          <widgets-loading-spinner class="shrink-0" />
          <span class="text-sm font-semibold truncate">{{ downloading.episodeDisplayTitle || $strings.MessageDownloadingEpisode }}</span>
        </div>
        <div class="flex items-center gap-3 shrink-0 ml-2 text-xs text-gray-300">
          <span v-if="downloading.progressSpeed" class="font-mono">{{ downloading.progressSpeed }}</span>
          <span v-if="downloading.progressEta" class="text-gray-400">ETA {{ downloading.progressEta }}</span>
          <span v-if="downloading.progress != null" class="font-semibold text-success">{{ Math.round(downloading.progress) }}%</span>
        </div>
      </div>
      <!-- Progress bar -->
      <div class="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
        <div
          class="h-full bg-success transition-all duration-300 rounded-full"
          :style="{ width: (downloading.progress != null ? Math.round(downloading.progress) : 0) + '%' }"
        />
      </div>
      <p v-if="downloading.progress == null" class="text-xs text-gray-400 mt-1">{{ $strings.MessageWaitingForProgress || 'Waiting for progress...' }}</p>
    </div>

    <!-- Queue table -->
    <div v-if="queue.length" class="w-full">
      <div class="w-full bg-primary px-4 md:px-6 py-2 flex items-center">
        <p class="pr-2 md:pr-4">{{ $strings.HeaderDownloadQueue }}</p>
        <div class="h-5 md:h-7 w-5 md:w-7 rounded-full bg-white/10 flex items-center justify-center">
          <span class="text-sm font-mono">{{ queue.length }}</span>
        </div>
      </div>
      <transition name="slide">
        <div class="w-full">
          <table class="text-sm tracksTable">
            <tr>
              <th class="text-left px-4 min-w-48">{{ $strings.LabelPodcast }}</th>
              <th class="text-left w-32 min-w-32">{{ $strings.LabelEpisode }}</th>
              <th class="text-left px-4">{{ $strings.LabelEpisodeTitle }}</th>
              <th class="text-left px-4 w-48">{{ $strings.LabelPubDate }}</th>
            </tr>
            <template v-for="downloadQueued in queue">
              <tr :key="downloadQueued.id">
                <td class="px-4">
                  <div class="flex items-center">
                    <nuxt-link :to="`/item/${downloadQueued.libraryItemId}`" class="text-sm text-gray-200 hover:underline">{{ downloadQueued.podcastTitle }}</nuxt-link>
                    <widgets-explicit-indicator v-if="downloadQueued.podcastExplicit" />
                  </div>
                </td>
                <td>
                  <div class="flex items-center">
                    <div v-if="downloadQueued.season">{{ downloadQueued.season }}x</div>
                    <div v-if="downloadQueued.episode">{{ downloadQueued.episode }}</div>
                    <widgets-podcast-type-indicator :type="downloadQueued.episodeType" />
                  </div>
                </td>
                <td dir="auto" class="px-4">
                  {{ downloadQueued.episodeDisplayTitle }}
                </td>
                <td class="text-xs">
                  <div class="flex items-center">
                    <p>{{ $dateDistanceFromNow(downloadQueued.publishedAt) }}</p>
                  </div>
                </td>
              </tr>
            </template>
          </table>
        </div>
      </transition>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    queue: {
      type: Array,
      default: () => []
    },
    downloading: {
      type: Object,
      default: null
    },
    libraryItemId: String
  },
  data() {
    return {}
  },
  computed: {},
  methods: {},
  mounted() {}
}
</script>
