---
name: merge-abs
description: >-
  Merges upstream updates from the original Audiobookshelf repository (advplyr/audiobookshelf)
  into this AVBookshelf fork, resolves conflicts across video and monitoring touchpoints,
  runs tests, pushes to GitHub (jaygz316/avbookshelf), and builds and pushes the multi-arch
  Docker image to Docker Hub (jaygz/avbookshelf). Trigger whenever the user says "/merge-abs",
  "merge-abs", or asks to sync, update, merge upstream, and publish AVBookshelf.
---

# Merge Upstream Audiobookshelf (`merge-abs`)

This skill runs the full pipeline for pulling upstream updates from `advplyr/audiobookshelf`, resolving conflicts in `jaygz316/avbookshelf`, verifying the test suite, pushing to GitHub, and publishing a new multi-arch image to Docker Hub (`jaygz/avbookshelf`).

---

## 1. Pre-merge checks

1. Verify git remotes:
   ```bash
   git remote -v
   ```
   - `origin` must point to `https://github.com/jaygz316/avbookshelf.git` (or SSH equivalent).
   - `upstream` must point to `https://github.com/advplyr/audiobookshelf.git` (if missing, run `git remote add upstream https://github.com/advplyr/audiobookshelf.git`).

2. Ensure the working tree is clean:
   ```bash
   git status
   ```
   If uncommitted changes exist, stop and ask the user whether to commit or stash them before merging.

---

## 2. Fetch upstream changes

Fetch the latest commits and tags from upstream:
```bash
git fetch upstream --tags
```

Inspect incoming commits:
```bash
git log HEAD..upstream/master --oneline -20
```

---

## 3. Merge upstream

Check out `master` and merge `upstream/master`:

```bash
git checkout master
git merge upstream/master --no-edit
```

---

## 4. Conflict resolution guide

Core video functionality lives in isolated directories (`server/video/` and `client/video/`). When conflicts happen in shared upstream files, preserve these AVBookshelf additions while keeping upstream bug fixes and features:

### 1. `server/controllers/PodcastController.js`
- Keep `mapVideoInfoToEpisode` import and call inside `downloadYtDlpEpisode`.
- Keep YouTube feed handling and `require('../video').videoManager` usage in `getPodcastFeed`.
- Keep `matchFeedEpisodes` route handler for iTunes episode matching.

### 2. `server/scanner/Scanner.js`
- Keep `quickMatchYouTubeEpisodes`.
- Keep the YouTube branch in `quickMatchPodcastEpisodes`:
  ```javascript
  if (isYouTube) {
    return this.quickMatchYouTubeEpisodes(libraryItem, options)
  }
  ```

### 3. `server/scanner/PodcastScanner.js`
- Keep video file probing, media probe separation hooks, and `.info.json` metadata parsing.

### 4. `server/managers/PodcastManager.js`
- Keep `isYouTubeFeed` and `checkYouTubeFeedForNewEpisodes`.
- Keep video download queue handling in `scanAddPodcastEpisodeMediaFile` and `runEpisodeCheck`.

### 5. `server/models/LibraryItem.js`
- Keep the `separate: true` query optimization on ` podcastEpisodes` in `findAllExpandedWhere` (commit `73766167`) unless upstream implemented an equivalent fix.

### 6. `server/routers/ApiRouter.js`
- Keep `/items/:id/episode/:episodeId/thumbnail`, `/podcasts/feed/match-itunes`, `/podcasts/:id/download-yt-episode`, `/yt-dlp/status`, and `/yt-dlp/info` routes alongside upstream route middleware updates (such as `requireUploadPermission, fileUploadParser`).

### 7. `index.js` & `server/Logger.js`
- Keep GlitchTip/Sentry initialization (`@sentry/node`) and error capture hooks (commit `f6fa0578`).

### 8. `client/components/app/MediaPlayerContainer.vue`
- Keep video element mounting and container height methods (`mountVideoElement`, `updatePlayerHeightCss`).
- Keep `isVideoEpisode` checks for player sizing, PiP, and floating mini-player.

### 9. `Dockerfile`
- Keep `ffmpeg`, `libva-utils`, `python3`, `py3-pip`, `yt-dlp`, and x86_64 Intel VA-API drivers (`intel-media-driver`, `libva-intel-driver`) in the runtime stage.

### 10. `package.json` & `package-lock.json`
- Accept upstream version bumps and dependency updates.
- Keep `"@sentry/node"` in `dependencies`.
- Keep `"jaygz/avbookshelf"` as the target image repository in the `docker`, `docker-amd64-local`, and `docker-arm64-local` scripts (never revert to `advplyr/audiobookshelf`).
- Run `npm install` after resolving `package.json` to regenerate `package-lock.json`.

---

## 5. Post-merge verification

1. Install server dependencies and clear stale incremental TypeScript build cache:
   ```bash
   npm install
   rm -rf dist-server
   ```

2. Run the server build and test suite:
   ```bash
   npm test
   ```
   All tests must pass before pushing.

3. Verify the client static build succeeds:
   ```bash
   npm run client
   ```

---

## 6. Commit and push to GitHub

1. If conflicts were resolved or lockfiles updated, stage and commit:
   ```bash
   git add -A
   git commit -m "chore: merge upstream/master updates and resolve conflicts"
   ```

2. Push `master` to GitHub (`origin`):
   ```bash
   git push origin master
   ```

---

## 7. Build and push Docker image to Docker Hub

1. Read the current version from `package.json`:
   ```bash
   VERSION=$(node -p "require('./package.json').version")
   echo "Building jaygz/avbookshelf:${VERSION} and jaygz/avbookshelf:latest"
   ```

2. Build and push the multi-arch image (`linux/amd64,linux/arm64`) to Docker Hub under `jaygz/avbookshelf`:
   ```bash
   docker buildx build \
     --platform linux/amd64,linux/arm64 \
     --push \
     -t jaygz/avbookshelf:latest \
     -t jaygz/avbookshelf:${VERSION} \
     .
   ```
   *(Note: `npm run docker` also builds and pushes `jaygz/avbookshelf:latest` via `buildx`.)*
