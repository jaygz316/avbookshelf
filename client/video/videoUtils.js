
export function isVideoEpisode(episode) {
  if (!episode) return false
  return episode.episodeMediaType === 'video' || !!episode.videoFile || !!episode.isVideo || !!episode.videoTrack
}

export const VIDEO_RESOLUTION_OPTIONS = [
  { value: 'best_compatible', text: 'Best Compatible (1080p H.264 / AAC)' },
  { value: '1080p_compatible', text: '1080p Compatible (H.264 / AAC)' },
  { value: '720p_compatible', text: '720p Compatible (H.264 / AAC)' },
  { value: '480p_compatible', text: '480p Compatible (H.264 / AAC)' },
  { value: 'best_source', text: 'Best Source (Original Quality / WebM / AV1)' },
  { value: '1080p_source', text: '1080p Source (Original Codec)' },
  { value: '720p_source', text: '720p Source (Original Codec)' },
  { value: '480p_source', text: '480p Source (Original Codec)' }
]
