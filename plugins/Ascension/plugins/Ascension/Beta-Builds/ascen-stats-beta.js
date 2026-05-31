// =================================
// Tier Info
// =================================
function formatScore(score) {
  return (score / 10).toFixed(1);
}

function getRatingTier(rating) {
  // Convert integer rating to actual rating value
  const actualRating = rating / 10;
  if (actualRating >= 8.5) return 'S-Tier';
  if (actualRating >= 7.0) return 'A-Tier';
  if (actualRating >= 5.5) return 'B-Tier';
  if (actualRating >= 4.0) return 'C-Tier';
  if (actualRating >= 2.5) return 'D-Tier';
  return 'F-Tier';
}

function getTierChangeIndicator(ratingBefore, ratingAfter) {
  const tierBefore = getRatingTier(ratingBefore);
  const tierAfter = getRatingTier(ratingAfter);
  
  if (tierAfter === tierBefore) return '';
  
  const tierColor = getTierColor(tierAfter);
  const arrow = getTierLevel(tierAfter) > getTierLevel(tierBefore) ? '⬆️' : '⬇️';
  
  return ` <span style="color: ${tierColor}; font-weight: bold; font-size: 0.8em;">${arrow}${tierAfter.charAt(0)}</span>`;
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

// =================================
// Force Custom Fields Collapse Open
// =================================
const collapseObserver = new MutationObserver(() => {
  const performerCustomFields = document.querySelector('#performer-page .custom-fields');
  if (!performerCustomFields) return;

  const collapse = performerCustomFields.querySelector('.collapse');
  const chevron = performerCustomFields.querySelector('.collapse-button svg');

  if (collapse && !collapse.classList.contains('show')) {
    collapse.classList.add('show');

    if (chevron) {
      chevron.style.transform = 'rotate(180deg)';
    }

    // Stop observing once expanded
    collapseObserver.disconnect();
  }
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
      console.warn('HotOrNot stats parse failed (new):', err);
    }
  });
});

function buildStatsGrid(data) {
  const grid = document.createElement('div');
  grid.className = 'stats-grid';

  const streakEmojis = [
    { min: 3, max: 5, symbol: '❤️‍🔥' },
    { min: 6, max: 9, symbol: '🔥' },
    { min: 10, max: 14, symbol: '💎' },
	{ min: 15, max: 20, symbol: '♠' },
	{ min: 21, max: 26, symbol: '✨' },
    { min: 27, max: Infinity, symbol: '👑' }
  ];

  Object.entries(data).forEach(([key, value]) => {
    const label = key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    let displayValue = value;
    
    // Format rating values with decimals
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
      console.warn('HotOrNot stats parse failed (old):', err);
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
  document.querySelectorAll('.custom-field-performer_record .TruncatedText').forEach(el => {
    if (el.dataset.parsed) return;

    try {
      const rawText = el.textContent.trim();
      if (!rawText.startsWith('[')) return;

      const history = JSON.parse(rawText);
      const container = el.closest('.custom-field-performer_record');

      const titleSpan = container?.querySelector('.detail-item-title.custom-field-performer-record');
      if (titleSpan) titleSpan.textContent = 'Past Matchups';

      const timeline = buildTimeline(history);
      el.dataset.parsed = 'true';
      el.innerHTML = '';
      el.appendChild(timeline);
    } catch (err) {
      console.warn('Performer record parse failed (new):', err);
    }
  });
});

// ==============================================================================
// Stash Version .30 and Earlier Performer Record (Match History Timeline) Parser
// ==============================================================================
const recordObserverOld = new MutationObserver(() => {
  document.querySelectorAll('.performer_record .TruncatedText').forEach(el => {
    if (el.dataset.parsed) return;

    try {
      const rawText = el.textContent.trim();
      if (!rawText.startsWith('[')) return;

      const history = JSON.parse(rawText);
      const container = el.closest('.performer_record');

      const titleSpan = container?.querySelector('.detail-item-title');
      if (titleSpan) titleSpan.textContent = 'Past Matchups';

      const timeline = buildTimeline(history);
      el.dataset.parsed = 'true';
      el.innerHTML = '';
      el.appendChild(timeline);
    } catch (err) {
      console.warn('Performer record parse failed (old):', err);
    }
  });
});

function buildTimeline(history) {
  const timeline = document.createElement('div');
  timeline.className = 'match-timeline';

  // Process matches in reverse chronological order (newest first)
  const sortedHistory = [...history].reverse();
  
  sortedHistory.slice(0, 10).forEach((match, index) => {
    const date = new Date(match.date).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric'
    });

    const statusClass = match.won === true ? 'win' : (match.won === false ? 'loss' : 'draw');
    const statusText = match.won === true ? 'WIN' : (match.won === false ? 'LOSS' : 'DRAW');
    const symbol = match.won === true ? '●' : (match.won === false ? '●' : '○');

    const [oppId, oppName] = match.opponent.includes(':')
      ? match.opponent.split(':')
      : [null, match.opponent];

    // Truncate long performer names
    const maxNameLength = 15;
    const truncatedName = oppName.length > maxNameLength 
      ? oppName.substring(0, maxNameLength) + '...' 
      : oppName;

    const profileUrl = oppId ? `/performers/${oppId}/scenes` : '#';
    
    // Get the previous match to calculate rating change
    let tierIndicator = '';
    if (index < sortedHistory.length - 1) {
      const previousMatch = sortedHistory[index + 1];
      tierIndicator = getTierChangeIndicator(previousMatch.ratingAfter, match.ratingAfter);
    }
    
    // Format rating with decimal
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
recordObserverOld.observe(document.body, { childList: true, subtree: true });
