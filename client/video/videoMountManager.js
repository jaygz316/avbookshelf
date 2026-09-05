
export function mountVideoElement({ isVideoEpisode, isFloatingMiniPlayer, videoVisible, wasPlaying = false }) {
  if (typeof document === 'undefined') return

  const videoEl = document.getElementById('video-player')
  if (!videoEl) return

  if (!isVideoEpisode) {
    videoEl.style.display = 'none'
    return
  }

  const shouldPlay = wasPlaying || (!videoEl.paused && !videoEl.ended)
  const mainContainer = document.getElementById('video-player-container')
  const miniContainer = document.getElementById('floating-mini-video-container')

  if (isFloatingMiniPlayer && miniContainer) {
    if (videoEl.parentElement !== miniContainer) {
      miniContainer.appendChild(videoEl)
      if (shouldPlay && videoEl.paused) {
        videoEl.play().catch(() => {})
      }
    }
    videoEl.style.display = 'block'
    videoEl.style.width = '100%'
    videoEl.style.height = '100%'
    videoEl.style.opacity = '1'
    videoEl.style.position = 'static'
  } else if (videoVisible && mainContainer) {
    if (videoEl.parentElement !== mainContainer) {
      mainContainer.appendChild(videoEl)
      if (shouldPlay && videoEl.paused) {
        videoEl.play().catch(() => {})
      }
    }
    videoEl.style.display = 'block'
    videoEl.style.width = '100%'
    videoEl.style.height = '100%'
    videoEl.style.opacity = '1'
    videoEl.style.position = 'static'
  } else {
    if (videoEl.parentElement !== document.body) {
      document.body.appendChild(videoEl)
      if (shouldPlay && videoEl.paused) {
        videoEl.play().catch(() => {})
      }
    }
    videoEl.style.display = 'block'
    videoEl.style.position = 'fixed'
    videoEl.style.bottom = '0px'
    videoEl.style.right = '0px'
    videoEl.style.width = '1px'
    videoEl.style.height = '1px'
    videoEl.style.opacity = '0.001'
    videoEl.style.pointerEvents = 'none'
    videoEl.style.zIndex = '-9999'
  }
}

export function updatePlayerHeightCss({ isVideoEpisode, videoPlayerSize, isFloatingMiniPlayer }) {
  if (typeof document === 'undefined') return

  if (!isVideoEpisode || isFloatingMiniPlayer) {
    document.documentElement.style.setProperty('--player-height', '165px')
    return
  }

  let height = '165px'
  if (videoPlayerSize === 'theater') {
    height = '60vh'
  } else if (videoPlayerSize === 'expanded') {
    height = '85vh'
  } else if (videoPlayerSize === 'fullscreen') {
    height = '0px'
  }

  document.documentElement.style.setProperty('--player-height', height)
}
