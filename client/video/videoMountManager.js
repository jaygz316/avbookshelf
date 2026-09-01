/**
 * videoMountManager.js
 * Coordinates mounting the persistent HTML5 <video> DOM element across containers:
 * 1. Main Viewport (#video-player-container)
 * 2. Floating Mini Player (#floating-mini-video-container)
 * 3. Body Fallback (offscreen container for continuous audio / PiP)
 */

export function mountVideoElement({ isVideoEpisode, isFloatingMiniPlayer, videoVisible }) {
  if (typeof document === 'undefined') return

  const videoEl = document.getElementById('video-player')
  if (!videoEl) return

  if (!isVideoEpisode) {
    videoEl.style.display = 'none'
    return
  }

  const mainContainer = document.getElementById('video-player-container')
  const miniContainer = document.getElementById('floating-mini-video-container')

  if (isFloatingMiniPlayer && miniContainer) {
    if (videoEl.parentElement !== miniContainer) {
      miniContainer.appendChild(videoEl)
    }
    videoEl.style.display = 'block'
    videoEl.style.width = '100%'
    videoEl.style.height = '100%'
    videoEl.style.opacity = '1'
    videoEl.style.position = 'static'
  } else if (videoVisible && mainContainer) {
    if (videoEl.parentElement !== mainContainer) {
      mainContainer.appendChild(videoEl)
    }
    videoEl.style.display = 'block'
    videoEl.style.width = '100%'
    videoEl.style.height = '100%'
    videoEl.style.opacity = '1'
    videoEl.style.position = 'static'
  } else {
    if (videoEl.parentElement !== document.body) {
      document.body.appendChild(videoEl)
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
