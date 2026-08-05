// =================================
// Tier Info (Percentile-based, duplicated from rating-utils.js)
// =================================
const TIER_GATES = Object.freeze([
  { tier: 'S-Tier', maxPercentile: 5,  minBattleScore: 9.0 },
  { tier: 'A-Tier', maxPercentile: 18, minBattleScore: 7.5 },
  { tier: 'B-Tier', maxPercentile: 38, minBattleScore: 5.0 },
  { tier: 'C-Tier', maxPercentile: 68, minBattleScore: 2.0 },
  { tier: 'D-Tier', maxPercentile: 88, minBattleScore: 0.4 },
  { tier: 'F-Tier', maxPercentile: 100, minBattleScore: 0.11 }
]);

function formatScore(score) {
  return (score / 10).toFixed(1);
}

function getTierLevel(tier) {
  switch(tier) {
    case 'S-Tier': return 6;
    case 'A-Tier': return 5;
    case 'B-Tier': return 4;
    case 'C-Tier': return 3;
    case 'D-Tier': return 2;
    case 'F-Tier': return 1;
    default: return 0;
  }
}

function getTierColor(tier) {
  switch (tier) {
    case 'S-Tier': return '#eb9834'; // Gold
    case 'A-Tier': return '#e014aa'; // Pink
    case 'B-Tier': return '#7f1e82'; // Purple
    case 'C-Tier': return '#14bbe0'; // Light blue
    case 'D-Tier': return '#92e014'; // Lime Green
    case 'F-Tier': return '#808080'; // Gray
    default: return '#000000';
  }
}

function getPerformerStats(performer) {
  let totalMatches = performer.total_matches ?? 0;
  let wins = performer.wins ?? 0;
  let winMargin = performer.win_margin ?? 0;

  if (performer.custom_fields?.hotornot_stats) {
    try {
      const stats = typeof performer.custom_fields.hotornot_stats === 'string'
        ? JSON.parse(performer.custom_fields.hotornot_stats)
        : performer.custom_fields.hotornot_stats;

      if (totalMatches === 0 && (stats?.total_matches ?? 0) > 0) totalMatches = stats.total_matches;
      if (wins === 0 && (stats?.wins ?? 0) > 0) wins = stats.wins;
      if (winMargin === 0 && (stats?.win_margin ?? 0) !== 0) winMargin = stats.win_margin;
    } catch (e) {}
  }

  return { totalMatches, wins, winMargin };
}

function calculateBattleScore(performer) {
  if (!performer || typeof performer !== 'object') return 0;

  const rating100 = performer.rating100 ?? performer.rawRating ?? 1;
  const displayRating = rating100 / 10;
  const stats = getPerformerStats(performer);
  const winRate = stats.totalMatches > 0 ? stats.wins / stats.totalMatches : 0;

  const compositeScore =
    (rating100 / 100) +
    (winRate * 0.5) +
    (stats.winMargin / 100) +
    (Math.log10(stats.wins + 1) * 0.2);

  return displayRating + compositeScore;
}

function getSortedBattleScores(performers) {
  return performers
    .map(p => calculateBattleScore(p))
    .sort((a, b) => b - a);
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

function getPercentilePosition(performer, allPerformers) {
  if (!Array.isArray(allPerformers) || allPerformers.length === 0) return 50;
  const battleScore = calculateBattleScore(performer);
  const sortedScores = getSortedBattleScores(allPerformers);
  const strictlyBetter = findStrictlyBetterCount(sortedScores, battleScore);
  return (strictlyBetter / sortedScores.length) * 100;
}

function getTierFromPercentile(percentile, battleScore) {
  if (percentile < 0) percentile = 0;
  if (percentile > 100) percentile = 100;

  for (const gate of TIER_GATES) {
    if (percentile < gate.maxPercentile && battleScore >= gate.minBattleScore) {
      return gate.tier;
    }
  }

  return 'F-Tier';
}

function getRatingTier(performer, allPerformers = null) {
  if (!performer || typeof performer !== 'object') return 'F-Tier';

  const rating100 = performer.rating100 ?? performer.rawRating ?? 1;
  const stats = getPerformerStats(performer);

  if (rating100 <= 1 && stats.totalMatches === 0) return 'F-Tier';

  if (!Array.isArray(allPerformers) || allPerformers.length === 0) {
    if (rating100 >= 85) return 'S-Tier';
    if (rating100 >= 70) return 'A-Tier';
    if (rating100 >= 55) return 'B-Tier';
    if (rating100 >= 40) return 'C-Tier';
    if (rating100 >= 25) return 'D-Tier';
    return 'F-Tier';
  }

  const battleScore = calculateBattleScore(performer);
  const sortedScores = getSortedBattleScores(allPerformers);
  if (sortedScores.length === 0) return 'F-Tier';

  const strictlyBetter = findStrictlyBetterCount(sortedScores, battleScore);
  const percentile = (strictlyBetter / sortedScores.length) * 100;

  return getTierFromPercentile(percentile, battleScore);
}

function getTierChangeIndicator(ratingBefore, ratingAfter) {
  const tierBefore = getRatingTier({ rating100: ratingBefore });
  const tierAfter = getRatingTier({ rating100: ratingAfter });

  if (tierAfter === tierBefore) return '';

  const tierColor = getTierColor(tierAfter);
  const arrow = getTierLevel(tierAfter) > getTierLevel(tierBefore) ? '⬆️' : '⬇️';

  return ` <span style="color: ${tierColor}; font-weight: bold; font-size: 0.8em;">${arrow}${tierAfter.charAt(0)}</span>`;
}

// =================================
// Force Custom Fields Collapse Open
// =================================
const collapseObserver = new MutationObserver(() => {
  const allCustomFields = document.querySelectorAll('.custom-fields');

  allCustomFields.forEach(container => {
    const hasRelevantField =
      container.querySelector('.custom-field-performer_record') ||
      container.querySelector('.custom-field-scene_record') ||
      container.querySelector('.custom-field-hotornot_stats');

    if (!hasRelevantField) return;

    const collapse = container.querySelector('.collapse');
    const chevron = container.querySelector('.collapse-button svg');

    if (collapse && !collapse.classList.contains('show')) {
      collapse.classList.add('show');
      if (chevron) {
        chevron.style.transform = 'rotate(180deg)';
      }
    }
  });
});

collapseObserver.observe(document.body, {
  childList: true,
  subtree: true
});

// ==========================================
// Ascension Stats Parser - New Version (.31+)
// ==========================================
const statsObserverNew = new MutationObserver(() => {
  document.querySelectorAll('.custom-field-hotornot_stats .TruncatedText').forEach(el => {
    if (el.dataset.parsed) return;

    try {
      const rawText = el.textContent.trim();
      if (!rawText.startsWith('{')) return;

      const data = JSON.parse(rawText);

      const container = el.closest('.custom-field-hotornot_stats');
      if (!container) return;

      const titleSpan = container.querySelector('.detail-item-title.custom-field-hotornot-stats');
      if (titleSpan) {
        titleSpan.textContent = 'Match History';
      }

      const grid = buildStatsGrid(data);
      el.dataset.parsed = 'true';
      el.replaceWith(grid);
    } catch (err) {
      console.warn('Ascension stats parse failed (new):', err);
    }
  });
});

function buildStatsGrid(data) {
  const grid = document.createElement('div');
  grid.className = 'stats-grid';

  const streakEmojis = [
    { min: 2, max: 3, symbol: '🔥' },
    { min: 4, max: 5, symbol: '❤️‍🔥' },
    { min: 6, max: 8, symbol: '💎' },
    { min: 9, max: 12, symbol: '♠️' },
    { min: 13, max: 17, symbol: '✨' },
    { min: 18, max: Infinity, symbol: '👑' }
  ];

  Object.entries(data).forEach(([key, value]) => {
    const label = key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    let displayValue = value;

    if (key.toLowerCase().includes('rating') || key === 'current_score') {
      displayValue = formatScore(value);
    } else if (key === 'last_match') {
      displayValue = new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }

    let emoji = '';
    if (key.toLowerCase() === 'current_streak') {
      for (let s of streakEmojis) {
        if (value >= s.min && value <= s.max) {
          emoji = ' ' + s.symbol;
          break;
        }
      }
    }

    if (key.toLowerCase() === 'best_streak') {
      emoji =
        ' ' +
        streakEmojis
          .filter(s => value >= s.min)
          .map(s => s.symbol)
          .join('');
    }

    const valueClass = (() => {
      if (typeof value === 'number') {
        if (key.toLowerCase() === 'losses' && value > 0)
          return 'stat-negative';
        if (value > 0) return 'stat-positive';
        if (value < 0) return 'stat-negative';
      }
      return '';
    })();

    grid.insertAdjacentHTML(
      'beforeend',
      `<div class="stat-item">
         <div class="stats-key">${label}</div>
         <div class="stats-value ${valueClass}">
           ${displayValue}${emoji}
         </div>
       </div>`
    );
  });

  return grid;
}

statsObserverNew.observe(document.body, {
  childList: true,
  subtree: true
});

// ===================================================
// Stash Version .30 and Earlier Ascension Stats Parser
// ===================================================
const statsObserverOld = new MutationObserver(() => {
  document.querySelectorAll('.hotornot_stats .TruncatedText').forEach(el => {
    if (el.dataset.parsed) return;

    try {
      const rawText = el.textContent.trim();
      if (!rawText.startsWith('{')) return;

      const data = JSON.parse(rawText);

      const container = el.closest('.hotornot_stats');
      if (!container) return;

      const titleSpan = container.querySelector('.detail-item-title.hotornot-stats');
      if (titleSpan) {
        titleSpan.textContent = 'Match History';
      }

      const grid = buildStatsGrid(data);
      el.dataset.parsed = 'true';
      el.replaceWith(grid);
    } catch (err) {
      console.warn('Ascension stats parse failed (old):', err);
    }
  });
});

statsObserverOld.observe(document.body, {
  childList: true,
  subtree: true
});

// ======================================================================
// Performer Record (Match History Timeline) Parser - New Version (.31+)
// ======================================================================
const recordObserverNew = new MutationObserver(() => {
  document.querySelectorAll('.custom-field-performer_record .TruncatedText, .custom-field-scene_record .TruncatedText').forEach(el => {
    if (el.dataset.parsed) return;

    try {
      const rawText = el.textContent.trim();
      if (!rawText.startsWith('[')) return;

      const history = JSON.parse(rawText);
      const container = el.closest('.custom-field-performer_record, .custom-field-scene_record');

      const isSceneRecord = container?.classList.contains('custom-field-scene_record');

      const titleSpan = container?.querySelector('.detail-item-title.custom-field-performer-record, .detail-item-title.custom-field-scene-record');
      if (titleSpan) titleSpan.textContent = 'Past Matchups';

      const timeline = buildTimeline(history, isSceneRecord);
      el.dataset.parsed = 'true';
      el.innerHTML = '';
      el.appendChild(timeline);
    } catch (err) {
      console.warn('Record timeline parse failed (new):', err);
    }
  });
});

function buildTimeline(history, isSceneRecord = false) {
  const timeline = document.createElement('div');
  timeline.className = 'match-timeline';

  const sortedHistory = [...history].reverse();

  sortedHistory.slice(0, 10).forEach((match, index) => {
    const date = new Date(match.date).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric'
    });

    const statusClass = match.won === true ? 'win' : (match.won === false ? 'loss' : 'draw');
    const statusText = match.won === true ? 'WIN' : (match.won === false ? 'LOSS' : 'DRAW');
    const symbol = match.won === true ? '●' : (match.won === false ? '●' : '○');

    let oppId = null;
    let oppName = 'Unknown';

    if (isSceneRecord) {
      // Scene record format: opponentId, optionally legacy opponent "id:Title"
      if (match.opponentId) {
        oppId = match.opponentId.toString();
        oppName = `Scene ${oppId}`;
      } else if (match.opponent && typeof match.opponent === 'string' && match.opponent.includes(':')) {
        oppId = match.opponent.split(':')[0];
        oppName = `Scene ${oppId}`;
      }
    } else {
      // Performer record format: opponent "id:Name"
      if (match.opponent && typeof match.opponent === 'string') {
        if (match.opponent.includes(':')) {
          const parts = match.opponent.split(':');
          oppId = parts[0];
          oppName = parts.slice(1).join(':') || 'Unknown';
        } else {
          oppId = match.opponent;
          oppName = `Performer ${oppId}`;
        }
      }
    }

    const maxNameLength = 15;
    const truncatedName = oppName.length > maxNameLength
      ? oppName.substring(0, maxNameLength) + '...'
      : oppName;

    const profileUrl = isSceneRecord
      ? (oppId ? `/scenes/${oppId}` : '#')
      : (oppId ? `/performers/${oppId}/scenes` : '#');

    let tierIndicator = '';
    if (index < sortedHistory.length - 1) {
      const previousMatch = sortedHistory[index + 1];
      tierIndicator = getTierChangeIndicator(previousMatch.ratingAfter, match.ratingAfter);
    }

    const formattedRating = formatScore(match.ratingAfter);

    timeline.insertAdjacentHTML('beforeend', `
      <div class="timeline-entry ${statusClass}">
        <span class="timeline-date">${date}</span>
        <span class="timeline-marker">${symbol}</span>
        <div class="timeline-content">
          <span class="timeline-status">${statusText}</span>
          <span class="timeline-vs">vs</span>
          <a href="${profileUrl}" class="timeline-opponent-link" style="color: #00b2ff; text-decoration: none;" title="${oppName}">
            ${truncatedName}
          </a>
        </div>
        <div class="rating-tier-container">
          <span class="timeline-rating">${formattedRating}</span>
          <span class="tier-indicator">${tierIndicator}</span>
        </div>
      </div>
    `);
  });

  return timeline;
}

const style = document.createElement('style');
style.textContent = `
  .rating-tier-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .timeline-rating {
    font-weight: bold;
  }

  .tier-indicator {
    font-size: 0.8em;
  }
`;
document.head.appendChild(style);

recordObserverNew.observe(document.body, { childList: true, subtree: true });
