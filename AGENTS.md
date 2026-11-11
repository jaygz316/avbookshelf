# AGENTS.md - AVBookshelf

AVBookshelf is a fork of [Audiobookshelf](https://github.com/advplyr/audiobookshelf) (`advplyr/audiobookshelf`) maintained at `jaygz316/avbookshelf` and published to Docker Hub as `jaygz/avbookshelf`. It extends Audiobookshelf with podcast video playback, YouTube/yt-dlp feed ingestion, hardware-accelerated video transcoding (VA-API), and GlitchTip/Sentry error reporting.

## System architecture & tech stack

- **Backend**: Node.js 24, Express 4, Socket.IO 4, Sequelize 6 with SQLite3 (`libnusqlite3` custom collation extension), TypeScript/JavaScript hybrid compiled via `tsc -p tsconfig.server.json` into `dist-server/`.
- **Frontend**: Vue 2 / Nuxt 2 static SPA in `client/` (generated into `client/dist/`), TailwindCSS.
- **Video subsystem**:
  - `server/video/`:
    - `index.js`: Exports singleton `videoManager` and helpers.
    - `VideoManager.js`: Manages yt-dlp downloads, YouTube channel/playlist polling, video transcoding, and FFmpeg tasks.
    - `VideoScanner.js`: Probes video files and parses `.info.json` metadata alongside podcast episodes.
    - `VideoStreamHandler.js`: HTTP range and HLS/transcode streaming handler for video podcast episodes.
    - `VideoEpisodeMatcher.js`: Matches YouTube/video episodes against iTunes/RSS metadata.
    - `VideoFile.js`: Model representing a video media file attached to a podcast episode.
    - `ytDlpMetadataMapper.js`: Maps `yt-dlp` JSON output into Audiobookshelf podcast episode schemas.
  - `client/video/`:
    - `LocalVideoPlayer.js`: HTML5/HLS video player controller integrated with Audiobookshelf's media player lifecycle.
    - `videoMountManager.js`: Mounts and resizes the `<video>` element inside `MediaPlayerContainer.vue`, supporting Picture-in-Picture and mini-player modes.
    - `videoUtils.js`: Video MIME type and episode detection helpers.
- **Observability**: GlitchTip/Sentry SDK (`@sentry/node`) initialized in `index.js` and hooked into `server/Logger.js`.

## Directory map

- `index.js` / `prod.js`: Server entrypoints.
- `server/`: Express controllers, managers, scanners, Sequelize models, routers, and `server/video/`.
- `client/`: Nuxt 2 frontend application and `client/video/`.
- `test/`: Mocha/Chai/Sinon unit and integration tests.
- `Dockerfile`: Multi-stage build (`build-client`, `compile-server`, `build-server`, runtime image with `ffmpeg`, `yt-dlp`, and Intel VA-API drivers).
- `.agents/skills/merge-abs/SKILL.md`: End-to-end upstream sync, test, GitHub push, and Docker Hub release workflow (`/merge-abs`).

## Build, test, and release commands

- **Install dependencies**:
  ```bash
  npm install
  ```
- **Compile server**:
  ```bash
  npm run build:server
  ```
- **Run tests**:
  ```bash
  npm test
  ```
- **Build frontend static bundle**:
  ```bash
  npm run client
  ```
- **Dev server (with hot reload)**:
  ```bash
  npm run dev
  ```
- **Build and push multi-arch Docker image (`linux/amd64,linux/arm64`)**:
  ```bash
  npm run docker
  # Or with version tag:
  docker buildx build --platform linux/amd64,linux/arm64 --push -t jaygz/avbookshelf:latest -t jaygz/avbookshelf:$(node -p "require('./package.json').version") .
  ```
- **Sync upstream, push to GitHub, and publish to Docker Hub**:
  Give the agent the command `/merge-abs` (or `merge-abs`).
