/**
 * VideoEpisodeMatcher.js
 * Modular episode extraction, fuzzy title cleaning, match scoring,
 * and bipartite matching between video feeds (e.g. YouTube) and canonical podcast feeds (Apple Podcasts/iTunes).
 */

function extractEpisodeNumbers(title) {
  if (!title || typeof title !== 'string') return { season: '', episode: '' }

  let season = ''
  let episode = ''

  // S01E02 or S1E2 or S1 Ep 2 or Season 1 Episode 2
  const seasonEpisodeMatch = title.match(/(?:season|s)\s*(\d+)[\s._-]*(?:episode|ep|e|#)\s*(\d+)/i)
  if (seasonEpisodeMatch) {
    season = String(parseInt(seasonEpisodeMatch[1], 10))
    episode = String(parseInt(seasonEpisodeMatch[2], 10))
    return { season, episode }
  }

  // Season only: Season 1 or S01
  const seasonMatch = title.match(/\b(?:season|s)\s*(\d+)\b/i)
  if (seasonMatch) {
    season = String(parseInt(seasonMatch[1], 10))
  }

  // Episode only: Episode 123, Ep. 123, Ep 123, #123, Part 123, No. 123, E123
  const epMatch = title.match(/(?:episode|ep\.?|#|no\.?|part)\s*[:.]?\s*(\d+)\b/i)
  if (epMatch) {
    episode = String(parseInt(epMatch[1], 10))
    return { season, episode }
  }

  // Bracket/Paren number: "(Ep 123)" or "[123]" or "(Episode 123)" or "(#123)"
  const bracketMatch = title.match(/[([{\s](?:ep|episode|#)?\s*(\d{1,5})[)\]}]/i)
  if (bracketMatch) {
    episode = String(parseInt(bracketMatch[1], 10))
    return { season, episode }
  }

  // Prefix number: "123 - Title" or "123. Title" or "123: Title" or "123 | Title"
  const prefixMatch = title.match(/^(\d{1,5})\s*[-–—.:|]\s*/)
  if (prefixMatch) {
    episode = String(parseInt(prefixMatch[1], 10))
    return { season, episode }
  }

  // Suffix number: "Title - 123" or "Title | #123" or "Title - Ep 123" or "Title—123"
  const suffixMatch = title.match(/[-–—|]\s*(?:ep\.?|episode|#)?\s*(\d{1,5})\s*$/i)
  if (suffixMatch) {
    episode = String(parseInt(suffixMatch[1], 10))
    return { season, episode }
  }

  return { season, episode }
}

function cleanTitleForMatching(title, podcastTitle = '') {
  if (!title || typeof title !== 'string') return ''
  let cleaned = title.toLowerCase()

  if (podcastTitle) {
    const podClean = podcastTitle.toLowerCase().replace(/[^\w\s]/g, ' ').trim()
    if (podClean.length > 3) {
      cleaned = cleaned.split(podClean).join(' ')
    }
  }

  // Remove common YouTube/podcast title artifacts
  cleaned = cleaned
    .replace(/\[.*?\]/g, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/(?:season|s)\s*\d+[\s._-]*(?:episode|ep|e|#)\s*\d+/gi, ' ')
    .replace(/\b(?:season|episode|ep\.?|part|no\.?)\s*#?\d+\b/gi, ' ')
    .replace(/#\d+/g, ' ')
    .replace(/^(\d{1,5})\s*[-–—.:|]\s+/g, ' ')
    .replace(/\s*[-–—|]\s*#?(\d{1,5})$/g, ' ')
    .replace(/[|:–—_/\\]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned
}

function levenshteinDistance(a, b) {
  if (!a || !b) return (a || b || '').length
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  return matrix[a.length][b.length]
}

function levenshteinSimilarity(a, b) {
  if (!a && !b) return 1
  if (!a || !b) return 0
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshteinDistance(a, b) / maxLen
}

function scoreEpisodeMatch(ytEp, itunesEp, podcastTitle = '') {
  let score = 0

  // 1. Episode Number Match
  const ytExtracted = extractEpisodeNumbers(ytEp.title || '')
  const ytEpNum = String(ytEp.episode || ytExtracted.episode || '').trim()
  const itunesExtracted = extractEpisodeNumbers(itunesEp.title || '')
  const itunesEpNum = String(itunesEp.episode || itunesExtracted.episode || '').trim()

  const ytSeason = String(ytEp.season || ytExtracted.season || '').trim()
  const itunesSeason = String(itunesEp.season || itunesExtracted.season || '').trim()

  if (ytEpNum && itunesEpNum) {
    if (ytEpNum === itunesEpNum) {
      score += 0.65
      if (ytSeason && itunesSeason) {
        if (ytSeason === itunesSeason) {
          score += 0.15
        } else {
          score -= 0.40 // Season mismatch penalty
        }
      }
    }
  }

  // 2. Title Similarity
  const ytClean = cleanTitleForMatching(ytEp.title || '', podcastTitle)
  const itunesClean = cleanTitleForMatching(itunesEp.title || '', podcastTitle)

  if (ytClean && itunesClean) {
    if (ytClean === itunesClean) {
      score += 0.50
    } else {
      const sim = levenshteinSimilarity(ytClean, itunesClean)
      // Word token Jaccard similarity
      const ytWords = new Set(ytClean.split(' ').filter((w) => w.length > 2))
      const itunesWords = new Set(itunesClean.split(' ').filter((w) => w.length > 2))
      let jaccard = 0
      if (ytWords.size && itunesWords.size) {
        let intersection = 0
        ytWords.forEach((w) => {
          if (itunesWords.has(w)) intersection++
        })
        const union = new Set([...ytWords, ...itunesWords]).size
        jaccard = union > 0 ? intersection / union : 0
      }

      const bestTextSim = Math.max(sim, jaccard)
      score += bestTextSim * 0.45

      // Substring check
      if ((ytClean.length > 6 && itunesClean.includes(ytClean)) || (itunesClean.length > 6 && ytClean.includes(itunesClean))) {
        score = Math.max(score, score + 0.20)
      }
    }
  }

  // 3. Publish Date Proximity
  const t1 = Number(ytEp.publishedAt)
  const t2 = Number(itunesEp.publishedAt)
  if (!isNaN(t1) && !isNaN(t2) && t1 > 0 && t2 > 0) {
    const diffDays = Math.abs(t1 - t2) / (1000 * 60 * 60 * 24)
    if (diffDays <= 1.0) {
      score += 0.35 // Published within 24h
    } else if (diffDays <= 3.0) {
      score += 0.20 // Published within 3 days
    } else if (diffDays <= 7.0) {
      score += 0.10 // Published within a week
    } else if (diffDays > 30.0 && !ytEpNum) {
      score -= 0.30 // Major date discrepancy with no episode number match
    }
  }

  // 4. Duration Proximity
  const ytDuration = ytEp.durationSeconds || ytEp.duration
  const itunesDuration = itunesEp.durationSeconds || itunesEp.duration
  if (ytDuration && itunesDuration && !isNaN(Number(ytDuration)) && !isNaN(Number(itunesDuration))) {
    const d1 = Number(ytDuration)
    const d2 = Number(itunesDuration)
    if (d1 > 0 && d2 > 0) {
      const ratio = Math.min(d1, d2) / Math.max(d1, d2)
      const diffSec = Math.abs(d1 - d2)
      if (diffSec < 60 || ratio >= 0.95) {
        score += 0.15
      } else if (diffSec < 180 || ratio >= 0.85) {
        score += 0.08
      }
    }
  }

  return score
}

function matchYouTubeEpisodesWithItunesFeed(ytEpisodes, itunesEpisodes, options = {}) {
  if (!Array.isArray(ytEpisodes) || !ytEpisodes.length) {
    return { matchedEpisodes: [], matchedCount: 0, totalCount: 0 }
  }
  if (!Array.isArray(itunesEpisodes) || !itunesEpisodes.length) {
    const processed = ytEpisodes.map((ep) => {
      const extracted = extractEpisodeNumbers(ep.title || '')
      return {
        ...ep,
        season: ep.season || extracted.season || '',
        episode: ep.episode || extracted.episode || ''
      }
    })
    return { matchedEpisodes: processed, matchedCount: 0, totalCount: ytEpisodes.length }
  }

  const minScore = options.minScore !== undefined ? options.minScore : 0.38
  const podcastTitle = options.podcastTitle || ''

  const matchCandidates = []
  ytEpisodes.forEach((ytEp, ytIdx) => {
    itunesEpisodes.forEach((itunesEp, itunesIdx) => {
      const score = scoreEpisodeMatch(ytEp, itunesEp, podcastTitle)
      if (score >= minScore) {
        matchCandidates.push({ ytIdx, itunesIdx, score })
      }
    })
  })

  matchCandidates.sort((a, b) => b.score - a.score)

  const matchedYtIndices = new Set()
  const matchedItunesIndices = new Set()
  const ytToItunesMap = new Map()

  for (const cand of matchCandidates) {
    if (!matchedYtIndices.has(cand.ytIdx) && !matchedItunesIndices.has(cand.itunesIdx)) {
      matchedYtIndices.add(cand.ytIdx)
      matchedItunesIndices.add(cand.itunesIdx)
      ytToItunesMap.set(cand.ytIdx, {
        itunesEp: itunesEpisodes[cand.itunesIdx],
        score: cand.score
      })
    }
  }

  let matchedCount = 0
  const resultEpisodes = ytEpisodes.map((ytEp, idx) => {
    const match = ytToItunesMap.get(idx)
    const extracted = extractEpisodeNumbers(ytEp.title || '')
    const videoEnclosure = ytEp.enclosure || (ytEp.url ? { url: ytEp.url, type: 'video/mp4' } : null)

    if (match) {
      matchedCount++
      const itunesEp = match.itunesEp

      return {
        ...ytEp,
        title: ytEp.title || itunesEp.title,
        canonicalTitle: itunesEp.title,
        subtitle: itunesEp.subtitle || ytEp.subtitle || '',
        description: itunesEp.description || ytEp.description || '',
        descriptionPlain: itunesEp.descriptionPlain || ytEp.descriptionPlain || '',
        season: itunesEp.season || extracted.season || ytEp.season || '',
        episode: itunesEp.episode || extracted.episode || ytEp.episode || '',
        episodeType: itunesEp.episodeType || ytEp.episodeType || 'full',
        pubDate: itunesEp.pubDate || ytEp.pubDate || '',
        publishedAt: itunesEp.publishedAt || ytEp.publishedAt || null,
        chapters: itunesEp.chapters?.length ? itunesEp.chapters : (ytEp.chapters || []),
        enclosure: videoEnclosure,
        isVideo: ytEp.isVideo !== undefined ? ytEp.isVideo : true,
        isYtDlp: ytEp.isYtDlp !== undefined ? ytEp.isYtDlp : true,
        itunesMatched: true,
        itunesGuid: itunesEp.guid || null,
        matchScore: Math.round(match.score * 100) / 100
      }
    }

    return {
      ...ytEp,
      season: ytEp.season || extracted.season || '',
      episode: ytEp.episode || extracted.episode || '',
      enclosure: videoEnclosure,
      isVideo: ytEp.isVideo !== undefined ? ytEp.isVideo : true,
      isYtDlp: ytEp.isYtDlp !== undefined ? ytEp.isYtDlp : true,
      itunesMatched: false
    }
  })

  resultEpisodes.sort((a, b) => {
    const aPub = a.publishedAt ? Number(a.publishedAt) : (a.pubDate ? new Date(a.pubDate).getTime() : 0)
    const bPub = b.publishedAt ? Number(b.publishedAt) : (b.pubDate ? new Date(b.pubDate).getTime() : 0)
    if (aPub && bPub && aPub !== bPub) {
      return bPub - aPub
    }
    const hasAEp = a.episode != null && String(a.episode).trim() !== '' && !isNaN(Number(a.episode))
    const hasBEp = b.episode != null && String(b.episode).trim() !== '' && !isNaN(Number(b.episode))
    if (hasAEp && hasBEp) {
      const aEpNum = Number(a.episode)
      const bEpNum = Number(b.episode)
      if (aEpNum !== bEpNum) return bEpNum - aEpNum
    }
    return 0
  })

  return {
    matchedEpisodes: resultEpisodes,
    matchedCount,
    totalCount: ytEpisodes.length
  }
}

module.exports = {
  extractEpisodeNumbers,
  cleanTitleForMatching,
  levenshteinDistance,
  levenshteinSimilarity,
  scoreEpisodeMatch,
  matchYouTubeEpisodesWithItunesFeed
}
