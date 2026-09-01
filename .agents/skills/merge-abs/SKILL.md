---
name: merge-abs
description: >-
  Merges upstream updates from the original Audiobookshelf repository (advplyr/audiobookshelf)
  into this AVBookshelf fork, handles conflict resolution across video subsystem touchpoints,
  runs tests, and verifies compatibility. Use whenever the user asks to sync, update, or merge
  from upstream audiobookshelf.
---

# Merge Upstream Audiobookshelf (`merge-abs`)

This skill provides the end-to-end workflow for pulling, merging, resolving conflicts, and validating updates from the upstream `advplyr/audiobookshelf` repository into this fork (`jaygz316/avbookshelf`).

---

## 1. Pre-Merge Checks

1. Verify git remotes are properly configured:
   ```bash
   git remote -v
   ```
   - `origin` must point to `https://github.com/jaygz316/avbookshelf.git`
   - `upstream` must point to `https://github.com/advplyr/audiobookshelf.git` (if missing, add with `git remote add upstream https://github.com/advplyr/audiobookshelf.git`)

2. Ensure working tree is clean:
   ```bash
   git status
   ```
   If uncommitted changes exist, commit or stash them before proceeding:
   ```bash
   git commit -am "chore: save local state before upstream merge"
   # OR
   git stash
   ```

---

## 2. Fetch Upstream Changes

Fetch the latest branches and tags from upstream:
```bash
git fetch upstream --tags
```

Inspect incoming commits:
```bash
git log HEAD..upstream/master --oneline -20
```

---

## 3. Execute the Merge

Ensure you are on the `master` branch and merge upstream:

```bash
git checkout master
git merge upstream/master
```

*(Optional: To merge a specific release tag instead of master, run `git merge <tag_name>`, e.g. `git merge v2.37.0`)*

---

## 4. Conflict Resolution Guide

Because video subsystem functionality is isolated in `server/video/` and `client/video/`, new files will merge without conflict. If conflicts occur in modified upstream files, resolve them using this checklist:

### 1. `server/controllers/PodcastController.js`
- **What to preserve**:
  - `mapVideoInfoToEpisode` import and invocation inside `downloadYtDlpEpisode`.
  - YouTube feed handling and singleton `require('../video').videoManager` usage in `getPodcastFeed`.
  - `matchFeedEpisodes` route handler for iTunes episode matching.
- **Rule**: Accept all upstream bug fixes/features while ensuring the video download & feed branches remain intact.

### 2. `server/scanner/Scanner.js`
- **What to preserve**:
  - The `quickMatchYouTubeEpisodes` method.
  - The dispatch logic in `quickMatchPodcastEpisodes`:
    ```javascript
    if (isYouTube) {
      return this.quickMatchYouTubeEpisodes(libraryItem, options)
    }
    ```
- **Rule**: Keep upstream logic in `quickMatchPodcastEpisodes` for standard RSS feeds and delegate YouTube feeds to `quickMatchYouTubeEpisodes`.

### 3. `server/scanner/PodcastScanner.js`
- **What to preserve**:
  - Video file probing and scanning logic.
  - `.info.json` metadata parsing and published date extraction.
- **Rule**: Preserve the video file discovery and media probe separation hooks.

### 4. `server/managers/PodcastManager.js`
- **What to preserve**:
  - `isYouTubeFeed` helper method.
  - `checkYouTubeFeedForNewEpisodes` method.
  - Video download queue handling in `scanAddPodcastEpisodeMediaFile` and `runEpisodeCheck`.
- **Rule**: Accept upstream podcast manager updates, keeping YouTube/video checks hooked into the download pipeline.

### 5. `client/components/app/MediaPlayerContainer.vue`
- **What to preserve**:
  - Video element mounting and container height adjustments (`mountVideoElement`, `updatePlayerHeightCss`).
  - `isVideoEpisode` checks for player sizing, PiP, and floating mini-player.
- **Rule**: Preserve the reactive video element lifecycle and styling hooks while adopting any upstream audio player improvements.

### 6. `package.json` & `package-lock.json`
- **Rule**: Accept upstream version bumps and dependencies. If both upstream and local modified `package.json`, preserve both sets of dependencies and run `npm install` to regenerate `package-lock.json`.

---

## 5. Post-Merge Verification

1. Install updated dependencies:
   ```bash
   npm install
   ```

2. Run the test suite:
   ```bash
   npm test
   ```
   **All tests must pass (100%) before finalizing.**

3. If any test fails, inspect the stack trace and fix any broken imports, model changes, or method signatures.

---

## 6. Commit & Push

1. If conflicts were resolved manually:
   ```bash
   git add .
   git commit -m "chore: merge upstream/master updates and resolve conflicts"
   ```

2. Push the merged master to origin:
   ```bash
   git push origin master
   ```
