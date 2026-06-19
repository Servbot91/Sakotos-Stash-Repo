
(function() {
  'use strict';

  /* ==========================
     ADVANCED DEBUG LOGGER
  ========================== */

  const DEBUG = true; // Enable detailed logging
  let rollCount = 0;

  const DiceRLogger = {
    styles: {
      base: "font-weight:600;padding:2px 6px;border-radius:4px;",
      info: "background:#1e90ff;color:white;",
      success: "background:#28a745;color:white;",
      warn: "background:#ff9800;color:black;",
      error: "background:#e53935;color:white;",
      event: "background:#6f42c1;color:white;"
    },

    log(type, label, data = null) {
      if (!DEBUG) return;

      const time = new Date().toISOString().split("T")[1].replace("Z", "");
      const style = this.styles[type] || this.styles.info;

      console.groupCollapsed(
        `%c DiceR %c ${type.toUpperCase()} %c ${label} %c ${time}`,
        this.styles.base + "background:#222;color:#fff;",
        this.styles.base + style,
        "font-weight:600;",
        "color:#999;font-size:11px;"
      );

      if (data !== null) console.log(data);

      console.groupEnd();
    },

    time(label) {
      if (!DEBUG) return;
      console.time(`⏱ DiceR ${label}`);
    },

    timeEnd(label) {
      if (!DEBUG) return;
      console.timeEnd(`⏱ DiceR ${label}`);
    }
  };

  DiceRLogger.log("success", "Plugin initialized");

  /* ==========================
     CONSTANTS AND CONFIGURATION
  ========================== */

  const CONFIG = {
    CACHE_REFRESH_INTERVAL: 5 * 60 * 1000, // 5 minutes
    RECENT_SEEN_LIMIT: 1000, // High-priority recent seen items
    HISTORY_SEEN_LIMIT: 10000, // Lower-priority historical seen items
    MAX_RETRY_ATTEMPTS: 5,
    PAGE_SIZE: 1000,
    REQUEST_TIMEOUT: 6000, // 6 seconds timeout
    MAX_TIMEOUT_RETRIES: 3 // Number of retry attempts for timeouts
  };

  /* ==========================
     TIMEOUT HANDLING UTILITIES
  ========================== */

  // Wrapper for fetch with timeout
  async function fetchWithTimeout(url, options = {}) {
    const { timeout = CONFIG.REQUEST_TIMEOUT } = options;
    
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      if (controller.signal.aborted) {
        throw new Error('REQUEST_TIMEOUT');
      }
      throw error;
    }
  }

  // Retry wrapper for functions that might timeout
  async function retryWithTimeout(asyncFunction, maxRetries = CONFIG.MAX_TIMEOUT_RETRIES) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await asyncFunction();
      } catch (error) {
        if (error.message === 'REQUEST_TIMEOUT' && attempt < maxRetries) {
          DiceRLogger.log("warn", `Request timeout on attempt ${attempt}, retrying...`);
          // Add a small delay between retries
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
        throw error;
      }
    }
  }

  /* ==========================
     HELPERS
  ========================== */

  function getIdFromPath(regex) {
    const m = window.location.pathname.match(regex);
    DiceRLogger.log("info", "getIdFromPath", { regex: regex.toString(), result: m ? m[1] : null });
    return m ? m[1] : null;
  }

  function getPlural(entity) {
    const pluralMap = {
      'Gallery': 'Galleries',
      'Tag': 'Tags',
      'Image': 'Images',
      'Scene': 'Scenes',
      'Performer': 'Performers',
      'Studio': 'Studios',
      'Group': 'Groups'
    };
    const plural = pluralMap[entity] || entity + "s";
    DiceRLogger.log("info", "getPlural", { entity, plural });
    return plural;
  }

  function getCacheKey(entity, internalFilter) {
    const filterKey = internalFilter ? JSON.stringify(internalFilter) : 'global';
    // Limit cache key length to prevent storage issues
    const cacheKey = `randomData_${entity}_${filterKey.substring(0, 100)}`;
    DiceRLogger.log("info", "getCacheKey", { entity, internalFilter: !!internalFilter, cacheKey });
    return cacheKey;
  }

  // Optimized shuffle using Fisher-Yates algorithm
  function shuffleArray(array) {
    DiceRLogger.log("info", "shuffleArray", { arrayLength: array.length });
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /* ==========================
     TIERED SEEN TRACKING
  ========================== */

  class TieredSeenTracker {
    constructor(cacheKey) {
      this.cacheKey = cacheKey;
      this.recentKey = `${cacheKey}_recent`;
      this.historyKey = `${cacheKey}_history`;
      this.recentSeen = new Set();
      this.historySeen = new Set();
      this.loadSeenData();
      DiceRLogger.log("success", "TieredSeenTracker initialized", { 
        cacheKey, 
        recentCount: this.recentSeen.size, 
        historyCount: this.historySeen.size 
      });
    }

    loadSeenData() {
      try {
        const recentStored = localStorage.getItem(this.recentKey);
        const historyStored = localStorage.getItem(this.historyKey);
        
        this.recentSeen = new Set(recentStored ? JSON.parse(recentStored) : []);
        this.historySeen = new Set(historyStored ? JSON.parse(historyStored) : []);
        
        DiceRLogger.log("success", "Seen data loaded", { 
          recentLoaded: this.recentSeen.size, 
          historyLoaded: this.historySeen.size 
        });
      } catch (e) {
        DiceRLogger.log("warn", "Failed to load seen data, using empty sets", e);
        this.recentSeen = new Set();
        this.historySeen = new Set();
      }
    }

    saveSeenData() {
      try {
        // Maintain size limits for both tiers
        const beforeRecent = this.recentSeen.size;
        const beforeHistory = this.historySeen.size;
        
        this.maintainSizeLimits();
        
        localStorage.setItem(this.recentKey, JSON.stringify(Array.from(this.recentSeen)));
        localStorage.setItem(this.historyKey, JSON.stringify(Array.from(this.historySeen)));
        
        DiceRLogger.log("success", "Seen data saved", { 
          recentCount: this.recentSeen.size,
          historyCount: this.historySeen.size,
          recentChanged: beforeRecent !== this.recentSeen.size,
          historyChanged: beforeHistory !== this.historySeen.size
        });
      } catch (e) {
        DiceRLogger.log("warn", "Failed to save seen data", e);
      }
    }

    maintainSizeLimits() {
      const initialRecent = this.recentSeen.size;
      const initialHistory = this.historySeen.size;
      
      // Manage recent seen (high priority)
      if (this.recentSeen.size > CONFIG.RECENT_SEEN_LIMIT) {
        const recentArray = Array.from(this.recentSeen);
        // Move oldest items to history
        const itemsToDemote = recentArray.slice(0, recentArray.length - CONFIG.RECENT_SEEN_LIMIT + 200);
        itemsToDemote.forEach(id => {
          this.historySeen.add(id);
          this.recentSeen.delete(id);
        });
        DiceRLogger.log("warn", "Recent seen limit exceeded, demoted items to history", { 
          demotedCount: itemsToDemote.length 
        });
      }

      // Manage history seen (lower priority)
      if (this.historySeen.size > CONFIG.HISTORY_SEEN_LIMIT) {
        const historyArray = Array.from(this.historySeen);
        // Remove oldest items
        const excess = historyArray.length - CONFIG.HISTORY_SEEN_LIMIT;
        if (excess > 0) {
          historyArray.slice(0, excess).forEach(id => this.historySeen.delete(id));
          DiceRLogger.log("warn", "History seen limit exceeded, removed oldest items", { 
            removedCount: excess 
          });
        }
      }
      
      if (initialRecent !== this.recentSeen.size || initialHistory !== this.historySeen.size) {
        DiceRLogger.log("info", "Size limits maintained", {
          recentBefore: initialRecent,
          recentAfter: this.recentSeen.size,
          historyBefore: initialHistory,
          historyAfter: this.historySeen.size
        });
      }
    }

    addSeen(id) {
      // Add to recent seen (highest priority)
      const wasNew = !this.recentSeen.has(id);
      this.recentSeen.add(id);
      
      DiceRLogger.log("success", "Item marked as seen", { 
        id, 
        isNew: wasNew,
        recentCount: this.recentSeen.size,
        historyCount: this.historySeen.size
      });
      
      // Save immediately to ensure persistence, especially before navigation
      // The save logic includes maintainSizeLimits and actual localStorage write
      this.saveSeenData();
    }

    hasSeen(id) {
      // Check recent first (higher priority), then history
      const seenInRecent = this.recentSeen.has(id);
      const seenInHistory = this.historySeen.has(id);
      const isSeen = seenInRecent || seenInHistory;
      
      if (isSeen) {
        DiceRLogger.log("info", "Item previously seen", { 
          id, 
          inRecent: seenInRecent, 
          inHistory: seenInHistory 
        });
      }
      
      return isSeen;
    }

    getSeenCount() {
      const totalCount = this.recentSeen.size + this.historySeen.size;
      DiceRLogger.log("info", "Current seen count", { 
        recent: this.recentSeen.size, 
        history: this.historySeen.size, 
        total: totalCount 
      });
      return totalCount;
    }

    clear() {
      const clearedCount = this.recentSeen.size + this.historySeen.size;
      this.recentSeen.clear();
      this.historySeen.clear();
      this.saveSeenData();
      DiceRLogger.log("warn", "Seen tracking cleared", { clearedItems: clearedCount });
    }
  }

  /* ==========================
     CACHED DATA MANAGER
  ========================== */

  class CachedDataManager {
    constructor(cacheKey) {
      this.cacheKey = cacheKey;
      this.metadataKey = `${cacheKey}_meta`;
      this.metadata = {
        totalCount: 0,
        lastUpdated: 0,
        version: 1
      };
      this.loadMetadata();
      DiceRLogger.log("success", "CachedDataManager initialized", { cacheKey });
    }

    loadMetadata() {
      try {
        const stored = localStorage.getItem(this.metadataKey);
        if (stored) {
          this.metadata = JSON.parse(stored);
          DiceRLogger.log("success", "Metadata loaded", this.metadata);
        }
      } catch (e) {
        DiceRLogger.log("warn", "Failed to load metadata, using defaults", e);
        this.metadata = {
          totalCount: 0,
          lastUpdated: 0,
          version: 1
        };
      }
    }

    saveMetadata() {
      try {
        localStorage.setItem(this.metadataKey, JSON.stringify(this.metadata));
        DiceRLogger.log("success", "Metadata saved", this.metadata);
      } catch (e) {
        DiceRLogger.log("warn", "Failed to save metadata", e);
      }
    }

    needsRefresh() {
      const needsRefresh = Date.now() - this.metadata.lastUpdated > CONFIG.CACHE_REFRESH_INTERVAL;
      DiceRLogger.log("info", "Cache refresh check", { 
        needsRefresh, 
        lastUpdated: this.metadata.lastUpdated, 
        currentTime: Date.now(),
        interval: CONFIG.CACHE_REFRESH_INTERVAL
      });
      return needsRefresh;
    }

    updateTotalCount(count) {
      const oldCount = this.metadata.totalCount;
      this.metadata.totalCount = count;
      this.metadata.lastUpdated = Date.now();
      this.saveMetadata();
      DiceRLogger.log("success", "Total count updated", { 
        oldCount, 
        newCount: count, 
        updated: this.metadata.lastUpdated 
      });
    }

    getTotalCount() {
      DiceRLogger.log("info", "Retrieved total count", { count: this.metadata.totalCount });
      return this.metadata.totalCount;
    }
  }

  /* ==========================
     HYBRID RANDOM SYSTEM
  ========================== */

  async function randomGlobal(entity, idField, redirectPrefix, internalFilter) {
    rollCount++;
    DiceRLogger.log("event", `🎲 Roll #${rollCount}`, { entity, internalFilter });

    const cacheKey = getCacheKey(entity, internalFilter);
	const shouldUseSampling = (entity === "Image" || entity === "Scene" || entity === "Gallery" || entity === "Performer") && !internalFilter;

    if (shouldUseSampling) {
      DiceRLogger.log("info", "Using sampling approach for large collection");
      return await randomWithSamplingAndTracking(entity, idField, redirectPrefix, internalFilter, cacheKey);
    }

    DiceRLogger.log("info", "Using full cache approach for smaller collection");
    return await randomWithFullCache(entity, idField, redirectPrefix, internalFilter, cacheKey);
  }

  // Optimized: Hybrid approach for large collections with seen/unseen tracking
async function randomWithSamplingAndTracking(entity, idField, redirectPrefix, internalFilter, cacheKey) {
  const realEntityPlural = getPlural(entity);
  const seenTracker = new TieredSeenTracker(cacheKey);
  const dataManager = new CachedDataManager(cacheKey);

  // Always fetch and update total count to ensure it's fresh
  try {
    const count = await retryWithTimeout(() => getTotalCount(entity, internalFilter));
    if (count !== null) {
      dataManager.updateTotalCount(count);
    } else {
      DiceRLogger.log("warn", "Failed to refresh count, using cached value");
    }
  } catch (error) {
    DiceRLogger.log("error", "Failed to refresh count due to timeout", error);
    // Continue with cached value
  }

  // Try to find an item that hasn't been seen
  let attempts = 0;
  let selectedItem = null;
  let selectedId = null;

  DiceRLogger.log("info", "Starting selection attempts", { maxAttempts: CONFIG.MAX_RETRY_ATTEMPTS });

  while (attempts < CONFIG.MAX_RETRY_ATTEMPTS && !selectedItem) {
    attempts++;
    DiceRLogger.log("info", `Selection attempt #${attempts}`);

    try {
      const itemResult = await retryWithTimeout(() => getRandomItemBySampling(entity, idField, internalFilter));

      if (itemResult && itemResult.item && itemResult.id) {
        // Check if we've seen this item before
        if (!seenTracker.hasSeen(itemResult.id)) {
          selectedItem = itemResult.item;
          selectedId = itemResult.id;
          DiceRLogger.log("success", "Found unseen item", {
            id: selectedId,
            attemptsUsed: attempts
          });
          break;
        } else {
          DiceRLogger.log("info", "Skipping already seen item", {
            id: itemResult.id,
            attempts
          });
        }
      } else {
        DiceRLogger.log("warn", "Failed to get item from sampling", { attempts });
      }
    } catch (error) {
      if (error.message === 'REQUEST_TIMEOUT') {
        DiceRLogger.log("warn", "Timeout during sampling attempt", { attempts });
      } else {
        throw error;
      }
    }
  }

  // If we couldn't find an unseen item, either reshuffle or pick one anyway
  if (!selectedItem) {
    DiceRLogger.log("warn", "All items may have been seen, allowing repeats");

    // Clear seen tracking to allow repeats if most items have been seen
    const totalCount = dataManager.getTotalCount();
    const seenCount = seenTracker.getSeenCount();

    if (seenCount > (totalCount || 10000) * 0.9) {
      DiceRLogger.log("warn", "Resetting seen tracking - most items seen", {
        seenCount,
        totalCount,
        threshold: (totalCount || 10000) * 0.9
      });
      seenTracker.clear();
    }

    try {
      const sampleResult = await retryWithTimeout(() => getRandomItemBySampling(entity, idField, internalFilter));
      if (sampleResult && sampleResult.item) {
        selectedItem = sampleResult.item;
        selectedId = sampleResult.id;
        DiceRLogger.log("success", "Selected item with repeats allowed", { selectedId });
      }
    } catch (error) {
      if (error.message !== 'REQUEST_TIMEOUT') {
        throw error;
      }
    }
  }

  if (selectedItem && selectedId) {
    // Mark as seen
    seenTracker.addSeen(selectedId);

    DiceRLogger.log("success", "Selected random item", {
      itemId: selectedId,
      seenCount: seenTracker.getSeenCount(),
      totalEstimated: dataManager.getTotalCount()
    });

    window.location.href = `${redirectPrefix}${selectedId}`;
  } else {
    DiceRLogger.log("error", "Failed to select item after max attempts");
    alert("Unable to select random item.");
  }
}

  // Helper function to get random item via optimized sampling
  async function getRandomItemBySampling(entity, idField, internalFilter) {
    const realEntityPlural = getPlural(entity);
    
    try {
      DiceRLogger.log("info", "Getting random item via sampling", { entity, idField });
      
      // Get total count
      const totalCount = await getTotalCount(entity, internalFilter);
      if (totalCount === 0) {
        DiceRLogger.log("warn", "Total count is zero", { entity });
        return null;
      }

      DiceRLogger.log("info", "Total count retrieved", { totalCount });

      // Generate random page and offset
      const totalPages = Math.ceil(totalCount / CONFIG.PAGE_SIZE);
      const randomPage = Math.floor(Math.random() * totalPages);
      const itemsInLastPage = totalCount % CONFIG.PAGE_SIZE || CONFIG.PAGE_SIZE;
      const maxOffset = (randomPage === totalPages - 1) ? itemsInLastPage : CONFIG.PAGE_SIZE;
      const randomOffsetInPage = Math.floor(Math.random() * maxOffset);

      DiceRLogger.log("info", "Sampling parameters", { 
        totalPages, 
        randomPage, 
        itemsInLastPage, 
        maxOffset, 
        randomOffsetInPage 
      });

      // Add random sort to prevent chronological ordering
      const sortOptions = ['created_at', 'updated_at', 'name', 'path', 'date'];
      const randomSort = sortOptions[Math.floor(Math.random() * sortOptions.length)];
      const sortDirection = Math.random() > 0.5 ? 'ASC' : 'DESC';

      DiceRLogger.log("info", "Random sort applied", { randomSort, sortDirection });

      // Fetch the specific page
      let filterArg = "";
      let filterVar = "";
      let variables = {
        filter: { 
          per_page: CONFIG.PAGE_SIZE,
          page: randomPage + 1,
          sort: randomSort,
          direction: sortDirection
        }
      };

      if (internalFilter) {
        filterArg = `, $internal_filter: ${entity}FilterType`;
        filterVar = `, ${entity.toLowerCase()}_filter: $internal_filter`;
        variables.internal_filter = internalFilter;
        DiceRLogger.log("info", "Applied internal filter", { internalFilter });
      }

      const pageQuery = `
        query Find${realEntityPlural}($filter: FindFilterType${filterArg}) {
          find${realEntityPlural}(filter: $filter${filterVar}) {
            ${idField} { id }
          }
        }
      `;

      DiceRLogger.log("info", "Executing GraphQL sampling query", { 
        query: pageQuery.substring(0, 100) + "...",
        variables 
      });

      const response = await fetchWithTimeout('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: pageQuery, variables })
      });

      const data = await response.json();
      
      if (data.errors) {
        DiceRLogger.log("error", "GraphQL errors in sampling", data.errors);
        return null;
      }

      let items = data.data[`find${realEntityPlural}`][idField];
      if (!items || items.length === 0) {
        DiceRLogger.log("warn", "No items returned from sampling query", { 
          page: randomPage + 1,
          entity 
        });
        return null;
      }

      DiceRLogger.log("success", "Sampling query successful", { 
        itemCount: items.length,
        page: randomPage + 1 
      });

      // Select random item from the page
      const randomIndex = randomOffsetInPage < items.length ? randomOffsetInPage : Math.floor(Math.random() * items.length);
      const selectedItem = items[randomIndex];

      DiceRLogger.log("success", "Random item selected from page", { 
        index: randomIndex, 
        id: selectedItem.id 
      });

      return {
        item: selectedItem,
        id: selectedItem.id
      };
    } catch (error) {
      DiceRLogger.log("error", "Sampling failed", error);
      throw error;
    }
  }

  // Optimized cache-based approach for smaller collections
  async function randomWithFullCache(entity, idField, redirectPrefix, internalFilter, cacheKey) {
    const realEntityPlural = getPlural(entity);
    const cacheDataKey = `${cacheKey}_ids`;

    let filterArg = "";
    let filterVar = "";
    let variables = {
      filter: { per_page: -1 }
    };

    if (internalFilter) {
      filterArg = `, $internal_filter: ${entity}FilterType`;
      filterVar = `, ${entity.toLowerCase()}_filter: $internal_filter`;
      variables.internal_filter = internalFilter;
    }

    const query = `
      query Find${realEntityPlural}($filter: FindFilterType${filterArg}) {
        find${realEntityPlural}(filter: $filter${filterVar}) {
          ${idField} { id }
        }
      }
    `;

    DiceRLogger.log("info", "Running full cache GraphQL query", { entity });
    DiceRLogger.time("GraphQL Request");

    try {
      const response = await fetchWithTimeout('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
      });

      const data = await response.json();
      DiceRLogger.timeEnd("GraphQL Request");

      if (data.errors) {
        DiceRLogger.log("error", "GraphQL errors", data.errors);
        alert("Error: " + JSON.stringify(data.errors));
        return;
      }

      let items = data.data[`find${realEntityPlural}`][idField];
      if (!items || items.length === 0) {
        DiceRLogger.log("warn", "No results found");
        alert("No results found.");
        return;
      }

      const currentIds = items.map(i => i.id);
      DiceRLogger.log("success", "Fetched IDs", { count: currentIds.length });

      // Load cached data
      let stored = getCachedData(cacheDataKey);
      
      if (!stored) {
        DiceRLogger.log("warn", "Cache created (first run)");
        stored = {
          allIds: currentIds,
          remaining: shuffleArray([...currentIds])
        };
        setCachedData(cacheDataKey, stored);
        DiceRLogger.log("success", "New cache initialized", { 
          totalItems: stored.allIds.length,
          remainingItems: stored.remaining.length 
        });
      } else {
        // Incremental update logic
        const oldAll = new Set(stored.allIds);
        const currentSet = new Set(currentIds);

        const added = currentIds.filter(id => !oldAll.has(id));
        const removed = stored.allIds.filter(id => !currentSet.has(id));

        if (added.length > 0 || removed.length > 0) {
          DiceRLogger.log("warn", "Cache updated (incremental)", {
            added: added.length,
            removed: removed.length
          });

          // Remove deleted items from remaining
          stored.remaining = stored.remaining.filter(id => currentSet.has(id));
          
          // Add new items and shuffle them in
          if (added.length > 0) {
            const shuffledAdded = shuffleArray([...added]);
            stored.remaining.push(...shuffledAdded);
            DiceRLogger.log("info", "Added new items to remaining", { 
              count: added.length 
            });
          }
          
          stored.allIds = currentIds;
          setCachedData(cacheDataKey, stored);
        }
        
        DiceRLogger.log("info", "Cache status", {
          totalItems: stored.allIds.length,
          remainingItems: stored.remaining.length
        });
      }
      
      if (stored.remaining.length === 0) {
        DiceRLogger.log("warn", "Cache exhausted — reshuffling");
        stored.remaining = shuffleArray([...stored.allIds]);
        setCachedData(cacheDataKey, stored);
        DiceRLogger.log("success", "Cache reshuffled", { 
          newItemCount: stored.remaining.length 
        });
      }

      if (stored.remaining.length > 0) {
        const nextId = stored.remaining.pop();
        setCachedData(cacheDataKey, stored);

        DiceRLogger.log("success", "Redirecting", {
          nextId,
          remaining: stored.remaining.length
        });

        window.location.href = `${redirectPrefix}${nextId}`;
      } else {
        DiceRLogger.log("error", "No items available to select");
        alert("No items available to select.");
      }
    } catch (error) {
      DiceRLogger.log("error", "Cache-based selection failed", error);
      if (error.message === 'REQUEST_TIMEOUT') {
        alert("Request timed out. Please try again.");
      } else {
        alert("Selection failed: " + error.message);
      }
    }
  }

  /* ==========================
     UTILITY FUNCTIONS
  ========================== */

  async function getTotalCount(entity, internalFilter) {
    const realEntityPlural = getPlural(entity);
    
    let countFilterArg = "";
    let countFilterVar = "";
    let countVariables = {};
    
    if (internalFilter) {
      countFilterArg = `, $internal_filter: ${entity}FilterType`;
      countFilterVar = `, ${entity.toLowerCase()}_filter: $internal_filter`;
      countVariables.internal_filter = internalFilter;
    }

    const countQuery = `
      query Count${realEntityPlural}($filter: FindFilterType${countFilterArg}) {
        find${realEntityPlural}(filter: $filter${countFilterVar}) {
          count
        }
      }
    `;

    try {
      DiceRLogger.log("info", "Fetching total count", { entity });
      
      const response = await fetchWithTimeout('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: countQuery, 
          variables: { filter: {}, ...countVariables } 
        })
      });
      
      const data = await response.json();
      
      if (data.errors) {
        DiceRLogger.log("error", "Count query errors", data.errors);
        return null;
      }
      
      const count = data.data[`find${realEntityPlural}`].count;
      DiceRLogger.log("success", "Total count retrieved", { entity, count });
      return count;
    } catch (error) {
      DiceRLogger.log("error", "Failed to get count", error);
      throw error;
    }
  }

  function getCachedData(key) {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        DiceRLogger.log("info", "Cached data retrieved", { key, dataSize: stored.length });
        return parsed;
      }
      return null;
    } catch (e) {
      DiceRLogger.log("warn", "Failed to parse cached data", { key, error: e.message });
      return null;
    }
  }

  function setCachedData(key, data) {
    try {
      const dataString = JSON.stringify(data);
      localStorage.setItem(key, dataString);
      DiceRLogger.log("success", "Data cached", { 
        key, 
        dataSize: dataString.length 
      });
    } catch (e) {
      DiceRLogger.log("warn", "Failed to cache data", { key, error: e.message });
    }
  }

  /* ==========================
     BUTTON HANDLER
  ========================== */

	async function randomButtonHandler() {
	  const pathname = window.location.pathname.replace(/\/$/, ''); // Remove trailing slash
	  const searchParams = new URLSearchParams(window.location.search);
	  DiceRLogger.log("event", "Button clicked", { pathname, searchParams: window.location.search });

	  // Handle main galleries list page (with or without filters)
	  if (pathname === '/galleries') {
		DiceRLogger.log("info", "Handling galleries page");
		const filterParam = searchParams.get('c');
		if (filterParam) {
		  try {
			const internalFilter = convertUrlFilterToInternalFilter(filterParam);
			DiceRLogger.log("info", "Using filter for galleries", { filterParam });
			return randomGlobal('Gallery', 'galleries', '/galleries/', internalFilter);
		  } catch (e) {
			DiceRLogger.log("error", "Failed to convert filters", e);
			return randomGlobal('Gallery', 'galleries', '/galleries/');
		  }
		}
		return randomGlobal('Gallery', 'galleries', '/galleries/');
	  }

	  // Handle specific gallery page - should roll to another gallery
	  let galleryId = getIdFromPath(/^\/galleries\/(\d+)/);
	  if (galleryId) {
		DiceRLogger.log("info", "Handling specific gallery page", { galleryId });
		const filterParam = searchParams.get('c');
		if (filterParam) {
		  try {
			const internalFilter = convertUrlFilterToInternalFilter(filterParam);
			return randomGlobal('Gallery', 'galleries', '/galleries/', internalFilter);
		  } catch (e) {
			DiceRLogger.log("error", "Failed to convert filters", e);
			return randomGlobal('Gallery', 'galleries', '/galleries/');
		  }
		}
		return randomGlobal('Gallery', 'galleries', '/galleries/');
	  }

	  // Handle specific performer page - should roll to another performer
	  let performerPageId = getIdFromPath(/^\/performers\/(\d+)/);
	  if (performerPageId) {
		DiceRLogger.log("info", "Handling specific performer page", { performerPageId });
		// Always roll to another performer, never content from this performer
		return randomGlobal('Performer', 'performers', '/performers/');
	  }

	  // Handle specific studio page - should roll to another studio
	  // This regex matches /studios/{id} even if there are more path segments
	  let studioMatch = pathname.match(/^\/studios\/(\d+)/);
	  if (studioMatch) {
		let studioId = studioMatch[1];
		DiceRLogger.log("info", "Handling specific studio page", { studioId });
		return randomGlobal('Studio', 'studios', '/studios/');
	  }

	  // Handle specific tag page - should roll to another tag
	  // This regex matches /tags/{id} even if there are more path segments
	  let tagMatch = pathname.match(/^\/tags\/(\d+)/);
	  if (tagMatch) {
		let tagId = tagMatch[1];
		DiceRLogger.log("info", "Handling specific tag page", { tagId });
		return randomGlobal('Tag', 'tags', '/tags/');
	  }

	  // Rest of your existing conditions...
	  if (pathname === '/scenes' || pathname === '/' || pathname === '' ||
		  pathname === '/stats' || pathname === '/settings' ||
		  pathname === '/scenes/markers' || /^\/scenes\/\d+$/.test(pathname)) {
		DiceRLogger.log("info", "Handling scenes page");
		return randomGlobal('Scene', 'scenes', '/scenes/');
	  }

	  if (pathname === '/images' || /^\/images\/\d+$/.test(pathname)) {
		DiceRLogger.log("info", "Handling images page");
		return randomGlobal('Image', 'images', '/images/');
	  }

	  if (pathname === '/performers') {
		DiceRLogger.log("info", "Handling performers page");
		return randomGlobal('Performer', 'performers', '/performers/');
	  }

	  if (pathname === '/studios') {
		DiceRLogger.log("info", "Handling studios page");
		return randomGlobal('Studio', 'studios', '/studios/');
	  }

	  if (pathname === '/tags') {
		DiceRLogger.log("info", "Handling tags page");
		return randomGlobal('Tag', 'tags', '/tags/');
	  }

	  if (pathname === '/groups') {
		DiceRLogger.log("info", "Handling groups page");
		return randomGlobal('Group', 'groups', '/groups/');
	  }

	  // Handle images within a specific gallery (from gallery image view)
	  let galleryImageId = getIdFromPath(/^\/galleries\/(\d+)\/images/);
	  if (galleryImageId) {
		DiceRLogger.log("info", "Handling gallery images", { galleryImageId });
		return randomGlobal('Image', 'images', '/images/', {
		  galleries: { value: [galleryImageId], modifier: "INCLUDES_ALL" }
		});
	  }

	  let studioSceneId = getIdFromPath(/^\/studios\/(\d+)\/scenes/);
	  if (studioSceneId) {
		DiceRLogger.log("info", "Handling studio scenes", { studioSceneId });
		return randomGlobal('Scene', 'scenes', '/scenes/', {
		  studios: { value: [studioSceneId], modifier: "INCLUDES_ALL" }
		});
	  }

	  let groupId = getIdFromPath(/^\/groups\/(\d+)\/scenes/);
	  if (groupId) {
		DiceRLogger.log("info", "Handling group scenes", { groupId });
		return randomGlobal('Scene', 'scenes', '/scenes/', {
		  groups: { value: [groupId], modifier: "INCLUDES_ALL" }
		});
	  }

	  let tagSceneId = getIdFromPath(/^\/tags\/(\d+)\/scenes/);
	  if (tagSceneId) {
		DiceRLogger.log("info", "Handling tag scenes", { tagSceneId });
		return randomGlobal('Scene', 'scenes', '/scenes/', {
		  tags: { value: [tagSceneId], modifier: "INCLUDES_ALL" }
		});
	  }

	  DiceRLogger.log("error", "Unsupported path", { pathname });
	  alert('Not supported');
	}

  // Convert URL filter format to internal GraphQL filter format
  function convertUrlFilterToInternalFilter(filterParam) {
    try {
      DiceRLogger.log("info", "Converting URL filter", { filterParam });
      const decoded = decodeURIComponent(filterParam);
      
      const excludedMatch = decoded.match(/"excluded":$$$(.*?)$$$/);
      if (excludedMatch && excludedMatch[1]) {
        const tagIds = [];
        const excludedStr = excludedMatch[1];
        const tagMatches = excludedStr.match(/"id":"([^"]+)"/g);
        if (tagMatches) {
          tagMatches.forEach(match => {
            const idMatch = match.match(/"id":"([^"]+)"/);
            if (idMatch && idMatch[1]) {
              tagIds.push(idMatch[1]);
            }
          });
        }
        
        if (tagIds.length > 0) {
          const result = {
            tags: {
              value: tagIds,
              modifier: "EXCLUDE"
            }
          };
          DiceRLogger.log("success", "Converted filter with exclusions", { result });
          return result;
        }
      }
      
      const result = {};
      DiceRLogger.log("info", "Converted filter (no exclusions)", { result });
      return result;
    } catch (e) {
      DiceRLogger.log("error", "Failed to convert filter", { filterParam, error: e.message });
      return {};
    }
  }

  /* ==========================
     BUTTON INJECTION
  ========================== */

  const popstateHandler = () => {
    DiceRLogger.log("info", "Popstate detected");
    setTimeout(addRandomButton, 1200);
  };

  const hashchangeHandler = () => {
    DiceRLogger.log("info", "Hashchange detected");
    setTimeout(addRandomButton, 1200);
  };

  // Cleanup function for event listeners
  function cleanupEventListeners() {
    window.removeEventListener('popstate', popstateHandler);
    window.removeEventListener('hashchange', hashchangeHandler);
  }

  function addRandomButton() {
    if (document.querySelector('.random-btn')) {
      DiceRLogger.log("info", "Random button already exists");
      return;
    }

    const navContainer = document.querySelector('.navbar-buttons.flex-row.ml-auto.order-xl-2.navbar-nav');
    if (!navContainer) {
      DiceRLogger.log("warn", "Navigation container not found");
      return;
    }

    const container = document.createElement('div');
    container.className = 'mr-2';
    container.innerHTML = `
      <a href="javascript:void(0)">
        <button type="button" class="btn btn-primary random-btn">🎲Roll</button>
      </a>
    `;

    const button = container.querySelector('button');
    button.addEventListener('click', async function(e) {
      DiceRLogger.log("event", "Random button clicked");
      
      const originalText = button.textContent;
      const originalClasses = button.className;
      
      // Visual feedback states
      button.textContent = '🎲Rolling...';
      button.className = 'btn btn-warning random-btn'; // Change to yellow
      button.disabled = true; // Prevent multiple clicks
      
      try {
        // Call the main handler with timeout retry
        await retryWithTimeout(() => randomButtonHandler.call(this, e));
        
        // Keep the visual feedback for a moment so user sees it
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        // Restore button on error
        button.textContent = originalText;
        button.className = originalClasses;
        button.disabled = false;
        
        // Handle timeout specifically
        if (error.message === 'REQUEST_TIMEOUT') {
          DiceRLogger.log("error", "Request timed out after all retries");
          alert('Request timed out. Please try again.');
        } else {
          DiceRLogger.log("error", "Button handler error", error);
        }
      }
    });

    navContainer.appendChild(container);
    DiceRLogger.log("success", "Random button added");
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector('.navbar-buttons.flex-row.ml-auto.order-xl-2.navbar-nav')) {
      addRandomButton();
      observer.disconnect();
      DiceRLogger.log("event", "Observer disconnected");
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Add a timeout to disconnect observer if not found after reasonable time
  setTimeout(() => {
    if (observer && typeof observer.disconnect === 'function') {
      observer.disconnect();
      DiceRLogger.log("event", "Observer disconnected via timeout");
    }
  }, 10000); // Disconnect after 10 seconds

  window.addEventListener('popstate', popstateHandler);
  window.addEventListener('hashchange', hashchangeHandler);

  window.addEventListener('beforeunload', () => {
    cleanupEventListeners();
    if (observer) {
      observer.disconnect();
    }
    DiceRLogger.log("event", "Event listeners cleaned up");
  });

})();

