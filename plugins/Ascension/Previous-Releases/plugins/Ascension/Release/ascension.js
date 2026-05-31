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
  function parsePerformerEloData(performer) {
    const defaultStats = {
      total_matches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      current_streak: 0,
      best_streak: 0,
      worst_streak: 0,
      last_match: null
    };
    if (!performer?.custom_fields)
      return defaultStats;
    if (performer.custom_fields.hotornot_stats) {
      try {
        const stats = JSON.parse(performer.custom_fields.hotornot_stats);
        if (stats.performer_record) {
          delete stats.performer_record;
        }
        return { ...defaultStats, ...stats };
      } catch (e) {
        console.warn(`[Ascension] Failed to parse stats for ${performer.id}`);
      }
    }
    const eloMatches = parseInt(performer.custom_fields.elo_matches, 10);
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
  function getRecencyWeight(performer) {
    const cacheKey = `${performer.id}-${performer.last_match || "null"}-${performer.rating100 || 1}-${parsePerformerEloData(performer).total_matches || 0}`;
    const now = Date.now();
    if (recencyWeightCache.has(cacheKey)) {
      const cached = recencyWeightCache.get(cacheKey);
      if (now - cached.timestamp < CACHE_TTL) {
        return cached.value;
      }
    }
    const stats = parsePerformerEloData(performer);
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
  function updatePerformerStats(currentStats, won) {
    const newStats = {
      ...currentStats,
      total_matches: (currentStats.total_matches || 0) + 1,
      last_match: (/* @__PURE__ */ new Date()).toISOString()
    };
    delete newStats.history;
    if (won === null) {
      newStats.draws = (currentStats.draws || 0) + 1;
      return newStats;
    }
    newStats.wins = won ? (currentStats.wins || 0) + 1 : currentStats.wins || 0;
    newStats.losses = won ? currentStats.losses || 0 : (currentStats.losses || 0) + 1;
    newStats.current_streak = won ? currentStats.current_streak >= 0 ? (currentStats.current_streak || 0) + 1 : 1 : currentStats.current_streak <= 0 ? (currentStats.current_streak || 0) - 1 : -1;
    newStats.best_streak = Math.max(currentStats.best_streak || 0, newStats.current_streak);
    newStats.worst_streak = Math.min(currentStats.worst_streak || 0, newStats.current_streak);
    return newStats;
  }
  function getUnderdogMultiplier(rating, opponentRating) {
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
    mode,
    winnerMatchCount,
    loserMatchCount,
    winnerStats = {},
    loserStats = {},
    isSpecialChallenge = false
  }) {
    const ratingDiff = loserRating - winnerRating;
    const expectedWinner = 1 / (1 + Math.pow(10, ratingDiff / 400));
    const winnerK = getProgressiveKFactor(winnerRating, null, winnerMatchCount, mode);
    const loserK = getProgressiveKFactor(loserRating, null, loserMatchCount, mode);
    const winnerUnderdogMult = getUnderdogMultiplier(winnerRating, loserRating);
    let lossProtection = isSpecialChallenge ? 0.1 : getChallengeProtectionMultiplier(loserRating, winnerRating);
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
      winnerGain = Math.ceil(winnerGain * 0.8);
    }
    if (winnerRating < loserRating - 20) {
      const ratingDiff2 = loserRating - winnerRating;
      const scaleFactor = Math.max(0.3, 1 - (ratingDiff2 - 20) / 100);
      winnerGain = Math.ceil(winnerGain * scaleFactor);
      loserLoss = Math.ceil(loserLoss * scaleFactor);
      loserLoss = Math.min(loserLoss, 5);
    }
    if (loserRating < winnerRating - 15) {
      const gap = winnerRating - loserRating;
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
  function getChallengeProtectionMultiplier(rating, opponentRating) {
    const ratingDiff = opponentRating - rating;
    if (ratingDiff > 15) {
      if (ratingDiff > 30) {
        return 0.7;
      } else if (ratingDiff > 25) {
        return 0.8;
      } else if (ratingDiff > 20) {
        return 0.85;
      } else {
        return 0.9;
      }
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
  function getRatingTier(rating) {
    if (rating >= 85)
      return "S-Tier";
    if (rating >= 70)
      return "A-Tier";
    if (rating >= 55)
      return "B-Tier";
    if (rating >= 40)
      return "C-Tier";
    if (rating >= 25)
      return "D-Tier";
    return "F-Tier";
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
  async function getPerformerGlobalRank(performerId, allPerformers) {
    try {
      if (!performerId || !allPerformers || allPerformers.length === 0) {
        return null;
      }
      const targetPerformer = allPerformers.find((p) => p.id === performerId);
      if (!targetPerformer) {
        return null;
      }
      const currentRating = targetPerformer.rating100 ?? 1;
      const ratedPerformers = allPerformers.filter((p) => {
        if (p.rating100 !== null && p.rating100 > 1)
          return true;
        const statsJson2 = p.custom_fields?.["hotornot_stats"];
        if (statsJson2) {
          try {
            const stats2 = typeof statsJson2 === "string" ? JSON.parse(statsJson2) : statsJson2;
            return stats2.total_matches > 0;
          } catch (e) {
            return false;
          }
        }
        return false;
      });
      const higherRatedCount = ratedPerformers.filter((p) => (p.rating100 ?? 1) > currentRating).length;
      const rank = higherRatedCount + 1;
      let stats = null;
      const statsJson = targetPerformer.custom_fields?.["hotornot_stats"];
      if (statsJson) {
        try {
          stats = typeof statsJson === "string" ? JSON.parse(statsJson) : statsJson;
        } catch (e) {
          console.warn(`[Ascension] Failed to parse stats for performer ${performerId}:`, e);
        }
      }
      return {
        rank,
        total: ratedPerformers.length,
        rating: currentRating,
        stats
      };
    } catch (err) {
      console.error("[Ascension] Error calculating global rank:", err);
      return null;
    }
  }
  var init_rating_utils = __esm({
    "rating-utils.js"() {
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
        selectedGenders: ["FEMALE"],
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
        currentFocus: null,
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
  var ALL_GENDERS, GENDER_ICONS, COUNTRY_NAMES, STREAK_EMOJIS;
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
        { min: 3, max: 5, symbol: "\u{1F525}" },
        { min: 6, max: 9, symbol: "\u2764\uFE0F\u200D\u{1F525}" },
        { min: 10, max: 14, symbol: "\u{1F48E}" },
        { min: 15, max: 20, symbol: "\u2660" },
        { min: 21, max: 26, symbol: "\u2728" },
        { min: 27, max: Infinity, symbol: "\u{1F451}" }
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

  // ui-cards.js
  function formatHeight(heightCm) {
    if (!heightCm)
      return null;
    const totalInches = Math.round(heightCm * 0.393701);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}\u2032${inches}\u2033 (${heightCm} cm)`;
  }
  function renderCard(item, side, rank) {
    const gauntletStreak = state.gauntletChampion?.id === item.id ? state.gauntletWins : null;
    if (state.battleType === "performers")
      return createPerformerCard(item, side, rank, gauntletStreak);
    if (state.battleType === "images")
      return createImageCard(item, side, rank, gauntletStreak);
    return createSceneCard(item, side, rank, gauntletStreak);
  }
  function createSceneCard(scene, side, rank = null, gauntletStreak = null) {
    const file = scene.files?.[0] || {};
    const performers = scene.performers?.map((p) => p.name).join(", ") || "No performers";
    const studio = scene.studio?.name || "No studio";
    const title = scene.title || file.path?.split(/[/\\]/).pop().replace(/\.[^/.]+$/, "") || `Scene #${scene.id}`;
    const screenshotPath = scene.paths?.screenshot;
    const previewPath = scene.paths?.preview;
    const stashRating = scene.rating100 ? (scene.rating100 / 10).toFixed(1) : "Unrated";
    const rankDisplay = rank != null ? `<span class="hon-scene-rank">${typeof rank === "number" ? "#" + rank : rank}</span>` : "";
    const streakDisplay = gauntletStreak ? `<div class="hon-streak-badge">${formatStreakDisplay(gauntletStreak)}</div>` : "";
    return `
    <div class="hon-scene-card" data-scene-id="${scene.id}" data-side="${side}" data-rating="${scene.rating100 || 1}">
      <div class="hon-scene-image-container" data-scene-url="/scenes/${scene.id}">
        ${screenshotPath ? `<img class="hon-scene-image" src="${screenshotPath}" alt="${title}" loading="lazy" />` : `<div class="hon-scene-image hon-no-image">No Screenshot</div>`}
        ${previewPath ? `<video class="hon-hover-preview" src="${previewPath}" loop playsinline></video>` : ""}
        <div class="hon-scene-duration">${formatDuration(file.duration)}</div>
        ${streakDisplay}
        <div class="hon-click-hint">Click to open scene</div>
      </div>
      <div class="hon-scene-body" data-winner="${scene.id}">
        <div class="hon-scene-info">
          <div class="hon-scene-title-row"><h3 class="hon-scene-title">${title}</h3>${rankDisplay}</div>
          <div class="hon-scene-meta">
            <div class="hon-meta-item"><strong>Studio:</strong> ${studio}</div>
            <div class="hon-meta-item"><strong>Performers:</strong> ${performers}</div>
            <div class="hon-meta-item"><strong>Rating:</strong> ${stashRating}</div>
          </div>
        </div>
        <div class="hon-choose-btn">\u2713 Choose This Scene</div>
      </div>
    </div>`;
  }
  function createPerformerCard(performer, side, rank = null, gauntletStreak = null) {
    const name = performer.name || `Performer #${performer.id}`;
    const imagePath = performer.image_path || null;
    const rawRating = performer.rating100 ?? 1;
    const stashRating = performer.rating100 !== null ? (rawRating / 10).toFixed(1) : "Unrated";
    let tierClass = "";
    let tierDisplay = "";
    if (performer.rating100 !== null) {
      const tier = getRatingTier(rawRating);
      const tierColor = getTierColor2(tier);
      tierDisplay = `<span style="font-weight: bold; color: ${tierColor}">${tier}</span> | `;
      tierClass = ` tier-${tier.toLowerCase().charAt(0)}`;
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
    metaItems.push(`<div class="hon-meta-item"><strong>Rating:</strong> ${tierDisplay}${stashRating}</div>`);
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
    if (performer.tags && performer.tags.length > 0) {
      const tagNames = performer.tags.map((tag) => tag.name || tag);
      const displayedTags = tagNames.slice(0, 3).join(", ");
      const remainingCount = Math.max(0, tagNames.length - 3);
      if (tagNames.length <= 3) {
        metaItems.push(`<div class="hon-meta-item"><strong>Tags:</strong> ${displayedTags}</div>`);
      } else {
        const allTagsHtml = tagNames.join(", ");
        metaItems.push(`
        <div class="hon-meta-item hon-tags-container">
          <strong>Tags:</strong> 
          <span class="hon-tags-displayed">${displayedTags}</span>
          <span class="hon-tags-ellipsis">...</span>
          <span class="hon-tags-more" style="color: #007bff; cursor: pointer; text-decoration: underline;">(+${remainingCount} more)</span>
          <span class="hon-tags-expanded" style="display:none;">${allTagsHtml}</span>
        </div>`);
      }
    }
    const minMetaItems = 6;
    while (metaItems.length < minMetaItems) {
      metaItems.push('<div class="hon-meta-item hon-meta-placeholder">&nbsp;</div>');
    }
    const streakDisplay = gauntletStreak && gauntletStreak >= 3 ? `<div class="hon-streak-badge">${formatStreakDisplay(gauntletStreak)}</div>` : "";
    return `
    <div class="hon-performer-card hon-scene-card${tierClass}" data-performer-id="${performer.id}" data-side="${side}" data-rating="${performer.rating100 || 1}">
      <div class="hon-performer-image-container hon-scene-image-container">
        <a href="/performers/${performer.id}" target="_blank" class="hon-performer-link">
          ${imagePath ? `<img class="hon-performer-image hon-scene-image" src="${imagePath}" alt="${name}" />` : `<div class="hon-no-image">No Image</div>`}
        </a>
        ${currentStreakDisplay}
        ${streakDisplay}
      </div>
      <div class="hon-performer-body hon-scene-body" data-winner="${performer.id}">
        <div class="hon-performer-info hon-scene-info">
          <!-- Battle Rank Badge Hidden -->
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
        <div class="hon-choose-btn">\u2713 Choose This Image</div>
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
  var init_ui_cards = __esm({
    "ui-cards.js"() {
      init_state();
      init_formatters();
      init_rating_utils();
      init_constants();
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
    fetchAllPerformerStats: () => fetchAllPerformerStats,
    fetchAllPerformersSorted: () => fetchAllPerformersSorted,
    fetchImageCount: () => fetchImageCount,
    fetchPerformerById: () => fetchPerformerById,
    fetchPerformerCount: () => fetchPerformerCount,
    fetchRandomImages: () => fetchRandomImages,
    fetchRandomPerformers: () => fetchRandomPerformers,
    getAllPerformersSorted: () => getAllPerformersSorted,
    getHotOrNotConfig: () => getHotOrNotConfig,
    graphqlQuery: () => graphqlQuery,
    handleComparison: () => handleComparison,
    isBattleRankBadgeEnabled: () => isBattleRankBadgeEnabled,
    undoLastMatch: () => undoLastMatch,
    updateImageRating: () => updateImageRating,
    updateItemRating: () => updateItemRating,
    updatePerformerRating: () => updatePerformerRating
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
    if (result.errors) {
      const errorMessages = result.errors.map((error) => error.message).join("; ");
      throw new Error(`GraphQL Errors: ${errorMessages}`);
    }
    return result.data;
  }
  async function fetchAllItems(queryTemplate, variablesBase = {}, pageSize = 1e3) {
    const allItems = [];
    let currentPage = 1;
    while (true) {
      const variables = {
        ...variablesBase,
        filter: {
          ...variablesBase.filter || {},
          per_page: pageSize,
          page: currentPage
        }
      };
      const result = await graphqlQuery(queryTemplate, variables);
      const items = result.findPerformers?.performers || result.findImages?.images || [];
      if (items.length === 0)
        break;
      allItems.push(...items);
      if (items.length < pageSize)
        break;
      currentPage++;
    }
    return allItems;
  }
  function sortPerformersByRating(performers) {
    return performers.sort((a, b) => {
      const ratingDiff = (b.rating100 ?? 1) - (a.rating100 ?? 1);
      if (ratingDiff !== 0)
        return ratingDiff;
      const statsA = parsePerformerEloData(a);
      const statsB = parsePerformerEloData(b);
      const matchCountDiff = (statsB.total_matches || 0) - (statsA.total_matches || 0);
      if (matchCountDiff !== 0)
        return matchCountDiff;
      const nameA = a.name?.toLowerCase() || "";
      const nameB = b.name?.toLowerCase() || "";
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
    const performers = await fetchAllItems(queryTemplate, {
      filter: { sort: sortBy, direction }
    });
    return sortPerformersByRating(performers);
  }
  async function fetchAllPerformerStats() {
    return await fetchAllPerformersSorted();
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
    return shuffled.slice(0, 2);
  }
  async function handleComparison(winnerId, loserId, winnerCurrentRating, loserCurrentRating, loserRank = null, winnerObj = null, loserObj = null, isDraw = false) {
    const winnerRating = winnerCurrentRating || 1;
    const loserRating = loserCurrentRating || 1;
    let freshWinnerObj, freshLoserObj;
    try {
      [freshWinnerObj, freshLoserObj] = await Promise.all([
        fetchPerformerById(winnerId),
        fetchPerformerById(loserId)
      ]);
    } catch (e) {
      console.error("[Ascension] Failed to fetch fresh performer data:", e);
      freshWinnerObj = winnerObj;
      freshLoserObj = loserObj;
    }
    let winnerMatchCount = 0;
    let loserMatchCount = 0;
    let winnerStats = {};
    let loserStats = {};
    if (state.battleType === "performers") {
      winnerStats = parsePerformerEloData(freshWinnerObj) || {};
      loserStats = parsePerformerEloData(freshLoserObj) || {};
      winnerMatchCount = winnerStats.total_matches || 0;
      loserMatchCount = loserStats.total_matches || 0;
    }
    let winnerGain = 0;
    let loserLoss = 0;
    if (isDraw) {
      const ratingDiff2 = loserRating - winnerRating;
      const expectedWinner = 1 / (1 + Math.pow(10, ratingDiff2 / 400));
      const winnerK = getProgressiveKFactor(winnerRating, winnerMatchCount, "swiss");
      const loserK = getProgressiveKFactor(loserRating, loserMatchCount, "swiss");
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
    const isFirstMatchGlobal = (state.currentMode === "gauntlet" || state.currentMode === "champion") && !state.gauntletChampion;
    const shouldTrackWinner = state.battleType === "performers";
    const shouldTrackLoser = state.battleType === "performers";
    const winnerStatus = isDraw ? null : true;
    const loserStatus = isDraw ? null : false;
    const winnerOldStats = shouldTrackWinner && freshWinnerObj ? {
      ...parsePerformerEloData(freshWinnerObj),
      performer_record: freshWinnerObj.custom_fields?.performer_record
    } : null;
    const loserOldStats = shouldTrackLoser && freshLoserObj ? {
      ...parsePerformerEloData(freshLoserObj),
      performer_record: freshLoserObj.custom_fields?.performer_record
    } : null;
    function normalizeStatsForStorage(stats) {
      if (!stats || !stats.performer_record)
        return stats;
      let normalizedStats = { ...stats };
      try {
        if (typeof normalizedStats.performer_record === "string") {
          normalizedStats.performer_record = JSON.parse(normalizedStats.performer_record);
        }
      } catch (e) {
        console.warn("[Ascension] Failed to parse performer_record for storage:", e);
      }
      return normalizedStats;
    }
    const normalizedWinnerStats = winnerOldStats ? normalizeStatsForStorage(winnerOldStats) : null;
    const normalizedLoserStats = loserOldStats ? normalizeStatsForStorage(loserOldStats) : null;
    if (!state.matchHistory)
      state.matchHistory = [];
    state.matchHistory.push({
      winnerId,
      loserId,
      winnerOldRating: winnerRating,
      loserOldRating: loserRating,
      winnerOldStats: normalizedWinnerStats,
      loserOldStats: normalizedLoserStats,
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
    await Promise.all([
      updateItemRating(
        winnerId,
        newWinnerRating,
        freshWinnerObj,
        winnerStatus,
        loserId
      ),
      updateItemRating(
        loserId,
        newLoserRating,
        freshLoserObj,
        loserStatus,
        winnerId
      )
    ]);
    return {
      newWinnerRating,
      newLoserRating,
      winnerChange: winnerGain,
      loserChange: -loserLoss
    };
  }
  async function updateItemRating(itemId, newRating, itemObj = null, won = null, opponentId = null) {
    if (state.battleType === "performers") {
      return await updatePerformerRating(itemId, newRating, itemObj, won, opponentId);
    } else if (state.battleType === "images") {
      return await updateImageRating(itemId, newRating);
    } else {
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
  async function updateImageRating(id, rating) {
    await graphqlQuery(`mutation($i: ImageUpdateInput!) { imageUpdate(input: $i) { id } }`, {
      i: { id, rating100: Math.max(1, Math.min(100, rating)) }
    });
  }
  async function updatePerformerRating(id, rating, performerObj = null, won = null, opponentId = null) {
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
    const statusText = won === true ? "WIN" : won === false ? "LOSS" : "UPDATE";
    const statusColor = won === true ? "#4CAF50" : won === false ? "#F44336" : "#9E9E9E";
    const displayRating = (cleanRating / 10).toFixed(1);
    console.log(
      `%c[Ascension] %cUpdating: %c${performerName || "???"} %c(ID: ${id})%c, %cRating: %c${displayRating}%c, %cResult: %c${statusText}`,
      "color: #1cb4d6; font-weight: bold;",
      // [Ascension]
      "color: #1cb4d6;",
      // Updating:
      "color: #1cb4d6; font-weight: bold;",
      // performerName
      "color: #1cb4d6;",
      // ID
      "color: #888;",
      //
      "color: #FF69B4;",
      // Rating:
      "color: #FF69B4; font-weight: bold;",
      // displayRating
      "color: #888;",
      //
      "color: #1cb4d6;",
      // Result:
      `color: ${statusColor}; font-weight: bold;`
      // statusText (green for win, red for loss)
    );
    const variables = {
      id: id.toString(),
      rating: cleanRating,
      fields: {}
    };
    if (performerObj) {
      try {
        const currentStats = parsePerformerEloData(performerObj);
        const updatedStats = updatePerformerStats(currentStats, won);
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
      }`, variables);
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
      console.log("[Ascension] Successfully restored ratings");
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
      state.gauntletFallingItem = snap.gauntletFallingItem;
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
    if (state.battleType === "performers") {
      const fields = {};
      if (statsObj) {
        const statsToRestore = { ...statsObj };
        delete statsToRestore.performer_record;
        fields.hotornot_stats = JSON.stringify(statsToRestore);
        if ("performer_record" in statsObj) {
          const recordData = statsObj.performer_record;
          console.log(`[Ascension] Restoring performer_record for ${itemId}:`, recordData);
          if (recordData !== void 0 && recordData !== null) {
            fields.performer_record = Array.isArray(recordData) ? JSON.stringify(recordData) : recordData;
          } else {
            fields.performer_record = "[]";
          }
        }
      }
      console.log(`[Ascension] Restoring performer ${itemId} with fields:`, fields);
      await graphqlQuery(`
      mutation($id: ID!, $rating: Int!, $fields: Map) {
        performerUpdate(input: { 
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
  var FRAGMENTS, PERFORMER_FRAGMENT, IMAGE_FRAGMENT, pluginConfigCache;
  var init_api_client = __esm({
    "api-client.js"() {
      init_parsers();
      init_math_utils();
      init_state();
      FRAGMENTS = {
        PERFORMER: `id name image_path rating100 details custom_fields birthdate ethnicity country gender height_cm measurements fake_tits scene_count image_count gallery_count tags { name }`,
        IMAGE: `id rating100 paths { thumbnail image }`
      };
      PERFORMER_FRAGMENT = FRAGMENTS.PERFORMER;
      IMAGE_FRAGMENT = FRAGMENTS.IMAGE;
      pluginConfigCache = null;
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
  function enableCardCarousel(container, cards) {
    if (cards.length < 2)
      return;
    let currentIndex = 0;
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let isDragging = false;
    const leftHint = document.createElement("div");
    leftHint.className = "hon-swipe-hint left";
    leftHint.innerHTML = "\u27A1\uFE0F";
    container.appendChild(leftHint);
    const rightHint = document.createElement("div");
    rightHint.className = "hon-swipe-hint right";
    rightHint.innerHTML = "\u2B05\uFE0F";
    container.appendChild(rightHint);
    container.style.touchAction = "pan-y";
    function updateCardPositions() {
      cards.forEach((card, index) => {
        card.classList.remove("active", "inactive");
        if (index === currentIndex) {
          card.classList.add("active");
        } else {
          card.classList.add("inactive");
        }
      });
    }
    function showHint(direction) {
      const hint = direction === "left" ? leftHint : rightHint;
      hint.classList.add("visible");
      setTimeout(() => {
        hint.classList.remove("visible");
      }, 300);
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
      startTime = (/* @__PURE__ */ new Date()).getTime();
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
      if (Math.abs(dx) > Math.abs(dy)) {
        e.preventDefault();
        e.stopPropagation();
        const currentCard = getCurrentCard();
        if (currentCard) {
          currentCard.style.transform = `translateX(${dx}px) rotate(${dx * 0.05}deg)`;
          currentCard.style.opacity = 1 - Math.abs(dx) / (window.innerWidth * 1.5);
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
      const deltaTime = (/* @__PURE__ */ new Date()).getTime() - startTime;
      const currentCard = getCurrentCard();
      if (currentCard) {
        currentCard.classList.remove("swiping");
        currentCard.style.transform = "";
        currentCard.style.opacity = "";
      }
      isDragging = false;
      const threshold = window.innerWidth * 0.15;
      const velocity = Math.abs(dx) / deltaTime;
      if (Math.abs(dx) > threshold || velocity > 0.2) {
        if (dx > 0) {
          prevCard();
        } else {
          nextCard();
        }
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
      // Cleanup function to remove event listeners
      destroy: () => {
        const options = { passive: false };
        container.removeEventListener("touchstart", touchStartListener, options);
        container.removeEventListener("touchmove", touchMoveListener, options);
        container.removeEventListener("touchend", touchEndListener, options);
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

  // ui-badge.js
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
  function isOnSinglePerformerPage() {
    return window.location.pathname.includes("/performers/") && !window.location.pathname.endsWith("/performers");
  }
  function createBattleRankBadge(rank, total, rating, stats = null) {
    const badge = document.createElement("div");
    badge.className = "hon-battle-rank-badge";
    badge.id = "hon-battle-rank-badge";
    const percentile = (total - rank + 1) / total * 100;
    let tierEmoji = "\u{1F525}";
    if (percentile >= 95)
      tierEmoji = "\u{1F451}";
    else if (percentile >= 80)
      tierEmoji = "\u{1F947}";
    else if (percentile >= 60)
      tierEmoji = "\u{1F948}";
    else if (percentile >= 40)
      tierEmoji = "\u{1F949}";
    const tier = getRatingTier(rating);
    const tierColor = getTierColor2(tier);
    let matchStatsHTML = "";
    let winRate = "0.0";
    const hasMatchStats = stats && stats.total_matches > 0;
    if (hasMatchStats) {
      winRate = (stats.wins / (stats.total_matches || 1) * 100).toFixed(1);
      let streakDisplay = "";
      if (stats.current_streak > 0) {
        streakDisplay = `<span class="hon-streak-positive">W${stats.current_streak}</span>`;
      } else if (stats.current_streak < 0) {
        streakDisplay = `<span class="hon-streak-negative">L${Math.abs(stats.current_streak)}</span>`;
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
    badge.innerHTML = `
    <span class="hon-rank-emoji">${tierEmoji}</span>
    <span class="hon-rank-text" style="color: ${tierColor}">Battle Rank #${rank}</span>
    <span class="hon-rank-total">of ${total}</span>
    ${matchStatsHTML}
  `;
    let tooltipText = `Battle Rank #${rank} of ${total} performers (Rating: ${rating}/100)`;
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
        const streakType = stats.current_streak > 0 ? "Winning" : "Losing";
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
      if (ratingEl && !document.getElementById("hon-battle-rank-badge")) {
        const allPerformers = await getAllPerformersSorted();
        const rankInfo = await getPerformerGlobalRank(performerId, allPerformers);
        if (rankInfo) {
          const badge = createBattleRankBadge(
            rankInfo.rank,
            rankInfo.total,
            rankInfo.rating,
            rankInfo.stats
          );
          ratingEl.append(badge);
        }
      }
    } finally {
      window._honBadgeInjectionInProgress = false;
    }
  }
  async function injectBattleRankBadge() {
    if (!isOnSinglePerformerPage())
      return;
    debouncedInjectBattleRankBadge();
  }
  function showPlacementScreen(item, rank, finalRating, battleType, totalItemsCount) {
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
    area.innerHTML = `
    <div class="hon-victory-screen">
      <div class="hon-victory-crown">\u{1F4CD}</div>
      <h2 class="hon-victory-title">PLACED!</h2>
      <div class="hon-victory-scene">
        ${imageContent}
      </div>
      <h3 class="hon-victory-name">${title}</h3>
      <p class="hon-victory-stats">
        Rank <strong>#${rank}</strong> of ${totalItemsCount}<br>
        Rating: <strong>${(finalRating / 10).toFixed(1)}/10.0</strong>
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
    const isMobile2 = window.innerWidth <= 1200;
    if (isMobile2) {
      if (!card.classList.contains("active"))
        return;
    }
    const notification = document.createElement("div");
    notification.className = "hon-tier-change-notification";
    const tierColor = getTierColor2(newTier);
    notification.innerHTML = `Tier Change: ${isUpgrade ? "\u2B06\uFE0F" : "\u2B07\uFE0F"} <span style="color: ${tierColor}">${newTier}</span>`;
    if (isMobile2) {
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
  function handleNavigation() {
    if (lastPath !== window.location.pathname) {
      lastPath = window.location.pathname;
      injectBattleRankBadge();
    }
  }
  function setupNavigationListener() {
    if (attachedListeners.has("navigation")) {
      window.removeEventListener("popstate", handleNavigation);
    }
    let pushState = history.pushState;
    history.pushState = function() {
      pushState.apply(history, arguments);
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
  var attachedListeners, debouncedInjectBattleRankBadge, lastPath;
  var init_ui_badge = __esm({
    "ui-badge.js"() {
      init_state();
      init_api_client();
      init_rating_utils();
      init_battle_engine();
      init_rating_utils();
      attachedListeners = /* @__PURE__ */ new Set();
      debouncedInjectBattleRankBadge = debounce(injectBattleRankBadgeInner, 300);
      lastPath = window.location.pathname;
      setupNavigationListener();
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", injectBattleRankBadge);
      } else {
        injectBattleRankBadge();
      }
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
    if (performer.rating100 === null || performer.rating100 === 1) {
      ratingDisplay = "<span class='hon-selection-rating-value'>Unrated</span>";
      tierClass = "tier-f";
    } else {
      const ratingValue = performer.rating100;
      ratingDisplay = `<span class='hon-selection-rating-value'>${(ratingValue / 10).toFixed(1)}</span>`;
      const tier = getRatingTier(ratingValue);
      const tierColor = getTierColor2(tier);
      tierDisplay = `<span class="hon-selection-tier" style="color: ${tierColor}">${tier}</span> | `;
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
    return `
    <div class="hon-selection-card ${tierClass}" data-performer-id="${performer.id}">
      <div class="hon-selection-image-container">
        ${performer.image_path ? `<img class="hon-selection-image" src="${performer.image_path}" alt="${name}" loading="lazy" />` : `<div class="hon-selection-image hon-no-image">No Image</div>`}
      </div>
      <div class="hon-selection-info">
        <h4 class="hon-selection-name">${name} ${genderIcon}</h4>
        <div class="hon-selection-rating">Rating: ${tierDisplay}${ratingDisplay}</div>
        ${metaItems.join("")}
      </div>
    </div>`;
  }
  async function loadPerformerSelection() {
    const listEl = document.getElementById("hon-performer-list");
    if (!listEl)
      return;
    try {
      const performers = await fetchPerformersForSelection(5);
      listEl.innerHTML = "";
      let cards = [];
      performers.forEach((performer, index) => {
        const cardHtml = createSelectionCard(performer);
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = cardHtml;
        const card = tempDiv.firstElementChild;
        card.style.opacity = "0";
        card.style.transform = "translateY(20px)";
        card.style.transition = "opacity 0.4s ease, transform 0.4s ease";
        setTimeout(() => {
          card.style.opacity = "1";
          card.style.transform = "translateY(0)";
        }, 10 + index * 100);
        card.onclick = () => {
          startGauntletWithPerformer(performer);
        };
        listEl.appendChild(card);
        cards.push(card);
      });
      const isRealMobileDevice = isMobile() && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
      if (isRealMobileDevice && cards.length > 0) {
        listEl.style.display = "block";
        const wrapper = document.createElement("div");
        wrapper.className = "hon-vs-container";
        wrapper.style.position = "relative";
        wrapper.style.width = "100%";
        wrapper.style.overflow = "hidden";
        while (listEl.firstChild) {
          wrapper.appendChild(listEl.firstChild);
        }
        listEl.appendChild(wrapper);
        const carousel = enableCardCarousel(wrapper, cards);
        cards.forEach((card, index) => {
          card.onclick = (e) => {
            if (carousel && carousel.getCurrentIndex() === index) {
              const performerId = card.dataset.performerId;
              const performer = performers.find((p) => p.id == performerId);
              if (performer) {
                startGauntletWithPerformer(performer);
              }
            } else if (carousel) {
              const currentIndex = carousel.getCurrentIndex();
              const direction = index > currentIndex ? 1 : -1;
              const steps = Math.abs(index - currentIndex);
              for (let i = 0; i < steps; i++) {
                if (direction > 0) {
                  carousel.next();
                } else {
                  carousel.prev();
                }
              }
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
    const sel = document.getElementById("hon-performer-selection");
    const comp = document.getElementById("hon-comparison-area");
    const actions = document.querySelector(".hon-actions");
    if (sel)
      sel.style.display = "none";
    if (comp)
      comp.style.display = "";
    if (actions)
      actions.style.display = "";
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
      modal.classList.remove("hon-mode-champion", "hon-mode-swiss");
      modal.classList.add("hon-mode-gauntlet");
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
      modal.classList.remove("hon-mode-gauntlet");
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
    const loserRank = isLeftWinner ? state.currentRanks.right : state.currentRanks.left;
    if (state.battleType === "images") {
      const outcome2 = await handleComparison(winnerId, loserId, winnerRating, loserRating, null, winnerItem, loserItem);
      applyVisualFeedback(winnerCard, loserCard, winnerRating, loserRating, outcome2);
      return;
    }
    if (state.currentMode === "gauntlet") {
      if (state.gauntletFalling && state.gauntletFallingItem) {
        if (winnerId === state.gauntletFallingItem.id) {
          const outcome3 = await handleComparison(
            winnerId,
            // falling item (now winner)
            loserId,
            // the opponent they beat
            winnerRating,
            loserRating,
            null,
            // no rank for placement matches
            winnerItem,
            loserItem,
            false
            // not a draw
          );
          const finalRating = outcome3.newWinnerRating;
          const finalRank = Math.max(1, (loserRank || 1) - 1);
          applyVisualFeedback(winnerCard, loserCard, winnerRating, loserRating, outcome3);
          setTimeout(() => showPlacementScreen(winnerItem, finalRank, finalRating, state.battleType, state.totalItemsCount), 800);
          return;
        } else {
          state.gauntletDefeated.push(winnerId);
          const outcome3 = await handleComparison(
            winnerId,
            // winner (the challenger)
            state.gauntletFallingItem.id,
            // loser (the falling item)
            winnerRating,
            loserRating,
            null,
            // no rank for falling matches
            winnerItem,
            loserItem,
            // loserItem is the falling item
            false
            // not a draw
          );
          applyVisualFeedback(winnerCard, loserCard, winnerRating, loserRating, outcome3);
          return;
        }
      }
      const outcome2 = await handleComparison(winnerId, loserId, winnerRating, loserRating, loserRank, winnerItem, loserItem);
      updateGauntletState(winnerId, winnerItem, loserId, loserItem, outcome2.newWinnerRating);
      applyVisualFeedback(winnerCard, loserCard, winnerRating, loserRating, outcome2);
      return;
    }
    if (state.currentMode === "champion") {
      const outcome2 = await handleComparison(winnerId, loserId, winnerRating, loserRating, loserRank, winnerItem, loserItem);
      updateChampionModeState(winnerId, winnerItem, loserId, outcome2.newWinnerRating);
      applyVisualFeedback(winnerCard, loserCard, winnerRating, loserRating, outcome2);
      setTimeout(() => {
        loadNewPair();
      }, 1500);
      return;
    }
    const outcome = await handleComparison(winnerId, loserId, winnerRating, loserRating, null, winnerItem, loserItem);
    applyVisualFeedback(winnerCard, loserCard, winnerRating, loserRating, outcome);
  }
  function updateGauntletState(winnerId, winnerItem, loserId, loserItem, newWinnerRating) {
    if (state.gauntletChampion?.id === winnerId) {
      state.gauntletDefeated.push(loserId);
      state.gauntletWins++;
      state.gauntletChampion.rating100 = newWinnerRating;
    } else {
      if (!state.gauntletFalling) {
        console.log(`[Ascension] Champion ${loserItem.name} defeated. Entering placement phase.`);
        state.gauntletFalling = true;
        state.gauntletFallingItem = loserItem;
        state.gauntletDefeated = [winnerId];
      } else {
        state.gauntletDefeated.push(winnerId);
      }
    }
  }
  function updateChampionModeState(winnerId, winnerItem, loserId, newWinnerRating) {
    if (state.gauntletChampion?.id === winnerId) {
      state.gauntletDefeated.push(loserId);
      state.gauntletWins++;
      state.gauntletChampion.rating100 = newWinnerRating;
      console.log(`[Champion Mode] Champion ${winnerItem.name} won, streak: ${state.gauntletWins}`);
    } else {
      console.log(`[Champion Mode] New champion: ${winnerItem.name} defeats ${state.gauntletChampion?.name || "Unknown"}`);
      state.gauntletChampion = winnerItem;
      state.gauntletWins = 1;
      if (state.gauntletChampion.id !== loserId) {
        state.gauntletDefeated.push(loserId);
      }
      state.gauntletChampion.rating100 = newWinnerRating;
    }
  }
  async function handleSkip() {
    const left = state.currentPair?.left;
    const right = state.currentPair?.right;
    if (left && right) {
      const pairKey = [left.id, right.id].sort().join("-");
      state.seenPairs.add(pairKey);
      if (state.seenPairs.size > 1e3) {
        const pairsArray = Array.from(state.seenPairs);
        state.seenPairs = new Set(pairsArray.slice(500));
      }
      const leftRating = left.rating100 || 1;
      const rightRating = right.rating100 || 1;
      await handleComparison(
        left.id,
        right.id,
        leftRating,
        rightRating,
        null,
        left,
        right,
        true
        // isDraw
      );
    }
    if (state.currentMode === "gauntlet" && right) {
      state.skippedIds.push(right.id);
      if (state.skippedIds.length > 10) {
        state.skippedIds.shift();
      }
      console.log(`[Ascension] Skipping Gauntlet opponent: ${right.name}`);
    }
    loadNewPair();
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
      const btn = document.getElementById("hon-undo-btn");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "\u21A9";
        btn.style.display = state.matchHistory && state.matchHistory.length > 0 ? "inline-block" : "none";
      }
    }
  }
  function applyVisualFeedback(winnerCard, loserCard, winnerRating, loserRating, outcome) {
    winnerCard.classList.add("hon-winner");
    if (loserCard)
      loserCard.classList.add("hon-loser");
    const winnerBody = winnerCard.querySelector(".hon-scene-body");
    const loserBody = loserCard ? loserCard.querySelector(".hon-scene-body") : null;
    if (winnerBody) {
      const winnerBtn = winnerBody.querySelector(".hon-choose-btn");
      if (winnerBtn) {
        winnerBtn.classList.add("chosen-btn");
        winnerBtn.innerHTML = "\u2705";
      }
    }
    if (loserBody) {
      const loserBtn = loserBody.querySelector(".hon-choose-btn");
      if (loserBtn) {
        loserBtn.classList.add("not-chosen-btn");
        loserBtn.innerHTML = "\u274C";
      }
    }
    showRatingAnimation(winnerCard, winnerRating, outcome.newWinnerRating, outcome.winnerChange, true);
    if (loserCard) {
      showRatingAnimation(loserCard, loserRating, outcome.newLoserRating, outcome.loserChange, false);
    }
    setTimeout(() => {
      winnerCard.classList.add("hon-transition-out");
      if (loserCard)
        loserCard.classList.add("hon-transition-out");
    }, 800);
    setTimeout(() => {
      const isVictoryVisible = document.querySelector(".hon-victory-screen");
      if (!isVictoryVisible) {
        loadNewPair();
      }
    }, 1300);
  }
  var init_match_handler = __esm({
    "match-handler.js"() {
      init_state();
      init_api_client();
      init_ui_manager();
      init_battle_engine();
      init_ui_manager();
    }
  });

  // battle-engine.js
  var battle_engine_exports = {};
  __export(battle_engine_exports, {
    attachBattleListeners: () => attachBattleListeners,
    fetchChampionPairPerformers: () => fetchChampionPairPerformers,
    fetchGauntletPairPerformers: () => fetchGauntletPairPerformers,
    fetchPair: () => fetchPair,
    fetchSwissPairImages: () => fetchSwissPairImages,
    fetchSwissPairPerformers: () => fetchSwissPairPerformers,
    handleMatchmakingLogic: () => handleMatchmakingLogic,
    loadNewPair: () => loadNewPair
  });
  function attachBattleListeners(area) {
    if (area._battleCleanup) {
      area._battleCleanup();
    }
    const cleanupFunctions = [];
    let carouselInstance = null;
    if (isMobile()) {
      const container = area.querySelector(".hon-vs-container");
      if (container) {
        const cards = Array.from(container.querySelectorAll(".hon-scene-card"));
        if (cards.length >= 2) {
          const carousel = enableCardCarousel(container, cards);
          carouselInstance = carousel;
          let clickTimeout;
          cards.forEach((card, index) => {
            const clickHandler = (e) => {
              if (clickTimeout) {
                clearTimeout(clickTimeout);
              }
              clickTimeout = setTimeout(() => {
                clickTimeout = null;
              }, 500);
              e.stopPropagation();
              handleChooseItem(e);
            };
            const sceneBody = card.querySelector(".hon-scene-body");
            if (sceneBody) {
              sceneBody.addEventListener("click", clickHandler);
              cleanupFunctions.push(() => sceneBody.removeEventListener("click", clickHandler));
            }
          });
        }
      }
    } else {
      const sceneBodies = area.querySelectorAll(".hon-scene-body");
      sceneBodies.forEach((body) => {
        const clickHandler = (e) => handleChooseItem(e);
        body.onclick = clickHandler;
        cleanupFunctions.push(() => {
          body.onclick = null;
        });
      });
    }
    if (!isMobile()) {
      const cards = area.querySelectorAll(".hon-scene-card");
      cards.forEach((card) => {
        const video = card.querySelector(".hon-hover-preview");
        if (!video)
          return;
        const mouseEnterHandler = () => video.play().catch(() => {
        });
        const mouseLeaveHandler = () => {
          video.pause();
          video.currentTime = 0;
        };
        card.onmouseenter = mouseEnterHandler;
        card.onmouseleave = mouseLeaveHandler;
        cleanupFunctions.push(() => {
          card.onmouseenter = null;
          card.onmouseleave = null;
        });
      });
    }
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
      tagElement.onclick = clickHandler;
      cleanupFunctions.push(() => {
        tagElement.onclick = null;
      });
    });
    area._battleCleanup = () => {
      if (carouselInstance && typeof carouselInstance.destroy === "function") {
        carouselInstance.destroy();
        carouselInstance = null;
      }
      cleanupFunctions.forEach((cleanup2) => cleanup2());
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
    }
    if (currentMode === "gauntlet") {
      if (battleType === "performers")
        return await fetchGauntletPairPerformers();
      if (battleType === "images")
        return await fetchSwissPairImages();
    }
    if (currentMode === "champion") {
      if (battleType === "performers")
        return await fetchChampionPairPerformers();
      if (battleType === "images")
        return await fetchSwissPairImages();
    }
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
      showPerformerSelection();
      return;
    }
    try {
      const result = await fetchPair();
      if (result.isVictory) {
        area.innerHTML = createVictoryScreen(result.items[0], state.battleType, state.gauntletWins, state.totalItemsCount);
        attachVictoryHandlers(area);
        return;
      }
      if (result.isPlacement) {
        showPlacementScreen(result.items[0], result.placementRank, result.placementRating);
        return;
      }
      const [left, right] = result.items;
      state.currentPair = { left, right };
      state.currentRanks = { left: result.ranks[0], right: result.ranks[1] };
      const container = area.querySelector(".hon-vs-container");
      if (container) {
        container.innerHTML = `
		${renderCard(left, "left", result.ranks[0])}
		${renderCard(right, "right", result.ranks[1])}
	  `;
      } else {
        area.innerHTML = `
		<div class="hon-vs-container">
		  ${renderCard(left, "left", result.ranks[0])}
		  ${renderCard(right, "right", result.ranks[1])}
		</div>
	  `;
      }
      attachBattleListeners(area);
      if (isMobile()) {
        const container2 = area.querySelector(".hon-vs-container");
        if (container2) {
          const cards = container2.querySelectorAll(".hon-scene-card");
          if (cards.length >= 2) {
            cards[0].classList.add("stack-top");
            cards[1].classList.add("stack-bottom");
          }
        }
      }
    } catch (err) {
      area.innerHTML = `<div class="hon-error">Error: ${err.message}</div>`;
    }
  }
  function shouldForceCrossTierMatch() {
    return Math.random() < 0.1;
  }
  function attachVictoryHandlers(area) {
    const btn = area.querySelector("#hon-new-gauntlet");
    if (btn) {
      btn.onclick = () => {
        resetBattleState();
        if (state.currentMode === "gauntlet" && state.battleType === "performers") {
          Promise.resolve().then(() => (init_gauntlet_selection(), gauntlet_selection_exports)).then((m) => m.showPerformerSelection());
        } else {
          loadNewPair();
        }
      };
    }
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
    return {
      items: [image1, image2],
      ranks
    };
  }
  function canBattleByTier(tier1, tier2) {
    const eliteTiers = ["S-Tier", "A-Tier", "B-Tier"];
    if (tier1 === "S-Tier")
      return eliteTiers.includes(tier2);
    if (tier2 === "S-Tier")
      return eliteTiers.includes(tier1);
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
  function getTierFilteredPerformers(allPerformers, focusTier) {
    if (focusTier === "any" || focusTier === "newcomers") {
      return allPerformers;
    }
    return allPerformers.filter((p) => {
      const tier = getRatingTier(p.rating100 || 1);
      return tier === focusTier;
    });
  }
  function updateTierFocus(performers) {
    state.tierRotation.matchCount = (state.tierRotation.matchCount || 0) + 1;
    const matchesUntilChange = 3 + Math.floor(Math.random() * 5);
    if (state.tierRotation.sessionMatches >= matchesUntilChange) {
      let selectedTier = "any";
      let attempts = 0;
      const maxAttempts = 10;
      const tierMap = /* @__PURE__ */ new Map();
      performers.forEach((p) => {
        const tier = getRatingTier(p.rating100 || 1);
        if (!tierMap.has(tier)) {
          tierMap.set(tier, []);
        }
        tierMap.get(tier).push(p);
      });
      while (attempts < maxAttempts) {
        const randomIndex = Math.floor(Math.random() * state.tierRotation.cycle.length);
        const tier = state.tierRotation.cycle[randomIndex];
        console.log(`[Ascension] Attempting tier: ${tier}`);
        if (tier === "any") {
          selectedTier = tier;
          break;
        } else if (tier === "newcomers") {
          const newcomerPerformers = performers.filter((p) => {
            const stats = parsePerformerEloData(p);
            return stats.total_matches < 6;
          });
          console.log(`[Ascension] Newcomers tier: ${newcomerPerformers.length} performers`);
          if (newcomerPerformers.length >= 20) {
            selectedTier = tier;
            console.log(`[Ascension] Selected tier: ${selectedTier}`);
            break;
          } else {
            console.log(`[Ascension] Newcomers tier rejected - not enough performers (${newcomerPerformers.length} < 20)`);
          }
        } else {
          const tierPerformers = tierMap.get(tier) || [];
          console.log(`[Ascension] Tier ${tier}: ${tierPerformers.length} performers`);
          if (tierPerformers.length >= 20) {
            const totalWeight = tierPerformers.reduce((sum, p) => {
              return sum + getRecencyWeight(p);
            }, 0);
            const avgRecencyWeight = tierPerformers.length > 0 ? totalWeight / tierPerformers.length : 0;
            console.log(`[Ascension] Tier ${tier}: ${tierPerformers.length} performers, avg recency weight: ${avgRecencyWeight.toFixed(2)}`);
            if (avgRecencyWeight >= 0.8) {
              selectedTier = tier;
              console.log(`[Ascension] Selected tier: ${selectedTier}`);
              break;
            } else {
              console.log(`[Ascension] Tier ${tier} rejected - avg recency weight ${avgRecencyWeight.toFixed(2)} < 0.80`);
            }
          } else {
            console.log(`[Ascension] Tier ${tier} rejected - not enough performers (${tierPerformers.length} < 20)`);
          }
        }
        attempts++;
      }
      if (attempts >= maxAttempts) {
        selectedTier = "any";
      }
      state.tierRotation.focusTier = selectedTier;
      state.tierRotation.sessionMatches = 0;
      state.tierRotation.lastSeen[selectedTier] = Date.now();
    }
    state.tierRotation.sessionMatches++;
    return state.tierRotation.focusTier || "any";
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
        // Smaller pool if random
        sort: effectiveSort,
        direction: effectiveDirection
      }
    });
    const performers = result.findPerformers.performers || [];
    state.totalItemsCount = totalPerformers;
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
      const tierMap = /* @__PURE__ */ new Map();
      sampledPerformers.forEach((p) => {
        const tier = getRatingTier(p.rating100 || 1);
        if (!tierMap.has(tier))
          tierMap.set(tier, []);
        tierMap.get(tier).push(p);
      });
      let tierFilteredPerformers = sampledPerformers;
      if (targetFocusTier !== "any") {
        tierFilteredPerformers = getTierFilteredPerformers(sampledPerformers, targetFocusTier);
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
          let tierBoost = 1;
          if (targetFocusTier !== "any" && targetFocusTier !== "newcomers") {
            const performerTier = getRatingTier(p.rating100 || 1);
            if (performerTier === targetFocusTier) {
              tierBoost = 2;
            }
          }
          const matchDistributionBoost = getMatchCountDistributionBoost(p, sampledPerformers);
          const sessionMatchPenalty = getSessionMatchPenalty(p.id);
          const finalWeight = baseWeight * lowMatchBoost * tierBoost * matchDistributionBoost * sessionMatchPenalty;
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
          if (targetFocusTier === "any") {
            backupPerformers.push(weightData);
          }
          if (isUnrated || isHighWeight || isUndermatched) {
            if (!isPerformerOnCooldown(weightData.p.id) && !isPerformerRecentlySelected(weightData.p.id)) {
              eligiblePerformers.push(weightData);
            }
          }
        }
      }
      if (targetFocusTier === "any" && eligiblePerformers.length < 2 && backupPerformers.length >= 2) {
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
        console.log(`[Ascension] Not enough eligible performers (${eligiblePerformers.length}) in tier '${targetFocusTier}' after weighting/filtering.`);
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
      const tier1 = getRatingTier(seed.rating);
      if (shouldForceCrossTierMatch()) {
        const crossTierCandidates = eligiblePerformers.filter(
          (item) => item.p.id !== seed.p.id && (item.p.rating100 || 1) >= seed.rating + 20 && canBattleByTier(tier1, getRatingTier(item.p.rating100 || 0)) && !isPerformerOnCooldown(item.p.id) && !isPerformerRecentlySelected(item.p.id)
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
      const validOpponents = eligiblePerformers.filter((item) => {
        if (item.p.id === seed.p.id)
          return false;
        const pointDiff = Math.abs(seed.rating - item.rating);
        if (pointDiff > 15)
          return false;
        if (!canBattleByTier(tier1, getRatingTier(item.rating)))
          return false;
        if (isPerformerOnCooldown(item.p.id) || isPerformerRecentlySelected(item.p.id))
          return false;
        return true;
      });
      if (validOpponents.length > 0) {
        const weights_op = validOpponents.map((opponent) => opponent.weight);
        const opponentItem = weightedRandomSelect(validOpponents, weights_op);
        if (opponentItem) {
          logMatch("RANGE-VALID", seed.p, opponentItem.p, seed.weight, opponentItem.weight, "#2196F3");
          const rank1 = getPerformerRankInList(seed.p, sampledPerformers);
          const rank2 = getPerformerRankInList(opponentItem.p, sampledPerformers);
          return { items: [seed.p, opponentItem.p], ranks: [rank1, rank2] };
        }
      }
      const looseRangeOpponents = eligiblePerformers.filter(
        (item) => item.p.id !== seed.p.id && Math.abs(seed.rating - item.rating) <= 25 && !isPerformerOnCooldown(item.p.id) && !isPerformerRecentlySelected(item.p.id) && canBattleByTier(tier1, getRatingTier(item.p.rating100 || 1))
      );
      if (looseRangeOpponents.length > 0) {
        const looseWeights = looseRangeOpponents.map((opponent) => opponent.weight);
        const opponentItem = weightedRandomSelect(looseRangeOpponents, looseWeights);
        if (opponentItem) {
          logMatch("LOOSE-RANGE", seed.p, opponentItem.p, seed.weight, opponentItem.weight, "#FF9800");
          const rank1 = getPerformerRankInList(seed.p, sampledPerformers);
          const rank2 = getPerformerRankInList(opponentItem.p, sampledPerformers);
          return { items: [seed.p, opponentItem.p], ranks: [rank1, rank2] };
        }
      }
      const fallbackOpponents = eligiblePerformers.filter(
        (item) => item.p.id !== seed.p.id && !isPerformerOnCooldown(item.p.id) && !isPerformerRecentlySelected(item.p.id) && canBattleByTier(tier1, getRatingTier(item.p.rating100 || 1))
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
      console.warn(`[Ascension] Found eligible performers for tier '${targetFocusTier}' but failed to pair them.`);
      return null;
    }
    const initialFocusTier = updateTierFocus(performers);
    const tierColor = initialFocusTier === "newcomers" || initialFocusTier === "any" ? "#00ff00" : getTierColor(initialFocusTier);
    console.log(
      `%c[Ascension] Tier Selection: ${initialFocusTier}`,
      `color: ${tierColor}; font-weight: bold;`
    );
    let pairingResult = await performWeightedSelection(performers, initialFocusTier);
    if (!pairingResult && initialFocusTier !== "any") {
      console.warn(`[Ascension] Failed to create match in tier '${initialFocusTier}'. Attempting fallback to 'any' tier.`);
      pairingResult = await performWeightedSelection(performers, "any");
      if (pairingResult) {
        console.log(`[Ascension] Successfully created match using 'any' tier fallback.`);
      }
    }
    if (!pairingResult) {
      console.warn("[Ascension] Failed to create match even with 'any' tier fallback. Using basic random fallback.");
      return { items: await fetchRandomPerformers(2), ranks: [null, null] };
    }
    return pairingResult;
  }
  function getMatchCountDistributionBoost(performer, allPerformers) {
    const stats = parsePerformerEloData(performer);
    const matches = stats.total_matches || 0;
    const matchCounts = allPerformers.map((p) => {
      const s = parsePerformerEloData(p);
      return s.total_matches || 0;
    }).sort((a, b) => a - b);
    const percentile = matchCounts.filter((m) => m < matches).length / matchCounts.length * 100;
    if (percentile < 10) {
      return 1.5;
    } else if (percentile < 25) {
      return 1.3;
    } else if (percentile < 50) {
      return 1.1;
    } else if (percentile > 90) {
      return 0.7;
    }
    return 1;
  }
  function getSessionMatchPenalty(performerId) {
    if (!state.sessionMatchCounts) {
      state.sessionMatchCounts = {};
    }
    const sessionCount = state.sessionMatchCounts[performerId] || 0;
    if (sessionCount > 2) {
      return 0.1;
    } else if (sessionCount > 1) {
      return 0.3;
    } else if (sessionCount > 0) {
      return 0.6;
    }
    return 1;
  }
  function trackPerformerSelection(performerId) {
    if (!state.sessionMatchCounts) {
      state.sessionMatchCounts = {};
    }
    state.sessionMatchCounts[performerId] = (state.sessionMatchCounts[performerId] || 0) + 1;
  }
  function getPerformerRankInList(performer, allPerformers) {
    if (!performer || performer.rating100 === null || performer.rating100 === 1)
      return null;
    const sorted = allPerformers.filter((p) => p.rating100 !== null && p.rating100 > 1).sort((a, b) => (b.rating100 || 0) - (a.rating100 || 0));
    let low = 0;
    let high = sorted.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (sorted[mid].id === performer.id) {
        return mid + 1;
      } else if ((sorted[mid].rating100 || 0) > (performer.rating100 || 0)) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return null;
  }
  async function fetchGauntletPairPerformers() {
    const gender = state.gauntletChampion?.gender || state.selectedGenders[0];
    const performerFilter = getPerformerFilter(state.cachedUrlFilter, [gender]);
    const result = await graphqlQuery(`query FindPerformersByRating($performer_filter: PerformerFilterType, $filter: FindFilterType) {
    findPerformers(performer_filter: $performer_filter, filter: $filter) { count, performers { ${PERFORMER_FRAGMENT} } }
  }`, { performer_filter: performerFilter, filter: { per_page: -1, sort: "rating", direction: "DESC" } });
    const performers = result.findPerformers.performers || [];
    state.totalItemsCount = performers.length;
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
    if (performers.length < 2)
      return { items: await fetchRandomPerformers(2), ranks: [null, null] };
    if (!state.gauntletChampion) {
      const shuffled = [...performers].sort(() => Math.random() - 0.5);
      return { items: [shuffled[0], shuffled[1]], ranks: [null, null] };
    }
    return handleMatchmakingLogic(performers, "performers");
  }
  function handleMatchmakingLogic(list, type) {
    if (!state.gauntletChampion) {
      console.warn("[Ascension] No champion selected, picking a random starter.");
      const randomStarter = list[Math.floor(Math.random() * list.length)];
      let candidate = list.find((i) => i.id !== randomStarter.id);
      if (state.seenPairs && state.seenPairs.size > 0) {
        const candidates = list.filter(
          (i) => i.id !== randomStarter.id && !hasBeenRecentlyPaired(randomStarter.id, i.id)
        );
        if (candidates.length > 0) {
          candidate = candidates[Math.floor(Math.random() * candidates.length)];
        }
      }
      return {
        items: [randomStarter, candidate || list.find((i) => i.id !== randomStarter.id)],
        ranks: [null, null],
        isVictory: false
      };
    }
    if (state.gauntletFalling && state.gauntletFallingItem) {
      const fallingPerformer = state.gauntletFallingItem;
      const fallingRating = fallingPerformer.rating100 || 1;
      let potentialOpponents2 = list.filter(
        (item) => item.id !== fallingPerformer.id && (item.rating100 || 1) < fallingRating && !state.gauntletDefeated.includes(item.id) && !state.skippedIds.includes(item.id) && !hasBeenRecentlyPaired(fallingPerformer.id, item.id)
      );
      potentialOpponents2.sort((a, b) => (b.rating100 || 1) - (a.rating100 || 1));
      if (potentialOpponents2.length === 0) {
        potentialOpponents2 = list.filter(
          (item) => item.id !== fallingPerformer.id && !hasBeenRecentlyPaired(fallingPerformer.id, item.id)
        );
        if (potentialOpponents2.length === 0) {
          const fallback = list.find((i) => i.id !== fallingPerformer.id);
          return {
            items: [fallingPerformer, fallback],
            ranks: [null, null],
            isVictory: false
          };
        }
      }
      const nextOpponent2 = potentialOpponents2[0];
      const pairKey2 = [fallingPerformer.id, nextOpponent2.id].sort().join("-");
      if (state.seenPairs) {
        state.seenPairs.add(pairKey2);
      }
      const fallingRank = list.findIndex((i) => i.id === fallingPerformer.id) + 1;
      const opponentRank = list.findIndex((i) => i.id === nextOpponent2.id) + 1;
      return {
        items: [fallingPerformer, nextOpponent2],
        ranks: [fallingRank, opponentRank],
        isVictory: false
      };
    }
    const champIdx = list.findIndex((i) => i.id === state.gauntletChampion.id);
    let potentialOpponents = list.filter(
      (item, idx) => idx < champIdx && !state.gauntletDefeated.includes(item.id) && !state.skippedIds.includes(item.id) && // Don't rematch skipped opponents
      !hasBeenRecentlyPaired(state.gauntletChampion.id, item.id)
      // Avoid recent pairs
    );
    if (potentialOpponents.length === 0) {
      if (state.skippedIds.length > 0) {
        state.skippedIds = [];
        return handleMatchmakingLogic(list, type);
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
    const pairKey = [state.gauntletChampion.id, nextOpponent.id].sort().join("-");
    if (state.seenPairs) {
      state.seenPairs.add(pairKey);
    }
    return {
      items: [state.gauntletChampion, nextOpponent],
      ranks: [champIdx + 1, list.indexOf(nextOpponent) + 1],
      isVictory: false
    };
  }
  function hasBeenRecentlyPaired(id1, id2) {
    if (!state.seenPairs)
      return false;
    const pairKey = [id1, id2].sort().join("-");
    return state.seenPairs.has(pairKey);
  }
  var RECENT_PERFORMER_COOLDOWN;
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
      RECENT_PERFORMER_COOLDOWN = 50;
    }
  });

  // ui-stats.js
  var ui_stats_exports = {};
  __export(ui_stats_exports, {
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
  async function preloadStatsModal() {
    if (!cachedPerformers) {
      try {
        cachedPerformers = await fetchAllPerformerStats();
        cachedModalContent = createStatsModalContent(cachedPerformers);
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
    const isCacheValid = cachedModalContent && Date.now() - cacheTimestamp < CACHE_TTL2;
    const shouldUseCache = isCacheValid && !forceRefresh;
    const showLoading = !shouldUseCache;
    statsModal.innerHTML = `
    <div class="hon-modal-backdrop"></div>
    <div class="hon-stats-modal-dialog">
      <button class="hon-modal-close">\u2715</button>
      ${showLoading ? '<div class="hon-stats-loading">Loading stats...</div>' : ""}
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
      if (!cachedPerformers || forceRefresh || !isCacheValid) {
        performersToUse = await fetchAllPerformerStats();
        cachedPerformers = performersToUse;
        cacheTimestamp = Date.now();
        cachedModalContent = createStatsModalContent(performersToUse);
      }
      dialogContainer.innerHTML = `
      <button class="hon-modal-close">\u2715</button>
      ${cachedModalContent}
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
  function createStatsModalContent(performers) {
    if (!performers || performers.length === 0) {
      return '<div class="hon-stats-empty">No performer stats available</div>';
    }
    const processedPerformers = performers.map((p) => {
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
      const ratedPerformers = performers.filter((perf) => {
        if (perf.rating100 !== null && perf.rating100 > 1)
          return true;
        const perfStats = parsePerformerEloData(perf);
        return perfStats.total_matches > 0;
      });
      const higherRatedCount = ratedPerformers.filter((perf) => (perf.rating100 ?? 1) > rawRating).length;
      const rank = higherRatedCount + 1;
      return {
        ...stats,
        rank,
        // NOW USING PROPER RANKING LOGIC
        id: p.id,
        name: p.name || `Performer #${p.id}`,
        rating: displayRating,
        rawRating,
        countryCode: p.country || "",
        gender: p.gender || "",
        weight: currentWeight,
        last_match: stats.last_match || null
      };
    });
    const rankGroupsHTML = generateStatTables(processedPerformers);
    const ratingBuckets = new Array(101).fill(0);
    performers.forEach((p) => {
      const r = p.rating100 ?? 1;
      if (r >= 0 && r <= 100)
        ratingBuckets[r]++;
    });
    return `
    <div class="hon-stats-header">
      <h2>\u{1F4CA} Performer Statistics</h2>
      <div class="hon-stats-tabs">
        <button class="hon-stats-tab active" data-tab="leaderboard">Leaderboard</button>
        <button class="hon-stats-tab" data-tab="distribution">Rating Distribution</button>
      </div>
    </div>
    <div class="hon-stats-content">
      <div class="hon-stats-tab-panel active" data-panel="leaderboard">
        ${rankGroupsHTML}
      </div>
      <div class="hon-stats-tab-panel" data-panel="distribution">
        <div class="hon-bar-graph">
          ${generateBarGroups(ratingBuckets)}
        </div>
      </div>
    </div>
  `;
  }
  function generateStatTables(processedPerformers) {
    const tierGroups = {};
    processedPerformers.forEach((p) => {
      const isUnrated = p.rating === "Unrated";
      const numericRating = isUnrated ? 1 : parseFloat(p.rating) * 10;
      const tier = getRatingTier(numericRating);
      if (!tierGroups[tier]) {
        tierGroups[tier] = [];
      }
      tierGroups[tier].push({ ...p, numericRating });
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
      "All Tier Performers": processedPerformers
    };
    const renamedTierGroups = {};
    Object.keys(tierGroups).forEach((tierName) => {
      renamedTierGroups[`${tierName} Performers`] = tierGroups[tierName];
    });
    const allGroups = { ...allTiersGroup, ...renamedTierGroups };
    const groupHTML = Object.keys(allGroups).map((groupName) => {
      const performersInGroup = allGroups[groupName];
      const isAllTiers = groupName === "All Tier Performers";
      const groupColor = isAllTiers ? "#ffffff" : getTierColor2(groupName.replace(" Performers", ""));
      const rows = performersInGroup.map((p) => {
        const winRate = p.total_matches > 0 ? (p.wins / p.total_matches * 100).toFixed(1) : "0.0";
        const streakDisplay = p.current_streak > 0 ? `<span class="hon-stats-positive">+${p.current_streak}</span>` : p.current_streak < 0 ? `<span class="hon-stats-negative">${p.current_streak}</span>` : "0";
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
        const isUnrated = p.rating === "Unrated";
        const numericRating = isUnrated ? 1 : parseFloat(p.rating) * 10;
        const performerTier = getRatingTier(numericRating);
        const ratingColor = getTierColor2(performerTier);
        return `
        <tr data-rank="${p.rank}" 
            data-rating="${p.rating}" 
            data-raw-rating="${p.rawRating || 1}"
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
          <td class="hon-stats-rating" style="color: ${ratingColor}; font-weight: bold;">
            ${p.rating}
          </td>
          <td>${p.total_matches}</td>
          <td class="hon-stats-positive">${p.wins}</td>
          <td class="hon-stats-negative">${p.losses}</td>
          <td>${p.draws || 0}</td>
          <td>${winRate}%</td>
          <td>${streakDisplay}</td>
          <td class="hon-stats-positive">${formatBestStreakDisplay(p.best_streak)}</td>
          <td class="hon-stats-negative">${p.worst_streak}</td>
          <td class="hon-stats-weight">${weightDisplay}</td>
        </tr>`;
      }).join("");
      return `
      <div class="hon-rank-group">
        <div class="hon-rank-group-header" data-group="${groupName.toLowerCase().replace(/\s+/g, "-")}" role="button">
          <span class="hon-group-toggle">\u25B6</span>
          <span class="hon-rank-group-title" style="color: ${groupColor}; font-weight: bold;">
            ${groupName} (${performersInGroup.length})
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
                <th data-sort="rating">Rating</th>
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
  function generateBarGroups(ratingBuckets) {
    const tiers = [
      { label: "S-Tier", min: 85, max: 100, color: "#eb9834" },
      { label: "A-Tier", min: 70, max: 84, color: "#e014aa" },
      { label: "B-Tier", min: 55, max: 69, color: "#7f1e82" },
      { label: "C-Tier", min: 40, max: 54, color: "#14bbe0" },
      { label: "D-Tier", min: 25, max: 39, color: "#92e014" },
      { label: "F-Tier", min: 0, max: 24, color: "#808080" }
    ];
    const tierStats = tiers.map((tier) => {
      const count = ratingBuckets.slice(tier.min, tier.max + 1).reduce((sum, val) => sum + val, 0);
      return { ...tier, count };
    });
    const nonZeroTiers = tierStats.filter((tier) => tier.count > 0);
    if (nonZeroTiers.length === 0)
      return "";
    const maxCount = Math.max(...nonZeroTiers.map((t) => t.count), 1);
    const minCount = Math.min(...nonZeroTiers.map((t) => t.count));
    return nonZeroTiers.map((tier) => {
      const logMax = Math.log(maxCount + 1);
      const logMin = Math.log(minCount + 1);
      const logCurrent = Math.log(tier.count + 1);
      let percentage;
      if (logMax === logMin) {
        percentage = 100;
      } else {
        percentage = 5 + (logCurrent - logMin) / (logMax - logMin) * 95;
      }
      return `
      <div class="hon-bar-container" title="${tier.label} (${tier.min}-${tier.max}): ${tier.count} performers">
        <div class="hon-bar-label-wrapper">
          <span class="hon-bar-label">${tier.label}</span>
        </div>
        <div class="hon-bar-wrapper">
          <div class="hon-bar animated-bar" 
               data-target-width="${percentage}" 
               data-final-count="${tier.count}"
               data-actual-count="${tier.count}"
               style="background-color: ${tier.color}; width: 0%;">
            <span class="hon-bar-count" style="opacity: 0;">${tier.count}</span>
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
      CACHE_TTL2 = 5 * 60 * 1e3;
      cachedPerformers = null;
      cachedModalContent = null;
      cacheTimestamp = 0;
      weightCountdownInterval = null;
    }
  });

  // ui-sidebar.js
  var ui_sidebar_exports = {};
  __export(ui_sidebar_exports, {
    attachSidebarEventListeners: () => attachSidebarEventListeners,
    createSidebar: () => createSidebar
  });
  function createSidebar() {
    const swissActive = state.currentMode === "swiss" ? "active" : "";
    const gauntletActive = state.currentMode === "gauntlet" ? "active" : "";
    const championActive = state.currentMode === "champion" ? "active" : "";
    const ALL_GENDERS2 = [
      { value: "FEMALE", label: "Female" },
      { value: "MALE", label: "Male" },
      { value: "TRANSGENDER_MALE", label: "Trans Male" },
      { value: "TRANSGENDER_FEMALE", label: "Trans Female" },
      { value: "INTERSEX", label: "Intersex" },
      { value: "NON_BINARY", label: "Non-Binary" }
    ];
    const mobileClass = isMobile() ? "mobile" : "";
    return `
    <div id="hon-sidebar" class="hon-sidebar ${mobileClass}">
      <div class="hon-sidebar-content">
        <!-- Main Performer Matchmaking Section -->
        <div class="hon-sidebar-section">
          <!-- Mode Select Row -->
          <div class="hon-sidebar-row hon-sidebar-expandable" data-target="mode-select-sub">
            <span class="hon-sidebar-row-text">Mode Select</span>
            <span class="hon-sidebar-expand-icon">\u25B6</span>
          </div>
          <div id="mode-select-sub" class="hon-sidebar-expanded-content">
            <div class="hon-sidebar-subrow ${swissActive}" data-mode="swiss">
              <span class="hon-mode-icon">\u{1F94A}</span>
              <span>Head to Head</span>
            </div>
            <div class="hon-sidebar-subrow ${gauntletActive}" data-mode="gauntlet">
              <span class="hon-mode-icon">\u269C\uFE0F</span>
              <span>Placement Mode</span>
            </div>
            <div class="hon-sidebar-subrow ${championActive}" data-mode="champion">
              <span class="hon-mode-icon">\u{1F3C6}</span>
              <span>Champion Mode</span>
            </div>
          </div>

          <!-- Gender Select Row -->
          <div class="hon-sidebar-row hon-sidebar-expandable" data-target="gender-select-sub">
            <span class="hon-sidebar-row-text">Gender Select</span>
            <span class="hon-sidebar-expand-icon">\u25B6</span>
          </div>
          <div id="gender-select-sub" class="hon-sidebar-expanded-content">
            ${ALL_GENDERS2.map((gender) => `
              <div class="hon-sidebar-subrow ${state.selectedGenders.includes(gender.value) ? "active" : ""}" data-gender="${gender.value}">
                <span>${gender.label}</span>
              </div>
            `).join("")}
          </div>

          <!-- View All Stats Row -->
          <div class="hon-sidebar-row" data-action="view-stats">
            <span class="hon-sidebar-row-text">\u{1F4CA} View All Stats</span>
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
          icon.textContent = isExpanded ? "\u25B6" : "\u25BC";
          row.classList.toggle("expanded", !isExpanded);
        }
      });
    });
    const modeRows = container.querySelectorAll(".hon-sidebar-subrow[data-mode]");
    modeRows.forEach((row) => {
      row.addEventListener("click", async (e) => {
        e.stopPropagation();
        const mode = row.dataset.mode;
        state.currentMode = mode;
        modeRows.forEach((r) => r.classList.remove("active"));
        row.classList.add("active");
        const selectionContainer = document.getElementById("hon-performer-selection");
        const comparisonArea = document.getElementById("hon-comparison-area");
        const actionsEl = document.querySelector(".hon-actions");
        const modal = document.getElementById("hon-modal");
        if (modal) {
          modal.classList.remove("hon-mode-champion", "hon-mode-swiss", "hon-mode-gauntlet");
          modal.classList.add(`hon-mode-${mode}`);
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
          const { getPerformerIdFromUrl: getPerformerIdFromUrl2 } = await Promise.resolve().then(() => (init_ui_modal(), ui_modal_exports));
          const urlPerformerId = getPerformerIdFromUrl2();
          if (urlPerformerId) {
            const { fetchPerformerById: fetchPerformerById2 } = await Promise.resolve().then(() => (init_api_client(), api_client_exports));
            state.gauntletChampion = await fetchPerformerById2(urlPerformerId);
          }
          if (state.gauntletChampion) {
            if (selectionContainer)
              selectionContainer.style.display = "none";
            if (comparisonArea)
              comparisonArea.style.display = "";
            if (actionsEl)
              actionsEl.style.display = "";
            const { loadNewPair: loadNewPair2 } = await Promise.resolve().then(() => (init_battle_engine(), battle_engine_exports));
            loadNewPair2();
          } else {
            if (selectionContainer)
              selectionContainer.style.display = "block";
            if (comparisonArea)
              comparisonArea.style.display = "none";
            if (actionsEl)
              actionsEl.style.display = "none";
            Promise.resolve().then(() => (init_gauntlet_selection(), gauntlet_selection_exports)).then((m) => m.loadPerformerSelection());
          }
        }
      });
    });
    const genderRows = container.querySelectorAll(".hon-sidebar-subrow[data-gender]");
    genderRows.forEach((row) => {
      row.addEventListener("click", async (e) => {
        e.stopPropagation();
        const gender = row.dataset.gender;
        if (state.selectedGenders.includes(gender)) {
          state.selectedGenders = state.selectedGenders.filter((g) => g !== gender);
          row.classList.remove("active");
        } else {
          state.selectedGenders.push(gender);
          row.classList.add("active");
        }
        try {
          localStorage.setItem("hotornot_selected_genders", JSON.stringify(state.selectedGenders));
        } catch (err) {
          console.warn("[HotOrNot] Could not save gender selection to localStorage:", err);
        }
        genderRows.forEach((r) => {
          const genderValue = r.dataset.gender;
          r.classList.toggle("active", state.selectedGenders.includes(genderValue));
        });
        const { loadNewPair: loadNewPair2 } = await Promise.resolve().then(() => (init_battle_engine(), battle_engine_exports));
        loadNewPair2();
      });
    });
    const actionRows = container.querySelectorAll(".hon-sidebar-row[data-action]");
    actionRows.forEach((row) => {
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = row.dataset.action;
        if (action === "view-stats") {
          Promise.resolve().then(() => (init_ui_stats(), ui_stats_exports)).then((m) => m.openStatsModal());
        }
      });
    });
  }
  var init_ui_sidebar = __esm({
    "ui-sidebar.js"() {
      init_state();
      init_ui_dashboard();
      init_ui_swipe();
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
    const entry = {
      id: Date.now() + Math.random(),
      timestamp: /* @__PURE__ */ new Date(),
      level,
      message: readableMessage,
      formattedMessage: readableMessage,
      tierInfo
      // Add tier info for color coding
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
      <span class="hon-event-log-title">\u{1F3AE} Battle Log</span>
      <div class="hon-event-log-controls">
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
    const clearBtn = document.getElementById("hon-event-log-clear");
    const toggleBtn = document.getElementById("hon-event-log-toggle");
    const closeBtn = document.getElementById("hon-event-log-close");
    const resizeHandle = document.getElementById("hon-event-log-resize");
    const horizontalResizeHandle = document.getElementById("hon-event-log-resize-horizontal");
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
  function updateEventLogDisplay() {
    const content = document.getElementById("hon-event-log-content");
    if (!content)
      return;
    content.innerHTML = eventLogEntries.map((entry) => {
      const timeString = entry.timestamp.toLocaleTimeString();
      const levelClass = `hon-log-${entry.level}`;
      let messageText = entry.formattedMessage;
      messageText = messageText.replace(/%c/g, "").trim();
      let messageHtml = messageText;
      messageHtml = messageHtml.replace(
        /\[Ascension\]/g,
        '[<span style="color: #1cb4d6; font-weight: bold;">Ascension</span>]'
      );
      messageHtml = messageHtml.replace(/\bWIN\b/g, '<span style="color: #4CAF50; font-weight: bold;">WIN</span>').replace(/\bLOSS\b/g, '<span style="color: #F44336; font-weight: bold;">LOSS</span>').replace(/\bDRAW\b/g, '<span style="color: #9E9E9E; font-weight: bold;">DRAW</span>');
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
      if (entry.tierInfo) {
        let tierColor = "#00ff00";
        if (entry.tierInfo !== "newcomers" && entry.tierInfo !== "any") {
          const tierColors = {
            "S-Tier": "#eb9834",
            // Gold
            "A-Tier": "#e014aa",
            // Pink
            "B-Tier": "#7f1e82",
            // Purple
            "C-Tier": "#14bbe0",
            // Light blue
            "D-Tier": "#92e014",
            // Lime Green
            "F-Tier": "#808080"
            // Gray
          };
          tierColor = tierColors[entry.tierInfo] || tierColor;
        }
        const tierRegex = new RegExp(`(Tier Selection:)\\s+(${entry.tierInfo})`);
        messageHtml = messageHtml.replace(
          tierRegex,
          `$1 <span style="color: ${tierColor}; font-weight: bold;">$2</span>`
        );
      }
      return `
      <div class="hon-log-entry ${levelClass}">
        <span class="hon-log-timestamp">${timeString}</span>
        <span class="hon-log-message">${messageHtml}</span>
      </div>
    `;
    }).join("");
    content.scrollTop = content.scrollHeight;
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
      eventLogEntries = [];
      MAX_LOG_ENTRIES = 100;
      originalConsoleLog = console.log;
      originalConsoleWarn = console.warn;
      originalConsoleError = console.error;
      layoutObserver = null;
      EVENT_LOG_STORAGE_KEY = "hon-event-log-state";
    }
  });

  // ui-modal.js
  var ui_modal_exports = {};
  __export(ui_modal_exports, {
    addFloatingButton: () => addFloatingButton,
    cleanupButtonObserver: () => cleanupButtonObserver,
    closeRankingModal: () => closeRankingModal,
    getPerformerIdFromUrl: () => getPerformerIdFromUrl,
    isOnSinglePerformerPage: () => isOnSinglePerformerPage2,
    openRankingModal: () => openRankingModal,
    shouldShowButton: () => shouldShowButton
  });
  function getPerformerIdFromUrl() {
    const match = window.location.pathname.match(/^\/performers\/(\d+)(?:\/|$)/);
    return match ? match[1] : null;
  }
  function isOnSinglePerformerPage2() {
    return getPerformerIdFromUrl() !== null;
  }
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
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "hon-modal";
        modal.className = "hon-modal";
        const { createSidebar: createSidebar2, attachSidebarEventListeners: attachSidebarEventListeners2 } = await Promise.resolve().then(() => (init_ui_sidebar(), ui_sidebar_exports));
        const { isMobile: isMobile2 } = await Promise.resolve().then(() => (init_ui_swipe(), ui_swipe_exports));
        const mobileCheck = isMobile2();
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
        loadNewPair2();
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
        state.currentMode = "swiss";
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

  // ui-dashboard.js
  var ui_dashboard_exports = {};
  __export(ui_dashboard_exports, {
    attachEventListeners: () => attachEventListeners,
    createMainUI: () => createMainUI,
    handleGenderToggle: () => handleGenderToggle,
    setMode: () => setMode
  });
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
    </div>`;
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
      const updateSkipButtonVisibility = () => {
        const isSkippableMode = state.currentMode === "swiss" || state.currentMode === "gauntlet" || state.currentMode === "champion";
        skipBtn.style.display = isSkippableMode ? "inline-block" : "none";
      };
      updateSkipButtonVisibility();
      const handler = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isSkippableMode = state.currentMode === "swiss" || state.currentMode === "gauntlet" || state.currentMode === "champion";
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
          const newMode = btn.dataset.mode;
          state.currentMode = newMode;
          modeButtons.forEach((button) => {
            button.classList.toggle("active", button.dataset.mode === newMode);
          });
          const { getPerformerIdFromUrl: getPerformerIdFromUrl2 } = await Promise.resolve().then(() => (init_ui_modal(), ui_modal_exports));
          const urlPerformerId = getPerformerIdFromUrl2();
          state.gauntletChampion = null;
          state.gauntletWins = 0;
          state.gauntletDefeated = [];
          state.gauntletFalling = false;
          const modal = document.getElementById("hon-modal");
          if (modal) {
            modal.classList.remove("hon-mode-champion", "hon-mode-swiss", "hon-mode-gauntlet");
            modal.classList.add(`hon-mode-${newMode}`);
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
            if (urlPerformerId) {
              const { fetchPerformerById: fetchPerformerById2 } = await Promise.resolve().then(() => (init_api_client(), api_client_exports));
              state.gauntletChampion = await fetchPerformerById2(urlPerformerId);
            }
            if (state.gauntletChampion) {
              if (selectionContainer)
                selectionContainer.style.display = "none";
              if (comparisonArea)
                comparisonArea.style.display = "";
              if (actionsEl)
                actionsEl.style.display = "";
              loadNewPair();
            } else {
              if (selectionContainer)
                selectionContainer.style.display = "block";
              if (comparisonArea)
                comparisonArea.style.display = "none";
              if (actionsEl)
                actionsEl.style.display = "none";
              Promise.resolve().then(() => (init_gauntlet_selection(), gauntlet_selection_exports)).then((m) => m.loadPerformerSelection());
            }
          }
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
    const selEl = document.getElementById("hon-performer-selection");
    const compEl = document.getElementById("hon-comparison-area");
    if (selEl)
      selEl.style.display = "none";
    if (compEl)
      compEl.style.display = "none";
    if (mode === "gauntlet") {
      Promise.resolve().then(() => (init_gauntlet_selection(), gauntlet_selection_exports)).then((m) => m.showPerformerSelection());
    }
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
    renderCard: () => renderCard,
    setMode: () => setMode,
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
  var observer = null;
  function main() {
    if (window.honLoaded) {
      cleanup();
    }
    window.honLoaded = true;
    console.log("[Ascension] Global Scope Initialized");
    if (!observer) {
      observer = new MutationObserver(() => {
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
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    if (isOnSinglePerformerPage()) {
      setTimeout(() => injectBattleRankBadge(), 1e3);
    }
  }
  function cleanup() {
    if (observer) {
      observer.disconnect();
      observer = null;
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
