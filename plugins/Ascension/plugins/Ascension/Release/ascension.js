(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // math-utils.js
  function parsePerformerEloData(item) {
    const defaultStats = {
      total_matches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      win_margin: 0,
      current_streak: 0,
      best_streak: 0,
      worst_streak: 0,
      last_match: null
    };
    if (!item?.custom_fields)
      return defaultStats;
    if (item.custom_fields.hotornot_stats) {
      try {
        const stats = JSON.parse(item.custom_fields.hotornot_stats);
        if (stats.scene_record) {
          delete stats.scene_record;
        }
        if (stats.performer_record) {
          delete stats.performer_record;
        }
        return { ...defaultStats, ...stats };
      } catch (e) {
        console.warn(`[Ascension] Failed to parse stats for item ${item.id}`);
      }
    }
    const eloMatches = parseInt(item.custom_fields.elo_matches, 10);
    if (!isNaN(eloMatches))
      return { ...defaultStats, total_matches: eloMatches };
    return defaultStats;
  }
  function getLowMatchBoost(performer, avgMatches) {
    const stats = parsePerformerEloData(performer);
    const matches = stats.total_matches || 0;
    if (matches === 0) {
      return 2;
    }
    if (avgMatches > 5 && matches < avgMatches * 0.3) {
      return 1.5;
    }
    if (avgMatches > 10 && matches < avgMatches * 0.5) {
      return 1.2;
    }
    return 1;
  }
  function calculateAverageMatches(performers) {
    if (!performers || performers.length === 0)
      return 0;
    const totalMatches = performers.reduce((sum, p) => {
      const stats = parsePerformerEloData(p);
      return sum + (stats.total_matches || 0);
    }, 0);
    return totalMatches / performers.length;
  }
  function getRecencyWeight(item) {
    const stats = parsePerformerEloData(item);
    const cacheKey = `${item.id}-${stats.last_match || "null"}-${item.rating100 || 1}-${stats.total_matches || 0}`;
    const now = Date.now();
    if (recencyWeightCache.has(cacheKey)) {
      const cached = recencyWeightCache.get(cacheKey);
      if (now - cached.timestamp < CACHE_TTL) {
        return cached.value;
      }
    }
    if (!stats.last_match || stats.total_matches === 0) {
      const result = 1;
      recencyWeightCache.set(cacheKey, { value: result, timestamp: now });
      return result;
    }
    const lastMatchDate = new Date(stats.last_match);
    const msSince = now - lastMatchDate.getTime();
    const minutesSince = msSince / (1e3 * 60);
    if (minutesSince < 30) {
      const result = 0;
      recencyWeightCache.set(cacheKey, { value: result, timestamp: now });
      return result;
    }
    const hoursSince = minutesSince / 60;
    let freshness = Math.min(1, 0.1 + hoursSince * 0.075);
    const matches = stats.total_matches || 0;
    if (matches < 10) {
      freshness = Math.min(1, freshness + 0.2);
    }
    recencyWeightCache.set(cacheKey, { value: freshness, timestamp: now });
    return freshness;
  }
  function getSceneRecencyWeight(scene) {
    const stats = parsePerformerEloData(scene);
    if (!stats.last_match || stats.total_matches === 0) {
      return 1;
    }
    const lastMatchDate = new Date(stats.last_match);
    const msSince = Date.now() - lastMatchDate.getTime();
    if (isNaN(msSince))
      return 1;
    const hoursSince = msSince / (1e3 * 60 * 60);
    if (hoursSince < 1)
      return 0;
    if (hoursSince < 24) {
      return Math.max(0.05, hoursSince / 24);
    }
    if (hoursSince < 168) {
      return 0.4 + Math.min(0.6, (hoursSince - 24) / 144 * 0.6);
    }
    if (hoursSince < 720) {
      return 0.7 + Math.min(0.3, (hoursSince - 168) / 552 * 0.3);
    }
    return 1;
  }
  function getSceneSelectionConfig(totalScenes = 1e3) {
    const scaleFactor = Math.min(1, Math.max(0.3, totalScenes / 27e3));
    return {
      sampleSize: Math.min(1200, Math.max(300, Math.floor(totalScenes * 0.04))),
      lowMatchThreshold: Math.max(3, Math.floor(10 * scaleFactor)),
      ratingWindowInitial: 18,
      ratingWindowMax: 50,
      ratingWindowMin: 6,
      recentCooldownSize: Math.min(300, Math.max(75, Math.floor(totalScenes * 0.01))),
      similarityPenalty: 0.65,
      maxSimilarityPenalty: 0.15,
      persistentCooldownHours: 6,
      hardRepeatWindowHours: 24,
      drainModeRepeatPenalty: 0.05,
      metadataRefreshInterval: 10
    };
  }
  function calculateSceneSimilarity(sceneA, sceneB) {
    if (!sceneA || !sceneB || sceneA.id === sceneB.id)
      return 1;
    let penalty = 0;
    let weight = 0;
    const performersA = new Set((sceneA.performers || []).map((p) => p?.id).filter(Boolean));
    const performersB = new Set((sceneB.performers || []).map((p) => p?.id).filter(Boolean));
    if (performersA.size > 0 || performersB.size > 0) {
      const maxPerformers = Math.max(performersA.size, performersB.size, 1);
      const sharedPerformers = [...performersA].filter((id) => performersB.has(id)).length;
      penalty += sharedPerformers / maxPerformers * 0.55;
      weight += 0.55;
    }
    const studioA = sceneA.studio?.id;
    const studioB = sceneB.studio?.id;
    if (studioA || studioB) {
      if (studioA && studioB && studioA === studioB) {
        penalty += 0.25;
      }
      weight += 0.25;
    }
    const tagsA = new Set((sceneA.tags || []).map((t) => t?.id).filter(Boolean));
    const tagsB = new Set((sceneB.tags || []).map((t) => t?.id).filter(Boolean));
    if (tagsA.size > 0 || tagsB.size > 0) {
      const maxTags = Math.max(tagsA.size, tagsB.size, 1);
      const sharedTags = [...tagsA].filter((id) => tagsB.has(id)).length;
      penalty += sharedTags / maxTags * 0.2;
      weight += 0.2;
    }
    return weight > 0 ? penalty / weight : 0;
  }
  function weightedRandomSelect(items, weights) {
    if (!items?.length || items.length !== weights?.length)
      return null;
    const cumulativeWeights = [];
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += weights[i];
      cumulativeWeights.push(sum);
    }
    if (sum <= 0)
      return items[Math.floor(Math.random() * items.length)];
    const random = Math.random() * sum;
    let low = 0;
    let high = cumulativeWeights.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (cumulativeWeights[mid] < random) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return items[low];
  }
  function updatePerformerStats(currentStats, won, margin = 0) {
    const newStats = {
      ...currentStats,
      total_matches: (currentStats.total_matches || 0) + 1,
      last_match: (/* @__PURE__ */ new Date()).toISOString()
    };
    delete newStats.history;
    if (won === null) {
      newStats.draws = (currentStats.draws || 0) + 1;
      newStats.win_margin = currentStats.win_margin || 0;
      return newStats;
    }
    newStats.wins = won ? (currentStats.wins || 0) + 1 : currentStats.wins || 0;
    newStats.losses = won ? currentStats.losses || 0 : (currentStats.losses || 0) + 1;
    const absMargin = Math.abs(margin || 0);
    newStats.win_margin = (currentStats.win_margin || 0) + (won ? absMargin : -absMargin);
    newStats.current_streak = won ? currentStats.current_streak >= 0 ? (currentStats.current_streak || 0) + 1 : 1 : currentStats.current_streak <= 0 ? (currentStats.current_streak || 0) - 1 : -1;
    newStats.best_streak = Math.max(currentStats.best_streak || 0, newStats.current_streak);
    newStats.worst_streak = Math.min(currentStats.worst_streak || 0, newStats.current_streak);
    return newStats;
  }
  function getUnderdogMultiplier(rating, opponentRating, sameTier = false) {
    if (sameTier)
      return 1;
    const ratingDiff = opponentRating - rating;
    if (ratingDiff > 30)
      return 1.5;
    if (ratingDiff > 20)
      return 1.3;
    if (ratingDiff > 10)
      return 1.1;
    return 1;
  }
  function calculateMatchOutcome({
    winnerRating,
    loserRating,
    winnerEffectiveRating,
    loserEffectiveRating,
    winnerTier,
    loserTier,
    mode,
    winnerMatchCount,
    loserMatchCount,
    winnerStats = {},
    loserStats = {},
    isSpecialChallenge = false
  }) {
    const effWinner = winnerEffectiveRating ?? winnerRating;
    const effLoser = loserEffectiveRating ?? loserRating;
    const ratingDiff = effLoser - effWinner;
    const expectedWinner = 1 / (1 + Math.pow(10, ratingDiff / 400));
    const winnerK = getProgressiveKFactor(winnerRating, null, winnerMatchCount, mode);
    const loserK = getProgressiveKFactor(loserRating, null, loserMatchCount, mode);
    const sameTier = winnerTier && loserTier && winnerTier === loserTier;
    const winnerUnderdogMult = getUnderdogMultiplier(effWinner, effLoser, sameTier);
    const effDiff = effLoser - effWinner;
    let lossProtection = isSpecialChallenge ? 0.1 : getChallengeProtectionMultiplier(effDiff);
    let winnerGain = Math.round(winnerK * (1 - expectedWinner) * winnerUnderdogMult);
    let loserLoss = Math.round(loserK * expectedWinner * lossProtection);
    if (mode === "gauntlet") {
      const currentStreak = winnerStats.current_streak || 0;
      if (currentStreak >= 3) {
        const gauntletDampener = Math.max(0.3, 1 - (currentStreak - 3) * 0.15);
        winnerGain = Math.ceil(winnerGain * gauntletDampener);
      }
    }
    if (mode === "champion") {
      const winStreak = winnerStats.current_streak || 0;
      if (winStreak >= 5) {
        const streakPenalty = winStreak >= 10 ? 0.4 : 0.7;
        winnerGain = Math.ceil(winnerGain * streakPenalty);
      }
    }
    if (winnerRating >= 85) {
      winnerGain = Math.ceil(winnerGain * 0.6);
    } else if (winnerRating >= 70) {
      winnerGain = Math.ceil(winnerGain * 0.7);
    } else if (winnerRating >= 55) {
      winnerGain = Math.ceil(winnerGain * 0.8);
    }
    if (effWinner < effLoser - 20) {
      const gap = effLoser - effWinner;
      const scaleFactor = Math.max(0.3, 1 - (gap - 20) / 100);
      winnerGain = Math.ceil(winnerGain * scaleFactor);
      loserLoss = Math.ceil(loserLoss * scaleFactor);
      loserLoss = Math.min(loserLoss, 5);
    }
    if (effLoser < effWinner - 15) {
      const gap = effWinner - effLoser;
      const mitigationFactor = Math.max(0.2, 1 - gap / 45);
      loserLoss = Math.ceil(loserLoss * mitigationFactor);
      if (gap > 25) {
        loserLoss = Math.min(loserLoss, 3);
      }
    }
    return {
      winnerGain: Math.max(1, winnerGain),
      loserLoss: Math.max(0, loserLoss)
    };
  }
  function getProgressiveKFactor(rating, opponentRating, matchCount, mode = "swiss") {
    const count = matchCount || 0;
    const experienceFactor = 0.5 + 0.5 / (1 + Math.exp((count - 18) / 6));
    let baseK = 32 * experienceFactor;
    if (rating > 60) {
      const reductionFactor = Math.max(0.5, 1 - (rating - 60) / 70);
      baseK *= reductionFactor;
    }
    if (mode === "champion") {
      let kFactor = Math.round(baseK * 0.85);
      return Math.min(35, Math.max(6, kFactor));
    } else if (mode === "gauntlet") {
      let kFactor = Math.round(baseK * 1.1);
      return Math.min(45, Math.max(8, kFactor));
    }
    return Math.min(40, Math.max(6, Math.round(baseK)));
  }
  function getChallengeProtectionMultiplier(ratingDiff) {
    if (ratingDiff > 15) {
      if (ratingDiff > 30)
        return 0.7;
      if (ratingDiff > 25)
        return 0.8;
      if (ratingDiff > 20)
        return 0.85;
      return 0.9;
    }
    return 1;
  }
  var recencyWeightCache, CACHE_TTL;
  var init_math_utils = __esm({
    "math-utils.js"() {
      recencyWeightCache = /* @__PURE__ */ new Map();
      CACHE_TTL = 30 * 60 * 1e3;
    }
  });

  // rating-utils.js
  function getPerformerStats(performer) {
    let totalMatches = performer.total_matches ?? 0;
    let wins = performer.wins ?? 0;
    let winMargin = performer.win_margin ?? 0;
    if (performer.custom_fields?.hotornot_stats) {
      try {
        const stats = typeof performer.custom_fields.hotornot_stats === "string" ? JSON.parse(performer.custom_fields.hotornot_stats) : performer.custom_fields.hotornot_stats;
        if (totalMatches === 0 && (stats?.total_matches ?? 0) > 0)
          totalMatches = stats.total_matches;
        if (wins === 0 && (stats?.wins ?? 0) > 0)
          wins = stats.wins;
        if (winMargin === 0 && (stats?.win_margin ?? 0) !== 0)
          winMargin = stats.win_margin;
      } catch (e) {
      }
    }
    return { totalMatches, wins, winMargin };
  }
  function getFullPerformerStats(performer) {
    if (performer.custom_fields?.hotornot_stats) {
      try {
        return typeof performer.custom_fields.hotornot_stats === "string" ? JSON.parse(performer.custom_fields.hotornot_stats) : performer.custom_fields.hotornot_stats;
      } catch (e) {
        return null;
      }
    }
    return null;
  }
  function calculateBattleScore(performer) {
    if (!performer || typeof performer !== "object")
      return 0;
    const rating100 = performer.rating100 ?? performer.rawRating ?? 1;
    const displayRating = rating100 / 10;
    const stats = getPerformerStats(performer);
    const winRate = stats.totalMatches > 0 ? stats.wins / stats.totalMatches : 0;
    const compositeScore = rating100 / 100 + winRate * 0.5 + stats.winMargin / 100 + Math.log10(stats.wins + 1) * 0.2;
    return displayRating + compositeScore;
  }
  function getSortedBattleScores(performers) {
    let cached = sortedScoresCache.get(performers);
    if (!cached) {
      cached = performers.map((p) => calculateBattleScore(p)).sort((a, b) => b - a);
      sortedScoresCache.set(performers, cached);
    }
    return cached;
  }
  function findStrictlyBetterCount(sortedScores, score) {
    let lo = 0;
    let hi = sortedScores.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (sortedScores[mid] > score) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }
  function getTierFromPercentile(percentile, battleScore) {
    if (percentile < 0)
      percentile = 0;
    if (percentile > 100)
      percentile = 100;
    for (const gate of TIER_GATES) {
      if (percentile < gate.maxPercentile && battleScore >= gate.minBattleScore) {
        return gate.tier;
      }
    }
    return "F-Tier";
  }
  function getRatingTier(performer, allPerformers = null) {
    if (!performer || typeof performer !== "object")
      return "F-Tier";
    const rating100 = performer.rating100 ?? performer.rawRating ?? 1;
    const stats = getPerformerStats(performer);
    if (rating100 <= 1 && stats.totalMatches === 0)
      return "F-Tier";
    if (!Array.isArray(allPerformers) || allPerformers.length === 0) {
      if (rating100 >= 85)
        return "S-Tier";
      if (rating100 >= 70)
        return "A-Tier";
      if (rating100 >= 55)
        return "B-Tier";
      if (rating100 >= 40)
        return "C-Tier";
      if (rating100 >= 25)
        return "D-Tier";
      return "F-Tier";
    }
    const battleScore = calculateBattleScore(performer);
    const sortedScores = getSortedBattleScores(allPerformers);
    if (sortedScores.length === 0)
      return "F-Tier";
    const strictlyBetter = findStrictlyBetterCount(sortedScores, battleScore);
    const percentile = strictlyBetter / sortedScores.length * 100;
    return getTierFromPercentile(percentile, battleScore);
  }
  function getTierIndex(tierName) {
    return TIER_GATES.findIndex((g) => g.tier === tierName);
  }
  function getTierBracket(tierName) {
    const idx = getTierIndex(tierName);
    if (idx < 0)
      return { minPercentile: 0, maxPercentile: 100 };
    const prevMax = idx === 0 ? 0 : TIER_GATES[idx - 1].maxPercentile;
    return { minPercentile: prevMax, maxPercentile: TIER_GATES[idx].maxPercentile };
  }
  function getPercentilePosition(performer, allPerformers) {
    if (!Array.isArray(allPerformers) || allPerformers.length === 0)
      return 50;
    const battleScore = calculateBattleScore(performer);
    const sortedScores = getSortedBattleScores(allPerformers);
    const strictlyBetter = findStrictlyBetterCount(sortedScores, battleScore);
    return strictlyBetter / sortedScores.length * 100;
  }
  function calculateEffectiveEloRating(performer, allPerformers = null) {
    if (!Array.isArray(allPerformers) || allPerformers.length === 0) {
      return performer?.rating100 ?? performer?.rawRating ?? 1;
    }
    const tier = getRatingTier(performer, allPerformers);
    const tierIdx = getTierIndex(tier);
    const bracket = getTierBracket(tier);
    const tierSpan = bracket.maxPercentile - bracket.minPercentile;
    const percentile = getPercentilePosition(performer, allPerformers);
    const positionInTier = tierSpan > 0 ? Math.max(0, Math.min(1, (percentile - bracket.minPercentile) / tierSpan)) : 0;
    const baseRatings = {
      "S-Tier": 90,
      "A-Tier": 75,
      "B-Tier": 60,
      "C-Tier": 45,
      "D-Tier": 30,
      "F-Tier": 15
    };
    const base = baseRatings[tier] || 15;
    return base + (1 - positionInTier) * 15;
  }
  function getTierColor(tier) {
    switch (tier) {
      case "S-Tier":
        return "#eb9834";
      case "A-Tier":
        return "#e014aa";
      case "B-Tier":
        return "#7f1e82";
      case "C-Tier":
        return "#14bbe0";
      case "D-Tier":
        return "#92e014";
      case "F-Tier":
        return "#808080";
      default:
        return "#000000";
    }
  }
  function calculatePerformerCompositeScore(performer) {
    try {
      let stats = null;
      const statsJson = performer.custom_fields?.["hotornot_stats"];
      if (statsJson) {
        try {
          stats = typeof statsJson === "string" ? JSON.parse(statsJson) : statsJson;
        } catch (e) {
          console.warn(`[Ascension] Failed to parse stats for performer ${performer.id}:`, e);
        }
      }
      const totalMatches = stats?.total_matches ?? 0;
      const wins = stats?.wins ?? 0;
      const winRate = totalMatches > 0 ? wins / totalMatches : 0;
      const winMargin = stats?.win_margin ?? 0;
      const currentRating = performer.rating100 ?? performer.rawRating ?? 1;
      const compositeScore = currentRating / 100 + winRate * 0.5 + winMargin / 100 + Math.log10((wins || 0) + 1) * 0.2;
      return compositeScore;
    } catch (err) {
      console.error("[Ascension] Error calculating composite score:", err);
      return 0;
    }
  }
  async function getPerformerGlobalRank(performerId, allPerformers) {
    try {
      if (!performerId || !allPerformers || allPerformers.length === 0) {
        return null;
      }
      const targetPerformer = allPerformers.find((p) => p.id === performerId);
      if (!targetPerformer) {
        return null;
      }
      const battleScore = calculateBattleScore(targetPerformer);
      const fullStats = getFullPerformerStats(targetPerformer);
      const ratedPerformers = allPerformers.filter((p) => {
        if (p.rating100 !== null && p.rating100 > 1)
          return true;
        const sJson = p.custom_fields?.["hotornot_stats"];
        if (sJson) {
          try {
            const s = typeof sJson === "string" ? JSON.parse(sJson) : sJson;
            return s.total_matches > 0;
          } catch (e) {
            return false;
          }
        }
        return false;
      });
      const performersWithScores = ratedPerformers.map((p) => ({
        ...p,
        battleScore: calculateBattleScore(p)
      }));
      performersWithScores.sort((a, b) => {
        const scoreDiff = b.battleScore - a.battleScore;
        if (scoreDiff !== 0)
          return scoreDiff;
        return getPerformerStats(b).wins - getPerformerStats(a).wins;
      });
      const rank = performersWithScores.findIndex((p) => p.id === performerId) + 1;
      return {
        rank,
        total: performersWithScores.length,
        rating: targetPerformer.rating100 ?? 1,
        stats: fullStats,
        battleScore
      };
    } catch (err) {
      console.error("[Ascension] Error calculating global rank:", err);
      return null;
    }
  }
  function calculateAllPerformerRanks(allPerformers) {
    try {
      if (!allPerformers || allPerformers.length === 0) {
        return /* @__PURE__ */ new Map();
      }
      const ratedPerformers = allPerformers.filter((p) => {
        if (p.rating100 !== null && p.rating100 > 1)
          return true;
        const statsJson = p.custom_fields?.["hotornot_stats"];
        if (statsJson) {
          try {
            const stats = typeof statsJson === "string" ? JSON.parse(statsJson) : statsJson;
            return stats.total_matches > 0;
          } catch (e) {
            return false;
          }
        }
        return false;
      });
      const performersWithScores = ratedPerformers.map((p) => ({
        ...p,
        battleScore: calculateBattleScore(p),
        stats: getFullPerformerStats(p)
      }));
      performersWithScores.sort((a, b) => {
        const scoreDiff = b.battleScore - a.battleScore;
        if (scoreDiff !== 0)
          return scoreDiff;
        return getPerformerStats(b).wins - getPerformerStats(a).wins;
      });
      const rankMap = /* @__PURE__ */ new Map();
      performersWithScores.forEach((p, index) => {
        rankMap.set(p.id, {
          rank: index + 1,
          total: performersWithScores.length,
          rating: p.rating100 ?? 1,
          stats: p.stats,
          battleScore: p.battleScore
        });
      });
      const unratedPerformers = allPerformers.filter((p) => !rankMap.has(p.id));
      const ratedCount = performersWithScores.length;
      unratedPerformers.forEach((p) => {
        rankMap.set(p.id, {
          rank: ratedCount + 1,
          total: ratedCount,
          rating: p.rating100 ?? 1,
          stats: null,
          battleScore: 0
        });
      });
      return rankMap;
    } catch (err) {
      console.error("[Ascension] Error calculating all performer ranks:", err);
      return /* @__PURE__ */ new Map();
    }
  }
  var TIER_GATES, sortedScoresCache;
  var init_rating_utils = __esm({
    "rating-utils.js"() {
      TIER_GATES = Object.freeze([
        { tier: "S-Tier", maxPercentile: 5, minBattleScore: 9 },
        { tier: "A-Tier", maxPercentile: 18, minBattleScore: 7.5 },
        { tier: "B-Tier", maxPercentile: 38, minBattleScore: 5 },
        { tier: "C-Tier", maxPercentile: 68, minBattleScore: 2 },
        { tier: "D-Tier", maxPercentile: 88, minBattleScore: 0.4 },
        { tier: "F-Tier", maxPercentile: 100, minBattleScore: 0.11 }
      ]);
      sortedScoresCache = /* @__PURE__ */ new WeakMap();
    }
  });

  // state.js
  function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }
  function resetBattleState() {
    state.gauntletChampion = null;
    state.gauntletWins = 0;
    state.gauntletDefeated = [];
    state.gauntletFalling = false;
    state.gauntletFallingItem = null;
    state.gauntletChampionRank = 0;
    state.matchHistory = [];
    state.skippedId = null;
    state.sessionMatchCounts = {};
    state.recentlySelectedPerformers = [];
  }
  var state;
  var init_state = __esm({
    "state.js"() {
      init_math_utils();
      init_rating_utils();
      state = {
        // Current Matchup Info
        currentPair: { left: null, right: null },
        currentRanks: { left: null, right: null },
        // App Configuration & Context
        currentMode: "swiss",
        // "swiss", "gauntlet", or "champion"
        battleType: "performers",
        // "performers", "scenes", or "images"
        totalItemsCount: 0,
        disableChoice: false,
        // Cache of the global unfiltered performer population for percentile tier calc
        globalPerformerPool: [],
        // Gauntlet/Champion Mode Progress
        gauntletChampion: null,
        gauntletWins: 0,
        gauntletChampionRank: 0,
        gauntletDefeated: [],
        gauntletFalling: false,
        gauntletFallingItem: null,
        // Filters & Settings
        cachedUrlFilter: null,
        badgeInjectionInProgress: false,
        pluginConfigCache: null,
        selectedGenders: (() => {
          try {
            const saved = localStorage.getItem("hotornot_selected_genders");
            return saved ? JSON.parse(saved) : ["FEMALE"];
          } catch (e) {
            return ["FEMALE"];
          }
        })(),
        selectedTiers: (() => {
          try {
            const saved = localStorage.getItem("hotornot_selected_tiers");
            return saved ? JSON.parse(saved) : ["any"];
          } catch (e) {
            return ["any"];
          }
        })(),
        // Enhanced tracking
        matchHistory: [],
        skippedIds: [],
        // Track multiple skipped IDs
        seenPairs: /* @__PURE__ */ new Set(),
        // Track seen performer pairs to prevent repetition
        // Skip tracking
        skippedId: null
      };
      state.tierRotation = state.tierRotation || {
        focusTier: "any",
        cycle: shuffleArray(["any", "S-Tier", "A-Tier", "B-Tier", "C-Tier", "D-Tier", "F-Tier", "newcomers"]),
        currentIndex: 0,
        sessionMatches: 0,
        lastSeen: {},
        matchCount: 0
      };
    }
  });

  // constants.js
  function formatBestStreakDisplay(winCount) {
    if (!winCount || winCount < 3)
      return winCount || "0";
    const emoji = getStreakEmoji(winCount);
    return `${winCount}${emoji ? " " + emoji : ""}`;
  }
  function getStreakEmoji(winCount) {
    if (!winCount || winCount < 3)
      return "";
    const streak = STREAK_EMOJIS.find((s) => winCount >= s.min && winCount <= s.max);
    return streak ? streak.symbol : "";
  }
  function formatStreakDisplay(winCount) {
    if (!winCount || winCount < 3)
      return "";
    const emoji = getStreakEmoji(winCount);
    if (!emoji)
      return "";
    return `${emoji} ${winCount}`;
  }
  var ALL_GENDERS, GENDER_ICONS, ALL_TIERS, COUNTRY_NAMES, STREAK_EMOJIS;
  var init_constants = __esm({
    "constants.js"() {
      ALL_GENDERS = Object.freeze([
        { value: "FEMALE", label: "Female" },
        { value: "MALE", label: "Male" },
        { value: "TRANSGENDER_MALE", label: "Trans Male" },
        { value: "TRANSGENDER_FEMALE", label: "Trans Female" },
        { value: "INTERSEX", label: "Intersex" },
        { value: "NON_BINARY", label: "Non-Binary" }
      ]);
      GENDER_ICONS = {
        "FEMALE": "\u2640\uFE0F",
        "MALE": "\u2642\uFE0F",
        "TRANSGENDER_MALE": "\u26A7\uFE0F\u2642\uFE0F",
        "TRANSGENDER_FEMALE": "\u26A7\uFE0F\u2640\uFE0F",
        "INTERSEX": "\u26A5",
        "NON_BINARY": "\u26A7\uFE0F"
      };
      ALL_TIERS = Object.freeze([
        { value: "any", label: "All Tiers (Default)", color: "#888888" },
        { value: "S-Tier", label: "S-Tier" },
        { value: "A-Tier", label: "A-Tier" },
        { value: "B-Tier", label: "B-Tier" },
        { value: "C-Tier", label: "C-Tier" },
        { value: "D-Tier", label: "D-Tier" },
        { value: "F-Tier", label: "F-Tier" },
        { value: "newcomers", label: "Newcomers", color: "#00ff00" }
      ]);
      COUNTRY_NAMES = Object.freeze({
        "AF": "Afghanistan",
        "AX": "\xC5land Islands",
        "AL": "Albania",
        "DZ": "Algeria",
        "AS": "American Samoa",
        "AD": "Andorra",
        "AO": "Angola",
        "AI": "Anguilla",
        "AQ": "Antarctica",
        "AG": "Antigua and Barbuda",
        "AR": "Argentina",
        "AM": "Armenia",
        "AW": "Aruba",
        "AU": "Australia",
        "AT": "Austria",
        "AZ": "Azerbaijan",
        "BS": "Bahamas",
        "BH": "Bahrain",
        "BD": "Bangladesh",
        "BB": "Barbados",
        "BY": "Belarus",
        "BE": "Belgium",
        "BZ": "Belize",
        "BJ": "Benin",
        "BM": "Bermuda",
        "BT": "Bhutan",
        "BO": "Bolivia",
        "BQ": "Bonaire, Sint Eustatius and Saba",
        "BA": "Bosnia and Herzegovina",
        "BW": "Botswana",
        "BV": "Bouvet Island",
        "BR": "Brazil",
        "IO": "British Indian Ocean Territory",
        "BN": "Brunei Darussalam",
        "BG": "Bulgaria",
        "BF": "Burkina Faso",
        "BI": "Burundi",
        "KH": "Cambodia",
        "CM": "Cameroon",
        "CA": "Canada",
        "CV": "Cape Verde",
        "KY": "Cayman Islands",
        "CF": "Central African Republic",
        "TD": "Chad",
        "CL": "Chile",
        "CN": "People's Republic of China",
        "CX": "Christmas Island",
        "CC": "Cocos (Keeling) Islands",
        "CO": "Colombia",
        "KM": "Comoros",
        "CG": "Republic of the Congo",
        "CD": "Democratic Republic of the Congo",
        "CK": "Cook Islands",
        "CR": "Costa Rica",
        "CI": "Cote d'Ivoire",
        "HR": "Croatia",
        "CU": "Cuba",
        "CW": "Cura\xE7ao",
        "CY": "Cyprus",
        "CZ": "Czech Republic",
        "DK": "Denmark",
        "DJ": "Djibouti",
        "DM": "Dominica",
        "DO": "Dominican Republic",
        "EC": "Ecuador",
        "EG": "Egypt",
        "SV": "El Salvador",
        "GQ": "Equatorial Guinea",
        "ER": "Eritrea",
        "EE": "Estonia",
        "ET": "Ethiopia",
        "SZ": "Eswatini",
        "FK": "Falkland Islands (Malvinas)",
        "FO": "Faroe Islands",
        "FJ": "Fiji",
        "FI": "Finland",
        "FR": "France",
        "GF": "French Guiana",
        "PF": "French Polynesia",
        "TF": "French Southern Territories",
        "GA": "Gabon",
        "GM": "Republic of The Gambia",
        "GE": "Georgia",
        "DE": "Germany",
        "GH": "Ghana",
        "GI": "Gibraltar",
        "GR": "Greece",
        "GL": "Greenland",
        "GD": "Grenada",
        "GP": "Guadeloupe",
        "GU": "Guam",
        "GT": "Guatemala",
        "GG": "Guernsey",
        "GN": "Guinea",
        "GW": "Guinea-Bissau",
        "GY": "Guyana",
        "HT": "Haiti",
        "HM": "Heard Island and McDonald Islands",
        "VA": "Holy See (Vatican City State)",
        "HN": "Honduras",
        "HK": "Hong Kong",
        "HU": "Hungary",
        "IS": "Iceland",
        "IN": "India",
        "ID": "Indonesia",
        "IR": "Islamic Republic of Iran",
        "IQ": "Iraq",
        "IE": "Ireland",
        "IM": "Isle of Man",
        "IL": "Israel",
        "IT": "Italy",
        "JM": "Jamaica",
        "JP": "Japan",
        "JE": "Jersey",
        "JO": "Jordan",
        "KZ": "Kazakhstan",
        "KE": "Kenya",
        "KI": "Kiribati",
        "KP": "North Korea",
        "KR": "South Korea",
        "XK": "Kosovo",
        "KW": "Kuwait",
        "KG": "Kyrgyzstan",
        "LA": "Lao People's Democratic Republic",
        "LV": "Latvia",
        "LB": "Lebanon",
        "LS": "Lesotho",
        "LR": "Liberia",
        "LY": "Libya",
        "LI": "Liechtenstein",
        "LT": "Lithuania",
        "LU": "Luxembourg",
        "MO": "Macao",
        "MG": "Madagascar",
        "MW": "Malawi",
        "MY": "Malaysia",
        "MV": "Maldives",
        "ML": "Mali",
        "MT": "Malta",
        "MH": "Marshall Islands",
        "MQ": "Martinique",
        "MR": "Mauritania",
        "MU": "Mauritius",
        "YT": "Mayotte",
        "MX": "Mexico",
        "FM": "Micronesia, Federated States of",
        "MD": "Moldova, Republic of",
        "MC": "Monaco",
        "MN": "Mongolia",
        "ME": "Montenegro",
        "MS": "Montserrat",
        "MA": "Morocco",
        "MZ": "Mozambique",
        "MM": "Myanmar",
        "NA": "Namibia",
        "NR": "Nauru",
        "NP": "Nepal",
        "NL": "Netherlands",
        "NC": "New Caledonia",
        "NZ": "New Zealand",
        "NI": "Nicaragua",
        "NE": "Niger",
        "NG": "Nigeria",
        "NU": "Niue",
        "NF": "Norfolk Island",
        "MK": "North Macedonia",
        "MP": "Northern Mariana Islands",
        "NO": "Norway",
        "OM": "Oman",
        "PK": "Pakistan",
        "PW": "Palau",
        "PS": "State of Palestine",
        "PA": "Panama",
        "PG": "Papua New Guinea",
        "PY": "Paraguay",
        "PE": "Peru",
        "PH": "Philippines",
        "PN": "Pitcairn",
        "PL": "Poland",
        "PT": "Portugal",
        "PR": "Puerto Rico",
        "QA": "Qatar",
        "RE": "Reunion",
        "RO": "Romania",
        "RU": "Russian Federation",
        "RW": "Rwanda",
        "BL": "Saint Barth\xE9lemy",
        "SH": "Saint Helena",
        "KN": "Saint Kitts and Nevis",
        "LC": "Saint Lucia",
        "MF": "Saint Martin (French part)",
        "PM": "Saint Pierre and Miquelon",
        "VC": "Saint Vincent and the Grenadines",
        "WS": "Samoa",
        "SM": "San Marino",
        "ST": "Sao Tome and Principe",
        "SA": "Saudi Arabia",
        "SN": "Senegal",
        "RS": "Serbia",
        "SC": "Seychelles",
        "SL": "Sierra Leone",
        "SG": "Singapore",
        "SX": "Sint Maarten (Dutch part)",
        "SK": "Slovakia",
        "SI": "Slovenia",
        "SB": "Solomon Islands",
        "SO": "Somalia",
        "ZA": "South Africa",
        "GS": "South Georgia and the South Sandwich Islands",
        "SS": "South Sudan",
        "ES": "Spain",
        "LK": "Sri Lanka",
        "SD": "Sudan",
        "SR": "Suriname",
        "SJ": "Svalbard and Jan Mayen",
        "SE": "Sweden",
        "CH": "Switzerland",
        "SY": "Syrian Arab Republic",
        "TW": "Taiwan, Province of China",
        "TJ": "Tajikistan",
        "TZ": "United Republic of Tanzania",
        "TH": "Thailand",
        "TL": "Timor-Leste",
        "TG": "Togo",
        "TK": "Tokelau",
        "TO": "Tonga",
        "TT": "Trinidad and Tobago",
        "TN": "Tunisia",
        "TR": "T\xFCrkiye",
        "TM": "Turkmenistan",
        "TC": "Turks and Caicos Islands",
        "TV": "Tuvalu",
        "UG": "Uganda",
        "UA": "Ukraine",
        "AE": "United Arab Emirates",
        "GB": "United Kingdom",
        "US": "United States of America",
        "UM": "United States Minor Outlying Islands",
        "UY": "Uruguay",
        "UZ": "Uzbekistan",
        "VU": "Vanuatu",
        "VE": "Venezuela",
        "VN": "Vietnam",
        "VG": "Virgin Islands, British",
        "VI": "Virgin Islands, U.S.",
        "WF": "Wallis and Futuna",
        "EH": "Western Sahara",
        "YE": "Yemen",
        "ZM": "Zambia",
        "ZW": "Zimbabwe"
      });
      STREAK_EMOJIS = [
        { min: 2, max: 3, symbol: "\u{1F525}" },
        { min: 4, max: 5, symbol: "\u2764\uFE0F\u200D\u{1F525}" },
        { min: 6, max: 8, symbol: "\u{1F48E}" },
        { min: 9, max: 12, symbol: "\u2660\uFE0F" },
        { min: 13, max: 17, symbol: "\u2728" },
        { min: 18, max: Infinity, symbol: "\u{1F451}" }
      ];
    }
  });

  // formatters.js
  function formatDuration(seconds) {
    if (!seconds)
      return "N/A";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}` : `${m}:${s.toString().padStart(2, "0")}`;
  }
  function escapeHtml(unsafe) {
    if (!unsafe)
      return "";
    return String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function getCountryDisplay(countryCode) {
    if (!countryCode)
      return "";
    const code = countryCode.toUpperCase().trim();
    const name = COUNTRY_NAMES[code] || escapeHtml(code);
    const flagClass = `fi fi-${code.toLowerCase().replace(/[^a-z]/g, "")}`;
    return `<span class="${flagClass}"></span> ${name}`;
  }
  var init_formatters = __esm({
    "formatters.js"() {
      init_constants();
      init_constants();
    }
  });

  // ui-swipe.js
  var ui_swipe_exports = {};
  __export(ui_swipe_exports, {
    enableCardCarousel: () => enableCardCarousel,
    isMobile: () => isMobile
  });
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }
  function enableCardCarousel(container, cards, options = {}) {
    if (cards.length < 2)
      return;
    const verticalFactor = options.verticalFactor || 1;
    const swipeThresholdRatio = options.swipeThresholdRatio !== void 0 ? options.swipeThresholdRatio : 0.15;
    const velocityThreshold = options.velocityThreshold !== void 0 ? options.velocityThreshold : 0.2;
    const onFocus = options.onFocus || null;
    const onBlur = options.onBlur || null;
    let currentIndex = 0;
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let isDragging = false;
    let previousActiveIndex = 0;
    const leftHint = document.createElement("div");
    leftHint.className = "hon-swipe-hint left";
    leftHint.innerHTML = "\u27A1\uFE0F";
    container.appendChild(leftHint);
    const rightHint = document.createElement("div");
    rightHint.className = "hon-swipe-hint right";
    rightHint.innerHTML = "\u2B05\uFE0F";
    container.appendChild(rightHint);
    container.style.touchAction = "pan-y";
    function updateStacking() {
      cards.forEach((card, index) => {
        card.classList.remove("stack-top", "stack-bottom");
        if (index === currentIndex) {
          card.classList.add("stack-top");
        } else {
          card.classList.add("stack-bottom");
        }
      });
    }
    function updateCardPositions() {
      const previousCard = cards[previousActiveIndex];
      const currentCard = cards[currentIndex];
      if (previousCard && previousActiveIndex !== currentIndex) {
        previousCard.classList.remove("active");
        previousCard.classList.add("inactive");
        if (previousCard.dispatchEvent) {
          previousCard.dispatchEvent(new Event("blur"));
        }
        if (typeof onBlur === "function") {
          onBlur(previousCard);
        }
      }
      cards.forEach((card, index) => {
        if (index === currentIndex) {
          card.classList.remove("inactive");
          card.classList.add("active");
          if (index !== previousActiveIndex && card.dispatchEvent) {
            card.dispatchEvent(new Event("focus"));
          }
          if (index !== previousActiveIndex && typeof onFocus === "function") {
            onFocus(card);
          }
        } else {
          card.classList.remove("active");
          card.classList.add("inactive");
        }
      });
      updateStacking();
      previousActiveIndex = currentIndex;
    }
    function showHint(direction) {
      const hint = direction === "left" ? leftHint : rightHint;
      hint.classList.add("visible");
      setTimeout(() => hint.classList.remove("visible"), 300);
    }
    function nextCard() {
      currentIndex = (currentIndex + 1) % cards.length;
      updateCardPositions();
      showHint("right");
      return true;
    }
    function prevCard() {
      currentIndex = (currentIndex - 1 + cards.length) % cards.length;
      updateCardPositions();
      showHint("left");
      return true;
    }
    function getCurrentCard() {
      return cards[currentIndex];
    }
    updateCardPositions();
    function handleTouchStart(e) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
      isDragging = true;
      const currentCard = getCurrentCard();
      if (currentCard) {
        currentCard.classList.add("swiping");
      }
    }
    function handleTouchMove(e) {
      if (!isDragging)
        return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const dx = x - startX;
      const dy = y - startY;
      if (Math.abs(dx) > Math.abs(dy) * verticalFactor) {
        e.preventDefault();
        e.stopPropagation();
        const currentCard = getCurrentCard();
        const direction = dx > 0 ? -1 : 1;
        const incomingIndex = (currentIndex + direction + cards.length) % cards.length;
        const incomingCard = cards[incomingIndex];
        if (currentCard) {
          currentCard.style.transform = `translateX(${dx}px) rotate(${dx * 0.05}deg)`;
          currentCard.style.opacity = 1 - Math.abs(dx) / (window.innerWidth * 1.2);
        }
        if (incomingCard) {
          const progress = Math.min(Math.abs(dx) / (window.innerWidth * 0.5), 1);
          incomingCard.style.opacity = 0.2 + 0.8 * progress;
          incomingCard.style.transform = `scale(${0.9 + 0.1 * progress}) translateY(${16 * (1 - progress)}px)`;
          incomingCard.style.zIndex = 25;
        }
      }
    }
    function handleTouchEnd(e) {
      if (!isDragging)
        return;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const dx = endX - startX;
      const dy = endY - startY;
      const deltaTime = Date.now() - startTime;
      isDragging = false;
      const currentCard = getCurrentCard();
      if (currentCard) {
        currentCard.classList.remove("swiping");
      }
      cards.forEach((card) => {
        card.style.transform = "";
        card.style.opacity = "";
        card.style.zIndex = "";
      });
      const threshold = window.innerWidth * swipeThresholdRatio;
      const velocity = deltaTime > 0 ? Math.abs(dx) / deltaTime : 0;
      if ((Math.abs(dx) > threshold || velocity > velocityThreshold) && Math.abs(dx) > Math.abs(dy) * verticalFactor) {
        if (dx > 0) {
          prevCard();
        } else {
          nextCard();
        }
      } else {
        updateCardPositions();
      }
    }
    const touchStartListener = handleTouchStart;
    const touchMoveListener = handleTouchMove;
    const touchEndListener = handleTouchEnd;
    container.addEventListener("touchstart", touchStartListener, { passive: false });
    container.addEventListener("touchmove", touchMoveListener, { passive: false });
    container.addEventListener("touchend", touchEndListener);
    return {
      getCurrentIndex: () => currentIndex,
      next: nextCard,
      prev: prevCard,
      getCurrentCard,
      destroy: () => {
        const opts = { passive: false };
        container.removeEventListener("touchstart", touchStartListener, opts);
        container.removeEventListener("touchmove", touchMoveListener, opts);
        container.removeEventListener("touchend", touchEndListener);
        if (leftHint && leftHint.parentNode) {
          leftHint.parentNode.removeChild(leftHint);
        }
        if (rightHint && rightHint.parentNode) {
          rightHint.parentNode.removeChild(rightHint);
        }
      }
    };
  }
  var init_ui_swipe = __esm({
    "ui-swipe.js"() {
    }
  });

  // ui-cards.js
  function formatHeight(heightCm) {
    if (!heightCm)
      return null;
    const totalInches = heightCm * 0.393701 + 0.5 | 0;
    const feet = totalInches / 12 | 0;
    const inches = totalInches % 12;
    return `${feet}\u2032${inches}\u2033 (${heightCm} cm)`;
  }
  function renderCard(item, side, rank) {
    const gauntletStreak = state.gauntletChampion?.id === item.id ? state.gauntletWins : null;
    if (state.battleType === "performers")
      return createPerformerCard(item, side, rank, gauntletStreak);
    if (state.battleType === "images")
      return createImageCard(item, side, rank, gauntletStreak);
    if (state.battleType === "scenes")
      return createSceneCard(item, side, rank, gauntletStreak);
    return createSceneCard(item, side, rank, gauntletStreak);
  }
  function createSceneCard(scene, side, rank = null, gauntletStreak = null) {
    const file = scene.files?.[0] || {};
    const performersHtml = scene.performers?.length ? scene.performers.map((p) => `<a href="/performers/${p.id}" target="_blank" class="hon-scene-link">${p.name}</a>`).join(", ") : "No performers";
    const studioHtml = scene.studio ? `<a href="/studios/${scene.studio.id}" target="_blank" class="hon-scene-link">${scene.studio.name}</a>` : "No studio";
    let title = scene.title;
    if (!title && file.path) {
      const pathParts = file.path.split(/[/\\]/);
      title = pathParts[pathParts.length - 1].replace(/\.[^/.]+$/, "");
    }
    title = title || `Scene #${scene.id}`;
    const screenshotPath = scene.paths?.screenshot;
    const previewPath = scene.paths?.preview;
    const stashRating = scene.rating100 ? (scene.rating100 / 10).toFixed(1) : "Unrated";
    const rankDisplay = rank != null ? `<span class="hon-scene-rank">${typeof rank === "number" ? "#" + rank : rank}</span>` : "";
    const streakDisplay = gauntletStreak ? `<div class="hon-streak-badge">${formatStreakDisplay(gauntletStreak)}</div>` : "";
    const dateDisplay = scene.date && scene.date !== "Unknown" ? `<div class="hon-meta-item"><strong>Date:</strong> ${scene.date}</div>` : "";
    const topActionsHtml = isMobile() ? `<div class="hon-scene-top-actions">
      <button type="button" class="hon-focus-btn" data-action="focus" aria-label="Focus card">\u{1F50D} Focus</button>
      <div class="hon-choose-btn hon-choose-btn-icon" data-winner="${scene.id}">
        <span class="hon-choose-icon hon-choose-icon-default">\u2B55</span>
        <span class="hon-choose-icon hon-choose-icon-selected">\u2705</span>
        <span class="hon-choose-icon hon-choose-icon-rejected">\u274C</span>
      </div>
    </div>` : "";
    const htmlParts = [];
    htmlParts.push(
      '<div class="hon-scene-card" data-scene-id="',
      scene.id,
      '" data-side="',
      side,
      '" data-rating="',
      scene.rating100 || 1,
      '">',
      '<div class="hon-scene-image-container" data-scene-url="/scenes/',
      scene.id,
      '">'
    );
    if (screenshotPath) {
      htmlParts.push('<img class="hon-scene-image" src="', screenshotPath, '" alt="', title, '" loading="lazy" />');
    } else {
      htmlParts.push('<div class="hon-scene-image hon-no-image">No Screenshot</div>');
    }
    if (previewPath) {
      htmlParts.push('<video class="hon-hover-preview" src="', previewPath, '" loop playsinline muted></video>');
    }
    htmlParts.push(
      '<div class="hon-scene-duration">',
      formatDuration(file.duration),
      "</div>",
      streakDisplay,
      '<div class="hon-click-hint">Click to open scene</div>',
      "</div>",
      '<div class="hon-scene-body" data-winner="',
      scene.id,
      '">',
      '<div class="hon-scene-info">',
      topActionsHtml,
      '<div class="hon-scene-title-row"><h3 class="hon-scene-title">',
      title,
      "</h3>",
      rankDisplay,
      "</div>",
      '<div class="hon-scene-meta">'
    );
    htmlParts.push(
      '<div class="hon-meta-item"><strong>Studio:</strong> ',
      studioHtml,
      "</div>",
      '<div class="hon-meta-item"><strong>Performers:</strong> ',
      performersHtml,
      "</div>",
      '<div class="hon-meta-item"><strong>Rating:</strong> ',
      stashRating,
      "</div>"
    );
    if (dateDisplay)
      htmlParts.push(dateDisplay);
    htmlParts.push(
      '<div class="hon-meta-item"><strong>Duration:</strong> ',
      formatDuration(file.duration),
      "</div>"
    );
    if (scene.director) {
      htmlParts.push('<div class="hon-meta-item"><strong>Director:</strong> ', scene.director, "</div>");
    }
    if (scene.tags?.length) {
      const tags = scene.tags.map((t) => t.name).join(", ");
      htmlParts.push('<div class="hon-meta-item"><strong>Tags:</strong> ', tags, "</div>");
    }
    htmlParts.push(
      "</div></div>",
      '<div class="hon-choose-btn">\u2713 Choose This Scene</div>',
      "</div></div>"
    );
    return htmlParts.join("");
  }
  function createPerformerCard(performer, side, rank = null, gauntletStreak = null) {
    const name = performer.name || `Performer #${performer.id}`;
    const imagePath = performer.image_path;
    const rawRating = performer.rating100 ?? 1;
    const isRated = performer.rating100 !== null;
    const stashRating = isRated ? (rawRating / 10).toFixed(1) : "Unrated";
    let tierClass = "";
    let tierDisplay = "";
    let battleScore = null;
    if (isRated) {
      const tier = getRatingTier(performer, state.globalPerformerPool);
      const tierColor = getTierColor(tier);
      tierDisplay = `<span style="font-weight: bold; color: ${tierColor}">${tier}</span> | `;
      tierClass = ` tier-${tier.toLowerCase().charAt(0)}`;
      battleScore = calculateBattleScore(performer);
    }
    let genderIcon = "";
    if (performer.gender) {
      const genderKey = performer.gender.toUpperCase();
      genderIcon = GENDER_ICONS[genderKey] || "\u{1F464}";
    }
    let currentStreakDisplay = "";
    if (performer.custom_fields?.hotornot_stats) {
      try {
        const stats = JSON.parse(performer.custom_fields.hotornot_stats);
        if (stats.current_streak && stats.current_streak >= 3 && !gauntletStreak) {
          const streakDisplay2 = formatStreakDisplay(stats.current_streak);
          currentStreakDisplay = `<div class="hon-streak-badge" style="position: absolute; top: 5px; left: 5px;">${streakDisplay2}</div>`;
        }
      } catch (e) {
        console.warn(`[Ascension] Failed to parse hotornot_stats for performer ${performer.id}:`, e);
      }
    }
    let countsHtml = "";
    const sceneCount = performer.scene_count || 0;
    const galleryCount = performer.gallery_count || 0;
    const imageCount = performer.image_count || 0;
    if (sceneCount > 0 || galleryCount > 0 || imageCount > 0) {
      const sceneDisplay = sceneCount > 0 ? `\u{1F3A5}(${sceneCount})` : "";
      const galleryDisplay = galleryCount > 0 ? `\u{1F5BC}\uFE0F(${galleryCount})` : "";
      const imageDisplay = imageCount > 0 ? `\u{1F4F7}(${imageCount})` : "";
      const countsArray = [sceneDisplay, galleryDisplay, imageDisplay].filter(Boolean);
      if (countsArray.length > 0) {
        countsHtml = ` | ${countsArray.join(" ")}`;
      }
    }
    const metaItems = [];
    if (battleScore !== null) {
      metaItems.push(`<div class="hon-meta-item"><strong>Ascended Score:</strong> ${tierDisplay}<span class="hon-asc-score" data-asc-score="${battleScore.toFixed(2)}">${battleScore.toFixed(2)}</span></div>`);
    } else {
      metaItems.push(`<div class="hon-meta-item"><strong>Rating:</strong> ${tierDisplay}${stashRating}</div>`);
    }
    if (performer.country) {
      metaItems.push(`<div class="hon-meta-item"><strong>Country:</strong> ${getCountryDisplay(performer.country)}</div>`);
    }
    if (performer.height_cm) {
      const heightFormatted = formatHeight(performer.height_cm);
      if (heightFormatted) {
        metaItems.push(`<div class="hon-meta-item"><strong>Height:</strong> ${heightFormatted}</div>`);
      }
    }
    if (performer.measurements) {
      metaItems.push(`<div class="hon-meta-item"><strong>Measurements:</strong> ${performer.measurements}</div>`);
    }
    if (performer.fake_tits) {
      metaItems.push(`<div class="hon-meta-item"><strong>Fake Tits:</strong> ${performer.fake_tits}</div>`);
    }
    if (performer.tags?.length) {
      const tags = performer.tags;
      if (tags.length <= 3) {
        let tagString = "";
        for (let i = 0; i < tags.length; i++) {
          if (i > 0)
            tagString += ", ";
          tagString += tags[i].name || tags[i];
        }
        metaItems.push(`<div class="hon-meta-item"><strong>Tags:</strong> ${tagString}</div>`);
      } else {
        let displayedString = "";
        let fullString = "";
        for (let i = 0; i < tags.length; i++) {
          const tagName = tags[i].name || tags[i];
          if (i < 3) {
            if (i > 0)
              displayedString += ", ";
            displayedString += tagName;
          }
          if (i > 0)
            fullString += ", ";
          fullString += tagName;
        }
        const remainingCount = tags.length - 3;
        metaItems.push(`
        <div class="hon-meta-item hon-tags-container">
          <strong>Tags:</strong> 
          <span class="hon-tags-displayed">${displayedString}</span>
          <span class="hon-tags-ellipsis">...</span>
          <span class="hon-tags-more" style="color: #007bff; cursor: pointer; text-decoration: underline;" data-tags-expanded="false">(+${remainingCount} more)</span>
          <span class="hon-tags-expanded" style="display:none;">${fullString}</span>
        </div>`);
      }
    }
    const minMetaItems = 6;
    while (metaItems.length < minMetaItems) {
      metaItems.push('<div class="hon-meta-item hon-meta-placeholder">&nbsp;</div>');
    }
    const streakDisplay = gauntletStreak && gauntletStreak >= 3 ? `<div class="hon-streak-badge">${formatStreakDisplay(gauntletStreak)}</div>` : "";
    return `
    <div class="hon-performer-card hon-scene-card${tierClass}" data-performer-id="${performer.id}" data-side="${side}" data-rating="${performer.rating100 || 1}" data-asc-score="${battleScore?.toFixed(2) ?? ""}">
      <div class="hon-performer-image-container hon-scene-image-container">
        <a href="/performers/${performer.id}" target="_blank" class="hon-performer-link">
          ${imagePath ? `<img class="hon-performer-image hon-scene-image" src="${imagePath}" alt="${name}" />` : `<div class="hon-no-image">No Image</div>`}
        </a>
        ${currentStreakDisplay}
        ${streakDisplay}
      </div>
      <div class="hon-performer-body hon-scene-body" data-winner="${performer.id}">
        <div class="hon-performer-info hon-scene-info">
          <div class="hon-performer-title-row hon-scene-title-row">
            <h3 class="hon-performer-title hon-scene-title">
              ${name} ${genderIcon}${countsHtml}
            </h3>
          </div>
          <div class="hon-performer-meta hon-scene-meta">
            ${metaItems.join("")}
          </div>
        </div>
        <div class="hon-choose-btn">\u2713 Choose This Performer</div>
      </div>
    </div>`;
  }
  function createImageCard(image, side, rank = null, gauntletStreak = null) {
    const thumbnailPath = image.paths?.thumbnail || null;
    const rankDisplay = rank != null ? `<span class="hon-image-rank hon-scene-rank">#${rank}</span>` : "";
    const streakDisplay = gauntletStreak && gauntletStreak >= 3 ? `<div class="hon-streak-badge">${formatStreakDisplay(gauntletStreak)}</div>` : "";
    return `
    <div class="hon-image-card hon-scene-card" data-image-id="${image.id}" data-side="${side}" data-rating="${image.rating100 || 1}">
      <div class="hon-image-image-container hon-scene-image-container" data-image-url="/images/${image.id}">
        ${thumbnailPath ? `<img class="hon-scene-image" src="${thumbnailPath}" />` : `<div class="hon-no-image">No Image</div>`}
        ${streakDisplay}
        ${rankDisplay ? `<div class="hon-image-rank-overlay">${rankDisplay}</div>` : ""}
      </div>
      <div class="hon-image-body hon-scene-body" data-winner="${image.id}">
        <div class="hon-choose-btn">\u2B55</div>
      </div>
    </div>`;
  }
  function createVictoryScreen(champion) {
    let title, imagePath;
    if (state.battleType === "performers") {
      title = champion.name || `Performer #${champion.id}`;
      imagePath = champion.image_path;
    } else if (state.battleType === "images") {
      title = `Image #${champion.id}`;
      imagePath = champion.paths?.thumbnail || null;
    } else if (state.battleType === "scenes") {
      const file = champion.files?.[0] || {};
      title = champion.title || file.path?.split(/[/\\]/).pop().replace(/\.[^/.]+$/, "") || `Scene #${champion.id}`;
      imagePath = champion.paths?.screenshot || null;
    } else {
      const file = champion.files?.[0] || {};
      title = champion.title || file.path?.split(/[/\\]/).pop().replace(/\.[^/.]+$/, "") || `Scene #${champion.id}`;
      imagePath = champion.paths?.screenshot || null;
    }
    return `
    <div class="hon-victory-screen">
      <div class="hon-victory-crown">\u{1F451}</div>
      <h2 class="hon-victory-title">CHAMPION!</h2>
      <div class="hon-victory-scene">
        ${imagePath ? `<img class="hon-victory-image" src="${imagePath}" alt="${title}" />` : `<div class="hon-victory-image hon-no-image">No Image</div>`}
      </div>
      <h3 class="hon-victory-name">${title}</h3>
      <p class="hon-victory-stats">Conquered all ${state.totalItemsCount} with ${state.gauntletWins} wins!</p>
      <button id="hon-new-gauntlet" class="btn btn-primary">Start New Gauntlet</button>
    </div>
  `;
  }
  function setupTagExpansion(cardElement) {
    const moreTags = cardElement.querySelectorAll(".hon-tags-more");
    moreTags.forEach((tag) => {
      tag.addEventListener("click", function(e) {
        e.stopPropagation();
        const container = this.closest(".hon-tags-container");
        const expandedTags = container.querySelector(".hon-tags-expanded");
        const displayedTags = container.querySelector(".hon-tags-displayed");
        const ellipsis = container.querySelector(".hon-tags-ellipsis");
        if (this.dataset.tagsExpanded === "false") {
          expandedTags.style.display = "inline";
          displayedTags.style.display = "none";
          ellipsis.style.display = "none";
          this.textContent = "(show less)";
          this.dataset.tagsExpanded = "true";
        } else {
          expandedTags.style.display = "none";
          displayedTags.style.display = "inline";
          ellipsis.style.display = "inline";
          this.textContent = `(+${this.textContent.match(/\d+/)[0]} more)`;
          this.dataset.tagsExpanded = "false";
        }
      });
    });
  }
  function preventLinkBubbling(cardElement) {
    const links = cardElement.querySelectorAll("a.hon-scene-link, a.hon-performer-link");
    links.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    });
  }
  var init_ui_cards = __esm({
    "ui-cards.js"() {
      init_state();
      init_formatters();
      init_rating_utils();
      init_constants();
      init_ui_swipe();
    }
  });

  // dom-utils.js
  function clearDOMCache() {
    elementCollectionCache.clear();
    commonElementsCache.clear();
  }
  var elementCollectionCache, commonElementsCache;
  var init_dom_utils = __esm({
    "dom-utils.js"() {
      elementCollectionCache = /* @__PURE__ */ new Map();
      commonElementsCache = /* @__PURE__ */ new Map();
    }
  });

  // parsers.js
  function getPerformerFilter(cachedUrlFilter, selectedGenders) {
    const filter = { ...cachedUrlFilter };
    delete filter.gender;
    if (selectedGenders.length > 0) {
      filter.gender = { value_list: selectedGenders, modifier: "INCLUDES" };
    }
    const hasOtherFilters = Object.keys(cachedUrlFilter || {}).some((k) => k !== "gender");
    if (!hasOtherFilters && !filter.NOT) {
      filter.NOT = { is_missing: "image" };
    }
    return filter;
  }
  var init_parsers = __esm({
    "parsers.js"() {
      init_constants();
    }
  });

  // api-client.js
  var api_client_exports = {};
  __export(api_client_exports, {
    IMAGE_FRAGMENT: () => IMAGE_FRAGMENT,
    PERFORMER_FRAGMENT: () => PERFORMER_FRAGMENT,
    SCENE_FRAGMENT: () => SCENE_FRAGMENT,
    fetchAllPerformerStats: () => fetchAllPerformerStats,
    fetchAllPerformersSorted: () => fetchAllPerformersSorted,
    fetchAllSceneMetadata: () => fetchAllSceneMetadata,
    fetchGlobalPerformerRatings: () => fetchGlobalPerformerRatings,
    fetchImageCount: () => fetchImageCount,
    fetchPerformerById: () => fetchPerformerById,
    fetchPerformerCount: () => fetchPerformerCount,
    fetchRandomImages: () => fetchRandomImages,
    fetchRandomPerformers: () => fetchRandomPerformers,
    fetchSceneById: () => fetchSceneById,
    fetchScenesByIds: () => fetchScenesByIds,
    getAllPerformersSorted: () => getAllPerformersSorted,
    getHotOrNotConfig: () => getHotOrNotConfig,
    graphqlQuery: () => graphqlQuery,
    handleComparison: () => handleComparison,
    isBattleRankBadgeEnabled: () => isBattleRankBadgeEnabled,
    undoLastMatch: () => undoLastMatch,
    updateImageRating: () => updateImageRating,
    updateItemRating: () => updateItemRating,
    updatePerformerRating: () => updatePerformerRating,
    updateSceneRating: () => updateSceneRating
  });
  async function graphqlQuery(query, variables = {}) {
    if (typeof PluginApi !== "undefined" && PluginApi.utils?.StashService?.getClient && PluginApi.libraries?.Apollo) {
      try {
        const { gql } = PluginApi.libraries.Apollo;
        const client = PluginApi.utils.StashService.getClient();
        const doc = gql(query);
        const isMutation = doc.definitions.some((def) => def.kind === "OperationDefinition" && def.operation === "mutation");
        const result2 = isMutation ? await client.mutate({ mutation: doc, variables }) : await client.query({ query: doc, variables, fetchPolicy: "no-cache" });
        return result2.data;
      } catch (e) {
        console.warn("[Ascension] Apollo fallback to fetch:", e.message);
      }
    }
    const response = await fetch("/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables })
    });
    const result = await response.json();
    if (result.errors && result.errors.length > 0) {
      if (result.errors.length === 1) {
        throw new Error(`GraphQL Error: ${result.errors[0].message}`);
      }
      const errorMessage = result.errors.map((e) => e.message).join("; ");
      throw new Error(`GraphQL Errors: ${errorMessage}`);
    }
    return result.data;
  }
  async function fetchAllItems2(queryTemplate, variablesBase = {}, pageSize = 1e3) {
    const allItems = [];
    let currentPage = 1;
    const baseFilter = variablesBase.filter || {};
    while (true) {
      const variables = {
        ...variablesBase,
        filter: Object.assign({}, baseFilter, {
          per_page: pageSize,
          page: currentPage
        })
      };
      const result = await graphqlQuery(queryTemplate, variables);
      const items = result.findPerformers?.performers || result.findImages?.images || result.findScenes?.scenes || [];
      if (items.length === 0)
        break;
      allItems.push.apply(allItems, items);
      if (items.length < pageSize)
        break;
      currentPage++;
    }
    return allItems;
  }
  async function fetchAllSceneMetadata() {
    const queryTemplate = `
    query FindSceneMetadata($filter: FindFilterType) {
      findScenes(filter: $filter) {
        scenes { id rating100 custom_fields }
      }
    }
  `;
    return await fetchAllItems2(queryTemplate, {
      filter: { sort: "rating100", direction: "DESC" }
    }, 1e3);
  }
  async function fetchScenesByIds(ids) {
    if (!ids || ids.length === 0)
      return [];
    const query = `
    query FindScenesByIds($filter: FindFilterType) {
      findScenes(filter: $filter) {
        scenes { ${SCENE_FRAGMENT} }
      }
    }
  `;
    const result = await graphqlQuery(query, {
      filter: { per_page: ids.length, ids }
    });
    return result?.findScenes?.scenes || [];
  }
  function sortPerformersByRating(performers) {
    const performerStats = /* @__PURE__ */ new Map();
    return performers.sort((a, b) => {
      const ratingDiff = (b.rating100 ?? 1) - (a.rating100 ?? 1);
      if (ratingDiff !== 0)
        return ratingDiff;
      if (!performerStats.has(a.id)) {
        performerStats.set(a.id, parsePerformerEloData(a));
      }
      if (!performerStats.has(b.id)) {
        performerStats.set(b.id, parsePerformerEloData(b));
      }
      const statsA = performerStats.get(a.id);
      const statsB = performerStats.get(b.id);
      const matchCountDiff = (statsB.total_matches || 0) - (statsA.total_matches || 0);
      if (matchCountDiff !== 0)
        return matchCountDiff;
      if (a.name && b.name) {
        return a.name.localeCompare(b.name);
      }
      const nameA = a.name || "";
      const nameB = b.name || "";
      return nameA.localeCompare(nameB);
    });
  }
  async function fetchAllPerformersSorted(sortBy = "rating", direction = "DESC") {
    const queryTemplate = `
    query FindAllPerformers($filter: FindFilterType) {
      findPerformers(filter: $filter) {
        performers { ${FRAGMENTS.PERFORMER} }
      }
    }
  `;
    const performers = await fetchAllItems2(queryTemplate, {
      filter: { sort: sortBy, direction }
    });
    return sortPerformersByRating(performers);
  }
  async function fetchAllPerformerStats() {
    return await fetchAllPerformersSorted();
  }
  async function fetchGlobalPerformerRatings() {
    const queryTemplate = `
    query FindAllPerformers($filter: FindFilterType) {
      findPerformers(filter: $filter) {
        performers { id rating100 custom_fields }
      }
    }
  `;
    const performers = await fetchAllItems2(queryTemplate, {
      filter: { sort: "rating", direction: "DESC" }
    });
    return performers.map((p) => {
      let total_matches = 0;
      let wins = 0;
      let win_margin = 0;
      const statsJson = p.custom_fields?.["hotornot_stats"];
      if (statsJson) {
        try {
          const stats = typeof statsJson === "string" ? JSON.parse(statsJson) : statsJson;
          total_matches = stats?.total_matches ?? 0;
          wins = stats?.wins ?? 0;
          win_margin = stats?.win_margin ?? 0;
        } catch (e) {
        }
      }
      return {
        id: p.id,
        rating100: p.rating100 ?? 1,
        total_matches,
        wins,
        win_margin
      };
    });
  }
  async function getAllPerformersSorted() {
    return await fetchAllPerformersSorted();
  }
  async function fetchRandomPerformers(count = 2) {
    if (state.selectedGenders.length === 0) {
      throw new Error("No genders selected.");
    }
    const battleGender = state.selectedGenders[Math.floor(Math.random() * state.selectedGenders.length)];
    const performerFilter = getPerformerFilter(state.cachedUrlFilter, [battleGender]);
    const totalPerformers = await fetchPerformerCount(performerFilter);
    if (totalPerformers < 2) {
      throw new Error("Not enough performers matching the selected gender.");
    }
    const performerQuery = `
    query FindRandomPerformers($performer_filter: PerformerFilterType, $filter: FindFilterType) {
      findPerformers(performer_filter: $performer_filter, filter: $filter) {
        performers {
          ${FRAGMENTS.PERFORMER}
        }
      }
    }
  `;
    const result = await graphqlQuery(performerQuery, {
      performer_filter: performerFilter,
      filter: {
        per_page: Math.min(100, totalPerformers),
        sort: "random"
      }
    });
    const allPerformers = result?.findPerformers?.performers || [];
    if (allPerformers.length < 2) {
      throw new Error("Not enough performers for comparison.");
    }
    const shuffled = [...allPerformers].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 2);
  }
  async function fetchPerformerById(id) {
    const result = await graphqlQuery(`query($id: ID!) { findPerformer(id: $id) { ${PERFORMER_FRAGMENT} } }`, { id });
    return result.findPerformer;
  }
  async function fetchPerformerCount(filter = {}) {
    const result = await graphqlQuery(`query($f: PerformerFilterType) { findPerformers(performer_filter: $f, filter: { per_page: 0 }) { count } }`, { f: filter });
    return result.findPerformers.count;
  }
  async function fetchRandomImages(count = 2) {
    const totalImages = await fetchImageCount();
    if (totalImages < 2) {
      throw new Error("Not enough images for comparison. You need at least 2 images.");
    }
    const imagesQuery = `
    query FindRandomImages($filter: FindFilterType) {
      findImages(filter: $filter) {
        images {
          ${IMAGE_FRAGMENT}
        }
      }
    }
  `;
    const result = await graphqlQuery(imagesQuery, {
      filter: {
        per_page: Math.min(100, totalImages),
        sort: "random"
      }
    });
    const allImages = result.findImages.images || [];
    if (allImages.length < 2) {
      throw new Error("Not enough images returned from query.");
    }
    const shuffled = allImages.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }
  function isSTierPerformer(performerObj) {
    return state.battleType === "performers" && performerObj && state.globalPerformerPool && state.globalPerformerPool.length > 0 && getRatingTier(performerObj, state.globalPerformerPool) === "S-Tier";
  }
  function formatResultStatus(won, change) {
    if (won === null || won === void 0)
      return "UPDATE";
    const pointChange = change !== null && !isNaN(change) ? (change / 10).toFixed(1) : "?";
    const signed = change > 0 ? `+${pointChange}` : pointChange;
    return won ? `WIN(${signed})` : `LOSS(${signed})`;
  }
  function getRecordKeyForBattleType(battleType) {
    if (battleType === "performers")
      return "performer_record";
    if (battleType === "scenes")
      return "scene_record";
    return null;
  }
  function normalizeSceneRecordEntry(entry) {
    if (!entry || typeof entry !== "object")
      return null;
    const normalized = {
      date: entry.date || (/* @__PURE__ */ new Date()).toISOString(),
      won: entry.won,
      ratingAfter: entry.ratingAfter
    };
    if (entry.opponentId) {
      normalized.opponentId = entry.opponentId.toString().replace(/\D/g, "") || "0";
    } else if (entry.opponent && typeof entry.opponent === "string") {
      normalized.opponentId = entry.opponent.split(":")[0] || "0";
    } else {
      normalized.opponentId = "0";
    }
    return normalized;
  }
  function getOldStatsSnapshot(itemObj, battleType) {
    const recordKey = getRecordKeyForBattleType(battleType);
    const stats = parsePerformerEloData(itemObj) || {};
    if (!recordKey)
      return stats;
    let recordArray = [];
    const rawRecord = itemObj?.custom_fields?.[recordKey];
    if (rawRecord) {
      try {
        recordArray = typeof rawRecord === "string" ? JSON.parse(rawRecord) : rawRecord;
        if (!Array.isArray(recordArray))
          recordArray = [];
      } catch (e) {
        console.warn(`[Ascension] Failed to parse ${recordKey} for snapshot, starting fresh.`);
        recordArray = [];
      }
    }
    if (battleType === "scenes") {
      recordArray = recordArray.map(normalizeSceneRecordEntry).filter(Boolean);
    }
    return {
      ...stats,
      [recordKey]: recordArray
    };
  }
  async function handleComparison(winnerId, loserId, winnerCurrentRating, loserCurrentRating, loserRank = null, winnerObj = null, loserObj = null, isDraw = false) {
    const startTime = performance.now();
    console.log(`[Ascension Timing] handleComparison started for Winner ID: ${winnerId}, Loser ID: ${loserId}`);
    let winnerRating = winnerCurrentRating || 1;
    let loserRating = loserCurrentRating || 1;
    let freshWinnerObj = null;
    let freshLoserObj = null;
    if (state.currentMode === "gauntlet" || state.currentMode === "champion") {
      console.log(`[Ascension] ${state.currentMode} mode detected - fetching fresh performer data from DB`);
      try {
        [freshWinnerObj, freshLoserObj] = await Promise.all([
          fetchPerformerById(winnerId),
          fetchPerformerById(loserId)
        ]);
        console.log(`[Ascension] Fresh data fetched. Winner record has ${freshWinnerObj.custom_fields?.performer_record?.length || 0} matches, Loser has ${freshLoserObj.custom_fields?.performer_record?.length || 0} matches`);
        if (freshWinnerObj && freshWinnerObj.rating100 > 0) {
          winnerRating = freshWinnerObj.rating100;
        }
        if (freshLoserObj && freshLoserObj.rating100 > 0) {
          loserRating = freshLoserObj.rating100;
        }
      } catch (fetchError) {
        console.error(`[Ascension] Failed to fetch fresh data, falling back to provided objects:`, fetchError);
        freshWinnerObj = winnerObj;
        freshLoserObj = loserObj;
      }
    } else {
      try {
        const isWinnerValid = winnerObj && typeof winnerObj === "object" && winnerObj.id != void 0 && winnerObj.id == winnerId && winnerObj.custom_fields !== void 0;
        const isLoserValid = loserObj && typeof loserObj === "object" && loserObj.id != void 0 && loserObj.id == loserId && loserObj.custom_fields !== void 0;
        if (isWinnerValid && isLoserValid) {
          freshWinnerObj = winnerObj;
          freshLoserObj = loserObj;
        } else {
          throw new Error(`Provided objects failed validation`);
        }
      } catch (useProvidedError) {
        console.log(`[Ascension] Falling back to fetching fresh scene data:`, useProvidedError.message);
        [freshWinnerObj, freshLoserObj] = await Promise.all([
          fetchSceneById(winnerId),
          fetchSceneById(loserId)
        ]);
      }
    }
    let winnerMatchCount = 0;
    let loserMatchCount = 0;
    let winnerStats = {};
    let loserStats = {};
    winnerStats = parsePerformerEloData(freshWinnerObj) || {};
    loserStats = parsePerformerEloData(freshLoserObj) || {};
    winnerMatchCount = winnerStats.total_matches || 0;
    loserMatchCount = loserStats.total_matches || 0;
    const isPerformerBattle = state.battleType === "performers";
    const globalPool = state.globalPerformerPool || [];
    let winnerTier = null;
    let loserTier = null;
    let winnerEffectiveRating = null;
    let loserEffectiveRating = null;
    if (isPerformerBattle && globalPool.length > 0) {
      if (freshWinnerObj) {
        winnerTier = getRatingTier(freshWinnerObj, globalPool);
        winnerEffectiveRating = calculateEffectiveEloRating(freshWinnerObj, globalPool);
      }
      if (freshLoserObj) {
        loserTier = getRatingTier(freshLoserObj, globalPool);
        loserEffectiveRating = calculateEffectiveEloRating(freshLoserObj, globalPool);
      }
      if (winnerEffectiveRating !== null && loserEffectiveRating !== null) {
        console.log(`[Ascension] Effective ratings - Winner: ${winnerEffectiveRating.toFixed(1)} (${winnerTier}), Loser: ${loserEffectiveRating.toFixed(1)} (${loserTier})`);
      }
    }
    let winnerGain = 0;
    let loserLoss = 0;
    if (isDraw) {
      const ratingDiff2 = (loserEffectiveRating ?? loserRating) - (winnerEffectiveRating ?? winnerRating);
      const expectedWinner = 1 / (1 + Math.pow(10, ratingDiff2 / 400));
      const winnerK = getProgressiveKFactor(winnerRating, null, winnerMatchCount, "swiss");
      const loserK = getProgressiveKFactor(loserRating, null, loserMatchCount, "swiss");
      winnerGain = Math.round(winnerK * (0.5 - expectedWinner));
      loserLoss = Math.round(loserK * (1 - expectedWinner - 0.5));
    } else {
      const isChampionWinner = !!state.gauntletChampion && winnerId === state.gauntletChampion.id;
      const isFallingWinner = state.gauntletFalling && !!state.gauntletFallingItem && winnerId === state.gauntletFallingItem.id;
      const isChampionLoser = !!state.gauntletChampion && loserId === state.gauntletChampion.id;
      const isFallingLoser = state.gauntletFalling && !!state.gauntletFallingItem && loserId === state.gauntletFallingItem.id;
      ({ winnerGain, loserLoss } = calculateMatchOutcome({
        winnerRating,
        loserRating,
        winnerEffectiveRating,
        loserEffectiveRating,
        winnerTier,
        loserTier,
        mode: state.currentMode,
        winnerMatchCount,
        loserMatchCount,
        isChampionWinner,
        isFallingWinner,
        isChampionLoser,
        isFallingLoser,
        loserRank,
        winnerStats,
        loserStats,
        isSpecialChallenge: state.currentPair?.isSpecialChallenge || false,
        specialChallengeRules: state.currentPair?.specialChallengeRules || null
      }));
    }
    const newWinnerRating = Math.min(100, Math.max(1, winnerRating + winnerGain));
    const newLoserRating = Math.min(100, Math.max(1, loserRating - loserLoss));
    const shouldTrackWinner = state.battleType === "performers" || state.battleType === "scenes";
    const shouldTrackLoser = state.battleType === "performers" || state.battleType === "scenes";
    const winnerStatus = isDraw ? null : true;
    const loserStatus = isDraw ? null : false;
    const winnerOldStats = shouldTrackWinner ? getOldStatsSnapshot(freshWinnerObj, state.battleType) : null;
    const loserOldStats = shouldTrackLoser ? getOldStatsSnapshot(freshLoserObj, state.battleType) : null;
    if (!state.matchHistory)
      state.matchHistory = [];
    state.matchHistory.push({
      winnerId,
      loserId,
      winnerOldRating: winnerRating,
      loserOldRating: loserRating,
      winnerOldStats,
      loserOldStats,
      pairSnapshot: {
        left: state.currentPair.left ? { ...state.currentPair.left } : null,
        right: state.currentPair.right ? { ...state.currentPair.right } : null,
        rankLeft: state.currentRanks.left,
        rankRight: state.currentRanks.right
      },
      gauntletSnapshot: {
        gauntletChampion: state.gauntletChampion ? { ...state.gauntletChampion } : null,
        gauntletWins: state.gauntletWins,
        gauntletDefeated: [...state.gauntletDefeated || []],
        gauntletFalling: state.gauntletFalling,
        gauntletFallingItem: state.gauntletFallingItem ? { ...state.gauntletFallingItem } : null
      }
    });
    if (state.matchHistory.length > 10)
      state.matchHistory.shift();
    if (!winnerId || !loserId) {
      console.error("[Ascension] Cannot update rating: One or both IDs are missing", { winnerId, loserId });
      return { newWinnerRating, newLoserRating, winnerChange: winnerGain, loserChange: -loserLoss };
    }
    const updateStartTime = performance.now();
    try {
      const [winnerUpdateResult, loserUpdateResult] = await Promise.all([
        updateItemRating(
          winnerId,
          newWinnerRating,
          freshWinnerObj,
          winnerStatus,
          loserId,
          winnerGain
        ).catch((err) => {
          console.error(`[Ascension] Error updating winner (${winnerId}):`, err);
          throw new Error(`Failed to update winner: ${err.message}`);
        }),
        updateItemRating(
          loserId,
          newLoserRating,
          freshLoserObj,
          loserStatus,
          winnerId,
          -loserLoss
        ).catch((err) => {
          console.error(`[Ascension] Error updating loser (${loserId}):`, err);
          throw new Error(`Failed to update loser: ${err.message}`);
        })
      ]);
      const updateEndTime = performance.now();
      console.log(`[Ascension Timing] Parallel updates completed in ${(updateEndTime - updateStartTime).toFixed(2)} ms.`);
    } catch (updateError) {
      const updateEndTime = performance.now();
      console.error(`[Ascension Timing] One or both updates failed after ${(updateEndTime - updateStartTime).toFixed(2)} ms:`, updateError);
      throw updateError;
    }
    const endTime = performance.now();
    console.log(`[Ascension Timing] handleComparison completed in ${(endTime - startTime).toFixed(2)} ms.`);
    return {
      newWinnerRating,
      newLoserRating,
      winnerChange: winnerGain,
      loserChange: -loserLoss
    };
  }
  async function updateItemRating(itemId, newRating, itemObj = null, won = null, opponentId = null, change = null) {
    if (state.battleType === "performers") {
      return await updatePerformerRating(itemId, newRating, itemObj, won, opponentId, change);
    } else if (state.battleType === "images") {
      return await updateImageRating(itemId, newRating);
    } else if (state.battleType === "scenes") {
      return await updateSceneRating(itemId, newRating, itemObj, won, opponentId, change);
    } else {
      console.warn(`[Ascension] Unknown battle type: ${state.battleType}`);
      return null;
    }
  }
  async function fetchImageCount() {
    const countQuery = `
      query FindImages {
        findImages(filter: { per_page: 0 }) {
          count
        }
      }
    `;
    const countResult = await graphqlQuery(countQuery);
    return countResult.findImages.count;
  }
  async function updateSceneRating(id, rating, sceneObj = null, won = null, opponentId = null, change = null) {
    if (!id) {
      console.error("[Ascension] Cannot update scene: ID is missing");
      return;
    }
    let sceneTitle = "Unknown Scene";
    if (sceneObj?.title && sceneObj.title.trim() !== "") {
      sceneTitle = sceneObj.title;
    } else if (state.currentPair) {
      if (state.currentPair.left?.id == id) {
        sceneTitle = state.currentPair.left.title || extractTitleFromFile(state.currentPair.left);
      } else if (state.currentPair.right?.id == id) {
        sceneTitle = state.currentPair.right.title || extractTitleFromFile(state.currentPair.right);
      }
    } else if (sceneObj) {
      sceneTitle = extractTitleFromFile(sceneObj);
    }
    let cleanRating = Math.round(Number(rating));
    if (isNaN(cleanRating)) {
      console.warn(`[Ascension] Invalid rating for scene ${id}, falling back to existing data.`);
      cleanRating = sceneObj?.rating100 || 1;
    }
    if (change === null && sceneObj && !isNaN(sceneObj.rating100)) {
      change = cleanRating - Math.round(Number(sceneObj.rating100));
    }
    const statusText = formatResultStatus(won, change);
    const statusColor = won === true ? "#4CAF50" : won === false ? "#F44336" : "#9E9E9E";
    const displayRating = (cleanRating / 10).toFixed(1);
    console.log(
      `%c[Ascension] %cUpdating: %c${sceneTitle || "???"} %c(ID: ${id})%c, %cNew Rating: %c${displayRating}%c, %cResult: %c${statusText}`,
      "color: #1cb4d6; font-weight: bold;",
      "color: #1cb4d6;",
      "color: #1cb4d6; font-weight: bold;",
      "color: #1cb4d6;",
      "color: #888;",
      "color: #FF69B4;",
      "color: #FF69B4; font-weight: bold;",
      "color: #888;",
      "color: #1cb4d6;",
      `color: ${statusColor}; font-weight: bold;`
    );
    const variables = {
      id: id.toString(),
      rating: cleanRating,
      fields: {}
    };
    if (sceneObj) {
      try {
        const currentStats = parsePerformerEloData(sceneObj);
        const updatedStats = updatePerformerStats(currentStats, won, change);
        if (updatedStats) {
          const statsToStore = { ...updatedStats };
          delete statsToStore.performer_record;
          variables.fields.hotornot_stats = JSON.stringify(statsToStore);
        }
      } catch (e) {
        console.error(`[Ascension] Stats update failed for scene ${id}:`, e);
      }
      let matchHistory = [];
      try {
        const rawRecord = sceneObj.custom_fields?.scene_record;
        if (rawRecord) {
          matchHistory = typeof rawRecord === "string" ? JSON.parse(rawRecord) : rawRecord;
          if (!Array.isArray(matchHistory))
            matchHistory = [];
        }
      } catch (e) {
        console.warn(`[Ascension] Failed to parse scene_record for ${id}, resetting history.`);
        matchHistory = [];
      }
      matchHistory = matchHistory.map(normalizeSceneRecordEntry).filter(Boolean);
      let opponentIdValue = "0";
      if (opponentId) {
        if (typeof opponentId === "string" && opponentId.includes(":")) {
          opponentIdValue = opponentId.split(":")[0];
        } else {
          opponentIdValue = (typeof opponentId === "object" ? opponentId.id : opponentId).toString().replace(/\D/g, "");
        }
      }
      matchHistory.push({
        date: (/* @__PURE__ */ new Date()).toISOString(),
        opponentId: opponentIdValue,
        won,
        ratingAfter: cleanRating
      });
      if (matchHistory.length > 30)
        matchHistory = matchHistory.slice(-30);
      variables.fields.scene_record = JSON.stringify(matchHistory);
    }
    variables.fields = variables.fields || {};
    try {
      return await graphqlQuery(`
      mutation($id: ID!, $rating: Int!, $fields: Map) {
        sceneUpdate(input: {
          id: $id,
          rating100: $rating,
          custom_fields: { partial: $fields }
        }) {
          id
        }
      }`, variables);
    } catch (err) {
      console.error(`[Ascension] GraphQL Update Failed for scene ${id}:`, err);
      throw err;
    }
  }
  function extractTitleFromFile(sceneObj) {
    if (!sceneObj || !sceneObj.files || sceneObj.files.length === 0) {
      return "Unknown Scene";
    }
    const file = sceneObj.files[0];
    if (!file.path) {
      return "Unknown Scene";
    }
    let title = file.path.split(/[\/\\]/).pop();
    if (title.includes(".")) {
      title = title.substring(0, title.lastIndexOf("."));
    }
    return title || "Unknown Scene";
  }
  async function fetchSceneById(id) {
    const SCENE_COMPLETE_FRAGMENT = `
    id
    title
    rating100
    custom_fields
    files {
      path
    }
  `;
    const query = `query FindSceneComplete($id: ID!) { findScene(id: $id) { ${SCENE_COMPLETE_FRAGMENT} } }`;
    try {
      const result = await graphqlQuery(query, { id });
      return result.findScene;
    } catch (error) {
      console.error(`[Ascension] Failed to fetch complete scene data for ID ${id}:`, error);
      throw error;
    }
  }
  async function updateImageRating(id, rating) {
    await graphqlQuery(`mutation($i: ImageUpdateInput!) { imageUpdate(input: $i) { id } }`, {
      i: { id, rating100: Math.max(1, Math.min(100, rating)) }
    });
  }
  async function updatePerformerRating(id, rating, performerObj = null, won = null, opponentId = null, change = null) {
    if (!id) {
      console.error("[Ascension] Cannot update performer: ID is missing");
      return;
    }
    let performerName = "Unknown";
    if (performerObj?.name) {
      performerName = performerObj.name;
    } else if (state.currentPair) {
      if (state.currentPair.left?.id == id)
        performerName = state.currentPair.left.name;
      else if (state.currentPair.right?.id == id)
        performerName = state.currentPair.right.name;
    }
    let cleanRating = Math.round(Number(rating));
    if (isNaN(cleanRating)) {
      console.warn(`[Ascension] Invalid rating for ${id}, falling back to existing data.`);
      cleanRating = performerObj?.rating100 || 1;
    }
    if (change === null && performerObj && !isNaN(performerObj.rating100)) {
      change = cleanRating - Math.round(Number(performerObj.rating100));
    }
    const isSTier = isSTierPerformer(performerObj);
    const battleScore = isSTier ? calculateBattleScore(performerObj) : null;
    const statusText = formatResultStatus(won, change);
    const statusColor = won === true ? "#4CAF50" : won === false ? "#F44336" : "#9E9E9E";
    const displayRating = (cleanRating / 10).toFixed(1);
    if (isSTier && typeof battleScore === "number" && !isNaN(battleScore)) {
      const battleScoreStr = battleScore.toFixed(1);
      console.log(
        `%c[Ascension] %cUpdating: %c${performerName || "???"} %c(ID: ${id})%c, %cNew Rating: %c${displayRating}%c (Ascended: %c${battleScoreStr}%c), %cResult: %c${statusText}`,
        "color: #1cb4d6; font-weight: bold;",
        "color: #1cb4d6;",
        "color: #1cb4d6; font-weight: bold;",
        "color: #1cb4d6;",
        "color: #888;",
        "color: #FF69B4;",
        "color: #FF69B4; font-weight: bold;",
        "color: #888;",
        "color: #eb9834; font-weight: bold;",
        "color: #888;",
        "color: #1cb4d6;",
        `color: ${statusColor}; font-weight: bold;`
      );
    } else {
      console.log(
        `%c[Ascension] %cUpdating: %c${performerName || "???"} %c(ID: ${id})%c, %cNew Rating: %c${displayRating}%c, %cResult: %c${statusText}`,
        "color: #1cb4d6; font-weight: bold;",
        "color: #1cb4d6;",
        "color: #1cb4d6; font-weight: bold;",
        "color: #1cb4d6;",
        "color: #888;",
        "color: #FF69B4;",
        "color: #FF69B4; font-weight: bold;",
        "color: #888;",
        "color: #1cb4d6;",
        `color: ${statusColor}; font-weight: bold;`
      );
    }
    const variables = {
      id: id.toString(),
      rating: cleanRating,
      fields: {}
    };
    if (performerObj) {
      try {
        const currentStats = parsePerformerEloData(performerObj);
        const updatedStats = updatePerformerStats(currentStats, won, change);
        if (updatedStats) {
          const statsToStore = { ...updatedStats };
          delete statsToStore.performer_record;
          variables.fields.hotornot_stats = JSON.stringify(statsToStore);
        }
      } catch (e) {
        console.error(`[Ascension] Stats update failed for ${id}:`, e);
      }
      let matchHistory = [];
      try {
        const rawRecord = performerObj.custom_fields?.performer_record;
        if (rawRecord) {
          matchHistory = typeof rawRecord === "string" ? JSON.parse(rawRecord) : rawRecord;
        }
      } catch (e) {
        console.warn(`[Ascension] Failed to parse performer_record for ${id}, resetting history.`);
        matchHistory = [];
      }
      let opponentData = "0:Unknown";
      if (opponentId) {
        if (typeof opponentId === "string" && opponentId.includes(":")) {
          opponentData = opponentId;
        } else {
          const oppId = (typeof opponentId === "object" ? opponentId.id : opponentId).toString().replace(/\D/g, "");
          let oppName = "Unknown";
          if (opponentId.name) {
            oppName = opponentId.name;
          } else if (state.currentPair) {
            if (state.currentPair.left?.id == oppId)
              oppName = state.currentPair.left.name;
            else if (state.currentPair.right?.id == oppId)
              oppName = state.currentPair.right.name;
          }
          opponentData = `${oppId}:${oppName || "Unknown"}`;
        }
      }
      matchHistory.push({
        date: (/* @__PURE__ */ new Date()).toISOString(),
        opponent: opponentData,
        won,
        ratingAfter: cleanRating
      });
      if (matchHistory.length > 30)
        matchHistory = matchHistory.slice(-30);
      variables.fields.performer_record = JSON.stringify(matchHistory);
    }
    variables.fields = variables.fields || {};
    try {
      return await graphqlQuery(`
      mutation($id: ID!, $rating: Int!, $fields: Map) {
        performerUpdate(input: {
          id: $id,
          rating100: $rating,
          custom_fields: { partial: $fields }
        }) {
          id
        }
      }`, {
        id: id.toString(),
        rating: cleanRating,
        fields: variables.fields
      });
    } catch (err) {
      console.error(`[Ascension] GraphQL Update Failed for ${id}:`, err);
      throw err;
    }
  }
  async function undoLastMatch() {
    if (!state.matchHistory || state.matchHistory.length === 0) {
      console.log("[Ascension] No match history to undo");
      return null;
    }
    const last = state.matchHistory.pop();
    console.log("[Ascension] Undoing match:", last);
    try {
      await Promise.all([
        updateItemRatingDirect(last.winnerId, last.winnerOldRating, last.winnerOldStats),
        updateItemRatingDirect(last.loserId, last.loserOldRating, last.loserOldStats)
      ]);
      console.log("[Ascension] Successfully restored ratings and records");
    } catch (error) {
      state.matchHistory.push(last);
      console.error("[Ascension] Failed to restore ratings:", error);
      throw new Error(`Failed to undo match: ${error.message}`);
    }
    if (last.gauntletSnapshot) {
      const snap = last.gauntletSnapshot;
      state.gauntletChampion = snap.gauntletChampion;
      state.gauntletWins = snap.gauntletWins;
      state.gauntletDefeated = [...snap.gauntletDefeated];
      state.gauntletFalling = snap.gauntletFalling;
      state.gauntletFallingItem = snap.gauntletFallingItem ? { ...snap.gauntletFallingItem } : null;
      console.log("[Ascension] Restored gauntlet state");
    }
    let restoredPairSnapshot = null;
    if (last.pairSnapshot) {
      const { left, right } = last.pairSnapshot;
      state.currentPair = { left, right };
      state.currentRanks = { left: last.pairSnapshot.rankLeft, right: last.pairSnapshot.rankRight };
      restoredPairSnapshot = last.pairSnapshot;
      console.log("[Ascension] Restored pair snapshot");
    }
    return restoredPairSnapshot || null;
  }
  async function updateItemRatingDirect(itemId, rating, statsObj) {
    const recordKey = getRecordKeyForBattleType(state.battleType);
    if (state.battleType === "performers" || state.battleType === "scenes") {
      const fields = {};
      if (statsObj) {
        const statsToRestore = { ...statsObj };
        if (recordKey)
          delete statsToRestore[recordKey];
        fields.hotornot_stats = JSON.stringify(statsToRestore);
        if (recordKey && recordKey in statsObj) {
          const recordData = statsObj[recordKey];
          console.log(`[Ascension] Restoring ${recordKey} for ${itemId}:`, recordData);
          if (recordData !== void 0 && recordData !== null) {
            fields[recordKey] = Array.isArray(recordData) ? JSON.stringify(recordData) : recordData;
          } else {
            fields[recordKey] = "[]";
          }
        }
      }
      const mutationName = state.battleType === "performers" ? "performerUpdate" : "sceneUpdate";
      console.log(`[Ascension] Restoring ${state.battleType} ${itemId} with fields:`, fields);
      await graphqlQuery(`
      mutation($id: ID!, $rating: Int!, $fields: Map) {
        ${mutationName}(input: {
          id: $id,
          rating100: $rating,
          custom_fields: { partial: $fields }
        }) {
          id
        }
      }`, {
        id: itemId,
        rating: Math.round(rating),
        fields
      });
    } else if (state.battleType === "images") {
      await updateImageRating(itemId, rating);
    } else {
      console.warn(`[Ascension] Unknown battle type for direct update: ${state.battleType}`);
    }
  }
  async function getHotOrNotConfig() {
    if (pluginConfigCache)
      return pluginConfigCache;
    const result = await graphqlQuery(`query { configuration { plugins } }`);
    pluginConfigCache = (result.configuration.plugins || {})["HotOrNot"] || {};
    return pluginConfigCache;
  }
  async function isBattleRankBadgeEnabled() {
    const config = await getHotOrNotConfig();
    return config.showBattleRankBadge !== false;
  }
  var FRAGMENTS, PERFORMER_FRAGMENT, IMAGE_FRAGMENT, SCENE_FRAGMENT, pluginConfigCache;
  var init_api_client = __esm({
    "api-client.js"() {
      init_rating_utils();
      init_parsers();
      init_math_utils();
      init_state();
      FRAGMENTS = {
        PERFORMER: `id name image_path rating100 details custom_fields birthdate ethnicity country gender height_cm measurements fake_tits scene_count image_count gallery_count tags { name }`,
        IMAGE: `id rating100 paths { thumbnail image }`,
        SCENE: `id title date rating100 organized details director files { duration path } paths { screenshot preview } performers { id name image_path rating100 } studio { id name } tags { id name } play_count last_played_at play_duration o_counter custom_fields`
      };
      PERFORMER_FRAGMENT = FRAGMENTS.PERFORMER;
      IMAGE_FRAGMENT = FRAGMENTS.IMAGE;
      SCENE_FRAGMENT = FRAGMENTS.SCENE;
      pluginConfigCache = null;
    }
  });

  // ui-badge.js
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }
  async function readCache(key) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn("[Ascension] IndexedDB read failed:", err);
      return null;
    }
  }
  async function writeCache(key, value) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn("[Ascension] IndexedDB write failed:", err);
    }
  }
  async function initCacheFromDB() {
    if (allPerformersCache)
      return;
    if (isCacheInitializing) {
      while (isCacheInitializing) {
        await new Promise((r) => setTimeout(r, 10));
      }
      return;
    }
    isCacheInitializing = true;
    try {
      if (state.globalPerformerPool && state.globalPerformerPool.length > 0) {
        allPerformersCache = state.globalPerformerPool;
        rankCache = calculateAllPerformerRanks(allPerformersCache);
        return;
      }
      const cached = await readCache("allPerformers");
      const cachedRanks = await readCache("rankMap");
      if (cached && Array.isArray(cached) && cached.length > 0) {
        allPerformersCache = cached;
        rankCache = cachedRanks || calculateAllPerformerRanks(cached);
      }
    } finally {
      isCacheInitializing = false;
    }
  }
  async function getPluginSettings() {
    try {
      const response = await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `{
          configuration {
            plugins
          }
        }`
        })
      });
      const result = await response.json();
      const pluginSettings = result.data.configuration.plugins.ascension;
      return pluginSettings?.HideAscRankBadge === true;
    } catch (e) {
      console.error("Ascension: Could not fetch config", e);
      return false;
    }
  }
  function cleanup() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (attachedListeners.has("navigation")) {
      window.removeEventListener("popstate", handleNavigation);
      if (pushStateOriginal) {
        history.pushState = pushStateOriginal;
      }
      attachedListeners.delete("navigation");
    }
    allPerformersCache = null;
    rankCache = null;
    performerQueue = [];
    isFetchingAllPerformers = false;
    isCacheInitializing = false;
    window._honBadgeInjectionInProgress = false;
    cleanupFunctions.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.warn("Cleanup function error:", e);
      }
    });
    cleanupFunctions = [];
    document.querySelectorAll(".hon-rating-overlay").forEach((el) => el.remove());
    document.querySelectorAll(".hon-tier-change-notification").forEach((el) => el.remove());
  }
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  function isOnPerformerListPage() {
    return window.location.pathname === "/performers" || window.location.pathname.startsWith("/performers?");
  }
  function isOnScenePage() {
    return window.location.pathname.includes("/scenes/");
  }
  function isOnSinglePerformerPage() {
    return window.location.pathname.includes("/performers/") && !window.location.pathname.endsWith("/performers");
  }
  function createBattleRankBadge(rank, total, rating, stats = null, isCompact = false, tier = null, battleScore = null) {
    if (HIDE_ASC_RANK_BADGE)
      return null;
    const badge = document.createElement("div");
    badge.className = isCompact ? "hon-battle-rank-badge hon-battle-rank-badge-compact" : "hon-battle-rank-badge";
    badge.id = "hon-battle-rank-badge";
    let tierName = tier;
    if (!tierName) {
      if (rating >= 85)
        tierName = "S-Tier";
      else if (rating >= 70)
        tierName = "A-Tier";
      else if (rating >= 55)
        tierName = "B-Tier";
      else if (rating >= 40)
        tierName = "C-Tier";
      else if (rating >= 25)
        tierName = "D-Tier";
      else
        tierName = "F-Tier";
    }
    const tierColor = getTierColor(tierName);
    let ascScoreHTML = "";
    if (battleScore !== null && !isNaN(battleScore)) {
      ascScoreHTML = `
      <span class="hon-asc-score-display" style="display: inline-flex !important; align-items: center !important; gap: 4px !important; color: ${tierColor} !important; font-weight: bold !important;">
        ${ASCENSION_FLAME_SVG}
        <span class="hon-asc-score-value" style="color: ${tierColor} !important;">${battleScore.toFixed(2)}</span>
      </span>
      <span class="hon-asc-separator" style="margin: 0 6px; opacity: 0.6;">|</span>
    `;
    }
    let matchStatsHTML = "";
    let winRate = "0.0";
    const hasMatchStats = stats && stats.total_matches > 0;
    if (hasMatchStats) {
      winRate = (stats.wins / (stats.total_matches || 1) * 100).toFixed(1);
      let streakDisplay = "";
      if (stats.current_streak > 0) {
        streakDisplay = `<span class="hon-streak-positive">+${stats.current_streak}</span>`;
      } else if (stats.current_streak < 0) {
        streakDisplay = `<span class="hon-streak-negative">-${Math.abs(stats.current_streak)}</span>`;
      }
      matchStatsHTML = `
      <span class="hon-match-stats">
        <span class="hon-stats-record">
          <span class="hon-wins">${stats.wins}W</span>
          <span class="hon-losses">${stats.losses}L</span>
          <span class="hon-draws">${stats.draws}D</span>
        </span>
        <span class="hon-win-rate">${winRate}%</span>
        ${streakDisplay}
      </span>
    `;
    }
    const rankText = isCompact ? `<span class="hon-rank-text" style="color: ${tierColor}">Rank #${rank}</span>` : `<span class="hon-rank-text" style="color: ${tierColor}">Rank #${rank}</span>
       <span class="hon-rank-total">of ${total}</span>`;
    badge.innerHTML = `
    ${ascScoreHTML}
    ${rankText}
    ${matchStatsHTML}
  `;
    let tooltipText = `Battle Rank #${rank} of ${total} performers`;
    if (battleScore !== null && !isNaN(battleScore)) {
      tooltipText += ` (Ascended Score: ${battleScore.toFixed(2)})`;
    }
    tooltipText += ` (Rating: ${rating}/100)`;
    if (hasMatchStats) {
      tooltipText += `

Match Stats:`;
      tooltipText += `
\u2022 Record: ${stats.wins}W - ${stats.losses}L - ${stats.draws}D`;
      tooltipText += `
\u2022 Win Rate: ${winRate}%`;
      tooltipText += `
\u2022 Total Matches: ${stats.total_matches}`;
      if (stats.current_streak !== 0) {
        const streakType = stats.current_streak > 0 ? "+" : "-";
        tooltipText += `
\u2022 Current Streak: ${streakType} ${Math.abs(stats.current_streak)}`;
      }
      if (stats.best_streak > 0)
        tooltipText += `
\u2022 Best Streak: ${stats.best_streak}`;
      if (stats.worst_streak < 0)
        tooltipText += `
\u2022 Worst Streak: ${Math.abs(stats.worst_streak)}`;
    }
    badge.title = tooltipText;
    return badge;
  }
  async function injectBattleRankBadgeInner() {
    if (HIDE_ASC_RANK_BADGE)
      return;
    const pathParts = window.location.pathname.split("/");
    const pIndex = pathParts.indexOf("performers");
    if (pIndex === -1 || !pathParts[pIndex + 1])
      return;
    const performerId = pathParts[pIndex + 1];
    if (window._honBadgeInjectionInProgress)
      return;
    window._honBadgeInjectionInProgress = true;
    try {
      const ratingEl = document.querySelector(".quality-group");
      if (!ratingEl || document.getElementById("hon-battle-rank-badge"))
        return;
      await initCacheFromDB();
      if (!allPerformersCache) {
        allPerformersCache = await getAllPerformersSorted();
        rankCache = calculateAllPerformerRanks(allPerformersCache);
        await writeCache("allPerformers", allPerformersCache);
        await writeCache("rankMap", rankCache);
      }
      let rankInfo = rankCache ? rankCache.get(performerId) : null;
      if (!rankInfo) {
        rankInfo = await getPerformerGlobalRank(performerId, allPerformersCache);
      }
      if (rankInfo) {
        const performer = allPerformersCache.find((p) => String(p.id) === String(performerId));
        const tier = performer ? getRatingTier(performer, allPerformersCache) : null;
        const badge = createBattleRankBadge(
          rankInfo.rank,
          rankInfo.total,
          rankInfo.rating,
          rankInfo.stats,
          false,
          // Full badge on single performer page
          tier,
          rankInfo.battleScore
        );
        if (badge) {
          ratingEl.append(badge);
        }
      }
      if (!isFetchingAllPerformers) {
        isFetchingAllPerformers = true;
        getAllPerformersSorted().then(async (fresh) => {
          if (fresh && fresh.length > 0) {
            allPerformersCache = fresh;
            rankCache = calculateAllPerformerRanks(fresh);
            await writeCache("allPerformers", fresh);
            await writeCache("rankMap", rankCache);
          }
        }).catch((err) => console.warn("[Ascension] Background performer refresh failed:", err)).finally(() => {
          isFetchingAllPerformers = false;
        });
      }
    } catch (err) {
      console.error("[Ascension] Error injecting battle rank badge:", err);
    } finally {
      window._honBadgeInjectionInProgress = false;
    }
  }
  async function injectBattleRankBadge() {
    if (!isOnSinglePerformerPage())
      return;
    debouncedInjectBattleRankBadge();
  }
  async function processPerformerCard(card) {
    if (processedCards.has(card))
      return false;
    if (isOnScenePage())
      return false;
    const linkEl = card.querySelector("a[href^='/performers/']");
    if (!linkEl)
      return false;
    const performerId = linkEl.href.split("/").pop();
    if (!performerId)
      return false;
    const ratingBanner = card.querySelector(".rating-banner");
    if (!ratingBanner)
      return false;
    if (HIDE_ASC_RANK_BADGE) {
      ratingBanner.style.visibility = "";
      ratingBanner.style.height = "";
      ratingBanner.style.overflow = "";
      ratingBanner.style.padding = "";
      ratingBanner.style.margin = "";
      ratingBanner.style.border = "";
      return false;
    }
    try {
      ratingBanner.style.visibility = "hidden";
      ratingBanner.style.height = "0";
      ratingBanner.style.overflow = "hidden";
      ratingBanner.style.padding = "0";
      ratingBanner.style.margin = "0";
      ratingBanner.style.border = "0";
      await initCacheFromDB();
      if (!allPerformersCache && !isFetchingAllPerformers) {
        isFetchingAllPerformers = true;
        allPerformersCache = await getAllPerformersSorted();
        rankCache = calculateAllPerformerRanks(allPerformersCache);
        await writeCache("allPerformers", allPerformersCache);
        await writeCache("rankMap", rankCache);
        isFetchingAllPerformers = false;
        while (performerQueue.length > 0) {
          const queuedCard = performerQueue.shift();
          await processPerformerCard(queuedCard);
        }
      }
      if (!allPerformersCache) {
        performerQueue.push(card);
        return false;
      }
      let rankInfo = rankCache ? rankCache.get(performerId) : null;
      if (!rankInfo) {
        rankInfo = await getPerformerGlobalRank(performerId, allPerformersCache);
      }
      if (!rankInfo) {
        ratingBanner.style.visibility = "";
        ratingBanner.style.height = "";
        ratingBanner.style.overflow = "";
        ratingBanner.style.padding = "";
        ratingBanner.style.margin = "";
        ratingBanner.style.border = "";
        return false;
      }
      const performer = allPerformersCache.find((p) => String(p.id) === String(performerId));
      const tier = performer ? getRatingTier(performer, allPerformersCache) : null;
      const isCompact = isOnPerformerListPage();
      const badge = createBattleRankBadge(
        rankInfo.rank,
        rankInfo.total,
        rankInfo.rating,
        rankInfo.stats,
        isCompact,
        tier,
        rankInfo.battleScore
      );
      if (badge) {
        ratingBanner.replaceWith(badge);
        processedCards.add(card);
        return true;
      } else {
        ratingBanner.style.visibility = "";
        ratingBanner.style.height = "";
        ratingBanner.style.overflow = "";
        ratingBanner.style.padding = "";
        ratingBanner.style.margin = "";
        ratingBanner.style.border = "";
        return false;
      }
    } catch (error) {
      console.error(`Error processing performer ${performerId}:`, error);
      const ratingBanner2 = card.querySelector(".rating-banner");
      if (ratingBanner2) {
        ratingBanner2.style.visibility = "";
        ratingBanner2.style.height = "";
        ratingBanner2.style.overflow = "";
        ratingBanner2.style.padding = "";
        ratingBanner2.style.margin = "";
        ratingBanner2.style.border = "";
      }
      return false;
    }
  }
  async function replaceAllRatingBannersWithBadges() {
    if (HIDE_ASC_RANK_BADGE) {
      document.querySelectorAll(".rating-banner").forEach((banner) => {
        banner.style.visibility = "";
        banner.style.height = "";
        banner.style.overflow = "";
        banner.style.padding = "";
        banner.style.margin = "";
        banner.style.border = "";
      });
      return;
    }
    const performerCards = document.querySelectorAll(".thumbnail-section:not(.processed)");
    if (!performerCards.length) {
      return;
    }
    performerCards.forEach((card) => card.classList.add("processed"));
    for (const card of performerCards) {
      await processPerformerCard(card);
    }
  }
  function setupMutationObserver() {
    if (observer) {
      observer.disconnect();
    }
    observer = new MutationObserver((mutations) => {
      let newCards = [];
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.classList?.contains("thumbnail-section")) {
                newCards.push(node);
              } else if (node.querySelectorAll) {
                const cards = node.querySelectorAll(".thumbnail-section:not(.processed)");
                newCards.push(...cards);
              }
            }
          }
        }
      }
      if (newCards.length > 0) {
        newCards.forEach((card) => {
          card.classList.add("processed");
          processPerformerCard(card);
        });
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  async function showPlacementScreen(item, placementRank, finalRating, battleType, totalItemsCount) {
    const area = document.getElementById("hon-comparison-area");
    if (!area)
      return;
    let title, imagePath;
    if (battleType === "performers") {
      title = item.name || `Performer #${item.id}`;
      imagePath = item.image_path;
    } else if (battleType === "images") {
      title = `Image #${item.id}`;
      imagePath = item.paths?.thumbnail || null;
    } else {
      const file = item.files?.[0] || {};
      title = item.title || file.path?.split(/[/\\]/).pop().replace(/\.[^/.]+$/, "") || `Scene #${item.id}`;
      imagePath = item.paths?.screenshot || null;
    }
    let imageContent;
    if (battleType === "performers" && imagePath) {
      imageContent = `
      <a href="/performers/${item.id}" target="_blank" style="display: inline-block; text-decoration: none;">
        <img class="hon-victory-image" src="${imagePath}" alt="${title}" style="cursor: pointer; border: none;" />
      </a>`;
    } else if (imagePath) {
      imageContent = `<img class="hon-victory-image" src="${imagePath}" alt="${title}" />`;
    } else {
      imageContent = `<div class="hon-victory-image hon-no-image">No Image</div>`;
    }
    let rank = placementRank;
    let total = totalItemsCount;
    let displayScore = null;
    let tierName = null;
    let scoreLabel = "Rating";
    let scoreSuffix = `/10.0`;
    if (battleType === "performers") {
      try {
        await initCacheFromDB();
        if (!allPerformersCache) {
          allPerformersCache = await getAllPerformersSorted();
          rankCache = calculateAllPerformerRanks(allPerformersCache);
          await writeCache("allPerformers", allPerformersCache);
          await writeCache("rankMap", rankCache);
        }
        let rankInfo = rankCache ? rankCache.get(item.id) : null;
        if (!rankInfo) {
          rankInfo = await getPerformerGlobalRank(item.id, allPerformersCache);
        }
        if (rankInfo) {
          rank = rankInfo.rank;
          total = rankInfo.total;
          displayScore = rankInfo.battleScore;
          tierName = getRatingTier(item, allPerformersCache);
          scoreLabel = "Asc.Score";
          scoreSuffix = "";
        } else {
          displayScore = calculateBattleScore(item);
          tierName = getRatingTier(item, allPerformersCache);
          scoreLabel = "Asc.Score";
          scoreSuffix = "";
        }
      } catch (err) {
        console.warn("[Ascension] Failed to load global rank for placement screen:", err);
        displayScore = calculateBattleScore(item);
        tierName = getRatingTier(item, null);
        scoreLabel = "Asc.Score";
        scoreSuffix = "";
      }
    }
    let scoreDisplay = "";
    if (displayScore !== null && !isNaN(displayScore)) {
      const tierColor = tierName ? getTierColor(tierName) : getTierColor("F-Tier");
      scoreDisplay = `
      ${scoreLabel}: <strong style="color: ${tierColor};">${displayScore.toFixed(2)}${scoreSuffix}</strong>
      ${tierName ? `<span style="color: ${tierColor}; font-weight: bold;"> (${tierName})</span>` : ""}
    `;
    } else {
      scoreDisplay = `Rating: <strong>${(finalRating / 10).toFixed(1)}/10.0</strong>`;
    }
    area.innerHTML = `
    <div class="hon-victory-screen">
      <div class="hon-victory-crown">\u{1F4CD}</div>
      <h2 class="hon-victory-title">PLACED!</h2>
      <div class="hon-victory-scene">
        ${imageContent}
      </div>
      <h3 class="hon-victory-name">${title}</h3>
      <p class="hon-victory-stats">
        Rank <strong>#${rank}</strong> of ${total}<br>
        ${scoreDisplay}
      </p>
      <button id="hon-new-gauntlet" class="btn btn-primary">Start New Run</button>
    </div>
  `;
    document.getElementById("hon-gauntlet-status")?.remove();
    const actionsEl = document.querySelector(".hon-actions");
    if (actionsEl)
      actionsEl.style.display = "none";
    state.gauntletFalling = false;
    state.gauntletFallingItem = null;
    state.gauntletChampion = null;
    state.gauntletWins = 0;
    state.gauntletDefeated = [];
    const newGauntletBtn = area.querySelector("#hon-new-gauntlet");
    if (newGauntletBtn) {
      const freshBtn = newGauntletBtn.cloneNode(true);
      newGauntletBtn.parentNode.replaceChild(freshBtn, newGauntletBtn);
      freshBtn.addEventListener("click", () => {
        if (actionsEl)
          actionsEl.style.display = "";
        loadNewPair();
      });
    }
  }
  function showTierChangeNotification(card, oldRating, newRating) {
    const oldTier = getRatingTier(oldRating);
    const newTier = getRatingTier(newRating);
    if (oldTier === newTier)
      return;
    const tiers = ["F-Tier", "D-Tier", "C-Tier", "B-Tier", "A-Tier", "S-Tier"];
    const oldIndex = tiers.indexOf(oldTier);
    const newIndex = tiers.indexOf(newTier);
    const isUpgrade = newIndex > oldIndex;
    const isMobile3 = window.innerWidth <= 1200;
    if (isMobile3) {
      if (!card.classList.contains("active"))
        return;
    }
    const notification = document.createElement("div");
    notification.className = "hon-tier-change-notification";
    const tierColor = getTierColor(newTier);
    notification.innerHTML = `Tier Change: ${isUpgrade ? "\u2B06\uFE0F" : "\u2B07\uFE0F"} <span style="color: ${tierColor}">${newTier}</span>`;
    if (isMobile3) {
      card.style.position = "relative";
      card.classList.add("tier-changing");
      card.appendChild(notification);
      notification.offsetHeight;
      setTimeout(() => {
        notification.classList.add("show");
      }, 10);
      setTimeout(() => {
        notification.classList.remove("show");
        notification.classList.add("exit");
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
            card.classList.remove("tier-changing");
          }
        }, 400);
      }, 2e3);
    } else {
      notification.style.position = "absolute";
      notification.style.top = "1px";
      notification.style.left = "50%";
      notification.style.fontSize = "1.5rem";
      notification.style.fontWeight = "bold";
      notification.style.textAlign = "center";
      notification.style.zIndex = "150";
      notification.style.pointerEvents = "none";
      notification.style.whiteSpace = "nowrap";
      notification.style.opacity = "0";
      notification.style.background = "transparent";
      notification.style.padding = "0";
      notification.style.borderRadius = "0";
      notification.style.boxShadow = "none";
      notification.style.margin = "0";
      notification.style.transition = "opacity 0.3s ease, transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
      if (isUpgrade) {
        notification.style.transform = "translateX(-50%) translateY(20px)";
      } else {
        notification.style.transform = "translateX(-50%) translateY(-20px)";
      }
      card.style.position = "relative";
      card.appendChild(notification);
      setTimeout(() => {
        notification.style.opacity = "1";
        notification.style.transform = "translateX(-50%) translateY(0)";
      }, 10);
      setTimeout(() => {
        notification.style.opacity = "0";
        if (isUpgrade) {
          notification.style.transform = "translateX(-50%) translateY(-20px)";
        } else {
          notification.style.transform = "translateX(-50%) translateY(20px)";
        }
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 300);
      }, 1700);
    }
  }
  function createBattleRankTooltip(rank, total, rating, stats = null, battleScore = null) {
    let tooltipText = `Battle Rank #${rank} of ${total} performers`;
    if (battleScore !== null && !isNaN(battleScore)) {
      tooltipText += ` (Ascended Score: ${battleScore.toFixed(2)})`;
    }
    tooltipText += ` (Rating: ${rating}/100)`;
    if (stats && stats.total_matches > 0) {
      const winRate = (stats.wins / (stats.total_matches || 1) * 100).toFixed(1);
      tooltipText += `

Match Stats:`;
      tooltipText += `
\u2022 Record: ${stats.wins}W - ${stats.losses}L - ${stats.draws}D`;
      tooltipText += `
\u2022 Win Rate: ${winRate}%`;
      tooltipText += `
\u2022 Total Matches: ${stats.total_matches}`;
      if (stats.current_streak !== 0) {
        const streakType = stats.current_streak > 0 ? "+" : "-";
        tooltipText += `
\u2022 Current Streak: ${streakType} ${Math.abs(stats.current_streak)}`;
      }
      if (stats.best_streak > 0)
        tooltipText += `
\u2022 Best Streak: ${stats.best_streak}`;
      if (stats.worst_streak < 0)
        tooltipText += `
\u2022 Worst Streak: ${Math.abs(stats.worst_streak)}`;
    }
    return tooltipText;
  }
  function setupScenePageTooltips() {
    if (!isOnScenePage())
      return;
    const performerImages = document.querySelectorAll(".performer-card-image");
    performerImages.forEach((img) => {
      const linkEl = img.closest('a[href^="/performers/"]');
      if (!linkEl)
        return;
      const performerId = linkEl.href.split("/").pop();
      if (!performerId)
        return;
      img.addEventListener("mouseenter", async () => {
        try {
          await initCacheFromDB();
          if (!allPerformersCache) {
            allPerformersCache = await getAllPerformersSorted();
            rankCache = calculateAllPerformerRanks(allPerformersCache);
            await writeCache("allPerformers", allPerformersCache);
            await writeCache("rankMap", rankCache);
          }
          let rankInfo = rankCache ? rankCache.get(performerId) : null;
          if (!rankInfo) {
            rankInfo = await getPerformerGlobalRank(performerId, allPerformersCache);
          }
          if (rankInfo) {
            const tooltipText = createBattleRankTooltip(
              rankInfo.rank,
              rankInfo.total,
              rankInfo.rank,
              rankInfo.stats,
              rankInfo.battleScore
            );
            img.title = tooltipText;
          }
        } catch (error) {
          console.error(`Error fetching rank for performer ${performerId}:`, error);
        }
      });
    });
  }
  function handleNavigation() {
    if (lastPath !== window.location.pathname) {
      lastPath = window.location.pathname;
      injectBattleRankBadge();
      replaceAllRatingBannersWithBadges();
      setTimeout(setupScenePageTooltips, 500);
    }
  }
  function setupNavigationListener() {
    if (attachedListeners.has("navigation")) {
      window.removeEventListener("popstate", handleNavigation);
      if (pushStateOriginal) {
        history.pushState = pushStateOriginal;
      }
      attachedListeners.delete("navigation");
    }
    pushStateOriginal = history.pushState;
    history.pushState = function() {
      pushStateOriginal.apply(history, arguments);
      setTimeout(handleNavigation, 0);
    };
    window.addEventListener("popstate", handleNavigation);
    attachedListeners.add("navigation");
  }
  function showRatingAnimation(card, oldRating, newRating, change, isWinner) {
    showTierChangeNotification(card, oldRating, newRating);
    let overlay = card.querySelector(".hon-rating-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = `hon-rating-overlay ${isWinner ? "hon-rating-winner" : "hon-rating-loser"}`;
      const ratingDisplay = document.createElement("div");
      ratingDisplay.className = "hon-rating-display";
      ratingDisplay.textContent = (oldRating / 10).toFixed(1);
      const changeDisplay = document.createElement("div");
      changeDisplay.className = "hon-rating-change";
      const decimalChange = change / 10;
      changeDisplay.textContent = (decimalChange >= 0 ? "+" : "") + decimalChange.toFixed(1);
      overlay.appendChild(ratingDisplay);
      overlay.appendChild(changeDisplay);
      card.appendChild(overlay);
    } else {
      const ratingDisplay = overlay.querySelector(".hon-rating-display");
      if (ratingDisplay) {
        ratingDisplay.textContent = (oldRating / 10).toFixed(1);
      }
    }
    const totalSteps = Math.abs(change);
    if (totalSteps > 0) {
      const step = isWinner ? 1 : -1;
      let stepCount = 0;
      let currentRating = oldRating;
      const interval = setInterval(() => {
        stepCount++;
        currentRating += step;
        const ratingDisplay = overlay.querySelector(".hon-rating-display");
        if (ratingDisplay) {
          ratingDisplay.textContent = (currentRating / 10).toFixed(1);
        }
        if (stepCount >= totalSteps) {
          clearInterval(interval);
          const ratingDisplay2 = overlay.querySelector(".hon-rating-display");
          if (ratingDisplay2) {
            ratingDisplay2.textContent = (newRating / 10).toFixed(1);
          }
        }
      }, 15);
    }
    setTimeout(() => {
      if (overlay && overlay.parentNode) {
        overlay.remove();
      }
    }, 800);
  }
  async function initPlugin() {
    cleanup();
    HIDE_ASC_RANK_BADGE = await getPluginSettings();
    setupNavigationListener();
    setupMutationObserver();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        injectBattleRankBadge();
        replaceAllRatingBannersWithBadges();
        setTimeout(setupScenePageTooltips, 1e3);
      });
    } else {
      injectBattleRankBadge();
      replaceAllRatingBannersWithBadges();
      setTimeout(setupScenePageTooltips, 1e3);
    }
  }
  var HIDE_ASC_RANK_BADGE, attachedListeners, observer, processedCards, allPerformersCache, rankCache, isFetchingAllPerformers, isCacheInitializing, performerQueue, pushStateOriginal, cleanupFunctions, DB_NAME, DB_VERSION, STORE_NAME, ASCENSION_FLAME_SVG, debouncedInjectBattleRankBadge, lastPath;
  var init_ui_badge = __esm({
    "ui-badge.js"() {
      init_state();
      init_api_client();
      init_rating_utils();
      init_battle_engine();
      HIDE_ASC_RANK_BADGE = false;
      attachedListeners = /* @__PURE__ */ new Set();
      observer = null;
      processedCards = /* @__PURE__ */ new WeakSet();
      allPerformersCache = null;
      rankCache = null;
      isFetchingAllPerformers = false;
      isCacheInitializing = false;
      performerQueue = [];
      pushStateOriginal = null;
      cleanupFunctions = [];
      DB_NAME = "hon-badge-cache";
      DB_VERSION = 1;
      STORE_NAME = "performers";
      initCacheFromDB();
      ASCENSION_FLAME_SVG = `<svg 
  xmlns="http://www.w3.org/2000/svg" 
  viewBox="0 0 512 512" 
  class="hon-asc-icon" 
  fill="currentColor"
  aria-hidden="true" 
  focusable="false" 
  role="img"
  width="14" 
  height="14"
  style="fill: currentColor !important;">
  <path d="M160.53 20.906c-22.075.207-39.973 9.138-54.218 23.782C89.507 61.962 78.3 87.6 74.876 115.624c-6.847 56.05 16.55 119.953 82.094 146.625l-7.032 17.313c-64.128-26.096-93.275-84.757-94.782-141-17.36 10.866-27.608 27.05-32.343 46.437-5.728 23.448-2.727 51.54 7.906 77.844 21.264 52.61 71.37 96.856 138.436 87.594l2.563 18.53c-48.795 6.74-90.183-11.576-119.907-41.03-8.152 16.216-7.504 32.264-.657 48.312 8.472 19.854 27.498 39.252 52.875 53.594 47.085 26.61 114.8 35.554 173.19 5.094-5.43-20.99-2.652-45.074 11.342-69.313 22.71-39.332 60.78-49.83 88.375-38.688 13.798 5.572 25.08 16.555 29.875 31.157 4.796 14.6 2.836 32.303-7.375 50.312-11.8 20.81-34.144 27.877-51.25 22.22-8.552-2.83-16.22-9.437-18.875-18.876-2.653-9.44-.142-20.366 7.063-31.313l15.594 10.282c-5.238 7.955-5.5 13.08-4.69 15.967.813 2.888 2.84 4.895 6.75 6.188 7.822 2.587 21.483-.152 29.158-13.688 8.188-14.44 8.82-26.183 5.843-35.25-2.976-9.066-9.846-15.954-19.092-19.687-18.493-7.467-46.14-2.273-65.188 30.72-14.024 24.29-14.373 45.376-6.72 63.436l2.814 4.375c-.197.13-.397.25-.594.376.256.497.513 1.008.78 1.5 1.945 3.565 4.218 7.007 6.814 10.28.1.13.21.25.312.377.395.49.81.984 1.22 1.468 11.508 13.657 28.358 24.378 47.312 30.283 24.26 7.557 51.596 7.146 74.843-3.75 23.248-10.897 42.935-31.972 52.69-68.375 3.323-12.406 5.08-23.776 5.5-34.313.01-.418.023-.832.03-1.25.087-5.1-.088-10.246-.563-15.406-.037-.407-.084-.814-.125-1.22-.032-.27-.06-.544-.093-.813-3.295-25.79-15.823-46.16-34.345-64.437-29.635-29.24-75.698-51.638-122.75-74.125-47.052-22.487-95.112-45.1-128.875-77.656-31.683-30.553-49.926-71.185-40.313-124.814-.72-.01-1.444-.006-2.156 0z"/>
</svg>`;
      window.addEventListener("beforeunload", cleanup);
      cleanupFunctions.push(() => {
        window.removeEventListener("beforeunload", cleanup);
      });
      debouncedInjectBattleRankBadge = debounce(injectBattleRankBadgeInner, 300);
      lastPath = window.location.pathname;
      initPlugin();
    }
  });

  // gauntlet-selection.js
  var gauntlet_selection_exports = {};
  __export(gauntlet_selection_exports, {
    fetchPerformersForSelection: () => fetchPerformersForSelection,
    hidePerformerSelection: () => hidePerformerSelection,
    loadPerformerSelection: () => loadPerformerSelection,
    showPerformerSelection: () => showPerformerSelection,
    showPlacementScreen: () => showPlacementScreen
  });
  function formatHeight2(heightCm) {
    if (!heightCm)
      return null;
    const totalInches = Math.round(heightCm * 0.393701);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}\u2032${inches}\u2033 (${heightCm} cm)`;
  }
  async function fetchPerformersForSelection(count = 5) {
    const filter = getPerformerFilter(state.cachedUrlFilter, state.selectedGenders);
    const total = await fetchPerformerCount(filter);
    const actualCount = Math.min(count, total);
    const query = `query FindRandomPerformers($performer_filter: PerformerFilterType, $filter: FindFilterType) {
    findPerformers(performer_filter: $performer_filter, filter: $filter) {
      performers { ${PERFORMER_FRAGMENT} }
    }
  }`;
    const result = await graphqlQuery(query, {
      performer_filter: filter,
      filter: { per_page: Math.min(100, total), sort: "random" }
    });
    return (result.findPerformers.performers || []).sort(() => Math.random() - 0.5).slice(0, actualCount);
  }
  function createSelectionCard(performer) {
    const name = performer.name || `Performer #${performer.id}`;
    let ratingDisplay;
    let tierDisplay = "";
    let tierClass = "";
    let battleScore = null;
    if (performer.rating100 === null || performer.rating100 === 1) {
      ratingDisplay = "<span class='hon-selection-rating-value'>Unrated</span>";
      tierClass = "tier-f";
    } else {
      const ratingValue = performer.rating100;
      ratingDisplay = `<span class='hon-selection-rating-value'>${(ratingValue / 10).toFixed(1)}</span>`;
      const tier = getRatingTier(performer, state.globalPerformerPool);
      const tierColor = getTierColor(tier);
      tierDisplay = `<span class="hon-selection-tier" style="color: ${tierColor}">${tier}</span> | `;
      battleScore = calculateBattleScore(performer);
      switch (tier) {
        case "S-Tier":
          tierClass = "tier-s";
          break;
        case "A-Tier":
          tierClass = "tier-a";
          break;
        case "B-Tier":
          tierClass = "tier-b";
          break;
        case "C-Tier":
          tierClass = "tier-c";
          break;
        case "D-Tier":
          tierClass = "tier-d";
          break;
        case "F-Tier":
          tierClass = "tier-f";
          break;
        default:
          tierClass = "tier-f";
      }
    }
    let genderIcon = "";
    if (performer.gender) {
      const genderKey = performer.gender.toUpperCase();
      genderIcon = GENDER_ICONS[genderKey] || "\u{1F464}";
    }
    let countryDisplay = "";
    if (performer.country) {
      countryDisplay = getCountryDisplay(performer.country);
    }
    let heightDisplay = "";
    if (performer.height_cm) {
      heightDisplay = formatHeight2(performer.height_cm);
    }
    const metaItems = [];
    if (countryDisplay) {
      metaItems.push(`<div class="hon-selection-meta-item"><strong>Country:</strong> ${countryDisplay}</div>`);
    }
    if (heightDisplay) {
      metaItems.push(`<div class="hon-selection-meta-item"><strong>Height:</strong> ${heightDisplay}</div>`);
    }
    if (performer.measurements) {
      metaItems.push(`<div class="hon-selection-meta-item"><strong>Measurements:</strong> ${performer.measurements}</div>`);
    }
    if (performer.fake_tits) {
      metaItems.push(`<div class="hon-selection-meta-item"><strong>Fake Tits:</strong> ${performer.fake_tits}</div>`);
    }
    if (performer.tags && performer.tags.length > 0) {
      const tagNames = performer.tags.map((tag) => tag.name || tag).join(", ");
      metaItems.push(`<div class="hon-selection-meta-item"><strong>Tags:</strong> ${tagNames}</div>`);
    }
    let scoreDisplay;
    if (battleScore !== null) {
      scoreDisplay = `Asc. Score: ${tierDisplay}${battleScore.toFixed(2)}`;
    } else {
      scoreDisplay = `Rating: ${tierDisplay}${ratingDisplay}`;
    }
    return `
    <div class="hon-selection-card ${tierClass}" data-performer-id="${performer.id}">
      <div class="hon-selection-image-container">
        ${performer.image_path ? `<img class="hon-selection-image" src="${performer.image_path}" alt="${name}" loading="lazy" />` : `<div class="hon-selection-image hon-no-image">No Image</div>`}
      </div>
      <div class="hon-selection-info">
        <h4 class="hon-selection-name">${name} ${genderIcon}</h4>
        <div class="hon-selection-rating">${scoreDisplay}</div>
        ${metaItems.join("")}
      </div>
    </div>`;
  }
  async function loadPerformerSelection() {
    const listEl = document.getElementById("hon-performer-list");
    if (!listEl)
      return;
    try {
      if (!state.globalPerformerPool || state.globalPerformerPool.length === 0) {
        try {
          const { fetchGlobalPerformerRatings: fetchGlobalPerformerRatings2 } = await Promise.resolve().then(() => (init_api_client(), api_client_exports));
          state.globalPerformerPool = await fetchGlobalPerformerRatings2();
        } catch (e) {
          console.warn("[Ascension] Failed to load global pool for selection tiers", e);
        }
      }
      const performers = await fetchPerformersForSelection(5);
      listEl.innerHTML = "";
      listEl.classList.remove("hon-selection-carousel");
      const isRealMobileDevice = isMobile() && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
      let cards = [];
      performers.forEach((performer, index) => {
        const cardHtml = createSelectionCard(performer);
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = cardHtml;
        const card = tempDiv.firstElementChild;
        card.onclick = () => {
          startGauntletWithPerformer(performer);
        };
        listEl.appendChild(card);
        cards.push(card);
        if (!isRealMobileDevice) {
          card.style.opacity = "0";
          card.style.transform = "translateY(20px)";
          card.style.transition = "opacity 0.4s ease, transform 0.4s ease";
          setTimeout(() => {
            card.style.opacity = "1";
            card.style.transform = "translateY(0)";
          }, 10 + index * 100);
        }
      });
      if (isRealMobileDevice && cards.length > 0) {
        listEl.classList.add("hon-selection-carousel");
        const wrapper = document.createElement("div");
        wrapper.className = "hon-vs-container hon-gauntlet-selection-carousel";
        wrapper.style.position = "relative";
        wrapper.style.width = "100%";
        wrapper.style.overflow = "hidden";
        while (listEl.firstChild) {
          wrapper.appendChild(listEl.firstChild);
        }
        listEl.appendChild(wrapper);
        cards.forEach((card) => {
          card.style.opacity = "";
          card.style.transform = "";
          card.style.transition = "";
        });
        const carousel = enableCardCarousel(wrapper, cards, { verticalFactor: 1.5 });
        cards.forEach((card) => {
          card.onclick = (e) => {
            e.stopPropagation();
            const activeCard = carousel.getCurrentCard();
            const activePerformerId = activeCard.dataset.performerId;
            const activePerformer = performers.find((p) => p.id == activePerformerId);
            if (activePerformer) {
              startGauntletWithPerformer(activePerformer);
            }
          };
        });
      }
    } catch (err) {
      listEl.innerHTML = `<div class="hon-error">Error: ${err.message}</div>`;
    }
  }
  function startGauntletWithPerformer(performer) {
    resetBattleState();
    state.gauntletChampion = performer;
    state.gauntletWins = 0;
    state.gauntletFalling = false;
    const performerName = performer.name || `Performer #${performer.id}`;
    const performerRating = performer.rating100 ? (performer.rating100 / 10).toFixed(1) : "Unrated";
    console.log(`[Ascension] Champion Selected: ${performerName} (ID: ${performer.id}) | Rating: ${performerRating}`);
    const sel = document.getElementById("hon-performer-selection");
    const comp = document.getElementById("hon-comparison-area");
    const actions = document.querySelector(".hon-actions");
    if (comp) {
      comp.innerHTML = '<div class="hon-loading">Loading matchup...</div>';
      comp.style.display = "";
    }
    if (sel)
      sel.style.display = "none";
    if (actions)
      actions.style.display = "";
    const modal = document.getElementById("hon-modal");
    if (modal) {
      modal.classList.remove("hon-mode-champion", "hon-mode-swiss", "hon-mode-gauntlet", "hon-mode-placement");
      modal.classList.add(`hon-mode-${state.currentMode}`);
    }
    loadNewPair();
  }
  function showPerformerSelection() {
    const selectionContainer = document.getElementById("hon-performer-selection");
    const comparisonArea = document.getElementById("hon-comparison-area");
    const actionsEl = document.querySelector(".hon-actions");
    if (selectionContainer) {
      selectionContainer.style.display = "block";
      loadPerformerSelection();
    }
    if (comparisonArea)
      comparisonArea.style.display = "none";
    if (actionsEl)
      actionsEl.style.display = "none";
    const modal = document.getElementById("hon-modal");
    if (modal) {
      modal.classList.remove("hon-mode-champion", "hon-mode-swiss", "hon-mode-gauntlet", "hon-mode-placement");
      modal.classList.add(`hon-mode-${state.currentMode}`);
    }
  }
  function hidePerformerSelection() {
    const selectionContainer = document.getElementById("hon-performer-selection");
    const comparisonArea = document.getElementById("hon-comparison-area");
    const actionsEl = document.querySelector(".hon-actions");
    if (selectionContainer)
      selectionContainer.style.display = "none";
    if (comparisonArea)
      comparisonArea.style.display = "";
    if (actionsEl)
      actionsEl.style.display = "";
    const modal = document.getElementById("hon-modal");
    if (modal) {
      modal.classList.remove("hon-mode-gauntlet", "hon-mode-placement");
      modal.classList.add(`hon-mode-${state.currentMode}`);
    }
  }
  var init_gauntlet_selection = __esm({
    "gauntlet-selection.js"() {
      init_api_client();
      init_parsers();
      init_state();
      init_battle_engine();
      init_formatters();
      init_ui_swipe();
      init_ui_badge();
      init_rating_utils();
      init_constants();
    }
  });

  // match-handler.js
  var match_handler_exports = {};
  __export(match_handler_exports, {
    handleChooseItem: () => handleChooseItem,
    handleSkip: () => handleSkip,
    handleUndo: () => handleUndo
  });
  function useBattleScoreDisplay(performer) {
    if (!performer || state.battleType !== "performers")
      return false;
    return true;
  }
  function getDisplayRating(performer) {
    if (!performer || state.battleType !== "performers") {
      return parseInt(performer?.rating100) || 1;
    }
    const battleScore = calculateBattleScore(performer);
    return Math.round(battleScore * 10);
  }
  async function handleChooseItem(event) {
    if (state.disableChoice)
      return;
    state.disableChoice = true;
    const body = event.currentTarget;
    const winnerId = body.dataset.winner;
    const isLeftWinner = winnerId === state.currentPair.left.id;
    const winnerItem = isLeftWinner ? state.currentPair.left : state.currentPair.right;
    const loserItem = isLeftWinner ? state.currentPair.right : state.currentPair.left;
    const loserId = loserItem.id;
    const winnerCard = body.closest(".hon-scene-card");
    const loserCard = document.querySelector(`[data-performer-id="${loserId}"], [data-scene-id="${loserId}"], [data-image-id="${loserId}"]`);
    const winnerRating = parseInt(winnerCard.dataset.rating) || 1;
    const loserRating = parseInt(loserCard?.dataset.rating) || 1;
    const winnerDisplayRating = getDisplayRating(winnerItem);
    const loserDisplayRating = getDisplayRating(loserItem);
    const loserRank = isLeftWinner ? state.currentRanks.right : state.currentRanks.left;
    if (state.battleType === "images") {
      const outcome2 = await handleComparison(winnerId, loserId, winnerRating, loserRating, null, winnerItem, loserItem);
      applyVisualFeedback(winnerCard, loserCard, winnerItem, loserItem, winnerDisplayRating, loserDisplayRating, outcome2);
      setTimeout(() => loadNewPair(), 800);
      return;
    }
    const recordModeOutcome = async () => {
      const outcome2 = await handleComparison(
        winnerId,
        loserId,
        winnerRating,
        loserRating,
        null,
        winnerItem,
        loserItem,
        false
      );
      applyVisualFeedback(winnerCard, loserCard, winnerItem, loserItem, winnerDisplayRating, loserDisplayRating, outcome2);
      return outcome2;
    };
    if (state.currentMode === "gauntlet") {
      if (state.gauntletFalling && state.gauntletFallingItem) {
        const outcome2 = await recordModeOutcome();
        winnerItem.rating100 = outcome2.newWinnerRating;
        loserItem.rating100 = outcome2.newLoserRating;
        if (winnerId === state.gauntletFallingItem.id) {
          const placedRank = isLeftWinner ? state.currentRanks.left : state.currentRanks.right;
          setTimeout(() => {
            showPlacementScreen(winnerItem, placedRank, outcome2.newWinnerRating, state.battleType, state.totalItemsCount);
          }, 800);
          return;
        }
        state.gauntletFallingItem = loserItem;
        setTimeout(() => loadNewPair(), 800);
        return;
      }
      if (winnerId === state.gauntletChampion?.id) {
        const outcome2 = await recordModeOutcome();
        winnerItem.rating100 = outcome2.newWinnerRating;
        loserItem.rating100 = outcome2.newLoserRating;
        state.gauntletChampion = winnerItem;
        state.gauntletWins++;
        state.gauntletDefeated.push(loserId);
        if (state.gauntletWins >= state.totalItemsCount - 1) {
          setTimeout(() => {
            const victoryScreen = createVictoryScreen(state.gauntletChampion, state.battleType, state.gauntletWins, state.totalItemsCount);
            const area = document.getElementById("hon-comparison-area");
            if (area) {
              area.innerHTML = victoryScreen;
              document.getElementById("hon-new-gauntlet")?.addEventListener("click", () => {
                resetBattleState();
                loadNewPair();
              });
            }
          }, 800);
          return;
        }
        setTimeout(() => loadNewPair(), 800);
        return;
      }
      if (loserId === state.gauntletChampion?.id) {
        const outcome2 = await recordModeOutcome();
        winnerItem.rating100 = outcome2.newWinnerRating;
        loserItem.rating100 = outcome2.newLoserRating;
        state.gauntletChampion = winnerItem;
        state.gauntletWins = 0;
        state.gauntletDefeated = [];
        state.gauntletFalling = true;
        state.gauntletFallingItem = loserItem;
        setTimeout(() => loadNewPair(), 800);
        return;
      }
    }
    if (state.currentMode === "champion") {
      const outcome2 = await recordModeOutcome();
      winnerItem.rating100 = outcome2.newWinnerRating;
      loserItem.rating100 = outcome2.newLoserRating;
      if (winnerId === state.gauntletChampion?.id) {
        state.gauntletChampion = winnerItem;
        state.gauntletWins++;
        state.gauntletDefeated.push(loserId);
      } else if (loserId === state.gauntletChampion?.id) {
        state.gauntletChampion = winnerItem;
        state.gauntletWins++;
        state.gauntletDefeated.push(loserId);
      } else if (!state.gauntletChampion) {
        state.gauntletChampion = winnerItem;
        state.gauntletWins = 1;
        state.gauntletDefeated = [loserId];
      }
      setTimeout(() => loadNewPair(), 800);
      return;
    }
    const outcome = await handleComparison(
      winnerId,
      loserId,
      winnerRating,
      loserRating,
      loserRank,
      winnerItem,
      loserItem,
      false
    );
    applyVisualFeedback(winnerCard, loserCard, winnerItem, loserItem, winnerDisplayRating, loserDisplayRating, outcome);
    setTimeout(() => loadNewPair(), 800);
  }
  async function handleSkip(event) {
    if (state.disableChoice)
      return;
    const skipBtn = event?.currentTarget;
    let skippedIds = [];
    if (skipBtn?.dataset?.skip) {
      skippedIds.push(skipBtn.dataset.skip);
    }
    if (skippedIds.length === 0) {
      if (state.currentPair?.left?.id)
        skippedIds.push(state.currentPair.left.id);
      if (state.currentPair?.right?.id)
        skippedIds.push(state.currentPair.right.id);
    }
    if (skippedIds.length === 0) {
      console.log("[Ascension] No IDs to skip");
      return;
    }
    console.log(`[Ascension] Skipping item(s): ${skippedIds.join(", ")}`);
    state.skippedIds = state.skippedIds || [];
    skippedIds.forEach((id) => state.skippedIds.push(id));
    if (state.skippedIds.length > 100) {
      state.skippedIds = state.skippedIds.slice(-100);
    }
    loadNewPair();
  }
  function applyVisualFeedback(winnerCard, loserCard, winnerItem, loserItem, winnerDisplayRating, loserDisplayRating, outcome) {
    winnerCard.classList.add("hon-winner");
    if (loserCard)
      loserCard.classList.add("hon-loser");
    const winnerBody = winnerCard.querySelector(".hon-scene-body");
    const loserBody = loserCard ? loserCard.querySelector(".hon-scene-body") : null;
    if (winnerBody) {
      const winnerBtn = winnerBody.querySelector(".hon-choose-btn");
      if (winnerBtn) {
        winnerBtn.classList.add("chosen-btn");
        if (!winnerBtn.classList.contains("hon-choose-btn-icon")) {
          winnerBtn.innerHTML = "\u2705";
        }
      }
    }
    if (loserBody) {
      const loserBtn = loserBody.querySelector(".hon-choose-btn");
      if (loserBtn) {
        loserBtn.classList.add("not-chosen-btn");
        if (!loserBtn.classList.contains("hon-choose-btn-icon")) {
          loserBtn.innerHTML = "\u274C";
        }
      }
    }
    const winnerIsBattleScore = useBattleScoreDisplay(winnerItem);
    const loserIsBattleScore = useBattleScoreDisplay(loserItem);
    const winnerNewDisplayRating = winnerIsBattleScore ? winnerDisplayRating + outcome.winnerChange : outcome.newWinnerRating;
    const winnerDisplayChange = outcome.winnerChange;
    const loserNewDisplayRating = loserIsBattleScore ? loserDisplayRating + outcome.loserChange : outcome.newLoserRating;
    const loserDisplayChange = outcome.loserChange;
    showRatingAnimation(winnerCard, winnerDisplayRating, winnerNewDisplayRating, winnerDisplayChange, true);
    if (loserCard) {
      showRatingAnimation(loserCard, loserDisplayRating, loserNewDisplayRating, loserDisplayChange, false);
    }
    setTimeout(() => {
      winnerCard.classList.add("hon-transition-out");
      if (loserCard)
        loserCard.classList.add("hon-transition-out");
    }, 400);
  }
  async function handleUndo() {
    if (!state.matchHistory || state.matchHistory.length === 0) {
      console.log("[Ascension] Nothing to undo.");
      return;
    }
    const undoBtn = document.getElementById("hon-undo-btn");
    if (undoBtn) {
      undoBtn.disabled = true;
      undoBtn.textContent = "\u{1F504}";
    }
    try {
      console.log("[Ascension] Starting undo operation...");
      const pairSnapshot = await undoLastMatch();
      if (pairSnapshot?.left && pairSnapshot?.right) {
        console.log("[Ascension] Re-rendering previous pair from snapshot");
        const { renderCard: renderCard2 } = await Promise.resolve().then(() => (init_ui_manager(), ui_manager_exports));
        const { attachBattleListeners: attachBattleListeners2 } = await Promise.resolve().then(() => (init_battle_engine(), battle_engine_exports));
        const area = document.getElementById("hon-comparison-area");
        if (area) {
          state.disableChoice = false;
          area.innerHTML = `
          <div class="hon-vs-container">
            ${renderCard2(pairSnapshot.left, "left", pairSnapshot.rankLeft)}
            <div class="hon-vs-divider"><span>VS</span></div>
            ${renderCard2(pairSnapshot.right, "right", pairSnapshot.rankRight)}
          </div>
        `;
          attachBattleListeners2(area);
        }
        console.log("[Ascension] Undo successful \u2014 previous pair restored.");
      } else {
        console.log("[Ascension] No snapshot available, loading fresh pair");
        loadNewPair();
      }
    } catch (err) {
      console.error("[Ascension] Undo failed:", err);
      const area = document.getElementById("hon-comparison-area");
      if (area) {
        area.innerHTML = `<div class="hon-error">Undo failed: ${err.message}</div>`;
      }
      setTimeout(() => {
        loadNewPair();
      }, 2e3);
    } finally {
      state.disableChoice = false;
      const btn = document.getElementById("hon-undo-btn");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "\u21A9";
        btn.style.display = state.matchHistory && state.matchHistory.length > 0 ? "inline-block" : "none";
      }
    }
  }
  var init_match_handler = __esm({
    "match-handler.js"() {
      init_state();
      init_api_client();
      init_ui_manager();
      init_battle_engine();
      init_rating_utils();
    }
  });

  // battle-engine.js
  var battle_engine_exports = {};
  __export(battle_engine_exports, {
    attachBattleListeners: () => attachBattleListeners,
    fetchAllScenesSorted: () => fetchAllScenesSorted,
    fetchChampionPairPerformers: () => fetchChampionPairPerformers,
    fetchChampionPairScenes: () => fetchChampionPairScenes,
    fetchGauntletPairPerformers: () => fetchGauntletPairPerformers,
    fetchGauntletPairScenes: () => fetchGauntletPairScenes,
    fetchPair: () => fetchPair,
    fetchRandomScenes: () => fetchRandomScenes,
    fetchSceneCount: () => fetchSceneCount,
    fetchSwissPairImages: () => fetchSwissPairImages,
    fetchSwissPairPerformers: () => fetchSwissPairPerformers,
    fetchSwissPairScenes: () => fetchSwissPairScenes,
    handleMatchmakingLogic: () => handleMatchmakingLogic,
    loadNewPair: () => loadNewPair
  });
  function isNonVotingClick(e) {
    return !!e.target.closest("a.hon-scene-link, a.hon-performer-link, .hon-tags-more, .hon-focus-btn");
  }
  function attachBattleListeners(area) {
    if (area._battleCleanup) {
      area._battleCleanup();
    }
    const cleanupFunctions2 = [];
    let carouselInstance = null;
    let autoPlayTimeout = null;
    let focusTimeout = null;
    let clickTimeout = null;
    let activeCard = null;
    let activeVideo = null;
    let mobileBlurHandler = null;
    const clearAllTimers = () => {
      clearTimeout(autoPlayTimeout);
      clearTimeout(focusTimeout);
      clearTimeout(clickTimeout);
      autoPlayTimeout = null;
      focusTimeout = null;
      clickTimeout = null;
    };
    if (isMobile()) {
      const clearAutoPlay = () => {
        if (autoPlayTimeout) {
          clearTimeout(autoPlayTimeout);
          autoPlayTimeout = null;
        }
      };
      const showPreviewVideo = (video) => {
        video.style.display = "block";
        video.style.position = "absolute";
        video.style.top = "0";
        video.style.left = "0";
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "contain";
        video.style.zIndex = "10";
      };
      const hidePreviewVideo = (video) => {
        video.style.display = "none";
        video.style.position = "";
        video.style.top = "";
        video.style.left = "";
        video.style.width = "";
        video.style.height = "";
        video.style.objectFit = "";
        video.style.zIndex = "";
      };
      const startAutoPlay = (card) => {
        clearAutoPlay();
        const video = card.querySelector(".hon-hover-preview");
        if (!video)
          return;
        activeVideo = video;
        showPreviewVideo(video);
        video.muted = true;
        const playPromise = video.play();
        if (playPromise) {
          playPromise.catch((error) => {
            console.warn("[Ascension] Video autoplay failed:", error);
          });
        }
      };
      const handleFocus = (card) => {
        if (activeCard === card)
          return;
        clearAutoPlay();
        if (activeVideo) {
          activeVideo.pause();
          activeVideo.currentTime = 0;
          hidePreviewVideo(activeVideo);
          activeVideo = null;
        }
        if (activeCard) {
          activeCard.classList.remove("focused");
        }
        activeCard = card;
        card.classList.add("focused");
        startAutoPlay(card);
      };
      const handleBlur = () => {
        clearAutoPlay();
        if (activeVideo) {
          activeVideo.pause();
          activeVideo.currentTime = 0;
          hidePreviewVideo(activeVideo);
          activeVideo = null;
        }
        if (activeCard) {
          activeCard.classList.remove("focused");
          activeCard = null;
        }
      };
      mobileBlurHandler = handleBlur;
      const container = area.querySelector(".hon-vs-container");
      if (container) {
        const cards = Array.from(container.querySelectorAll(".hon-scene-card"));
        if (cards.length >= 2) {
          const carousel = enableCardCarousel(container, cards, {
            onFocus: (card) => handleFocus(card),
            onBlur: () => handleBlur()
          });
          carouselInstance = carousel;
          cards.forEach((card) => {
            const clickHandler = (e) => {
              if (isNonVotingClick(e))
                return;
              if (clickTimeout)
                clearTimeout(clickTimeout);
              clickTimeout = setTimeout(() => {
                clickTimeout = null;
              }, 500);
              e.stopPropagation();
              handleChooseItem(e);
            };
            const sceneBody = card.querySelector(".hon-scene-body");
            if (sceneBody) {
              sceneBody.addEventListener("click", clickHandler);
              cleanupFunctions2.push(() => sceneBody.removeEventListener("click", clickHandler));
            }
            const focusBtn = card.querySelector(".hon-focus-btn");
            if (focusBtn) {
              const focusHandler2 = (e) => {
                e.stopPropagation();
                focusBtn.classList.add("pressed");
                setTimeout(() => focusBtn.classList.remove("pressed"), 200);
                handleFocus(card);
              };
              focusBtn.addEventListener("click", focusHandler2);
              cleanupFunctions2.push(() => focusBtn.removeEventListener("click", focusHandler2));
            }
            const focusHandler = () => handleFocus(card);
            const blurHandler = handleBlur;
            card.addEventListener("focus", focusHandler);
            card.addEventListener("blur", blurHandler);
            cleanupFunctions2.push(() => {
              card.removeEventListener("focus", focusHandler);
              card.removeEventListener("blur", blurHandler);
            });
          });
          focusTimeout = setTimeout(() => {
            handleFocus(cards[0]);
          }, 100);
        }
      }
    } else {
      const sceneBodies = area.querySelectorAll(".hon-scene-body");
      sceneBodies.forEach((body) => {
        const clickHandler = (e) => {
          if (isNonVotingClick(e))
            return;
          handleChooseItem(e);
        };
        body.addEventListener("click", clickHandler);
        cleanupFunctions2.push(() => body.removeEventListener("click", clickHandler));
      });
      const cards = area.querySelectorAll(".hon-scene-card");
      cards.forEach((card) => {
        const video = card.querySelector(".hon-hover-preview");
        if (!video)
          return;
        const mouseEnterHandler = () => {
          if (video.style.display === "none")
            video.style.display = "block";
          video.muted = true;
          video.style.position = "absolute";
          video.style.top = "0";
          video.style.left = "0";
          video.style.width = "100%";
          video.style.height = "100%";
          video.style.objectFit = "contain";
          video.play().catch(() => {
          });
        };
        const mouseLeaveHandler = () => {
          video.style.display = "none";
          video.pause();
          video.currentTime = 0;
        };
        card.addEventListener("mouseenter", mouseEnterHandler);
        card.addEventListener("mouseleave", mouseLeaveHandler);
        cleanupFunctions2.push(() => {
          card.removeEventListener("mouseenter", mouseEnterHandler);
          card.removeEventListener("mouseleave", mouseLeaveHandler);
        });
      });
    }
    const sceneCards = area.querySelectorAll(".hon-scene-card[data-scene-id]");
    sceneCards.forEach((card) => {
      const sceneImageContainer = card.querySelector(".hon-scene-image-container");
      if (sceneImageContainer && sceneImageContainer.dataset.sceneUrl) {
        const sceneUrl = sceneImageContainer.dataset.sceneUrl;
        const imageContainerClickHandler = (e) => {
          e.stopPropagation();
          const link = document.createElement("a");
          link.href = sceneUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.style.display = "none";
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            if (link.parentNode)
              link.parentNode.removeChild(link);
          }, 0);
        };
        sceneImageContainer.style.cursor = "pointer";
        sceneImageContainer.addEventListener("click", imageContainerClickHandler);
        cleanupFunctions2.push(() => sceneImageContainer.removeEventListener("click", imageContainerClickHandler));
      }
    });
    const tagElements = area.querySelectorAll(".hon-tags-more");
    tagElements.forEach((tagElement) => {
      const clickHandler = function(e) {
        e.stopPropagation();
        const container = this.parentElement;
        const displayedTags = container.querySelector(".hon-tags-displayed");
        const ellipsis = container.querySelector(".hon-tags-ellipsis");
        const moreLink = this;
        const expandedTags = container.querySelector(".hon-tags-expanded");
        if (displayedTags)
          displayedTags.style.display = "none";
        if (ellipsis)
          ellipsis.style.display = "none";
        moreLink.style.display = "none";
        if (expandedTags)
          expandedTags.style.display = "inline";
      };
      tagElement.addEventListener("click", clickHandler);
      cleanupFunctions2.push(() => tagElement.removeEventListener("click", clickHandler));
    });
    area._battleCleanup = () => {
      if (mobileBlurHandler)
        mobileBlurHandler();
      clearAllTimers();
      if (carouselInstance && typeof carouselInstance.destroy === "function") {
        carouselInstance.destroy();
        carouselInstance = null;
      }
      activeCard = null;
      activeVideo = null;
      cleanupFunctions2.forEach((cleanup3) => cleanup3());
      delete area._battleCleanup;
    };
  }
  async function fetchPair() {
    const { battleType, currentMode } = state;
    if (currentMode === "swiss") {
      if (battleType === "performers")
        return await fetchSwissPairPerformers(state.selectedGenders);
      if (battleType === "images")
        return await fetchSwissPairImages();
      if (battleType === "scenes")
        return await fetchSwissPairScenes();
    }
    if (currentMode === "gauntlet") {
      if (battleType === "performers")
        return await fetchGauntletPairPerformers();
      if (battleType === "scenes")
        return await fetchGauntletPairScenes();
      if (battleType === "images")
        return await fetchSwissPairImages();
    }
    if (currentMode === "champion") {
      if (battleType === "performers")
        return await fetchChampionPairPerformers();
      if (battleType === "scenes")
        return await fetchChampionPairScenes();
      if (battleType === "images")
        return await fetchSwissPairImages();
    }
    if (battleType === "scenes") {
      return { items: await fetchRandomScenes(2), ranks: [null, null], isVictory: false };
    }
    return { items: await fetchRandomPerformers(2), ranks: [null, null], isVictory: false };
  }
  async function loadNewPair() {
    state.disableChoice = false;
    const area = document.getElementById("hon-comparison-area");
    if (!area)
      return;
    const undoBtn = document.getElementById("hon-undo-btn");
    if (undoBtn) {
      undoBtn.style.display = state.matchHistory && state.matchHistory.length > 0 ? "inline-block" : "none";
      undoBtn.disabled = false;
      undoBtn.textContent = "\u21A9";
    }
    if ((state.currentMode === "gauntlet" || state.currentMode === "champion") && state.battleType === "performers" && !state.gauntletChampion && !state.gauntletFalling) {
      if (area._battleCleanup)
        area._battleCleanup();
      showPerformerSelection();
      return;
    }
    try {
      const result = await fetchPair();
      if (result.isVictory) {
        if (area._battleCleanup)
          area._battleCleanup();
        area.innerHTML = createVictoryScreen(result.items[0], state.battleType, state.gauntletWins, state.totalItemsCount);
        attachVictoryHandlers(area);
        return;
      }
      if (result.isPlacement) {
        if (area._battleCleanup)
          area._battleCleanup();
        showPlacementScreen(result.items[0], result.placementRank, result.placementRating, state.battleType, state.totalItemsCount);
        return;
      }
      const [left, right] = result.items;
      state.currentPair = { left, right };
      state.currentRanks = { left: result.ranks[0], right: result.ranks[1] };
      const oldContainer = area.querySelector(".hon-vs-container");
      const newContainer = document.createElement("div");
      newContainer.className = "hon-vs-container hon-pair-entering";
      newContainer.innerHTML = `
      ${renderCard(left, "left", result.ranks[0])}
      <div class="hon-vs-divider"><span>VS</span></div>
      ${renderCard(right, "right", result.ranks[1])}
    `;
      if (oldContainer) {
        oldContainer.replaceWith(newContainer);
      } else {
        area.innerHTML = "";
        area.appendChild(newContainer);
      }
      attachBattleListeners(area);
    } catch (err) {
      area.innerHTML = `<div class="hon-error">Error: ${err.message}</div>`;
    }
  }
  function attachVictoryHandlers(area) {
    const btn = area.querySelector("#hon-new-gauntlet");
    if (btn) {
      if (btn._victoryCleanup)
        btn._victoryCleanup();
      const clickHandler = () => {
        resetBattleState();
        if (state.currentMode === "gauntlet" && state.battleType === "performers") {
          Promise.resolve().then(() => (init_gauntlet_selection(), gauntlet_selection_exports)).then((m) => m.showPerformerSelection());
        } else {
          loadNewPair();
        }
      };
      btn.addEventListener("click", clickHandler);
      btn._victoryCleanup = () => {
        btn.removeEventListener("click", clickHandler);
        delete btn._victoryCleanup;
      };
    }
  }
  function shouldForceCrossTierMatch() {
    return Math.random() < 0.1;
  }
  function getTierPercentileWindow(tier) {
    switch (tier) {
      case "S-Tier":
        return 8;
      case "A-Tier":
        return 12;
      case "B-Tier":
        return 16;
      case "C-Tier":
        return 20;
      case "D-Tier":
        return 28;
      case "F-Tier":
        return 40;
      default:
        return 25;
    }
  }
  function getAdjacentTiers(tier) {
    const index = TIER_ORDER.indexOf(tier);
    if (index === -1)
      return [];
    const adjacent = [];
    if (index > 0)
      adjacent.push(TIER_ORDER[index - 1]);
    if (index < TIER_ORDER.length - 1)
      adjacent.push(TIER_ORDER[index + 1]);
    return adjacent;
  }
  function isCustomTierMode() {
    return state.selectedTiers && Array.isArray(state.selectedTiers) && !state.selectedTiers.includes("any");
  }
  function performerMatchesSelectedTiers(performer, tierPool) {
    const selected = state.selectedTiers;
    if (!selected || selected.includes("any"))
      return true;
    const allowed = new Set(selected);
    if (allowed.has("newcomers")) {
      const stats = parsePerformerEloData(performer);
      if (stats.total_matches < 6)
        return true;
    }
    const tier = getRatingTier(performer, tierPool);
    return allowed.has(tier);
  }
  function canBattleInSelectedTiers(tier1, tier2) {
    if (!isCustomTierMode())
      return canBattleByTier(tier1, tier2);
    const allowed = new Set(state.selectedTiers);
    if (allowed.has("newcomers"))
      return true;
    return allowed.has(tier1) && allowed.has(tier2);
  }
  function getSelectedTierWindowMultiplier() {
    if (!isCustomTierMode())
      return 1;
    const letters = state.selectedTiers.filter((t) => t !== "newcomers" && t !== "any");
    if (letters.length < 2)
      return 1;
    const indices = letters.map((t) => TIER_ORDER.indexOf(t)).filter((i) => i !== -1);
    if (indices.length < 2)
      return 1;
    const gap = Math.max(...indices) - Math.min(...indices);
    if (gap <= 1)
      return 1;
    if (gap === 2)
      return 2.5;
    if (gap === 3)
      return 4;
    return 6;
  }
  function getCustomTierRatingWindow() {
    if (!isCustomTierMode())
      return 15;
    const letters = state.selectedTiers.filter((t) => t !== "newcomers" && t !== "any");
    if (letters.length < 2)
      return 15;
    const indices = letters.map((t) => TIER_ORDER.indexOf(t)).filter((i) => i !== -1);
    if (indices.length < 2)
      return 15;
    const gap = Math.max(...indices) - Math.min(...indices);
    if (gap <= 1)
      return 30;
    if (gap === 2)
      return 55;
    if (gap === 3)
      return 90;
    return 140;
  }
  function getCrossTierWeightMultiplier(seedTier, opponentTier) {
    if (!isCustomTierMode())
      return 1;
    const gap = Math.abs(TIER_ORDER.indexOf(seedTier) - TIER_ORDER.indexOf(opponentTier));
    if (gap <= 1)
      return 1.8;
    if (gap === 2)
      return 2.5;
    if (gap === 3)
      return 3.5;
    return 5;
  }
  async function fetchSwissPairImages() {
    const totalImages = await fetchImageCount();
    const useSampling = totalImages > 1e3;
    const sampleSize = useSampling ? Math.min(500, totalImages) : totalImages;
    const query = `query FindImagesByRating($filter: FindFilterType) {
    findImages(filter: $filter) { images { ${IMAGE_FRAGMENT} } }
  }`;
    const result = await graphqlQuery(query, {
      filter: {
        per_page: sampleSize,
        sort: useSampling ? "random" : "rating",
        direction: useSampling ? void 0 : "DESC"
      }
    });
    const images = result.findImages.images || [];
    if (images.length < 2)
      return { items: await fetchRandomImages(2), ranks: [null, null] };
    const image1 = images[Math.floor(Math.random() * images.length)];
    const rating1 = image1.rating100 || 1;
    const matchWindow = images.length > 1 ? 10 : 20;
    const similar = images.filter((s) => s.id !== image1.id && Math.abs((s.rating100 || 1) - rating1) <= matchWindow);
    const image2 = similar.length > 0 ? similar[Math.floor(Math.random() * similar.length)] : images.filter((s) => s.id !== image1.id)[0];
    let ranks = [null, null];
    if (!useSampling && images.length > 0) {
      const sortedImages = [...images].sort((a, b) => (b.rating100 || 0) - (a.rating100 || 0));
      const rank1 = sortedImages.findIndex((img) => img.id === image1.id) + 1;
      const rank2 = sortedImages.findIndex((img) => img.id === image2.id) + 1;
      ranks = [rank1 || null, rank2 || null];
    }
    return { items: [image1, image2], ranks };
  }
  async function fetchRandomScenes(count = 2) {
    const sceneQuery = `
    query FindRandomScenes($filter: FindFilterType) {
      findScenes(filter: $filter) {
        scenes { ${SCENE_FRAGMENT} }
      }
    }
  `;
    const result = await graphqlQuery(sceneQuery, {
      filter: {
        per_page: 100,
        sort: "random"
      }
    });
    const allScenes = result?.findScenes?.scenes || [];
    if (allScenes.length < 2) {
      throw new Error("Not enough scenes for comparison.");
    }
    const shuffled = [...allScenes].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 2);
  }
  async function fetchAllScenesSorted() {
    const queryTemplate = `
    query FindAllScenes($filter: FindFilterType) {
      findScenes(filter: $filter) {
        scenes { ${SCENE_FRAGMENT} }
      }
    }
  `;
    const scenes = await fetchAllItems(queryTemplate, {
      filter: { sort: "rating100", direction: "DESC" }
    });
    return scenes.sort((a, b) => {
      const ratingDiff = (b.rating100 ?? 1) - (a.rating100 ?? 1);
      if (ratingDiff !== 0)
        return ratingDiff;
      const playCountDiff = (b.play_count || 0) - (a.play_count || 0);
      if (playCountDiff !== 0)
        return playCountDiff;
      const titleA = a.title?.toLowerCase() || "";
      const titleB = b.title?.toLowerCase() || "";
      return titleA.localeCompare(titleB);
    });
  }
  async function fetchSwissPairScenes() {
    const totalScenes = await fetchSceneCount();
    const config = getSceneSelectionConfig(totalScenes);
    let sceneMetadata = state.sceneMetadataCache;
    state.sceneMetadataRefreshCounter = (state.sceneMetadataRefreshCounter || 0) + 1;
    if (!sceneMetadata || state.sceneMetadataRefreshCounter > config.metadataRefreshInterval) {
      sceneMetadata = await fetchAllSceneMetadata();
      state.sceneMetadataCache = sceneMetadata;
      state.sceneMetadataRefreshCounter = 0;
    }
    if (sceneMetadata.length < 2) {
      return { items: await fetchRandomScenes(2), ranks: [null, null] };
    }
    const avgMatches = calculateAverageMatches(sceneMetadata.map((scene) => parsePerformerEloData(scene)));
    const weightedScenes = sceneMetadata.map((scene) => {
      const stats = parsePerformerEloData(scene);
      const rawMatches = stats.total_matches || 0;
      const cappedMatches = Math.min(rawMatches, config.lowMatchThreshold);
      const recencyWeight = getSceneRecencyWeight(scene);
      const baseWeight = Math.pow(recencyWeight, 3) + Math.random() * 0.01;
      const lowMatchBoost = getLowMatchBoost({ ...scene, total_matches: cappedMatches }, avgMatches);
      const distributionBoost = getMatchCountDistributionBoost(scene, sceneMetadata);
      const sessionPenalty = getSceneSessionPenalty(scene.id);
      const finalWeight = baseWeight * lowMatchBoost * distributionBoost * sessionPenalty;
      return {
        scene,
        weight: finalWeight,
        rating: scene.rating100 || 1,
        matches: rawMatches,
        recencyWeight
      };
    });
    weightedScenes.sort((a, b) => b.weight - a.weight);
    const seedWeights = weightedScenes.map((item) => item.weight);
    const seedItem = weightedRandomSelect(weightedScenes, seedWeights) || weightedScenes[0];
    const seedSceneMeta = seedItem.scene;
    const seedRating = seedSceneMeta.rating100 || 1;
    const seedMatches = parsePerformerEloData(seedSceneMeta).total_matches || 0;
    let ratingWindow = config.ratingWindowInitial;
    if (seedMatches > 20) {
      ratingWindow = config.ratingWindowMin;
    } else if (seedMatches > 10) {
      ratingWindow = config.ratingWindowInitial;
    } else if (seedMatches > 0) {
      ratingWindow = Math.min(config.ratingWindowMax, config.ratingWindowInitial + 15);
    } else {
      ratingWindow = config.ratingWindowMax;
    }
    const isSceneHardExcluded = (scene) => {
      const stats = parsePerformerEloData(scene);
      if (!stats.last_match)
        return false;
      const lastMatch = new Date(stats.last_match).getTime();
      if (isNaN(lastMatch))
        return false;
      const hoursSince = (Date.now() - lastMatch) / (1e3 * 60 * 60);
      return hoursSince < config.hardRepeatWindowHours;
    };
    function filterCandidates(pool, window2, allowHardRepeat = false) {
      return pool.filter((item) => {
        if (item.scene.id === seedSceneMeta.id)
          return false;
        if (isSceneOnCooldown(item.scene.id) || isSceneRecentlySelected(item.scene.id))
          return false;
        if (!allowHardRepeat && isSceneHardExcluded(item.scene))
          return false;
        return Math.abs(seedRating - item.rating) <= window2;
      });
    }
    let candidates = filterCandidates(weightedScenes, ratingWindow);
    if (candidates.length < 10) {
      candidates = filterCandidates(weightedScenes, ratingWindow * 3);
    }
    let inDrainMode = false;
    if (candidates.length < 2) {
      console.log("[Ascension] Scene pool exhausted within hard-repeat window; entering drain mode");
      candidates = filterCandidates(weightedScenes, ratingWindow * 3, true).map((item) => ({
        ...item,
        weight: item.weight * config.drainModeRepeatPenalty
      }));
      inDrainMode = true;
    }
    if (candidates.length < 2) {
      console.log("[Ascension] Scene pool exhausted; clearing session cooldown and re-sampling");
      state.recentlySelectedScenes = [];
      state.sessionSceneCounts = {};
      state.sceneMetadataRefreshCounter = config.metadataRefreshInterval + 1;
      sceneMetadata = await fetchAllSceneMetadata();
      state.sceneMetadataCache = sceneMetadata;
      state.sceneMetadataRefreshCounter = 0;
      const refreshedWeighted = sceneMetadata.map((scene) => {
        const stats = parsePerformerEloData(scene);
        const rawMatches = stats.total_matches || 0;
        const cappedMatches = Math.min(rawMatches, config.lowMatchThreshold);
        const recencyWeight = getSceneRecencyWeight(scene);
        const baseWeight = Math.pow(recencyWeight, 3) + Math.random() * 0.01;
        const lowMatchBoost = getLowMatchBoost({ ...scene, total_matches: cappedMatches }, avgMatches);
        const distributionBoost = getMatchCountDistributionBoost(scene, sceneMetadata);
        const finalWeight = baseWeight * lowMatchBoost * distributionBoost;
        return { scene, weight: finalWeight, rating: scene.rating100 || 1, matches: rawMatches };
      });
      refreshedWeighted.sort((a, b) => b.weight - a.weight);
      candidates = refreshedWeighted.filter((item) => {
        if (item.scene.id === seedSceneMeta.id)
          return false;
        return Math.abs(seedRating - item.rating) <= ratingWindow * 3;
      });
    }
    if (candidates.length === 0) {
      const fallback = weightedScenes.find((item) => item.scene.id !== seedSceneMeta.id);
      candidates = fallback ? [fallback] : weightedScenes.slice(1, 2);
      console.warn("[Ascension] Scene opponent selection fell back to last-resort");
    }
    candidates.sort((a, b) => b.weight - a.weight);
    const topCandidates = candidates.slice(0, 20);
    const candidateIds = [seedSceneMeta.id, ...topCandidates.map((c) => c.scene.id)];
    const fullScenes = await fetchScenesByIds(candidateIds);
    const seedFull = fullScenes.find((s) => s.id === seedSceneMeta.id) || seedSceneMeta;
    const candidatesWithSimilarity = topCandidates.map((item) => {
      const full = fullScenes.find((s) => s.id === item.scene.id);
      if (!full)
        return { ...item, similarity: 0 };
      const similarity = calculateSceneSimilarity(seedFull, full);
      const similarityPenalty = Math.max(config.maxSimilarityPenalty, 1 - similarity * config.similarityPenalty);
      return {
        ...item,
        weight: item.weight * similarityPenalty,
        similarity
      };
    });
    const opponentWeights = candidatesWithSimilarity.map((c) => c.weight);
    const opponentItem = weightedRandomSelect(candidatesWithSimilarity, opponentWeights);
    const opponentSceneMeta = opponentItem ? opponentItem.scene : candidatesWithSimilarity[0].scene;
    const seedScene = fullScenes.find((s) => s.id === seedSceneMeta.id) || seedSceneMeta;
    const opponentScene = fullScenes.find((s) => s.id === opponentSceneMeta.id) || opponentSceneMeta;
    trackSceneSelection(seedScene.id);
    trackSceneSelection(opponentScene.id);
    addToRecentlySelectedScenes(seedScene.id, config.recentCooldownSize);
    addToRecentlySelectedScenes(opponentScene.id, config.recentCooldownSize);
    return { items: [seedScene, opponentScene], ranks: [null, null] };
  }
  async function fetchSceneCount() {
    const result = await graphqlQuery(`query { findScenes(filter: { per_page: 0 }) { count } }`);
    return result.findScenes.count;
  }
  async function fetchGauntletPairScenes() {
    const result = await graphqlQuery(`query FindScenesByRating($filter: FindFilterType) {
    findScenes(filter: $filter) { scenes { ${SCENE_FRAGMENT} } }
  }`, { filter: { per_page: -1, sort: "rating100", direction: "DESC" } });
    const scenes = result.findScenes.scenes || [];
    state.totalItemsCount = scenes.length;
    if (scenes.length < 2)
      return { items: await fetchRandomScenes(2), ranks: [null, null], isVictory: false };
    return handleMatchmakingLogic(scenes, "scenes");
  }
  async function fetchChampionPairScenes() {
    const result = await graphqlQuery(`query FindScenesByRating($filter: FindFilterType) {
    findScenes(filter: $filter) { scenes { ${SCENE_FRAGMENT} } }
  }`, { filter: { per_page: -1, sort: "rating100", direction: "DESC" } });
    const scenes = result.findScenes.scenes || [];
    state.totalItemsCount = scenes.length;
    if (scenes.length < 2)
      return { items: await fetchRandomScenes(2), ranks: [null, null] };
    if (!state.gauntletChampion) {
      const shuffled = [...scenes].sort(() => Math.random() - 0.5);
      return { items: [shuffled[0], shuffled[1]], ranks: [null, null] };
    }
    return handleMatchmakingLogic(scenes, "scenes");
  }
  function canBattleByTier(tier1, tier2) {
    const restrictedTiers = ["S-Tier", "A-Tier"];
    if (restrictedTiers.includes(tier1) || restrictedTiers.includes(tier2)) {
      const allowed = ["S-Tier", "A-Tier", "B-Tier"];
      return allowed.includes(tier1) && allowed.includes(tier2);
    }
    return true;
  }
  function isPerformerRecentlySelected(performerId) {
    if (!state.recentlySelectedPerformers) {
      state.recentlySelectedPerformers = [];
    }
    return state.recentlySelectedPerformers.includes(performerId);
  }
  function isPerformerOnCooldown(performerId) {
    if (!state.recentlySelectedPerformers) {
      state.recentlySelectedPerformers = [];
    }
    return state.recentlySelectedPerformers.includes(performerId);
  }
  function addToRecentlySelected(performerId) {
    if (!state.recentlySelectedPerformers) {
      state.recentlySelectedPerformers = [];
    }
    state.recentlySelectedPerformers.push(performerId);
    if (state.recentlySelectedPerformers.length > RECENT_PERFORMER_COOLDOWN) {
      state.recentlySelectedPerformers.shift();
    }
  }
  function isSceneRecentlySelected(sceneId) {
    if (!state.recentlySelectedScenes) {
      state.recentlySelectedScenes = [];
    }
    return state.recentlySelectedScenes.includes(sceneId);
  }
  function isSceneOnCooldown(sceneId) {
    if (!state.recentlySelectedScenes) {
      state.recentlySelectedScenes = [];
    }
    return state.recentlySelectedScenes.includes(sceneId);
  }
  function addToRecentlySelectedScenes(sceneId, maxSize = 200) {
    if (!state.recentlySelectedScenes) {
      state.recentlySelectedScenes = [];
    }
    state.recentlySelectedScenes.push(sceneId);
    if (state.recentlySelectedScenes.length > maxSize) {
      state.recentlySelectedScenes.shift();
    }
  }
  function getSceneSessionPenalty(sceneId) {
    if (!state.sessionSceneCounts) {
      state.sessionSceneCounts = {};
    }
    const count = state.sessionSceneCounts[sceneId] || 0;
    if (count > 2)
      return 0.1;
    if (count > 1)
      return 0.3;
    if (count > 0)
      return 0.6;
    return 1;
  }
  function trackSceneSelection(sceneId) {
    if (!state.sessionSceneCounts) {
      state.sessionSceneCounts = {};
    }
    state.sessionSceneCounts[sceneId] = (state.sessionSceneCounts[sceneId] || 0) + 1;
    const keys = Object.keys(state.sessionSceneCounts);
    if (keys.length > MAX_SESSION_SCENE_COUNTS) {
      const sortedByCount = keys.sort((a, b) => state.sessionSceneCounts[a] - state.sessionSceneCounts[b]);
      const toRemove = Math.ceil(keys.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        delete state.sessionSceneCounts[sortedByCount[i]];
      }
    }
  }
  function getTierFilteredPerformers(allPerformers, focusTier, tierPool) {
    if (focusTier === "any")
      return allPerformers;
    if (focusTier === "newcomers") {
      return allPerformers.filter((p) => {
        const stats = parsePerformerEloData(p);
        return stats.total_matches < 6;
      });
    }
    return allPerformers.filter((p) => {
      const tier = getRatingTier(p, tierPool);
      return tier === focusTier;
    });
  }
  function updateTierFocus(performers, tierPool) {
    state.tierRotation.matchCount = (state.tierRotation.matchCount || 0) + 1;
    const matchesUntilChange = 7 + Math.floor(Math.random() * 13);
    if (state.tierRotation.sessionMatches >= matchesUntilChange) {
      const tierMap = /* @__PURE__ */ new Map();
      performers.forEach((p) => {
        const tier = getRatingTier(p, tierPool);
        if (!tierMap.has(tier)) {
          tierMap.set(tier, []);
        }
        tierMap.get(tier).push(p);
      });
      const cycle = state.tierRotation.cycle;
      const startIndex = (state.tierRotation.currentIndex + 1) % cycle.length;
      let selectedTier = "any";
      let examined = 0;
      while (examined < cycle.length) {
        const idx = (startIndex + examined) % cycle.length;
        const tier = cycle[idx];
        console.log(`[Ascension] Rotation examining tier: ${tier} (cycle index ${idx})`);
        if (tier === "any") {
          selectedTier = "any";
          state.tierRotation.currentIndex = idx;
          console.log(`[Ascension] Selected tier: ${selectedTier}`);
          break;
        }
        let tierPerformers;
        if (tier === "newcomers") {
          tierPerformers = performers.filter((p) => {
            const stats = parsePerformerEloData(p);
            return stats.total_matches < 6;
          });
        } else {
          tierPerformers = tierMap.get(tier) || [];
        }
        console.log(`[Ascension] Tier ${tier}: ${tierPerformers.length} performers`);
        if (tierPerformers.length >= 20) {
          const totalWeight = tierPerformers.reduce((sum, p) => sum + getRecencyWeight(p), 0);
          const avgRecencyWeight = tierPerformers.length > 0 ? totalWeight / tierPerformers.length : 0;
          console.log(`[Ascension] Tier ${tier}: avg recency weight: ${avgRecencyWeight.toFixed(2)}`);
          if (avgRecencyWeight >= 0.8) {
            selectedTier = tier;
            state.tierRotation.currentIndex = idx;
            console.log(`[Ascension] Selected tier: ${selectedTier}`);
            break;
          } else {
            console.log(`[Ascension] Tier ${tier} rejected - avg recency weight ${avgRecencyWeight.toFixed(2)} < 0.80`);
          }
        } else {
          console.log(`[Ascension] Tier ${tier} rejected - not enough performers (${tierPerformers.length} < 20)`);
        }
        examined++;
      }
      state.tierRotation.focusTier = selectedTier;
      state.tierRotation.sessionMatches = 0;
      state.tierRotation.lastSeen[selectedTier] = Date.now();
    }
    state.tierRotation.sessionMatches++;
    return state.tierRotation.focusTier || "any";
  }
  function applyTemporaryWeightBoost(performers) {
    console.log("[Ascension] Applying temporary weight boost to increase performer pool");
    return performers.map((p) => {
      const currentWeight = p.weight || 0;
      const boostedWeight = Math.max(1, currentWeight + 2);
      return {
        ...p,
        boosted: true,
        originalWeight: currentWeight,
        weight: boostedWeight
      };
    });
  }
  async function fetchSwissPairPerformers() {
    if (!state.sampleCounter)
      state.sampleCounter = 0;
    state.sampleCounter++;
    const shouldRefreshSample = state.sampleCounter > 50;
    if (shouldRefreshSample) {
      state.sampleCounter = 0;
      console.log("[Ascension] Refreshing performer sample pool");
    }
    const performerFilter = getPerformerFilter(state.cachedUrlFilter, state.selectedGenders);
    const countQuery = `query CountPerformers($performer_filter: PerformerFilterType) {
    findPerformers(performer_filter: $performer_filter, filter: { per_page: 0 }) { count }
  }`;
    const countResult = await graphqlQuery(countQuery, { performer_filter: performerFilter });
    const totalPerformers = countResult.findPerformers.count;
    const query = `query FindPerformersByRating($performer_filter: PerformerFilterType, $filter: FindFilterType) {
    findPerformers(performer_filter: $performer_filter, filter: $filter) {
      performers { ${PERFORMER_FRAGMENT} }
    }
  }`;
    const useRandomFetch = Math.random() < 0.05;
    const effectiveSort = useRandomFetch ? "random" : "updated_at";
    const effectiveDirection = useRandomFetch ? "DESC" : "ASC";
    const result = await graphqlQuery(query, {
      performer_filter: performerFilter,
      filter: {
        per_page: useRandomFetch ? 200 : 800,
        sort: effectiveSort,
        direction: effectiveDirection
      }
    });
    const performers = result.findPerformers.performers || [];
    state.totalItemsCount = totalPerformers;
    if (shouldRefreshSample || !state.globalPerformerPool || state.globalPerformerPool.length === 0) {
      try {
        state.globalPerformerPool = await fetchGlobalPerformerRatings();
        console.log(`[Ascension] Loaded global performer pool: ${state.globalPerformerPool.length} performers`);
      } catch (e) {
        console.warn("[Ascension] Failed to load global performer pool, falling back to local pool for tiers", e);
        state.globalPerformerPool = performers;
      }
    }
    const tierPool = state.globalPerformerPool && state.globalPerformerPool.length > 0 ? state.globalPerformerPool : performers;
    const logMatch = (type, p1, p2, w1, w2, color) => {
      const r1 = ((p1.rating100 || 0) / 10).toFixed(1);
      const r2 = ((p2.rating100 || 0) / 10).toFixed(1);
      console.log(
        `%c[Ascension] ${type}: %c${p1.name || "???"} %c(w:${w1.toFixed(2)})%c [${r1}] %cvs %c${p2.name || "???"} %c(w:${w2.toFixed(2)})%c [${r2}]`,
        "color: #1cb4d6; font-weight: bold;",
        `color: ${color}; font-weight: bold;`,
        "color: #FF69B4; font-weight: bold;",
        "color: #1cb4d6;",
        "color: #888;",
        `color: ${color}; font-weight: bold;`,
        "color: #FF69B4; font-weight: bold;",
        "color: #1cb4d6;"
      );
    };
    async function performWeightedSelection(sampledPerformers, targetFocusTier) {
      const avgMatches = calculateAverageMatches(sampledPerformers);
      let tierFilteredPerformers = sampledPerformers;
      if (targetFocusTier === "custom") {
        tierFilteredPerformers = sampledPerformers.filter((p) => performerMatchesSelectedTiers(p, tierPool));
      } else if (targetFocusTier !== "any") {
        tierFilteredPerformers = getTierFilteredPerformers(sampledPerformers, targetFocusTier, tierPool);
      }
      const weightMap = /* @__PURE__ */ new Map();
      const eligiblePerformers = [];
      const backupPerformers = [];
      for (const p of tierFilteredPerformers) {
        const cacheKey = `${p.id}-${p.last_match || "null"}`;
        let weightData;
        if (weightMap.has(cacheKey)) {
          weightData = weightMap.get(cacheKey);
        } else {
          const stats2 = parsePerformerEloData(p);
          const rawMatches = stats2.total_matches || 0;
          const cappedMatches = Math.min(rawMatches, 10);
          const baseWeight = Math.pow(getRecencyWeight(p), 3) + Math.random() * 0.01;
          const lowMatchBoost = getLowMatchBoost({ ...p, total_matches: cappedMatches }, avgMatches);
          const matchDistributionBoost = getMatchCountDistributionBoost(p, sampledPerformers);
          const sessionMatchPenalty = getSessionMatchPenalty(p.id);
          const finalWeight = baseWeight * lowMatchBoost * matchDistributionBoost * sessionMatchPenalty;
          weightData = {
            p,
            weight: finalWeight,
            rating: p.rating100 || 1,
            matches: rawMatches,
            cappedMatches
          };
          weightMap.set(cacheKey, weightData);
        }
        const stats = parsePerformerEloData(weightData.p);
        if (targetFocusTier === "newcomers") {
          if (weightData.matches < 6) {
            if (!isPerformerOnCooldown(weightData.p.id) && !isPerformerRecentlySelected(weightData.p.id)) {
              eligiblePerformers.push(weightData);
            }
          }
          backupPerformers.push(weightData);
        } else {
          const isUnrated = stats.total_matches === 0;
          const isHighWeight = weightData.weight > 1;
          const isUndermatched = weightData.matches > 0 && weightData.matches < avgMatches * 0.2;
          if (targetFocusTier === "any" || targetFocusTier === "custom") {
            backupPerformers.push(weightData);
          }
          if (isUnrated || isHighWeight || isUndermatched) {
            if (!isPerformerOnCooldown(weightData.p.id) && !isPerformerRecentlySelected(weightData.p.id)) {
              eligiblePerformers.push(weightData);
            }
          }
        }
      }
      if ((targetFocusTier === "any" || targetFocusTier === "custom") && eligiblePerformers.length < 2 && backupPerformers.length >= 2) {
        const availablePerformers = backupPerformers.filter((item) => !isPerformerOnCooldown(item.p.id) && !isPerformerRecentlySelected(item.p.id)).sort((a, b) => b.weight - a.weight);
        if (availablePerformers.length >= 2) {
          eligiblePerformers.push(...availablePerformers.slice(0, Math.min(10, availablePerformers.length)));
        }
      }
      if (targetFocusTier === "newcomers" && eligiblePerformers.length < 2 && backupPerformers.length >= 2) {
        const availablePerformers = backupPerformers.filter((item) => item.matches < 6 && !isPerformerOnCooldown(item.p.id) && !isPerformerRecentlySelected(item.p.id)).sort((a, b) => b.weight - a.weight);
        if (availablePerformers.length >= 2) {
          eligiblePerformers.push(...availablePerformers.slice(0, Math.min(10, availablePerformers.length)));
        }
      }
      eligiblePerformers.sort((a, b) => b.weight - a.weight);
      if (eligiblePerformers.length < 2) {
        console.log(`[Ascension] Not enough eligible performers (${eligiblePerformers.length}) in tier context '${targetFocusTier}' after weighting/filtering.`);
        return null;
      }
      let seed;
      const weights = eligiblePerformers.map((item) => item.weight);
      const selected = weightedRandomSelect(eligiblePerformers, weights);
      seed = selected || eligiblePerformers[0];
      if (seed && seed.p) {
        trackPerformerSelection(seed.p.id);
        addToRecentlySelected(seed.p.id);
      }
      const tier1 = getRatingTier(seed.p, tierPool);
      const percentileMap = buildPercentileMap(tierPool);
      const seedPercentile = percentileMap.get(seed.p.id) ?? 50;
      if (targetFocusTier === "custom") {
        const selectedLetterTiers = state.selectedTiers.filter((t) => t !== "newcomers" && t !== "any");
        const otherSelectedTiers = selectedLetterTiers.filter((t) => t !== tier1);
        if (otherSelectedTiers.length > 0) {
          const ratingWindow = getCustomTierRatingWindow();
          let crossTierOpponents = eligiblePerformers.filter((item) => {
            if (item.p.id === seed.p.id)
              return false;
            const itemTier = getRatingTier(item.p, tierPool);
            if (!otherSelectedTiers.includes(itemTier))
              return false;
            if (!canBattleInSelectedTiers(tier1, itemTier))
              return false;
            if (isPerformerOnCooldown(item.p.id) || isPerformerRecentlySelected(item.p.id))
              return false;
            const ratingDiff = Math.abs(seed.rating - item.rating);
            return ratingDiff <= ratingWindow;
          });
          if (crossTierOpponents.length < 3) {
            const relaxedWindow = ratingWindow * 1.5;
            crossTierOpponents = eligiblePerformers.filter((item) => {
              if (item.p.id === seed.p.id)
                return false;
              const itemTier = getRatingTier(item.p, tierPool);
              if (!otherSelectedTiers.includes(itemTier))
                return false;
              if (!canBattleInSelectedTiers(tier1, itemTier))
                return false;
              if (isPerformerOnCooldown(item.p.id) || isPerformerRecentlySelected(item.p.id))
                return false;
              const ratingDiff = Math.abs(seed.rating - item.rating);
              return ratingDiff <= relaxedWindow;
            });
          }
          if (crossTierOpponents.length > 0) {
            const ctWeights = crossTierOpponents.map((candidate) => {
              const itemTier = getRatingTier(candidate.p, tierPool);
              return candidate.weight * getCrossTierWeightMultiplier(tier1, itemTier);
            });
            const crossTierOpponentItem = weightedRandomSelect(crossTierOpponents, ctWeights);
            if (crossTierOpponentItem) {
              logMatch(
                "Custom Cross-Tier",
                seed.p,
                crossTierOpponentItem.p,
                seed.weight,
                crossTierOpponentItem.weight * getCrossTierWeightMultiplier(tier1, getRatingTier(crossTierOpponentItem.p, tierPool)),
                "#E91E63"
              );
              const rank1 = getPerformerRankInList(seed.p, sampledPerformers);
              const rank2 = getPerformerRankInList(crossTierOpponentItem.p, sampledPerformers);
              return { items: [seed.p, crossTierOpponentItem.p], ranks: [rank1, rank2] };
            }
          }
        }
      }
      if (targetFocusTier !== "custom" && shouldForceCrossTierMatch()) {
        const crossTierCandidates = eligiblePerformers.filter(
          (item) => item.p.id !== seed.p.id && (item.p.rating100 || 1) >= seed.rating + 20 && canBattleByTier(tier1, getRatingTier(item.p, tierPool)) && !isPerformerOnCooldown(item.p.id) && !isPerformerRecentlySelected(item.p.id)
        );
        if (crossTierCandidates.length >= 10) {
          const crossTierWeights = crossTierCandidates.map((candidate) => candidate.weight);
          const crossTierOpponentItem = weightedRandomSelect(crossTierCandidates, crossTierWeights);
          if (crossTierOpponentItem) {
            logMatch(
              "CROSS-TIER",
              seed.p,
              crossTierOpponentItem.p,
              seed.weight,
              crossTierOpponentItem.weight,
              "#E91E63"
            );
            const rank1 = getPerformerRankInList(seed.p, sampledPerformers);
            const rank2 = getPerformerRankInList(crossTierOpponentItem.p, sampledPerformers);
            return { items: [seed.p, crossTierOpponentItem.p], ranks: [rank1, rank2] };
          }
        }
      }
      const standardWindow = getTierPercentileWindow(tier1) * getSelectedTierWindowMultiplier();
      const validOpponents = eligiblePerformers.filter((item) => {
        if (item.p.id === seed.p.id)
          return false;
        const itemPercentile = percentileMap.get(item.p.id) ?? 50;
        if (Math.abs(seedPercentile - itemPercentile) > standardWindow)
          return false;
        if (!canBattleInSelectedTiers(tier1, getRatingTier(item.p, tierPool)))
          return false;
        if (isPerformerOnCooldown(item.p.id) || isPerformerRecentlySelected(item.p.id))
          return false;
        return true;
      });
      if (validOpponents.length > 0) {
        const weights_op = validOpponents.map((opponent) => opponent.weight);
        const opponentItem = weightedRandomSelect(validOpponents, weights_op);
        if (opponentItem) {
          logMatch("Match", seed.p, opponentItem.p, seed.weight, opponentItem.weight, "#2196F3");
          const rank1 = getPerformerRankInList(seed.p, sampledPerformers);
          const rank2 = getPerformerRankInList(opponentItem.p, sampledPerformers);
          return { items: [seed.p, opponentItem.p], ranks: [rank1, rank2] };
        }
      }
      if (targetFocusTier === "any") {
        const adjacentTiers = getAdjacentTiers(tier1);
        const adjacentWindow = getTierPercentileWindow(tier1) * 1.25;
        const adjacentOpponents = eligiblePerformers.filter((item) => {
          if (item.p.id === seed.p.id)
            return false;
          const itemTier = getRatingTier(item.p, tierPool);
          if (!adjacentTiers.includes(itemTier))
            return false;
          const itemPercentile = percentileMap.get(item.p.id) ?? 50;
          if (Math.abs(seedPercentile - itemPercentile) > adjacentWindow)
            return false;
          if (!canBattleByTier(tier1, itemTier))
            return false;
          if (isPerformerOnCooldown(item.p.id) || isPerformerRecentlySelected(item.p.id))
            return false;
          return true;
        });
        if (adjacentOpponents.length > 0) {
          const adjacentWeights = adjacentOpponents.map((opponent) => opponent.weight);
          const opponentItem = weightedRandomSelect(adjacentOpponents, adjacentWeights);
          if (opponentItem) {
            logMatch("Adjacent-Tier", seed.p, opponentItem.p, seed.weight, opponentItem.weight, "#9C27B0");
            const rank1 = getPerformerRankInList(seed.p, sampledPerformers);
            const rank2 = getPerformerRankInList(opponentItem.p, sampledPerformers);
            return { items: [seed.p, opponentItem.p], ranks: [rank1, rank2] };
          }
        }
      }
      const looseWindow = getTierPercentileWindow(tier1) * 1.5 * getSelectedTierWindowMultiplier();
      const looseRangeOpponents = eligiblePerformers.filter(
        (item) => item.p.id !== seed.p.id && Math.abs(seedPercentile - (percentileMap.get(item.p.id) ?? 50)) <= looseWindow && !isPerformerOnCooldown(item.p.id) && !isPerformerRecentlySelected(item.p.id) && canBattleInSelectedTiers(tier1, getRatingTier(item.p, tierPool))
      );
      if (looseRangeOpponents.length > 0) {
        const looseWeights = looseRangeOpponents.map((opponent) => opponent.weight);
        const opponentItem = weightedRandomSelect(looseRangeOpponents, looseWeights);
        if (opponentItem) {
          logMatch("Loose Match", seed.p, opponentItem.p, seed.weight, opponentItem.weight, "#FF9800");
          const rank1 = getPerformerRankInList(seed.p, sampledPerformers);
          const rank2 = getPerformerRankInList(opponentItem.p, sampledPerformers);
          return { items: [seed.p, opponentItem.p], ranks: [rank1, rank2] };
        }
      }
      const fallbackOpponents = eligiblePerformers.filter(
        (item) => item.p.id !== seed.p.id && !isPerformerOnCooldown(item.p.id) && !isPerformerRecentlySelected(item.p.id) && canBattleInSelectedTiers(tier1, getRatingTier(item.p, tierPool))
      );
      if (fallbackOpponents.length > 0) {
        const fallbackWeights = fallbackOpponents.map((opponent) => opponent.weight);
        const fallbackItem = weightedRandomSelect(fallbackOpponents, fallbackWeights);
        if (fallbackItem && fallbackItem.p.id !== seed.p.id) {
          logMatch("FALLBACK-DIFF", seed.p, fallbackItem.p, seed.weight, fallbackItem.weight, "#F44336");
          const rank1 = getPerformerRankInList(seed.p, sampledPerformers);
          const rank2 = getPerformerRankInList(fallbackItem.p, sampledPerformers);
          return { items: [seed.p, fallbackItem.p], ranks: [rank1, rank2] };
        }
      }
      console.warn(`[Ascension] Found eligible performers for tier context '${targetFocusTier}' but failed to pair them.`);
      return null;
    }
    const customTierMode = isCustomTierMode();
    let initialFocusTier;
    let tierColor;
    if (customTierMode) {
      initialFocusTier = "custom";
      tierColor = "#00ff00";
      console.log(
        `%c[Ascension] Tier Filter active: ${state.selectedTiers.join(", ")}`,
        "color: #00ff00; font-weight: bold;"
      );
    } else {
      initialFocusTier = updateTierFocus(performers, tierPool);
      tierColor = initialFocusTier === "newcomers" || initialFocusTier === "any" ? "#00ff00" : getTierColor(initialFocusTier);
      console.log(
        `%c[Ascension] Tier Selection: ${initialFocusTier}`,
        `color: ${tierColor}; font-weight: bold;`
      );
    }
    let pairingResult = await performWeightedSelection(performers, initialFocusTier);
    if (!pairingResult && initialFocusTier !== "any") {
      console.warn(`[Ascension] Failed to create match with ${customTierMode ? "tier filter" : "tier focus"} '${customTierMode ? state.selectedTiers.join(", ") : initialFocusTier}'. Attempting fallback to 'any' tier.`);
      pairingResult = await performWeightedSelection(performers, "any");
      if (pairingResult) {
        console.log(`[Ascension] Successfully created match using 'any' tier fallback.`);
      }
    }
    if (!pairingResult) {
      console.warn(`[Ascension] Failed to create match even with 'any' tier fallback. Applying temporary weight boost.`);
      const boostedPerformers = applyTemporaryWeightBoost(performers);
      const boostedPairingResult = await performWeightedSelection(boostedPerformers, "any");
      if (boostedPairingResult) {
        console.log("[Ascension] Successfully created match using temporary weight boost.");
        return boostedPairingResult;
      }
      console.warn("[Ascension] Temporary weight boost failed. Using basic random fallback.");
      return { items: await fetchRandomPerformers(2), ranks: [null, null] };
    }
    return pairingResult;
  }
  function getMatchCountDistributionBoost(performer, allPerformers) {
    const stats = parsePerformerEloData(performer);
    const targetMatches = stats.total_matches || 0;
    let fewerCount = 0;
    const totalPerformers = allPerformers.length;
    for (const p of allPerformers) {
      const s = parsePerformerEloData(p);
      const matches = s.total_matches || 0;
      if (matches < targetMatches) {
        fewerCount++;
      }
    }
    const percentile = fewerCount / totalPerformers * 100;
    if (percentile < 10)
      return 1.5;
    else if (percentile < 25)
      return 1.3;
    else if (percentile < 50)
      return 1.1;
    else if (percentile > 90)
      return 0.7;
    return 1;
  }
  function getSessionMatchPenalty(performerId) {
    if (!state.sessionMatchCounts) {
      state.sessionMatchCounts = {};
    }
    const sessionCount = state.sessionMatchCounts[performerId] || 0;
    if (sessionCount > 2)
      return 0.1;
    if (sessionCount > 1)
      return 0.3;
    if (sessionCount > 0)
      return 0.6;
    return 1;
  }
  function trackPerformerSelection(performerId) {
    if (!state.sessionMatchCounts) {
      state.sessionMatchCounts = {};
    }
    state.sessionMatchCounts[performerId] = (state.sessionMatchCounts[performerId] || 0) + 1;
    const keys = Object.keys(state.sessionMatchCounts);
    if (keys.length > MAX_SESSION_MATCH_COUNTS) {
      const sortedByCount = keys.sort((a, b) => state.sessionMatchCounts[a] - state.sessionMatchCounts[b]);
      const toRemove = Math.ceil(keys.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        delete state.sessionMatchCounts[sortedByCount[i]];
      }
    }
  }
  function getPerformerRankInList(performer, allPerformers) {
    if (!performer || performer.rating100 === null || performer.rating100 === 1)
      return null;
    const targetRating = performer.rating100 || 0;
    let rank = 1;
    for (const p of allPerformers) {
      if (p.id !== performer.id && p.rating100 !== null && p.rating100 > 1 && (p.rating100 || 0) > targetRating) {
        rank++;
      }
    }
    return rank;
  }
  function buildPercentileMap(allPerformers) {
    if (!Array.isArray(allPerformers) || allPerformers.length === 0)
      return /* @__PURE__ */ new Map();
    const scored = allPerformers.map((p) => ({ p, score: calculateBattleScore(p) }));
    scored.sort((a, b) => b.score - a.score);
    const total = scored.length;
    const map = /* @__PURE__ */ new Map();
    scored.forEach((item, index) => {
      map.set(item.p.id, index / total * 100);
    });
    return map;
  }
  async function fetchGauntletPairPerformers() {
    const gender = state.gauntletChampion?.gender || state.selectedGenders[0];
    const performerFilter = getPerformerFilter(state.cachedUrlFilter, [gender]);
    const result = await graphqlQuery(`query FindPerformersByRating($performer_filter: PerformerFilterType, $filter: FindFilterType) {
    findPerformers(performer_filter: $performer_filter, filter: $filter) { count, performers { ${PERFORMER_FRAGMENT} } }
  }`, { performer_filter: performerFilter, filter: { per_page: -1, sort: "rating", direction: "DESC" } });
    const performers = result.findPerformers.performers || [];
    state.totalItemsCount = performers.length;
    if (!state.globalPerformerPool || state.globalPerformerPool.length === 0) {
      try {
        state.globalPerformerPool = await fetchGlobalPerformerRatings();
        console.log(`[Ascension] Loaded global performer pool: ${state.globalPerformerPool.length} performers`);
      } catch (e) {
        console.warn("[Ascension] Failed to load global performer pool, falling back to local pool for tiers", e);
        state.globalPerformerPool = performers;
      }
    }
    if (performers.length < 2)
      return { items: await fetchRandomPerformers(2), ranks: [null, null], isVictory: false };
    return handleMatchmakingLogic(performers, "performers");
  }
  async function fetchChampionPairPerformers() {
    const performerFilter = getPerformerFilter(state.cachedUrlFilter, state.selectedGenders);
    const result = await graphqlQuery(`query FindPerformersByRating($performer_filter: PerformerFilterType, $filter: FindFilterType) {
    findPerformers(performer_filter: $performer_filter, filter: $filter) { performers { ${PERFORMER_FRAGMENT} } }
  }`, { performer_filter: performerFilter, filter: { per_page: -1, sort: "rating", direction: "DESC" } });
    const performers = result.findPerformers.performers || [];
    state.totalItemsCount = performers.length;
    if (!state.globalPerformerPool || state.globalPerformerPool.length === 0) {
      try {
        state.globalPerformerPool = await fetchGlobalPerformerRatings();
        console.log(`[Ascension] Loaded global performer pool: ${state.globalPerformerPool.length} performers`);
      } catch (e) {
        console.warn("[Ascension] Failed to load global performer pool, falling back to local pool for tiers", e);
        state.globalPerformerPool = performers;
      }
    }
    if (performers.length < 2)
      return { items: await fetchRandomPerformers(2), ranks: [null, null] };
    if (!state.gauntletChampion) {
      const shuffled = [...performers].sort(() => Math.random() - 0.5);
      return { items: [shuffled[0], shuffled[1]], ranks: [null, null] };
    }
    return handleMatchmakingLogic(performers, "performers");
  }
  function handleMatchmakingLogic(list, type) {
    if (!state.totalItemsCount || state.totalItemsCount !== list.length) {
      state.totalItemsCount = list.length;
    }
    if (state.gauntletChampion) {
      const freshChampion = list.find((i) => i.id === state.gauntletChampion.id);
      if (freshChampion)
        state.gauntletChampion = freshChampion;
    }
    if (state.gauntletFallingItem) {
      const freshFalling = list.find((i) => i.id === state.gauntletFallingItem.id);
      if (freshFalling)
        state.gauntletFallingItem = freshFalling;
    }
    if (!state.gauntletChampion) {
      console.warn("[Ascension] No champion selected, picking a random starter.");
      const randomStarter = list[Math.floor(Math.random() * list.length)];
      const starterRating = randomStarter.rating100 || 1;
      const isStarterUnrated = starterRating <= 1;
      let candidate = list.find((i) => {
        const candidateRating = i.rating100 || 1;
        const isCandidateUnrated = candidateRating <= 1;
        if (isStarterUnrated && isCandidateUnrated)
          return false;
        return i.id !== randomStarter.id;
      });
      if (state.seenPairs && state.seenPairs.size > 0) {
        const candidates = list.filter((i) => {
          const candidateRating = i.rating100 || 1;
          const isCandidateUnrated = candidateRating <= 1;
          if (isStarterUnrated && isCandidateUnrated)
            return false;
          return i.id !== randomStarter.id && !hasBeenRecentlyPaired(randomStarter.id, i.id);
        });
        if (candidates.length > 0) {
          candidate = candidates[Math.floor(Math.random() * candidates.length)];
        }
      }
      if (!candidate) {
        candidate = list.find((i) => i.id !== randomStarter.id);
      }
      return {
        items: [randomStarter, candidate],
        ranks: [null, null],
        isVictory: false
      };
    }
    if (state.currentMode === "gauntlet" && state.gauntletFalling && state.gauntletFallingItem) {
      const fallingItem = state.gauntletFallingItem;
      const fallingRating = fallingItem.rating100 || 1;
      const isFallingUnrated = fallingRating <= 1;
      let potentialOpponents2 = list.filter((item) => {
        const itemRating = item.rating100 || 1;
        const isItemUnrated = itemRating <= 1;
        if (isFallingUnrated && isItemUnrated)
          return false;
        return item.id !== fallingItem.id && itemRating < fallingRating && !state.gauntletDefeated.includes(item.id) && !state.skippedIds.includes(item.id) && !hasBeenRecentlyPaired(fallingItem.id, item.id);
      });
      potentialOpponents2.sort((a, b) => (b.rating100 || 1) - (a.rating100 || 1));
      if (potentialOpponents2.length === 0) {
        const lowestRank = list.length;
        return {
          items: [fallingItem],
          placementRank: lowestRank,
          placementRating: fallingItem.rating100 || 1,
          isPlacement: true
        };
      }
      const nextOpponent2 = potentialOpponents2[0];
      trackSeenPair(fallingItem.id, nextOpponent2.id);
      const fallingRank = list.findIndex((i) => i.id === fallingItem.id) + 1;
      const opponentRank = list.findIndex((i) => i.id === nextOpponent2.id) + 1;
      return {
        items: [fallingItem, nextOpponent2],
        ranks: [fallingRank, opponentRank],
        isVictory: false
      };
    }
    const champIdx = list.findIndex((i) => i.id === state.gauntletChampion.id);
    let potentialOpponents = list.filter(
      (item, idx) => idx < champIdx && !state.gauntletDefeated.includes(item.id) && !state.skippedIds.includes(item.id) && !hasBeenRecentlyPaired(state.gauntletChampion.id, item.id)
    );
    if (potentialOpponents.length === 0) {
      if (state.skippedIds.length > 0) {
        state.skippedIds = [];
        potentialOpponents = list.filter(
          (item, idx) => idx < champIdx && !state.gauntletDefeated.includes(item.id) && !hasBeenRecentlyPaired(state.gauntletChampion.id, item.id)
        );
      }
      if (state.currentMode === "champion" && potentialOpponents.length === 0) {
        state.gauntletDefeated = [];
        const belowOpponents = list.filter(
          (item, idx) => idx > champIdx && item.id !== state.gauntletChampion.id && !state.skippedIds.includes(item.id) && !hasBeenRecentlyPaired(state.gauntletChampion.id, item.id)
        );
        if (belowOpponents.length > 0) {
          const proximityWindow2 = Math.min(5, belowOpponents.length);
          let filteredOpponents2 = belowOpponents.slice(0, proximityWindow2).filter(
            (opponent) => !hasBeenRecentlyPaired(state.gauntletChampion.id, opponent.id)
          );
          if (filteredOpponents2.length === 0) {
            filteredOpponents2 = belowOpponents.slice(0, proximityWindow2);
          }
          const randomIdx2 = Math.floor(Math.random() * filteredOpponents2.length);
          const nextOpponent2 = filteredOpponents2[randomIdx2];
          trackSeenPair(state.gauntletChampion.id, nextOpponent2.id);
          capSkippedIds();
          return {
            items: [state.gauntletChampion, nextOpponent2],
            ranks: [champIdx + 1, list.indexOf(nextOpponent2) + 1],
            isVictory: false
          };
        }
        const fallback = list.find((i) => i.id !== state.gauntletChampion.id);
        if (fallback) {
          return {
            items: [state.gauntletChampion, fallback],
            ranks: [champIdx + 1, list.indexOf(fallback) + 1],
            isVictory: false
          };
        }
      }
      return { items: [state.gauntletChampion], ranks: [1], isVictory: true };
    }
    const proximityWindow = Math.min(5, potentialOpponents.length);
    let filteredOpponents = potentialOpponents.slice(-proximityWindow).filter(
      (opponent) => !hasBeenRecentlyPaired(state.gauntletChampion.id, opponent.id)
    );
    if (filteredOpponents.length === 0) {
      filteredOpponents = potentialOpponents.slice(-proximityWindow);
    }
    const randomIdx = Math.floor(Math.random() * filteredOpponents.length);
    const nextOpponent = filteredOpponents[randomIdx];
    trackSeenPair(state.gauntletChampion.id, nextOpponent.id);
    capSkippedIds();
    return {
      items: [state.gauntletChampion, nextOpponent],
      ranks: [champIdx + 1, list.indexOf(nextOpponent) + 1],
      isVictory: false
    };
  }
  function trackSeenPair(id1, id2) {
    if (!state.seenPairs) {
      state.seenPairs = /* @__PURE__ */ new Set();
    }
    const pairKey = [id1, id2].sort().join("-");
    state.seenPairs.add(pairKey);
    while (state.seenPairs.size > MAX_SEEN_PAIRS) {
      const [first] = state.seenPairs;
      state.seenPairs.delete(first);
    }
  }
  function capSkippedIds() {
    if (!state.skippedIds) {
      state.skippedIds = [];
    }
    while (state.skippedIds.length > MAX_SKIPPED_IDS) {
      state.skippedIds.shift();
    }
  }
  function hasBeenRecentlyPaired(id1, id2) {
    if (!state.seenPairs)
      return false;
    const pairKey = [id1, id2].sort().join("-");
    return state.seenPairs.has(pairKey);
  }
  var MAX_SEEN_PAIRS, MAX_SKIPPED_IDS, MAX_SESSION_MATCH_COUNTS, MAX_SESSION_SCENE_COUNTS, TIER_ORDER, RECENT_PERFORMER_COOLDOWN;
  var init_battle_engine = __esm({
    "battle-engine.js"() {
      init_api_client();
      init_math_utils();
      init_parsers();
      init_state();
      init_ui_manager();
      init_gauntlet_selection();
      init_match_handler();
      init_ui_swipe();
      init_rating_utils();
      MAX_SEEN_PAIRS = 500;
      MAX_SKIPPED_IDS = 100;
      MAX_SESSION_MATCH_COUNTS = 500;
      MAX_SESSION_SCENE_COUNTS = 1e3;
      TIER_ORDER = ["S-Tier", "A-Tier", "B-Tier", "C-Tier", "D-Tier", "F-Tier"];
      RECENT_PERFORMER_COOLDOWN = 50;
    }
  });

  // ui-stats.js
  var ui_stats_exports = {};
  __export(ui_stats_exports, {
    attachNameTooltips: () => attachNameTooltips,
    createStatsModalContent: () => createStatsModalContent,
    generateBarGroups: () => generateBarGroups,
    generateStatTables: () => generateStatTables,
    openStatsModal: () => openStatsModal,
    preloadStatsModal: () => preloadStatsModal
  });
  function getFlagEmoji(countryCode) {
    if (!countryCode)
      return "";
    return COUNTRY_FLAGS[countryCode.toUpperCase()] || "\u{1F3F3}\uFE0F";
  }
  function getGenderEmoji(gender) {
    switch (gender?.toLowerCase()) {
      case "male":
        return "\u2642\uFE0F";
      case "female":
        return "\u2640\uFE0F";
      case "non-binary":
      case "other":
        return "\u26A7\uFE0F";
      default:
        return "";
    }
  }
  function formatWeight(weight) {
    if (weight === void 0 || weight === null)
      return "N/A\u2690";
    return (weight / 10).toFixed(1);
  }
  function calculateTimeUntilFull(performer) {
    if (!performer.last_match || performer.weight >= 1e3)
      return 0;
    const lastMatchDate = new Date(performer.last_match);
    const msSince = Date.now() - lastMatchDate.getTime();
    const hoursSince = msSince / (1e3 * 60 * 60);
    const rechargeRatePerHour = 1e3 / 12;
    const recovered = hoursSince * rechargeRatePerHour;
    const currentWeight = Math.min(1e3, (performer.weight || 0) + recovered);
    if (currentWeight >= 1e3)
      return 0;
    const remaining = 1e3 - currentWeight;
    const hoursUntilFull = remaining / rechargeRatePerHour;
    return Math.max(0, Math.ceil(hoursUntilFull * 3600));
  }
  function formatCountdown(seconds) {
    if (seconds <= 0)
      return "";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m ${secs}s`;
    }
  }
  function fixImagePath(imagePath, currentOrigin) {
    if (!imagePath)
      return null;
    let fixedImagePath = imagePath;
    try {
      const imageUrl = new URL(imagePath);
      const currentUrl = new URL(currentOrigin);
      imageUrl.protocol = currentUrl.protocol;
      imageUrl.hostname = currentUrl.hostname;
      imageUrl.port = currentUrl.port;
      fixedImagePath = imageUrl.toString();
    } catch (err) {
      try {
        const path = new URL(imagePath).pathname + new URL(imagePath).search;
        fixedImagePath = currentOrigin + path;
      } catch (err2) {
        fixedImagePath = imagePath;
      }
    }
    return fixedImagePath;
  }
  function removeExistingTooltips(container) {
    const existing = (container || document).querySelectorAll(".opponent-tooltip, .hon-performer-tooltip");
    existing.forEach((t) => t.remove());
  }
  function attachPerformerTooltip(element, performer, modalDialog) {
    if (!performer)
      return;
    element.addEventListener("mouseenter", (e) => {
      if (modalDialog) {
        removeExistingTooltips(modalDialog);
      } else {
        removeExistingTooltips();
      }
      const currentOrigin = window.location.origin;
      const tooltip = document.createElement("div");
      tooltip.className = "opponent-tooltip";
      tooltip.style.position = "fixed";
      tooltip.style.zIndex = "10002";
      tooltip.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
      tooltip.style.border = "1px solid #555";
      tooltip.style.borderRadius = "8px";
      tooltip.style.padding = "8px";
      tooltip.style.minWidth = "120px";
      tooltip.style.maxWidth = "200px";
      tooltip.style.textAlign = "center";
      tooltip.style.boxShadow = "0 4px 8px rgba(0,0,0,0.3)";
      tooltip.style.pointerEvents = "none";
      tooltip.style.color = "#fff";
      if (performer.image_path) {
        const fixedImagePath = fixImagePath(performer.image_path, currentOrigin);
        const imageContainer = document.createElement("div");
        imageContainer.style.width = "80px";
        imageContainer.style.height = "80px";
        imageContainer.style.borderRadius = "50%";
        imageContainer.style.overflow = "hidden";
        imageContainer.style.border = "2px solid #555";
        imageContainer.style.margin = "0 auto 8px";
        const img = document.createElement("img");
        img.src = fixedImagePath;
        img.alt = `${performer.name} profile image`;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.style.display = "block";
        img.style.objectPosition = "center 15%";
        img.onerror = function() {
          imageContainer.innerHTML = "";
          const placeholderIcon = document.createElement("span");
          placeholderIcon.innerText = "\u{1F464}";
          placeholderIcon.style.fontSize = "2rem";
          placeholderIcon.style.color = "#888";
          placeholderIcon.style.display = "flex";
          placeholderIcon.style.alignItems = "center";
          placeholderIcon.style.justifyContent = "center";
          placeholderIcon.style.height = "100%";
          imageContainer.appendChild(placeholderIcon);
        };
        imageContainer.appendChild(img);
        tooltip.appendChild(imageContainer);
      }
      const nameContainer = document.createElement("div");
      nameContainer.style.display = "flex";
      nameContainer.style.alignItems = "center";
      nameContainer.style.justifyContent = "center";
      nameContainer.style.gap = "0.3rem";
      nameContainer.style.marginBottom = "4px";
      const flag = getFlagEmoji(performer.countryCode);
      if (flag) {
        const flagSpan = document.createElement("span");
        flagSpan.innerText = flag;
        nameContainer.appendChild(flagSpan);
      }
      const nameElement = document.createElement("div");
      nameElement.innerText = performer.name;
      nameElement.style.color = "#fff";
      nameElement.style.fontWeight = "bold";
      nameContainer.appendChild(nameElement);
      tooltip.appendChild(nameContainer);
      const ascScoreDisplay = performer.ascScore && performer.ascScore !== "N/A" ? performer.ascScore : "N/A";
      const scoreElement = document.createElement("div");
      scoreElement.innerText = `Asc.Score: ${ascScoreDisplay}`;
      scoreElement.style.fontSize = "0.8rem";
      scoreElement.style.fontWeight = "bold";
      scoreElement.style.color = performer.tierColor || "#ddd";
      tooltip.appendChild(scoreElement);
      (modalDialog || document.body).appendChild(tooltip);
      const rect = element.getBoundingClientRect();
      tooltip.style.left = `${rect.left + window.scrollX}px`;
      tooltip.style.top = `${rect.bottom + window.scrollY + 8}px`;
      const moveHandler = (ev) => {
        tooltip.style.left = `${ev.clientX + 12}px`;
        tooltip.style.top = `${ev.clientY + 18}px`;
      };
      element.addEventListener("mousemove", moveHandler);
      element.addEventListener("mouseleave", () => {
        element.removeEventListener("mousemove", moveHandler);
        setTimeout(() => {
          if (tooltip.parentNode) {
            tooltip.remove();
          }
        }, 100);
      }, { once: true });
    });
  }
  function attachNameTooltips(container, performers) {
    if (!container || !performers || !performers.length)
      return;
    const modalDialog = container.closest(".hon-stats-modal-dialog");
    const performerMap = /* @__PURE__ */ new Map();
    performers.forEach((p) => {
      const rawRating = p.rating100 ?? 1;
      const hasMatches = (p.wins || 0) + (p.losses || 0) + (p.draws || 0) > 0;
      const isUnrated = rawRating === 1 && !hasMatches;
      const ascScore = calculateBattleScore(p);
      const tier = getRatingTier(p, performers);
      performerMap.set(String(p.id), {
        id: p.id,
        name: p.name || `Performer #${p.id}`,
        image_path: p.image_path || p.imagePath || "",
        countryCode: p.country || "",
        rating: isUnrated ? "Unrated" : (rawRating / 10).toFixed(1),
        ascScore: ascScore ? ascScore.toFixed(2) : "N/A",
        tierColor: getTierColor(tier)
      });
    });
    const nameLinks = container.querySelectorAll(".hon-stats-name a");
    nameLinks.forEach((link) => {
      const match = link.getAttribute("href")?.match(/\/performers\/(\d+)/);
      if (!match)
        return;
      const performer = performerMap.get(match[1]);
      if (performer) {
        attachPerformerTooltip(link, performer, modalDialog);
      }
    });
  }
  function getProcessedRecencyWeight(p) {
    if (!p.last_match || p.total_matches === 0)
      return 1;
    const lastMatchDate = new Date(p.last_match);
    const msSince = Date.now() - lastMatchDate.getTime();
    const minutesSince = msSince / (1e3 * 60);
    if (minutesSince < 30)
      return 0;
    const hoursSince = minutesSince / 60;
    let freshness = Math.min(1, 0.1 + hoursSince * 0.075);
    if (p.total_matches < 10) {
      freshness = Math.min(1, freshness + 0.2);
    }
    return freshness;
  }
  function isUnratedPerformer(p) {
    const rawRating = p.rawRating ?? p.rating100 ?? 1;
    const totalMatches = p.total_matches ?? (p.wins || 0) + (p.losses || 0) + (p.draws || 0);
    return rawRating === 1 && totalMatches === 0;
  }
  function calculateRankByAscScore(performers) {
    const sorted = [...performers].sort((a, b) => {
      const scoreA = a.ascScore || 0;
      const scoreB = b.ascScore || 0;
      if (scoreB !== scoreA)
        return scoreB - scoreA;
      return (b.wins || 0) - (a.wins || 0);
    });
    const rankMap = /* @__PURE__ */ new Map();
    sorted.forEach((p, index) => {
      rankMap.set(p.id, {
        rank: index + 1,
        total: sorted.length,
        ascScore: p.ascScore
      });
    });
    return rankMap;
  }
  async function preloadStatsModal() {
    if (!cachedPerformers) {
      try {
        cachedPerformers = await fetchAllPerformerStats();
        cachedModalContent = await createStatsModalContent(cachedPerformers);
        cacheTimestamp = Date.now();
      } catch (error) {
        console.warn("[Ascension] Failed to preload stats:", error);
      }
    }
  }
  async function openStatsModal(forceRefresh = false) {
    const existingStatsModal = document.getElementById("hon-stats-modal");
    if (existingStatsModal)
      existingStatsModal.remove();
    const statsModal = document.createElement("div");
    statsModal.id = "hon-stats-modal";
    statsModal.className = "hon-stats-modal";
    statsModal.innerHTML = `
    <div class="hon-modal-backdrop"></div>
    <div class="hon-stats-modal-dialog">
      <button class="hon-modal-close">\u2715</button>
      <div class="hon-stats-loading">Loading stats...</div>
    </div>
  `;
    document.body.appendChild(statsModal);
    const closeStats = () => {
      if (weightCountdownInterval) {
        clearInterval(weightCountdownInterval);
        weightCountdownInterval = null;
      }
      statsModal.remove();
    };
    const dialogContainer = statsModal.querySelector(".hon-stats-modal-dialog");
    dialogContainer.addEventListener("click", (e) => e.stopPropagation());
    statsModal.querySelector(".hon-modal-backdrop").addEventListener("click", closeStats);
    statsModal.querySelector(".hon-modal-close").addEventListener("click", closeStats);
    try {
      let performersToUse = cachedPerformers;
      let usedCache = false;
      try {
        performersToUse = await fetchAllPerformerStats();
        cachedPerformers = performersToUse;
        cacheTimestamp = Date.now();
        cachedModalContent = await createStatsModalContent(performersToUse);
      } catch (fetchError) {
        console.warn("[Ascension] Failed to fetch fresh stats:", fetchError);
        if (cachedPerformers && cachedModalContent) {
          performersToUse = cachedPerformers;
          usedCache = true;
          console.log("[Ascension] Using cached stats due to fetch failure");
          if (cachedModalContent instanceof Promise) {
            cachedModalContent = await cachedModalContent;
          }
        } else {
          throw fetchError;
        }
      }
      if (!cachedModalContent && performersToUse) {
        cachedModalContent = await createStatsModalContent(performersToUse);
      }
      dialogContainer.innerHTML = `
      <button class="hon-modal-close">\u2715</button>
      ${cachedModalContent}
      ${usedCache ? '<div class="hon-stats-cache-notice">Showing cached data</div>' : ""}
    `;
      dialogContainer.addEventListener("click", (e) => e.stopPropagation());
      dialogContainer.querySelector(".hon-modal-close").addEventListener("click", closeStats);
      const refreshBtn = dialogContainer.querySelector("#refresh-stats-btn");
      if (refreshBtn) {
        refreshBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          await openStatsModal(true);
        });
      }
      attachNameTooltips(dialogContainer, performersToUse);
      initStatsTabs(dialogContainer);
      initStatsCollapsibles(dialogContainer);
      initStatsSorting(dialogContainer);
      initWeightCountdowns();
      const activeDistributionTab = dialogContainer.querySelector('.hon-stats-tab[data-tab="distribution"].active');
      if (activeDistributionTab) {
        setTimeout(() => {
          const bars = dialogContainer.querySelectorAll(".animated-bar:not(.animated)");
          if (bars.length > 0) {
            animateBars(bars);
          }
        }, 100);
      }
    } catch (error) {
      console.error("[Ascension] Error loading stats:", error);
      dialogContainer.innerHTML = `
      <button class="hon-modal-close">\u2715</button>
      <div class="hon-stats-error">Failed to load statistics.</div>
    `;
      dialogContainer.querySelector(".hon-modal-close").addEventListener("click", closeStats);
    }
  }
  async function createStatsModalContent(performers) {
    if (!performers || performers.length === 0) {
      return '<div class="hon-stats-empty">No performer stats available</div>';
    }
    const processedPerformers = [];
    performers.forEach((p) => {
      const stats = parsePerformerEloData(p);
      const rawRating = p.rating100 ?? 1;
      const isUnrated = rawRating === 1 && stats.total_matches === 0;
      const displayRating = isUnrated ? "Unrated" : (rawRating / 10).toFixed(1);
      let currentWeight = 1e3;
      if (stats.last_match) {
        const lastMatchDate = new Date(stats.last_match);
        const msSince = Date.now() - lastMatchDate.getTime();
        const hoursSince = msSince / (1e3 * 60 * 60);
        const rechargeRatePerHour = 1e3 / 12;
        const recovered = hoursSince * rechargeRatePerHour;
        currentWeight = Math.min(1e3, recovered);
      }
      const ascScore = calculateBattleScore(p);
      const compositeScore = calculatePerformerCompositeScore(p);
      const performerTier = getRatingTier(p, performers);
      const ascScoreColor = getTierColor(performerTier);
      processedPerformers.push({
        ...stats,
        id: p.id,
        name: p.name || `Performer #${p.id}`,
        rating: displayRating,
        rawRating,
        countryCode: p.country || "",
        gender: p.gender || "",
        weight: currentWeight,
        last_match: stats.last_match || null,
        ascScore,
        compositeScore,
        ascScoreColor,
        image_path: p.image_path || ""
      });
    });
    const rankMap = calculateRankByAscScore(processedPerformers);
    processedPerformers.forEach((p) => {
      const rankData = rankMap.get(p.id);
      p.rank = rankData?.rank || processedPerformers.length + 1;
      p.totalRanked = rankData?.total || processedPerformers.length;
    });
    const tierGroups = {};
    const chargingCounts = {};
    const unratedGroup = [];
    processedPerformers.forEach((p) => {
      if (isUnratedPerformer(p)) {
        unratedGroup.push({ ...p });
        return;
      }
      const tier = getRatingTier(p, performers);
      if (!tierGroups[tier]) {
        tierGroups[tier] = [];
        chargingCounts[tier] = 0;
      }
      tierGroups[tier].push({ ...p });
      if (p.weight < 1e3) {
        chargingCounts[tier]++;
      }
    });
    const sortedTiers = Object.keys(tierGroups).sort((a, b) => {
      const tierValues = {
        "S-Tier": 5,
        "A-Tier": 4,
        "B-Tier": 3,
        "C-Tier": 2,
        "D-Tier": 1,
        "F-Tier": 0
      };
      return tierValues[b] - tierValues[a];
    });
    const allTiersSorted = [...processedPerformers].sort((a, b) => a.rank - b.rank);
    const allTiersTotalCount = allTiersSorted.length;
    const allTiersChargingCount = allTiersSorted.filter((p) => p.weight < 1e3).length;
    const allTiersAvgRecencyWeight = allTiersTotalCount > 0 ? allTiersSorted.reduce((sum, p) => sum + getProcessedRecencyWeight(p), 0) / allTiersTotalCount : 0;
    const allTiersRecencyStatus = allTiersAvgRecencyWeight >= 0.8 ? "\u2705" : "\u26A0\uFE0F";
    const allTiersGroup = {
      [`All Tier Performers (${allTiersTotalCount})|||(\u{1FAAB}: ${allTiersChargingCount}) (\u231B avg recency: ${allTiersAvgRecencyWeight.toFixed(2)} ${allTiersRecencyStatus})`]: allTiersSorted
    };
    const renamedTierGroups = {};
    sortedTiers.forEach((tierName) => {
      tierGroups[tierName].sort((a, b) => a.rank - b.rank);
      const totalCount = tierGroups[tierName].length;
      const chargingCount = chargingCounts[tierName] || 0;
      const totalRecencyWeight = tierGroups[tierName].reduce(
        (sum, p) => sum + getProcessedRecencyWeight(p),
        0
      );
      const avgRecencyWeight = totalCount > 0 ? totalRecencyWeight / totalCount : 0;
      const recencyStatus = avgRecencyWeight >= 0.8 ? "\u2705" : "\u26A0\uFE0F";
      renamedTierGroups[`${tierName} Performers (${totalCount})|||(\u{1FAAB}: ${chargingCount}) (\u231B avg recency: ${avgRecencyWeight.toFixed(2)} ${recencyStatus})`] = tierGroups[tierName];
    });
    unratedGroup.sort((a, b) => a.rank - b.rank);
    const unratedTotalCount = unratedGroup.length;
    const unratedChargingCount = unratedGroup.filter((p) => p.weight < 1e3).length;
    const unratedAvgRecencyWeight = unratedTotalCount > 0 ? unratedGroup.reduce((sum, p) => sum + getProcessedRecencyWeight(p), 0) / unratedTotalCount : 0;
    const unratedRecencyStatus = unratedAvgRecencyWeight >= 0.8 ? "\u2705" : "\u26A0\uFE0F";
    const unratedGroupName = `Unrated Performers (${unratedTotalCount})|||(\u{1FAAB}: ${unratedChargingCount}) (\u231B avg recency: ${unratedAvgRecencyWeight.toFixed(2)} ${unratedRecencyStatus})`;
    const allGroups = {
      ...allTiersGroup,
      ...renamedTierGroups,
      [unratedGroupName]: unratedGroup
    };
    const groupHTML = Object.keys(allGroups).map((groupName) => {
      const performersInGroup = allGroups[groupName];
      const isAllTiers = groupName.startsWith("All Tier Performers");
      let groupColor;
      if (isAllTiers) {
        groupColor = "#ffffff";
      } else if (groupName.startsWith("Unrated")) {
        groupColor = "#888888";
      } else {
        groupColor = getTierColor(groupName.replace(" Performers", "").split(" ")[0]);
      }
      const [titlePart, chargingPart] = groupName.split("|||");
      const displayGroupName = chargingPart ? `${titlePart}<br><span style="font-size: 0.8em; opacity: 0.8;">${chargingPart}</span>` : groupName;
      const rows = performersInGroup.map((p) => {
        const winRate = p.total_matches > 0 ? (p.wins / p.total_matches * 100).toFixed(1) : "0.0";
        const streakDisplay = p.current_streak > 0 ? `<span class="hon-stats-positive">+${p.current_streak}</span>` : p.current_streak < 0 ? `<span class="hon-stats-negative">${p.current_streak}</span>` : "0";
        const bestStreakDisplay = p.best_streak > 0 ? `<span class="hon-stats-positive">+${formatBestStreakDisplay(p.best_streak)}</span>` : p.best_streak < 0 ? `<span class="hon-stats-negative">${formatBestStreakDisplay(p.best_streak)}</span>` : formatBestStreakDisplay(p.best_streak);
        const worstStreakDisplay = p.worst_streak < 0 ? `<span class="hon-stats-negative">${p.worst_streak}</span>` : p.worst_streak > 0 ? `<span class="hon-stats-positive">${p.worst_streak}</span>` : p.worst_streak || 0;
        const flag = getFlagEmoji(p.countryCode);
        const countryCodeDisplay = p.countryCode || "N/A";
        const genderEmoji = getGenderEmoji(p.gender);
        const maxWeight = 1e3;
        const rechargeRate = 1e3 / 12;
        let currentWeight = maxWeight;
        if (p.last_match) {
          const lastMatchDate = new Date(p.last_match);
          const msSince = Date.now() - lastMatchDate.getTime();
          const hoursSince = msSince / (1e3 * 60 * 60);
          const recovered = hoursSince * rechargeRate;
          currentWeight = Math.min(maxWeight, recovered);
        }
        const weightFormatted = formatWeight(currentWeight);
        let weightStatus;
        if (currentWeight >= maxWeight) {
          weightStatus = "\u{1F50B}";
        } else if (currentWeight <= 0) {
          weightStatus = "\u{1FAAB}";
        } else {
          weightStatus = "\u{1FAAB}";
        }
        const timeUntilFull = calculateTimeUntilFull({
          ...p,
          weight: currentWeight,
          maxWeight,
          rechargeRate
        });
        const countdownFormatted = formatCountdown(timeUntilFull);
        const weightDisplay = currentWeight >= maxWeight ? weightStatus : `${weightStatus}<br><small class="countdown" data-performer-id="${p.id}" data-last-match="${p.last_match || ""}" style="font-size: 0.7em;">${countdownFormatted || weightFormatted}</small>`;
        const performerTier = getRatingTier(p, performers);
        const ratingColor = getTierColor(performerTier);
        const compositeDisplay = p.total_matches > 0 ? p.compositeScore?.toFixed(2) || "0.00" : "N/A";
        const ascScoreDisplay = p.ascScore ? p.ascScore.toFixed(2) : "N/A";
        return `
        <tr data-rank="${p.rank}" 
            data-ascscore="${p.ascScore || 0}"
            data-rating="${p.rating}" 
            data-raw-rating="${p.rawRating || 1}"
            data-composite-score="${p.total_matches > 0 ? p.compositeScore || 0 : ""}"
            data-matches="${p.total_matches}" 
            data-wins="${p.wins}" 
            data-losses="${p.losses}" 
            data-draws="${p.draws || 0}" 
            data-winrate="${winRate}" 
            data-streak="${p.current_streak}" 
            data-beststreak="${p.best_streak}" 
            data-worststreak="${p.worst_streak}"
            data-country="${countryCodeDisplay}"
            data-gender="${p.gender}"
            data-weight="${currentWeight}"
            data-maxweight="${maxWeight}">
          <td class="hon-stats-rank">#${p.rank}</td>
          <td class="hon-stats-country">${flag} ${countryCodeDisplay}</td>
          <td class="hon-stats-gender">${genderEmoji}</td>
          <td class="hon-stats-name">
            <a href="/performers/${p.id}" target="_blank">${escapeHtml(p.name)}</a>
          </td>
          <td class="hon-stats-ascscore" style="font-weight: bold; color: ${p.ascScoreColor};">${ascScoreDisplay}</td>
          <td class="hon-stats-rating" style="color: ${ratingColor}; font-weight: bold;">
            ${p.rating}
          </td>
          <td class="hon-stats-composite">${compositeDisplay}</td>
          <td>${p.total_matches}</td>
          <td><span class="hon-stats-positive">${p.wins}</span></td>
          <td><span class="hon-stats-negative">${p.losses}</span></td>
          <td>${p.draws || 0}</td>
          <td>${winRate}%</td>
          <td>${streakDisplay}</td>
          <td>${bestStreakDisplay}</td>
          <td>${worstStreakDisplay}</td>
          <td class="hon-stats-weight">${weightDisplay}</td>
        </tr>`;
      }).join("");
      return `
      <div class="hon-rank-group">
        <div class="hon-rank-group-header" data-group="${groupName.toLowerCase().replace(/\s+/g, "-")}" role="button">
          <span class="hon-group-toggle">\u25B6</span>
          <span class="hon-rank-group-title" style="color: ${groupColor}; font-weight: bold;">
            ${displayGroupName}
          </span>
        </div>
        <div class="hon-rank-group-content collapsed" data-group="${groupName.toLowerCase().replace(/\s+/g, "-")}">
          <table class="hon-stats-table">
            <thead>
              <tr>
                <th data-sort="rank">Rank</th>
                <th data-sort="country">Country</th>
                <th data-sort="gender">Gender</th>
                <th data-sort="name">Name</th>
                <th data-sort="ascscore">Asc.Score</th>
                <th data-sort="rating">Rating</th>
                <th data-sort="composite">Comp.Score</th>
                <th data-sort="matches">Matches</th>
                <th data-sort="wins">W</th>
                <th data-sort="losses">L</th>
                <th data-sort="draws">D</th>
                <th data-sort="winrate">%</th>
                <th data-sort="streak">Streak</th>
                <th data-sort="beststreak">Best</th>
                <th data-sort="worststreak">Worst</th>
                <th data-sort="weight">\u231B</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
    }).join("");
    const tierCounts = {
      "S-Tier": 0,
      "A-Tier": 0,
      "B-Tier": 0,
      "C-Tier": 0,
      "D-Tier": 0,
      "F-Tier": 0
    };
    processedPerformers.forEach((p) => {
      if (isUnratedPerformer(p))
        return;
      const tier = getRatingTier(p, performers);
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    });
    return `
    <div class="hon-stats-header">
      <h2>\u{1F4CA} Performer Statistics</h2>
      <div class="hon-stats-tabs">
        <button class="hon-stats-tab active" data-tab="leaderboard">Leaderboard</button>
        <button class="hon-stats-tab" data-tab="distribution">Tier Distribution</button>
      </div>
    </div>
    <div class="hon-stats-content">
      <div class="hon-stats-tab-panel active" data-panel="leaderboard">
        ${groupHTML}
      </div>
      <div class="hon-stats-tab-panel" data-panel="distribution">
        <div class="hon-bar-graph">
          ${generateBarGroups(tierCounts)}
        </div>
      </div>
    </div>
  `;
  }
  function generateStatTables(processedPerformers, allPerformers = null) {
    const tierGroups = {};
    const unratedGroup = [];
    const tierPool = allPerformers || processedPerformers;
    processedPerformers.forEach((p) => {
      if (isUnratedPerformer(p)) {
        unratedGroup.push({ ...p });
        return;
      }
      const tier = getRatingTier(p, tierPool);
      if (!tierGroups[tier]) {
        tierGroups[tier] = [];
      }
      tierGroups[tier].push({ ...p });
    });
    const sortedTiers = Object.keys(tierGroups).sort((a, b) => {
      const tierValues = {
        "S-Tier": 5,
        "A-Tier": 4,
        "B-Tier": 3,
        "C-Tier": 2,
        "D-Tier": 1,
        "F-Tier": 0
      };
      return tierValues[b] - tierValues[a];
    });
    const allTiersGroup = {
      [`All Tier Performers (${processedPerformers.length})`]: processedPerformers
    };
    const renamedTierGroups = {};
    sortedTiers.forEach((tierName) => {
      renamedTierGroups[`${tierName} Performers (${tierGroups[tierName].length})`] = tierGroups[tierName];
    });
    const allGroups = {
      ...allTiersGroup,
      ...renamedTierGroups
    };
    if (unratedGroup.length > 0) {
      allGroups[`Unrated Performers (${unratedGroup.length})`] = unratedGroup;
    }
    const groupHTML = Object.keys(allGroups).map((groupName) => {
      const performersInGroup = allGroups[groupName];
      const isAllTiers = groupName.startsWith("All Tier Performers");
      let groupColor;
      if (isAllTiers) {
        groupColor = "#ffffff";
      } else if (groupName.startsWith("Unrated")) {
        groupColor = "#888888";
      } else {
        groupColor = getTierColor(groupName.replace(" Performers", "").split(" ")[0]);
      }
      const rows = performersInGroup.map((p) => {
        const winRate = p.total_matches > 0 ? (p.wins / p.total_matches * 100).toFixed(1) : "0.0";
        const streakDisplay = p.current_streak > 0 ? `<span class="hon-stats-positive">+${p.current_streak}</span>` : p.current_streak < 0 ? `<span class="hon-stats-negative">${p.current_streak}</span>` : "0";
        const bestStreakDisplay = p.best_streak > 0 ? `<span class="hon-stats-positive">+${formatBestStreakDisplay(p.best_streak)}</span>` : p.best_streak < 0 ? `<span class="hon-stats-negative">${formatBestStreakDisplay(p.best_streak)}</span>` : formatBestStreakDisplay(p.best_streak);
        const worstStreakDisplay = p.worst_streak < 0 ? `<span class="hon-stats-negative">${p.worst_streak}</span>` : p.worst_streak > 0 ? `<span class="hon-stats-positive">${p.worst_streak}</span>` : p.worst_streak || 0;
        const flag = getFlagEmoji(p.countryCode);
        const countryCodeDisplay = p.countryCode || "N/A";
        const genderEmoji = getGenderEmoji(p.gender);
        const maxWeight = 1e3;
        const rechargeRate = 1e3 / 12;
        let currentWeight = maxWeight;
        if (p.last_match) {
          const lastMatchDate = new Date(p.last_match);
          const msSince = Date.now() - lastMatchDate.getTime();
          const hoursSince = msSince / (1e3 * 60 * 60);
          const recovered = hoursSince * rechargeRate;
          currentWeight = Math.min(maxWeight, recovered);
        }
        const weightFormatted = formatWeight(currentWeight);
        let weightStatus;
        if (currentWeight >= maxWeight) {
          weightStatus = "\u{1F50B}";
        } else if (currentWeight <= 0) {
          weightStatus = "\u{1FAAB}";
        } else {
          weightStatus = "\u{1FAAB}";
        }
        const timeUntilFull = calculateTimeUntilFull({
          ...p,
          weight: currentWeight,
          maxWeight,
          rechargeRate
        });
        const countdownFormatted = formatCountdown(timeUntilFull);
        const weightDisplay = currentWeight >= maxWeight ? weightStatus : `${weightStatus}<br><small class="countdown" data-performer-id="${p.id}" data-last-match="${p.last_match || ""}" style="font-size: 0.7em;">${countdownFormatted || weightFormatted}</small>`;
        const performerTier = getRatingTier(p, tierPool);
        const ratingColor = getTierColor(performerTier);
        const ascScoreColor = p.ascScoreColor || ratingColor;
        const compositeDisplay = p.total_matches > 0 ? p.compositeScore?.toFixed(1) || "0.0" : "N/A";
        const ascScoreDisplay = p.ascScore ? p.ascScore.toFixed(2) : "N/A";
        return `
        <tr data-rank="${p.rank}" 
            data-ascscore="${p.ascScore || 0}"
            data-rating="${p.rating}" 
            data-raw-rating="${p.rawRating || 1}"
            data-composite-score="${p.total_matches > 0 ? p.compositeScore || 0 : ""}"
            data-matches="${p.total_matches}" 
            data-wins="${p.wins}" 
            data-losses="${p.losses}" 
            data-draws="${p.draws || 0}" 
            data-winrate="${winRate}" 
            data-streak="${p.current_streak}" 
            data-beststreak="${p.best_streak}" 
            data-worststreak="${p.worst_streak}"
            data-country="${countryCodeDisplay}"
            data-gender="${p.gender}"
            data-weight="${currentWeight}"
            data-maxweight="${maxWeight}">
          <td class="hon-stats-rank">#${p.rank}</td>
          <td class="hon-stats-country">${flag} ${countryCodeDisplay}</td>
          <td class="hon-stats-gender">${genderEmoji}</td>
          <td class="hon-stats-name">
            <a href="/performers/${p.id}" target="_blank">${escapeHtml(p.name)}</a>
          </td>
          <td class="hon-stats-ascscore" style="font-weight: bold; color: ${ascScoreColor};">${ascScoreDisplay}</td>
          <td class="hon-stats-rating" style="color: ${ratingColor}; font-weight: bold;">
            ${p.rating}
          </td>
          <td class="hon-stats-composite">${compositeDisplay}</td>
          <td>${p.total_matches}</td>
          <td><span class="hon-stats-positive">${p.wins}</span></td>
          <td><span class="hon-stats-negative">${p.losses}</span></td>
          <td>${p.draws || 0}</td>
          <td>${winRate}%</td>
          <td>${streakDisplay}</td>
          <td>${bestStreakDisplay}</td>
          <td>${worstStreakDisplay}</td>
          <td class="hon-stats-weight">${weightDisplay}</td>
        </tr>`;
      }).join("");
      return `
      <div class="hon-rank-group">
        <div class="hon-rank-group-header" data-group="${groupName.toLowerCase().replace(/\s+/g, "-")}" role="button">
          <span class="hon-group-toggle">\u25B6</span>
          <span class="hon-rank-group-title" style="color: ${groupColor}; font-weight: bold;">
            ${groupName}
          </span>
        </div>
        <div class="hon-rank-group-content collapsed" data-group="${groupName.toLowerCase().replace(/\s+/g, "-")}">
          <table class="hon-stats-table">
            <thead>
              <tr>
                <th data-sort="rank">Rank</th>
                <th data-sort="country">Country</th>
                <th data-sort="gender">Gender</th>
                <th data-sort="name">Name</th>
                <th data-sort="ascscore">Asc.Score</th>
                <th data-sort="rating">Rating</th>
                <th data-sort="composite">Comp.Score</th>
                <th data-sort="matches">Matches</th>
                <th data-sort="wins">W</th>
                <th data-sort="losses">L</th>
                <th data-sort="draws">D</th>
                <th data-sort="winrate">%</th>
                <th data-sort="streak">Streak</th>
                <th data-sort="beststreak">Best</th>
                <th data-sort="worststreak">Worst</th>
                <th data-sort="weight">\u231B</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
    }).join("");
    return groupHTML;
  }
  function initStatsSorting(dialog) {
    const headers = dialog.querySelectorAll(".hon-stats-table th[data-sort]");
    headers.forEach((header) => {
      header.addEventListener("click", () => {
        const table = header.closest("table");
        const tbody = table.querySelector("tbody");
        const sortType = header.dataset.sort;
        const isAscending = header.classList.toggle("ascending");
        headers.forEach((h) => {
          if (h !== header) {
            h.classList.remove("ascending", "descending", "sort-active");
          }
        });
        header.classList.toggle("descending", !isAscending);
        header.classList.add("sort-active");
        table.className = table.className.replace(/sorted-by-\w+/g, "");
        table.classList.add(`sorted-by-${sortType}`);
        const rows = Array.from(tbody.querySelectorAll("tr"));
        rows.sort((a, b) => {
          let aValue = a.dataset[sortType];
          let bValue = b.dataset[sortType];
          if (sortType === "rating") {
            const aIsUnrated = aValue === "Unrated";
            const bIsUnrated = bValue === "Unrated";
            if (aIsUnrated && bIsUnrated)
              return 0;
            if (aIsUnrated)
              return isAscending ? 1 : -1;
            if (bIsUnrated)
              return isAscending ? -1 : 1;
            aValue = parseFloat(a.dataset.rawRating || 1);
            bValue = parseFloat(b.dataset.rawRating || 1);
          } else if (sortType === "composite") {
            const aHasMatches = parseInt(a.dataset.matches) > 0;
            const bHasMatches = parseInt(b.dataset.matches) > 0;
            if (!aHasMatches && !bHasMatches)
              return 0;
            if (!aHasMatches)
              return isAscending ? 1 : -1;
            if (!bHasMatches)
              return isAscending ? -1 : 1;
            aValue = parseFloat(a.dataset.compositeScore || 0);
            bValue = parseFloat(b.dataset.compositeScore || 0);
          } else if (sortType === "ascscore") {
            aValue = parseFloat(a.dataset.ascscore || 0);
            bValue = parseFloat(b.dataset.ascscore || 0);
          } else if (sortType === "name" || sortType === "country" || sortType === "gender") {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
          } else if (sortType !== "name") {
            aValue = parseFloat(aValue);
            bValue = parseFloat(bValue);
          }
          if (aValue < bValue)
            return isAscending ? -1 : 1;
          if (aValue > bValue)
            return isAscending ? 1 : -1;
          return 0;
        });
        rows.forEach((row) => tbody.appendChild(row));
      });
    });
  }
  function initWeightCountdowns() {
    if (weightCountdownInterval) {
      clearInterval(weightCountdownInterval);
    }
    weightCountdownInterval = setInterval(() => {
      const countdownElements = document.querySelectorAll(".countdown");
      countdownElements.forEach((element) => {
        const lastMatchStr = element.dataset.lastMatch;
        if (!lastMatchStr) {
          const parentCell = element.parentElement;
          if (parentCell) {
            parentCell.innerHTML = "\u{1F50B}";
          }
          return;
        }
        const lastMatchDate = new Date(lastMatchStr);
        const msSince = Date.now() - lastMatchDate.getTime();
        const hoursSince = msSince / (1e3 * 60 * 60);
        const rechargeRatePerHour = 1e3 / 12;
        const recovered = hoursSince * rechargeRatePerHour;
        const currentWeight = Math.min(1e3, recovered);
        if (currentWeight >= 1e3) {
          element.parentElement.innerHTML = "\u{1F50B}";
          return;
        }
        const remaining = 1e3 - currentWeight;
        const hoursUntilFull = remaining / rechargeRatePerHour;
        const secondsUntilFull = Math.max(0, Math.ceil(hoursUntilFull * 3600));
        if (secondsUntilFull <= 0) {
          element.parentElement.innerHTML = "\u{1F50B}";
        } else {
          element.textContent = formatCountdown(secondsUntilFull);
        }
      });
    }, 1e3);
  }
  function generateBarGroups(tierCounts) {
    const tiers = [
      { label: "S-Tier", color: "#eb9834" },
      { label: "A-Tier", color: "#e014aa" },
      { label: "B-Tier", color: "#7f1e82" },
      { label: "C-Tier", color: "#14bbe0" },
      { label: "D-Tier", color: "#92e014" },
      { label: "F-Tier", color: "#808080" }
    ];
    const nonZeroTiers = tiers.filter((tier) => (tierCounts[tier.label] || 0) > 0);
    if (nonZeroTiers.length === 0)
      return "";
    const counts = nonZeroTiers.map((t) => tierCounts[t.label]);
    const maxCount = Math.max(...counts, 1);
    const minCount = Math.min(...counts);
    return nonZeroTiers.map((tier) => {
      const count = tierCounts[tier.label];
      const logMax = Math.log(maxCount + 1);
      const logMin = Math.log(minCount + 1);
      const logCurrent = Math.log(count + 1);
      let percentage;
      if (logMax === logMin) {
        percentage = 100;
      } else {
        percentage = 5 + (logCurrent - logMin) / (logMax - logMin) * 95;
      }
      return `
      <div class="hon-bar-container" title="${tier.label}: ${count} performers">
        <div class="hon-bar-label-wrapper">
          <span class="hon-bar-label">${tier.label}</span>
        </div>
        <div class="hon-bar-wrapper">
          <div class="hon-bar animated-bar" 
               data-target-width="${percentage}" 
               data-final-count="${count}"
               data-actual-count="${count}"
               style="background-color: ${tier.color}; width: 0%;">
            <span class="hon-bar-count" style="opacity: 0;">${count}</span>
          </div>
        </div>
      </div>`;
    }).join("");
  }
  function initStatsTabs(dialog) {
    const buttons = dialog.querySelectorAll(".hon-stats-tab");
    const panels = dialog.querySelectorAll(".hon-stats-tab-panel");
    buttons.forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const target = btn.dataset.tab;
        buttons.forEach((b) => b.classList.toggle("active", b === btn));
        panels.forEach((p) => p.classList.toggle("active", p.dataset.panel === target));
        if (target === "distribution") {
          setTimeout(() => {
            const bars = dialog.querySelectorAll(".animated-bar:not(.animated)");
            animateBars(bars);
          }, 100);
        }
      };
    });
  }
  function initStatsCollapsibles(dialog) {
    const headers = dialog.querySelectorAll(".hon-rank-group-header, .hon-bar-group-header");
    headers.forEach((header) => {
      header.onclick = (e) => {
        e.stopPropagation();
        const groupType = header.classList.contains("hon-rank-group-header") ? ".hon-rank-group-content" : ".hon-bar-group-content";
        const content = dialog.querySelector(`${groupType}[data-group="${header.dataset.group}"]`);
        const isCollapsed = content.classList.toggle("collapsed");
        header.setAttribute("aria-expanded", !isCollapsed);
        header.querySelector(".hon-group-toggle").textContent = isCollapsed ? "\u25B6" : "\u25BC";
      };
    });
  }
  function animateBars(bars) {
    bars.forEach((bar, index) => {
      bar.classList.add("animated");
      setTimeout(() => {
        const targetWidth = parseFloat(bar.dataset.targetWidth);
        const finalCount = parseInt(bar.dataset.finalCount);
        const countElement = bar.querySelector(".hon-bar-count");
        bar.style.width = `${targetWidth}%`;
        let currentCount = 0;
        const duration = 1e3;
        const steps = 30;
        const increment = finalCount / steps;
        const stepTime = duration / steps;
        const timer = setInterval(() => {
          currentCount += increment;
          if (currentCount >= finalCount) {
            currentCount = finalCount;
            clearInterval(timer);
          }
          countElement.textContent = Math.floor(currentCount);
        }, stepTime);
        setTimeout(() => {
          countElement.style.opacity = "1";
        }, 300);
      }, index * 100);
    });
  }
  var COUNTRY_FLAGS, CACHE_TTL2, cachedPerformers, cachedModalContent, cacheTimestamp, weightCountdownInterval;
  var init_ui_stats = __esm({
    "ui-stats.js"() {
      init_api_client();
      init_math_utils();
      init_formatters();
      init_rating_utils();
      init_constants();
      COUNTRY_FLAGS = {
        "AD": "\u{1F1E6}\u{1F1E9}",
        "AE": "\u{1F1E6}\u{1F1EA}",
        "AF": "\u{1F1E6}\u{1F1EB}",
        "AG": "\u{1F1E6}\u{1F1EC}",
        "AI": "\u{1F1E6}\u{1F1EE}",
        "AL": "\u{1F1E6}\u{1F1F1}",
        "AM": "\u{1F1E6}\u{1F1F2}",
        "AO": "\u{1F1E6}\u{1F1F4}",
        "AQ": "\u{1F1E6}\u{1F1F6}",
        "AR": "\u{1F1E6}\u{1F1F7}",
        "AS": "\u{1F1E6}\u{1F1F8}",
        "AT": "\u{1F1E6}\u{1F1F9}",
        "AU": "\u{1F1E6}\u{1F1FA}",
        "AW": "\u{1F1E6}\u{1F1FC}",
        "AX": "\u{1F1E6}\u{1F1FD}",
        "AZ": "\u{1F1E6}\u{1F1FF}",
        "BA": "\u{1F1E7}\u{1F1E6}",
        "BB": "\u{1F1E7}\u{1F1E7}",
        "BD": "\u{1F1E7}\u{1F1E9}",
        "BE": "\u{1F1E7}\u{1F1EA}",
        "BF": "\u{1F1E7}\u{1F1EB}",
        "BG": "\u{1F1E7}\u{1F1EC}",
        "BH": "\u{1F1E7}\u{1F1ED}",
        "BI": "\u{1F1E7}\u{1F1EE}",
        "BJ": "\u{1F1E7}\u{1F1EF}",
        "BL": "\u{1F1E7}\u{1F1F1}",
        "BM": "\u{1F1E7}\u{1F1F2}",
        "BN": "\u{1F1E7}\u{1F1F3}",
        "BO": "\u{1F1E7}\u{1F1F4}",
        "BQ": "\u{1F1E7}\u{1F1F6}",
        "BR": "\u{1F1E7}\u{1F1F7}",
        "BS": "\u{1F1E7}\u{1F1F8}",
        "BT": "\u{1F1E7}\u{1F1F9}",
        "BV": "\u{1F1E7}\u{1F1FB}",
        "BW": "\u{1F1E7}\u{1F1FC}",
        "BY": "\u{1F1E7}\u{1F1FE}",
        "BZ": "\u{1F1E7}\u{1F1FF}",
        "CA": "\u{1F1E8}\u{1F1E6}",
        "CC": "\u{1F1E8}\u{1F1E8}",
        "CD": "\u{1F1E8}\u{1F1E9}",
        "CF": "\u{1F1E8}\u{1F1EB}",
        "CG": "\u{1F1E8}\u{1F1EC}",
        "CH": "\u{1F1E8}\u{1F1ED}",
        "CI": "\u{1F1E8}\u{1F1EE}",
        "CK": "\u{1F1E8}\u{1F1F0}",
        "CL": "\u{1F1E8}\u{1F1F1}",
        "CM": "\u{1F1E8}\u{1F1F2}",
        "CN": "\u{1F1E8}\u{1F1F3}",
        "CO": "\u{1F1E8}\u{1F1F4}",
        "CR": "\u{1F1E8}\u{1F1F7}",
        "CU": "\u{1F1E8}\u{1F1FA}",
        "CV": "\u{1F1E8}\u{1F1FB}",
        "CW": "\u{1F1E8}\u{1F1FC}",
        "CX": "\u{1F1E8}\u{1F1FD}",
        "CY": "\u{1F1E8}\u{1F1FE}",
        "CZ": "\u{1F1E8}\u{1F1FF}",
        "DE": "\u{1F1E9}\u{1F1EA}",
        "DJ": "\u{1F1E9}\u{1F1EF}",
        "DK": "\u{1F1E9}\u{1F1F0}",
        "DM": "\u{1F1E9}\u{1F1F2}",
        "DO": "\u{1F1E9}\u{1F1F4}",
        "DZ": "\u{1F1E9}\u{1F1FF}",
        "EC": "\u{1F1EA}\u{1F1E8}",
        "EE": "\u{1F1EA}\u{1F1EA}",
        "EG": "\u{1F1EA}\u{1F1EC}",
        "EH": "\u{1F1EA}\u{1F1ED}",
        "ER": "\u{1F1EA}\u{1F1F7}",
        "ES": "\u{1F1EA}\u{1F1F8}",
        "ET": "\u{1F1EA}\u{1F1F9}",
        "FI": "\u{1F1EB}\u{1F1EE}",
        "FJ": "\u{1F1EB}\u{1F1EF}",
        "FK": "\u{1F1EB}\u{1F1F0}",
        "FM": "\u{1F1EB}\u{1F1F2}",
        "FO": "\u{1F1EB}\u{1F1F4}",
        "FR": "\u{1F1EB}\u{1F1F7}",
        "GA": "\u{1F1EC}\u{1F1E6}",
        "GB": "\u{1F1EC}\u{1F1E7}",
        "GD": "\u{1F1EC}\u{1F1E9}",
        "GE": "\u{1F1EC}\u{1F1EA}",
        "GF": "\u{1F1EC}\u{1F1EB}",
        "GG": "\u{1F1EC}\u{1F1EC}",
        "GH": "\u{1F1EC}\u{1F1ED}",
        "GI": "\u{1F1EC}\u{1F1EE}",
        "GL": "\u{1F1EC}\u{1F1F1}",
        "GM": "\u{1F1EC}\u{1F1F2}",
        "GN": "\u{1F1EC}\u{1F1F3}",
        "GP": "\u{1F1EC}\u{1F1F5}",
        "GQ": "\u{1F1EC}\u{1F1F6}",
        "GR": "\u{1F1EC}\u{1F1F7}",
        "GS": "\u{1F1EC}\u{1F1F8}",
        "GT": "\u{1F1EC}\u{1F1F9}",
        "GU": "\u{1F1EC}\u{1F1FA}",
        "GW": "\u{1F1EC}\u{1F1FC}",
        "GY": "\u{1F1EC}\u{1F1FE}",
        "HK": "\u{1F1ED}\u{1F1F0}",
        "HM": "\u{1F1ED}\u{1F1F2}",
        "HN": "\u{1F1ED}\u{1F1F3}",
        "HR": "\u{1F1ED}\u{1F1F7}",
        "HT": "\u{1F1ED}\u{1F1F9}",
        "HU": "\u{1F1ED}\u{1F1FA}",
        "ID": "\u{1F1EE}\u{1F1E9}",
        "IE": "\u{1F1EE}\u{1F1EA}",
        "IL": "\u{1F1EE}\u{1F1F1}",
        "IM": "\u{1F1EE}\u{1F1F2}",
        "IN": "\u{1F1EE}\u{1F1F3}",
        "IO": "\u{1F1EE}\u{1F1F4}",
        "IQ": "\u{1F1EE}\u{1F1F6}",
        "IR": "\u{1F1EE}\u{1F1F7}",
        "IS": "\u{1F1EE}\u{1F1F8}",
        "IT": "\u{1F1EE}\u{1F1F9}",
        "JE": "\u{1F1EF}\u{1F1EA}",
        "JM": "\u{1F1EF}\u{1F1F2}",
        "JO": "\u{1F1EF}\u{1F1F4}",
        "JP": "\u{1F1EF}\u{1F1F5}",
        "KE": "\u{1F1F0}\u{1F1EA}",
        "KG": "\u{1F1F0}\u{1F1EC}",
        "KH": "\u{1F1F0}\u{1F1ED}",
        "KI": "\u{1F1F0}\u{1F1EE}",
        "KM": "\u{1F1F0}\u{1F1F2}",
        "KN": "\u{1F1F0}\u{1F1F3}",
        "KP": "\u{1F1F0}\u{1F1F5}",
        "KR": "\u{1F1F0}\u{1F1F7}",
        "KW": "\u{1F1F0}\u{1F1FC}",
        "KY": "\u{1F1F0}\u{1F1FE}",
        "KZ": "\u{1F1F0}\u{1F1FF}",
        "LA": "\u{1F1F1}\u{1F1E6}",
        "LB": "\u{1F1F1}\u{1F1E7}",
        "LC": "\u{1F1F1}\u{1F1E8}",
        "LI": "\u{1F1F1}\u{1F1EE}",
        "LK": "\u{1F1F1}\u{1F1F0}",
        "LR": "\u{1F1F1}\u{1F1F7}",
        "LS": "\u{1F1F1}\u{1F1F8}",
        "LT": "\u{1F1F1}\u{1F1F9}",
        "LU": "\u{1F1F1}\u{1F1FA}",
        "LV": "\u{1F1F1}\u{1F1FB}",
        "LY": "\u{1F1F1}\u{1F1FE}",
        "MA": "\u{1F1F2}\u{1F1E6}",
        "MC": "\u{1F1F2}\u{1F1E8}",
        "MD": "\u{1F1F2}\u{1F1E9}",
        "ME": "\u{1F1F2}\u{1F1EA}",
        "MF": "\u{1F1F2}\u{1F1EB}",
        "MG": "\u{1F1F2}\u{1F1EC}",
        "MH": "\u{1F1F2}\u{1F1ED}",
        "MK": "\u{1F1F2}\u{1F1F0}",
        "ML": "\u{1F1F2}\u{1F1F1}",
        "MM": "\u{1F1F2}\u{1F1F2}",
        "MN": "\u{1F1F2}\u{1F1F3}",
        "MO": "\u{1F1F2}\u{1F1F4}",
        "MP": "\u{1F1F2}\u{1F1F5}",
        "MQ": "\u{1F1F2}\u{1F1F6}",
        "MR": "\u{1F1F2}\u{1F1F7}",
        "MS": "\u{1F1F2}\u{1F1F8}",
        "MT": "\u{1F1F2}\u{1F1F9}",
        "MU": "\u{1F1F2}\u{1F1FA}",
        "MV": "\u{1F1F2}\u{1F1FB}",
        "MW": "\u{1F1F2}\u{1F1FC}",
        "MX": "\u{1F1F2}\u{1F1FD}",
        "MY": "\u{1F1F2}\u{1F1FE}",
        "MZ": "\u{1F1F2}\u{1F1FF}",
        "NA": "\u{1F1F3}\u{1F1E6}",
        "NC": "\u{1F1F3}\u{1F1E8}",
        "NE": "\u{1F1F3}\u{1F1EA}",
        "NF": "\u{1F1F3}\u{1F1EB}",
        "NG": "\u{1F1F3}\u{1F1EC}",
        "NI": "\u{1F1F3}\u{1F1EE}",
        "NL": "\u{1F1F3}\u{1F1F1}",
        "NO": "\u{1F1F3}\u{1F1F4}",
        "NP": "\u{1F1F3}\u{1F1F5}",
        "NR": "\u{1F1F3}\u{1F1F7}",
        "NU": "\u{1F1F3}\u{1F1FA}",
        "NZ": "\u{1F1F3}\u{1F1FF}",
        "OM": "\u{1F1F4}\u{1F1F2}",
        "PA": "\u{1F1F5}\u{1F1E6}",
        "PE": "\u{1F1F5}\u{1F1EA}",
        "PF": "\u{1F1F5}\u{1F1EB}",
        "PG": "\u{1F1F5}\u{1F1EC}",
        "PH": "\u{1F1F5}\u{1F1ED}",
        "PK": "\u{1F1F5}\u{1F1F0}",
        "PL": "\u{1F1F5}\u{1F1F1}",
        "PM": "\u{1F1F5}\u{1F1F2}",
        "PN": "\u{1F1F5}\u{1F1F3}",
        "PR": "\u{1F1F5}\u{1F1F7}",
        "PS": "\u{1F1F5}\u{1F1F8}",
        "PT": "\u{1F1F5}\u{1F1F9}",
        "PW": "\u{1F1F5}\u{1F1FC}",
        "PY": "\u{1F1F5}\u{1F1FE}",
        "QA": "\u{1F1F6}\u{1F1E6}",
        "RE": "\u{1F1F7}\u{1F1EA}",
        "RO": "\u{1F1F7}\u{1F1F4}",
        "RS": "\u{1F1F7}\u{1F1F8}",
        "RU": "\u{1F1F7}\u{1F1FA}",
        "RW": "\u{1F1F7}\u{1F1FC}",
        "SA": "\u{1F1F8}\u{1F1E6}",
        "SB": "\u{1F1F8}\u{1F1E7}",
        "SC": "\u{1F1F8}\u{1F1E8}",
        "SD": "\u{1F1F8}\u{1F1E9}",
        "SE": "\u{1F1F8}\u{1F1EA}",
        "SG": "\u{1F1F8}\u{1F1EC}",
        "SH": "\u{1F1F8}\u{1F1ED}",
        "SI": "\u{1F1F8}\u{1F1EE}",
        "SJ": "\u{1F1F8}\u{1F1EF}",
        "SK": "\u{1F1F8}\u{1F1F0}",
        "SL": "\u{1F1F8}\u{1F1F1}",
        "SM": "\u{1F1F8}\u{1F1F2}",
        "SN": "\u{1F1F8}\u{1F1F3}",
        "SO": "\u{1F1F8}\u{1F1F4}",
        "SR": "\u{1F1F8}\u{1F1F7}",
        "SS": "\u{1F1F8}\u{1F1F8}",
        "ST": "\u{1F1F8}\u{1F1F9}",
        "SV": "\u{1F1F8}\u{1F1FB}",
        "SX": "\u{1F1F8}\u{1F1FD}",
        "SY": "\u{1F1F8}\u{1F1FE}",
        "SZ": "\u{1F1F8}\u{1F1FF}",
        "TC": "\u{1F1F9}\u{1F1E8}",
        "TD": "\u{1F1F9}\u{1F1E9}",
        "TF": "\u{1F1F9}\u{1F1EB}",
        "TG": "\u{1F1F9}\u{1F1EC}",
        "TH": "\u{1F1F9}\u{1F1ED}",
        "TJ": "\u{1F1F9}\u{1F1EF}",
        "TK": "\u{1F1F9}\u{1F1F0}",
        "TL": "\u{1F1F9}\u{1F1F1}",
        "TM": "\u{1F1F9}\u{1F1F2}",
        "TN": "\u{1F1F9}\u{1F1F3}",
        "TO": "\u{1F1F9}\u{1F1F4}",
        "TR": "\u{1F1F9}\u{1F1F7}",
        "TT": "\u{1F1F9}\u{1F1F9}",
        "TV": "\u{1F1F9}\u{1F1FB}",
        "TW": "\u{1F1F9}\u{1F1FC}",
        "TZ": "\u{1F1F9}\u{1F1FF}",
        "UA": "\u{1F1FA}\u{1F1E6}",
        "UG": "\u{1F1FA}\u{1F1EC}",
        "UM": "\u{1F1FA}\u{1F1F2}",
        "US": "\u{1F1FA}\u{1F1F8}",
        "UY": "\u{1F1FA}\u{1F1FE}",
        "UZ": "\u{1F1FA}\u{1F1FF}",
        "VA": "\u{1F1FB}\u{1F1E6}",
        "VC": "\u{1F1FB}\u{1F1E8}",
        "VE": "\u{1F1FB}\u{1F1EA}",
        "VG": "\u{1F1FB}\u{1F1EC}",
        "VI": "\u{1F1FB}\u{1F1EE}",
        "VN": "\u{1F1FB}\u{1F1F3}",
        "VU": "\u{1F1FB}\u{1F1FA}",
        "WF": "\u{1F1FC}\u{1F1EB}",
        "WS": "\u{1F1FC}\u{1F1F8}",
        "YE": "\u{1F1FE}\u{1F1EA}",
        "YT": "\u{1F1FE}\u{1F1F9}",
        "ZA": "\u{1F1FF}\u{1F1E6}",
        "ZM": "\u{1F1FF}\u{1F1F2}",
        "ZW": "\u{1F1FF}\u{1F1FC}"
      };
      CACHE_TTL2 = 30 * 1e3;
      cachedPerformers = null;
      cachedModalContent = null;
      cacheTimestamp = 0;
      weightCountdownInterval = null;
    }
  });

  // ui-dashboard.js
  var ui_dashboard_exports = {};
  __export(ui_dashboard_exports, {
    attachEventListeners: () => attachEventListeners,
    createMainUI: () => createMainUI,
    handleGenderToggle: () => handleGenderToggle,
    setMode: () => setMode,
    updateSkipButtonVisibility: () => updateSkipButtonVisibility
  });
  function createSkeletonHTML(count, extraClass = "") {
    const cards = Array.from({ length: count }, () => `
    <div class="hon-skeleton-card">
      <div class="hon-skeleton-img"></div>
      <div class="hon-skeleton-text"></div>
      <div class="hon-skeleton-text short"></div>
    </div>
  `).join("");
    return `<div class="hon-skeleton-grid ${extraClass}">${cards}</div>`;
  }
  function createMainUI() {
    const isPerformers = state.battleType === "performers";
    const genderFilterHTML = isPerformers ? `
    <div class="hon-gender-filter">
      <div class="hon-gender-btns">
        ${ALL_GENDERS.map((g) => `
          <button
            class="hon-gender-btn ${state.selectedGenders.includes(g.value) ? "active" : ""}"
            data-gender="${g.value}"
          >
            ${g.label}
          </button>`).join("")}
      </div>
    </div>` : "";
    return `
    <div id="hotornot-container" class="hon-container">
      <div class="hon-header">
        <h1 class="hon-title">Ascension</h1>

        ${genderFilterHTML}
        ${isPerformers ? `<button id="hon-stats-btn" class="btn btn-primary">\u{1F4CA} View All Stats</button>` : ""}
      </div>
      <div id="hon-performer-selection" style="display: none;">
        <div id="hon-performer-list">${createSkeletonHTML(6)}</div>
      </div>
      <div class="hon-content">
        <div id="hon-comparison-area">${createSkeletonHTML(2, "hon-comparison-skeleton")}</div>
        <div class="hon-actions">
          <div class="hon-action-buttons">
            <button id="hon-skip-btn" class="hon-action-btn" title="Skip">\u23ED\uFE0F</button>
            <button id="hon-undo-btn" class="hon-action-btn" title="">\u21A9</button>
          </div>
        </div>
        <div class="hon-keyboard-hints">
          <span class="hon-hint"><strong>\u2B05\uFE0F</strong> Choose Left</span>
          <span class="hon-hint"><strong>\u27A1\uFE0F</strong> Choose Right</span>
          <span class="hon-hint"><strong>Space</strong> to Skip</span>
          <span class="hon-hint"><strong>Ctrl+Z</strong> to Undo</span>
          <span class="hon-hint"><strong>ESC</strong> to Exit</span>
        </div>
      </div>
    </div>`;
  }
  function updateSkipButtonVisibility() {
    const skipBtn = document.getElementById("hon-skip-btn");
    if (!skipBtn)
      return;
    const isSkippableMode = state.currentMode === "swiss" || state.currentMode === "scenes" || state.currentMode === "gauntlet" || state.currentMode === "champion";
    skipBtn.style.display = isSkippableMode ? "inline-block" : "none";
  }
  function attachEventListeners(parent = document) {
    if (!attachedElements.has(parent)) {
      attachedElements.set(parent, /* @__PURE__ */ new Set());
    }
    const attachedSet = attachedElements.get(parent);
    const statsBtn = parent.querySelector("#hon-stats-btn");
    if (statsBtn && !attachedSet.has("statsBtn")) {
      const handler = () => {
        Promise.resolve().then(() => (init_ui_stats(), ui_stats_exports)).then((m) => m.openStatsModal());
      };
      statsBtn.addEventListener("click", handler);
      attachedSet.add("statsBtn");
    }
    const performerLinks = parent.querySelectorAll(".hon-performer-link, .hon-gauntlet-select-img");
    performerLinks.forEach((link, index) => {
      const key = `link-${index}`;
      if (!attachedSet.has(key)) {
        const handler = (e) => e.stopPropagation();
        link.addEventListener("click", handler);
        attachedSet.add(key);
      }
    });
    const skipBtn = parent.querySelector("#hon-skip-btn");
    if (skipBtn && !attachedSet.has("skipBtn")) {
      updateSkipButtonVisibility();
      const handler = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isSkippableMode = state.currentMode === "swiss" || state.currentMode === "scenes" || state.currentMode === "gauntlet" || state.currentMode === "champion";
        if (isSkippableMode) {
          const { handleSkip: handleSkip2 } = await Promise.resolve().then(() => (init_match_handler(), match_handler_exports));
          handleSkip2();
        }
      };
      skipBtn.addEventListener("click", handler);
      attachedSet.add("skipBtn");
    }
    const undoBtn = parent.querySelector("#hon-undo-btn");
    if (undoBtn && !attachedSet.has("undoBtn")) {
      const handler = () => handleUndo();
      undoBtn.onclick = handler;
      undoBtn.style.display = state.matchHistory && state.matchHistory.length > 0 ? "inline-block" : "none";
      attachedSet.add("undoBtn");
    }
    const genderButtons = parent.querySelectorAll(".hon-gender-btn");
    genderButtons.forEach((btn, index) => {
      const key = `gender-${index}`;
      if (!attachedSet.has(key)) {
        const handler = () => handleGenderToggle(btn.dataset.gender);
        btn.addEventListener("click", handler);
        attachedSet.add(key);
      }
    });
    const modeButtons = parent.querySelectorAll(".hon-mode-btn");
    modeButtons.forEach((btn, index) => {
      const key = `mode-${index}`;
      if (!attachedSet.has(key)) {
        const handler = async () => {
          const rawMode = btn.dataset.mode;
          const newMode = rawMode === "placement" ? "gauntlet" : rawMode;
          if (newMode === "gauntlet" || newMode === "champion") {
            resetBattleState();
          }
          state.currentMode = newMode;
          modeButtons.forEach((button) => {
            const buttonRawMode = button.dataset.mode;
            const buttonNormalizedMode = buttonRawMode === "placement" ? "gauntlet" : buttonRawMode;
            button.classList.toggle("active", buttonNormalizedMode === newMode);
          });
          const modal = document.getElementById("hon-modal");
          if (modal) {
            modal.classList.remove("hon-mode-champion", "hon-mode-swiss", "hon-mode-gauntlet", "hon-mode-placement");
            modal.classList.add(`hon-mode-${rawMode}`);
          }
          const selectionContainer = document.getElementById("hon-performer-selection");
          const comparisonArea = document.getElementById("hon-comparison-area");
          const actionsEl = document.querySelector(".hon-actions");
          if (newMode === "swiss") {
            if (selectionContainer)
              selectionContainer.style.display = "none";
            if (comparisonArea)
              comparisonArea.style.display = "";
            if (actionsEl)
              actionsEl.style.display = "";
            loadNewPair();
          } else if (newMode === "gauntlet" || newMode === "champion") {
            if (selectionContainer)
              selectionContainer.style.display = "block";
            if (comparisonArea)
              comparisonArea.style.display = "none";
            if (actionsEl)
              actionsEl.style.display = "none";
            Promise.resolve().then(() => (init_gauntlet_selection(), gauntlet_selection_exports)).then((m) => m.loadPerformerSelection());
          }
          updateSkipButtonVisibility();
        };
        btn.addEventListener("click", handler);
        attachedSet.add(key);
      }
    });
  }
  function handleGenderToggle(gender) {
    const isSelected = state.selectedGenders.includes(gender);
    if (isSelected) {
      state.selectedGenders = state.selectedGenders.filter((g) => g !== gender);
    } else {
      state.selectedGenders.push(gender);
    }
    try {
      localStorage.setItem("hotornot_selected_genders", JSON.stringify(state.selectedGenders));
    } catch (e) {
      console.warn("[Ascension] Could not save gender selection to localStorage:", e);
    }
    console.log(`[Ascension] Gender Filter Updated: ${state.selectedGenders.join(", ")}`);
    const genderBtns = document.querySelectorAll(`.hon-gender-btn[data-gender="${gender}"]`);
    genderBtns.forEach((btn) => {
      btn.classList.toggle("active", !isSelected);
    });
    loadNewPair();
  }
  function setMode(mode) {
    const rawMode = mode;
    const normalizedMode = rawMode === "placement" ? "gauntlet" : rawMode;
    if (normalizedMode === "gauntlet" || normalizedMode === "champion") {
      resetBattleState();
    }
    state.currentMode = normalizedMode;
    const selEl = document.getElementById("hon-performer-selection");
    const compEl = document.getElementById("hon-comparison-area");
    if (selEl)
      selEl.style.display = "none";
    if (compEl)
      compEl.style.display = "none";
    const modal = document.getElementById("hon-modal");
    if (modal) {
      modal.classList.remove("hon-mode-champion", "hon-mode-swiss", "hon-mode-gauntlet", "hon-mode-placement");
      modal.classList.add(`hon-mode-${rawMode}`);
    }
    if (normalizedMode === "gauntlet" || normalizedMode === "champion") {
      Promise.resolve().then(() => (init_gauntlet_selection(), gauntlet_selection_exports)).then((m) => m.loadPerformerSelection());
    }
    updateSkipButtonVisibility();
  }
  var attachedElements;
  var init_ui_dashboard = __esm({
    "ui-dashboard.js"() {
      init_state();
      init_dom_utils();
      init_constants();
      init_battle_engine();
      init_match_handler();
      attachedElements = /* @__PURE__ */ new WeakMap();
    }
  });

  // ui-event-log.js
  function initEventLog() {
    console.log = function(...args) {
      originalConsoleLog.apply(console, args);
      captureLogEntry("log", args);
    };
    console.warn = function(...args) {
      originalConsoleWarn.apply(console, args);
      captureLogEntry("warn", args);
    };
    console.error = function(...args) {
      originalConsoleError.apply(console, args);
      captureLogEntry("error", args);
    };
    createEventLogUI();
  }
  function captureLogEntry(level, args) {
    const fullMessage = args.map((arg) => {
      if (typeof arg === "object" && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(" ");
    if (!fullMessage.includes("[Ascension]") && !fullMessage.includes("[HotOrNot]")) {
      return;
    }
    const readableMessage = extractReadableContent(args);
    let tierInfo = null;
    if (readableMessage.includes("Tier Selection:")) {
      const tierMatch = readableMessage.match(/Tier Selection: ([\w\-]+)/);
      if (tierMatch && tierMatch[1]) {
        tierInfo = tierMatch[1];
      }
    }
    let tierFilterTiers = null;
    if (readableMessage.includes("Tier Filter active:")) {
      const tierFilterMatch = readableMessage.match(/Tier Filter active: ([\w\-,\s]+)/);
      if (tierFilterMatch && tierFilterMatch[1]) {
        tierFilterTiers = tierFilterMatch[1].split(",").map((t) => t.trim()).filter(Boolean);
      }
    }
    const entry = {
      id: Date.now() + Math.random(),
      timestamp: /* @__PURE__ */ new Date(),
      level,
      message: readableMessage,
      formattedMessage: readableMessage,
      tierInfo,
      tierFilterTiers,
      battleType: state.battleType
      // Store mode at capture time for accurate export labels
    };
    eventLogEntries.push(entry);
    if (eventLogEntries.length > MAX_LOG_ENTRIES) {
      eventLogEntries.splice(0, eventLogEntries.length - MAX_LOG_ENTRIES);
    }
    updateEventLogDisplay();
  }
  function saveEventLogState(state2) {
    try {
      localStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(state2));
    } catch (e) {
      console.warn("[Ascension] Failed to save event log state:", e);
    }
  }
  function loadEventLogState() {
    try {
      const data = localStorage.getItem(EVENT_LOG_STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.warn("[Ascension] Failed to load event log state:", e);
      return {};
    }
  }
  function extractReadableContent(args) {
    let cleanParts = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "%c" || typeof arg === "string" && (arg.startsWith("color:") || arg.startsWith("font-weight:") || arg.startsWith("background:"))) {
        continue;
      }
      if (typeof arg === "object" && arg !== null) {
        try {
          cleanParts.push(JSON.stringify(arg));
        } catch (e) {
          cleanParts.push(String(arg));
        }
      } else {
        cleanParts.push(String(arg));
      }
    }
    let result = cleanParts.join(" ").replace(/%c/g, "").replace(/\s+/g, " ").trim();
    return result;
  }
  function createEventLogUI() {
    if (document.getElementById("hon-event-log")) {
      return;
    }
    const logContainer = document.createElement("div");
    logContainer.id = "hon-event-log";
    logContainer.className = "hon-event-log-container";
    logContainer.innerHTML = `
    <div class="hon-event-log-header">
      <span class="hon-event-log-title">\u{1F4D1} Log</span>
      <div class="hon-event-log-controls">
        <button id="hon-event-log-export" class="hon-event-log-btn" title="Export Log">\u{1F4BE}</button>
        <button id="hon-event-log-clear" class="hon-event-log-btn" title="Clear Log">\u{1F5D1}\uFE0F</button>
        <button id="hon-event-log-toggle" class="hon-event-log-btn" title="Toggle Visibility">\u{1F441}\uFE0F</button>
        <button id="hon-event-log-close" class="hon-event-log-btn" title="Close Log">\u2715</button>
      </div>
    </div>
    <div class="hon-event-log-content" id="hon-event-log-content"></div>
    <div class="hon-event-log-resize-handle" id="hon-event-log-resize"></div>
    <div class="hon-event-log-resize-handle-horizontal" id="hon-event-log-resize-horizontal"></div>
  `;
    const savedState = loadEventLogState();
    if (savedState.height) {
      logContainer.style.height = savedState.height;
    }
    if (savedState.width) {
      logContainer.style.width = savedState.width;
    }
    waitForModalAndInject(logContainer);
  }
  function waitForModalAndInject(logContainer) {
    const checkInterval = setInterval(() => {
      const pluginLayout = document.querySelector(".hon-plugin-layout");
      if (pluginLayout) {
        const isMobileView = window.innerWidth <= 768;
        if (isMobileView) {
          pluginLayout.appendChild(logContainer);
        } else {
          pluginLayout.appendChild(logContainer);
        }
        setupEventLogEventListeners();
        updateEventLogDisplay();
        clearInterval(checkInterval);
        if (!isMobileView) {
          setupLayoutConstraints(pluginLayout, logContainer);
        }
      }
    }, 100);
    setTimeout(() => clearInterval(checkInterval), 5e3);
  }
  function setupLayoutConstraints(pluginLayout, logContainer) {
    if (layoutObserver) {
      layoutObserver.disconnect();
    }
    layoutObserver = new ResizeObserver(() => {
      constrainEventLogPosition(pluginLayout, logContainer);
    });
    layoutObserver.observe(pluginLayout);
    constrainEventLogPosition(pluginLayout, logContainer);
  }
  function constrainEventLogPosition(pluginLayout, logContainer) {
    if (!pluginLayout || !logContainer)
      return;
    const rect = pluginLayout.getBoundingClientRect();
    const logRect = logContainer.getBoundingClientRect();
    const sidebar = pluginLayout.querySelector(".hon-sidebar");
    const mainContent = pluginLayout.querySelector(".hon-main-plugin-content");
    if (sidebar && mainContent) {
      const sidebarRect = sidebar.getBoundingClientRect();
      const mainRect = mainContent.getBoundingClientRect();
      const maxWidth = mainRect.left - rect.left - 20;
      if (maxWidth > 100) {
        logContainer.style.maxWidth = `${maxWidth}px`;
      }
    }
  }
  function setupEventLogEventListeners() {
    const exportBtn = document.getElementById("hon-event-log-export");
    const clearBtn = document.getElementById("hon-event-log-clear");
    const toggleBtn = document.getElementById("hon-event-log-toggle");
    const closeBtn = document.getElementById("hon-event-log-close");
    const resizeHandle = document.getElementById("hon-event-log-resize");
    const horizontalResizeHandle = document.getElementById("hon-event-log-resize-horizontal");
    if (exportBtn) {
      exportBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        exportLogEntries();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        eventLogEntries = [];
        updateEventLogDisplay();
      });
    }
    if (toggleBtn) {
      toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const content = document.querySelector(".hon-event-log-content");
        const isVisible = content.style.display !== "none";
        content.style.display = isVisible ? "none" : "block";
        toggleBtn.textContent = isVisible ? "\u{1F441}\uFE0F" : "\u{1F6AB}";
        toggleBtn.title = isVisible ? "Show Log" : "Hide Log";
        saveEventLogState({ closed: !isVisible });
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const logContainer = document.getElementById("hon-event-log");
        if (logContainer) {
          logContainer.style.display = "none";
        }
      });
    }
    if (resizeHandle) {
      setupResizeHandler(resizeHandle);
    }
    if (horizontalResizeHandle) {
      setupResizeHandler(horizontalResizeHandle);
    }
  }
  function setupResizeHandler(resizeHandle) {
    let isResizing = false;
    resizeHandle.addEventListener("mousedown", (e) => {
      isResizing = true;
      e.preventDefault();
      e.stopPropagation();
      const logContainer = document.getElementById("hon-event-log");
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = parseInt(document.defaultView.getComputedStyle(logContainer).width, 10);
      const startHeight = parseInt(document.defaultView.getComputedStyle(logContainer).height, 10);
      const isHorizontalResize = e.target.classList.contains("hon-event-log-resize-handle-horizontal");
      const doDrag = (e2) => {
        if (!isResizing)
          return;
        e2.preventDefault();
        if (isHorizontalResize) {
          const newWidth = startWidth + (e2.clientX - startX);
          const clampedWidth = Math.max(200, Math.min(800, newWidth));
          logContainer.style.width = clampedWidth + "px";
        } else {
          const newHeight = startHeight - (e2.clientY - startY);
          const clampedHeight = Math.max(100, Math.min(500, newHeight));
          logContainer.style.height = clampedHeight + "px";
        }
      };
      const stopDrag = () => {
        isResizing = false;
        document.removeEventListener("mousemove", doDrag);
        document.removeEventListener("mouseup", stopDrag);
        const logContainer2 = document.getElementById("hon-event-log");
        if (logContainer2) {
          saveEventLogState({
            height: logContainer2.style.height,
            width: logContainer2.style.width
          });
        }
      };
      document.addEventListener("mousemove", doDrag);
      document.addEventListener("mouseup", stopDrag);
    });
  }
  function exportLogEntries() {
    if (eventLogEntries.length === 0) {
      alert("No log entries to export");
      return;
    }
    const logText = eventLogEntries.map((entry) => {
      const timeString = entry.timestamp.toLocaleString();
      const level = entry.level.toUpperCase();
      const itemLabel = entry.battleType === "scenes" ? "Scene" : "Performer";
      let message = entry.message;
      message = message.replace(
        /(\[Ascension\] (?:Match|CROSS-TIER|Custom Cross-Tier): )([^(]+)(\s+\([^)]+\))/g,
        "$1PerformerA$3"
      );
      message = message.replace(
        /(vs\s+)([^(]+)(\s+\([^)]+\))/g,
        "$1PerformerB$3"
      );
      message = message.replace(
        /(\[Ascension\] Updating: )(.+?)\s*\(ID: (\d+)\)/g,
        `$1${itemLabel} (ID: $3)`
      );
      message = message.replace(
        /(\[Ascension\] Champion Selected: )([^(]+)(\s+\([^)]+\))/g,
        "$1PerformerA$3"
      );
      return `[${timeString}] ${level}: ${message}`;
    }).join("\n");
    const blob = new Blob([logText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const fileName = `battle-log-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    addEventLog(`Log exported to file: ${fileName}`, "log");
  }
  function updateEventLogDisplay() {
    const content = document.getElementById("hon-event-log-content");
    if (!content)
      return;
    const isScrolledToBottom = content.scrollHeight - content.clientHeight <= content.scrollTop + 1;
    const existingEntriesCount = content.querySelectorAll(".hon-log-entry").length;
    const newEntriesCount = eventLogEntries.length;
    const tierColors = {
      "any": "#00ff00",
      "newcomers": "#00ff00",
      "S-Tier": "#eb9834",
      "A-Tier": "#e014aa",
      "B-Tier": "#7f1e82",
      "C-Tier": "#14bbe0",
      "D-Tier": "#92e014",
      "F-Tier": "#808080"
    };
    const allEntriesHTML = eventLogEntries.map((entry, index) => {
      const timeString = entry.timestamp.toLocaleTimeString();
      const levelClass = `hon-log-${entry.level}`;
      const isNewEntry = index >= existingEntriesCount;
      const animationClass = isNewEntry ? "new-entry" : "";
      let messageText = entry.formattedMessage.replace(/%c/g, "").trim();
      let messageHtml = messageText;
      messageHtml = messageHtml.replace(
        /\[Ascension\]/g,
        '[<span style="color: #1cb4d6; font-weight: bold;">Ascension</span>]'
      );
      messageHtml = messageHtml.replace(/\bWIN\b/g, '<span style="color: #4CAF50; font-weight: bold;">WIN</span>').replace(/\bLOSS\b/g, '<span style="color: #F44336; font-weight: bold;">LOSS</span>').replace(/\bDRAW\b/g, '<span style="color: #9E9E9E; font-weight: bold;">DRAW</span>');
      const placeholders = [];
      function addPlaceholder(html) {
        const key = `__HON_FMT_${placeholders.length}__`;
        placeholders.push({ key, html });
        return key;
      }
      messageHtml = messageHtml.replace(/\(\+(\d+(?:\.\d+)?)\)/g, (_, num) => addPlaceholder(`(<span style="color: #4CAF50; font-weight: bold;">+${num}</span>)`)).replace(/\(-(\d+(?:\.\d+)?)\)/g, (_, num) => addPlaceholder(`(<span style="color: #F44336; font-weight: bold;">-${num}</span>)`));
      messageHtml = messageHtml.replace(
        /Ascended:\s*(\d+(?:\.\d+)?)/g,
        (_, num) => addPlaceholder(`Ascended: <span style="color: #eb9834; font-weight: bold;">${num}</span>`)
      );
      messageHtml = messageHtml.replace(
        /\(\s*ID\s*:\s*(\d+)\s*\)/g,
        '(<span style="color: #1cb4d6;">ID: $1</span>)'
      );
      messageHtml = messageHtml.replace(
        /\(\s*w\s*:\s*([\d\.]+)\s*\)/g,
        '(w: <span style="color: #FF69B4; font-weight: bold;">$1</span>)'
      );
      messageHtml = messageHtml.replace(
        /\[([\d\.]+)\]/g,
        '[<span style="color: #1cb4d6;">$1</span>]'
      );
      messageHtml = messageHtml.replace(
        /\bvs\b/g,
        '<span style="color: #888;">vs</span>'
      );
      messageHtml = messageHtml.replace(
        /Weight\s*:/g,
        '<span style="color: #888;">Weight:</span>'
      );
      messageHtml = messageHtml.replace(
        /Total Match Count\s*:/g,
        '<span style="color: #888;">Total Match Count:</span>'
      );
      messageHtml = messageHtml.replace(
        /\b(\d+\.\d+)\b/g,
        '<span style="color: #FF69B4; font-weight: bold;">$1</span>'
      );
      messageHtml = messageHtml.replace(
        /(CROSS-TIER:)/g,
        '<span style="color: #E91E63; font-weight: bold;">$1</span>'
      );
      messageHtml = messageHtml.replace(
        /(Custom Cross-Tier:)/g,
        '<span style="color: #E91E63; font-weight: bold;">$1</span>'
      );
      placeholders.forEach(({ key, html }) => {
        messageHtml = messageHtml.replace(key, html);
      });
      if (entry.tierInfo) {
        let tierColor = tierColors[entry.tierInfo] || "#00ff00";
        const tierRegex = new RegExp(`(Tier Selection:)\\\\s+(${entry.tierInfo})`);
        messageHtml = messageHtml.replace(
          tierRegex,
          `$1 <span style="color: ${tierColor}; font-weight: bold;">$2</span>`
        );
      }
      if (entry.tierFilterTiers && entry.tierFilterTiers.length > 0) {
        const tierListHtml = entry.tierFilterTiers.map((tier) => {
          const color = tierColors[tier] || "#00ff00";
          return `<span style="color: ${color}; font-weight: bold;">${tier}</span>`;
        }).join('<span style="color: #888;">, </span>');
        messageHtml = messageHtml.replace(
          /(Tier Filter active:)\s+([\w\-,\s]+)/,
          `$1 ${tierListHtml}`
        );
      }
      return `
      <div class="hon-log-entry ${levelClass} ${animationClass}" data-entry-id="${entry.id}">
        <span class="hon-log-timestamp">${timeString}</span>
        <span class="hon-log-message">${messageHtml}</span>
      </div>
    `;
    }).join("");
    content.innerHTML = allEntriesHTML;
    if (isScrolledToBottom) {
      content.scrollTop = content.scrollHeight;
    }
    setTimeout(() => {
      const newEntries = content.querySelectorAll(".new-entry");
      newEntries.forEach((entry) => {
        entry.classList.remove("new-entry");
      });
    }, 400);
  }
  function addEventLog(message, level = "log") {
    const entry = {
      id: Date.now() + Math.random(),
      timestamp: /* @__PURE__ */ new Date(),
      level,
      message: `[Ascension] ${message}`,
      formattedMessage: message,
      battleType: state.battleType
    };
    eventLogEntries.push(entry);
    if (eventLogEntries.length > MAX_LOG_ENTRIES) {
      eventLogEntries.splice(0, eventLogEntries.length - MAX_LOG_ENTRIES);
    }
    updateEventLogDisplay();
  }
  function destroyEventLog() {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    const logContainer = document.getElementById("hon-event-log");
    if (logContainer) {
      logContainer.remove();
    }
    eventLogEntries = [];
    if (layoutObserver) {
      layoutObserver.disconnect();
      layoutObserver = null;
    }
    try {
      localStorage.removeItem(EVENT_LOG_STORAGE_KEY);
    } catch (e) {
      console.warn("[Ascension] Failed to clear event log state:", e);
    }
  }
  var eventLogEntries, MAX_LOG_ENTRIES, originalConsoleLog, originalConsoleWarn, originalConsoleError, layoutObserver, EVENT_LOG_STORAGE_KEY;
  var init_ui_event_log = __esm({
    "ui-event-log.js"() {
      init_state();
      eventLogEntries = [];
      MAX_LOG_ENTRIES = 100;
      originalConsoleLog = console.log;
      originalConsoleWarn = console.warn;
      originalConsoleError = console.error;
      layoutObserver = null;
      EVENT_LOG_STORAGE_KEY = "hon-event-log-state";
    }
  });

  // ui-sidebar.js
  var ui_sidebar_exports = {};
  __export(ui_sidebar_exports, {
    attachSidebarEventListeners: () => attachSidebarEventListeners,
    autoShowOptionsIfNoGenders: () => autoShowOptionsIfNoGenders,
    createSidebar: () => createSidebar,
    openOptionsPanel: () => openOptionsPanel,
    toggleGender: () => toggleGender,
    toggleTier: () => toggleTier
  });
  function createSidebar() {
    const savedMode = localStorage.getItem("hotornot_selected_mode");
    if (savedMode) {
      state.currentMode = savedMode;
    }
    const swissActive = state.currentMode === "swiss" ? "active" : "";
    const gauntletActive = state.currentMode === "gauntlet" ? "active" : "";
    const championActive = state.currentMode === "champion" ? "active" : "";
    const mobileClass = isMobile() ? "mobile" : "";
    return `
    <div id="hon-sidebar" class="hon-sidebar ${mobileClass}">
      <div class="hon-sidebar-content">
        <!-- Main Performer Matchmaking Section -->
        <div class="hon-sidebar-section">
          <!-- Flattened Mode Options -->
          <div class="hon-sidebar-row ${swissActive}" data-mode="swiss">
            <span class="hon-sidebar-row-text"><span class="hon-mode-icon">\u{1F94A}</span> Head to Head</span>
          </div>
          <div class="hon-sidebar-row ${gauntletActive}" data-mode="gauntlet">
            <span class="hon-sidebar-row-text"><span class="hon-mode-icon">\u269C\uFE0F</span> Placement Mode</span>
          </div>
          <div class="hon-sidebar-row ${championActive}" data-mode="champion">
            <span class="hon-sidebar-row-text"><span class="hon-mode-icon">\u{1F3C6}</span> Champion Mode</span>
          </div>
          <div class="hon-sidebar-row" data-mode="scenes">
            <span class="hon-sidebar-row-text"><span class="hon-mode-icon">\u{1F3AC}</span> Scene Mode</span>
          </div>

          <!-- View All Stats Row -->
          <div class="hon-sidebar-row" data-action="view-stats">
            <span class="hon-sidebar-row-text"><span class="hon-mode-icon">\u{1F4CA}</span> View All Stats</span>
          </div>

          <!-- Options Row -->
          <div class="hon-sidebar-row" data-action="open-options">
            <span class="hon-sidebar-row-text"><span class="hon-mode-icon">\u2699\uFE0F</span> Options</span>
          </div>
        </div>
      </div>
    </div>
  `;
  }
  function attachSidebarEventListeners(container) {
    const expandableRows = container.querySelectorAll(".hon-sidebar-expandable");
    expandableRows.forEach((row) => {
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetId = row.dataset.target;
        const content = container.querySelector(`#${targetId}`);
        const icon = row.querySelector(".hon-sidebar-expand-icon");
        if (content && icon) {
          const isExpanded = content.style.display === "block";
          content.style.display = isExpanded ? "none" : "block";
          icon.textContent = isExpanded ? "\u25B6" : "\u{1F53D}";
          row.classList.toggle("expanded", !isExpanded);
        }
      });
    });
    const modeRows = container.querySelectorAll(".hon-sidebar-row[data-mode]");
    modeRows.forEach((row) => {
      row.addEventListener("click", async (e) => {
        e.stopPropagation();
        const mode = row.dataset.mode;
        const previousMode = state.currentMode;
        if (optionsRestoreState.optionsOpen) {
          closeOptionsPanel();
        }
        const modeNames = {
          "swiss": "Head to Head",
          "gauntlet": "Placement Mode",
          "champion": "Champion Mode",
          "scenes": "Scene Mode"
        };
        addEventLog(`User changed mode to: ${modeNames[mode] || mode}`, "log");
        if (mode === "gauntlet" || mode === "champion" || previousMode === "gauntlet" || previousMode === "champion") {
          resetBattleState();
        }
        state.currentMode = mode;
        try {
          localStorage.setItem("hotornot_selected_mode", mode);
        } catch (err) {
          console.warn("[Ascension] Could not save mode selection to localStorage:", err);
        }
        modeRows.forEach((r) => r.classList.remove("active"));
        row.classList.add("active");
        const selectionContainer = document.getElementById("hon-performer-selection");
        const comparisonArea = document.getElementById("hon-comparison-area");
        const actionsEl = document.querySelector(".hon-actions");
        const modal = document.getElementById("hon-modal");
        if (modal) {
          modal.classList.remove("hon-mode-champion", "hon-mode-swiss", "hon-mode-gauntlet", "hon-mode-scenes", "hon-mode-placement");
          modal.classList.add(`hon-mode-${mode}`);
        }
        if (mode === "scenes") {
          state.battleType = "scenes";
        } else {
          state.battleType = "performers";
        }
        if (mode === "swiss") {
          if (selectionContainer)
            selectionContainer.style.display = "none";
          if (comparisonArea)
            comparisonArea.style.display = "";
          if (actionsEl)
            actionsEl.style.display = "";
          const { loadNewPair: loadNewPair2 } = await Promise.resolve().then(() => (init_battle_engine(), battle_engine_exports));
          loadNewPair2();
        } else if (mode === "gauntlet" || mode === "champion") {
          if (selectionContainer)
            selectionContainer.style.display = "block";
          if (comparisonArea)
            comparisonArea.style.display = "none";
          if (actionsEl)
            actionsEl.style.display = "none";
          Promise.resolve().then(() => (init_gauntlet_selection(), gauntlet_selection_exports)).then((m) => m.loadPerformerSelection());
        } else if (mode === "scenes") {
          if (selectionContainer)
            selectionContainer.style.display = "none";
          if (comparisonArea)
            comparisonArea.style.display = "";
          if (actionsEl)
            actionsEl.style.display = "";
          const { loadNewPair: loadNewPair2 } = await Promise.resolve().then(() => (init_battle_engine(), battle_engine_exports));
          loadNewPair2();
        }
        updateSkipButtonVisibility();
      });
    });
    const actionRows = container.querySelectorAll(".hon-sidebar-row[data-action]");
    actionRows.forEach((row) => {
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = row.dataset.action;
        if (action === "view-stats") {
          if (optionsRestoreState.optionsOpen) {
            closeOptionsPanel();
          }
          Promise.resolve().then(() => (init_ui_stats(), ui_stats_exports)).then((m) => m.openStatsModal());
        }
        if (action === "open-options") {
          if (optionsRestoreState.optionsOpen) {
            restoreVsContainer();
          } else {
            openOptionsPanel();
          }
        }
      });
    });
    autoShowOptionsIfNoGenders();
  }
  async function toggleGender(gender, { skipReload = false } = {}) {
    if (state.selectedGenders.includes(gender)) {
      state.selectedGenders = state.selectedGenders.filter((g) => g !== gender);
    } else {
      state.selectedGenders.push(gender);
    }
    try {
      localStorage.setItem("hotornot_selected_genders", JSON.stringify(state.selectedGenders));
    } catch (err) {
      console.warn("[Ascension] Could not save gender selection to localStorage:", err);
    }
    document.querySelectorAll(".hon-options-checkbox[data-gender]").forEach((label) => {
      const genderValue = label.dataset.gender;
      const checkbox = label.querySelector('input[type="checkbox"]');
      const isSelected = state.selectedGenders.includes(genderValue);
      label.classList.toggle("active", isSelected);
      if (checkbox)
        checkbox.checked = isSelected;
    });
    if (!skipReload && state.battleType === "performers") {
      const { loadNewPair: loadNewPair2 } = await Promise.resolve().then(() => (init_battle_engine(), battle_engine_exports));
      loadNewPair2();
    }
  }
  async function toggleTier(tier, { skipReload = false } = {}) {
    let tiers = [...state.selectedTiers];
    if (tier === "any") {
      tiers = ["any"];
    } else {
      tiers = tiers.filter((t) => t !== "any");
      if (tiers.includes(tier)) {
        tiers = tiers.filter((t) => t !== tier);
      } else {
        tiers.push(tier);
      }
      if (tiers.length === 0) {
        tiers = ["any"];
      }
    }
    state.selectedTiers = tiers;
    try {
      localStorage.setItem("hotornot_selected_tiers", JSON.stringify(tiers));
    } catch (err) {
      console.warn("[Ascension] Could not save tier selection to localStorage:", err);
    }
    syncTierCheckboxUI();
    const warningSlot = document.getElementById("hon-tier-warning-slot");
    if (warningSlot) {
      warningSlot.innerHTML = getTierGapWarningHTML(tiers);
    }
    if (!skipReload && state.battleType === "performers" && state.currentMode === "swiss") {
      const { loadNewPair: loadNewPair2 } = await Promise.resolve().then(() => (init_battle_engine(), battle_engine_exports));
      loadNewPair2();
    }
  }
  function openOptionsPanel() {
    if (optionsRestoreState.optionsOpen)
      return;
    const selectionContainer = document.getElementById("hon-performer-selection");
    const comparisonArea = document.getElementById("hon-comparison-area");
    optionsRestoreState.wasSelectionVisible = selectionContainer && selectionContainer.style.display !== "none";
    optionsRestoreState.wasComparisonVisible = comparisonArea && comparisonArea.style.display !== "none";
    const actionsEl = document.querySelector(".hon-actions");
    if (actionsEl)
      actionsEl.style.display = "none";
    if (selectionContainer)
      selectionContainer.style.display = "none";
    if (comparisonArea) {
      comparisonArea.style.display = "";
      comparisonArea.innerHTML = '<div class="hon-vs-container"></div>';
    }
    const vsContainer = comparisonArea ? comparisonArea.querySelector(".hon-vs-container") : null;
    if (!vsContainer) {
      console.warn("[Ascension] Could not find or create container to render options panel.");
      return;
    }
    vsContainer.innerHTML = renderOptionsPanel();
    attachOptionsPanelEventListeners(vsContainer);
    syncTierCheckboxUI();
    if (isMobile()) {
      const sidebar = document.getElementById("hon-sidebar");
      if (sidebar) {
        optionsRestoreState.sidebarWasCollapsed = sidebar.classList.contains("collapsed");
        sidebar.classList.add("collapsed");
      }
    }
    optionsRestoreState.optionsOpen = true;
  }
  function closeOptionsPanel() {
    const comparisonArea = document.getElementById("hon-comparison-area");
    if (comparisonArea)
      comparisonArea.innerHTML = "";
    if (isMobile()) {
      const sidebar = document.getElementById("hon-sidebar");
      if (sidebar && !optionsRestoreState.sidebarWasCollapsed) {
        sidebar.classList.remove("collapsed");
      }
    }
    optionsRestoreState.optionsOpen = false;
  }
  function autoShowOptionsIfNoGenders() {
    if (state.selectedGenders.length === 0) {
      openOptionsPanel();
      return true;
    }
    return false;
  }
  function getTierGapWarningHTML(selectedTiers) {
    const warning = getTierGapWarning(selectedTiers);
    if (!warning)
      return "";
    return `<p class="hon-options-hint hon-options-warning hon-tier-gap-warning" style="color:#ff4444;">${warning}</p>`;
  }
  function getTierGapWarning(selectedTiers) {
    if (!selectedTiers || selectedTiers.includes("any"))
      return "";
    const letters = selectedTiers.filter((t) => t !== "newcomers");
    const indices = letters.map((t) => TIER_ORDER_FOR_GAP.indexOf(t)).filter((i) => i >= 0);
    if (indices.length < 2)
      return "";
    const minIdx = Math.min(...indices);
    const maxIdx = Math.max(...indices);
    const gap = maxIdx - minIdx;
    if (gap >= 2) {
      const top = TIER_ORDER_FOR_GAP[minIdx];
      const bottom = TIER_ORDER_FOR_GAP[maxIdx];
      return `\u26A0\uFE0F Large tier gap selected (${top} vs ${bottom}). Cross-tier matches will use a wider opponent search window. Competitive protection still applies.`;
    }
    return "";
  }
  function syncTierCheckboxUI() {
    document.querySelectorAll(".hon-options-checkbox[data-tier]").forEach((label) => {
      const tier = label.dataset.tier;
      const checkbox = label.querySelector('input[type="checkbox"]');
      const isSelected = state.selectedTiers.includes(tier);
      label.classList.toggle("active", isSelected);
      if (checkbox)
        checkbox.checked = isSelected;
      const tierDef = ALL_TIERS.find((t) => t.value === tier);
      const tierColor = tierDef?.color || getTierColor(tier);
      if (isSelected) {
        label.style.borderColor = tierColor;
        label.style.backgroundColor = `${tierColor}22`;
        label.style.color = tierColor;
      } else {
        label.style.borderColor = "";
        label.style.backgroundColor = "";
        label.style.color = "";
      }
    });
  }
  function renderOptionsPanel() {
    const noGenderWarning = state.selectedGenders.length === 0 ? '<p class="hon-options-hint hon-options-warning">Please select at least one gender to continue.</p>' : '<p class="hon-options-hint">Select which genders to include in matchups.</p>';
    const tierWarningHTML = getTierGapWarningHTML(state.selectedTiers);
    return `
    <div class="hon-options-panel ${isMobile() ? "mobile" : ""}">
      <h2 class="hon-options-title">\u2699\uFE0F Options</h2>

      <div class="hon-options-section">
        <h3 class="hon-options-section-title">Gender Filter</h3>
        ${noGenderWarning}
        <div class="hon-options-gender-grid">
          ${ALL_GENDERS2.map((gender) => `
            <label class="hon-options-checkbox ${state.selectedGenders.includes(gender.value) ? "active" : ""}" data-gender="${gender.value}">
              <input type="checkbox" value="${gender.value}" ${state.selectedGenders.includes(gender.value) ? "checked" : ""}>
              <span class="hon-options-checkmark">\u2713</span>
              <span class="hon-options-label-text">${gender.label}</span>
            </label>
          `).join("")}
        </div>
      </div>

      <div class="hon-options-section">
        <h3 class="hon-options-section-title">Tier Filter</h3>
        <div id="hon-tier-warning-slot">${tierWarningHTML}</div>
        <p class="hon-options-hint">Select which tiers to include in Head to Head matchups. "All Tiers" restores the normal rotation.</p>
        <div class="hon-options-gender-grid">
          ${ALL_TIERS.map((tier) => {
      const isSelected = state.selectedTiers.includes(tier.value);
      const tierColor = tier.color || getTierColor(tier.value);
      const activeStyle = isSelected ? `style="border-color:${tierColor}; background-color:${tierColor}22; color:${tierColor};"` : "";
      return `
              <label class="hon-options-checkbox ${isSelected ? "active" : ""}" data-tier="${tier.value}" ${activeStyle}>
                <input type="checkbox" value="${tier.value}" ${isSelected ? "checked" : ""}>
                <span class="hon-options-checkmark">\u2713</span>
                <span class="hon-options-label-text">${tier.label}</span>
              </label>
            `;
    }).join("")}
        </div>
      </div>

      <div class="hon-options-actions">
        <button class="hon-options-close-btn" data-action="close-options">Close Options</button>
      </div>
    </div>
  `;
  }
  function attachOptionsPanelEventListeners(vsContainer) {
    const checkboxes = vsContainer.querySelectorAll('.hon-options-checkbox[data-gender] input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", async (e) => {
        const gender = e.target.value;
        await toggleGender(gender, { skipReload: true });
        if (state.selectedGenders.length > 0) {
          const hint = vsContainer.querySelector(".hon-options-hint");
          if (hint) {
            hint.classList.remove("hon-options-warning");
            hint.textContent = "Select which genders to include in matchups.";
          }
        }
      });
    });
    const tierCheckboxes = vsContainer.querySelectorAll('.hon-options-checkbox[data-tier] input[type="checkbox"]');
    tierCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", async (e) => {
        const tier = e.target.value;
        await toggleTier(tier, { skipReload: true });
      });
    });
    const closeBtn = vsContainer.querySelector('[data-action="close-options"]');
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        if (state.selectedGenders.length === 0) {
          const hint = vsContainer.querySelector(".hon-options-hint");
          if (hint) {
            hint.classList.add("hon-options-warning");
            hint.textContent = "Please select at least one gender before closing.";
          }
          return;
        }
        restoreVsContainer();
      });
    }
  }
  async function restoreVsContainer() {
    closeOptionsPanel();
    const mode = state.currentMode;
    const actionsEl = document.querySelector(".hon-actions");
    const selectionContainer = document.getElementById("hon-performer-selection");
    const comparisonArea = document.getElementById("hon-comparison-area");
    updateSkipButtonVisibility();
    if (mode === "gauntlet" || mode === "champion") {
      if (optionsRestoreState.wasSelectionVisible) {
        if (selectionContainer)
          selectionContainer.style.display = "block";
        if (comparisonArea)
          comparisonArea.style.display = "none";
        if (actionsEl)
          actionsEl.style.display = "none";
        Promise.resolve().then(() => (init_gauntlet_selection(), gauntlet_selection_exports)).then((m) => m.loadPerformerSelection());
      } else {
        if (selectionContainer)
          selectionContainer.style.display = "none";
        if (comparisonArea)
          comparisonArea.style.display = "";
        if (actionsEl)
          actionsEl.style.display = "";
        const { loadNewPair: loadNewPair2 } = await Promise.resolve().then(() => (init_battle_engine(), battle_engine_exports));
        loadNewPair2();
      }
    } else if (mode === "swiss" || mode === "scenes") {
      if (selectionContainer)
        selectionContainer.style.display = "none";
      if (comparisonArea)
        comparisonArea.style.display = "";
      if (actionsEl)
        actionsEl.style.display = "";
      const { loadNewPair: loadNewPair2 } = await Promise.resolve().then(() => (init_battle_engine(), battle_engine_exports));
      loadNewPair2();
    }
  }
  var ALL_GENDERS2, TIER_ORDER_FOR_GAP, optionsRestoreState;
  var init_ui_sidebar = __esm({
    "ui-sidebar.js"() {
      init_state();
      init_ui_dashboard();
      init_ui_swipe();
      init_ui_event_log();
      init_rating_utils();
      init_constants();
      ALL_GENDERS2 = [
        { value: "FEMALE", label: "Female" },
        { value: "MALE", label: "Male" },
        { value: "TRANSGENDER_MALE", label: "Trans Male" },
        { value: "TRANSGENDER_FEMALE", label: "Trans Female" },
        { value: "INTERSEX", label: "Intersex" },
        { value: "NON_BINARY", label: "Non-Binary" }
      ];
      TIER_ORDER_FOR_GAP = ["S-Tier", "A-Tier", "B-Tier", "C-Tier", "D-Tier", "F-Tier"];
      optionsRestoreState = {
        wasSelectionVisible: false,
        wasComparisonVisible: false,
        sidebarWasCollapsed: false,
        optionsOpen: false
      };
    }
  });

  // ui-modal.js
  function shouldShowButton() {
    const path = window.location.pathname;
    if (path === "/performers" || path === "/performers/")
      return true;
    if (path === "/images" || path === "/images/")
      return true;
    return /^\/performers\/\d+(?:\/|$)/.test(path);
  }
  function addFloatingButton() {
    const buttonId = "plugin_hon";
    const existing = document.getElementById(buttonId);
    if (existing)
      return;
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "col-4 col-sm-3 col-md-2 col-lg-auto nav-link";
    buttonContainer.innerHTML = `
    <a href="javascript:void(0);" id="${buttonId}" class="minimal p-4 p-xl-2 d-flex d-xl-inline-block flex-column justify-content-between align-items-center btn btn-primary" title="Ascension">
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 512 512" 
        class="plugin_hon__flame svg-inline--fa fa-icon nav-menu-icon d-block d-xl-inline mb-2 mb-xl-0" 
        fill="currentColor"
        aria-hidden="true" 
        focusable="false" 
        role="img"
        width="16" 
        height="16">
        <path d="M160.53 20.906c-22.075.207-39.973 9.138-54.218 23.782C89.507 61.962 78.3 87.6 74.876 115.624c-6.847 56.05 16.55 119.953 82.094 146.625l-7.032 17.313c-64.128-26.096-93.275-84.757-94.782-141-17.36 10.866-27.608 27.05-32.343 46.437-5.728 23.448-2.727 51.54 7.906 77.844 21.264 52.61 71.37 96.856 138.436 87.594l2.563 18.53c-48.795 6.74-90.183-11.576-119.907-41.03-8.152 16.216-7.504 32.264-.657 48.312 8.472 19.854 27.498 39.252 52.875 53.594 47.085 26.61 114.8 35.554 173.19 5.094-5.43-20.99-2.652-45.074 11.342-69.313 22.71-39.332 60.78-49.83 88.375-38.688 13.798 5.572 25.08 16.555 29.875 31.157 4.796 14.6 2.836 32.303-7.375 50.312-11.8 20.81-34.144 27.877-51.25 22.22-8.552-2.83-16.22-9.437-18.875-18.876-2.653-9.44-.142-20.366 7.063-31.313l15.594 10.282c-5.238 7.955-5.5 13.08-4.69 15.967.813 2.888 2.84 4.895 6.75 6.188 7.822 2.587 21.483-.152 29.158-13.688 8.188-14.44 8.82-26.183 5.843-35.25-2.976-9.066-9.846-15.954-19.092-19.687-18.493-7.467-46.14-2.273-65.188 30.72-14.024 24.29-14.373 45.376-6.72 63.436l2.814 4.375c-.197.13-.397.25-.594.376.256.497.513 1.008.78 1.5 1.945 3.565 4.218 7.007 6.814 10.28.1.13.21.25.312.377.395.49.81.984 1.22 1.468 11.508 13.657 28.358 24.378 47.312 30.283 24.26 7.557 51.596 7.146 74.843-3.75 23.248-10.897 42.935-31.972 52.69-68.375 3.323-12.406 5.08-23.776 5.5-34.313.01-.418.023-.832.03-1.25.087-5.1-.088-10.246-.563-15.406-.037-.407-.084-.814-.125-1.22-.032-.27-.06-.544-.093-.813-3.295-25.79-15.823-46.16-34.345-64.437-29.635-29.24-75.698-51.638-122.75-74.125-47.052-22.487-95.112-45.1-128.875-77.656-31.683-30.553-49.926-71.185-40.313-124.814-.72-.01-1.444-.006-2.156 0z"/>
      </svg>
      <span>Ascension</span>
    </a>
  `;
    const button = buttonContainer.querySelector(`#${buttonId}`);
    button.addEventListener("click", openRankingModal);
    const navTarget = document.querySelector(".navbar-nav");
    if (navTarget)
      navTarget.appendChild(buttonContainer);
  }
  function watchForNavigation() {
    if (buttonObserver) {
      buttonObserver.disconnect();
    }
    buttonObserver = new MutationObserver(() => {
      addFloatingButton();
    });
    buttonObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  function cleanupButtonObserver() {
    if (buttonObserver) {
      buttonObserver.disconnect();
      buttonObserver = null;
    }
  }
  function closeRankingModal() {
    const gameModal = document.getElementById("hon-modal");
    const statsModal = document.getElementById("hon-stats-modal");
    if (gameModal)
      gameModal.style.display = "none";
    if (statsModal)
      statsModal.style.display = "none";
    handleGlobalKeys.deactivate();
    cleanupButtonObserver();
    destroyEventLog();
    clearDOMCache();
  }
  async function _buildAndOpenModal() {
    try {
      let modal = document.getElementById("hon-modal");
      let wasModalHidden = modal ? modal.style.display === "none" : true;
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "hon-modal";
        modal.className = "hon-modal";
        const { createSidebar: createSidebar2, attachSidebarEventListeners: attachSidebarEventListeners2 } = await Promise.resolve().then(() => (init_ui_sidebar(), ui_sidebar_exports));
        const { isMobile: isMobile3 } = await Promise.resolve().then(() => (init_ui_swipe(), ui_swipe_exports));
        const mobileCheck = isMobile3();
        const mainUI = `
        <div id="hotornot-container" class="hon-container">
          <div class="hon-plugin-layout ${mobileCheck ? "mobile" : ""}">
            ${createSidebar2()}
            <div class="hon-main-plugin-content">
              <div class="hon-header"></div>
              <div id="hon-performer-selection" style="display: none;">
                <div id="hon-performer-list">Loading...</div>
              </div>
              <div class="hon-content">
                <div id="hon-comparison-area">
                  <div class="hon-loading">Loading...</div>
                </div>
                <div class="hon-actions">
                  <div class="hon-action-buttons">
                    <button id="hon-skip-btn" class="hon-action-btn" title="Skip">\u23ED\uFE0F</button>
                    <button id="hon-undo-btn" class="hon-action-btn" title="">\u21A9</button>
                  </div>
                </div>
                <div class="hon-keyboard-hints">
                  <span class="hon-hint"><strong>\u2B05\uFE0F</strong> Choose Left</span>
                  <span class="hon-hint"><strong>\u27A1\uFE0F</strong> Choose Right</span>
                  <span class="hon-hint"><strong>Space</strong> to Skip</span>
                  <span class="hon-hint"><strong>Ctrl+Z</strong> to Undo</span>
                  <span class="hon-hint"><strong>ESC</strong> to Exit</span>
                </div>
              </div>
            </div>
          </div>
        </div>`;
        modal.innerHTML = `
        <div class="hon-modal-backdrop"></div>
        <div class="hon-modal-content ${mobileCheck ? "mobile" : ""}">
          <span class="hon-modal-close">\u2715</span>
          ${mainUI}
        </div>
      `;
        if (mobileCheck) {
          const style = document.createElement("style");
          style.textContent = `
          .hon-plugin-layout.mobile {
            flex-direction: column;
            height: 100%;
          }
          
          .hon-sidebar.mobile {
            order: 2;
            width: 100%;
            max-height: 40vh;
            overflow-y: auto;
            border-top: 1px solid #444;
          }
          
          .hon-sidebar.mobile .hon-sidebar-content {
            padding: 10px;
          }
          
          .hon-sidebar.mobile .hon-sidebar-section {
            margin-bottom: 5px;
          }
          
          .hon-sidebar.mobile .hon-sidebar-subsection {
            padding: 5px 0;
          }
          
          .hon-main-plugin-content {
            order: 1;
            flex: 1;
            overflow-y: auto;
          }
          
          /* Event log should appear last */
          .hon-event-log-container {
            order: 3;
          }
          
          /* Transparent background for mobile modal */
          .hon-modal-content.mobile {
            background: transparent;
            box-shadow: none;
          }
        `;
          modal.appendChild(style);
        }
        document.body.appendChild(modal);
        const sidebarContainer = modal.querySelector("#hon-sidebar");
        if (sidebarContainer) {
          attachSidebarEventListeners2(modal);
        }
        const { attachEventListeners: attachEventListeners2 } = await Promise.resolve().then(() => (init_ui_dashboard(), ui_dashboard_exports));
        attachEventListeners2(modal);
        const closeModalBtn = modal.querySelector(".hon-modal-close");
        if (closeModalBtn) {
          closeModalBtn.onclick = () => closeRankingModal();
        }
        const modalBackdrop = modal.querySelector(".hon-modal-backdrop");
        if (modalBackdrop) {
          modalBackdrop.onclick = () => closeRankingModal();
        }
      }
      modal.style.display = "flex";
      modal.style.alignItems = "center";
      modal.style.justifyContent = "center";
      modal.style.position = "fixed";
      modal.style.top = "0";
      modal.style.left = "0";
      modal.style.width = "100%";
      modal.style.height = "100%";
      initEventLog();
      state.battleType = state.currentMode === "scenes" ? "scenes" : "performers";
      const modalElement = document.getElementById("hon-modal");
      if (modalElement) {
        modalElement.classList.remove("hon-mode-champion", "hon-mode-swiss", "hon-mode-gauntlet", "hon-mode-scenes");
        modalElement.classList.add(`hon-mode-${state.currentMode}`);
      }
      if (wasModalHidden) {
        const { loadNewPair: loadNewPair2 } = await Promise.resolve().then(() => (init_battle_engine(), battle_engine_exports));
        if (state.currentMode === "gauntlet") {
          if (state.gauntletChampion) {
            const selEl = document.getElementById("hon-performer-selection");
            const compEl = document.getElementById("hon-comparison-area");
            const actEl = document.querySelector(".hon-actions");
            if (selEl)
              selEl.style.display = "none";
            if (compEl)
              compEl.style.display = "";
            if (actEl)
              actEl.style.display = "";
            loadNewPair2();
          } else {
            window.showPerformerSelection();
          }
        } else {
          const selEl = document.getElementById("hon-performer-selection");
          const compEl = document.getElementById("hon-comparison-area");
          const actEl = document.querySelector(".hon-actions");
          if (selEl)
            selEl.style.display = "none";
          if (compEl)
            compEl.style.display = "";
          if (actEl)
            actEl.style.display = "";
          loadNewPair2();
        }
      }
      handleGlobalKeys.activate();
    } catch (err) {
      console.error("CRASH in _buildAndOpenModal:", err);
    }
  }
  async function openRankingModal() {
    try {
      const navbarToggle = document.querySelector(".navbar-toggler");
      if (navbarToggle && !navbarToggle.classList.contains("collapsed")) {
        navbarToggle.click();
      }
      state.gauntletChampion = null;
      state.battleType = "performers";
      const path = window.location.pathname;
      const performerMatch = path.match(/\/performers\/(\d+)/);
      const isSinglePerformerPage = !!performerMatch;
      if (isSinglePerformerPage) {
        const performerId = performerMatch[1];
        if (state.currentMode === "gauntlet" && state.gauntletChampion && state.gauntletChampion.id.toString() === performerId) {
          console.log("[Ascension] Resuming existing Gauntlet run.");
          _buildAndOpenModal();
          return;
        }
        state.currentMode = "gauntlet";
        const { fetchPerformerById: fetchPerformerById2 } = await Promise.resolve().then(() => (init_api_client(), api_client_exports));
        try {
          const performer = await fetchPerformerById2(performerId);
          if (performer) {
            state.gauntletChampion = performer;
            state.gauntletWins = 0;
            state.gauntletDefeated = [];
            state.gauntletFalling = false;
            state.gauntletFallingItem = null;
          }
        } catch (e) {
          console.warn("[Ascension] Could not preload performer:", e);
        }
      } else {
        const savedMode = localStorage.getItem("hotornot_selected_mode");
        if (savedMode && savedMode !== "gauntlet") {
          state.currentMode = savedMode;
        } else if (!savedMode) {
          state.currentMode = "swiss";
        }
      }
      _buildAndOpenModal();
    } catch (err) {
      console.error("CRASH in openRankingModal:", err);
    }
  }
  var buttonObserver, handleGlobalKeys;
  var init_ui_modal = __esm({
    "ui-modal.js"() {
      init_state();
      init_battle_engine();
      init_ui_dashboard();
      init_dom_utils();
      init_ui_sidebar();
      init_ui_event_log();
      buttonObserver = null;
      window._honCleanupButtonObserver = cleanupButtonObserver;
      watchForNavigation();
      ["popstate"].forEach(
        (event) => window.addEventListener(event, () => {
          watchForNavigation();
          addFloatingButton();
        })
      );
      handleGlobalKeys = /* @__PURE__ */ function() {
        let isActive = false;
        function handler(e) {
          const activeModal = document.getElementById("hon-modal");
          if (!activeModal) {
            if (isActive) {
              document.removeEventListener("keydown", handler, { capture: true });
              isActive = false;
            }
            return;
          }
          e.stopPropagation();
          if (e.key === "Escape" || e.key === "Esc") {
            e.preventDefault();
            closeRankingModal();
            return;
          }
          if ((e.ctrlKey || e.metaKey) && e.key === "z") {
            e.preventDefault();
            Promise.resolve().then(() => (init_match_handler(), match_handler_exports)).then((m) => m.handleUndo());
            return;
          }
          const isSpace = e.key === " " || e.code === "Space";
          const hotKeys = ["ArrowLeft", "ArrowRight", ...isSpace ? [" ", "Space"] : []];
          if (hotKeys.includes(e.key) || e.code && hotKeys.includes(e.code)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.key === "ArrowLeft") {
              const leftCard = activeModal.querySelector('.hon-scene-card[data-side="left"] .hon-scene-body');
              if (leftCard) {
                leftCard.click();
              }
            } else if (e.key === "ArrowRight") {
              const rightCard = activeModal.querySelector('.hon-scene-card[data-side="right"] .hon-scene-body');
              if (rightCard) {
                rightCard.click();
              }
            } else if (isSpace) {
              const skipBtn = document.getElementById("hon-skip-btn");
              if (skipBtn) {
                skipBtn.click();
              }
            }
          }
        }
        return {
          listener: handler,
          activate: function() {
            if (!isActive) {
              document.addEventListener("keydown", handler, { capture: true });
              isActive = true;
            }
          },
          deactivate: function() {
            if (isActive) {
              document.removeEventListener("keydown", handler, { capture: true });
              isActive = false;
            }
          }
        };
      }();
    }
  });

  // ui-manager.js
  var ui_manager_exports = {};
  __export(ui_manager_exports, {
    addFloatingButton: () => addFloatingButton,
    attachEventListeners: () => attachEventListeners,
    cleanupButtonObserver: () => cleanupButtonObserver,
    closeRankingModal: () => closeRankingModal,
    createBattleRankBadge: () => createBattleRankBadge,
    createImageCard: () => createImageCard,
    createMainUI: () => createMainUI,
    createPerformerCard: () => createPerformerCard,
    createSceneCard: () => createSceneCard,
    createStatsModalContent: () => createStatsModalContent,
    createVictoryScreen: () => createVictoryScreen,
    generateBarGroups: () => generateBarGroups,
    generateStatTables: () => generateStatTables,
    handleGenderToggle: () => handleGenderToggle,
    injectBattleRankBadge: () => injectBattleRankBadge,
    isOnSinglePerformerPage: () => isOnSinglePerformerPage,
    openRankingModal: () => openRankingModal,
    openStatsModal: () => openStatsModal,
    preventLinkBubbling: () => preventLinkBubbling,
    renderCard: () => renderCard,
    setMode: () => setMode,
    setupTagExpansion: () => setupTagExpansion,
    shouldShowButton: () => shouldShowButton,
    showPlacementScreen: () => showPlacementScreen,
    showRatingAnimation: () => showRatingAnimation,
    showTierChangeNotification: () => showTierChangeNotification
  });
  var init_ui_manager = __esm({
    "ui-manager.js"() {
      init_ui_cards();
      init_ui_dashboard();
      init_ui_modal();
      init_ui_stats();
      init_ui_badge();
    }
  });

  // main.js
  init_state();
  init_ui_manager();
  init_ui_modal();
  init_gauntlet_selection();
  init_match_handler();
  init_api_client();
  init_ui_event_log();
  init_dom_utils();

  // snapshot-manager.js
  async function getSnapshotFiles() {
    try {
      console.log("[Ascension Metrics] Fetching snapshot files from: /plugin/ascension/assets/");
      const response = await fetch(`/plugin/ascension/assets/?t=${Date.now()}`);
      if (!response.ok) {
        console.error("[Ascension Metrics] Failed to fetch assets directory:", response.status, response.statusText);
        throw new Error(`Failed to fetch assets directory: ${response.status} ${response.statusText}`);
      }
      const html = await response.text();
      console.log("[Ascension Metrics] Directory listing response:", html.substring(0, 500));
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const links = doc.querySelectorAll("a");
      const snapshotFiles = [];
      links.forEach((link) => {
        const href = link.getAttribute("href");
        console.log("[Ascension Metrics] Found link:", href);
        if (href && (href.includes("Ascension%20Database%20Snapshot") || href.includes("Ascension Database Snapshot"))) {
          const filename = href.split("/").pop() || href;
          snapshotFiles.push(decodeURIComponent(filename));
          console.log("[Ascension Metrics] Added snapshot file:", decodeURIComponent(filename));
        }
      });
      console.log("[Ascension Metrics] Found snapshot files:", snapshotFiles);
      return snapshotFiles.sort((a, b) => {
        const timestampA = a.match(/\[(\d{4}-\d{2}-\d{2}-\d{6})\]/);
        const timestampB = b.match(/\[(\d{4}-\d{2}-\d{2}-\d{6})\]/);
        if (timestampA && timestampB) {
          const tsA = timestampA[1];
          const tsB = timestampB[1];
          const dateA = new Date(
            parseInt(tsA.substring(0, 4)),
            // Year
            parseInt(tsA.substring(5, 7)) - 1,
            // Month (0-indexed)
            parseInt(tsA.substring(8, 10)),
            // Day
            parseInt(tsA.substring(11, 13)),
            // Hour
            parseInt(tsA.substring(13, 15)),
            // Minute
            parseInt(tsA.substring(15, 17))
            // Second
          );
          const dateB = new Date(
            parseInt(tsB.substring(0, 4)),
            // Year
            parseInt(tsB.substring(5, 7)) - 1,
            // Month (0-indexed)
            parseInt(tsB.substring(8, 10)),
            // Day
            parseInt(tsB.substring(11, 13)),
            // Hour
            parseInt(tsB.substring(13, 15)),
            // Minute
            parseInt(tsB.substring(15, 17))
            // Second
          );
          return dateB - dateA;
        }
        return 0;
      });
    } catch (error) {
      console.error("[Ascension Metrics] Error fetching snapshot files:", error);
      return [];
    }
  }
  async function loadSnapshotData(filename) {
    try {
      const encodedFilename = encodeURIComponent(filename);
      console.log("[Ascension Metrics] Loading snapshot data from:", `/plugin/ascension/assets/${encodedFilename}`);
      const response = await fetch(`/plugin/ascension/assets/${encodedFilename}`);
      if (!response.ok) {
        console.error("[Ascension Metrics] Failed to load snapshot:", response.status, response.statusText);
        throw new Error(`Failed to load ${filename}: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      console.log("[Ascension Metrics] Loaded snapshot data for:", filename);
      return data;
    } catch (error) {
      console.error(`[Ascension Metrics] Error loading snapshot ${filename}:`, error);
      return null;
    }
  }

  // metrics-calculator.js
  init_rating_utils();
  var normalizationCache = /* @__PURE__ */ new WeakMap();
  var statsCache = /* @__PURE__ */ new WeakMap();
  var recordCache = /* @__PURE__ */ new WeakMap();
  var battleScoreCache = /* @__PURE__ */ new WeakMap();
  var sceneStatsCache = /* @__PURE__ */ new WeakMap();
  function parsePerformerStats(performer) {
    if (!performer)
      return null;
    if (statsCache.has(performer)) {
      return statsCache.get(performer);
    }
    try {
      const stats = typeof performer.stats === "string" ? JSON.parse(performer.stats) : performer.stats;
      const result = stats || null;
      statsCache.set(performer, result);
      return result;
    } catch (e) {
      statsCache.set(performer, null);
      return null;
    }
  }
  function parsePerformerRecord(performer) {
    if (!performer)
      return [];
    if (recordCache.has(performer)) {
      return recordCache.get(performer);
    }
    try {
      const record = typeof performer.record === "string" ? JSON.parse(performer.record) : performer.record || [];
      const result = record || [];
      recordCache.set(performer, result);
      return result;
    } catch (e) {
      recordCache.set(performer, []);
      return [];
    }
  }
  function getPerformerSceneStats(performer, allScenes = []) {
    const sceneIds = Array.isArray(performer?.scenes) ? performer.scenes : [];
    const count = sceneIds.length;
    if (count === 0 || !Array.isArray(allScenes) || allScenes.length === 0) {
      return { sceneCount: count, avgSceneRating: null };
    }
    const sceneMap = /* @__PURE__ */ new Map();
    allScenes.forEach((scene) => {
      if (scene && scene.id != null) {
        sceneMap.set(String(scene.id), scene);
      }
    });
    let total = 0;
    let ratedCount = 0;
    sceneIds.forEach((id) => {
      const scene = sceneMap.get(String(id));
      if (scene && typeof scene.rating === "number" && !isNaN(scene.rating) && scene.rating > 0) {
        total += scene.rating;
        ratedCount++;
      }
    });
    const avgSceneRating = ratedCount > 0 ? total / ratedCount : null;
    return { sceneCount: count, avgSceneRating };
  }
  function getCachedPerformerSceneStats(performer, allScenes) {
    if (sceneStatsCache.has(performer)) {
      return sceneStatsCache.get(performer);
    }
    const stats = getPerformerSceneStats(performer, allScenes);
    sceneStatsCache.set(performer, stats);
    return stats;
  }
  function normalizeSnapshotPerformer(performer) {
    if (!performer)
      return performer;
    if (normalizationCache.has(performer)) {
      return normalizationCache.get(performer);
    }
    if (performer.rating100 != null && performer.rating100 > 1 && performer.total_matches != null) {
      normalizationCache.set(performer, performer);
      return performer;
    }
    const normalized = { ...performer };
    const stats = parsePerformerStats(performer);
    if (stats) {
      normalized.total_matches = stats.total_matches ?? normalized.total_matches ?? 0;
      normalized.wins = stats.wins ?? normalized.wins ?? 0;
      normalized.losses = stats.losses ?? normalized.losses ?? 0;
      normalized.draws = stats.draws ?? normalized.draws ?? 0;
      normalized.win_margin = stats.win_margin ?? normalized.win_margin ?? 0;
      normalized.current_streak = stats.current_streak ?? normalized.current_streak ?? 0;
      normalized.best_streak = stats.best_streak ?? normalized.best_streak ?? 0;
      normalized.worst_streak = stats.worst_streak ?? normalized.worst_streak ?? 0;
      if (!normalized.custom_fields) {
        normalized.custom_fields = {};
      }
      if (!normalized.custom_fields.hotornot_stats) {
        normalized.custom_fields.hotornot_stats = typeof performer.stats === "string" ? performer.stats : JSON.stringify(performer.stats);
      }
    }
    if (normalized.rating100 == null || normalized.rating100 <= 1) {
      if (performer.rating != null && performer.rating > 0) {
        normalized.rating100 = Math.round(Number(performer.rating));
      }
    }
    normalizationCache.set(performer, normalized);
    return normalized;
  }
  function getBattleScore(performer) {
    const normalized = normalizeSnapshotPerformer(performer);
    if (battleScoreCache.has(normalized)) {
      return battleScoreCache.get(normalized);
    }
    const score = calculateBattleScore(normalized);
    battleScoreCache.set(normalized, score);
    return score;
  }
  function calculateMetrics(performers) {
    let totalMatches = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalDraws = 0;
    let mostActivePerformer = null;
    let maxMatches = 0;
    let longestStreak = 0;
    let currentStreak = 0;
    const countryScores = {};
    let totalPerformersWithMatches = 0;
    let totalMatchCount = 0;
    let totalRatedPerformers = 0;
    let highestBattleScore = -Infinity;
    let highestRatedPerformer = null;
    performers.forEach((p) => {
      const stats = parsePerformerStats(p);
      let matches = 0;
      if (stats) {
        matches = stats.total_matches || 0;
        if (matches > 0) {
          totalPerformersWithMatches++;
          totalMatchCount += matches;
        }
        totalMatches += matches;
        totalWins += stats.wins || 0;
        totalLosses += stats.losses || 0;
        totalDraws += stats.draws || 0;
        if ((stats.best_streak || 0) > longestStreak) {
          longestStreak = stats.best_streak || 0;
        }
        if ((stats.current_streak || 0) > currentStreak) {
          currentStreak = stats.current_streak || 0;
        }
      }
      if (p.rating && p.rating > 0) {
        totalRatedPerformers++;
      }
      const battleScore = getBattleScore(p);
      if (battleScore > highestBattleScore) {
        highestBattleScore = battleScore;
        highestRatedPerformer = p;
      }
      if (matches > maxMatches) {
        maxMatches = matches;
        mostActivePerformer = p;
      }
      if (p.country && p.country.trim() !== "") {
        if (!countryScores[p.country]) {
          countryScores[p.country] = { totalScore: 0, count: 0 };
        }
        countryScores[p.country].totalScore += battleScore || 0;
        countryScores[p.country].count += 1;
      }
    });
    let highestRatedCountry = null;
    let highestCountryAverage = 0;
    for (const [countryCode, data] of Object.entries(countryScores)) {
      if (data.count >= 5) {
        const average = data.totalScore / data.count;
        if (average > highestCountryAverage) {
          highestCountryAverage = average;
          highestRatedCountry = countryCode;
        }
      }
    }
    const averageMatchesPerPerformer = totalPerformersWithMatches > 0 ? (totalMatchCount / totalPerformersWithMatches).toFixed(1) : "0.0";
    return {
      totalMatches,
      totalWins,
      totalLosses,
      totalDraws,
      highestRatedPerformer,
      highestBattleScore,
      mostActivePerformer,
      longestStreak,
      totalRatedPerformers,
      averageMatchesPerPerformer,
      highestRatedCountry,
      highestCountryAverage: highestCountryAverage.toFixed(2)
    };
  }

  // ui-helpers.js
  init_rating_utils();
  function isMobile2() {
    return window.innerWidth <= 768;
  }
  function createResponsiveGrid(columnsDesktop = "auto-fit", minColumnWidth = "200px") {
    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gap = "1rem";
    if (isMobile2()) {
      grid.style.gridTemplateColumns = "1fr";
    } else {
      grid.style.gridTemplateColumns = `repeat(${columnsDesktop}, minmax(${minColumnWidth}, 1fr))`;
    }
    return grid;
  }
  function createStatElement(container, title, heading, tooltip) {
    const statEl = document.createElement("div");
    statEl.classList.add("stats-element");
    if (isMobile2()) {
      statEl.style.minWidth = "unset";
      statEl.style.width = "100%";
      statEl.style.margin = "0.25rem 0";
    } else {
      statEl.style.minWidth = "120px";
      statEl.style.margin = "0.5rem";
    }
    statEl.style.textAlign = "center";
    statEl.style.padding = "1rem";
    statEl.style.backgroundColor = "rgba(0, 0, 0, 0.3)";
    statEl.style.borderRadius = "8px";
    container.appendChild(statEl);
    const statTitle = document.createElement("p");
    statTitle.classList.add("title");
    statTitle.style.fontSize = "1.5rem";
    statTitle.style.marginBottom = "0.25rem";
    statTitle.style.color = "#fff";
    statTitle.innerText = title;
    statEl.appendChild(statTitle);
    const statHeading = document.createElement("p");
    statHeading.classList.add("heading");
    statHeading.style.fontSize = "0.9rem";
    statHeading.style.color = "#aaa";
    statHeading.innerText = heading;
    statEl.appendChild(statHeading);
    if (tooltip) {
      statEl.title = tooltip;
      statEl.style.cursor = "help";
    }
  }
  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }
  function getCountryFlagEmoji(countryCode) {
    if (!countryCode)
      return "";
    const codePoints = countryCode.toUpperCase().split("").map(
      (char) => 127397 + char.charCodeAt(0)
    );
    try {
      return String.fromCodePoint(...codePoints);
    } catch (e) {
      return "";
    }
  }
  var populationCache = /* @__PURE__ */ new WeakMap();
  function getRatingTier2(performer, allPerformers = null) {
    if (typeof performer === "number") {
      if (performer >= 85)
        return "S-Tier";
      if (performer >= 70)
        return "A-Tier";
      if (performer >= 55)
        return "B-Tier";
      if (performer >= 40)
        return "C-Tier";
      if (performer >= 25)
        return "D-Tier";
      return "F-Tier";
    }
    if (!performer || typeof performer !== "object")
      return "F-Tier";
    const normalizedPerformer = normalizeSnapshotPerformer(performer);
    let normalizedPopulation = null;
    if (Array.isArray(allPerformers) && allPerformers.length > 0) {
      if (populationCache.has(allPerformers)) {
        normalizedPopulation = populationCache.get(allPerformers);
      } else {
        normalizedPopulation = allPerformers.map(normalizeSnapshotPerformer);
        populationCache.set(allPerformers, normalizedPopulation);
      }
    }
    return getRatingTier(normalizedPerformer, normalizedPopulation);
  }
  function getTierColor2(tier) {
    switch (tier) {
      case "S-Tier":
        return "#eb9834";
      case "A-Tier":
        return "#e014aa";
      case "B-Tier":
        return "#7f1e82";
      case "C-Tier":
        return "#14bbe0";
      case "D-Tier":
        return "#92e014";
      case "F-Tier":
        return "#808080";
      default:
        return "#000000";
    }
  }
  function attachBattleScoreTooltip(element, performer, allPerformers = null, currentOrigin = window.location.origin) {
    if (!performer)
      return;
    element.addEventListener("mouseenter", (e) => {
      const existingTooltip = document.querySelector(".opponent-tooltip");
      if (existingTooltip)
        existingTooltip.remove();
      const tooltip = document.createElement("div");
      tooltip.className = "opponent-tooltip";
      tooltip.style.position = "fixed";
      tooltip.style.zIndex = "10002";
      tooltip.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
      tooltip.style.border = "1px solid #555";
      tooltip.style.borderRadius = "8px";
      tooltip.style.padding = "8px";
      tooltip.style.minWidth = "120px";
      tooltip.style.maxWidth = "200px";
      tooltip.style.textAlign = "center";
      tooltip.style.boxShadow = "0 4px 8px rgba(0,0,0,0.3)";
      tooltip.style.pointerEvents = "none";
      tooltip.style.color = "#fff";
      if (performer.image_path) {
        let fixedImagePath = performer.image_path;
        try {
          const imageUrl = new URL(performer.image_path);
          const currentUrl = new URL(currentOrigin);
          imageUrl.protocol = currentUrl.protocol;
          imageUrl.hostname = currentUrl.hostname;
          imageUrl.port = currentUrl.port;
          fixedImagePath = imageUrl.toString();
        } catch (err) {
          try {
            const path = new URL(performer.image_path).pathname + new URL(performer.image_path).search;
            fixedImagePath = currentOrigin + path;
          } catch (err2) {
            fixedImagePath = performer.image_path;
          }
        }
        const imageContainer = document.createElement("div");
        imageContainer.style.width = "80px";
        imageContainer.style.height = "80px";
        imageContainer.style.borderRadius = "50%";
        imageContainer.style.overflow = "hidden";
        imageContainer.style.border = "2px solid #555";
        imageContainer.style.margin = "0 auto 8px";
        const img = document.createElement("img");
        img.src = fixedImagePath;
        img.alt = `${performer.name} profile image`;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.style.display = "block";
        img.style.objectPosition = "center 15%";
        img.onerror = function() {
          imageContainer.innerHTML = "";
          const placeholderIcon = document.createElement("span");
          placeholderIcon.innerText = "\u{1F464}";
          placeholderIcon.style.fontSize = "1.5rem";
          placeholderIcon.style.color = "#888";
          placeholderIcon.style.display = "flex";
          placeholderIcon.style.alignItems = "center";
          placeholderIcon.style.justifyContent = "center";
          placeholderIcon.style.height = "100%";
          imageContainer.appendChild(placeholderIcon);
        };
        imageContainer.appendChild(img);
        tooltip.appendChild(imageContainer);
      }
      const battleScore = getBattleScore(performer);
      const stats = parsePerformerStats(performer) || {};
      const winRate = stats.total_matches > 0 ? (stats.wins / stats.total_matches * 100).toFixed(1) : "0.0";
      const winRateColor = parseFloat(winRate) >= 50 ? "#4caf50" : "#f44336";
      const tier = getRatingTier2(performer, allPerformers);
      const tierColor = getTierColor2(tier);
      const name = document.createElement("div");
      name.innerText = performer.name || "Unknown";
      name.style.fontWeight = "bold";
      name.style.marginBottom = "4px";
      tooltip.appendChild(name);
      const tierLabel = document.createElement("div");
      tierLabel.innerText = tier;
      tierLabel.style.color = tierColor;
      tierLabel.style.fontWeight = "bold";
      tierLabel.style.fontSize = "0.8rem";
      tierLabel.style.marginBottom = "4px";
      tooltip.appendChild(tierLabel);
      const score = document.createElement("div");
      score.innerText = `Asc.Score: ${battleScore.toFixed(2)}`;
      score.style.color = tierColor;
      score.style.fontWeight = "bold";
      score.style.marginBottom = "4px";
      tooltip.appendChild(score);
      const record = document.createElement("div");
      record.innerHTML = `<span style="color: #4caf50; font-weight: bold;">${stats.wins || 0}W</span> / <span style="color: #f44336; font-weight: bold;">${stats.losses || 0}L</span> / ${stats.draws || 0}D`;
      record.style.fontSize = "0.8rem";
      record.style.marginBottom = "2px";
      tooltip.appendChild(record);
      const rate = document.createElement("div");
      rate.innerText = `Win Rate: ${winRate}%`;
      rate.style.fontSize = "0.8rem";
      rate.style.color = winRateColor;
      rate.style.fontWeight = "bold";
      tooltip.appendChild(rate);
      document.body.appendChild(tooltip);
      const rect = element.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
      let top = rect.bottom + 8;
      if (left < 10)
        left = 10;
      if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
      }
      if (top + tooltipRect.height > window.innerHeight - 10) {
        top = rect.top - tooltipRect.height - 8;
      }
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    });
    element.addEventListener("mouseleave", () => {
      const existingTooltip = document.querySelector(".opponent-tooltip");
      if (existingTooltip)
        existingTooltip.remove();
    });
    element.addEventListener("click", () => {
      const existingTooltip = document.querySelector(".opponent-tooltip");
      if (existingTooltip)
        existingTooltip.remove();
    });
  }

  // search-components.js
  function getNestedValue(obj, path) {
    return path.split(".").reduce((current, key) => current && current[key], obj);
  }
  function fuzzySearch(query, items, keys) {
    if (!query)
      return items;
    const normalizedQuery = query.toLowerCase();
    return items.filter((item) => {
      return keys.some((key) => {
        const value = getNestedValue(item, key);
        return value && value.toLowerCase().includes(normalizedQuery);
      });
    });
  }
  function renderAscScore(performer, allPerformers) {
    const score = getBattleScore(performer);
    if (typeof score !== "number" || isNaN(score))
      return null;
    const tier = getRatingTier2(performer, allPerformers);
    const color = getTierColor2(tier);
    const container = document.createElement("span");
    container.innerText = score.toFixed(2);
    container.style.fontSize = "0.8rem";
    container.style.fontWeight = "bold";
    container.style.color = color;
    return container;
  }
  function createComparisonSearchBox(profileContainer, currentPerformer, allPerformers, onShowProfile) {
    const searchContainer = document.createElement("div");
    searchContainer.style.marginTop = "1.5rem";
    searchContainer.style.padding = "1rem";
    searchContainer.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
    searchContainer.style.borderRadius = "8px";
    searchContainer.style.border = "1px solid #555";
    const searchHeader = document.createElement("h4");
    searchHeader.innerText = "Compare with another performer";
    searchHeader.style.marginBottom = "0.75rem";
    searchHeader.style.color = "#ddd";
    searchHeader.style.textAlign = "center";
    searchHeader.style.fontSize = isMobile2() ? "1rem" : "1.1rem";
    searchContainer.appendChild(searchHeader);
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search for a performer to compare...";
    searchInput.style.width = "100%";
    searchInput.style.padding = isMobile2() ? "0.5rem" : "0.75rem";
    searchInput.style.borderRadius = "4px";
    searchInput.style.backgroundColor = "#333";
    searchInput.style.color = "white";
    searchInput.style.border = "1px solid #555";
    searchInput.style.marginBottom = "0.75rem";
    searchInput.style.boxSizing = "border-box";
    searchInput.style.fontSize = isMobile2() ? "0.9rem" : "1rem";
    searchContainer.appendChild(searchInput);
    const resultsContainer = document.createElement("div");
    resultsContainer.style.maxHeight = "200px";
    resultsContainer.style.overflowY = "auto";
    resultsContainer.style.display = "none";
    searchContainer.appendChild(resultsContainer);
    function performSearch(query) {
      if (query.length < 2) {
        resultsContainer.style.display = "none";
        return [];
      }
      return fuzzySearch(query, allPerformers.filter((p) => p.ID !== currentPerformer.ID), ["name"]);
    }
    function renderResults(results) {
      resultsContainer.innerHTML = "";
      if (results.length === 0) {
        resultsContainer.style.display = "none";
        return;
      }
      const resultList = document.createElement("div");
      resultList.style.display = "flex";
      resultList.style.flexDirection = "column";
      resultList.style.gap = "0.5rem";
      results.slice(0, 10).forEach((performer) => {
        const resultItem = document.createElement("div");
        resultItem.style.padding = "0.5rem";
        resultItem.style.backgroundColor = "rgba(51, 51, 51, 0.8)";
        resultItem.style.borderRadius = "4px";
        resultItem.style.cursor = "pointer";
        resultItem.style.display = "flex";
        resultItem.style.alignItems = "center";
        resultItem.style.gap = "0.5rem";
        resultItem.style.transition = "background-color 0.2s ease";
        resultItem.addEventListener("mouseenter", () => {
          resultItem.style.backgroundColor = "rgba(70, 70, 70, 0.9)";
        });
        resultItem.addEventListener("mouseleave", () => {
          resultItem.style.backgroundColor = "rgba(51, 51, 51, 0.8)";
        });
        if (performer.country) {
          const flagEmoji = getCountryFlagEmoji(performer.country);
          if (flagEmoji) {
            const flagSpan = document.createElement("span");
            flagSpan.innerText = flagEmoji;
            resultItem.appendChild(flagSpan);
          }
        }
        const nameSpan = document.createElement("span");
        nameSpan.innerText = performer.name;
        nameSpan.style.flex = "1";
        resultItem.appendChild(nameSpan);
        const ascScoreElement = renderAscScore(performer, allPerformers);
        if (ascScoreElement) {
          ascScoreElement.style.fontSize = "0.8rem";
          resultItem.appendChild(ascScoreElement);
        }
        resultItem.addEventListener("click", () => {
          onShowProfile(performer, "comparison", currentPerformer);
          searchInput.value = "";
          resultsContainer.style.display = "none";
        });
        resultList.appendChild(resultItem);
      });
      resultsContainer.appendChild(resultList);
      resultsContainer.style.display = "block";
    }
    let searchTimeout;
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const query = searchInput.value.trim();
        const results = performSearch(query);
        renderResults(results);
      }, 300);
    });
    document.addEventListener("click", (e) => {
      if (!searchContainer.contains(e.target)) {
        resultsContainer.style.display = "none";
      }
    });
    return searchContainer;
  }
  function createSearchBox(container, performers, onSelectPerformer) {
    const searchContainer = document.createElement("div");
    searchContainer.style.marginTop = "2rem";
    searchContainer.style.padding = "1rem";
    searchContainer.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
    searchContainer.style.borderRadius = "8px";
    searchContainer.style.border = "1px solid #555";
    const searchHeader = document.createElement("h3");
    searchHeader.innerText = "Search Performers";
    searchHeader.style.textAlign = "center";
    searchHeader.style.marginBottom = "1rem";
    searchHeader.style.color = "#ddd";
    searchHeader.style.fontSize = isMobile2() ? "1.3rem" : "1.5rem";
    searchContainer.appendChild(searchHeader);
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Enter performer name...";
    searchInput.style.width = "100%";
    searchInput.style.padding = isMobile2() ? "0.5rem" : "0.75rem";
    searchInput.style.borderRadius = "4px";
    searchInput.style.backgroundColor = "#333";
    searchInput.style.color = "white";
    searchInput.style.border = "1px solid #555";
    searchInput.style.marginBottom = "0.75rem";
    searchInput.style.boxSizing = "border-box";
    searchInput.style.fontSize = isMobile2() ? "0.9rem" : "1rem";
    searchContainer.appendChild(searchInput);
    const resultsContainer = document.createElement("div");
    resultsContainer.style.maxHeight = "300px";
    resultsContainer.style.overflowY = "auto";
    resultsContainer.style.display = "none";
    searchContainer.appendChild(resultsContainer);
    let searchTimeout;
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const query = searchInput.value.trim();
        resultsContainer.innerHTML = "";
        if (query.length < 2) {
          resultsContainer.style.display = "none";
          return;
        }
        const results = fuzzySearch(query, performers, ["name"]);
        if (results.length > 0) {
          const resultList = document.createElement("div");
          resultList.style.display = "flex";
          resultList.style.flexDirection = "column";
          resultList.style.gap = "0.5rem";
          results.slice(0, 15).forEach((performer) => {
            const resultItem = document.createElement("div");
            resultItem.style.padding = "0.5rem";
            resultItem.style.backgroundColor = "rgba(51, 51, 51, 0.8)";
            resultItem.style.borderRadius = "4px";
            resultItem.style.cursor = "pointer";
            resultItem.style.display = "flex";
            resultItem.style.alignItems = "center";
            resultItem.style.gap = "0.5rem";
            resultItem.style.transition = "background-color 0.2s ease";
            resultItem.addEventListener("mouseenter", () => {
              resultItem.style.backgroundColor = "rgba(70, 70, 70, 0.9)";
            });
            resultItem.addEventListener("mouseleave", () => {
              resultItem.style.backgroundColor = "rgba(51, 51, 51, 0.8)";
            });
            if (performer.country) {
              const flagEmoji = getCountryFlagEmoji(performer.country);
              if (flagEmoji) {
                const flagSpan = document.createElement("span");
                flagSpan.innerText = flagEmoji;
                resultItem.appendChild(flagSpan);
              }
            }
            const nameSpan = document.createElement("span");
            nameSpan.innerText = performer.name;
            nameSpan.style.flex = "1";
            resultItem.appendChild(nameSpan);
            const ascScoreElement = renderAscScore(performer, performers);
            if (ascScoreElement) {
              ascScoreElement.style.fontSize = "0.8rem";
              resultItem.appendChild(ascScoreElement);
            }
            resultItem.addEventListener("click", () => {
              onSelectPerformer(performer);
              searchInput.value = "";
              resultsContainer.style.display = "none";
            });
            resultList.appendChild(resultItem);
          });
          resultsContainer.appendChild(resultList);
          resultsContainer.style.display = "block";
        } else {
          resultsContainer.style.display = "none";
        }
      }, 300);
    });
    document.addEventListener("click", (e) => {
      if (!searchContainer.contains(e.target)) {
        resultsContainer.style.display = "none";
      }
    });
    container.appendChild(searchContainer);
    return { searchInput, resultsContainer };
  }

  // performer-profile.js
  function computeAscScore(performer) {
    if (!performer)
      return null;
    const score = getBattleScore(performer);
    return typeof score === "number" && !isNaN(score) ? score : null;
  }
  function ascScoreTitle(performer) {
    const score = computeAscScore(performer);
    return score !== null ? score.toFixed(2) : "N/A";
  }
  function getWinRate(performer) {
    const stats = parsePerformerStats(performer) || {};
    if (!stats.total_matches)
      return "0.0";
    return (stats.wins / stats.total_matches * 100).toFixed(1);
  }
  function getSceneRatingColor(avgSceneRating) {
    if (avgSceneRating === null || avgSceneRating === void 0 || isNaN(avgSceneRating))
      return "#fff";
    const display = avgSceneRating / 10;
    if (display >= 8.5)
      return "#eb9834";
    if (display >= 7)
      return "#e014aa";
    if (display >= 5.5)
      return "#7f1e82";
    if (display >= 4)
      return "#14bbe0";
    if (display >= 2.5)
      return "#92e014";
    return "#808080";
  }
  function createPerformerProfile(container, performer, allPerformers, onShowProfile, scenes) {
    const profileContainer = document.createElement("div");
    profileContainer.style.marginTop = "2rem";
    profileContainer.style.padding = isMobile2() ? "1rem" : "1.5rem";
    profileContainer.style.backgroundColor = "rgba(0, 0, 0, 0.3)";
    profileContainer.style.borderRadius = "8px";
    profileContainer.style.border = "1px solid #555";
    profileContainer.style.position = "relative";
    const currentOrigin = window.location.origin;
    const headerContainer = document.createElement("div");
    headerContainer.style.display = "flex";
    headerContainer.style.justifyContent = "space-between";
    headerContainer.style.alignItems = "flex-start";
    headerContainer.style.marginBottom = "1rem";
    headerContainer.style.gap = "1rem";
    if (isMobile2()) {
      headerContainer.style.flexDirection = "column";
      headerContainer.style.alignItems = "center";
    }
    const nameContainer = document.createElement("div");
    nameContainer.style.display = "flex";
    nameContainer.style.alignItems = "center";
    nameContainer.style.gap = "0.5rem";
    if (isMobile2()) {
      nameContainer.style.justifyContent = "center";
    }
    const header = document.createElement("h3");
    header.style.color = "#fff";
    header.style.margin = "0";
    header.style.fontSize = isMobile2() ? "1.2rem" : "1.5rem";
    if (performer.country) {
      const flagEmoji = getCountryFlagEmoji(performer.country);
      if (flagEmoji) {
        header.innerText = `Performer Profile: ${flagEmoji} ${performer.name}`;
      } else {
        header.innerText = `Performer Profile: ${performer.name}`;
      }
    } else {
      header.innerText = `Performer Profile: ${performer.name}`;
    }
    if (performer.ID) {
      const linkIcon = document.createElement("a");
      linkIcon.href = `${currentOrigin}/performers/${performer.ID}`;
      linkIcon.innerText = "\u{1F517}";
      linkIcon.style.textDecoration = "none";
      linkIcon.style.fontSize = isMobile2() ? "1rem" : "1.2rem";
      linkIcon.title = "View performer profile";
      linkIcon.target = "_blank";
      nameContainer.appendChild(linkIcon);
    }
    nameContainer.appendChild(header);
    headerContainer.appendChild(nameContainer);
    const imageSize = isMobile2() ? "120px" : "150px";
    if (performer.image_path) {
      let fixedImagePath = performer.image_path;
      try {
        const imageUrl = new URL(performer.image_path);
        const currentUrl = new URL(currentOrigin);
        imageUrl.protocol = currentUrl.protocol;
        imageUrl.hostname = currentUrl.hostname;
        imageUrl.port = currentUrl.port;
        fixedImagePath = imageUrl.toString();
      } catch (e) {
        try {
          const path = new URL(performer.image_path).pathname + new URL(performer.image_path).search;
          fixedImagePath = currentOrigin + path;
        } catch (e2) {
          fixedImagePath = performer.image_path;
        }
      }
      const imageContainer = document.createElement("div");
      imageContainer.style.width = imageSize;
      imageContainer.style.height = imageSize;
      imageContainer.style.borderRadius = "50%";
      imageContainer.style.overflow = "hidden";
      imageContainer.style.border = "2px solid #555";
      imageContainer.style.flexShrink = "0";
      imageContainer.style.marginTop = "15px";
      if (isMobile2()) {
        imageContainer.style.alignSelf = "center";
      }
      const img = document.createElement("img");
      img.src = fixedImagePath;
      img.alt = `${performer.name} profile image`;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      img.style.display = "block";
      img.style.objectPosition = "center 15%";
      img.onerror = function() {
        imageContainer.innerHTML = "";
        const placeholderIcon = document.createElement("span");
        placeholderIcon.innerText = "\u{1F464}";
        placeholderIcon.style.fontSize = isMobile2() ? "3rem" : "4rem";
        placeholderIcon.style.color = "#888";
        placeholderIcon.style.display = "flex";
        placeholderIcon.style.alignItems = "center";
        placeholderIcon.style.justifyContent = "center";
        placeholderIcon.style.height = "100%";
        imageContainer.appendChild(placeholderIcon);
      };
      imageContainer.appendChild(img);
      headerContainer.appendChild(imageContainer);
    } else {
      const imageContainer = document.createElement("div");
      imageContainer.style.width = imageSize;
      imageContainer.style.height = imageSize;
      imageContainer.style.borderRadius = "50%";
      imageContainer.style.overflow = "hidden";
      imageContainer.style.border = "2px solid #555";
      imageContainer.style.flexShrink = "0";
      imageContainer.style.backgroundColor = "#333";
      imageContainer.style.display = "flex";
      imageContainer.style.alignItems = "center";
      imageContainer.style.justifyContent = "center";
      imageContainer.style.marginTop = "15px";
      if (isMobile2()) {
        imageContainer.style.alignSelf = "center";
      }
      const placeholderIcon = document.createElement("span");
      placeholderIcon.innerText = "\u{1F464}";
      placeholderIcon.style.fontSize = isMobile2() ? "3rem" : "4rem";
      placeholderIcon.style.color = "#888";
      imageContainer.appendChild(placeholderIcon);
      headerContainer.appendChild(imageContainer);
    }
    profileContainer.appendChild(headerContainer);
    const performerTier = getRatingTier2(performer, allPerformers);
    const tierColor = getTierColor2(performerTier);
    const tierBox = document.createElement("div");
    tierBox.style.display = "flex";
    tierBox.style.justifyContent = "center";
    tierBox.style.marginBottom = "1.5rem";
    const tierElement = document.createElement("div");
    tierElement.style.padding = isMobile2() ? "0.5rem 1rem" : "0.75rem 1.5rem";
    tierElement.style.backgroundColor = "rgba(0, 0, 0, 0.4)";
    tierElement.style.borderRadius = "6px";
    tierElement.style.textAlign = "center";
    const tierTitle = document.createElement("p");
    tierTitle.classList.add("title");
    tierTitle.style.fontSize = isMobile2() ? "1.2rem" : "1.5rem";
    tierTitle.style.marginBottom = "0.25rem";
    tierTitle.style.color = tierColor;
    tierTitle.style.fontWeight = "bold";
    tierTitle.innerText = performerTier;
    tierElement.appendChild(tierTitle);
    const tierHeading = document.createElement("p");
    tierHeading.classList.add("heading");
    tierHeading.style.fontSize = isMobile2() ? "0.8rem" : "0.9rem";
    tierHeading.style.color = "#aaa";
    tierHeading.innerText = "Current Tier";
    tierElement.appendChild(tierHeading);
    tierBox.appendChild(tierElement);
    profileContainer.appendChild(tierBox);
    const statsGrid = createResponsiveGrid();
    statsGrid.style.marginBottom = "1.5rem";
    const stats = parsePerformerStats(performer) || {};
    const sceneStats = getCachedPerformerSceneStats(performer, scenes || []);
    const avgSceneRatingText = sceneStats.avgSceneRating !== null ? (sceneStats.avgSceneRating / 10).toFixed(1) : "N/A";
    const ascScore = computeAscScore(performer);
    const ascScoreColor = ascScore !== null ? getTierColor2(getRatingTier2(performer, allPerformers)) : "#fff";
    const winRate = getWinRate(performer);
    const winRateColor = parseFloat(winRate) >= 50 ? "#4caf50" : "#f44336";
    const statCards = [
      {
        title: ascScoreTitle(performer),
        heading: "Asc.Score",
        tooltip: "Current Ascension battle score",
        color: ascScoreColor
      },
      { title: stats.total_matches || 0, heading: "Total Matches", tooltip: "Total matches played" },
      {
        title: `${winRate}%`,
        heading: "Win Rate",
        tooltip: "Win percentage",
        color: winRateColor
      },
      { title: stats.wins || 0, heading: "Wins", tooltip: "Total wins", color: "#4caf50" },
      { title: stats.losses || 0, heading: "Losses", tooltip: "Total losses", color: "#f44336" },
      { title: stats.draws || 0, heading: "Draws", tooltip: "Total draws" },
      {
        title: stats.current_streak || 0,
        heading: "Current Streak",
        tooltip: "Current win/loss streak",
        color: (stats.current_streak || 0) > 0 ? "#4caf50" : (stats.current_streak || 0) < 0 ? "#f44336" : "#fff"
      },
      { title: stats.best_streak || 0, heading: "Best Streak", tooltip: "Best winning streak", color: "#4caf50" },
      { title: stats.worst_streak || 0, heading: "Worst Streak", tooltip: "Worst losing streak", color: "#f44336" },
      {
        title: (stats.win_margin || 0) > 0 ? `+${stats.win_margin}` : stats.win_margin || 0,
        heading: "Win Margin",
        tooltip: "Cumulative rating point margin from wins and losses",
        color: (stats.win_margin || 0) > 0 ? "#4caf50" : (stats.win_margin || 0) < 0 ? "#f44336" : "#fff"
      },
      {
        title: sceneStats.sceneCount,
        heading: "Scenes",
        tooltip: "Total number of scenes"
      },
      {
        title: avgSceneRatingText,
        heading: "Avg Scene Rating",
        tooltip: "Average scene rating (display scale)",
        color: getSceneRatingColor(sceneStats.avgSceneRating)
      }
    ];
    statCards.forEach((card) => {
      const statEl = document.createElement("div");
      statEl.style.padding = isMobile2() ? "0.5rem" : "1rem";
      statEl.style.backgroundColor = "rgba(0, 0, 0, 0.4)";
      statEl.style.borderRadius = "6px";
      statEl.style.textAlign = "center";
      statEl.style.minWidth = "0";
      const statTitle = document.createElement("p");
      statTitle.classList.add("title");
      statTitle.style.fontSize = isMobile2() ? "1rem" : "1.5rem";
      statTitle.style.marginBottom = "0.2rem";
      statTitle.style.color = card.color || "#fff";
      statTitle.style.fontWeight = card.color ? "bold" : "normal";
      statTitle.style.overflow = "hidden";
      statTitle.style.textOverflow = "ellipsis";
      statTitle.style.whiteSpace = "nowrap";
      statTitle.innerText = card.title;
      statEl.appendChild(statTitle);
      const statHeading = document.createElement("p");
      statHeading.classList.add("heading");
      statHeading.style.fontSize = isMobile2() ? "0.7rem" : "0.9rem";
      statHeading.style.color = "#aaa";
      statHeading.style.margin = "0";
      statHeading.style.overflow = "hidden";
      statHeading.style.textOverflow = "ellipsis";
      statHeading.style.whiteSpace = "nowrap";
      statHeading.innerText = card.heading;
      statEl.appendChild(statHeading);
      if (card.tooltip) {
        statEl.title = card.tooltip;
        statEl.style.cursor = "help";
      }
      statsGrid.appendChild(statEl);
    });
    profileContainer.appendChild(statsGrid);
    const record = parsePerformerRecord(performer) || [];
    const matchHistoryContainer = document.createElement("div");
    matchHistoryContainer.style.marginTop = "2rem";
    matchHistoryContainer.style.padding = "1rem";
    matchHistoryContainer.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
    matchHistoryContainer.style.borderRadius = "8px";
    matchHistoryContainer.style.position = "relative";
    const matchHistoryHeader = document.createElement("h4");
    matchHistoryHeader.innerText = "Match History";
    matchHistoryHeader.style.color = "#ddd";
    matchHistoryHeader.style.marginBottom = "1rem";
    matchHistoryHeader.style.textAlign = "center";
    matchHistoryHeader.style.fontSize = isMobile2() ? "1.1rem" : "1.25rem";
    matchHistoryContainer.appendChild(matchHistoryHeader);
    const leftArrow = document.createElement("div");
    leftArrow.innerHTML = "\u279C";
    leftArrow.style.transform = "rotate(180deg)";
    leftArrow.style.position = "absolute";
    leftArrow.style.left = "10px";
    leftArrow.style.top = "10px";
    leftArrow.style.fontSize = "1.5rem";
    leftArrow.style.color = "#ddd";
    leftArrow.style.cursor = "pointer";
    leftArrow.style.userSelect = "none";
    leftArrow.style.transition = "transform 0.2s ease, color 0.2s ease";
    leftArrow.title = "Switch to Match History List";
    leftArrow.addEventListener("mouseenter", () => {
      leftArrow.style.transform = "rotate(180deg) scale(1.2)";
      leftArrow.style.color = "#fff";
    });
    leftArrow.addEventListener("mouseleave", () => {
      leftArrow.style.transform = "rotate(180deg) scale(1)";
      leftArrow.style.color = "#ddd";
    });
    matchHistoryContainer.appendChild(leftArrow);
    const rightArrow = document.createElement("div");
    rightArrow.innerHTML = "\u279C";
    rightArrow.style.position = "absolute";
    rightArrow.style.right = "10px";
    rightArrow.style.top = "10px";
    rightArrow.style.fontSize = "1.5rem";
    rightArrow.style.color = "#ddd";
    rightArrow.style.cursor = "pointer";
    rightArrow.style.userSelect = "none";
    rightArrow.style.transition = "transform 0.2s ease, color 0.2s ease";
    rightArrow.title = "Switch to Match History List";
    rightArrow.addEventListener("mouseenter", () => {
      rightArrow.style.transform = "scale(1.2)";
      rightArrow.style.color = "#fff";
    });
    rightArrow.addEventListener("mouseleave", () => {
      rightArrow.style.transform = "scale(1)";
      rightArrow.style.color = "#ddd";
    });
    matchHistoryContainer.appendChild(rightArrow);
    const contentContainer = document.createElement("div");
    contentContainer.style.minHeight = "200px";
    matchHistoryContainer.appendChild(contentContainer);
    let currentView = "carousel";
    function updateView() {
      if (currentView === "list") {
        contentContainer.innerHTML = "";
        if (record.length > 0) {
          const sortedRecords = [...record].sort((a, b) => new Date(b.date) - new Date(a.date));
          const table = document.createElement("table");
          table.style.width = "100%";
          table.style.borderCollapse = "collapse";
          table.style.color = "#ddd";
          table.style.fontSize = isMobile2() ? "0.8rem" : "1rem";
          const headerRow = document.createElement("tr");
          ["Date", "Opponent", "Result", "Asc.Score After"].forEach((text) => {
            const th = document.createElement("th");
            th.innerText = text;
            th.style.padding = isMobile2() ? "0.5rem" : "0.75rem";
            th.style.borderBottom = "1px solid #555";
            th.style.textAlign = text === "Date" ? "left" : "center";
            th.style.backgroundColor = "rgba(0, 0, 0, 0.4)";
            th.style.fontSize = isMobile2() ? "0.8rem" : "0.9rem";
            headerRow.appendChild(th);
          });
          table.appendChild(headerRow);
          sortedRecords.forEach((match) => {
            const row = document.createElement("tr");
            const dateCell = document.createElement("td");
            dateCell.innerText = formatDate(match.date);
            dateCell.style.padding = isMobile2() ? "0.5rem" : "0.75rem";
            dateCell.style.borderBottom = "1px solid #333";
            row.appendChild(dateCell);
            const opponentCell = document.createElement("td");
            opponentCell.style.padding = isMobile2() ? "0.5rem" : "0.75rem";
            opponentCell.style.borderBottom = "1px solid #333";
            opponentCell.style.textAlign = "center";
            if (match.opponent) {
              const opponentParts = match.opponent.split(":");
              const opponentId = opponentParts[0];
              const opponentName = opponentParts[1] || opponentParts[0];
              const opponent = allPerformers.find((p) => p.ID === opponentId);
              const opponentContainer = document.createElement("div");
              opponentContainer.style.display = "flex";
              opponentContainer.style.justifyContent = "center";
              opponentContainer.style.alignItems = "center";
              opponentContainer.style.gap = "0.3rem";
              if (opponent && opponent.country) {
                const flagEmoji = getCountryFlagEmoji(opponent.country);
                if (flagEmoji) {
                  const flagSpan = document.createElement("span");
                  flagSpan.innerText = flagEmoji;
                  opponentContainer.appendChild(flagSpan);
                }
              }
              const opponentNameElement = document.createElement("span");
              opponentNameElement.innerText = opponentName;
              opponentNameElement.style.fontSize = isMobile2() ? "0.8rem" : "1rem";
              opponentContainer.appendChild(opponentNameElement);
              const opponentLinkIcon = document.createElement("a");
              opponentLinkIcon.href = `${currentOrigin}/performers/${opponentId}`;
              opponentLinkIcon.innerText = "\u{1F517}";
              opponentLinkIcon.style.textDecoration = "none";
              opponentLinkIcon.style.fontSize = isMobile2() ? "0.7rem" : "0.9rem";
              opponentLinkIcon.style.marginLeft = "0.3rem";
              opponentLinkIcon.title = "View opponent profile";
              opponentLinkIcon.target = "_blank";
              opponentContainer.appendChild(opponentLinkIcon);
              if (opponent) {
                opponentNameElement.style.color = "#1e90ff";
                opponentNameElement.style.textDecoration = "underline";
                opponentNameElement.style.cursor = "pointer";
                attachBattleScoreTooltip(opponentNameElement, opponent, allPerformers, currentOrigin);
                opponentNameElement.addEventListener("click", (e) => {
                  e.preventDefault();
                  onShowProfile(opponent);
                });
              }
              opponentCell.appendChild(opponentContainer);
            } else {
              opponentCell.innerText = "Unknown";
            }
            row.appendChild(opponentCell);
            const resultCell = document.createElement("td");
            resultCell.innerText = match.won !== void 0 ? match.won ? "Win" : "Loss" : "Unknown";
            resultCell.style.padding = isMobile2() ? "0.5rem" : "0.75rem";
            resultCell.style.borderBottom = "1px solid #333";
            resultCell.style.textAlign = "center";
            resultCell.style.color = match.won ? "#4caf50" : match.won === false ? "#f44336" : "#888";
            resultCell.style.fontWeight = "bold";
            row.appendChild(resultCell);
            const ascScoreCell = document.createElement("td");
            ascScoreCell.style.padding = isMobile2() ? "0.5rem" : "0.75rem";
            ascScoreCell.style.borderBottom = "1px solid #333";
            ascScoreCell.style.textAlign = "center";
            const matchPerformer = match.performerId ? allPerformers.find((p) => p.ID === match.performerId) : performer;
            if (match.ratingAfter !== void 0 && matchPerformer) {
              const score = computeAscScore({ ...matchPerformer, rating: match.ratingAfter });
              if (score !== null) {
                const tier = getRatingTier2({ ...matchPerformer, rating: match.ratingAfter }, allPerformers);
                const scoreElement = document.createElement("div");
                scoreElement.innerText = score.toFixed(2);
                scoreElement.style.fontSize = isMobile2() ? "0.7rem" : "0.8rem";
                scoreElement.style.fontWeight = "bold";
                scoreElement.style.color = getTierColor2(tier);
                ascScoreCell.appendChild(scoreElement);
              } else {
                ascScoreCell.innerText = "N/A";
              }
            } else {
              ascScoreCell.innerText = "N/A";
            }
            row.appendChild(ascScoreCell);
            table.appendChild(row);
          });
          contentContainer.appendChild(table);
        } else {
          const noData = document.createElement("p");
          noData.innerText = "No match history found";
          noData.style.textAlign = "center";
          noData.style.color = "#888";
          noData.style.fontStyle = "italic";
          noData.style.fontSize = isMobile2() ? "0.9rem" : "1rem";
          contentContainer.appendChild(noData);
        }
        leftArrow.title = "Switch to Match History Carousel";
        rightArrow.title = "Switch to Match History Carousel";
      } else {
        contentContainer.innerHTML = "";
        createMatchHistoryCarousel(contentContainer, performer, allPerformers, onShowProfile);
        leftArrow.title = "Switch to Match History List";
        rightArrow.title = "Switch to Match History List";
      }
    }
    leftArrow.addEventListener("click", () => {
      currentView = currentView === "list" ? "carousel" : "list";
      updateView();
    });
    rightArrow.addEventListener("click", () => {
      currentView = currentView === "list" ? "carousel" : "list";
      updateView();
    });
    updateView();
    profileContainer.appendChild(matchHistoryContainer);
    const comparisonSearchBox = createComparisonSearchBox(profileContainer, performer, allPerformers, onShowProfile);
    comparisonSearchBox.classList.add("comparison-search-box");
    profileContainer.appendChild(comparisonSearchBox);
    container.appendChild(profileContainer);
  }
  function createMatchHistoryCarousel(container, performer, allPerformers, onShowProfile) {
    const record = parsePerformerRecord(performer) || [];
    if (record.length === 0) {
      const noData = document.createElement("p");
      noData.innerText = "No match history found";
      noData.style.textAlign = "center";
      noData.style.color = "#888";
      noData.style.fontStyle = "italic";
      noData.style.fontSize = isMobile2() ? "0.9rem" : "1rem";
      container.appendChild(noData);
      return;
    }
    const sortedRecords = [...record].sort((a, b) => new Date(b.date) - new Date(a.date));
    const carouselContainer = document.createElement("div");
    carouselContainer.style.position = "relative";
    carouselContainer.style.height = isMobile2() ? "420px" : "420px";
    carouselContainer.style.display = "flex";
    carouselContainer.style.justifyContent = "center";
    carouselContainer.style.alignItems = "flex-start";
    carouselContainer.style.marginTop = "1rem";
    carouselContainer.style.flexDirection = "column";
    carouselContainer.style.width = "100%";
    carouselContainer.style.overflow = "hidden";
    container.appendChild(carouselContainer);
    const matchIndicator = document.createElement("div");
    matchIndicator.style.textAlign = "center";
    matchIndicator.style.marginTop = "0.5rem";
    matchIndicator.style.fontSize = "0.9rem";
    matchIndicator.style.color = "#aaa";
    container.appendChild(matchIndicator);
    let transitionInterval;
    const transitionDelay = 5e3;
    let currentMatchIndex = 0;
    function startAutoTransition() {
      if (transitionInterval) {
        clearInterval(transitionInterval);
      }
      transitionInterval = setInterval(() => {
        currentMatchIndex = (currentMatchIndex + 1) % sortedRecords.length;
        updateCarousel(true);
      }, transitionDelay);
    }
    function stopAutoTransition() {
      if (transitionInterval) {
        clearInterval(transitionInterval);
        transitionInterval = null;
      }
    }
    function updateCarousel(isAutoTransition = false) {
      if (!isAutoTransition) {
        stopAutoTransition();
      }
      const currentMatch = sortedRecords[currentMatchIndex];
      const newContent = document.createElement("div");
      newContent.style.position = "absolute";
      newContent.style.top = "0";
      newContent.style.left = "0";
      newContent.style.width = "100%";
      newContent.style.height = "100%";
      newContent.style.display = "flex";
      newContent.style.flexDirection = "column";
      newContent.style.justifyContent = "flex-start";
      newContent.style.alignItems = "center";
      newContent.style.opacity = "0";
      newContent.style.transition = "opacity 0.5s ease-in-out";
      newContent.style.overflowY = "hidden";
      newContent.style.padding = isMobile2() ? "0.5rem" : "0.75rem";
      newContent.style.boxSizing = "border-box";
      const currentOrigin = window.location.origin;
      let opponent = null;
      if (currentMatch.opponent) {
        const opponentParts = currentMatch.opponent.split(":");
        const opponentId = opponentParts[0];
        opponent = allPerformers.find((p) => p.ID === opponentId);
      }
      const matchDetails = document.createElement("div");
      matchDetails.style.display = "flex";
      matchDetails.style.justifyContent = "center";
      matchDetails.style.alignItems = "center";
      matchDetails.style.flexWrap = "wrap";
      matchDetails.style.gap = isMobile2() ? "0.5rem" : "1rem";
      matchDetails.style.marginBottom = isMobile2() ? "0.5rem" : "0.75rem";
      matchDetails.style.padding = isMobile2() ? "0.3rem" : "0.4rem";
      matchDetails.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
      matchDetails.style.borderRadius = "4px";
      matchDetails.style.width = "100%";
      matchDetails.style.boxSizing = "border-box";
      const dateElement = document.createElement("div");
      dateElement.innerText = formatDate(currentMatch.date);
      dateElement.style.fontWeight = "bold";
      dateElement.style.color = "#ddd";
      dateElement.style.fontSize = isMobile2() ? "0.8rem" : "0.95rem";
      matchDetails.appendChild(dateElement);
      const resultElement = document.createElement("div");
      resultElement.innerText = currentMatch.won !== void 0 ? currentMatch.won ? "Win" : "Loss" : "Unknown";
      resultElement.style.fontWeight = "bold";
      resultElement.style.color = currentMatch.won ? "#4caf50" : currentMatch.won === false ? "#f44336" : "#888";
      resultElement.style.fontSize = isMobile2() ? "0.8rem" : "0.95rem";
      matchDetails.appendChild(resultElement);
      if (currentMatch.ratingAfter !== void 0) {
        const scoreContainer = document.createElement("div");
        scoreContainer.style.display = "flex";
        scoreContainer.style.alignItems = "center";
        scoreContainer.style.gap = "0.3rem";
        const scoreLabel = document.createElement("span");
        scoreLabel.innerText = "Asc.Score:";
        scoreLabel.style.color = "#aaa";
        scoreLabel.style.fontSize = isMobile2() ? "0.7rem" : "0.85rem";
        scoreContainer.appendChild(scoreLabel);
        const matchPerformer = currentMatch.performerId ? allPerformers.find((p) => p.ID === currentMatch.performerId) : performer;
        const score = matchPerformer ? computeAscScore({ ...matchPerformer, rating: currentMatch.ratingAfter }) : null;
        if (score !== null) {
          const tier = getRatingTier2({ ...matchPerformer, rating: currentMatch.ratingAfter }, allPerformers);
          const scoreElement = document.createElement("span");
          scoreElement.innerText = score.toFixed(2);
          scoreElement.style.fontWeight = "bold";
          scoreElement.style.color = getTierColor2(tier);
          scoreElement.style.fontSize = isMobile2() ? "0.75rem" : "0.9rem";
          scoreContainer.appendChild(scoreElement);
        } else {
          const scoreText = document.createElement("span");
          scoreText.innerText = "N/A";
          scoreText.style.color = "#888";
          scoreText.style.fontSize = isMobile2() ? "0.75rem" : "0.9rem";
          scoreContainer.appendChild(scoreText);
        }
        matchDetails.appendChild(scoreContainer);
      }
      newContent.appendChild(matchDetails);
      const comparisonView = document.createElement("div");
      comparisonView.style.display = "flex";
      comparisonView.style.flexDirection = isMobile2() ? "column" : "row";
      comparisonView.style.gap = isMobile2() ? "0.5rem" : "1.2rem";
      comparisonView.style.justifyContent = "center";
      comparisonView.style.alignItems = "flex-start";
      comparisonView.style.width = "100%";
      comparisonView.style.maxWidth = "100%";
      comparisonView.style.padding = isMobile2() ? "0.25rem" : "0.5rem";
      comparisonView.style.boxSizing = "border-box";
      comparisonView.style.flexShrink = "0";
      const createSimplifiedProfileCard = (perf, opp = null) => {
        const card = document.createElement("div");
        card.style.flex = "1";
        card.style.minWidth = "0";
        card.style.padding = isMobile2() ? "0.4rem" : "0.85rem";
        card.style.backgroundColor = "rgba(0, 0, 0, 0.3)";
        card.style.borderRadius = "6px";
        card.style.border = "1px solid #555";
        card.style.display = "flex";
        card.style.flexDirection = "column";
        card.style.alignItems = "center";
        card.style.width = "100%";
        card.style.boxSizing = "border-box";
        card.style.minHeight = isMobile2() ? "160px" : "250px";
        card.style.marginBottom = isMobile2() ? "0.25rem" : "0.3rem";
        const currentOrigin2 = window.location.origin;
        const nameContainer = document.createElement("div");
        nameContainer.style.display = "flex";
        nameContainer.style.alignItems = "center";
        nameContainer.style.gap = isMobile2() ? "0.25rem" : "0.4rem";
        nameContainer.style.marginBottom = isMobile2() ? "0.25rem" : "0.4rem";
        nameContainer.style.width = "100%";
        nameContainer.style.justifyContent = "center";
        if (perf.country) {
          const flagEmoji = getCountryFlagEmoji(perf.country);
          if (flagEmoji) {
            const flagSpan = document.createElement("span");
            flagSpan.innerText = flagEmoji;
            flagSpan.style.fontSize = isMobile2() ? "0.75rem" : "1.1rem";
            nameContainer.appendChild(flagSpan);
          }
        }
        const name = document.createElement("h4");
        name.innerText = perf.name;
        name.style.margin = "0";
        name.style.color = "#fff";
        name.style.fontSize = isMobile2() ? "0.8rem" : "1.3rem";
        name.style.overflow = "hidden";
        name.style.textOverflow = "ellipsis";
        name.style.whiteSpace = "nowrap";
        nameContainer.appendChild(name);
        card.appendChild(nameContainer);
        const imageSize = isMobile2() ? "45px" : "80px";
        if (perf.image_path) {
          let fixedImagePath = perf.image_path;
          try {
            const imageUrl = new URL(perf.image_path);
            const currentUrl = new URL(currentOrigin2);
            imageUrl.protocol = currentUrl.protocol;
            imageUrl.hostname = currentUrl.hostname;
            imageUrl.port = currentUrl.port;
            fixedImagePath = imageUrl.toString();
          } catch (e) {
            try {
              const path = new URL(perf.image_path).pathname + new URL(perf.image_path).search;
              fixedImagePath = currentOrigin2 + path;
            } catch (e2) {
              fixedImagePath = perf.image_path;
            }
          }
          const imageContainer = document.createElement("div");
          imageContainer.style.width = imageSize;
          imageContainer.style.height = imageSize;
          imageContainer.style.borderRadius = "50%";
          imageContainer.style.overflow = "hidden";
          imageContainer.style.border = "2px solid #555";
          imageContainer.style.marginBottom = isMobile2() ? "0.25rem" : "0.6rem";
          const img = document.createElement("img");
          img.src = fixedImagePath;
          img.alt = `${perf.name} profile image`;
          img.style.width = "100%";
          img.style.height = "100%";
          img.style.objectFit = "cover";
          img.style.display = "block";
          img.style.objectPosition = "center 15%";
          img.onerror = function() {
            imageContainer.innerHTML = "";
            const placeholderIcon = document.createElement("span");
            placeholderIcon.innerText = "\u{1F464}";
            placeholderIcon.style.fontSize = isMobile2() ? "1.1rem" : "2.2rem";
            placeholderIcon.style.color = "#888";
            placeholderIcon.style.display = "flex";
            placeholderIcon.style.alignItems = "center";
            placeholderIcon.style.justifyContent = "center";
            placeholderIcon.style.height = "100%";
            imageContainer.appendChild(placeholderIcon);
          };
          imageContainer.appendChild(img);
          card.appendChild(imageContainer);
        } else {
          const imageContainer = document.createElement("div");
          imageContainer.style.width = imageSize;
          imageContainer.style.height = imageSize;
          imageContainer.style.borderRadius = "50%";
          imageContainer.style.overflow = "hidden";
          imageContainer.style.border = "2px solid #555";
          imageContainer.style.marginBottom = isMobile2() ? "0.25rem" : "0.6rem";
          imageContainer.style.backgroundColor = "#333";
          imageContainer.style.display = "flex";
          imageContainer.style.alignItems = "center";
          imageContainer.style.justifyContent = "center";
          const placeholderIcon = document.createElement("span");
          placeholderIcon.innerText = "\u{1F464}";
          placeholderIcon.style.fontSize = isMobile2() ? "1.1rem" : "2.2rem";
          placeholderIcon.style.color = "#888";
          imageContainer.appendChild(placeholderIcon);
          card.appendChild(imageContainer);
        }
        const performerTier = getRatingTier2(perf, allPerformers);
        const tierColor = getTierColor2(performerTier);
        const tierElement = document.createElement("div");
        tierElement.style.padding = isMobile2() ? "0.15rem 0.3rem" : "0.35rem 0.7rem";
        tierElement.style.backgroundColor = "rgba(0, 0, 0, 0.4)";
        tierElement.style.borderRadius = "4px";
        tierElement.style.textAlign = "center";
        tierElement.style.marginBottom = isMobile2() ? "0.25rem" : "0.4rem";
        tierElement.style.width = "100%";
        const tierTitle = document.createElement("p");
        tierTitle.classList.add("title");
        tierTitle.style.fontSize = isMobile2() ? "0.65rem" : "1.1rem";
        tierTitle.style.marginBottom = isMobile2() ? "0.1rem" : "0.2rem";
        tierTitle.style.color = tierColor;
        tierTitle.style.fontWeight = "bold";
        tierTitle.innerText = performerTier;
        tierElement.appendChild(tierTitle);
        card.appendChild(tierElement);
        const scoreContainer = document.createElement("div");
        scoreContainer.style.marginBottom = isMobile2() ? "0.25rem" : "0.4rem";
        const score = computeAscScore(perf);
        if (score !== null) {
          const scoreElement = document.createElement("div");
          scoreElement.innerText = score.toFixed(2);
          scoreElement.style.fontSize = isMobile2() ? "0.65rem" : "1rem";
          scoreElement.style.fontWeight = "bold";
          scoreElement.style.color = tierColor;
          scoreContainer.appendChild(scoreElement);
        } else {
          const scoreText = document.createElement("div");
          scoreText.innerText = "N/A";
          scoreText.style.fontSize = isMobile2() ? "0.65rem" : "1rem";
          scoreText.style.color = "#888";
          scoreContainer.appendChild(scoreText);
        }
        card.appendChild(scoreContainer);
        const stats = parsePerformerStats(perf) || {};
        const statsContainer = document.createElement("div");
        statsContainer.style.display = "flex";
        statsContainer.style.justifyContent = "center";
        statsContainer.style.gap = isMobile2() ? "0.3rem" : "0.6rem";
        statsContainer.style.fontSize = isMobile2() ? "0.6rem" : "0.95rem";
        const winsContainer = document.createElement("div");
        winsContainer.style.display = "flex";
        winsContainer.style.flexDirection = "column";
        winsContainer.style.alignItems = "center";
        const winsValue = document.createElement("div");
        winsValue.innerText = stats.wins || 0;
        winsValue.style.fontWeight = "bold";
        winsValue.style.color = "#4caf50";
        winsContainer.appendChild(winsValue);
        const winsLabel = document.createElement("div");
        winsLabel.innerText = "W";
        winsLabel.style.color = "#aaa";
        winsContainer.appendChild(winsLabel);
        statsContainer.appendChild(winsContainer);
        const lossesContainer = document.createElement("div");
        lossesContainer.style.display = "flex";
        lossesContainer.style.flexDirection = "column";
        lossesContainer.style.alignItems = "center";
        const lossesValue = document.createElement("div");
        lossesValue.innerText = stats.losses || 0;
        lossesValue.style.fontWeight = "bold";
        lossesValue.style.color = "#f44336";
        lossesContainer.appendChild(lossesValue);
        const lossesLabel = document.createElement("div");
        lossesLabel.innerText = "L";
        lossesLabel.style.color = "#aaa";
        lossesContainer.appendChild(lossesLabel);
        statsContainer.appendChild(lossesContainer);
        const marginContainer = document.createElement("div");
        marginContainer.style.display = "flex";
        marginContainer.style.flexDirection = "column";
        marginContainer.style.alignItems = "center";
        const marginValue = document.createElement("div");
        marginValue.innerText = (stats.win_margin || 0) > 0 ? `+${stats.win_margin}` : stats.win_margin || 0;
        marginValue.style.fontWeight = "bold";
        marginValue.style.color = (stats.win_margin || 0) >= 0 ? "#4caf50" : "#f44336";
        marginContainer.appendChild(marginValue);
        const marginLabel = document.createElement("div");
        marginLabel.innerText = "M";
        marginLabel.style.color = "#aaa";
        marginContainer.appendChild(marginLabel);
        statsContainer.appendChild(marginContainer);
        card.appendChild(statsContainer);
        return card;
      };
      const performerCard = createSimplifiedProfileCard(performer, opponent);
      let opponentCard;
      if (opponent) {
        opponentCard = createSimplifiedProfileCard(opponent, performer);
      } else {
        opponentCard = document.createElement("div");
        opponentCard.style.flex = "1";
        opponentCard.style.minWidth = "0";
        opponentCard.style.padding = isMobile2() ? "0.4rem" : "0.85rem";
        opponentCard.style.backgroundColor = "rgba(0, 0, 0, 0.3)";
        opponentCard.style.borderRadius = "6px";
        opponentCard.style.border = "1px solid #555";
        opponentCard.style.display = "flex";
        opponentCard.style.flexDirection = "column";
        opponentCard.style.alignItems = "center";
        opponentCard.style.width = "100%";
        opponentCard.style.boxSizing = "border-box";
        opponentCard.style.minHeight = isMobile2() ? "160px" : "250px";
        opponentCard.style.marginBottom = isMobile2() ? "0.25rem" : "0.3rem";
        const unknownText = document.createElement("div");
        unknownText.innerText = "Unknown Opponent";
        unknownText.style.color = "#888";
        unknownText.style.fontStyle = "italic";
        unknownText.style.textAlign = "center";
        unknownText.style.margin = isMobile2() ? "0.4rem 0" : "0.7rem 0";
        unknownText.style.fontSize = isMobile2() ? "0.75rem" : "1.1rem";
        opponentCard.appendChild(unknownText);
      }
      comparisonView.appendChild(performerCard);
      comparisonView.appendChild(opponentCard);
      newContent.appendChild(comparisonView);
      carouselContainer.appendChild(newContent);
      setTimeout(() => {
        newContent.style.opacity = "1";
      }, 10);
      const oldContent = carouselContainer.firstChild;
      if (oldContent && oldContent !== newContent) {
        oldContent.style.opacity = "0";
        setTimeout(() => {
          if (oldContent.parentNode === carouselContainer) {
            carouselContainer.removeChild(oldContent);
          }
        }, 500);
      }
      matchIndicator.innerHTML = "";
      sortedRecords.forEach((match, index) => {
        const matchSpan = document.createElement("span");
        matchSpan.innerText = "\u2022";
        matchSpan.style.margin = "0 3px";
        matchSpan.style.cursor = "pointer";
        matchSpan.style.color = index === currentMatchIndex ? "#fff" : "#555";
        matchSpan.style.fontSize = "1.2rem";
        matchSpan.addEventListener("click", () => {
          currentMatchIndex = index;
          updateCarousel(false);
        });
        matchIndicator.appendChild(matchSpan);
      });
    }
    updateCarousel();
    startAutoTransition();
    container.addEventListener("mouseleave", () => {
      setTimeout(() => {
        startAutoTransition();
      }, 1e3);
    });
  }
  function showComparisonView(performer1, performer2, allPerformers, onShowProfile, scenes) {
    const comparisonContainer = document.createElement("div");
    comparisonContainer.style.marginTop = "2rem";
    comparisonContainer.style.padding = "1.5rem";
    comparisonContainer.style.backgroundColor = "rgba(0, 0, 0, 0.3)";
    comparisonContainer.style.borderRadius = "8px";
    comparisonContainer.style.border = "1px solid #555";
    const comparisonHeader = document.createElement("h3");
    comparisonHeader.innerText = `Comparison: ${performer1.name} vs ${performer2.name}`;
    comparisonHeader.style.color = "#fff";
    comparisonHeader.style.marginBottom = "1.5rem";
    comparisonHeader.style.textAlign = "center";
    comparisonHeader.style.fontSize = isMobile2() ? "1.3rem" : "1.5rem";
    comparisonHeader.style.borderBottom = "1px solid #444";
    comparisonHeader.style.paddingBottom = "0.75rem";
    comparisonContainer.appendChild(comparisonHeader);
    const profilesContainer = document.createElement("div");
    profilesContainer.style.display = "flex";
    profilesContainer.style.flexDirection = isMobile2() ? "column" : "row";
    profilesContainer.style.gap = "2rem";
    profilesContainer.style.justifyContent = "center";
    if (isMobile2()) {
      profilesContainer.style.alignItems = "center";
    }
    const profile1Card = createComparisonProfileCard(performer1, allPerformers, onShowProfile, performer2, scenes);
    const profile2Card = createComparisonProfileCard(performer2, allPerformers, onShowProfile, performer1, scenes);
    profilesContainer.appendChild(profile1Card);
    profilesContainer.appendChild(profile2Card);
    comparisonContainer.appendChild(profilesContainer);
    const closeButton = document.createElement("button");
    closeButton.innerText = "Close Comparison";
    closeButton.style.marginTop = "1.5rem";
    closeButton.style.padding = "0.75rem 1.5rem";
    closeButton.style.backgroundColor = "#333";
    closeButton.style.color = "white";
    closeButton.style.border = "1px solid #555";
    closeButton.style.borderRadius = "4px";
    closeButton.style.cursor = "pointer";
    closeButton.style.display = "block";
    closeButton.style.marginLeft = "auto";
    closeButton.style.marginRight = "auto";
    closeButton.style.transition = "background-color 0.3s ease, transform 0.2s ease";
    closeButton.addEventListener("mouseenter", () => {
      closeButton.style.backgroundColor = "#444";
      closeButton.style.transform = "scale(1.05)";
    });
    closeButton.addEventListener("mouseleave", () => {
      closeButton.style.backgroundColor = "#333";
      closeButton.style.transform = "scale(1)";
    });
    closeButton.addEventListener("click", () => {
      comparisonContainer.remove();
    });
    comparisonContainer.appendChild(closeButton);
    const searchBox = document.querySelector(".comparison-search-box");
    if (searchBox) {
      searchBox.parentNode.insertBefore(comparisonContainer, searchBox.nextSibling);
    } else {
      document.querySelector(".performer-profile-container").appendChild(comparisonContainer);
    }
  }
  function createComparisonProfileCard(performer, allPerformers, onShowProfile, comparisonPerformer = null, scenes = []) {
    const card = document.createElement("div");
    card.style.flex = "1";
    card.style.minWidth = "0";
    card.style.padding = "1rem";
    card.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
    card.style.borderRadius = "8px";
    card.style.border = "1px solid #555";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.alignItems = "center";
    const currentOrigin = window.location.origin;
    const nameContainer = document.createElement("div");
    nameContainer.style.display = "flex";
    nameContainer.style.alignItems = "center";
    nameContainer.style.gap = "0.5rem";
    nameContainer.style.marginBottom = "1rem";
    if (performer.country) {
      const flagEmoji = getCountryFlagEmoji(performer.country);
      if (flagEmoji) {
        const flagSpan = document.createElement("span");
        flagSpan.innerText = flagEmoji;
        flagSpan.style.fontSize = isMobile2() ? "1.1rem" : "1.25rem";
        nameContainer.appendChild(flagSpan);
      }
    }
    const name = document.createElement("h4");
    name.innerText = performer.name;
    name.style.margin = "0";
    name.style.color = "#fff";
    name.style.fontSize = isMobile2() ? "1.1rem" : "1.25rem";
    nameContainer.appendChild(name);
    if (performer.ID) {
      const linkIcon = document.createElement("a");
      linkIcon.href = `${currentOrigin}/performers/${performer.ID}`;
      linkIcon.innerText = "\u{1F517}";
      linkIcon.style.textDecoration = "none";
      linkIcon.style.fontSize = isMobile2() ? "0.9rem" : "1rem";
      linkIcon.title = "View performer profile";
      linkIcon.target = "_blank";
      nameContainer.appendChild(linkIcon);
    }
    card.appendChild(nameContainer);
    const imageSize = isMobile2() ? "100px" : "120px";
    if (performer.image_path) {
      let fixedImagePath = performer.image_path;
      try {
        const imageUrl = new URL(performer.image_path);
        const currentUrl = new URL(currentOrigin);
        imageUrl.protocol = currentUrl.protocol;
        imageUrl.hostname = currentUrl.hostname;
        imageUrl.port = currentUrl.port;
        fixedImagePath = imageUrl.toString();
      } catch (e) {
        try {
          const path = new URL(performer.image_path).pathname + new URL(performer.image_path).search;
          fixedImagePath = currentOrigin + path;
        } catch (e2) {
          fixedImagePath = performer.image_path;
        }
      }
      const imageContainer = document.createElement("div");
      imageContainer.style.width = imageSize;
      imageContainer.style.height = imageSize;
      imageContainer.style.borderRadius = "50%";
      imageContainer.style.overflow = "hidden";
      imageContainer.style.border = "2px solid #555";
      imageContainer.style.marginBottom = "1rem";
      const img = document.createElement("img");
      img.src = fixedImagePath;
      img.alt = `${performer.name} profile image`;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      img.style.display = "block";
      img.style.objectPosition = "center 15%";
      img.onerror = function() {
        imageContainer.innerHTML = "";
        const placeholderIcon = document.createElement("span");
        placeholderIcon.innerText = "\u{1F464}";
        placeholderIcon.style.fontSize = isMobile2() ? "2rem" : "3rem";
        placeholderIcon.style.color = "#888";
        placeholderIcon.style.display = "flex";
        placeholderIcon.style.alignItems = "center";
        placeholderIcon.style.justifyContent = "center";
        placeholderIcon.style.height = "100%";
        imageContainer.appendChild(placeholderIcon);
      };
      imageContainer.appendChild(img);
      card.appendChild(imageContainer);
    } else {
      const imageContainer = document.createElement("div");
      imageContainer.style.width = imageSize;
      imageContainer.style.height = imageSize;
      imageContainer.style.borderRadius = "50%";
      imageContainer.style.overflow = "hidden";
      imageContainer.style.border = "2px solid #555";
      imageContainer.style.marginBottom = "1rem";
      imageContainer.style.backgroundColor = "#333";
      imageContainer.style.display = "flex";
      imageContainer.style.alignItems = "center";
      imageContainer.style.justifyContent = "center";
      const placeholderIcon = document.createElement("span");
      placeholderIcon.innerText = "\u{1F464}";
      placeholderIcon.style.fontSize = isMobile2() ? "2rem" : "3rem";
      placeholderIcon.style.color = "#888";
      imageContainer.appendChild(placeholderIcon);
      card.appendChild(imageContainer);
    }
    const performerTier = getRatingTier2(performer, allPerformers);
    const tierColor = getTierColor2(performerTier);
    const tierElement = document.createElement("div");
    tierElement.style.padding = "0.5rem 1rem";
    tierElement.style.backgroundColor = "rgba(0, 0, 0, 0.4)";
    tierElement.style.borderRadius = "6px";
    tierElement.style.textAlign = "center";
    tierElement.style.marginBottom = "1rem";
    const tierTitle = document.createElement("p");
    tierTitle.classList.add("title");
    tierTitle.style.fontSize = isMobile2() ? "1rem" : "1.2rem";
    tierTitle.style.marginBottom = "0.25rem";
    tierTitle.style.color = tierColor;
    tierTitle.style.fontWeight = "bold";
    tierTitle.innerText = performerTier;
    tierElement.appendChild(tierTitle);
    const tierHeading = document.createElement("p");
    tierHeading.classList.add("heading");
    tierHeading.style.fontSize = isMobile2() ? "0.7rem" : "0.8rem";
    tierHeading.style.color = "#aaa";
    tierHeading.innerText = "Current Tier";
    tierElement.appendChild(tierHeading);
    card.appendChild(tierElement);
    const statsGrid = document.createElement("div");
    statsGrid.style.display = "grid";
    statsGrid.style.gridTemplateColumns = "repeat(2, 1fr)";
    statsGrid.style.gap = "0.75rem";
    statsGrid.style.width = "100%";
    statsGrid.style.marginBottom = "1rem";
    const stats = parsePerformerStats(performer) || {};
    const comparisonStats = comparisonPerformer ? parsePerformerStats(comparisonPerformer) || {} : {};
    const winRate = getWinRate(performer);
    const comparisonWinRate = comparisonPerformer ? getWinRate(comparisonPerformer) : null;
    const sceneStats = getCachedPerformerSceneStats(performer, scenes || []);
    const avgSceneRatingText = sceneStats.avgSceneRating !== null ? (sceneStats.avgSceneRating / 10).toFixed(1) : "N/A";
    const comparisonSceneStats = comparisonPerformer ? getCachedPerformerSceneStats(comparisonPerformer, scenes || []) : null;
    const comparisonAvgSceneRatingText = comparisonSceneStats ? comparisonSceneStats.avgSceneRating !== null ? (comparisonSceneStats.avgSceneRating / 10).toFixed(1) : "N/A" : null;
    const statCards = [
      {
        title: ascScoreTitle(performer),
        heading: "Asc.Score",
        tooltip: "Current Ascension battle score",
        color: tierColor,
        comparisonValue: comparisonPerformer ? ascScoreTitle(comparisonPerformer) : null
      },
      {
        title: stats.total_matches || 0,
        heading: "Matches",
        tooltip: "Total matches played",
        comparisonValue: comparisonStats.total_matches
      },
      {
        title: `${winRate}%`,
        heading: "Win Rate",
        tooltip: "Win percentage",
        color: parseFloat(winRate) >= 50 ? "#4caf50" : "#f44336",
        comparisonValue: comparisonWinRate
      },
      {
        title: stats.wins || 0,
        heading: "Wins",
        tooltip: "Total wins",
        color: "#4caf50",
        comparisonValue: comparisonStats.wins
      },
      {
        title: stats.losses || 0,
        heading: "Losses",
        tooltip: "Total losses",
        color: "#f44336",
        comparisonValue: comparisonStats.losses
      },
      {
        title: stats.draws || 0,
        heading: "Draws",
        tooltip: "Total draws",
        comparisonValue: comparisonStats.draws
      },
      {
        title: stats.current_streak || 0,
        heading: "Streak",
        tooltip: "Current win/loss streak",
        comparisonValue: comparisonStats.current_streak
      },
      {
        title: stats.best_streak || 0,
        heading: "Best Streak",
        tooltip: "Best winning streak",
        color: "#4caf50",
        comparisonValue: comparisonStats.best_streak
      },
      {
        title: stats.worst_streak !== void 0 ? stats.worst_streak : "N/A",
        heading: "Worst Streak",
        tooltip: "Worst losing streak",
        color: "#f44336",
        comparisonValue: comparisonStats.worst_streak !== void 0 ? comparisonStats.worst_streak : "N/A"
      },
      {
        title: (stats.win_margin || 0) > 0 ? `+${stats.win_margin}` : stats.win_margin || 0,
        heading: "Win Margin",
        tooltip: "Cumulative rating point margin from wins and losses",
        color: (stats.win_margin || 0) > 0 ? "#4caf50" : (stats.win_margin || 0) < 0 ? "#f44336" : "#fff",
        comparisonValue: comparisonStats.win_margin
      },
      {
        title: sceneStats.sceneCount,
        heading: "Scenes",
        tooltip: "Total number of scenes",
        comparisonValue: comparisonSceneStats ? comparisonSceneStats.sceneCount : null
      },
      {
        title: avgSceneRatingText,
        heading: "Avg Scene Rating",
        tooltip: "Average scene rating (display scale)",
        color: getSceneRatingColor(sceneStats.avgSceneRating),
        comparisonValue: comparisonAvgSceneRatingText
      }
    ];
    statCards.forEach((cardData) => {
      const statEl = document.createElement("div");
      statEl.style.padding = "0.5rem";
      statEl.style.backgroundColor = "rgba(0, 0, 0, 0.4)";
      statEl.style.borderRadius = "6px";
      statEl.style.textAlign = "center";
      const statTitle = document.createElement("p");
      statTitle.classList.add("title");
      statTitle.style.fontSize = isMobile2() ? "0.9rem" : "1rem";
      statTitle.style.marginBottom = "0.25rem";
      statTitle.style.color = cardData.color || "#fff";
      statTitle.style.fontWeight = cardData.color ? "bold" : "normal";
      if (cardData.comparisonValue !== null && cardData.comparisonValue !== void 0) {
        const currentValue = cardData.title;
        const comparisonValue = cardData.comparisonValue;
        if (!isNaN(currentValue) && !isNaN(comparisonValue) && currentValue !== "N/A" && comparisonValue !== "N/A") {
          const isAscScore = cardData.heading === "Asc.Score";
          const isAvgSceneRating = cardData.heading === "Avg Scene Rating";
          const currentNum = isAscScore || isAvgSceneRating ? parseFloat(currentValue) : parseInt(currentValue);
          const comparisonNum = isAscScore || isAvgSceneRating ? parseFloat(comparisonValue) : parseInt(comparisonValue);
          const diff = currentNum - comparisonNum;
          const diffText = isAscScore || isAvgSceneRating ? diff.toFixed(2) : diff;
          if (diff > 0) {
            statTitle.innerHTML = `<span style="color: ${cardData.color || "#fff"}">${currentValue}</span> <span style="color: #4caf50; font-size: 0.8em;">(+${diffText})</span>`;
          } else if (diff < 0) {
            statTitle.innerHTML = `<span style="color: ${cardData.color || "#fff"}">${currentValue}</span> <span style="color: #f44336; font-size: 0.8em;">(${diffText})</span>`;
          } else {
            statTitle.innerHTML = `<span style="color: ${cardData.color || "#fff"}">${currentValue}</span> <span style="color: #aaa; font-size: 0.8em;">(=)</span>`;
          }
        } else {
          statTitle.innerText = currentValue;
        }
      } else {
        statTitle.innerText = cardData.title;
      }
      statEl.appendChild(statTitle);
      const statHeading = document.createElement("p");
      statHeading.classList.add("heading");
      statHeading.style.fontSize = isMobile2() ? "0.7rem" : "0.8rem";
      statHeading.style.color = "#aaa";
      statHeading.innerText = cardData.heading;
      statEl.appendChild(statHeading);
      if (cardData.tooltip) {
        statEl.title = cardData.tooltip;
        statEl.style.cursor = "help";
      }
      statsGrid.appendChild(statEl);
    });
    card.appendChild(statsGrid);
    const viewProfileButton = document.createElement("button");
    viewProfileButton.innerText = "View Full Profile";
    viewProfileButton.style.padding = "0.5rem 1rem";
    viewProfileButton.style.backgroundColor = "#333";
    viewProfileButton.style.color = "white";
    viewProfileButton.style.border = "1px solid #555";
    viewProfileButton.style.borderRadius = "4px";
    viewProfileButton.style.cursor = "pointer";
    viewProfileButton.style.fontSize = isMobile2() ? "0.8rem" : "0.9rem";
    viewProfileButton.style.transition = "background-color 0.3s ease, transform 0.2s ease";
    viewProfileButton.style.width = "100%";
    viewProfileButton.addEventListener("mouseenter", () => {
      viewProfileButton.style.backgroundColor = "#444";
      viewProfileButton.style.transform = "scale(1.02)";
    });
    viewProfileButton.addEventListener("mouseleave", () => {
      viewProfileButton.style.backgroundColor = "#333";
      viewProfileButton.style.transform = "scale(1)";
    });
    viewProfileButton.addEventListener("click", () => {
      onShowProfile(performer);
    });
    card.appendChild(viewProfileButton);
    return card;
  }

  // metrics-dashboard.js
  var performerProfileContainer = null;
  var activeCarouselInterval = null;
  function clearActiveCarouselInterval() {
    if (activeCarouselInterval) {
      clearInterval(activeCarouselInterval);
      activeCarouselInterval = null;
    }
  }
  function showPerformerProfile(container, performers, scenes) {
    return function(performer, action, comparisonPerformer) {
      if (action === "comparison" && comparisonPerformer) {
        showComparisonView(comparisonPerformer, performer, performers, showPerformerProfile(container, performers, scenes), scenes);
        return;
      }
      if (performerProfileContainer) {
        if (performerProfileContainer.parentNode) {
          performerProfileContainer.parentNode.removeChild(performerProfileContainer);
        }
      }
      performerProfileContainer = document.createElement("div");
      performerProfileContainer.className = "performer-profile-container";
      container.appendChild(performerProfileContainer);
      createPerformerProfile(performerProfileContainer, performer, performers, showPerformerProfile(container, performers, scenes), scenes);
      performerProfileContainer.scrollIntoView({ behavior: "smooth" });
    };
  }
  function yieldToMain() {
    if (typeof scheduler !== "undefined" && scheduler.yield) {
      return scheduler.yield();
    }
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  function createMinHeap(comparator) {
    const heap = [];
    function bubbleUp(idx) {
      while (idx > 0) {
        const parent = idx - 1 >>> 1;
        if (comparator(heap[idx], heap[parent]) >= 0)
          break;
        [heap[parent], heap[idx]] = [heap[idx], heap[parent]];
        idx = parent;
      }
    }
    function sinkDown(idx) {
      const len = heap.length;
      while (true) {
        let smallest = idx;
        const left = 2 * idx + 1;
        const right = 2 * idx + 2;
        if (left < len && comparator(heap[left], heap[smallest]) < 0)
          smallest = left;
        if (right < len && comparator(heap[right], heap[smallest]) < 0)
          smallest = right;
        if (smallest === idx)
          break;
        [heap[idx], heap[smallest]] = [heap[smallest], heap[idx]];
        idx = smallest;
      }
    }
    return {
      push(item) {
        heap.push(item);
        bubbleUp(heap.length - 1);
      },
      pop() {
        if (heap.length === 0)
          return void 0;
        const top = heap[0];
        const end = heap.pop();
        if (heap.length > 0) {
          heap[0] = end;
          sinkDown(0);
        }
        return top;
      },
      peek() {
        return heap[0];
      },
      size() {
        return heap.length;
      },
      toSortedArray(descending = true) {
        const sorted = [...heap].sort(comparator);
        return descending ? sorted.reverse() : sorted;
      }
    };
  }
  function topStatsComparator(a, b) {
    const scoreDiff = (a.ascScore || 0) - (b.ascScore || 0);
    if (scoreDiff !== 0)
      return scoreDiff;
    const winsDiff = (a.wins || 0) - (b.wins || 0);
    if (winsDiff !== 0)
      return winsDiff;
    return (a.totalMatches || 0) - (b.totalMatches || 0);
  }
  var normalizeName = (name) => (name || "").toString().toLowerCase().trim().replace(/\s+/g, " ");
  function parseOpponent(opponentStr) {
    const parts = opponentStr ? opponentStr.split(":") : [];
    if (parts.length >= 2 && /^\d+$/.test(parts[0].trim())) {
      return {
        id: parts[0].trim(),
        name: parts.slice(1).join(":").trim()
      };
    }
    return { id: null, name: (opponentStr || "").trim() };
  }
  function getDateKey(dateStr) {
    const dateObj = new Date(dateStr);
    if (isNaN(dateObj))
      return null;
    return dateObj.toISOString().slice(0, 19);
  }
  async function createMetricsDashboard(container, snapshotData) {
    container.innerHTML = "";
    clearActiveCarouselInterval();
    const currentOrigin = window.location.origin;
    const header = document.createElement("h2");
    header.innerText = "Ascension Metrics";
    header.style.textAlign = "center";
    header.style.marginBottom = "2rem";
    header.style.color = "#fff";
    header.style.borderBottom = "1px solid #444";
    header.style.paddingBottom = "1rem";
    header.style.fontSize = isMobile2() ? "1.5rem" : "2rem";
    container.appendChild(header);
    const performers = snapshotData.performers || [];
    const scenes = snapshotData.scenes || [];
    const metrics = calculateMetrics(performers);
    const rowOne = document.createElement("div");
    rowOne.style.display = "flex";
    rowOne.style.justifyContent = "center";
    rowOne.style.flexWrap = "wrap";
    rowOne.style.gap = "1rem";
    rowOne.style.marginBottom = "2rem";
    rowOne.style.padding = "1rem";
    if (isMobile2()) {
      rowOne.style.flexDirection = "column";
      rowOne.style.alignItems = "center";
    }
    container.appendChild(rowOne);
    const rowTwo = document.createElement("div");
    rowTwo.style.display = "flex";
    rowTwo.style.justifyContent = "center";
    rowTwo.style.flexWrap = "wrap";
    rowTwo.style.gap = "1rem";
    rowTwo.style.marginBottom = "2rem";
    rowTwo.style.padding = "1rem";
    if (isMobile2()) {
      rowTwo.style.flexDirection = "column";
      rowTwo.style.alignItems = "center";
    }
    container.appendChild(rowTwo);
    createStatElement(rowOne, metrics.totalMatches, "Total Matches", "Total number of matches played");
    createStatElement(rowOne, metrics.totalWins, "Wins", "Total wins across all performers");
    createStatElement(rowOne, metrics.totalLosses, "Losses", "Total losses across all performers");
    createStatElement(rowOne, metrics.totalDraws, "Draws", "Total draws across all performers");
    createStatElement(rowOne, metrics.averageMatchesPerPerformer, "Avg Matches/Performer", "Average matches per performer (excluding 0-match performers)");
    const highestBattleScoreName = metrics.highestRatedPerformer ? metrics.highestRatedPerformer.name : "N/A";
    const highestBattleScoreValue = metrics.highestRatedPerformer ? metrics.highestBattleScore.toFixed(2) : "0.00";
    createStatElement(
      rowTwo,
      highestBattleScoreName,
      "Highest Asc.Score",
      `Performer with highest battle score: ${highestBattleScoreValue}`
    );
    const mostActiveName = metrics.mostActivePerformer ? metrics.mostActivePerformer.name : "N/A";
    const mostActiveStats = metrics.mostActivePerformer ? parsePerformerStats(metrics.mostActivePerformer) : null;
    createStatElement(
      rowTwo,
      mostActiveName,
      "Most Active",
      `Performer with most matches: ${mostActiveStats ? mostActiveStats.total_matches || 0 : 0}`
    );
    let countryDisplay = "N/A";
    if (metrics.highestRatedCountry) {
      const COUNTRY_NAMES2 = window.AscensionConstants && window.AscensionConstants.COUNTRY_NAMES || {};
      const countryName = COUNTRY_NAMES2[metrics.highestRatedCountry] || metrics.highestRatedCountry;
      const flagEmoji = getCountryFlagEmoji(metrics.highestRatedCountry);
      countryDisplay = `${flagEmoji} ${countryName}`;
    }
    createStatElement(
      rowTwo,
      countryDisplay,
      "Highest Asc.Score Country",
      `Country with highest average battle score (min 5 performers): ${metrics.highestCountryAverage || 0}`
    );
    createStatElement(
      rowTwo,
      metrics.totalRatedPerformers,
      "Rated Performers",
      "Total number of performers with ratings"
    );
    const topStatsContainer = document.createElement("div");
    topStatsContainer.style.marginTop = "2rem";
    topStatsContainer.style.padding = "1rem";
    topStatsContainer.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
    topStatsContainer.style.borderRadius = "8px";
    topStatsContainer.style.position = "relative";
    const topStatsHeader = document.createElement("h3");
    topStatsHeader.innerText = "Top Performers";
    topStatsHeader.style.textAlign = "center";
    topStatsHeader.style.marginBottom = "1rem";
    topStatsHeader.style.color = "#ddd";
    topStatsContainer.appendChild(topStatsHeader);
    const leftArrow = document.createElement("div");
    leftArrow.innerHTML = "\u279C";
    leftArrow.style.transform = "rotate(180deg)";
    leftArrow.style.position = "absolute";
    leftArrow.style.left = "10px";
    leftArrow.style.top = "10px";
    leftArrow.style.fontSize = "1.5rem";
    leftArrow.style.color = "#ddd";
    leftArrow.style.cursor = "pointer";
    leftArrow.style.userSelect = "none";
    leftArrow.style.transition = "transform 0.2s ease, color 0.2s ease";
    leftArrow.title = "Switch to Top Performers";
    leftArrow.addEventListener("mouseenter", () => {
      leftArrow.style.transform = "rotate(180deg) scale(1.2)";
      leftArrow.style.color = "#fff";
    });
    leftArrow.addEventListener("mouseleave", () => {
      leftArrow.style.transform = "rotate(180deg) scale(1)";
      leftArrow.style.color = "#ddd";
    });
    topStatsContainer.appendChild(leftArrow);
    const rightArrow = document.createElement("div");
    rightArrow.innerHTML = "\u279C";
    rightArrow.style.position = "absolute";
    rightArrow.style.right = "10px";
    rightArrow.style.top = "10px";
    rightArrow.style.fontSize = "1.5rem";
    rightArrow.style.color = "#ddd";
    rightArrow.style.cursor = "pointer";
    rightArrow.style.userSelect = "none";
    rightArrow.style.transition = "transform 0.2s ease, color 0.2s ease";
    rightArrow.title = "Switch to Top Performers";
    rightArrow.addEventListener("mouseenter", () => {
      rightArrow.style.transform = "scale(1.2)";
      rightArrow.style.color = "#fff";
    });
    rightArrow.addEventListener("mouseleave", () => {
      rightArrow.style.transform = "scale(1)";
      rightArrow.style.color = "#ddd";
    });
    topStatsContainer.appendChild(rightArrow);
    const contentContainer = document.createElement("div");
    contentContainer.style.minHeight = "250px";
    topStatsContainer.appendChild(contentContainer);
    let currentView = "tier";
    function updateView() {
      clearActiveCarouselInterval();
      if (currentView === "top") {
        createTopStatsSection(contentContainer, performers, currentOrigin);
        leftArrow.title = "Switch to Top Performers by Tier";
        rightArrow.title = "Switch to Top Performers by Tier";
      } else {
        createTopPerformersCarousel(contentContainer, performers, currentOrigin, true);
        leftArrow.title = "Switch to Top Performers";
        rightArrow.title = "Switch to Top Performers";
      }
    }
    leftArrow.addEventListener("click", () => {
      currentView = currentView === "top" ? "tier" : "top";
      updateView();
    });
    rightArrow.addEventListener("click", () => {
      currentView = currentView === "top" ? "tier" : "top";
      updateView();
    });
    updateView();
    container.appendChild(topStatsContainer);
    const recentContainer = document.createElement("div");
    recentContainer.style.marginTop = "2rem";
    recentContainer.style.padding = "1rem";
    recentContainer.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
    recentContainer.style.borderRadius = "8px";
    recentContainer.style.position = "relative";
    container.appendChild(recentContainer);
    const recentHeader = document.createElement("h3");
    recentHeader.innerText = "Recent Activity";
    recentHeader.style.textAlign = "center";
    recentHeader.style.marginBottom = "1rem";
    recentHeader.style.color = "#ddd";
    recentHeader.style.fontSize = isMobile2() ? "1.3rem" : "1.5rem";
    recentContainer.appendChild(recentHeader);
    const recentContentContainer = document.createElement("div");
    recentContainer.appendChild(recentContentContainer);
    const showPerformerProfileFunc = showPerformerProfile(container, performers, scenes);
    const recentObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        recentObserver.disconnect();
        buildRecentActivity(recentContentContainer, performers, currentOrigin, showPerformerProfileFunc).catch((err) => {
          console.error("Failed to load recent activity:", err);
          recentContentContainer.innerHTML = "";
          const errorMsg = document.createElement("p");
          errorMsg.innerText = "Unable to load recent activity.";
          errorMsg.style.textAlign = "center";
          errorMsg.style.color = "#f44336";
          errorMsg.style.fontStyle = "italic";
          recentContentContainer.appendChild(errorMsg);
        });
      }
    }, { rootMargin: "200px" });
    recentObserver.observe(recentContentContainer);
    createSearchBox(container, performers, showPerformerProfileFunc);
  }
  async function buildRecentActivity(container, performers, currentOrigin, showProfileFn) {
    const loading = document.createElement("p");
    loading.innerText = "Loading recent activity...";
    loading.style.textAlign = "center";
    loading.style.color = "#888";
    loading.style.fontStyle = "italic";
    loading.style.fontSize = isMobile2() ? "0.9rem" : "1rem";
    container.appendChild(loading);
    const performerById = /* @__PURE__ */ new Map();
    const performerByName = /* @__PURE__ */ new Map();
    performers.forEach((p) => {
      if (p && p.ID)
        performerById.set(p.ID, p);
      if (p && p.name)
        performerByName.set(normalizeName(p.name), p);
    });
    const allMatchRecords = [];
    const chunkSize = 100;
    for (let i = 0; i < performers.length; i += chunkSize) {
      const chunk = performers.slice(i, i + chunkSize);
      chunk.forEach((p) => {
        const record = parsePerformerRecord(p);
        if (Array.isArray(record)) {
          record.forEach((match) => {
            allMatchRecords.push({
              ...match,
              performer: p.name,
              performerId: p.ID,
              performerCountry: p.country
            });
          });
        }
      });
      if (i + chunkSize < performers.length) {
        await yieldToMain();
      }
    }
    const sortedRecordCache = /* @__PURE__ */ new Map();
    const pointChangeCache = /* @__PURE__ */ new Map();
    function getSortedRecord(performerId) {
      if (sortedRecordCache.has(performerId))
        return sortedRecordCache.get(performerId);
      const performer = performerById.get(performerId);
      if (!performer)
        return null;
      const record = parsePerformerRecord(performer);
      if (!Array.isArray(record))
        return null;
      const sorted = [...record].sort((a, b) => new Date(a.date) - new Date(b.date));
      sortedRecordCache.set(performerId, sorted);
      return sorted;
    }
    function getPointChange(performerId, dateKey) {
      const cacheKey = `${performerId}|${dateKey}`;
      if (pointChangeCache.has(cacheKey))
        return pointChangeCache.get(cacheKey);
      const sorted = getSortedRecord(performerId);
      if (!sorted)
        return null;
      const index = sorted.findIndex((m) => getDateKey(m.date) === dateKey);
      if (index < 0)
        return null;
      const ratingBefore = index > 0 ? sorted[index - 1].ratingAfter : 0;
      const rawChange = (sorted[index].ratingAfter ?? 0) - ratingBefore;
      const pointChange = rawChange / 10;
      pointChangeCache.set(cacheKey, pointChange);
      return pointChange;
    }
    loading.remove();
    const matchGroups = /* @__PURE__ */ new Map();
    allMatchRecords.forEach((match) => {
      const currentId = match.performerId || null;
      const currentName = match.performer || "";
      const opp = parseOpponent(match.opponent);
      const currentIdent = currentId || normalizeName(currentName);
      const oppIdent = opp.id || normalizeName(opp.name);
      if (!currentIdent || !oppIdent || oppIdent === normalizeName("Unknown"))
        return;
      const dateKey = getDateKey(match.date);
      if (!dateKey)
        return;
      const signature = `${dateKey}|${[currentIdent, oppIdent].sort().join("|")}`;
      if (!matchGroups.has(signature)) {
        matchGroups.set(signature, {
          date: match.date,
          winner: null,
          loser: null,
          drawA: null,
          drawB: null,
          pointChanges: /* @__PURE__ */ new Map()
        });
      }
      const entry = matchGroups.get(signature);
      if (currentId) {
        const pc = getPointChange(currentId, dateKey);
        if (typeof pc === "number" && !isNaN(pc)) {
          entry.pointChanges.set(currentId, pc);
        }
      }
      const currentSide = {
        id: currentId,
        name: currentName,
        country: match.performerCountry || null
      };
      let opponentSide;
      if (opp.id) {
        const oppPerformer = performerById.get(opp.id);
        opponentSide = oppPerformer ? { id: oppPerformer.ID, name: oppPerformer.name, country: oppPerformer.country || null } : { id: opp.id, name: opp.name, country: null };
      } else {
        const oppPerformer = performerByName.get(normalizeName(opp.name));
        opponentSide = oppPerformer ? { id: oppPerformer.ID, name: oppPerformer.name, country: oppPerformer.country || null } : { id: null, name: opp.name, country: null };
      }
      if (match.won === true) {
        entry.winner = currentSide;
        entry.loser = opponentSide;
      } else if (match.won === false) {
        entry.winner = opponentSide;
        entry.loser = currentSide;
      } else {
        const isStored = (side) => {
          if (!side)
            return false;
          return side.id ? side.id === currentSide.id : normalizeName(side.name) === normalizeName(currentSide.name);
        };
        if (!isStored(entry.drawA) && !isStored(entry.drawB)) {
          if (!entry.drawA)
            entry.drawA = currentSide;
          else if (!entry.drawB)
            entry.drawB = currentSide;
        }
      }
    });
    const uniqueMatches = Array.from(matchGroups.values()).filter((m) => {
      if (m.winner && m.loser)
        return true;
      if (m.drawA && m.drawB)
        return true;
      return false;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (uniqueMatches.length === 0) {
      const noData = document.createElement("p");
      noData.innerText = "No recent activity found";
      noData.style.textAlign = "center";
      noData.style.color = "#888";
      noData.style.fontStyle = "italic";
      noData.style.fontSize = isMobile2() ? "0.9rem" : "1rem";
      container.appendChild(noData);
      return;
    }
    const pageLeftArrow = document.createElement("div");
    pageLeftArrow.innerHTML = "\u279C";
    pageLeftArrow.style.transform = "rotate(180deg)";
    pageLeftArrow.style.position = "absolute";
    pageLeftArrow.style.left = "10px";
    pageLeftArrow.style.top = "10px";
    pageLeftArrow.style.fontSize = "1.5rem";
    pageLeftArrow.style.color = "#ddd";
    pageLeftArrow.style.cursor = "pointer";
    pageLeftArrow.style.userSelect = "none";
    pageLeftArrow.style.transition = "transform 0.2s ease, color 0.2s ease";
    pageLeftArrow.title = "Previous page";
    pageLeftArrow.addEventListener("mouseenter", () => {
      pageLeftArrow.style.transform = "rotate(180deg) scale(1.2)";
      pageLeftArrow.style.color = "#fff";
    });
    pageLeftArrow.addEventListener("mouseleave", () => {
      pageLeftArrow.style.transform = "rotate(180deg) scale(1)";
      pageLeftArrow.style.color = "#ddd";
    });
    container.appendChild(pageLeftArrow);
    const pageRightArrow = document.createElement("div");
    pageRightArrow.innerHTML = "\u279C";
    pageRightArrow.style.position = "absolute";
    pageRightArrow.style.right = "10px";
    pageRightArrow.style.top = "10px";
    pageRightArrow.style.fontSize = "1.5rem";
    pageRightArrow.style.color = "#ddd";
    pageRightArrow.style.cursor = "pointer";
    pageRightArrow.style.userSelect = "none";
    pageRightArrow.style.transition = "transform 0.2s ease, color 0.2s ease";
    pageRightArrow.title = "Next page";
    pageRightArrow.addEventListener("mouseenter", () => {
      pageRightArrow.style.transform = "scale(1.2)";
      pageRightArrow.style.color = "#fff";
    });
    pageRightArrow.addEventListener("mouseleave", () => {
      pageRightArrow.style.transform = "scale(1)";
      pageRightArrow.style.color = "#ddd";
    });
    container.appendChild(pageRightArrow);
    const pageControls = document.createElement("div");
    pageControls.style.display = "flex";
    pageControls.style.justifyContent = "center";
    pageControls.style.alignItems = "center";
    pageControls.style.gap = "0.5rem";
    pageControls.style.marginBottom = "1rem";
    pageControls.style.marginTop = "0.5rem";
    const pageLabel = document.createElement("span");
    pageLabel.innerText = "Page:";
    pageLabel.style.color = "#aaa";
    pageLabel.style.fontSize = isMobile2() ? "0.8rem" : "0.9rem";
    pageControls.appendChild(pageLabel);
    const pageInput = document.createElement("input");
    pageInput.type = "number";
    pageInput.min = "1";
    pageInput.style.width = isMobile2() ? "55px" : "65px";
    pageInput.style.padding = "0.3rem";
    pageInput.style.borderRadius = "4px";
    pageInput.style.backgroundColor = "#333";
    pageInput.style.color = "white";
    pageInput.style.border = "1px solid #555";
    pageInput.style.fontSize = isMobile2() ? "0.8rem" : "0.9rem";
    pageInput.style.textAlign = "center";
    pageControls.appendChild(pageInput);
    const ofLabel = document.createElement("span");
    ofLabel.style.color = "#aaa";
    ofLabel.style.fontSize = isMobile2() ? "0.8rem" : "0.9rem";
    pageControls.appendChild(ofLabel);
    container.appendChild(pageControls);
    const tableContainer = document.createElement("div");
    container.appendChild(tableContainer);
    const rowsPerPage = 10;
    let currentPage = 1;
    const totalPages = Math.max(1, Math.ceil(uniqueMatches.length / rowsPerPage));
    function updatePageControls() {
      pageInput.value = currentPage;
      pageInput.max = totalPages;
      ofLabel.innerText = `of ${totalPages}`;
      pageLeftArrow.style.opacity = currentPage === 1 ? "0.3" : "1";
      pageLeftArrow.style.cursor = currentPage === 1 ? "not-allowed" : "pointer";
      pageRightArrow.style.opacity = currentPage === totalPages ? "0.3" : "1";
      pageRightArrow.style.cursor = currentPage === totalPages ? "not-allowed" : "pointer";
    }
    function createNameCell(performer, resultBadgeText, badgeColor, pointChange = null) {
      const cell = document.createElement("td");
      cell.style.padding = isMobile2() ? "0.5rem" : "0.75rem";
      cell.style.borderBottom = "1px solid #333";
      cell.style.textAlign = "center";
      const cellContainer = document.createElement("div");
      cellContainer.style.display = "flex";
      cellContainer.style.flexDirection = "column";
      cellContainer.style.alignItems = "center";
      cellContainer.style.gap = "0.15rem";
      const badge = document.createElement("div");
      badge.innerText = resultBadgeText;
      badge.style.color = badgeColor;
      badge.style.fontWeight = "bold";
      badge.style.fontSize = isMobile2() ? "0.65rem" : "0.8rem";
      cellContainer.appendChild(badge);
      const nameRow = document.createElement("div");
      nameRow.style.display = "flex";
      nameRow.style.justifyContent = "center";
      nameRow.style.alignItems = "center";
      nameRow.style.gap = "0.3rem";
      if (performer.country) {
        const flagEmoji = getCountryFlagEmoji(performer.country);
        if (flagEmoji) {
          const flagSpan = document.createElement("span");
          flagSpan.innerText = flagEmoji;
          nameRow.appendChild(flagSpan);
        }
      }
      const nameEl = document.createElement("span");
      nameEl.innerText = performer.name;
      nameEl.style.color = "#1e90ff";
      nameEl.style.textDecoration = "underline";
      nameEl.style.cursor = "pointer";
      nameEl.style.fontSize = isMobile2() ? "0.7rem" : "1rem";
      nameEl.style.overflow = "hidden";
      nameEl.style.textOverflow = "ellipsis";
      nameEl.style.whiteSpace = "nowrap";
      nameEl.style.maxWidth = isMobile2() ? "85px" : "130px";
      const fullPerformer = performer.id ? performerById.get(performer.id) : null;
      if (fullPerformer) {
        attachBattleScoreTooltip(nameEl, fullPerformer, performers, currentOrigin);
        nameEl.addEventListener("click", (e) => {
          e.preventDefault();
          showProfileFn(fullPerformer);
        });
      }
      nameRow.appendChild(nameEl);
      if (performer.id) {
        const linkIcon = document.createElement("a");
        linkIcon.href = `${currentOrigin}/performers/${performer.id}`;
        linkIcon.innerText = "\u{1F517}";
        linkIcon.style.textDecoration = "none";
        linkIcon.style.fontSize = isMobile2() ? "0.6rem" : "0.9rem";
        linkIcon.title = "View performer profile";
        linkIcon.target = "_blank";
        nameRow.appendChild(linkIcon);
      }
      cellContainer.appendChild(nameRow);
      const normalizedPerformer = performer.id ? normalizeSnapshotPerformer(performerById.get(performer.id)) : null;
      if (normalizedPerformer) {
        const score = getBattleScore(normalizedPerformer);
        if (typeof score === "number" && !isNaN(score)) {
          const tier = getRatingTier2(normalizedPerformer, performers);
          const scoreEl = document.createElement("div");
          scoreEl.innerText = score.toFixed(2);
          scoreEl.style.fontSize = isMobile2() ? "0.6rem" : "0.8rem";
          scoreEl.style.fontWeight = "bold";
          scoreEl.style.color = getTierColor2(tier);
          cellContainer.appendChild(scoreEl);
        }
      }
      if (typeof pointChange === "number" && !isNaN(pointChange)) {
        const changeEl = document.createElement("div");
        const sign = pointChange > 0 ? "+" : "";
        changeEl.innerText = `${sign}${pointChange.toFixed(2)}`;
        changeEl.style.fontSize = isMobile2() ? "0.55rem" : "0.75rem";
        changeEl.style.fontWeight = "bold";
        changeEl.style.color = pointChange > 0 ? "#4caf50" : pointChange < 0 ? "#f44336" : "#aaa";
        changeEl.style.marginTop = "0.1rem";
        cellContainer.appendChild(changeEl);
      }
      cell.appendChild(cellContainer);
      return cell;
    }
    function renderPage() {
      tableContainer.innerHTML = "";
      const start = (currentPage - 1) * rowsPerPage;
      const pageMatches = uniqueMatches.slice(start, start + rowsPerPage);
      const table = document.createElement("table");
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";
      table.style.color = "#ddd";
      table.style.marginTop = "1rem";
      table.style.fontSize = isMobile2() ? "0.7rem" : "1rem";
      table.style.tableLayout = "fixed";
      const headerRow = document.createElement("tr");
      const headers = ["Date", "Winner", "Loser", "Point Diff"];
      const colWidths = isMobile2() ? ["18%", "28%", "28%", "26%"] : ["15%", "30%", "30%", "25%"];
      headers.forEach((text, idx) => {
        const th = document.createElement("th");
        th.innerText = text;
        th.style.padding = isMobile2() ? "0.5rem" : "0.75rem";
        th.style.borderBottom = "1px solid #555";
        th.style.textAlign = idx === 0 ? "left" : "center";
        th.style.backgroundColor = "rgba(0, 0, 0, 0.3)";
        th.style.fontSize = isMobile2() ? "0.7rem" : "0.9rem";
        th.style.width = colWidths[idx];
        headerRow.appendChild(th);
      });
      table.appendChild(headerRow);
      pageMatches.forEach((match) => {
        const row = document.createElement("tr");
        if (!match.winner && !match.loser && match.drawA && match.drawB) {
          const drawAPc = match.pointChanges?.get(match.drawA.id || normalizeName(match.drawA.name));
          const drawBPc = match.pointChanges?.get(match.drawB.id || normalizeName(match.drawB.name));
          const dateCell = document.createElement("td");
          dateCell.innerText = formatDate(match.date);
          dateCell.style.padding = isMobile2() ? "0.5rem" : "0.75rem";
          dateCell.style.borderBottom = "1px solid #333";
          if (isMobile2()) {
            dateCell.style.whiteSpace = "nowrap";
            dateCell.style.overflow = "hidden";
            dateCell.style.textOverflow = "ellipsis";
          }
          row.appendChild(dateCell);
          row.appendChild(createNameCell(match.drawA, "D", "#f0e68c", drawAPc));
          row.appendChild(createNameCell(match.drawB, "D", "#f0e68c", drawBPc));
          const diffCell = document.createElement("td");
          diffCell.style.padding = isMobile2() ? "0.5rem" : "0.75rem";
          diffCell.style.borderBottom = "1px solid #333";
          diffCell.style.textAlign = "center";
          diffCell.innerText = "0.00";
          diffCell.style.color = "#f0e68c";
          diffCell.style.fontWeight = "bold";
          diffCell.style.fontSize = isMobile2() ? "0.7rem" : "0.9rem";
          row.appendChild(diffCell);
        } else {
          const winnerNormalized = match.winner.id ? normalizeSnapshotPerformer(performerById.get(match.winner.id)) : null;
          const loserNormalized = match.loser.id ? normalizeSnapshotPerformer(performerById.get(match.loser.id)) : null;
          const winnerScore = winnerNormalized ? getBattleScore(winnerNormalized) : null;
          const loserScore = loserNormalized ? getBattleScore(loserNormalized) : null;
          const pointDiff = typeof winnerScore === "number" && typeof loserScore === "number" ? winnerScore - loserScore : null;
          const winnerPc = match.pointChanges?.get(match.winner.id || normalizeName(match.winner.name));
          const loserPc = match.pointChanges?.get(match.loser.id || normalizeName(match.loser.name));
          const dateCell = document.createElement("td");
          dateCell.innerText = formatDate(match.date);
          dateCell.style.padding = isMobile2() ? "0.5rem" : "0.75rem";
          dateCell.style.borderBottom = "1px solid #333";
          if (isMobile2()) {
            dateCell.style.whiteSpace = "nowrap";
            dateCell.style.overflow = "hidden";
            dateCell.style.textOverflow = "ellipsis";
          }
          row.appendChild(dateCell);
          row.appendChild(createNameCell(match.winner, "W", "#4caf50", winnerPc));
          row.appendChild(createNameCell(match.loser, "L", "#f44336", loserPc));
          const diffCell = document.createElement("td");
          diffCell.style.padding = isMobile2() ? "0.5rem" : "0.75rem";
          diffCell.style.borderBottom = "1px solid #333";
          diffCell.style.textAlign = "center";
          if (pointDiff !== null) {
            diffCell.innerText = `+${pointDiff.toFixed(2)}`;
            diffCell.style.color = "#4caf50";
            diffCell.style.fontWeight = "bold";
            diffCell.style.fontSize = isMobile2() ? "0.7rem" : "0.9rem";
          } else {
            diffCell.innerText = "N/A";
            diffCell.style.color = "#888";
          }
          row.appendChild(diffCell);
        }
        table.appendChild(row);
      });
      tableContainer.appendChild(table);
      updatePageControls();
    }
    pageLeftArrow.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderPage();
      }
    });
    pageRightArrow.addEventListener("click", () => {
      if (currentPage < totalPages) {
        currentPage++;
        renderPage();
      }
    });
    pageInput.addEventListener("change", () => {
      let val = parseInt(pageInput.value, 10);
      if (isNaN(val) || val < 1)
        val = 1;
      if (val > totalPages)
        val = totalPages;
      currentPage = val;
      renderPage();
    });
    renderPage();
  }
  function createSnapshotSelector(container, snapshots, onSelect) {
    const selectorContainer = document.createElement("div");
    selectorContainer.style.display = "flex";
    selectorContainer.style.justifyContent = "center";
    selectorContainer.style.marginBottom = "2rem";
    selectorContainer.style.gap = "1rem";
    selectorContainer.style.flexWrap = "wrap";
    selectorContainer.style.padding = "1rem";
    if (isMobile2()) {
      selectorContainer.style.flexDirection = "column";
      selectorContainer.style.alignItems = "center";
    }
    const label = document.createElement("label");
    label.innerText = "Select Snapshot:";
    label.style.alignSelf = "center";
    label.style.color = "#ddd";
    label.style.fontWeight = "bold";
    const select = document.createElement("select");
    select.style.padding = "0.5rem";
    select.style.borderRadius = "4px";
    select.style.backgroundColor = "#333";
    select.style.color = "white";
    select.style.border = "1px solid #555";
    if (isMobile2()) {
      select.style.width = "90%";
      select.style.minWidth = "unset";
    } else {
      select.style.minWidth = "300px";
    }
    snapshots.forEach((snapshot, index) => {
      const option = document.createElement("option");
      const datePart = snapshot.match(/\[(.*?)\]/);
      option.value = snapshot;
      option.innerText = datePart ? datePart[1].replace(/-/g, "/") : snapshot;
      if (index === 0)
        option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener("change", () => {
      onSelect(select.value);
    });
    selectorContainer.appendChild(label);
    selectorContainer.appendChild(select);
    container.appendChild(selectorContainer);
    return select;
  }
  function createTopPerformersCarousel(container, performers, currentOrigin, isManualSwitch = false) {
    container.innerHTML = "";
    const topByTier = {
      "S-Tier": null,
      "A-Tier": null,
      "B-Tier": null,
      "C-Tier": null,
      "D-Tier": null,
      "F-Tier": null
    };
    performers.forEach((performer) => {
      const tier = getRatingTier2(performer, performers);
      const ascScore = getBattleScore(performer);
      const current = topByTier[tier];
      if (!current || ascScore > (current.ascScore || 0)) {
        topByTier[tier] = { ...normalizeSnapshotPerformer(performer), ascScore };
      }
    });
    const tierGroups = {};
    Object.keys(topByTier).forEach((tier) => {
      tierGroups[tier] = topByTier[tier] ? [topByTier[tier]] : [];
    });
    let currentTierIndex = 0;
    const tierKeys = Object.keys(tierGroups);
    const contentContainer = document.createElement("div");
    contentContainer.style.position = "relative";
    contentContainer.style.height = isMobile2() ? "250px" : "300px";
    contentContainer.style.display = "flex";
    contentContainer.style.justifyContent = "center";
    contentContainer.style.alignItems = "center";
    container.appendChild(contentContainer);
    const tierIndicator = document.createElement("div");
    tierIndicator.style.textAlign = "center";
    tierIndicator.style.marginTop = "1rem";
    tierIndicator.style.fontSize = "0.9rem";
    tierIndicator.style.color = "#aaa";
    tierIndicator.style.display = "flex";
    tierIndicator.style.flexWrap = "wrap";
    tierIndicator.style.justifyContent = "center";
    tierIndicator.style.gap = "2px";
    container.appendChild(tierIndicator);
    const normalDelay = 5e3;
    const firstViewDelay = 1500;
    function startAutoTransition(delay = normalDelay) {
      clearActiveCarouselInterval();
      activeCarouselInterval = setInterval(() => {
        currentTierIndex = (currentTierIndex + 1) % tierKeys.length;
        updateCarousel(true);
      }, delay);
    }
    function stopAutoTransition() {
      clearActiveCarouselInterval();
    }
    function updateCarousel(isAutoTransition = false) {
      if (isAutoTransition && !contentContainer.isConnected) {
        clearActiveCarouselInterval();
        return;
      }
      if (!isAutoTransition) {
        stopAutoTransition();
      }
      const currentTier = tierKeys[currentTierIndex];
      const performersInTier = tierGroups[currentTier];
      const newContent = document.createElement("div");
      newContent.style.position = "absolute";
      newContent.style.top = "0";
      newContent.style.left = "0";
      newContent.style.width = "100%";
      newContent.style.height = "100%";
      newContent.style.display = "flex";
      newContent.style.justifyContent = "center";
      newContent.style.alignItems = "center";
      newContent.style.opacity = "0";
      newContent.style.transition = "opacity 0.5s ease-in-out";
      if (performersInTier.length > 0) {
        const topPerformer = performersInTier[0];
        const stats = parsePerformerStats(topPerformer) || {};
        const performerCard = document.createElement("div");
        performerCard.style.display = "flex";
        performerCard.style.flexDirection = "column";
        performerCard.style.alignItems = "center";
        performerCard.style.gap = "0.5rem";
        performerCard.style.width = "100%";
        const imageContainer = document.createElement("div");
        const imageSize = isMobile2() ? "100px" : "150px";
        imageContainer.style.width = imageSize;
        imageContainer.style.height = imageSize;
        imageContainer.style.borderRadius = "50%";
        imageContainer.style.overflow = "hidden";
        imageContainer.style.border = "2px solid #555";
        imageContainer.style.marginBottom = "0.5rem";
        if (topPerformer.image_path) {
          let fixedImagePath = topPerformer.image_path;
          try {
            const imageUrl = new URL(topPerformer.image_path);
            const currentUrl = new URL(currentOrigin);
            imageUrl.protocol = currentUrl.protocol;
            imageUrl.hostname = currentUrl.hostname;
            imageUrl.port = currentUrl.port;
            fixedImagePath = imageUrl.toString();
          } catch (e) {
            try {
              const path = new URL(topPerformer.image_path).pathname + new URL(topPerformer.image_path).search;
              fixedImagePath = currentOrigin + path;
            } catch (e2) {
              fixedImagePath = topPerformer.image_path;
            }
          }
          const img = document.createElement("img");
          img.src = fixedImagePath;
          img.alt = `${topPerformer.name} profile image`;
          img.style.width = "100%";
          img.style.height = "100%";
          img.style.objectFit = "cover";
          img.style.display = "block";
          img.style.objectPosition = "center 15%";
          img.onerror = function() {
            imageContainer.innerHTML = "";
            const placeholderIcon = document.createElement("span");
            placeholderIcon.innerText = "\u{1F464}";
            placeholderIcon.style.fontSize = isMobile2() ? "2rem" : "3rem";
            placeholderIcon.style.color = "#888";
            placeholderIcon.style.display = "flex";
            placeholderIcon.style.alignItems = "center";
            placeholderIcon.style.justifyContent = "center";
            placeholderIcon.style.height = "100%";
            imageContainer.appendChild(placeholderIcon);
          };
          imageContainer.appendChild(img);
        } else {
          const placeholderIcon = document.createElement("span");
          placeholderIcon.innerText = "\u{1F464}";
          placeholderIcon.style.fontSize = isMobile2() ? "2rem" : "3rem";
          placeholderIcon.style.color = "#888";
          placeholderIcon.style.display = "flex";
          placeholderIcon.style.alignItems = "center";
          placeholderIcon.style.justifyContent = "center";
          placeholderIcon.style.height = "100%";
          imageContainer.appendChild(placeholderIcon);
        }
        const nameContainer = document.createElement("div");
        nameContainer.style.display = "flex";
        nameContainer.style.alignItems = "center";
        nameContainer.style.justifyContent = "center";
        nameContainer.style.gap = "0.3rem";
        if (topPerformer.country) {
          const flagEmoji = getCountryFlagEmoji(topPerformer.country);
          if (flagEmoji) {
            const flagSpan = document.createElement("span");
            flagSpan.innerText = flagEmoji;
            nameContainer.appendChild(flagSpan);
          }
        }
        const name = document.createElement("div");
        name.innerText = topPerformer.name;
        name.style.fontSize = isMobile2() ? "1rem" : "1.2rem";
        name.style.textAlign = "center";
        name.style.color = "#ddd";
        name.style.fontWeight = "bold";
        nameContainer.appendChild(name);
        const rating = document.createElement("div");
        const ascScoreText = topPerformer.ascScore ? topPerformer.ascScore.toFixed(2) : "N/A";
        const tier = getRatingTier2(topPerformer, performers);
        rating.innerText = `Asc.Score: ${ascScoreText}`;
        rating.style.fontSize = isMobile2() ? "0.9rem" : "1rem";
        rating.style.color = getTierColor2(tier);
        rating.style.fontWeight = "bold";
        const matchStats = document.createElement("div");
        matchStats.style.display = "flex";
        matchStats.style.justifyContent = "center";
        matchStats.style.gap = "1rem";
        matchStats.style.marginTop = "0.5rem";
        const matchesContainer = document.createElement("div");
        matchesContainer.style.display = "flex";
        matchesContainer.style.flexDirection = "column";
        matchesContainer.style.alignItems = "center";
        const matchesValue = document.createElement("div");
        matchesValue.innerText = stats.total_matches || 0;
        matchesValue.style.fontWeight = "bold";
        matchesValue.style.color = "#ddd";
        matchesValue.style.fontSize = isMobile2() ? "0.9rem" : "1rem";
        const matchesLabel = document.createElement("div");
        matchesLabel.innerText = "Matches";
        matchesLabel.style.fontSize = isMobile2() ? "0.7rem" : "0.8rem";
        matchesLabel.style.color = "#aaa";
        matchesContainer.appendChild(matchesValue);
        matchesContainer.appendChild(matchesLabel);
        const winsContainer = document.createElement("div");
        winsContainer.style.display = "flex";
        winsContainer.style.flexDirection = "column";
        winsContainer.style.alignItems = "center";
        const winsValue = document.createElement("div");
        winsValue.innerText = stats.wins || 0;
        winsValue.style.fontWeight = "bold";
        winsValue.style.color = "#4caf50";
        winsValue.style.fontSize = isMobile2() ? "0.9rem" : "1rem";
        const winsLabel = document.createElement("div");
        winsLabel.innerText = "Wins";
        winsLabel.style.fontSize = isMobile2() ? "0.7rem" : "0.8rem";
        winsLabel.style.color = "#aaa";
        winsContainer.appendChild(winsValue);
        winsContainer.appendChild(winsLabel);
        matchStats.appendChild(matchesContainer);
        matchStats.appendChild(winsContainer);
        performerCard.appendChild(imageContainer);
        performerCard.appendChild(nameContainer);
        performerCard.appendChild(rating);
        performerCard.appendChild(matchStats);
        newContent.appendChild(performerCard);
      } else {
        const noData = document.createElement("div");
        noData.innerText = `No performers in ${currentTier}`;
        noData.style.color = "#888";
        noData.style.fontStyle = "italic";
        newContent.appendChild(noData);
      }
      contentContainer.appendChild(newContent);
      setTimeout(() => {
        newContent.style.opacity = "1";
      }, 10);
      const oldContent = contentContainer.firstChild;
      if (oldContent && oldContent !== newContent) {
        oldContent.style.opacity = "0";
        setTimeout(() => {
          if (oldContent.parentNode === contentContainer) {
            contentContainer.removeChild(oldContent);
          }
        }, 500);
      }
      tierIndicator.innerHTML = "";
      tierKeys.forEach((tier, index) => {
        const tierSpan = document.createElement("span");
        tierSpan.innerText = tier;
        tierSpan.style.padding = "2px 6px";
        tierSpan.style.borderRadius = "4px";
        tierSpan.style.cursor = "pointer";
        tierSpan.style.color = index === currentTierIndex ? "#fff" : "#888";
        tierSpan.style.backgroundColor = index === currentTierIndex ? getTierColor2(tier) : "transparent";
        tierSpan.style.fontSize = isMobile2() ? "0.7rem" : "0.9rem";
        tierSpan.style.whiteSpace = "nowrap";
        tierSpan.style.flex = isMobile2() ? "1 1 auto" : "0 0 auto";
        tierSpan.style.minWidth = "0";
        tierSpan.addEventListener("click", () => {
          currentTierIndex = index;
          updateCarousel(false);
          startAutoTransition(normalDelay);
        });
        tierIndicator.appendChild(tierSpan);
      });
    }
    updateCarousel();
    startAutoTransition(isManualSwitch ? firstViewDelay : normalDelay);
    if (!container._ascensionHoverBound) {
      container.addEventListener("mouseenter", () => {
        if (contentContainer.isConnected) {
          stopAutoTransition();
        }
      });
      container.addEventListener("mouseleave", () => {
        setTimeout(() => {
          if (contentContainer.isConnected) {
            startAutoTransition(normalDelay);
          }
        }, 1e3);
      });
      container._ascensionHoverBound = true;
    }
  }
  function createTopStatsSection(container, performers, currentOrigin) {
    container.innerHTML = "";
    const heap = createMinHeap(topStatsComparator);
    performers.forEach((p) => {
      const normalized = normalizeSnapshotPerformer(p);
      const ascScore = getBattleScore(p);
      const stats = parsePerformerStats(p) || {};
      const item = {
        ...normalized,
        ascScore,
        wins: stats.wins || 0,
        totalMatches: stats.total_matches || 0
      };
      if (heap.size() < 10) {
        heap.push(item);
      } else if (topStatsComparator(item, heap.peek()) > 0) {
        heap.pop();
        heap.push(item);
      }
    });
    const topPerformers = heap.toSortedArray(true);
    const performersGrid = document.createElement("div");
    performersGrid.style.display = "grid";
    performersGrid.style.gap = "1rem";
    performersGrid.style.justifyItems = "center";
    performersGrid.style.margin = "0 auto";
    performersGrid.style.padding = "0 1rem";
    if (isMobile2()) {
      performersGrid.style.gridTemplateColumns = "repeat(2, 1fr)";
      performersGrid.style.maxWidth = "300px";
    } else {
      performersGrid.style.gridTemplateColumns = "repeat(5, 1fr)";
      performersGrid.style.maxWidth = "800px";
    }
    topPerformers.forEach((performer, index) => {
      const performerCard = document.createElement("div");
      performerCard.style.display = "flex";
      performerCard.style.flexDirection = "column";
      performerCard.style.alignItems = "center";
      performerCard.style.gap = "0.5rem";
      performerCard.style.width = "100%";
      performerCard.style.padding = "0.5rem";
      performerCard.style.backgroundColor = "rgba(0, 0, 0, 0.3)";
      performerCard.style.borderRadius = "8px";
      const position = document.createElement("div");
      position.innerText = `#${index + 1}`;
      position.style.fontSize = isMobile2() ? "0.8rem" : "0.9rem";
      position.style.color = "#aaa";
      position.style.fontWeight = "bold";
      const imageContainer = document.createElement("div");
      const imageSize = isMobile2() ? "70px" : "80px";
      imageContainer.style.width = imageSize;
      imageContainer.style.height = imageSize;
      imageContainer.style.borderRadius = "50%";
      imageContainer.style.overflow = "hidden";
      imageContainer.style.border = "2px solid #555";
      if (performer.image_path) {
        let fixedImagePath = performer.image_path;
        try {
          const imageUrl = new URL(performer.image_path);
          const currentUrl = new URL(currentOrigin);
          imageUrl.protocol = currentUrl.protocol;
          imageUrl.hostname = currentUrl.hostname;
          imageUrl.port = currentUrl.port;
          fixedImagePath = imageUrl.toString();
        } catch (e) {
          try {
            const path = new URL(performer.image_path).pathname + new URL(performer.image_path).search;
            fixedImagePath = currentOrigin + path;
          } catch (e2) {
            fixedImagePath = performer.image_path;
          }
        }
        const img = document.createElement("img");
        img.src = fixedImagePath;
        img.alt = `${performer.name} profile image`;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.style.display = "block";
        img.style.objectPosition = "center 15%";
        img.onerror = function() {
          imageContainer.innerHTML = "";
          const placeholderIcon = document.createElement("span");
          placeholderIcon.innerText = "\u{1F464}";
          placeholderIcon.style.fontSize = isMobile2() ? "1.5rem" : "2rem";
          placeholderIcon.style.color = "#888";
          placeholderIcon.style.display = "flex";
          placeholderIcon.style.alignItems = "center";
          placeholderIcon.style.justifyContent = "center";
          placeholderIcon.style.height = "100%";
          imageContainer.appendChild(placeholderIcon);
        };
        imageContainer.appendChild(img);
      } else {
        const placeholderIcon = document.createElement("span");
        placeholderIcon.innerText = "\u{1F464}";
        placeholderIcon.style.fontSize = isMobile2() ? "1.5rem" : "2rem";
        placeholderIcon.style.color = "#888";
        placeholderIcon.style.display = "flex";
        placeholderIcon.style.alignItems = "center";
        placeholderIcon.style.justifyContent = "center";
        placeholderIcon.style.height = "100%";
        imageContainer.appendChild(placeholderIcon);
      }
      const nameContainer = document.createElement("div");
      nameContainer.style.display = "flex";
      nameContainer.style.alignItems = "center";
      nameContainer.style.justifyContent = "center";
      nameContainer.style.gap = "0.3rem";
      nameContainer.style.marginTop = "0.3rem";
      if (performer.country) {
        const flagEmoji = getCountryFlagEmoji(performer.country);
        if (flagEmoji) {
          const flagSpan = document.createElement("span");
          flagSpan.innerText = flagEmoji;
          nameContainer.appendChild(flagSpan);
        }
      }
      const name = document.createElement("div");
      name.innerText = performer.name;
      name.style.fontSize = isMobile2() ? "0.8rem" : "0.9rem";
      name.style.textAlign = "center";
      name.style.color = "#ddd";
      name.style.maxWidth = "100px";
      name.style.overflow = "hidden";
      name.style.textOverflow = "ellipsis";
      name.style.whiteSpace = "nowrap";
      nameContainer.appendChild(name);
      const rating = document.createElement("div");
      const ascScoreText = performer.ascScore ? performer.ascScore.toFixed(2) : "N/A";
      const tier = getRatingTier2(performer, performers);
      rating.innerText = `Asc.Score: ${ascScoreText}`;
      rating.style.fontSize = isMobile2() ? "0.7rem" : "0.8rem";
      rating.style.color = getTierColor2(tier);
      rating.style.fontWeight = "bold";
      const stats = parsePerformerStats(performer) || {};
      const matchStats = document.createElement("div");
      matchStats.style.display = "flex";
      matchStats.style.justifyContent = "center";
      matchStats.style.gap = "0.5rem";
      matchStats.style.marginTop = "0.3rem";
      matchStats.style.fontSize = isMobile2() ? "0.7rem" : "0.8rem";
      const matchesContainer = document.createElement("div");
      matchesContainer.style.display = "flex";
      matchesContainer.style.flexDirection = "column";
      matchesContainer.style.alignItems = "center";
      const matchesValue = document.createElement("div");
      matchesValue.innerText = stats.total_matches || 0;
      matchesValue.style.fontWeight = "bold";
      matchesValue.style.color = "#ddd";
      const matchesLabel = document.createElement("div");
      matchesLabel.innerText = "M";
      matchesLabel.style.color = "#aaa";
      matchesContainer.appendChild(matchesValue);
      matchesContainer.appendChild(matchesLabel);
      const winsContainer = document.createElement("div");
      winsContainer.style.display = "flex";
      winsContainer.style.flexDirection = "column";
      winsContainer.style.alignItems = "center";
      const winsValue = document.createElement("div");
      winsValue.innerText = stats.wins || 0;
      winsValue.style.fontWeight = "bold";
      winsValue.style.color = "#4caf50";
      const winsLabel = document.createElement("div");
      winsLabel.innerText = "W";
      winsLabel.style.color = "#aaa";
      winsContainer.appendChild(winsValue);
      winsContainer.appendChild(winsLabel);
      const lossesContainer = document.createElement("div");
      lossesContainer.style.display = "flex";
      lossesContainer.style.flexDirection = "column";
      lossesContainer.style.alignItems = "center";
      const lossesValue = document.createElement("div");
      lossesValue.innerText = stats.losses || 0;
      lossesValue.style.fontWeight = "bold";
      lossesValue.style.color = "#f44336";
      const lossesLabel = document.createElement("div");
      lossesLabel.innerText = "L";
      lossesLabel.style.color = "#aaa";
      lossesContainer.appendChild(lossesValue);
      lossesContainer.appendChild(lossesLabel);
      matchStats.appendChild(matchesContainer);
      matchStats.appendChild(winsContainer);
      matchStats.appendChild(lossesContainer);
      performerCard.appendChild(position);
      performerCard.appendChild(imageContainer);
      performerCard.appendChild(nameContainer);
      performerCard.appendChild(rating);
      performerCard.appendChild(matchStats);
      performersGrid.appendChild(performerCard);
    });
    container.appendChild(performersGrid);
  }

  // metrics.js
  window.AscensionMetrics = function() {
    "use strict";
    async function init() {
      function waitForStatsPage() {
        return new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            const statsContainer2 = document.querySelector("div.container-fluid div.mt-5");
            if (statsContainer2) {
              clearInterval(checkInterval);
              resolve(statsContainer2);
            }
          }, 500);
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve(null);
          }, 1e4);
        });
      }
      const statsContainer = await waitForStatsPage();
      if (!statsContainer || document.querySelector(".ascension-metrics-container"))
        return;
      const container = document.createElement("div");
      container.className = "ascension-metrics-container";
      container.style.padding = isMobile2() ? "1rem" : "2rem";
      container.style.maxWidth = "1200px";
      container.style.margin = isMobile2() ? "1rem auto" : "2rem auto";
      container.style.borderTop = "2px solid #444";
      container.style.backgroundColor = "rgba(0, 0, 0, 0.1)";
      container.style.borderRadius = "8px";
      statsContainer.appendChild(container);
      const loading = document.createElement("div");
      loading.innerText = "Loading Ascension Metrics...";
      loading.style.textAlign = "center";
      loading.style.padding = "2rem";
      loading.style.color = "#888";
      loading.style.fontSize = isMobile2() ? "1rem" : "1.2rem";
      container.appendChild(loading);
      try {
        const snapshots = await getSnapshotFiles();
        console.log("[Ascension Metrics] Snapshots found:", snapshots);
        if (snapshots.length === 0) {
          loading.innerHTML = `
          <div style="text-align: center; padding: 2rem;">
            <h3>No snapshot files found</h3>
            <p>Run a snapshot export in the Ascension plugin to generate metrics.</p>
            <p>Snapshots are saved in the plugin's assets directory.</p>
            <p style="font-size: 0.9rem; color: #888; margin-top: 1rem;">
              Checked: /plugin/ascension/assets/<br>
              Make sure files with pattern "*Ascension Database Snapshot.json" exist.
            </p>
          </div>
        `;
          return;
        }
        container.removeChild(loading);
        let currentSnapshotData = null;
        const selector = createSnapshotSelector(container, snapshots, async (filename) => {
          const loadingIndicator = document.createElement("div");
          loadingIndicator.innerHTML = `
          <div style="text-align: center; padding: 2rem;">
            <p>Loading snapshot...</p>
            <p style="font-size: 0.9rem; color: #888;">${filename}</p>
          </div>
        `;
          const existingDashboard = container.querySelector(".metrics-dashboard");
          if (existingDashboard) {
            container.removeChild(existingDashboard);
          }
          container.appendChild(loadingIndicator);
          currentSnapshotData = await loadSnapshotData(filename);
          container.removeChild(loadingIndicator);
          if (currentSnapshotData) {
            const dashboard = document.createElement("div");
            dashboard.className = "metrics-dashboard";
            container.appendChild(dashboard);
            await createMetricsDashboard(dashboard, currentSnapshotData);
          } else {
            const error = document.createElement("div");
            error.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #f44336;">
              <h3>Failed to load snapshot data</h3>
              <p>Could not load: ${filename}</p>
              <p style="font-size: 0.9rem;">Check browser console for details</p>
            </div>
          `;
            container.appendChild(error);
          }
        });
        if (snapshots.length > 0 && !currentSnapshotData) {
          currentSnapshotData = await loadSnapshotData(snapshots[0]);
          if (currentSnapshotData) {
            const dashboard = document.createElement("div");
            dashboard.className = "metrics-dashboard";
            container.appendChild(dashboard);
            await createMetricsDashboard(dashboard, currentSnapshotData);
          } else {
            const error = document.createElement("div");
            error.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #f44336;">
              <h3>Failed to load initial snapshot data</h3>
              <p>Could not load: ${snapshots[0]}</p>
              <p style="font-size: 0.9rem;">Check browser console for details</p>
            </div>
          `;
            container.appendChild(error);
          }
        }
      } catch (error) {
        console.error("[Ascension Metrics] Error setting up metrics:", error);
        loading.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #f44336;">
          <h3>Error loading Ascension Metrics</h3>
          <p>${error.message}</p>
          <p style="font-size: 0.9rem;">Check browser console for details</p>
        </div>
      `;
      }
    }
    return {
      init
    };
  }();

  // main.js
  window.openRankingModal = openRankingModal;
  window.openStatsModal = openStatsModal;
  window.closeRankingModal = closeRankingModal;
  window.handleGenderToggle = handleGenderToggle;
  window.showPerformerSelection = showPerformerSelection;
  window.handleChooseItem = handleChooseItem;
  var lastPath2 = "";
  (function initializeSelectedGendersFromLocalStorage() {
    try {
      const saved = localStorage.getItem("hotornot_selected_genders");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          state.selectedGenders = parsed;
        }
      }
    } catch (e) {
      console.warn("[Ascension] Failed to load selected genders from localStorage:", e);
    }
  })();
  (function initializeSelectedModeFromLocalStorage() {
    try {
      const savedMode = localStorage.getItem("hotornot_selected_mode");
      if (savedMode) {
        state.currentMode = savedMode;
      }
    } catch (e) {
      console.warn("[Ascension] Failed to load selected mode from localStorage:", e);
    }
  })();
  var observer2 = null;
  function initializeMetrics() {
    if (window.location.pathname.includes("/stats")) {
      const checkInterval = setInterval(() => {
        const statsContainer = document.querySelector("div.container-fluid div.mt-5");
        if (statsContainer) {
          clearInterval(checkInterval);
          setTimeout(() => {
            if (window.AscensionMetrics && typeof window.AscensionMetrics.init === "function") {
              console.log("[Ascension] Initializing metrics dashboard");
              window.AscensionMetrics.init();
            } else {
              console.log("[Ascension] Metrics module not found or not ready");
            }
          }, 500);
        }
      }, 500);
      setTimeout(() => clearInterval(checkInterval), 1e4);
    }
  }
  function main() {
    if (window.honLoaded) {
      cleanup2();
    }
    window.honLoaded = true;
    console.log("[Ascension] Global Scope Initialized");
    initializeMetrics();
    if (!observer2) {
      observer2 = new MutationObserver(() => {
        const currentPath = window.location.pathname;
        const existingBtn = document.getElementById("hon-floating-btn");
        if (existingBtn) {
          if (!shouldShowButton()) {
            existingBtn.remove();
          }
        } else if (shouldShowButton()) {
          addFloatingButton();
        }
        if (isOnSinglePerformerPage()) {
          const badgeExists = !!document.getElementById("hon-battle-rank-badge");
          if (currentPath !== lastPath2 || !badgeExists) {
            lastPath2 = currentPath;
            setTimeout(() => {
              if (!document.getElementById("hon-battle-rank-badge")) {
                injectBattleRankBadge();
              }
            }, 300);
          }
        }
        const container = document.getElementById("stash-main-container");
        if (container && !document.getElementById("hotornot-container")) {
          container.innerHTML = createMainUI();
          attachEventListeners(container);
        }
      });
      observer2.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    if (isOnSinglePerformerPage()) {
      setTimeout(() => injectBattleRankBadge(), 1e3);
    }
  }
  function cleanup2() {
    if (observer2) {
      observer2.disconnect();
      observer2 = null;
    }
    if (typeof cleanupButtonObserver === "function") {
      cleanupButtonObserver();
    }
    try {
      const modal = document.getElementById("hon-modal");
      if (modal) {
        modal.style.display = "none";
      }
      destroyEventLog();
      clearDOMCache();
    } catch (e) {
      console.warn("Error during modal cleanup:", e);
    }
    lastPath2 = "";
  }
  main();
})();
