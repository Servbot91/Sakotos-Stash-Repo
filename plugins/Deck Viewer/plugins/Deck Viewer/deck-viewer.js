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

  // context.js
  function getStoredMode() {
    return localStorage.getItem("imageDeckMode");
  }
  function parseStashFilterString(str) {
    if (!str) return null;
    try {
      let result = "";
      let inString = false;
      let stringChar = null;
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const prev = str[i - 1];
        if (inString) {
          result += char;
          if (char === stringChar && prev !== "\\") {
            inString = false;
            stringChar = null;
          }
        } else {
          if (char === '"' || char === "'") {
            inString = true;
            stringChar = char;
            result += char;
          } else if (char === "(") {
            result += "{";
          } else if (char === ")") {
            result += "}";
          } else {
            result += char;
          }
        }
      }
      return JSON.parse(result);
    } catch (e) {
      console.warn("[Image Deck] Could not parse Stash filter string:", e);
      return null;
    }
  }
  function unwrapIntValue(raw) {
    if (raw === null || raw === void 0) return void 0;
    if (Array.isArray(raw)) {
      for (const v of raw) {
        const unwrapped = unwrapIntValue(v);
        if (unwrapped !== void 0 && unwrapped !== null) return unwrapped;
      }
      return void 0;
    }
    if (typeof raw === "object") {
      if (raw.value !== void 0) return unwrapIntValue(raw.value);
      if (raw.id !== void 0) return unwrapIntValue(raw.id);
      return void 0;
    }
    return typeof raw === "string" ? parseInt(raw, 10) : raw;
  }
  function normalizeIntCriterion(criterion) {
    if (criterion !== null && typeof criterion === "object" && !Array.isArray(criterion)) {
      const result = { ...criterion };
      if (result.value !== void 0) {
        result.value = unwrapIntValue(result.value);
      }
      if (result.value2 !== void 0 && result.value2 !== null) {
        result.value2 = unwrapIntValue(result.value2);
      }
      if (!result.modifier) result.modifier = "EQUALS";
      return result;
    }
    const value = unwrapIntValue(criterion);
    if (value === void 0 || value === null) return void 0;
    return { value, modifier: "EQUALS" };
  }
  function coerceIntCriterion(raw) {
    if (raw === null || raw === void 0) return void 0;
    if (!Array.isArray(raw) && typeof raw === "object" && (raw.value !== void 0 || raw.value2 !== void 0 || raw.modifier !== void 0)) {
      return normalizeIntCriterion(raw);
    }
    const value = unwrapIntValue(raw);
    if (value === void 0 || value === null) return void 0;
    return { value, modifier: "EQUALS" };
  }
  function coerceMultiCriterion(raw) {
    if (!raw || typeof raw !== "object") return void 0;
    if (raw.value && typeof raw.value === "object" && !Array.isArray(raw.value) && (raw.value.items !== void 0 || raw.value.excluded !== void 0)) {
      const items2 = raw.value.items || [];
      const excluded2 = raw.value.excluded || [];
      const depth2 = raw.value.depth;
      const modifier2 = raw.modifier || "INCLUDES";
      const result2 = {
        value: items2.map((v) => v?.id || v).filter(Boolean),
        modifier: modifier2
      };
      if (excluded2.length > 0) {
        result2.excludes = excluded2.map((v) => v?.id || v).filter(Boolean);
      }
      if (depth2 !== void 0 && depth2 !== null && MODIFIERS_THAT_SUPPORT_DEPTH.includes(modifier2)) {
        result2.depth = depth2;
      }
      return result2;
    }
    if ((raw.value !== void 0 || raw.excludes !== void 0) && raw.items === void 0) {
      const result2 = { ...raw };
      if (!result2.modifier) result2.modifier = "INCLUDES";
      if (result2.depth !== void 0 && !MODIFIERS_THAT_SUPPORT_DEPTH.includes(result2.modifier)) {
        delete result2.depth;
      }
      return result2;
    }
    if (Array.isArray(raw)) {
      return {
        value: raw.map((v) => v?.id || v).filter(Boolean),
        modifier: "INCLUDES"
      };
    }
    const items = raw.items || [];
    const excluded = raw.excluded || [];
    const depth = raw.depth;
    const modifier = raw.modifier || "INCLUDES";
    const result = {
      value: items.map((v) => v?.id || v).filter(Boolean),
      modifier
    };
    if (excluded.length > 0) {
      result.excludes = excluded.map((v) => v?.id || v).filter(Boolean);
    }
    if (depth !== void 0 && depth !== null && MODIFIERS_THAT_SUPPORT_DEPTH.includes(modifier)) {
      result.depth = depth;
    }
    return result;
  }
  function mapCriterionToGraphQL(criterion) {
    if (!criterion || typeof criterion !== "object") return null;
    if (criterion.type === "AND" || criterion.type === "OR" || criterion.type === "NOT") {
      const children = Array.isArray(criterion.value) ? criterion.value : [];
      const mapped = children.map(mapCriterionToGraphQL).filter(Boolean);
      if (mapped.length === 0) return null;
      return { [criterion.type]: mapped.length === 1 ? mapped[0] : mapped };
    }
    const type = criterion.type;
    const modifier = criterion.modifier;
    const value = criterion.value;
    switch (type) {
      case "tags":
      case "performer_tags":
      case "studio_tags":
      case "child_tags":
      case "parent_tags":
      case "performers":
      case "galleries":
      case "scenes":
      case "movies":
      case "groups":
      case "studios":
        return { [type]: coerceMultiCriterion({ ...value, modifier: modifier || value?.modifier }) };
      case "id":
      case "rating100":
      case "o_counter":
      case "file_count":
      case "image_count":
      case "performer_count":
      case "tag_count":
      case "performer_age":
      case "height":
      case "width":
        return {
          [type]: coerceIntCriterion({
            value: value?.value !== void 0 ? value.value : value,
            modifier: modifier || "EQUALS",
            ...value?.value2 !== void 0 ? { value2: value.value2 } : {}
          })
        };
      case "date":
      case "created_at":
      case "updated_at":
        return {
          [type]: {
            value: value?.value || "",
            modifier: modifier || "EQUALS",
            ...value?.value2 ? { value2: value.value2 } : {}
          }
        };
      case "title":
      case "details":
      case "path":
      case "url":
      case "photographer":
      case "code":
      case "checksum":
        return {
          [type]: {
            value: value?.value || value || "",
            modifier: modifier || "EQUALS"
          }
        };
      case "organized":
      case "performer_favorite":
      case "has_chapters":
      case "is_zip":
        return { [type]: value?.value !== void 0 ? value.value : value };
      case "resolution":
      case "orientation":
        return {
          [type]: {
            value: value?.value || "",
            modifier: modifier || "EQUALS"
          }
        };
      default:
        console.warn("[Image Deck] Unsupported Stash criterion type:", type);
        return null;
    }
  }
  function parseUrlFilters(urlParams) {
    const filter = {};
    const sortBy = urlParams.get("sortby");
    const sortDir = urlParams.get("sortdir");
    if (sortBy) filter.sortBy = sortBy;
    if (sortDir) filter.sortDir = sortDir;
    const page = urlParams.get("p") || urlParams.get("page");
    if (page) {
      const parsed = parseInt(page, 10);
      if (!isNaN(parsed) && parsed > 0) filter.page = parsed;
    }
    const perPage = urlParams.get("perPage");
    if (perPage) {
      const parsed = parseInt(perPage, 10);
      if (!isNaN(parsed) && parsed > 0) filter.perPage = parsed;
    }
    const cFilter = urlParams.get("c");
    if (cFilter) {
      const parsed = parseStashFilterString(cFilter);
      if (parsed) {
        const graphqlFilter = mapCriterionToGraphQL(parsed);
        if (graphqlFilter) {
          Object.assign(filter, graphqlFilter);
        }
      }
    }
    const parseIds = (key) => {
      const raw = urlParams.get(key);
      if (!raw) return null;
      const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
      return ids.length ? { value: ids, modifier: "INCLUDES" } : null;
    };
    const tags = parseIds("tags");
    if (tags) filter.tags = tags;
    const performers = parseIds("performers");
    if (performers) filter.performers = performers;
    const studios = parseIds("studios");
    if (studios) filter.studios = studios;
    const rating = urlParams.get("rating");
    if (rating) {
      const r = parseInt(rating, 10);
      if (!isNaN(r)) {
        filter.rating100 = { value: r * 10, modifier: "GREATER_THAN" };
      }
    }
    return filter;
  }
  function setDefaultSort(filter, mode, overrideSortBy = null, overrideSortDir = null) {
    const defaults = {
      images: { sortBy: "created_at", sortDir: "desc" },
      galleries: { sortBy: "created_at", sortDir: "desc" }
    };
    const def = overrideSortBy ? { sortBy: overrideSortBy, sortDir: overrideSortDir || "desc" } : defaults[mode] || defaults.images;
    if (!filter.sortBy) filter.sortBy = def.sortBy;
    if (!filter.sortDir) filter.sortDir = def.sortDir;
  }
  function mergeSessionFilters(context) {
    const stored = sessionStorage.getItem("galleryTagFilter");
    if (!stored) return context;
    try {
      const {
        includedTags = [],
        excludedTags = [],
        includedPerformers = [],
        excludedPerformers = []
      } = JSON.parse(stored);
      if (!context.filter) context.filter = {};
      const tagIds = [...context.filter.tags?.value || [], ...includedTags];
      if (tagIds.length || excludedTags.length) {
        context.filter.tags = coerceMultiCriterion({
          value: { items: tagIds.map((id) => ({ id })), excluded: excludedTags.map((id) => ({ id })) },
          modifier: context.filter.tags?.modifier || "INCLUDES"
        });
      }
      const performerIds = [...context.filter.performers?.value || [], ...includedPerformers];
      if (performerIds.length || excludedPerformers.length) {
        context.filter.performers = coerceMultiCriterion({
          value: { items: performerIds.map((id) => ({ id })), excluded: excludedPerformers.map((id) => ({ id })) },
          modifier: context.filter.performers?.modifier || "INCLUDES"
        });
      }
    } catch (e) {
      console.error("[Image Deck] Error merging session filters:", e);
    }
    return context;
  }
  function detectContext() {
    const path = window.location.pathname;
    const search = window.location.search;
    const urlParams = new URLSearchParams(search);
    const storedMode = getStoredMode();
    const isImageMode = storedMode === "image";
    const hash = window.location.hash;
    const baseFilter = parseUrlFilters(urlParams);
    let context = { filter: baseFilter, hash };
    if (path === "/") {
      context.type = isImageMode ? "images" : "galleries";
      context.isGeneralListing = isImageMode;
      context.isGalleryListing = !isImageMode;
      setDefaultSort(context.filter, context.type);
      return mergeSessionFilters(context);
    }
    const singleGalleryMatch = path.match(/^\/galleries\/(\d+)/);
    if (singleGalleryMatch) {
      context.type = "galleries";
      context.id = singleGalleryMatch[1];
      context.galleryId = singleGalleryMatch[1];
      context.isSingleGallery = true;
      setDefaultSort(context.filter, "images", "title", "asc");
      return mergeSessionFilters(context);
    }
    if (path.startsWith("/galleries")) {
      context.type = "galleries";
      context.id = "galleries";
      context.isGalleryListing = true;
      setDefaultSort(context.filter, "galleries");
      return mergeSessionFilters(context);
    }
    if (path.startsWith("/images")) {
      context.type = "images";
      context.id = "images";
      context.isGeneralListing = !search;
      context.isFilteredView = !!search;
      setDefaultSort(context.filter, "images");
      return mergeSessionFilters(context);
    }
    const performerMatch = path.match(/^\/performers\/(\d+)(?:\/(galleries|images))?/);
    if (performerMatch) {
      const [, performerId, viewType] = performerMatch;
      let type = "galleries";
      if (viewType === "images" || isImageMode && !viewType) {
        type = "images";
      } else if (viewType === "galleries") {
        type = "galleries";
      }
      context.type = type;
      context.id = performerId;
      context.performerId = performerId;
      context.isPerformerContext = true;
      if (!context.filter.performers) {
        context.filter.performers = coerceMultiCriterion({
          value: { items: [], excluded: [] },
          modifier: "INCLUDES"
        });
      }
      if (!context.filter.performers.value.includes(performerId)) {
        context.filter.performers.value.push(performerId);
      }
      setDefaultSort(context.filter, type);
      return mergeSessionFilters(context);
    }
    context.type = isImageMode ? "images" : "galleries";
    context.isGeneralListing = true;
    setDefaultSort(context.filter, context.type);
    return mergeSessionFilters(context);
  }
  function getSafeSort(sortBy, type, fallback) {
    if (!sortBy) return fallback;
    const allowed = VALID_SORTS[type] || VALID_SORTS.images;
    if (allowed.has(sortBy)) return sortBy;
    console.warn(`[Image Deck] "${sortBy}" is not a valid sort for ${type}; falling back to ${fallback}`);
    return fallback;
  }
  function buildStashFilter(context) {
    const { filter = {}, galleryId, performerId, isSingleGallery } = context;
    const activeFilter = {};
    const controlFields = ["page", "perPage", "sortBy", "sortDir", "q", "hash"];
    Object.keys(filter || {}).forEach((field) => {
      if (controlFields.includes(field)) return;
      if (!VALID_FILTER_FIELDS.includes(field)) {
        console.warn("[Image Deck] Skipping unsupported filter field:", field);
        return;
      }
      let value = filter[field];
      if (INT_CRITERION_FIELDS.includes(field)) {
        const coerced = coerceIntCriterion(value);
        if (coerced !== void 0) value = coerced;
      } else if (MULTI_CRITERION_FIELDS.includes(field)) {
        const coerced = coerceMultiCriterion(value);
        if (coerced !== void 0) value = coerced;
      }
      activeFilter[field] = value;
    });
    if (!activeFilter.performers && performerId) {
      activeFilter.performers = coerceMultiCriterion({
        value: { items: [performerId] },
        modifier: "INCLUDES"
      });
    }
    if (isSingleGallery && galleryId && !activeFilter.galleries) {
      activeFilter.galleries = coerceMultiCriterion({
        value: { items: [galleryId] },
        modifier: "INCLUDES"
      });
    }
    return activeFilter;
  }
  async function fetchContextImages(context, page = 1, perPage = 50) {
    const { type, filter = {}, isSingleGallery } = context;
    const isFetchingGalleries = type === "galleries" && !isSingleGallery;
    const isFetchingImages = !isFetchingGalleries;
    const query = isFetchingGalleries ? `query FindGalleries($filter: FindFilterType!, $gallery_filter: GalleryFilterType) {
            findGalleries(filter: $filter, gallery_filter: $gallery_filter) {
                count
                galleries {
                    id
                    title
                    image_count
                    cover { paths { thumbnail image } }
                    performers { id name }
                    tags { id name }
                    date
                    rating100
                    organized
                }
            }
        }` : `query FindImages($filter: FindFilterType!, $image_filter: ImageFilterType) {
            findImages(filter: $filter, image_filter: $image_filter) {
                count
                images {
                    id
                    title
                    paths { thumbnail image }
                    performers { id name }
                    tags { id name }
                    date
                    rating100
                    organized
                }
            }
        }`;
    const activeFilter = buildStashFilter(context);
    console.log("[Image Deck] built activeFilter:", JSON.stringify(activeFilter));
    const fallbackSort = isSingleGallery ? "title" : "created_at";
    const queryType = isFetchingGalleries ? "galleries" : "images";
    const safeSort = getSafeSort(filter.sortBy, queryType, fallbackSort);
    const variables = {
      filter: {
        per_page: perPage,
        page,
        sort: safeSort,
        direction: (filter.sortDir || (isSingleGallery ? "asc" : "desc")).toUpperCase(),
        ...filter.q ? { q: filter.q } : {}
      }
    };
    if (isFetchingGalleries) {
      variables.gallery_filter = activeFilter;
    } else {
      variables.image_filter = activeFilter;
    }
    try {
      const response = await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables })
      });
      const data = await response.json();
      if (data.errors) {
        console.error("[Image Deck] GraphQL errors:", data.errors);
        throw new Error(data.errors[0].message);
      }
      let totalCount = 0;
      let normalizedImages = [];
      if (isFetchingGalleries) {
        const result = data?.data?.findGalleries;
        totalCount = result?.count || 0;
        normalizedImages = (result?.galleries || []).map((gallery) => ({
          id: gallery.id,
          title: gallery.title,
          image_count: gallery.image_count,
          performers: gallery.performers || [],
          tags: gallery.tags || [],
          date: gallery.date,
          rating100: gallery.rating100,
          organized: gallery.organized,
          isGallery: true,
          type: "gallery",
          paths: { image: gallery.cover?.paths?.image || gallery.cover?.paths?.thumbnail || "" },
          url: `/galleries/${gallery.id}`
        }));
      } else {
        const result = data?.data?.findImages;
        totalCount = result?.count || 0;
        normalizedImages = (result?.images || []).map((img) => ({
          id: img.id,
          title: img.title,
          performers: img.performers || [],
          tags: img.tags || [],
          date: img.date,
          rating100: img.rating100,
          organized: img.organized,
          paths: img.paths,
          isGallery: false,
          type: "image"
        }));
      }
      const totalPages2 = perPage > 0 ? Math.ceil(totalCount / perPage) : 1;
      return {
        images: normalizedImages,
        totalCount,
        totalPages: totalPages2,
        currentPage: page,
        hasNextPage: page < totalPages2
      };
    } catch (error) {
      console.error("[Image Deck] fetchContextImages error:", error);
      return {
        images: [],
        totalCount: 0,
        totalPages: 0,
        currentPage: 1,
        hasNextPage: false
      };
    }
  }
  function getVisibleImages() {
    const images = [];
    const seenIds = /* @__PURE__ */ new Set();
    const selectors = [
      ".image-card img",
      ".grid-card img",
      ".image-wall-item img",
      ".card img",
      'a[href*="/images/"] img'
    ];
    document.querySelectorAll(selectors.join(", ")).forEach((img) => {
      const src = img.src || "";
      const idMatch = src.match(/\/image\/(\d+)/);
      if (!idMatch) return;
      const id = idMatch[1];
      if (seenIds.has(id)) return;
      seenIds.add(id);
      images.push({
        id,
        title: img.alt || img.dataset.title || img.getAttribute("title") || "Untitled",
        paths: {
          image: src.includes("/thumbnail/") ? src.replace("/thumbnail/", "/image/") : src,
          thumbnail: src
        },
        performers: [],
        tags: [],
        isGallery: false,
        type: "image"
      });
    });
    return images;
  }
  var MODIFIERS_THAT_SUPPORT_DEPTH, VALID_FILTER_FIELDS, INT_CRITERION_FIELDS, MULTI_CRITERION_FIELDS, VALID_SORTS;
  var init_context = __esm({
    "context.js"() {
      MODIFIERS_THAT_SUPPORT_DEPTH = ["INCLUDES", "INCLUDES_ALL", "EXCLUDES"];
      VALID_FILTER_FIELDS = [
        "tags",
        "performers",
        "studios",
        "galleries",
        "scenes",
        "movies",
        "groups",
        "performer_tags",
        "studio_tags",
        "child_tags",
        "parent_tags",
        "id",
        "rating100",
        "o_counter",
        "file_count",
        "image_count",
        "performer_count",
        "tag_count",
        "performer_age",
        "height",
        "width",
        "date",
        "created_at",
        "updated_at",
        "title",
        "details",
        "path",
        "url",
        "photographer",
        "code",
        "checksum",
        "resolution",
        "orientation",
        "organized",
        "performer_favorite",
        "has_chapters",
        "is_zip",
        "AND",
        "OR",
        "NOT",
        "custom_fields"
      ];
      INT_CRITERION_FIELDS = [
        "id",
        "rating100",
        "o_counter",
        "file_count",
        "image_count",
        "performer_count",
        "tag_count",
        "performer_age",
        "height",
        "width"
      ];
      MULTI_CRITERION_FIELDS = [
        "tags",
        "performer_tags",
        "studio_tags",
        "child_tags",
        "parent_tags",
        "performers",
        "galleries",
        "scenes",
        "movies",
        "groups",
        "studios"
      ];
      VALID_SORTS = {
        images: /* @__PURE__ */ new Set([
          "created_at",
          "updated_at",
          "date",
          "title",
          "path",
          "rating100",
          "o_counter",
          "file_count",
          "resolution",
          "orientation",
          "organized",
          "performer_count",
          "tag_count",
          "random",
          "id"
        ]),
        galleries: /* @__PURE__ */ new Set([
          "created_at",
          "updated_at",
          "date",
          "title",
          "path",
          "rating100",
          "file_count",
          "image_count",
          "organized",
          "performer_count",
          "tag_count",
          "photographer",
          "code",
          "url",
          "random",
          "id"
        ])
      };
    }
  });

  // utils.js
  function memoize(fn, ttl = 3e5) {
    const cache = /* @__PURE__ */ new Map();
    return function(...args) {
      const key = JSON.stringify(args);
      const now = Date.now();
      if (cache.has(key)) {
        const { value, timestamp } = cache.get(key);
        if (now - timestamp < ttl) {
          return value;
        }
      }
      const result = fn.apply(this, args);
      cache.set(key, { value: result, timestamp: now });
      return result;
    };
  }
  var isMobile, LRUCache, imageCache, getSlideTemplate, fetchImageMetadata;
  var init_utils = __esm({
    "utils.js"() {
      isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768 || "ontouchstart" in window;
      LRUCache = class {
        constructor(maxSize = 20, ttl = 5 * 60 * 1e3) {
          this.maxSize = maxSize;
          this.ttl = ttl;
          this.cache = /* @__PURE__ */ new Map();
        }
        set(key, value) {
          const now = Date.now();
          if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
          }
          this.cache.set(key, {
            value,
            timestamp: now
          });
        }
        get(key) {
          const entry = this.cache.get(key);
          if (!entry) return void 0;
          const now = Date.now();
          if (now - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return void 0;
          }
          this.cache.delete(key);
          this.cache.set(key, entry);
          return entry.value;
        }
        has(key) {
          return this.get(key) !== void 0;
        }
        clear() {
          this.cache.clear();
        }
        size() {
          return this.cache.size;
        }
      };
      imageCache = new LRUCache(20, 5 * 60 * 1e3);
      getSlideTemplate = memoize((img, contextInfo2, isEager = false) => {
      }, 6e5);
      fetchImageMetadata = memoize(async (imageId) => {
      }, 3e5);
    }
  });

  // config.js
  async function getPluginConfig() {
    try {
      const response = await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query Configuration {
                    configuration {
                        plugins
                    }
                }`
        })
      });
      const data = await response.json();
      const settings = data?.data?.configuration?.plugins?.[PLUGIN_NAME] || {};
      if (!settings.autoPlayInterval || settings.autoPlayInterval === 0) settings.autoPlayInterval = 500;
      if (!settings.transitionEffect || settings.transitionEffect === "") settings.transitionEffect = "cards";
      if (settings.showProgressBar === void 0) settings.showProgressBar = true;
      if (settings.showCounter === void 0) settings.showCounter = true;
      if (!settings.preloadImages || settings.preloadImages === 0) settings.preloadImages = isMobile ? 1 : 2;
      if (!settings.swipeResistance || settings.swipeResistance === 0) settings.swipeResistance = 80;
      if (!settings.effectDepth || settings.effectDepth === 0) settings.effectDepth = 150;
      if (settings.chunkSize === void 0) settings.chunkSize = 30;
      if (settings.lazyLoadThreshold === void 0) settings.lazyLoadThreshold = 2;
      if (isMobile) {
        settings.autoPlayInterval = Math.max(settings.autoPlayInterval, 1e3);
        settings.preloadImages = 1;
        settings.chunkSize = 20;
        settings.lazyLoadThreshold = 1;
        settings.imageGlowIntensity = Math.min(settings.imageGlowIntensity, 20);
        settings.edgeGlowIntensity = Math.min(settings.edgeGlowIntensity, 30);
        settings.ambientPulseSpeed = Math.max(settings.ambientPulseSpeed, 10);
      }
      if (!settings.ambientColorHue || settings.ambientColorHue === 0) settings.ambientColorHue = 260;
      if (!settings.imageGlowIntensity || settings.imageGlowIntensity === 0) settings.imageGlowIntensity = 40;
      if (!settings.ambientPulseSpeed || settings.ambientPulseSpeed === 0) settings.ambientPulseSpeed = 6;
      if (!settings.edgeGlowIntensity || settings.edgeGlowIntensity === 0) settings.edgeGlowIntensity = 50;
      if (!settings.strobeSpeed || settings.strobeSpeed === 0) settings.strobeSpeed = 150;
      if (!settings.strobeIntensity || settings.strobeIntensity === 0) settings.strobeIntensity = 60;
      console.log(`[Image Deck] Settings loaded:`, settings);
      return settings;
    } catch (error) {
      console.error(`[Image Deck] Error loading settings:`, error);
      return {
        autoPlayInterval: 500,
        transitionEffect: "cards",
        showProgressBar: true,
        showCounter: true,
        preloadImages: 2,
        swipeResistance: 50,
        effectDepth: 150,
        ambientColorHue: 260,
        imageGlowIntensity: 40,
        ambientPulseSpeed: 6
      };
    }
  }
  function injectDynamicStyles(settings) {
    const styleId = "image-deck-dynamic-styles";
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    const ambientHue = settings.ambientColorHue;
    const glowIntensity = settings.imageGlowIntensity;
    const pulseSpeed = settings.ambientPulseSpeed;
    const edgeIntensity = settings.edgeGlowIntensity / 100;
    styleEl.textContent = `
        .swiper-slide img {
            filter: drop-shadow(0 0 ${glowIntensity}px hsla(${ambientHue}, 70%, 65%, 0.4));
        }

        .image-deck-ambient {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 2;
            background: radial-gradient(
                ellipse at center,
                hsla(${ambientHue}, 70%, 50%, 0.1) 0%,
                hsla(${ambientHue}, 60%, 40%, 0.05) 50%,
                transparent 100%
            );
            opacity: 0.3;
        }

        /* Remove problematic edge glow that might cause colored overlay */
        .image-deck-container::before {
            content: none !important;
            box-shadow: none !important;
        }

        .image-deck-progress {
            background: linear-gradient(90deg,
                hsl(${ambientHue}, 70%, 65%),
                hsl(${ambientHue + 30}, 70%, 65%)
            );
        }
        
        /* New control layout styles */
        .image-deck-controls-wrapper {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            z-index: 1002;
        }
        
        .image-deck-zoom-controls {
            display: flex;
            gap: 10px;
        }
        
        .image-deck-navigation-controls {
            display: flex;
            gap: 10px;
        }
        
        .image-deck-control-btn {
            background: rgba(0, 0, 0, 0.7);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 16px;
            transition: all 0.2s ease;
            backdrop-filter: blur(5px);
        }
        
        .image-deck-control-btn:hover {
            background: rgba(50, 50, 50, 0.9);
            transform: scale(1.1);
        }
        
        .image-deck-control-btn:active {
            transform: scale(0.95);
        }
        
        /* Gallery cover styles */
        .gallery-cover-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin: 20px auto;
            max-width: 300px;
        }
        
        .gallery-cover-title {
            color: white;
            font-size: 16px;
            font-weight: bold;
            text-align: center;
            margin-bottom: 10px;
            text-shadow: 0 0 5px rgba(0, 0, 0, 0.7);
            padding: 5px 10px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 4px;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .gallery-cover-link {
            display: inline-block;
            max-width: 300px;
            max-height: 500px;
            aspect-ratio: 3 / 5;
            border: 3px solid #6a5acd;
            border-radius: 8px;
            box-shadow: 0 0 15px rgba(106, 90, 205, 0.7);
            overflow: hidden;
            transition: all 0.3s ease;
            width: 100%;
        }
        
        .gallery-cover-link:hover {
            transform: scale(1.05);
            box-shadow: 0 0 25px rgba(106, 90, 205, 0.9);
            border-color: #8a7bdb;
        }
        
        .gallery-cover-link img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }
        
        /* Mobile optimizations */
        @media (max-width: 768px) {
            .gallery-cover-container {
                max-width: 200px;
            }
            
            .gallery-cover-link {
                max-width: 200px;
                max-height: 350px;
            }
            
            .gallery-cover-title {
                font-size: 14px;
                padding: 4px 8px;
            }
            
            .image-deck-control-btn {
                width: 35px;
                height: 35px;
                font-size: 14px;
            }
            
            /* Mobile performance mode */
            .image-deck-container.mobile-performance-mode {
                filter: none !important;
                box-shadow: none !important;
                backdrop-filter: none !important;
            }
            
            .image-deck-container.mobile-performance-mode .swiper-slide img {
                filter: none !important;
                will-change: auto;
            }
            
            .image-deck-ambient {
                animation: none !important;
                opacity: 0.1 !important;
            }
        }
        
        @media (max-width: 480px) {
            .gallery-cover-container {
                max-width: 150px;
            }
            
            .gallery-cover-link {
                max-width: 150px;
                max-height: 250px;
            }
            
            .gallery-cover-title {
                font-size: 12px;
                padding: 3px 6px;
            }
            
            .image-deck-control-btn {
                width: 30px;
                height: 30px;
                font-size: 12px;
            }
        }
        
        /* Transition for fading UI elements */
        .image-deck-topbar,
        .image-deck-controls-wrapper,
        .image-deck-speed {
            transition: opacity 0.3s ease;
        }
    `;
  }
  var PLUGIN_NAME;
  var init_config = __esm({
    "config.js"() {
      init_utils();
      PLUGIN_NAME = "Deck Viewer";
    }
  });

  // graphql.js
  var graphql_exports = {};
  __export(graphql_exports, {
    applyGalleryTagFilter: () => applyGalleryTagFilter,
    clearGalleryTagFilter: () => clearGalleryTagFilter,
    fetchGalleriesByTags: () => fetchGalleriesByTags,
    fetchGalleryImagePreviews: () => fetchGalleryImagePreviews,
    fetchGalleryMetadata: () => fetchGalleryMetadata,
    fetchImageMetadata: () => fetchImageMetadata2,
    searchPerformers: () => searchPerformers,
    searchStudios: () => searchStudios,
    searchTags: () => searchTags,
    updateGalleryMetadata: () => updateGalleryMetadata,
    updateGalleryPerformers: () => updateGalleryPerformers,
    updateGalleryStudio: () => updateGalleryStudio,
    updateImageMetadata: () => updateImageMetadata,
    updateImageTags: () => updateImageTags
  });
  function handleError(operation, error, defaultValue = null) {
    console.error(`[Image Deck] Error in ${operation}:`, error);
    return defaultValue;
  }
  async function fetchGalleryMetadata(galleryId) {
    const query = `query FindGallery($id: ID!) {
        findGallery(id: $id) {
            created_at
            date
            details
            id
            image_count
            organized
            rating100
            title
            updated_at
            url
            urls
            tags {
                id
                name
            }
            performers {
                id
                name
            }
            studio {
                id
                name
            }
        }
    }`;
    try {
      const response = await safeFetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { id: galleryId } })
      }, "GraphQL fetchGalleryMetadata");
      if (!response) return null;
      const data = await response.json();
      return data?.data?.findGallery || null;
    } catch (error) {
      return handleError("fetchGalleryMetadata", error, null);
    }
  }
  async function fetchGalleryImagePreviews(galleryId, count = 3) {
    const query = `query FindGalleryImagePreviews($id: ID!, $filter: FindFilterType!, $image_filter: ImageFilterType) {
        findGallery(id: $id) {
            cover { id }
        }
        findImages(filter: $filter, image_filter: $image_filter) {
            images {
                id
                paths {
                    thumbnail
                    image
                }
            }
        }
    }`;
    const variables = {
      id: galleryId,
      filter: {
        per_page: count + 5,
        page: 1,
        sort: "path",
        direction: "ASC"
      },
      image_filter: {
        galleries: {
          modifier: "INCLUDES",
          value: [galleryId]
        }
      }
    };
    try {
      const response = await safeFetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables })
      }, "GraphQL fetchGalleryImagePreviews");
      if (!response) return [];
      const data = await response.json();
      if (data?.errors) return [];
      const coverId = data?.data?.findGallery?.cover?.id;
      const images = data?.data?.findImages?.images || [];
      return images.filter((img) => img.id !== coverId).map((img) => img?.paths?.thumbnail || img?.paths?.image || `/images/${img.id}`).filter(Boolean).slice(0, count);
    } catch (error) {
      return handleError("fetchGalleryImagePreviews", error, []);
    }
  }
  async function safeFetch(url, options, operationName = "") {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1e4);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      console.error(`[Image Deck] Error in ${operationName}:`, error);
      return null;
    }
  }
  async function updateGalleryMetadata(galleryId, updates) {
    const mutation = `mutation GalleryUpdate($input: GalleryUpdateInput!) {
        galleryUpdate(input: $input) {
            id
            title
            details
            organized
        }
    }`;
    const input = { id: galleryId, ...updates };
    try {
      const response = await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: mutation, variables: { input } })
      });
      const data = await response.json();
      return data?.data?.galleryUpdate || null;
    } catch (error) {
      console.error("[Image Deck] Error updating gallery metadata:", error);
      return null;
    }
  }
  async function updateGalleryPerformers(galleryId, performerIds) {
    const mutation = `mutation GalleryUpdate($input: GalleryUpdateInput!) {
        galleryUpdate(input: $input) {
            id
            performers {
                id
                name
            }
        }
    }`;
    const input = {
      id: galleryId,
      performer_ids: performerIds
    };
    try {
      const response = await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: mutation, variables: { input } })
      });
      const data = await response.json();
      return data?.data?.galleryUpdate || null;
    } catch (error) {
      console.error("[Image Deck] Error updating gallery performers:", error);
      return null;
    }
  }
  async function searchPerformers(query) {
    const gql = `query FindPerformers($filter: FindFilterType, $performer_filter: PerformerFilterType) {
        findPerformers(filter: $filter, performer_filter: $performer_filter) {
            performers {
                id
                name
            }
        }
    }`;
    const searchTerm = query.trim();
    if (!searchTerm) {
      return [];
    }
    try {
      const approaches = [
        { q: searchTerm },
        { q: `*${searchTerm}*` }
      ];
      for (const filter of approaches) {
        const variables = {
          filter: {
            per_page: 20,
            ...filter
          },
          performer_filter: {}
        };
        const response = await fetch("/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: gql, variables })
        });
        const data = await response.json();
        const performers = data?.data?.findPerformers?.performers || [];
        if (performers.length > 0) {
          return performers;
        }
      }
      return [];
    } catch (error) {
      console.error("[Image Deck] Error searching performers:", error);
      return [];
    }
  }
  async function updateGalleryStudio(galleryId, studioId) {
    const mutation = `mutation GalleryUpdate($input: GalleryUpdateInput!) {
        galleryUpdate(input: $input) {
            id
            studio {
                id
                name
            }
        }
    }`;
    const input = {
      id: galleryId,
      studio_id: studioId
    };
    try {
      const response = await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: mutation, variables: { input } })
      });
      const data = await response.json();
      return data?.data?.galleryUpdate || null;
    } catch (error) {
      console.error("[Image Deck] Error updating gallery studio:", error);
      return null;
    }
  }
  async function searchStudios(query) {
    const gql = `query FindStudios($filter: FindFilterType, $studio_filter: StudioFilterType) {
        findStudios(filter: $filter, studio_filter: $studio_filter) {
            studios {
                id
                name
            }
        }
    }`;
    const searchTerm = query.trim();
    if (!searchTerm) {
      return [];
    }
    try {
      const approaches = [
        { q: searchTerm },
        { q: `*${searchTerm}*` }
      ];
      for (const filter of approaches) {
        const variables = {
          filter: {
            per_page: 20,
            ...filter
          },
          studio_filter: {}
        };
        const response = await fetch("/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: gql, variables })
        });
        const data = await response.json();
        const studios = data?.data?.findStudios?.studios || [];
        if (studios.length > 0) {
          return studios;
        }
      }
      return [];
    } catch (error) {
      console.error("[Image Deck] Error searching studios:", error);
      return [];
    }
  }
  async function fetchImageMetadata2(imageId) {
    const query = `query FindImage($id: ID!) {
        findImage(id: $id) {
            id
            title
            rating100
            o_counter
            organized
            date
            details
            photographer
            files {
                basename
            }
            tags {
                id
                name
            }
            performers {
                id
                name
            }
            studio {
                id
                name
            }
            galleries {
                id
                title
            }
            paths {
                thumbnail
                image
            }
        }
    }`;
    try {
      const response = await safeFetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { id: imageId } })
      }, "GraphQL fetchImageMetadata");
      if (!response) return null;
      const data = await response.json();
      return data?.data?.findImage || null;
    } catch (error) {
      return handleError("fetchImageMetadata", error, null);
    }
  }
  async function updateImageMetadata(imageId, updates) {
    const mutation = `mutation ImageUpdate($input: ImageUpdateInput!) {
        imageUpdate(input: $input) {
            id
            rating100
            title
            details
            organized
        }
    }`;
    const input = { id: imageId, ...updates };
    try {
      const response = await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: mutation, variables: { input } })
      });
      const data = await response.json();
      return data?.data?.imageUpdate || null;
    } catch (error) {
      console.error("[Image Deck] Error updating image metadata:", error);
      return null;
    }
  }
  async function updateImageTags(imageId, tagIds) {
    const mutation = `mutation ImageUpdate($input: ImageUpdateInput!) {
        imageUpdate(input: $input) {
            id
            tags {
                id
                name
            }
        }
    }`;
    const input = { id: imageId, tag_ids: tagIds };
    try {
      const response = await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: mutation, variables: { input } })
      });
      const data = await response.json();
      return data?.data?.imageUpdate || null;
    } catch (error) {
      console.error("[Image Deck] Error updating image tags:", error);
      return null;
    }
  }
  async function searchTags(query) {
    const gql = `query FindTags($filter: FindFilterType, $tag_filter: TagFilterType) {
        findTags(filter: $filter, tag_filter: $tag_filter) {
            tags {
                id
                name
            }
        }
    }`;
    const searchTerm = query.trim();
    if (!searchTerm) {
      return [];
    }
    try {
      const approaches = [
        { q: searchTerm },
        { q: `*${searchTerm}*` }
      ];
      for (const filter of approaches) {
        const variables = {
          filter: {
            per_page: 20,
            ...filter
          },
          tag_filter: {}
        };
        const response = await fetch("/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: gql, variables })
        });
        const data = await response.json();
        const tags = data?.data?.findTags?.tags || [];
        if (tags.length > 0) {
          return tags;
        }
      }
      return [];
    } catch (error) {
      console.error("[Image Deck] Error searching tags:", error);
      return [];
    }
  }
  async function fetchGalleriesByTags(tagIds, page = 1, perPage = 50) {
    const query = `query FindGalleries($filter: FindFilterType!, $gallery_filter: GalleryFilterType) {
        findGalleries(filter: $filter, gallery_filter: $gallery_filter) {
            count
            galleries {
                id 
                title 
                image_count 
                cover { 
                    paths { 
                        thumbnail 
                        image 
                    } 
                }
                performers {
                    id
                    name
                }
                tags {
                    id
                    name
                }
            }
        }
    }`;
    const variables = {
      filter: {
        per_page: perPage,
        page,
        sort: "created_at",
        direction: "DESC"
      },
      gallery_filter: {
        tags: {
          value: tagIds,
          modifier: "INCLUDES"
        }
      }
    };
    try {
      const response = await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables })
      });
      const data = await response.json();
      return data?.data?.findGalleries || { count: 0, galleries: [] };
    } catch (error) {
      console.error("[Image Deck] Error fetching galleries by tags:", error);
      return { count: 0, galleries: [] };
    }
  }
  async function applyGalleryTagFilter(includedTags, excludedTags, includedPerformers = [], excludedPerformers = []) {
    const filterObj = {
      includedTags,
      excludedTags,
      includedPerformers,
      excludedPerformers
    };
    sessionStorage.setItem("galleryTagFilter", JSON.stringify(filterObj));
    window.dispatchEvent(new CustomEvent("galleryTagFilterChanged", {
      detail: { includedTags, excludedTags, includedPerformers, excludedPerformers }
    }));
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("updateDeckContent", {
        detail: { includedTags, excludedTags, includedPerformers, excludedPerformers }
      }));
    }, 100);
  }
  function clearGalleryTagFilter() {
    sessionStorage.removeItem("galleryTagFilter");
    window.dispatchEvent(new CustomEvent("galleryTagFilterChanged", {
      detail: { includedTags: [], excludedTags: [], includedPerformers: [], excludedPerformers: [] }
    }));
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("updateDeckContent", {
        detail: { includedTags: [], excludedTags: [], includedPerformers: [], excludedPerformers: [] }
      }));
    }, 100);
  }
  var init_graphql = __esm({
    "graphql.js"() {
    }
  });

  // metadata.js
  function setCurrentSwiper(swiper) {
    currentSwiperRef = swiper;
  }
  async function openMetadataModal() {
    if (!currentSwiperRef) return;
    const currentIndex = currentSwiperRef.activeIndex;
    const currentImage = window.currentImages?.[currentIndex];
    if (!currentImage || !currentImage.id) return;
    const modal = document.querySelector(".image-deck-metadata-modal");
    const body = document.querySelector(".image-deck-metadata-body");
    const header = document.querySelector(".image-deck-metadata-header h3");
    if (!modal || !body || !header) return;
    body.innerHTML = '<div class="metadata-loading">Loading...</div>';
    modal.classList.add("active");
    const isGallery = currentImage.isGallery || currentImage.url || currentImage.image_count !== void 0 || currentImage.type === "gallery";
    if (isGallery) {
      header.textContent = "Gallery Details";
      let galleryId = currentImage.id;
      if (currentImage.url) {
        const urlMatch = currentImage.url.match(/\/galleries\/(\d+)/);
        if (urlMatch) {
          galleryId = urlMatch[1];
        }
      }
      currentMetadata = await fetchGalleryMetadata(galleryId);
    } else {
      header.textContent = "Image Details";
      currentMetadata = await fetchImageMetadata2(currentImage.id);
    }
    if (!currentMetadata) {
      body.innerHTML = '<div class="metadata-error">Failed to load metadata</div>';
      return;
    }
    if (isGallery) {
      populateGalleryMetadataModal(currentMetadata);
    } else {
      populateImageMetadataModal(currentMetadata);
    }
  }
  function populateGalleryMetadataModal(metadata) {
    const body = document.querySelector(".image-deck-metadata-body");
    if (!body) return;
    let viewUrl = "/galleries";
    if (metadata.id) {
      viewUrl = `/galleries/${metadata.id}`;
    } else if (metadata.url && metadata.url !== "null" && metadata.url !== "undefined") {
      viewUrl = metadata.url;
    }
    body.innerHTML = `
        <div class="metadata-section metadata-file-info">
            <div class="metadata-filename" title="${metadata.title || "Untitled"}">${metadata.title || "Untitled"}</div>
            <a href="${viewUrl}" target="_blank" class="metadata-link" title="Open gallery page in new tab">
                View in Stash \u2192
            </a>
        </div>

        <div class="metadata-section">
            <label>Title</label>
            <input type="text" class="metadata-title" value="${metadata.title || ""}" placeholder="Enter title...">
        </div>

        <div class="metadata-section">
            <label>Details</label>
            <textarea class="metadata-details" placeholder="Enter details...">${metadata.details || ""}</textarea>
        </div>

        <!-- STUDIO SECTION -->
        <div class="metadata-section">
            <label>Studio</label>
            <div class="metadata-tags metadata-studio">
                ${metadata.studio ? `
                    <span class="metadata-tag" data-studio-id="${metadata.studio.id}">
                        ${metadata.studio.name}
                        <button class="metadata-tag-remove" data-studio-id="${metadata.studio.id}">\xD7</button>
                    </span>
                ` : ""}
            </div>
            <input type="text" class="metadata-tag-search metadata-studio-search" placeholder="Search studios...">
            <div class="metadata-tag-results metadata-studio-results"></div>
        </div>

        <!-- PERFORMERS SECTION -->
        <div class="metadata-section">
            <label>Performers</label>
            <div class="metadata-tags metadata-performers">
                ${metadata.performers ? metadata.performers.map(
      (performer) => `<span class="metadata-tag" data-performer-id="${performer.id}">
                        ${performer.name}
                        <button class="metadata-tag-remove" data-performer-id="${performer.id}">\xD7</button>
                    </span>`
    ).join("") : ""}
            </div>
            <input type="text" class="metadata-tag-search metadata-performer-search" placeholder="Search performers...">
            <div class="metadata-tag-results metadata-performer-results"></div>
        </div>

        <!-- TAGGER SECTION -->
        <div class="metadata-section">
            <label>Tags</label>
            <div class="metadata-tags">
                ${metadata.tags ? metadata.tags.map(
      (tag) => `<span class="metadata-tag" data-tag-id="${tag.id}">
                        ${tag.name}
                        <button class="metadata-tag-remove" data-tag-id="${tag.id}">\xD7</button>
                    </span>`
    ).join("") : ""}
            </div>
            <input type="text" class="metadata-tag-search" placeholder="Search tags...">
            <div class="metadata-tag-results"></div>
        </div>

        <div class="metadata-section">
            <label>Info</label>
            <div class="metadata-info">
                ${metadata.date ? `<div><strong>Date:</strong> ${metadata.date}</div>` : ""}
                ${metadata.image_count !== void 0 ? `<div><strong>Image Count:</strong> ${metadata.image_count}</div>` : ""}
                <div><strong>Created:</strong> ${metadata.created_at || "Unknown"}</div>
                <div><strong>Updated:</strong> ${metadata.updated_at || "Unknown"}</div>
                ${metadata.rating100 ? `<div><strong>Rating:</strong> ${metadata.rating100}/100</div>` : ""}
                <div><strong>Organized:</strong> ${metadata.organized ? "Yes" : "No"}</div>
            </div>
        </div>

        ${metadata.urls && metadata.urls.length > 0 ? `
        <div class="metadata-section">
            <label>URLs</label>
            <div class="metadata-urls">
                ${metadata.urls.map(
      (url) => `<div><a href="${url}" target="_blank">${url}</a></div>`
    ).join("")}
            </div>
        </div>` : ""}

        <div class="metadata-actions">
            <button class="metadata-save-btn">Save Changes</button>
        </div>
    `;
    setupGalleryMetadataHandlers(metadata);
  }
  function setupGalleryMetadataHandlers(metadata) {
    const body = document.querySelector(".image-deck-metadata-body");
    if (!body) return;
    const saveBtn = body.querySelector(".metadata-save-btn");
    if (!saveBtn) return;
    const originalTagIds = metadata.tags ? metadata.tags.map((tag) => tag.id) : [];
    const originalPerformerIds = metadata.performers ? metadata.performers.map((performer) => performer.id) : [];
    const originalStudioId = metadata.studio ? metadata.studio.id : null;
    let currentTagIds = [...originalTagIds];
    let currentPerformerIds = [...originalPerformerIds];
    let currentStudioId = originalStudioId;
    const studioSearch = body.querySelector(".metadata-studio-search");
    const studioResults = body.querySelector(".metadata-studio-results");
    let studioSearchTimeout;
    if (studioSearch) {
      studioSearch.addEventListener("input", (e) => {
        clearTimeout(studioSearchTimeout);
        const query = e.target.value.trim();
        if (query.length < 2) {
          studioResults.innerHTML = "";
          return;
        }
        studioSearchTimeout = setTimeout(async () => {
          const { searchStudios: searchStudios2 } = await Promise.resolve().then(() => (init_graphql(), graphql_exports));
          const studios = await searchStudios2(query);
          studioResults.innerHTML = studios.map(
            (studio) => `<div class="metadata-tag-result" data-studio-id="${studio.id}" data-studio-name="${studio.name}">
                        ${studio.name}
                    </div>`
          ).join("");
          studioResults.querySelectorAll(".metadata-tag-result").forEach((result) => {
            result.addEventListener("click", (e2) => {
              const studioId = e2.target.dataset.studioId;
              const studioName = e2.target.dataset.studioName;
              const studioContainer = body.querySelector(".metadata-studio");
              studioContainer.innerHTML = "";
              const studioHtml = `<span class="metadata-tag" data-studio-id="${studioId}">
                            ${studioName}
                            <button class="metadata-tag-remove" data-studio-id="${studioId}">\xD7</button>
                        </span>`;
              studioContainer.insertAdjacentHTML("beforeend", studioHtml);
              currentStudioId = studioId;
              const newStudio = studioContainer.lastElementChild;
              newStudio.querySelector(".metadata-tag-remove").addEventListener("click", (e3) => {
                e3.target.closest(".metadata-tag").remove();
                currentStudioId = null;
              });
              studioSearch.value = "";
              studioResults.innerHTML = "";
            });
          });
        }, 300);
      });
    }
    body.querySelectorAll(".metadata-studio .metadata-tag-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const studioEl = e.target.closest(".metadata-tag");
        if (studioEl) {
          studioEl.remove();
          currentStudioId = null;
        }
      });
    });
    const performerSearch = body.querySelector(".metadata-performer-search");
    const performerResults = body.querySelector(".metadata-performer-results");
    let performerSearchTimeout;
    if (performerSearch) {
      performerSearch.addEventListener("input", (e) => {
        clearTimeout(performerSearchTimeout);
        const query = e.target.value.trim();
        if (query.length < 2) {
          performerResults.innerHTML = "";
          return;
        }
        performerSearchTimeout = setTimeout(async () => {
          const { searchPerformers: searchPerformers3 } = await Promise.resolve().then(() => (init_graphql(), graphql_exports));
          const performers = await searchPerformers3(query);
          performerResults.innerHTML = performers.map(
            (performer) => `<div class="metadata-tag-result" data-performer-id="${performer.id}" data-performer-name="${performer.name}">
                        ${performer.name}
                    </div>`
          ).join("");
          performerResults.querySelectorAll(".metadata-tag-result").forEach((result) => {
            result.addEventListener("click", (e2) => {
              const performerId = e2.target.dataset.performerId;
              const performerName = e2.target.dataset.performerName;
              if (currentPerformerIds.includes(performerId)) {
                return;
              }
              const performersContainer = body.querySelector(".metadata-performers");
              const performerHtml = `<span class="metadata-tag" data-performer-id="${performerId}">
                            ${performerName}
                            <button class="metadata-tag-remove" data-performer-id="${performerId}">\xD7</button>
                        </span>`;
              performersContainer.insertAdjacentHTML("beforeend", performerHtml);
              currentPerformerIds.push(performerId);
              const newPerformer = performersContainer.lastElementChild;
              newPerformer.querySelector(".metadata-tag-remove").addEventListener("click", (e3) => {
                const removePerformerId = e3.target.dataset.performerId;
                e3.target.closest(".metadata-tag").remove();
                currentPerformerIds = currentPerformerIds.filter((id) => id !== removePerformerId);
              });
              performerSearch.value = "";
              performerResults.innerHTML = "";
            });
          });
        }, 300);
      });
    }
    body.querySelectorAll(".metadata-performers .metadata-tag-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const performerId = e.target.dataset.performerId;
        const performerEl = e.target.closest(".metadata-tag");
        if (performerEl) {
          performerEl.remove();
          currentPerformerIds = currentPerformerIds.filter((id) => id !== performerId);
        }
      });
    });
    const tagSearch = body.querySelector(".metadata-tag-search:not(.metadata-performer-search):not(.metadata-studio-search)");
    const tagResults = body.querySelector(".metadata-tag-results:not(.metadata-performer-results):not(.metadata-studio-results)");
    let tagSearchTimeout;
    if (tagSearch) {
      tagSearch.addEventListener("input", (e) => {
        clearTimeout(tagSearchTimeout);
        const query = e.target.value.trim();
        if (query.length < 2) {
          tagResults.innerHTML = "";
          return;
        }
        tagSearchTimeout = setTimeout(async () => {
          const { searchTags: searchTags3 } = await Promise.resolve().then(() => (init_graphql(), graphql_exports));
          const tags = await searchTags3(query);
          tagResults.innerHTML = tags.map(
            (tag) => `<div class="metadata-tag-result" data-tag-id="${tag.id}" data-tag-name="${tag.name}">
                        ${tag.name}
                    </div>`
          ).join("");
          tagResults.querySelectorAll(".metadata-tag-result").forEach((result) => {
            result.addEventListener("click", (e2) => {
              const tagId = e2.target.dataset.tagId;
              const tagName = e2.target.dataset.tagName;
              if (currentTagIds.includes(tagId)) {
                return;
              }
              const tagsContainer = body.querySelector(".metadata-tags:not(.metadata-performers):not(.metadata-studio)");
              const tagHtml = `<span class="metadata-tag" data-tag-id="${tagId}">
                            ${tagName}
                            <button class="metadata-tag-remove" data-tag-id="${tagId}">\xD7</button>
                        </span>`;
              tagsContainer.insertAdjacentHTML("beforeend", tagHtml);
              currentTagIds.push(tagId);
              const newTag = tagsContainer.lastElementChild;
              newTag.querySelector(".metadata-tag-remove").addEventListener("click", (e3) => {
                const removeTagId = e3.target.dataset.tagId;
                e3.target.closest(".metadata-tag").remove();
                currentTagIds = currentTagIds.filter((id) => id !== removeTagId);
              });
              tagSearch.value = "";
              tagResults.innerHTML = "";
            });
          });
        }, 300);
      });
    }
    body.querySelectorAll(".metadata-tags:not(.metadata-performers):not(.metadata-studio) .metadata-tag-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tagId = e.target.dataset.tagId;
        const tagEl = e.target.closest(".metadata-tag");
        if (tagEl) {
          tagEl.remove();
          currentTagIds = currentTagIds.filter((id) => id !== tagId);
        }
      });
    });
    saveBtn.addEventListener("click", async () => {
      const title = body.querySelector(".metadata-title").value;
      const details = body.querySelector(".metadata-details").value;
      saveBtn.textContent = "Saving...";
      saveBtn.disabled = true;
      try {
        const result = await updateGalleryMetadata(metadata.id, { title, details });
        if (!result) {
          throw new Error("Failed to update gallery metadata");
        }
        const tagsChanged = JSON.stringify(currentTagIds.sort()) !== JSON.stringify(originalTagIds.sort());
        if (tagsChanged) {
          await updateGalleryTagsSeparately(metadata.id, currentTagIds);
        }
        const performersChanged = JSON.stringify(currentPerformerIds.sort()) !== JSON.stringify(originalPerformerIds.sort());
        if (performersChanged) {
          const { updateGalleryPerformers: updateGalleryPerformers2 } = await Promise.resolve().then(() => (init_graphql(), graphql_exports));
          await updateGalleryPerformers2(metadata.id, currentPerformerIds);
        }
        const studioChanged = currentStudioId !== originalStudioId;
        if (studioChanged) {
          const { updateGalleryStudio: updateGalleryStudio2 } = await Promise.resolve().then(() => (init_graphql(), graphql_exports));
          await updateGalleryStudio2(metadata.id, currentStudioId);
        }
        saveBtn.textContent = "Saved \u2713";
        const filenameEl = body.querySelector(".metadata-filename");
        if (filenameEl) {
          filenameEl.textContent = title || "Untitled";
        }
        setTimeout(() => {
          saveBtn.textContent = "Save Changes";
          saveBtn.disabled = false;
        }, 2e3);
      } catch (error) {
        console.error("[Image Deck] Error updating gallery metadata:", error);
        saveBtn.textContent = "Error!";
        setTimeout(() => {
          saveBtn.textContent = "Save Changes";
          saveBtn.disabled = false;
        }, 2e3);
      }
    });
  }
  async function updateGalleryTagsSeparately(galleryId, tagIds) {
    try {
      const mutation = `mutation GalleryUpdate($input: GalleryUpdateInput!) {
            galleryUpdate(input: $input) {
                id
                title
                tags {
                    id
                    name
                }
            }
        }`;
      const input = {
        id: galleryId,
        tag_ids: tagIds
      };
      const response = await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: mutation, variables: { input } })
      });
      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }
      console.log("[Image Deck] Gallery tags updated successfully");
      return data?.data?.galleryUpdate || null;
    } catch (error) {
      console.error("[Image Deck] Error updating gallery tags:", error);
      throw error;
    }
  }
  function closeMetadataModal() {
    const modal = document.querySelector(".image-deck-metadata-modal");
    if (modal) {
      modal.classList.remove("active");
    }
    currentMetadata = null;
  }
  function populateImageMetadataModal(metadata) {
    const body = document.querySelector(".image-deck-metadata-body");
    if (!body) return;
    const rating = metadata.rating100 ? metadata.rating100 / 20 : 0;
    const filename = metadata.files && metadata.files.length > 0 ? metadata.files[0].basename : "Unknown";
    body.innerHTML = `
        <div class="metadata-section metadata-file-info">
            <div class="metadata-filename" title="${filename}">${filename}</div>
            <a href="/images/${metadata.id}" target="_blank" class="metadata-link" title="Open image page in new tab">
                View in Stash \u2192
            </a>
        </div>

        <div class="metadata-section">
            <label>Rating</label>
            <div class="metadata-rating">
                ${[1, 2, 3, 4, 5].map(
      (star) => `<button class="metadata-star ${star <= rating ? "active" : ""}" data-rating="${star}">\u2605</button>`
    ).join("")}
            </div>
        </div>

        <div class="metadata-section">
            <label>Title</label>
            <input type="text" class="metadata-title" value="${metadata.title || ""}" placeholder="Enter title...">
        </div>

        <div class="metadata-section">
            <label>Details</label>
            <textarea class="metadata-details" placeholder="Enter details...">${metadata.details || ""}</textarea>
        </div>

        <div class="metadata-section">
            <label>Tags</label>
            <div class="metadata-tags">
                ${metadata.tags.map(
      (tag) => `<span class="metadata-tag" data-tag-id="${tag.id}">
                        ${tag.name}
                        <button class="metadata-tag-remove" data-tag-id="${tag.id}">\xD7</button>
                    </span>`
    ).join("")}
            </div>
            <input type="text" class="metadata-tag-search" placeholder="Search tags...">
            <div class="metadata-tag-results"></div>
        </div>

        <div class="metadata-section">
            <label>Info</label>
            <div class="metadata-info">
                ${metadata.performers.length > 0 ? `<div><strong>Performers:</strong> ${metadata.performers.map((p) => p.name).join(", ")}</div>` : ""}
                ${metadata.studio ? `<div><strong>Studio:</strong> ${metadata.studio.name}</div>` : ""}
                ${metadata.date ? `<div><strong>Date:</strong> ${metadata.date}</div>` : ""}
                ${metadata.photographer ? `<div><strong>Photographer:</strong> ${metadata.photographer}</div>` : ""}
                <div><strong>Views:</strong> ${metadata.o_counter || 0}</div>
            </div>
        </div>

        <div class="metadata-actions">
            <button class="metadata-save-btn">Save Changes</button>
            <button class="metadata-organized-btn ${metadata.organized ? "active" : ""}">
                ${metadata.organized ? "Organized \u2713" : "Mark Organized"}
            </button>
        </div>
    `;
    setupMetadataHandlers(metadata);
  }
  function setupMetadataHandlers(metadata) {
    const body = document.querySelector(".image-deck-metadata-body");
    body.querySelectorAll(".metadata-star").forEach((star) => {
      star.addEventListener("click", (e) => {
        const rating = parseInt(e.target.dataset.rating);
        body.querySelectorAll(".metadata-star").forEach((s, i) => {
          s.classList.toggle("active", i < rating);
        });
      });
    });
    body.querySelectorAll(".metadata-tag-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tagId = e.target.dataset.tagId;
        const tagEl = e.target.closest(".metadata-tag");
        if (tagEl) tagEl.remove();
      });
    });
    const tagSearch = body.querySelector(".metadata-tag-search");
    const tagResults = body.querySelector(".metadata-tag-results");
    let searchTimeout;
    tagSearch.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();
      if (query.length < 2) {
        tagResults.innerHTML = "";
        return;
      }
      searchTimeout = setTimeout(async () => {
        const tags = await searchTags(query);
        tagResults.innerHTML = tags.map(
          (tag) => `<div class="metadata-tag-result" data-tag-id="${tag.id}" data-tag-name="${tag.name}">
                    ${tag.name}
                </div>`
        ).join("");
        tagResults.querySelectorAll(".metadata-tag-result").forEach((result) => {
          result.addEventListener("click", (e2) => {
            const tagId = e2.target.dataset.tagId;
            const tagName = e2.target.dataset.tagName;
            const tagsContainer = body.querySelector(".metadata-tags");
            const tagHtml = `<span class="metadata-tag" data-tag-id="${tagId}">
                        ${tagName}
                        <button class="metadata-tag-remove" data-tag-id="${tagId}">\xD7</button>
                    </span>`;
            tagsContainer.insertAdjacentHTML("beforeend", tagHtml);
            const newTag = tagsContainer.lastElementChild;
            newTag.querySelector(".metadata-tag-remove").addEventListener("click", (e3) => {
              e3.target.closest(".metadata-tag").remove();
            });
            tagSearch.value = "";
            tagResults.innerHTML = "";
          });
        });
      }, 300);
    });
    const saveBtn = body.querySelector(".metadata-save-btn");
    saveBtn.addEventListener("click", async () => {
      const title = body.querySelector(".metadata-title").value;
      const details = body.querySelector(".metadata-details").value;
      const activeStar = body.querySelectorAll(".metadata-star.active").length;
      const rating100 = activeStar * 20;
      const tagIds = Array.from(body.querySelectorAll(".metadata-tag")).map(
        (tag) => tag.dataset.tagId
      );
      saveBtn.textContent = "Saving...";
      saveBtn.disabled = true;
      await updateImageMetadata(metadata.id, { title, details, rating100 });
      await updateImageTags(metadata.id, tagIds);
      saveBtn.textContent = "Saved \u2713";
      setTimeout(() => {
        saveBtn.textContent = "Save Changes";
        saveBtn.disabled = false;
      }, 2e3);
    });
    const organizedBtn = body.querySelector(".metadata-organized-btn");
    organizedBtn.addEventListener("click", async () => {
      const isOrganized = organizedBtn.classList.contains("active");
      const newOrganized = !isOrganized;
      await updateImageMetadata(metadata.id, { organized: newOrganized });
      organizedBtn.classList.toggle("active", newOrganized);
      organizedBtn.textContent = newOrganized ? "Organized \u2713" : "Mark Organized";
    });
  }
  var currentMetadata, currentSwiperRef;
  var init_metadata = __esm({
    "metadata.js"() {
      init_graphql();
      currentMetadata = null;
      currentSwiperRef = null;
    }
  });

  // constants.js
  var GALLERY_ICON_SVG;
  var init_constants = __esm({
    "constants.js"() {
      GALLERY_ICON_SVG = '<svg fill="white" width="16" height="16" viewBox="0 0 36 36" style="vertical-align: middle;" xmlns="http://www.w3.org/2000/svg"><path d="M32,4H4A2,2,0,0,0,2,6V30a2,2,0,0,0,2,2H32a2,2,0,0,0,2-2V6A2,2,0,0,0,32,4ZM4,30V6H32V30Z"></path><path d="M8.92,14a3,3,0,1,0-3-3A3,3,0,0,0,8.92,14Zm0-4.6A1.6,1.6,0,1,1,7.33,11,1.6,1.6,0,0,1,8.92,9.41Z"></path><path d="M22.78,15.37l-5.4,5.4-4-4a1,1,0,0,0-1.41,0L5.92,22.9v2.83l6.79-6.79L16,22.18l-3.75,3.75H15l8.45-8.45L30,24V21.18l-5.81-5.81A1,1,0,0,0,22.78,15.37Z"></path></svg>';
    }
  });

  // state.js
  var ImageDeckState, state;
  var init_state = __esm({
    "state.js"() {
      ImageDeckState = class {
        constructor() {
          this.state = {
            swiper: null,
            images: [],
            config: null,
            context: null,
            isPlaying: false,
            currentChunkPage: 1,
            chunkSize: 50,
            totalImageCount: 0,
            totalPages: 0,
            pluginConfig: null,
            autoPlayInterval: null,
            isAutoPlaying: false,
            loadingQueue: [],
            storedContextInfo: null
          };
          this.eventCallbacks = /* @__PURE__ */ new Map();
        }
        setState(newState) {
          this.state = { ...this.state, ...newState };
        }
        getState() {
          return { ...this.state };
        }
        setSwiper(swiper) {
          this.setState({ swiper });
        }
        getSwiper() {
          return this.state.swiper;
        }
        setImages(images) {
          this.setState({ images });
        }
        getImages() {
          return this.state.images;
        }
        on(event, callback) {
          if (!this.eventCallbacks.has(event)) {
            this.eventCallbacks.set(event, []);
          }
          this.eventCallbacks.get(event).push(callback);
        }
        // FIX: Add off method to remove event handlers
        off(event, callback) {
          if (!this.eventCallbacks.has(event)) {
            return;
          }
          const callbacks = this.eventCallbacks.get(event);
          const index = callbacks.indexOf(callback);
          if (index !== -1) {
            callbacks.splice(index, 1);
          }
          if (callbacks.length === 0) {
            this.eventCallbacks.delete(event);
          }
        }
        // Alternative: Add once method for one-time events
        once(event, callback) {
          const onceWrapper = (data) => {
            callback(data);
            this.off(event, onceWrapper);
          };
          this.on(event, onceWrapper);
        }
        emit(event, data) {
          const callbacks = this.eventCallbacks.get(event);
          if (callbacks) {
            const callbacksCopy = [...callbacks];
            callbacksCopy.forEach((callback) => callback(data));
          }
        }
      };
      state = new ImageDeckState();
    }
  });

  // swiper.js
  function getEffectOptions(effect, pluginConfig2) {
    const configFn = EFFECT_CONFIGS[effect] || EFFECT_CONFIGS.default;
    return configFn(pluginConfig2.effectDepth);
  }
  function extractGalleryId(galleryContainer) {
    const fromDataset = galleryContainer.dataset.galleryId;
    if (fromDataset) return fromDataset;
    const url = galleryContainer.dataset.url;
    if (!url) return null;
    const match = url.match(/\/galleries\/(\d+)/);
    return match ? match[1] : null;
  }
  function buildPreviewStack(galleryId) {
    const cards = [];
    for (let i = 0; i < 3; i++) {
      cards.push(
        `<img class="gallery-preview-card preview-${i + 1}" data-index="${i}" alt="" loading="lazy" decoding="async" />`
      );
    }
    return `<div class="gallery-preview-stack" data-gallery-id="${galleryId}" aria-hidden="true">${cards.join("")}</div>`;
  }
  function ensurePreviewStack(coverContainer, galleryId) {
    let stack = coverContainer.querySelector(".gallery-preview-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "gallery-preview-stack";
      stack.dataset.galleryId = galleryId;
      stack.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 3; i++) {
        const img = document.createElement("img");
        img.className = `gallery-preview-card preview-${i + 1}`;
        img.dataset.index = i;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        stack.appendChild(img);
      }
      coverContainer.appendChild(stack);
      stack.offsetHeight;
    }
    return stack;
  }
  async function fillGalleryPreviewsForSlide(container, galleryId) {
    const coverContainer = container.querySelector(`.gallery-cover-container:has(.gallery-cover-link[href*="/galleries/${galleryId}"])`);
    const stack = coverContainer ? ensurePreviewStack(coverContainer, galleryId) : container.querySelector(`.gallery-preview-stack[data-gallery-id="${galleryId}"]`);
    if (!stack) return;
    const emptyCards = stack.querySelectorAll("img:not([src])");
    if (emptyCards.length === 0) return;
    const previewImages = await fetchGalleryImagePreviews(galleryId, 3);
    emptyCards.forEach((card, i) => {
      if (previewImages[i]) card.src = previewImages[i];
    });
  }
  function getSlideTemplateImpl(img, contextInfo2, isEager = false) {
    const fullSrc = img.paths.image;
    const isGallery = img.url && !contextInfo2?.isSingleGallery;
    const loading = isEager ? "eager" : "lazy";
    const title = img.title || "Untitled";
    if (isGallery) {
      const imageCountDisplay = img.image_count !== void 0 ? `${GALLERY_ICON_SVG}: ${img.image_count}` : "";
      let performerDisplay = "";
      if (img.performers && img.performers.length > 0) {
        const performerNames = img.performers.map((p) => p.name).join(", ");
        performerDisplay = `<div class=\\"gallery-performers\\" style=\\"margin-top: 5px; font-size: 18px; color: #ccc;\\">${performerNames}</div>`;
      }
      const galleryIdMatch = img.url.match(/\/galleries\/(\d+)/);
      const galleryId = galleryIdMatch ? galleryIdMatch[1] : null;
      const previewStack = galleryId ? buildPreviewStack(galleryId) : "";
      return `
            <div class="swiper-zoom-container" data-type="gallery" data-url="${img.url}" data-gallery-id="${galleryId || ""}">
                <div class="gallery-cover-container">
                    <div class="gallery-cover-title" title="${title}">${title}</div>
                    ${imageCountDisplay ? `<div class=\\"gallery-image-count\\" style=\\"font-size: 18px; color: #ccc; margin-top: 3px;\\">${imageCountDisplay}</div>` : ""}
                    <a href="${img.url}" target="_blank" class="gallery-cover-link">
                        <img src="${fullSrc}" alt="${title}" decoding="async" loading="${loading}" />
                    </a>
                    ${previewStack}
                    ${performerDisplay}
                </div>
            </div>`;
    }
    return `
        <div class="swiper-zoom-container" data-type="image">
            <img src="${fullSrc}" alt="${title}" decoding="async" loading="${loading}"
                 style="max-width: 100%; height: auto; display: block; margin: 0 auto;" />
        </div>`;
  }
  function triggerPreviewFill(container) {
    const activeSlide = container.querySelector(".swiper-slide-active");
    if (!activeSlide) return;
    const galleryContainer = activeSlide.querySelector('[data-type="gallery"]');
    if (!galleryContainer) return;
    const galleryId = extractGalleryId(galleryContainer);
    if (!galleryId) return;
    const coverContainer = activeSlide.querySelector(".gallery-cover-container");
    if (coverContainer) ensurePreviewStack(coverContainer, galleryId);
    fillGalleryPreviewsForSlide(container, galleryId);
  }
  function attachHoverFill(container) {
    container.addEventListener("mouseenter", (e) => {
      const cover = e.target.closest(".gallery-cover-container");
      if (!cover) return;
      const galleryZoom = cover.closest('[data-type="gallery"]');
      if (!galleryZoom) return;
      const galleryId = extractGalleryId(galleryZoom);
      if (!galleryId) return;
      ensurePreviewStack(cover, galleryId);
      fillGalleryPreviewsForSlide(container, galleryId);
    }, true);
  }
  function initSwiper(container, images, pluginConfig2, updateUICallback, savePositionCallback, contextInfo2) {
    const swiperEl = container.querySelector(".swiper");
    if (!swiperEl || swiperEl.swiper) return swiperEl?.swiper;
    const isLooped = false;
    const effectOptions = getEffectOptions(pluginConfig2.transitionEffect, pluginConfig2);
    const swiperConfig = {
      effect: pluginConfig2.transitionEffect,
      centeredSlides: true,
      slidesPerView: 1,
      slidesPerGroup: 1,
      initialSlide: 0,
      keyboard: {
        enabled: false
      },
      mousewheel: false,
      zoom: {
        maxRatio: 3,
        minRatio: 1,
        toggle: false,
        containerClass: "swiper-zoom-container",
        zoomedSlideClass: "swiper-slide-zoomed"
      },
      doubleTapZoom: false,
      doubleTapZoomRatio: 2,
      touchEventsTarget: "container",
      touchRatio: 1,
      touchAngle: 45,
      simulateTouch: true,
      shortSwipes: true,
      longSwipes: true,
      longSwipesRatio: 0.5,
      longSwipesMs: 300,
      followFinger: true,
      allowTouchMove: true,
      allowSlideNext: true,
      allowSlidePrev: true,
      centeredSlidesBounds: true,
      centerInsufficientSlides: true,
      passiveListeners: false,
      loop: isLooped,
      loopedSlides: 2,
      loopPreventsSliding: false,
      virtual: {
        slides: images.map((img) => memoizedGetSlideTemplate(img, contextInfo2, false)),
        cache: true,
        addSlidesBefore: 3,
        addSlidesAfter: 3,
        renderSlide: (slideContent, index) => {
          return `<div class="swiper-slide" data-index="${index}">${slideContent || ""}</div>`;
        }
      },
      ...effectOptions,
      on: {
        click(s, event) {
          const interactiveElements = ["INPUT", "TEXTAREA", "SELECT", "BUTTON"];
          if (interactiveElements.includes(event.target.tagName)) {
            return;
          }
        },
        slideChange() {
          updateUICallback?.(container);
          savePositionCallback?.();
        },
        slideChangeTransitionEnd() {
          const total = this.virtual?.slides?.length || this.slides.length;
          if (total > 0 && this.activeIndex >= total - 3) {
            const nextBtn = document.querySelector('[data-action="next-chunk"]');
            if (nextBtn && !nextBtn.disabled) {
              nextBtn.click();
            }
          }
          triggerPreviewFill(container);
        },
        transitionEnd() {
          triggerPreviewFill(container);
        },
        beforeDestroy() {
          if (typeof memoizedGetSlideTemplate !== "undefined" && typeof memoizedGetSlideTemplate.clearCache === "function") {
            try {
              memoizedGetSlideTemplate.clearCache();
            } catch (e) {
              console.warn("[Image Deck] Template cache cleanup error:", e);
            }
          }
        }
      }
    };
    const swiper = new Swiper(swiperEl, swiperConfig);
    state.setSwiper(swiper);
    state.setImages(images);
    const loader = container.querySelector(".image-deck-loading");
    if (loader) loader.style.display = "none";
    attachHoverFill(container);
    triggerPreviewFill(container);
    return swiper;
  }
  var EFFECT_CONFIGS, memoizedGetSlideTemplate;
  var init_swiper = __esm({
    "swiper.js"() {
      init_constants();
      init_state();
      init_graphql();
      EFFECT_CONFIGS = {
        cards: () => ({ cardsEffect: { slideShadows: false, rotate: true, perSlideRotate: 2, perSlideOffset: 8 } }),
        coverflow: (depth) => ({ coverflowEffect: { rotate: 30, stretch: 0, depth: Math.min(depth, 100), modifier: 1, slideShadows: false } }),
        flip: () => ({ flipEffect: { slideShadows: false, limitRotation: true } }),
        cube: () => ({ cubeEffect: { shadow: false, slideShadows: false } }),
        fade: () => ({ fadeEffect: { crossFade: true }, speed: 200 }),
        default: () => ({ spaceBetween: 20, slidesPerView: 1 })
      };
      memoizedGetSlideTemplate = (() => {
        const cache = /* @__PURE__ */ new Map();
        const TTL = 3e5;
        let cleanupTimer = null;
        const MAX_CACHE_SIZE = 200;
        const cleanupExpired = () => {
          const now = Date.now();
          let expiredCount = 0;
          for (const [key, cached] of cache.entries()) {
            if (now - cached.timestamp >= TTL) {
              cache.delete(key);
              expiredCount++;
            }
          }
          if (cache.size > MAX_CACHE_SIZE) {
            const entries = Array.from(cache.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            const excess = cache.size - MAX_CACHE_SIZE;
            for (let i = 0; i < excess; i++) {
              cache.delete(entries[i][0]);
            }
          }
          if (expiredCount > 0) {
            console.log(`[Image Deck] Cleaned up ${expiredCount} expired slide templates`);
          }
        };
        const startCleanupInterval = () => {
          if (cleanupTimer) return;
          cleanupTimer = setInterval(() => {
            cleanupExpired();
            if (cache.size === 0) {
              clearInterval(cleanupTimer);
              cleanupTimer = null;
            }
          }, 6e4);
        };
        const stopCleanupInterval = () => {
          if (cleanupTimer) {
            clearInterval(cleanupTimer);
            cleanupTimer = null;
          }
        };
        const memoizedFunction = (img, contextInfo2, isEager = false) => {
          const cacheKey = `${img.id || img.url}_${JSON.stringify(contextInfo2)}_${isEager}`;
          const now = Date.now();
          if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            if (now - cached.timestamp < TTL) {
              cached.timestamp = now;
              return cached.result;
            } else {
              cache.delete(cacheKey);
            }
          }
          const result = getSlideTemplateImpl(img, contextInfo2, isEager);
          cache.set(cacheKey, { result, timestamp: now });
          startCleanupInterval();
          return result;
        };
        memoizedFunction.clearCache = () => {
          cache.clear();
          stopCleanupInterval();
        };
        memoizedFunction.getCacheSize = () => cache.size;
        memoizedFunction.cleanup = cleanupExpired;
        return memoizedFunction;
      })();
      window.memoizedGetSlideTemplate = memoizedGetSlideTemplate;
    }
  });

  // filters.js
  function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  async function searchTags2(query, limit = 20) {
    if (!query) return [];
    try {
      const q = `query SearchTags($filter: FindFilterType) {
            findTags(filter: $filter) { tags { id name } }
        }`;
      const res = await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, variables: { filter: { q: query, per_page: limit } } })
      });
      const data = await res.json();
      return data?.data?.findTags?.tags || [];
    } catch (e) {
      console.error("[Image Deck] Error searching tags:", e);
      return [];
    }
  }
  async function searchPerformers2(query, limit = 20) {
    if (!query) return [];
    try {
      const q = `query SearchPerformers($filter: FindFilterType) {
            findPerformers(filter: $filter) { performers { id name } }
        }`;
      const res = await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, variables: { filter: { q: query, per_page: limit } } })
      });
      const data = await res.json();
      return data?.data?.findPerformers?.performers || [];
    } catch (e) {
      console.error("[Image Deck] Error searching performers:", e);
      return [];
    }
  }
  async function getTagNames(tagIds) {
    if (!tagIds || tagIds.length === 0) return {};
    try {
      const tagResults = await Promise.all(tagIds.map(async (tagId) => {
        const query = `query FindTag($id: ID!) {
                findTag(id: $id) { id name }
            }`;
        const response = await fetch("/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, variables: { id: tagId } })
        });
        const data = await response.json();
        return data?.data?.findTag;
      }));
      const tagMap = {};
      tagResults.forEach((tag) => {
        if (tag) tagMap[tag.id] = tag.name;
      });
      return tagMap;
    } catch (error) {
      console.error("[Image Deck] Error fetching tag names:", error);
      return {};
    }
  }
  async function getPerformerNames(performerIds) {
    if (!performerIds || performerIds.length === 0) return {};
    try {
      const performerResults = await Promise.all(performerIds.map(async (performerId) => {
        const query = `query FindPerformer($id: ID!) {
                findPerformer(id: $id) { id name }
            }`;
        const response = await fetch("/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, variables: { id: performerId } })
        });
        const data = await response.json();
        return data?.data?.findPerformer;
      }));
      const performerMap = {};
      performerResults.forEach((performer) => {
        if (performer) performerMap[performer.id] = performer.name;
      });
      return performerMap;
    } catch (error) {
      console.error("[Image Deck] Error fetching performer names:", error);
      return {};
    }
  }
  function getCurrentFilterTags() {
    const tagFilter = sessionStorage.getItem("galleryTagFilter");
    if (tagFilter) {
      try {
        const filterObj = JSON.parse(tagFilter);
        return {
          includedTags: filterObj.includedTags || [],
          excludedTags: filterObj.excludedTags || [],
          includedPerformers: filterObj.includedPerformers || [],
          excludedPerformers: filterObj.excludedPerformers || []
        };
      } catch (e) {
        console.error("Error parsing tag filter:", e);
      }
    }
    return { includedTags: [], excludedTags: [], includedPerformers: [], excludedPerformers: [] };
  }
  function getSavedFilterSelection() {
    const id = localStorage.getItem(SAVED_FILTER_ID_KEY);
    const mode = localStorage.getItem(SAVED_FILTER_MODE_KEY);
    return id ? { id, mode: mode || null } : null;
  }
  function setSavedFilterSelection(id, mode) {
    if (id) {
      localStorage.setItem(SAVED_FILTER_ID_KEY, id);
      localStorage.setItem(SAVED_FILTER_MODE_KEY, mode || "");
    } else {
      localStorage.removeItem(SAVED_FILTER_ID_KEY);
      localStorage.removeItem(SAVED_FILTER_MODE_KEY);
    }
  }
  async function fetchSavedFilters(mode) {
    if (!mode) return [];
    const query = `query FindSavedFilters($mode: FilterMode!) {
        findSavedFilters(mode: $mode) {
            id
            name
            mode
            find_filter { q page per_page sort direction }
            object_filter
        }
    }`;
    try {
      const res = await fetch("/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { mode } })
      });
      const data = await res.json();
      if (data.errors) throw new Error(data.errors[0].message);
      return data?.data?.findSavedFilters || [];
    } catch (e) {
      console.error("[Image Deck] Error fetching saved filters:", e);
      return [];
    }
  }
  function normalizeCriterionValue(val) {
    if (Array.isArray(val)) {
      return val.map((v) => {
        if (v && typeof v === "object" && v.id !== void 0) return v.id;
        return v;
      }).filter((v) => v !== void 0 && v !== null);
    }
    if (val && typeof val === "object" && val.id !== void 0) return val.id;
    return val;
  }
  function normalizeSavedFilterField(field, criterion) {
    if (field === "organized" || field === "performer_favorite" || field === "is_zip" || field === "has_chapters") {
      return typeof criterion === "boolean" ? criterion : criterion?.value !== void 0 ? criterion.value : criterion;
    }
    if (field === "AND" || field === "OR" || field === "NOT") {
      if (Array.isArray(criterion)) {
        const mapped = criterion.map(mapCriterionToGraphQL).filter(Boolean);
        if (mapped.length === 0) return void 0;
        return mapped.length === 1 ? mapped[0] : mapped;
      }
      if (criterion?.type && mapCriterionToGraphQL(criterion)) {
        return mapCriterionToGraphQL(criterion);
      }
      return criterion;
    }
    if (criterion && typeof criterion === "object" && criterion.type && (criterion.modifier !== void 0 || criterion.value !== void 0)) {
      const mapped = mapCriterionToGraphQL(criterion);
      return mapped ? mapped[field] : void 0;
    }
    if (INT_CRITERION_FIELDS2.includes(field)) {
      return normalizeIntCriterion(criterion);
    }
    if (MULTI_CRITERION_FIELDS2.includes(field)) {
      return coerceMultiCriterion(criterion);
    }
    if (criterion && typeof criterion === "object") {
      const normalized = { ...criterion };
      if (normalized.value !== void 0) normalized.value = normalizeCriterionValue(normalized.value);
      if (normalized.excludes !== void 0) normalized.excludes = normalizeCriterionValue(normalized.excludes);
      return normalized;
    }
    return criterion;
  }
  function applySavedFilterToContext(context, savedFilter) {
    if (!context || !savedFilter) return context;
    if (savedFilter.mode) {
      const modeLower = savedFilter.mode.toLowerCase();
      if (["images", "galleries"].includes(modeLower)) {
        context.type = modeLower;
      } else {
        console.warn("[Image Deck] Saved filter mode is not supported by Image Deck:", savedFilter.mode);
      }
    }
    if (!context.filter) context.filter = {};
    const preserved = {
      page: context.filter.page,
      perPage: context.filter.perPage
    };
    const objFilter = savedFilter.object_filter;
    if (objFilter && typeof objFilter === "object") {
      if (objFilter.type && (objFilter.modifier !== void 0 || objFilter.value !== void 0)) {
        const mapped = mapCriterionToGraphQL(objFilter);
        context.filter = { ...preserved, ...mapped || {} };
      } else if (Array.isArray(objFilter)) {
        const mapped = objFilter.map(mapCriterionToGraphQL).filter(Boolean);
        if (mapped.length === 0) {
          context.filter = { ...preserved };
        } else if (mapped.length === 1) {
          context.filter = { ...preserved, ...mapped[0] };
        } else {
          context.filter = { ...preserved, AND: mapped };
        }
      } else {
        const normalized = {};
        Object.keys(objFilter).forEach((field) => {
          const controlFields = ["page", "perPage", "sortBy", "sortDir", "q", "hash"];
          if (controlFields.includes(field)) return;
          const value = normalizeSavedFilterField(field, objFilter[field]);
          if (value !== void 0) normalized[field] = value;
        });
        context.filter = { ...preserved, ...normalized };
      }
    }
    if (savedFilter.find_filter && typeof savedFilter.find_filter === "object") {
      const ff = savedFilter.find_filter;
      if (ff.sort) context.filter.sortBy = ff.sort;
      if (ff.direction) context.filter.sortDir = ff.direction.toLowerCase();
      if (ff.q) context.filter.q = ff.q;
      if (typeof ff.per_page === "number" && ff.per_page > 0) {
        context.filter.perPage = ff.per_page;
      }
    }
    return context;
  }
  async function buildDeckContext() {
    let context = detectContext();
    const savedSelection = getSavedFilterSelection();
    if (savedSelection?.id) {
      const mode = savedSelection.mode || (context.type === "galleries" ? "GALLERIES" : "IMAGES");
      const savedFilters = await fetchSavedFilters(mode);
      const savedFilter = savedFilters.find((f) => f.id === savedSelection.id);
      if (savedFilter) {
        context = applySavedFilterToContext(context, savedFilter);
      } else {
        console.warn("[Image Deck] Previously selected saved filter not found, clearing:", savedSelection.id);
        setSavedFilterSelection(null);
      }
    }
    return context;
  }
  function addPendingFilter(id, type, mode) {
    if (type === "tag") {
      if (mode === "include") {
        if (!sidebarPendingFilters.includedTags.includes(id)) sidebarPendingFilters.includedTags.push(id);
        sidebarPendingFilters.excludedTags = sidebarPendingFilters.excludedTags.filter((x) => x !== id);
      } else {
        if (!sidebarPendingFilters.excludedTags.includes(id)) sidebarPendingFilters.excludedTags.push(id);
        sidebarPendingFilters.includedTags = sidebarPendingFilters.includedTags.filter((x) => x !== id);
      }
    } else {
      if (mode === "include") {
        if (!sidebarPendingFilters.includedPerformers.includes(id)) sidebarPendingFilters.includedPerformers.push(id);
        sidebarPendingFilters.excludedPerformers = sidebarPendingFilters.excludedPerformers.filter((x) => x !== id);
      } else {
        if (!sidebarPendingFilters.excludedPerformers.includes(id)) sidebarPendingFilters.excludedPerformers.push(id);
        sidebarPendingFilters.includedPerformers = sidebarPendingFilters.includedPerformers.filter((x) => x !== id);
      }
    }
  }
  async function renderPendingFilters(container) {
    const target = container.querySelector(".sidebar-pending-filters");
    if (!target) return;
    const { includedTags, excludedTags, includedPerformers, excludedPerformers } = sidebarPendingFilters;
    const [tagNames, performerNames] = await Promise.all([
      getTagNames([...includedTags, ...excludedTags]),
      getPerformerNames([...includedPerformers, ...excludedPerformers])
    ]);
    const pills = [];
    includedTags.forEach((id) => pills.push({ id, type: "tag", mode: "included", name: tagNames[id] || `Tag:${id}` }));
    excludedTags.forEach((id) => pills.push({ id, type: "tag", mode: "excluded", name: tagNames[id] || `Tag:${id}` }));
    includedPerformers.forEach((id) => pills.push({ id, type: "performer", mode: "included", name: performerNames[id] || `Performer:${id}` }));
    excludedPerformers.forEach((id) => pills.push({ id, type: "performer", mode: "excluded", name: performerNames[id] || `Performer:${id}` }));
    if (!pills.length) {
      target.innerHTML = '<div class="sidebar-empty-state">No filters selected</div>';
      return;
    }
    target.innerHTML = pills.map(
      (p) => `<span class="sidebar-filter-pill ${p.mode === "included" ? "include" : "exclude"}" data-id="${p.id}" data-type="${p.type}" data-mode="${p.mode}">${p.mode === "included" ? "\u2705" : "\u274C"} ${escapeHtml(p.name)}<button class="remove-pill" type="button">\xD7</button></span>`
    ).join("");
  }
  async function renderSavedFilterDropdown(container, contextInfo2, onSavedFilterChange) {
    const select = container.querySelector(".sidebar-saved-filter-select");
    if (!select) return;
    const mode = contextInfo2?.type === "galleries" ? "GALLERIES" : "IMAGES";
    const savedFilters = await fetchSavedFilters(mode);
    const selection = getSavedFilterSelection();
    select.innerHTML = '<option value="">-- Current view --</option>';
    savedFilters.forEach((f) => {
      const option = document.createElement("option");
      option.value = f.id;
      option.textContent = f.name;
      if (selection?.id === f.id) {
        option.selected = true;
      }
      select.appendChild(option);
    });
    if (selection?.id) {
      select.value = selection.id;
    }
    const newSelect = select.cloneNode(true);
    select.parentNode.replaceChild(newSelect, select);
    if (selection?.id) {
      newSelect.value = selection.id;
      Array.from(newSelect.options).forEach((opt) => {
        opt.selected = opt.value === selection.id;
      });
    }
    newSelect.addEventListener("change", async (e) => {
      const selected = savedFilters.find((f) => f.id === e.target.value);
      if (selected) {
        setSavedFilterSelection(selected.id, selected.mode);
        sessionStorage.removeItem("galleryTagFilter");
      } else {
        setSavedFilterSelection(null);
      }
      if (onSavedFilterChange) {
        await onSavedFilterChange(selected || null);
      }
    });
  }
  async function renderActiveFilters(container, callbacks = {}) {
    const { onFilterRemoved } = callbacks;
    const target = container.querySelector(".sidebar-active-filters");
    if (!target) return;
    target.innerHTML = "";
    const current = getCurrentFilterTags();
    const includedTags = current.includedTags || [];
    const excludedTags = current.excludedTags || [];
    const includedPerformers = current.includedPerformers || [];
    const excludedPerformers = current.excludedPerformers || [];
    if (!includedTags.length && !excludedTags.length && !includedPerformers.length && !excludedPerformers.length) {
      target.innerHTML = '<div class="sidebar-empty-state">No filters applied</div>';
      return;
    }
    const [tagNames, performerNames] = await Promise.all([
      getTagNames([...includedTags, ...excludedTags]),
      getPerformerNames([...includedPerformers, ...excludedPerformers])
    ]);
    const pills = [];
    includedTags.forEach((id) => pills.push({ id, type: "tag", mode: "included", name: tagNames[id] || `Tag:${id}` }));
    excludedTags.forEach((id) => pills.push({ id, type: "tag", mode: "excluded", name: tagNames[id] || `Tag:${id}` }));
    includedPerformers.forEach((id) => pills.push({ id, type: "performer", mode: "included", name: performerNames[id] || `Performer:${id}` }));
    excludedPerformers.forEach((id) => pills.push({ id, type: "performer", mode: "excluded", name: performerNames[id] || `Performer:${id}` }));
    target.innerHTML = pills.map(
      (p) => `<span class="sidebar-filter-pill ${p.mode === "included" ? "include" : "exclude"}" data-id="${p.id}" data-type="${p.type}" data-mode="${p.mode}">${p.mode === "included" ? "\u2705" : "\u274C"} ${escapeHtml(p.name)}<button class="remove-filter-tag remove-pill" type="button" data-id="${p.id}" data-type="${p.type}" data-mode="${p.mode}">\xD7</button></span>`
    ).join("");
    target.querySelectorAll(".remove-filter-tag").forEach((btn) => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = newBtn.dataset.id;
        const type = newBtn.dataset.type;
        const mode = newBtn.dataset.mode;
        const currentTags = getCurrentFilterTags();
        let newIncludedTags = [...currentTags.includedTags || []];
        let newExcludedTags = [...currentTags.excludedTags || []];
        let newIncludedPerformers = [...currentTags.includedPerformers || []];
        let newExcludedPerformers = [...currentTags.excludedPerformers || []];
        if (type === "tag") {
          if (mode === "included") newIncludedTags = newIncludedTags.filter((x) => x !== id);
          else newExcludedTags = newExcludedTags.filter((x) => x !== id);
        } else {
          if (mode === "included") newIncludedPerformers = newIncludedPerformers.filter((x) => x !== id);
          else newExcludedPerformers = newExcludedPerformers.filter((x) => x !== id);
        }
        if (newIncludedTags.length || newExcludedTags.length || newIncludedPerformers.length || newExcludedPerformers.length) {
          sessionStorage.setItem("galleryTagFilter", JSON.stringify({
            includedTags: newIncludedTags,
            excludedTags: newExcludedTags,
            includedPerformers: newIncludedPerformers,
            excludedPerformers: newExcludedPerformers
          }));
        } else {
          sessionStorage.removeItem("galleryTagFilter");
        }
        sidebarPendingFilters = {
          includedTags: newIncludedTags,
          excludedTags: newExcludedTags,
          includedPerformers: newIncludedPerformers,
          excludedPerformers: newExcludedPerformers
        };
        renderPendingFilters(container);
        window.dispatchEvent(new CustomEvent("galleryTagFilterChanged"));
        if (onFilterRemoved) {
          await onFilterRemoved();
        }
        await renderActiveFilters(container, callbacks);
      });
    });
  }
  async function updateFilterDisplayInUI(callbacks = {}) {
    const container = document.querySelector(".image-deck-container");
    if (container) return renderActiveFilters(container, callbacks);
  }
  function initSidebarFilters(container, callbacks = {}) {
    const { onApplyFilters, onClearFilters, onFilterRemoved, onSavedFilterChange, contextInfo: contextInfo2 } = callbacks;
    const sidebar = container.querySelector(".image-deck-sidebar");
    if (!sidebar) return;
    const current = getCurrentFilterTags();
    sidebarPendingFilters = {
      includedTags: [...current.includedTags || []],
      excludedTags: [...current.excludedTags || []],
      includedPerformers: [...current.includedPerformers || []],
      excludedPerformers: [...current.excludedPerformers || []]
    };
    renderPendingFilters(container);
    if (contextInfo2) {
      renderSavedFilterDropdown(container, contextInfo2, onSavedFilterChange);
    }
    const modeButtons = sidebar.querySelectorAll(".filter-mode-btn");
    modeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        modeButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
    const tagInput = sidebar.querySelector(".sidebar-tag-search");
    const tagResults = sidebar.querySelector(".sidebar-tag-results");
    let tagDebounce;
    tagInput?.addEventListener("input", (e) => {
      clearTimeout(tagDebounce);
      const q = e.target.value.trim();
      if (!q) {
        tagResults.innerHTML = "";
        tagResults.classList.remove("active");
        return;
      }
      tagDebounce = setTimeout(async () => {
        const tags = await searchTags2(q);
        tagResults.innerHTML = tags.map(
          (t) => `<div class="sidebar-tag-result" data-id="${t.id}" data-type="tag" data-name="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>`
        ).join("");
        tagResults.classList.toggle("active", tags.length > 0);
      }, 250);
    });
    tagResults?.addEventListener("click", (e) => {
      const result = e.target.closest(".sidebar-tag-result");
      if (!result) return;
      const activeMode = sidebar.querySelector(".filter-mode-btn.active")?.dataset.mode || "include";
      addPendingFilter(result.dataset.id, result.dataset.type, activeMode);
      renderPendingFilters(container);
      tagInput.value = "";
      tagResults.innerHTML = "";
      tagResults.classList.remove("active");
    });
    const performerInput = sidebar.querySelector(".sidebar-performer-search");
    const performerResults = sidebar.querySelector(".sidebar-performer-results");
    let performerDebounce;
    performerInput?.addEventListener("input", (e) => {
      clearTimeout(performerDebounce);
      const q = e.target.value.trim();
      if (!q) {
        performerResults.innerHTML = "";
        performerResults.classList.remove("active");
        return;
      }
      performerDebounce = setTimeout(async () => {
        const performers = await searchPerformers2(q);
        performerResults.innerHTML = performers.map(
          (p) => `<div class="sidebar-tag-result" data-id="${p.id}" data-type="performer" data-name="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>`
        ).join("");
        performerResults.classList.toggle("active", performers.length > 0);
      }, 250);
    });
    performerResults?.addEventListener("click", (e) => {
      const result = e.target.closest(".sidebar-tag-result");
      if (!result) return;
      const activeMode = sidebar.querySelector(".filter-mode-btn.active")?.dataset.mode || "include";
      addPendingFilter(result.dataset.id, result.dataset.type, activeMode);
      renderPendingFilters(container);
      performerInput.value = "";
      performerResults.innerHTML = "";
      performerResults.classList.remove("active");
    });
    const pendingContainer = sidebar.querySelector(".sidebar-pending-filters");
    pendingContainer?.addEventListener("click", (e) => {
      const btn = e.target.closest(".remove-pill");
      if (!btn) return;
      const pill = btn.closest(".sidebar-filter-pill");
      const id = pill.dataset.id;
      const type = pill.dataset.type;
      const mode = pill.dataset.mode;
      if (type === "tag") {
        if (mode === "included") sidebarPendingFilters.includedTags = sidebarPendingFilters.includedTags.filter((x) => x !== id);
        else sidebarPendingFilters.excludedTags = sidebarPendingFilters.excludedTags.filter((x) => x !== id);
      } else {
        if (mode === "included") sidebarPendingFilters.includedPerformers = sidebarPendingFilters.includedPerformers.filter((x) => x !== id);
        else sidebarPendingFilters.excludedPerformers = sidebarPendingFilters.excludedPerformers.filter((x) => x !== id);
      }
      renderPendingFilters(container);
    });
    sidebar.querySelector(".sidebar-apply-btn")?.addEventListener("click", async () => {
      const hasAny = sidebarPendingFilters.includedTags.length || sidebarPendingFilters.excludedTags.length || sidebarPendingFilters.includedPerformers.length || sidebarPendingFilters.excludedPerformers.length;
      if (hasAny) {
        sessionStorage.setItem("galleryTagFilter", JSON.stringify(sidebarPendingFilters));
      } else {
        sessionStorage.removeItem("galleryTagFilter");
      }
      window.dispatchEvent(new CustomEvent("galleryTagFilterChanged"));
      if (onApplyFilters) {
        await onApplyFilters();
      }
      await renderActiveFilters(container, { onFilterRemoved });
    });
    sidebar.querySelector(".sidebar-clear-btn")?.addEventListener("click", async () => {
      sidebarPendingFilters = { includedTags: [], excludedTags: [], includedPerformers: [], excludedPerformers: [] };
      renderPendingFilters(container);
      sessionStorage.removeItem("galleryTagFilter");
      window.dispatchEvent(new CustomEvent("galleryTagFilterChanged"));
      if (onClearFilters) {
        await onClearFilters();
      }
      await renderActiveFilters(container, { onFilterRemoved });
    });
    const toggleBtn = container.querySelector(".image-deck-sidebar-toggle");
    if (toggleBtn) {
      const newToggle = toggleBtn.cloneNode(true);
      toggleBtn.parentNode.replaceChild(newToggle, toggleBtn);
      newToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = container.classList.toggle("sidebar-open");
        if (isOpen) {
          container.classList.remove("hiding-ui");
        }
      });
    }
    const closeBtn = sidebar.querySelector(".image-deck-sidebar-close");
    if (closeBtn) {
      const newClose = closeBtn.cloneNode(true);
      closeBtn.parentNode.replaceChild(newClose, closeBtn);
      newClose.addEventListener("click", (e) => {
        e.stopPropagation();
        container.classList.remove("sidebar-open");
      });
    }
    const outsideClickHandler = (e) => {
      if (!container.classList.contains("sidebar-open")) return;
      if (e.target.closest(".image-deck-sidebar")) return;
      if (e.target.closest(".image-deck-sidebar-toggle")) return;
      container.classList.remove("sidebar-open");
    };
    document.addEventListener("click", outsideClickHandler);
    const keyHandler = (e) => {
      if (e.key === "Escape" && container.classList.contains("sidebar-open")) {
        container.classList.remove("sidebar-open");
      }
    };
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("click", outsideClickHandler);
      document.removeEventListener("keydown", keyHandler);
    };
  }
  var sidebarPendingFilters, SAVED_FILTER_ID_KEY, SAVED_FILTER_MODE_KEY, INT_CRITERION_FIELDS2, MULTI_CRITERION_FIELDS2;
  var init_filters = __esm({
    "filters.js"() {
      init_constants();
      init_context();
      init_context();
      sidebarPendingFilters = { includedTags: [], excludedTags: [], includedPerformers: [], excludedPerformers: [] };
      SAVED_FILTER_ID_KEY = "imageDeckSavedFilterId";
      SAVED_FILTER_MODE_KEY = "imageDeckSavedFilterMode";
      INT_CRITERION_FIELDS2 = [
        "id",
        "rating100",
        "o_counter",
        "file_count",
        "image_count",
        "performer_count",
        "tag_count",
        "performer_age",
        "height",
        "width"
      ];
      MULTI_CRITERION_FIELDS2 = [
        "tags",
        "performer_tags",
        "studio_tags",
        "child_tags",
        "parent_tags",
        "performers",
        "galleries",
        "scenes",
        "movies",
        "groups",
        "studios"
      ];
    }
  });

  // sidebar.js
  function ensureModeIndicator(container, onClick) {
    const modeSection = container.querySelector(".image-deck-sidebar .mode-section .sidebar-section-content");
    if (!modeSection) return null;
    let modeIndicator = modeSection.querySelector(".mode-indicator");
    if (!modeIndicator) {
      modeIndicator = document.createElement("button");
      modeIndicator.className = "mode-indicator";
      modeIndicator.type = "button";
      modeSection.appendChild(modeIndicator);
    }
    if (onClick && !modeIndicator.dataset.deckHandler) {
      modeIndicator.addEventListener("click", onClick);
      modeIndicator.dataset.deckHandler = "true";
    }
    return modeIndicator;
  }
  var init_sidebar = __esm({
    "sidebar.js"() {
      init_filters();
      init_filters();
    }
  });

  // controls.js
  var controls_exports = {};
  __export(controls_exports, {
    cleanupEventHandlers: () => cleanupEventHandlers,
    setDeckActive: () => setDeckActive,
    setupEventHandlers: () => setupEventHandlers
  });
  function toggleFullscreen() {
    const container = document.querySelector(".image-deck-container");
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch((err) => {
        console.warn("[Image Deck] Fullscreen request failed:", err);
      }).finally(() => {
        updateFullscreenUI(true);
      });
    } else {
      document.exitFullscreen().finally(() => {
        updateFullscreenUI(false);
      });
    }
  }
  function updateFullscreenUI(isFullscreen) {
    const fullscreenBtn = document.querySelector(".image-deck-fullscreen");
    if (fullscreenBtn) {
      fullscreenBtn.textContent = isFullscreen ? "\u26F6" : "\u26F6";
    }
    const container = document.querySelector(".image-deck-container");
    if (container) {
      if (isFullscreen) {
        container.classList.add("fullscreen-mode");
      } else {
        container.classList.remove("fullscreen-mode");
        const swiper = state.getSwiper();
        if (!swiper?.zoom || swiper.zoom.scale <= 1) {
          container.classList.remove("hiding-ui");
        }
      }
    }
  }
  function isModalOpen() {
    const metadataModal = document.querySelector(".image-deck-metadata-modal");
    const filterModal = document.querySelector(".gallery-tag-filter-modal");
    return metadataModal?.classList.contains("active") || !!filterModal;
  }
  function isSidebarOpen() {
    const container = document.querySelector(".image-deck-container");
    return container?.classList.contains("sidebar-open") || false;
  }
  function isZoomed() {
    const swiper = state.getSwiper();
    return swiper?.zoom && swiper.zoom.scale > 1;
  }
  function updateControlVisibility(isVisible = true) {
    const container = document.querySelector(".image-deck-container");
    if (!container) return;
    if (!isVisible && (isModalOpen() || isSidebarOpen())) return;
    if (isVisible) {
      container.classList.remove("hiding-ui");
    } else {
      container.classList.add("hiding-ui");
    }
  }
  function showControls() {
    if (isModalOpen() || isSidebarOpen()) return;
    updateControlVisibility(true);
    startIdleTimer();
  }
  function hideControls() {
    if (isModalOpen() || isSidebarOpen()) return;
    if (isZoomed()) return;
    updateControlVisibility(false);
  }
  function startIdleTimer() {
    stopIdleTimer();
    idleTimer = setTimeout(() => {
      hideControls();
    }, IDLE_HIDE_DELAY);
  }
  function stopIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }
  function syncControlVisibilityWithZoom() {
    const container = document.querySelector(".image-deck-container");
    const swiper = state.getSwiper();
    if (!container || !swiper?.zoom) return;
    if (isSidebarOpen()) return;
    if (swiper.zoom.scale > 1) {
      if (!container.classList.contains("hiding-ui")) {
        container.classList.add("hiding-ui");
      }
    } else {
      container.classList.remove("hiding-ui");
    }
  }
  function isCurrentSlideGallery() {
    const swiper = state.getSwiper();
    if (!swiper) return false;
    const currentImages2 = window.currentImages || [];
    const currentImage = currentImages2[swiper.activeIndex];
    if (currentImage) {
      return !!(currentImage.url && currentImage.image_count !== void 0);
    }
    const activeSlide = swiper.slides[swiper.activeIndex];
    if (activeSlide) {
      const zoomContainer = activeSlide.querySelector(".swiper-zoom-container");
      return zoomContainer?.dataset.type === "gallery";
    }
    return false;
  }
  function updateGalleryStateClass() {
    const container = document.querySelector(".image-deck-container");
    if (!container) return;
    if (isCurrentSlideGallery()) {
      container.classList.add("gallery-active");
    } else {
      container.classList.remove("gallery-active");
    }
  }
  async function updateContentViewWithFilter() {
    const tagFilter = sessionStorage.getItem("galleryTagFilter");
    let tagIds = [];
    if (tagFilter) {
      try {
        tagIds = JSON.parse(tagFilter);
      } catch (e) {
        console.error("Error parsing tag filter:", e);
      }
    }
    window.dispatchEvent(new CustomEvent("updateDeckContent", {
      detail: { tagIds }
    }));
  }
  function getCurrentFilterTags2() {
    const tagFilter = sessionStorage.getItem("galleryTagFilter");
    if (tagFilter) {
      try {
        const filterObj = JSON.parse(tagFilter);
        return {
          includedTags: filterObj.includedTags || [],
          excludedTags: filterObj.excludedTags || [],
          includedPerformers: filterObj.includedPerformers || [],
          excludedPerformers: filterObj.excludedPerformers || []
        };
      } catch (e) {
        console.error("Error parsing tag filter:", e);
      }
    }
    return { includedTags: [], excludedTags: [], includedPerformers: [], excludedPerformers: [] };
  }
  function setupEventHandlers(container, callbacks = {}) {
    const { closeDeck: closeDeck2, startAutoPlay: startAutoPlay2, stopAutoPlay: stopAutoPlay2, loadNextChunk: loadNextChunk2 } = callbacks;
    setDeckActive(true);
    const filterChangeListener = async (e) => {
      console.log("[Image Deck] Filter changed, updating content");
      storedContextInfo = detectContext();
      await updateContentViewWithFilter();
    };
    window.addEventListener("galleryTagFilterChanged", filterChangeListener);
    const closeBtn = container.querySelector(".image-deck-close");
    if (closeBtn) {
      eventManager.add(closeBtn, "click", closeDeck2);
    }
    const fullscreenBtn = container.querySelector(".image-deck-fullscreen");
    if (fullscreenBtn) {
      eventManager.add(fullscreenBtn, "click", toggleFullscreen);
    }
    const metadataCloseBtn = container.querySelector(".image-deck-metadata-close");
    if (metadataCloseBtn) {
      eventManager.add(metadataCloseBtn, "click", () => {
        closeMetadataModal();
        showControls();
      });
    }
    const controlButtons = container.querySelectorAll(".image-deck-control-btn");
    controlButtons.forEach((button) => {
      eventManager.add(button, "click", (e) => {
        showControls();
        const action = button.dataset.action;
        const swiper2 = state.getSwiper();
        if (!action) return;
        switch (action) {
          case "prev":
            if (swiper2) swiper2.slidePrev();
            break;
          case "next":
            if (swiper2) {
              swiper2.slideNext();
              setTimeout(() => loadNextChunk2(), 100);
            }
            break;
          case "play": {
            const playBtn = document.querySelector('[data-action="play"]');
            const isAutoPlaying2 = playBtn?.classList.contains("active");
            if (isAutoPlaying2) stopAutoPlay2();
            else startAutoPlay2();
            break;
          }
          case "info":
            stopIdleTimer();
            updateControlVisibility(false);
            openMetadataModal();
            break;
          case "zoom-in":
            if (swiper2?.zoom && !isCurrentSlideGallery()) cycleZoom(swiper2, "in");
            break;
          case "zoom-out":
            if (swiper2?.zoom && !isCurrentSlideGallery()) cycleZoom(swiper2, "out");
            break;
          case "next-chunk":
            loadNextChunk2();
            break;
          default:
            console.log("[Image Deck] Unknown action:", action);
        }
      });
    });
    const removeTagButtons = container.querySelectorAll(".remove-filter-tag");
    removeTagButtons.forEach((button) => {
      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);
      eventManager.add(newButton, "click", async (e) => {
        e.stopPropagation();
        showControls();
        const tagId = newButton.dataset.tagId;
        const performerId = newButton.dataset.performerId;
        const currentTags = getCurrentFilterTags2();
        let newIncludedTags = currentTags.includedTags.filter((id) => id !== tagId);
        let newExcludedTags = currentTags.excludedTags.filter((id) => id !== tagId);
        let newIncludedPerformers = currentTags.includedPerformers.filter((id) => id !== performerId);
        let newExcludedPerformers = currentTags.excludedPerformers.filter((id) => id !== performerId);
        if (newIncludedTags.length || newExcludedTags.length || newIncludedPerformers.length || newExcludedPerformers.length) {
          sessionStorage.setItem("galleryTagFilter", JSON.stringify({
            includedTags: newIncludedTags,
            excludedTags: newExcludedTags,
            includedPerformers: newIncludedPerformers,
            excludedPerformers: newExcludedPerformers
          }));
        } else {
          sessionStorage.removeItem("galleryTagFilter");
        }
        window.dispatchEvent(new CustomEvent("galleryTagFilterChanged"));
        await updateContentViewWithFilter();
      });
    });
    const swiper = state.getSwiper();
    let slideChangeListener = null;
    let zoomChangeListener = null;
    if (swiper) {
      if (swiper.keyboard?.disable) {
        swiper.keyboard.disable();
      }
      slideChangeListener = function() {
        updateGalleryStateClass();
        if (!swiper.zoom || swiper.zoom.scale <= 1) {
          updateControlVisibility(true);
        }
        showControls();
      };
      swiper.on("slideChangeTransitionEnd", slideChangeListener);
      zoomChangeListener = function() {
        syncControlVisibilityWithZoom();
      };
      swiper.on("zoomChange", zoomChangeListener);
      setTimeout(() => {
        updateGalleryStateClass();
        syncControlVisibilityWithZoom();
        showControls();
      }, 0);
    }
    let lastActivityTime = 0;
    const activityHandler = () => {
      const now = Date.now();
      if (now - lastActivityTime < ACTIVITY_THROTTLE) return;
      lastActivityTime = now;
      showControls();
    };
    ["mousemove", "mousedown", "pointerdown", "wheel", "touchstart", "touchmove"].forEach((evt) => {
      eventManager.add(document, evt, activityHandler, { passive: true });
    });
    keyboardHandlerWithActions = (e) => handleKeyboard(e, callbacks);
    eventManager.add(document, "keydown", keyboardHandlerWithActions, true);
    setupSwipeGestures(container, eventManager);
    setupMouseWheel(container, eventManager);
    cleanupFunctions.push(() => {
      window.removeEventListener("galleryTagFilterChanged", filterChangeListener);
    });
    if (slideChangeListener || zoomChangeListener) {
      window._imageDeckSwiperCleanup = () => {
        if (swiper) {
          if (slideChangeListener) swiper.off("slideChangeTransitionEnd", slideChangeListener);
          if (zoomChangeListener) swiper.off("zoomChange", zoomChangeListener);
        }
      };
    }
  }
  function setupSwipeGestures(container, eventManager2) {
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    let touchMoved = false;
    let touchCancelled = false;
    let doubleTapTimer = null;
    const swiperEl = container.querySelector(".image-deck-swiper");
    if (!swiperEl) return;
    const clearDoubleTapTimer = () => {
      if (doubleTapTimer) {
        clearTimeout(doubleTapTimer);
        doubleTapTimer = null;
      }
    };
    const touchHandler = {
      handleTouchStart: (e) => {
        if (e.target.closest(".image-deck-metadata-modal, .gallery-tag-filter-modal") || ["INPUT", "TEXTAREA", "BUTTON"].includes(e.target.tagName)) {
          return;
        }
        touchMoved = false;
        touchCancelled = false;
        const touch = e.touches[0];
        touchStartTime = Date.now();
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        if (isZoomed()) {
          touchCancelled = true;
        }
        if (!isZoomed()) {
          showControls();
        }
      },
      handleTouchMove: (e) => {
        if (touchCancelled || e.touches.length > 1) return;
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          const deltaX = Math.abs(touch.clientX - touchStartX);
          const deltaY = Math.abs(touch.clientY - touchStartY);
          if (deltaX > 10 || deltaY > 10) {
            touchMoved = true;
            clearDoubleTapTimer();
          }
          if (isZoomed()) {
            touchCancelled = true;
          }
        }
      },
      handleTouchEnd: (e) => {
        if (e.changedTouches.length === 0) return;
        const currentTime = Date.now();
        const touchTime = currentTime - touchStartTime;
        const touch = e.changedTouches[0];
        if (!touchMoved && touchTime < 200) {
          if (currentTime - lastTapTime < 300 && Math.abs(touch.clientX - lastTapX) < 50 && Math.abs(touch.clientY - lastTapY) < 50) {
            clearDoubleTapTimer();
            handleDoubleTapZoom(e, container);
            lastTapTime = 0;
            return;
          } else {
            lastTapTime = currentTime;
            lastTapX = touch.clientX;
            lastTapY = touch.clientY;
          }
        }
        if (touchCancelled) {
          setTimeout(() => {
            syncControlVisibilityWithZoom();
          }, 50);
          return;
        }
        if (touchMoved && touchTime > 50 && touchTime < 500 && !isZoomed() && !document.fullscreenElement) {
          const deltaX = Math.abs(touch.clientX - touchStartX);
          const deltaY = touch.clientY - touchStartY;
          const screenHeight = window.innerHeight || screen.height;
          const startedNearTop = touchStartY < screenHeight * 0.25;
          const isDecisiveSwipe = deltaY > 180 && deltaX < 80;
          if (startedNearTop && isDecisiveSwipe) {
            const closeBtn = container.querySelector(".image-deck-close");
            if (closeBtn) closeBtn.click();
          }
        }
        setTimeout(() => {
          syncControlVisibilityWithZoom();
          if (!isZoomed()) {
            showControls();
          }
        }, 50);
      }
    };
    eventManager2.add(swiperEl, "touchstart", touchHandler.handleTouchStart, { passive: false });
    eventManager2.add(swiperEl, "touchmove", touchHandler.handleTouchMove, { passive: false });
    eventManager2.add(swiperEl, "touchend", touchHandler.handleTouchEnd, { passive: true });
    eventManager2.add(swiperEl, "contextmenu", (e) => e.preventDefault());
    eventManager2.add(swiperEl, "gesturestart", (e) => e.preventDefault());
    eventManager2.add(swiperEl, "gesturechange", (e) => e.preventDefault());
    eventManager2.add(swiperEl, "gestureend", (e) => e.preventDefault());
  }
  function cycleZoom(swiper, direction = "in") {
    if (!swiper?.zoom) return;
    const currentScale = swiper.zoom.scale || 1;
    if (direction === "in") {
      if (currentScale <= 1.1) {
        swiper.zoom.in(2);
      } else if (currentScale <= 2.2) {
        swiper.zoom.in(3.5);
      } else {
        swiper.zoom.out();
      }
    } else {
      if (currentScale > 2.2) {
        swiper.zoom.in(2);
      } else if (currentScale > 1.1) {
        swiper.zoom.out();
      }
    }
    setTimeout(syncControlVisibilityWithZoom, 50);
  }
  function handleDoubleTapZoom(event, container) {
    const swiper = state.getSwiper();
    if (!swiper?.zoom) return;
    event.preventDefault();
    event.stopPropagation();
    if (isCurrentSlideGallery()) {
      console.log("[Image Deck] Double tap ignored - gallery slide");
      return;
    }
    cycleZoom(swiper, "in");
  }
  function setupMouseWheel(container, eventManager2) {
    const swiperEl = container.querySelector(".image-deck-swiper");
    if (!swiperEl) return;
    eventManager2.add(swiperEl, "wheel", (e) => {
      const swiper = state.getSwiper();
      if (!swiper) return;
      e.preventDefault();
      showControls();
      if (swiper.wheeling) return;
      swiper.wheeling = true;
      if (e.deltaY > 0) swiper.slideNext();
      else if (e.deltaY < 0) swiper.slidePrev();
      setTimeout(() => {
        if (swiper) swiper.wheeling = false;
      }, 150);
    }, { passive: false });
  }
  function setDeckActive(active) {
    isDeckActive = active;
  }
  function handleKeyboard(e, actions = {}) {
    const { closeDeck: closeDeck2, startAutoPlay: startAutoPlay2, stopAutoPlay: stopAutoPlay2 } = actions;
    if (!isDeckActive) return;
    if (e._imageDeckHandled) return;
    e._imageDeckHandled = true;
    const formElements = ["INPUT", "TEXTAREA", "SELECT"];
    if (formElements.includes(e.target.tagName)) {
      if (e.key === " " && e.target.tagName === "INPUT") {
        e.stopPropagation();
      }
      return;
    }
    const inModalInput = (e.target.closest(".gallery-tag-filter-modal") || e.target.closest(".image-deck-metadata-modal")) && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    if (inModalInput && e.key === " ") return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Escape", "+", "-", "0"].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
    }
    const swiper = state.getSwiper();
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      if (e.key === "Escape") {
        closeMetadataModal();
      }
      return;
    }
    showControls();
    switch (e.key) {
      case "Escape": {
        const modal = document.querySelector(".image-deck-metadata-modal");
        if (modal?.classList.contains("active")) {
          closeMetadataModal();
        } else if (closeDeck2) {
          closeDeck2();
        }
        break;
      }
      case " ": {
        e.preventDefault();
        e.stopPropagation();
        const playBtn = document.querySelector('[data-action="play"]');
        if (playBtn?.classList.contains("active")) {
          if (stopAutoPlay2) stopAutoPlay2();
        } else {
          if (startAutoPlay2) startAutoPlay2();
        }
        break;
      }
      case "i":
      case "I": {
        e.preventDefault();
        e.stopPropagation();
        const metadataModal = document.querySelector(".image-deck-metadata-modal");
        if (metadataModal?.classList.contains("active")) {
          closeMetadataModal();
        } else {
          stopIdleTimer();
          updateControlVisibility(false);
          openMetadataModal();
        }
        break;
      }
      case "+":
      case "=":
        e.preventDefault();
        if (swiper?.zoom && !isCurrentSlideGallery()) cycleZoom(swiper, "in");
        break;
      case "-":
      case "_":
        e.preventDefault();
        if (swiper?.zoom && !isCurrentSlideGallery()) cycleZoom(swiper, "out");
        break;
      case "0":
        e.preventDefault();
        if (swiper?.zoom && !isCurrentSlideGallery()) swiper.zoom.reset();
        break;
      case "ArrowLeft": {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        if (swiper && now - lastArrowTime > ARROW_DEBOUNCE) {
          lastArrowTime = now;
          swiper.slidePrev();
        }
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        if (swiper && now - lastArrowTime > ARROW_DEBOUNCE) {
          lastArrowTime = now;
          swiper.slideNext();
        }
        break;
      }
    }
  }
  function cleanupEventHandlers() {
    eventManager.removeAll();
    isDeckActive = false;
    if (keyboardHandlerWithActions) {
      document.removeEventListener("keydown", keyboardHandlerWithActions, true);
      keyboardHandlerWithActions = null;
    }
    stopIdleTimer();
    cleanupFunctions.forEach((cleanup, index) => {
      try {
        cleanup();
      } catch (e) {
        console.warn(`[Image Deck] Controls cleanup function ${index} error:`, e);
      }
    });
    cleanupFunctions = [];
    const swiper = state.getSwiper();
    if (swiper) {
      if (swiper.keyboard?.enable) swiper.keyboard.enable();
      swiper.off("slideChangeTransitionEnd");
      swiper.off("zoomChange");
    }
    if (window._imageDeckSwiperCleanup) {
      window._imageDeckSwiperCleanup();
      window._imageDeckSwiperCleanup = null;
    }
  }
  var EventHandlerManager, eventManager, isDeckActive, idleTimer, cleanupFunctions, IDLE_HIDE_DELAY, ACTIVITY_THROTTLE, ARROW_DEBOUNCE, lastArrowTime, keyboardHandlerWithActions;
  var init_controls = __esm({
    "controls.js"() {
      init_graphql();
      init_metadata();
      init_state();
      init_context();
      EventHandlerManager = class {
        constructor() {
          this.listeners = /* @__PURE__ */ new Map();
        }
        add(element, event, handler, options = false) {
          const key = `${element.constructor.name}_${event}_${Math.random()}`;
          element.addEventListener(event, handler, options);
          if (!this.listeners.has(key)) {
            this.listeners.set(key, { element, event, handler, options });
          }
          return key;
        }
        remove(key) {
          if (this.listeners.has(key)) {
            const { element, event, handler } = this.listeners.get(key);
            element.removeEventListener(event, handler);
            this.listeners.delete(key);
          }
        }
        removeAll() {
          for (const [key, { element, event, handler }] of this.listeners) {
            element.removeEventListener(event, handler);
          }
          this.listeners.clear();
        }
      };
      eventManager = new EventHandlerManager();
      isDeckActive = false;
      idleTimer = null;
      cleanupFunctions = [];
      IDLE_HIDE_DELAY = 3e3;
      ACTIVITY_THROTTLE = 250;
      ARROW_DEBOUNCE = 180;
      lastArrowTime = 0;
      keyboardHandlerWithActions = null;
    }
  });

  // deck.js
  var deck_exports = {};
  __export(deck_exports, {
    closeDeck: () => closeDeck,
    isDeckTransitioning: () => isDeckTransitioning,
    loadNextChunk: () => loadNextChunk,
    openDeck: () => openDeck,
    openDeckWithImages: () => openDeckWithImages,
    startAutoPlay: () => startAutoPlay,
    stopAutoPlay: () => stopAutoPlay
  });
  function isDeckTransitioning() {
    return isOpening || isModeSwitching || !!deckClosePromise;
  }
  async function getControlsModule() {
    if (!controlsModuleCache) {
      controlsModuleCache = await Promise.resolve().then(() => (init_controls(), controls_exports));
    }
    return controlsModuleCache;
  }
  async function cleanupControls() {
    if (controlsModuleCache) {
      try {
        controlsModuleCache.cleanupEventHandlers();
      } catch (e) {
        console.warn("[Image Deck] Controls cleanup error:", e);
      }
    }
  }
  function cleanupExistingState() {
    if (autoPlayInterval) {
      clearInterval(autoPlayInterval);
      autoPlayInterval = null;
    }
    stopAutoPlay();
    cleanupControls().catch((e) => {
      console.warn("[Image Deck] Controls cleanup error:", e);
    });
    cleanupFunctions2.forEach((cleanup, index) => {
      try {
        cleanup();
      } catch (e) {
        console.warn(`[Image Deck] Cleanup function ${index} error:`, e);
      }
    });
    cleanupFunctions2 = [];
    isAutoPlaying = false;
    controlsModuleCache = null;
    currentSwiper = null;
    currentImages = [];
    contextInfo = null;
    storedContextInfo2 = null;
    pluginConfig = null;
    contextExtensionEnabled = false;
    sidebarCleanupFn = null;
  }
  function buildSlideHtml(img, contextInfo2, loading = "lazy") {
    if (!img) {
      console.error("[Image Deck] buildSlideHtml received null image");
      return '<div class="swiper-zoom-container" data-type="image"></div>';
    }
    const fullSrc = img.paths?.image || img.paths?.thumbnail || "";
    const isGallery = img.url && !contextInfo2?.isSingleGallery;
    const title = escapeHtml(img.title || "Untitled");
    if (isGallery) {
      const imageCountDisplay = img.image_count !== void 0 ? `${GALLERY_ICON_SVG}: ${img.image_count}` : "";
      const performerNames = img.performers?.map((p) => p.name).join(", ");
      const performerDisplay = performerNames ? `<div class="gallery-performers" style="margin-top: 5px; font-size: 18px; color: #ccc;">${escapeHtml(performerNames)}</div>` : "";
      return `
            <div class="swiper-zoom-container" data-type="gallery" data-url="${img.url}">
                <div class="gallery-cover-container">
                    <div class="gallery-cover-title" title="${title}">${title}</div>
                    ${imageCountDisplay ? `<div class="gallery-image-count" style="font-size: 18px; color: #ccc; margin-top: 3px;">${imageCountDisplay}</div>` : ""}
                    <a href="${img.url}" target="_blank" class="gallery-cover-link">
                        <img src="${fullSrc}" alt="${title}" decoding="async" loading="${loading}" />
                    </a>
                    ${performerDisplay}
                </div>
            </div>`;
    }
    return `
        <div class="swiper-zoom-container" data-type="image">
            <img src="${fullSrc}" alt="${title}" decoding="async" loading="${loading}" style="max-width: 100%; height: auto; display: block; margin: 0 auto;" />
        </div>`;
  }
  function positionKey() {
    const type = contextInfo?.type ?? "unknown";
    const id = contextInfo?.id ?? "global";
    return `${PLUGIN_NAME}_position_${type}_${id}`;
  }
  function savePosition() {
    if (!currentSwiper) return;
    sessionStorage.setItem(positionKey(), currentSwiper.activeIndex.toString());
  }
  function restorePosition() {
    if (!currentSwiper) return;
    const savedPosition = sessionStorage.getItem(positionKey());
    if (!savedPosition) return;
    const index = parseInt(savedPosition, 10);
    if (!isNaN(index) && index < (currentSwiper.slides.length || currentImages.length)) {
      currentSwiper.slideTo(index, 0);
    }
  }
  function rebuildSwiperWithImages(container, images, context, startAt = 0) {
    if (currentSwiper && typeof currentSwiper.destroy === "function") {
      currentSwiper.destroy(true, true);
    }
    currentSwiper = null;
    const wrapper = container.querySelector(".swiper-wrapper");
    if (wrapper) wrapper.innerHTML = "";
    currentImages = images;
    window.currentImages = currentImages;
    currentSwiper = initSwiper(
      container,
      currentImages,
      pluginConfig,
      () => {
        updateUI(container);
        checkAndLoadNextChunk();
      },
      savePosition,
      context
    );
    window.currentSwiperInstance = currentSwiper;
    state.setSwiper(currentSwiper);
    setCurrentSwiper(currentSwiper);
    requestAnimationFrame(() => {
      if (currentSwiper) {
        currentSwiper.update();
        if (startAt >= 0 && startAt < currentImages.length) {
          currentSwiper.slideTo(startAt, 0, false);
        }
      }
    });
    setTimeout(() => {
      if (currentSwiper) currentSwiper.update();
    }, POST_INIT_UPDATE_DELAY_MS);
  }
  async function forceRefreshGalleryCovers() {
    console.log("[Image Deck] Force refreshing content");
    try {
      if (!deckContainer) return;
      const freshContext = await buildDeckContext();
      if (!freshContext) return;
      contextInfo = freshContext;
      storedContextInfo2 = freshContext;
      currentChunkPage = 1;
      chunkSize = freshContext.filter?.perPage || pluginConfig?.chunkSize || 50;
      const result = await fetchContextImages(freshContext, 1, chunkSize);
      if (!result?.images) return;
      totalImageCount = result.totalCount || 0;
      totalPages = result.totalPages || 1;
      rebuildSwiperWithImages(deckContainer, result.images, freshContext, 0);
      updateUI(deckContainer);
      renderActiveFilters(deckContainer, { onFilterRemoved: forceRefreshGalleryCovers }).catch((error) => {
        console.error("[Image Deck] Error updating filter display:", error);
      });
    } catch (error) {
      console.error("[Image Deck] Error force refreshing content:", error);
    }
  }
  async function handleSavedFilterChange(savedFilter) {
    try {
      const newContext = await buildDeckContext();
      contextInfo = newContext;
      storedContextInfo2 = newContext;
      currentChunkPage = 1;
      chunkSize = newContext.filter?.perPage || pluginConfig?.chunkSize || 50;
      const result = await fetchContextImages(newContext, 1, chunkSize);
      if (!result?.images) {
        console.warn("[Image Deck] Saved filter returned no images");
        return;
      }
      if (!deckContainer) return;
      totalImageCount = result.totalCount || 0;
      totalPages = result.totalPages || 1;
      rebuildSwiperWithImages(deckContainer, result.images, newContext, 0);
      updateUI(deckContainer);
      await updateFilterDisplayInUI({ onFilterRemoved: forceRefreshGalleryCovers });
      if (sidebarCleanupFn) {
        cleanupFunctions2 = cleanupFunctions2.filter((fn) => fn !== sidebarCleanupFn);
        try {
          sidebarCleanupFn();
        } catch (e) {
          console.warn("[Image Deck] Sidebar cleanup error:", e);
        }
      }
      sidebarCleanupFn = initSidebarFilters(deckContainer, {
        contextInfo: newContext,
        onApplyFilters: forceRefreshGalleryCovers,
        onClearFilters: forceRefreshGalleryCovers,
        onFilterRemoved: forceRefreshGalleryCovers,
        onSavedFilterChange: handleSavedFilterChange
      });
      if (sidebarCleanupFn) cleanupFunctions2.push(sidebarCleanupFn);
      ensureModeIndicator(deckContainer, handleModeSwitchClick);
      updateUI(deckContainer);
    } catch (error) {
      console.error("[Image Deck] Error applying saved filter:", error);
    }
  }
  async function handleModeSwitchClick(e) {
    if (isModeSwitching) return;
    e.preventDefault();
    e.stopPropagation();
    isModeSwitching = true;
    isOpening = true;
    try {
      const currentMode = contextInfo?.type === "galleries" ? "gallery" : "image";
      const newMode = currentMode === "gallery" ? "image" : "gallery";
      const performerId = contextInfo?.performerId;
      setSavedFilterSelection(null);
      localStorage.setItem("imageDeckMode", newMode);
      await closeDeck();
      if (performerId) {
        history.pushState({}, "", `/performers/${performerId}` + (newMode === "gallery" ? "/galleries" : "/images"));
      } else {
        history.pushState({}, "", newMode === "gallery" ? "/galleries" : "/images");
      }
      await internalOpenDeck();
    } catch (error) {
      console.error("[Image Deck] Mode switch error:", error);
    } finally {
      isModeSwitching = false;
      isOpening = false;
    }
  }
  function setupFullscreenListener() {
    if (!deckContainer) return;
    const container = deckContainer;
    const handleFullscreenUI = () => {
      const isInFullscreen = !!document.fullscreenElement;
      if (!container.parentNode) return;
      if (isInFullscreen) {
        container.classList.add("fullscreen-mode");
      } else {
        container.classList.remove("fullscreen-mode");
        const zoomed = currentSwiper?.zoom && currentSwiper.zoom.scale > 1;
        if (!zoomed) {
          container.classList.remove("hiding-ui");
        }
      }
      const fullscreenBtn = container.querySelector(".image-deck-fullscreen");
      if (fullscreenBtn) {
        fullscreenBtn.textContent = isInFullscreen ? "\u26F6" : "\u26F6";
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenUI);
    cleanupFunctions2.push(() => document.removeEventListener("fullscreenchange", handleFullscreenUI));
    setTimeout(handleFullscreenUI, 100);
  }
  function setupFilterUpdateListener() {
    const filterUpdateListener = async (e) => {
      console.log("[Image Deck] Received updateDeckContent event:", e.detail);
      setTimeout(async () => {
        await forceRefreshGalleryCovers();
        if (deckContainer) {
          updateUI(deckContainer);
          await updateFilterDisplayInUI({ onFilterRemoved: forceRefreshGalleryCovers }).catch((error) => {
            console.error("[Image Deck] Error updating filter display:", error);
          });
        }
      }, 100);
    };
    if (currentFilterUpdateListener) {
      window.removeEventListener("updateDeckContent", currentFilterUpdateListener);
    }
    currentFilterUpdateListener = filterUpdateListener;
    window.addEventListener("updateDeckContent", filterUpdateListener);
    cleanupFunctions2.push(() => {
      if (currentFilterUpdateListener) {
        window.removeEventListener("updateDeckContent", currentFilterUpdateListener);
        currentFilterUpdateListener = null;
      }
    });
  }
  function preventBackgroundScroll(e) {
    if (!e.cancelable) return;
    if (!e.target.closest(".image-deck-container")) {
      e.preventDefault();
    }
  }
  function setupTapToToggleControls(container) {
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    const isInteractiveTarget = (target) => {
      return target.closest(
        "button, .image-deck-controls-wrapper, .image-deck-sidebar, .image-deck-topbar, .image-deck-info-btn, input, select, textarea, a, .image-deck-metadata-modal, .swiper-pagination, .gallery-cover-link, .image-deck-sidebar-toggle"
      ) !== null;
    };
    const shouldToggle = (target) => {
      if (isInteractiveTarget(target)) return false;
      if (currentSwiper?.zoom?.scale > 1) return false;
      return true;
    };
    if (isTouchDevice) {
      let touchStartX = 0;
      let touchStartY = 0;
      let touchMoved = false;
      const onTouchStart = (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        touchMoved = false;
      };
      const onTouchMove = (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = Math.abs(t.clientX - touchStartX);
        const dy = Math.abs(t.clientY - touchStartY);
        if (dx > 10 || dy > 10) touchMoved = true;
      };
      const onTouchEnd = (e) => {
        if (touchMoved) return;
        if (!shouldToggle(e.target)) return;
        container.classList.toggle("hiding-ui");
      };
      container.addEventListener("touchstart", onTouchStart, { passive: true });
      container.addEventListener("touchmove", onTouchMove, { passive: true });
      container.addEventListener("touchend", onTouchEnd, { passive: true });
      cleanupFunctions2.push(() => {
        container.removeEventListener("touchstart", onTouchStart);
        container.removeEventListener("touchmove", onTouchMove);
        container.removeEventListener("touchend", onTouchEnd);
      });
    } else {
      const onClick = (e) => {
        if (!shouldToggle(e.target)) return;
        container.classList.toggle("hiding-ui");
      };
      container.addEventListener("click", onClick);
      cleanupFunctions2.push(() => {
        container.removeEventListener("click", onClick);
      });
    }
  }
  async function openNormalDeck(startIndex = 0) {
    if (deckClosePromise) {
      console.log("[Image Deck] Deck close in progress, waiting before opening");
      await deckClosePromise;
    }
    if (deckContainer) {
      console.log("[Image Deck] Deck already open, ignoring duplicate open");
      return;
    }
    const container = await createDeckUI();
    deckContainer = container;
    document.body.classList.add("image-deck-open");
    document.body.style.overflow = "hidden";
    document.body.appendChild(container);
    document.addEventListener("touchmove", preventBackgroundScroll, { passive: false });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    requestAnimationFrame(() => {
      if (deckContainer === container && container.parentNode) {
        container.classList.add("active");
      }
    });
    currentSwiper = initSwiper(
      container,
      currentImages,
      pluginConfig,
      () => {
        updateUI(container);
        checkAndLoadNextChunk();
      },
      savePosition,
      contextInfo
    );
    window.currentSwiperInstance = currentSwiper;
    window.currentImages = currentImages;
    state.setSwiper(currentSwiper);
    setCurrentSwiper(currentSwiper);
    if (startIndex >= 0 && startIndex < currentImages.length) {
      currentSwiper.slideTo(startIndex, 0);
    } else {
      restorePosition();
    }
    updateUI(container);
    await updateFilterDisplayInUI();
    getControlsModule().then((module) => {
      module.setupEventHandlers(container, {
        closeDeck,
        startAutoPlay,
        stopAutoPlay,
        loadNextChunk
      });
    }).catch((error) => {
      console.error("[Image Deck] Error loading controls module:", error);
    });
    setupFilterUpdateListener();
    setupFullscreenListener();
    setupSidebarVisibilityGuard();
    setupTapToToggleControls(container);
  }
  async function doOpenWithImages(images, startIndex = 0) {
    cleanupExistingState();
    pluginConfig = await getPluginConfig();
    chunkSize = pluginConfig?.chunkSize || 50;
    injectDynamicStyles(pluginConfig);
    const context = await buildDeckContext();
    contextInfo = context;
    storedContextInfo2 = context;
    currentImages = images.filter(Boolean);
    window.currentImages = currentImages;
    totalImageCount = currentImages.length;
    totalPages = 1;
    currentChunkPage = context.filter?.page || 1;
    chunkSize = context.filter?.perPage || chunkSize;
    if (context.filter?.page && context.filter?.perPage) {
      contextExtensionEnabled = true;
      fetchContextImages(context, context.filter.page, context.filter.perPage).then((result) => {
        if (!deckContainer) return;
        if (result?.totalCount) {
          totalImageCount = result.totalCount;
          totalPages = result.totalPages || 1;
          console.log("[Image Deck] Context extension enabled:", totalImageCount, "total items across", totalPages, "pages");
        }
      }).catch((err) => {
        if (!deckContainer) return;
        console.warn("[Image Deck] Could not enable context extension:", err);
        contextExtensionEnabled = false;
      });
    }
    await openNormalDeck(startIndex);
  }
  async function internalOpenDeck(targetImageId = null) {
    if (deckClosePromise) {
      console.log("[Image Deck] Deck close in progress, waiting before opening");
      await deckClosePromise;
    }
    if (deckContainer) {
      console.log("[Image Deck] Deck already open, ignoring duplicate open");
      return;
    }
    console.log("[Image Deck] Opening deck...", targetImageId);
    console.log("[Image Deck] Current URL:", window.location.pathname + window.location.search);
    cleanupExistingState();
    pluginConfig = await getPluginConfig();
    chunkSize = pluginConfig?.chunkSize || 50;
    console.log("[Image Deck] Plugin config loaded:", pluginConfig);
    injectDynamicStyles(pluginConfig);
    const context = await buildDeckContext();
    if (!context) {
      throw new Error("Could not detect deck context");
    }
    contextInfo = context;
    storedContextInfo2 = context;
    console.log("[Image Deck] Context assigned:", contextInfo);
    const urlPage = context.filter?.page || 1;
    const urlPerPage = context.filter?.perPage || chunkSize;
    const result = await fetchContextImages(contextInfo, urlPage, urlPerPage);
    currentImages = result.images || [];
    totalImageCount = result.totalCount || 0;
    totalPages = result.totalPages || 1;
    currentChunkPage = result.currentPage || urlPage;
    chunkSize = urlPerPage;
    let startIndex = -1;
    if (targetImageId && currentImages.length > 0) {
      startIndex = currentImages.findIndex((img) => img && String(img.id).trim() === String(targetImageId).trim());
    }
    if (startIndex !== -1) {
      console.log(`[Image Deck] Target ${targetImageId} found at index ${startIndex} in Stash page ${urlPage}`);
      await openNormalDeck(startIndex);
      return;
    }
    console.warn(`[Image Deck] Target ${targetImageId} not in Stash page ${urlPage}; falling back to visible images`);
    const visibleImages = getVisibleImages();
    const visibleIndex = visibleImages.findIndex((img) => String(img.id).trim() === String(targetImageId).trim());
    if (visibleIndex !== -1) {
      await doOpenWithImages(visibleImages, visibleIndex);
      return;
    }
    console.warn("[Image Deck] Target not in visible images either; opening at start of Stash page");
    await openNormalDeck(0);
  }
  async function openDeckWithImages(images, startIndex = 0) {
    console.log("[Image Deck] Opening deck with", images.length, "visible images at index", startIndex);
    if (isOpening || isModeSwitching) {
      console.log("[Image Deck] Open or mode switch already in progress, ignoring duplicate open");
      return;
    }
    isOpening = true;
    try {
      await doOpenWithImages(images, startIndex);
    } catch (error) {
      console.error("[Image Deck] Error opening deck with images:", error);
      cleanupExistingState();
    } finally {
      isOpening = false;
    }
  }
  async function openDeck(targetImageId = null) {
    if (isOpening || isModeSwitching) {
      console.log("[Image Deck] Open or mode switch already in progress, ignoring duplicate open");
      return;
    }
    isOpening = true;
    try {
      await internalOpenDeck(targetImageId);
    } catch (error) {
      console.error("[Image Deck] Error opening deck:", error);
      cleanupExistingState();
    } finally {
      isOpening = false;
    }
  }
  async function createDeckUI() {
    document.querySelectorAll(".image-deck-container").forEach((el) => {
      try {
        el.remove();
      } catch (e) {
        console.warn("[Image Deck] Existing container removal error:", e);
      }
    });
    const container = document.createElement("div");
    container.className = `image-deck-container${isMobile ? " mobile-optimized" : ""}`;
    if (isMobile) {
      container.classList.add("mobile-performance-mode");
    }
    container.innerHTML = `
        <div class="image-deck-ambient"></div>
        <div class="image-deck-topbar">
            <div class="image-deck-counter"></div>
            <div class="image-deck-topbar-btns">
                <button class="image-deck-sidebar-toggle" type="button" title="Settings">\u2699\uFE0F</button>
                <button class="image-deck-fullscreen" title="Toggle Fullscreen">\u26F6</button>
                <button class="image-deck-close">\u2715</button>
            </div>
        </div>
        <div class="image-deck-progress"></div>
        <div class="image-deck-loading"></div>
        <div class="image-deck-swiper swiper">
            <div class="swiper-wrapper"></div>
        </div>
        <div class="image-deck-controls-wrapper">
            <div class="image-deck-zoom-controls">
                <button class="image-deck-control-btn" data-action="zoom-in" title="Zoom In (+)">\u2795</button>
                <button class="image-deck-control-btn" data-action="zoom-out" title="Zoom Out (-)">\u2796</button>
            </div>
            <div class="image-deck-navigation-controls">
                <button class="image-deck-control-btn" data-action="prev">\u23EA</button>
                <button class="image-deck-control-btn" data-action="play">\u25B6\uFE0F</button>
                <button class="image-deck-control-btn" data-action="next">\u23E9</button>
                <button class="image-deck-control-btn image-deck-info-btn" data-action="info" title="Image Info (I)">\u2139\uFE0F</button>
            </div>
        </div>
        <div class="image-deck-speed">Speed: ${pluginConfig?.autoPlayInterval || 3e3}ms</div>
        <div class="image-deck-sidebar">
            <button class="image-deck-sidebar-close" type="button" title="Close settings">\u2715</button>
            <div class="image-deck-sidebar-content">
                <div class="sidebar-section mode-section">
                    <span class="sidebar-label">Mode</span>
                    <div class="sidebar-section-content"></div>
                </div>
                <div class="sidebar-section saved-filters-section">
                    <span class="sidebar-label">Saved Filter</span>
                    <select class="sidebar-saved-filter-select">
                        <option value="">-- Current view --</option>
                    </select>
                </div>
                <div class="sidebar-section active-filters-section">
                    <span class="sidebar-label">Active Filters</span>
                    <div class="sidebar-active-filters">
                        <div class="sidebar-empty-state">No filters applied</div>
                    </div>
                </div>
                <div class="sidebar-section filter-section">
                    <span class="sidebar-label">Tag Filter Settings</span>
                    <div class="filter-mode-toggle">
                        <button class="filter-mode-btn active" data-mode="include" type="button">Include</button>
                        <button class="filter-mode-btn" data-mode="exclude" type="button">Exclude</button>
                    </div>
                    <input type="text" class="sidebar-tag-search" placeholder="Search tags..." autocomplete="off" />
                    <div class="sidebar-tag-results"></div>
                    <div class="sidebar-filter-group-label">Performers</div>
                    <input type="text" class="sidebar-performer-search" placeholder="Search performers..." autocomplete="off" />
                    <div class="sidebar-performer-results"></div>
                    <div class="sidebar-filter-group-label">Selected Filters</div>
                    <div class="sidebar-pending-filters">
                        <div class="sidebar-empty-state">No filters selected</div>
                    </div>
                    <div class="sidebar-actions">
                        <button class="sidebar-apply-btn" type="button">Apply Filters</button>
                        <button class="sidebar-clear-btn" type="button">Clear All</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="image-deck-metadata-modal">
            <div class="image-deck-metadata-content">
                <div class="image-deck-metadata-header">
                    <h3>Image Details</h3>
                    <button class="image-deck-metadata-close">\u2715</button>
                </div>
                <div class="image-deck-metadata-body"></div>
            </div>
        </div>
    `;
    const filterCallbacks = { onFilterRemoved: forceRefreshGalleryCovers };
    sidebarCleanupFn = initSidebarFilters(container, {
      contextInfo,
      onApplyFilters: forceRefreshGalleryCovers,
      onClearFilters: forceRefreshGalleryCovers,
      onSavedFilterChange: handleSavedFilterChange,
      ...filterCallbacks
    });
    if (sidebarCleanupFn) cleanupFunctions2.push(sidebarCleanupFn);
    await renderActiveFilters(container, filterCallbacks);
    ensureModeIndicator(container, handleModeSwitchClick);
    return container;
  }
  function updateUI(container) {
    if (!currentSwiper || !container || uiUpdatePending) return;
    uiUpdatePending = true;
    requestAnimationFrame(() => {
      const modeIndicator = container.querySelector(".image-deck-sidebar .mode-indicator");
      if (modeIndicator) {
        const isGalleryMode = contextInfo?.type === "galleries";
        modeIndicator.innerHTML = isGalleryMode ? "\u{1F5BC}\uFE0F Gallery Mode Enabled \u{1F5BC}\uFE0F" : "\u{1F4F7} Image Mode Enabled \u{1F4F7}";
        modeIndicator.dataset.currentMode = isGalleryMode ? "gallery" : "image";
      }
      let current = 1;
      const displayedTotal = currentImages.length;
      const actualTotal = totalImageCount || displayedTotal;
      current = currentSwiper.activeIndex + 1;
      if (pluginConfig.showCounter) {
        const counter = container.querySelector(".image-deck-counter");
        const isDebug = pluginConfig?.debugMode || new URLSearchParams(window.location.search).has("deck-debug");
        const chunkInfo = isDebug && totalPages > 1 ? ` (chunk ${currentChunkPage}/${totalPages})` : "";
        if (counter) {
          counter.textContent = `${current} of ${actualTotal}${chunkInfo}`;
        }
      }
      if (pluginConfig.showProgressBar) {
        const progress = container.querySelector(".image-deck-progress");
        if (progress) {
          const progressValue = actualTotal > 0 ? current / actualTotal : 0;
          progress.style.transform = `scaleX(${progressValue})`;
        }
      }
      uiUpdatePending = false;
    });
  }
  function setupSidebarVisibilityGuard() {
    if (!deckContainer) return;
    const container = deckContainer;
    const guard = setInterval(() => {
      if (!container.parentNode) {
        clearInterval(guard);
        return;
      }
      if (container.classList.contains("sidebar-open")) {
        container.classList.remove("hiding-ui");
        const sidebar = container.querySelector(".image-deck-sidebar");
        const toggle = container.querySelector(".image-deck-sidebar-toggle");
        if (sidebar) {
          sidebar.style.opacity = "1";
          sidebar.style.visibility = "visible";
          sidebar.style.pointerEvents = "auto";
        }
        if (toggle) {
          toggle.style.opacity = "1";
          toggle.style.visibility = "visible";
        }
      }
    }, 500);
    cleanupFunctions2.push(() => clearInterval(guard));
  }
  function checkAndLoadNextChunk() {
    if (!currentSwiper || isChunkLoading) return;
    const currentIndex = currentSwiper.activeIndex;
    const totalCurrentSlides = currentImages.length;
    if (currentIndex >= totalCurrentSlides - 3 && currentChunkPage < totalPages) {
      console.log("[Image Deck] Auto-loading next chunk...");
      loadNextChunk();
    }
  }
  function startAutoPlay() {
    if (!currentSwiper || isAutoPlaying) return;
    isAutoPlaying = true;
    const playBtn = document.querySelector('[data-action="play"]');
    if (playBtn) {
      playBtn.innerHTML = "\u23F8";
      playBtn.classList.add("active");
    }
    autoPlayInterval = setInterval(() => {
      if (currentSwiper.isEnd) {
        stopAutoPlay();
      } else {
        currentSwiper.slideNext();
      }
    }, pluginConfig.autoPlayInterval);
    const speedIndicator = document.querySelector(".image-deck-speed");
    if (speedIndicator) {
      speedIndicator.classList.add("visible");
      setTimeout(() => speedIndicator.classList.remove("visible"), 2e3);
    }
  }
  function stopAutoPlay() {
    if (!isAutoPlaying) return;
    isAutoPlaying = false;
    const playBtn = document.querySelector('[data-action="play"]');
    if (playBtn) {
      playBtn.innerHTML = "\u25B6";
      playBtn.classList.remove("active");
    }
    if (autoPlayInterval) {
      clearInterval(autoPlayInterval);
      autoPlayInterval = null;
    }
  }
  async function loadNextChunk() {
    if (isChunkLoading) {
      console.log("[Image Deck] Load already in progress, skipping...");
      return;
    }
    if (currentChunkPage >= totalPages && totalPages !== 0) {
      console.log("[Image Deck] All chunks already loaded.");
      const loadingIndicator2 = deckContainer?.querySelector(".image-deck-loading");
      if (loadingIndicator2) {
        loadingIndicator2.textContent = "All items loaded";
        setTimeout(() => {
          if (loadingIndicator2) loadingIndicator2.style.display = "none";
        }, 2e3);
      }
      return;
    }
    if (!deckContainer) return;
    isChunkLoading = true;
    const loadingIndicator = deckContainer.querySelector(".image-deck-loading");
    const nextChunkButton = deckContainer.querySelector('[data-action="next-chunk"]');
    if (nextChunkButton) {
      nextChunkButton.disabled = true;
      nextChunkButton.style.opacity = "0.5";
      nextChunkButton.innerHTML = "\u{1F504}";
    }
    if (loadingIndicator) {
      loadingIndicator.style.display = "block";
      loadingIndicator.textContent = `Loading chunk ${currentChunkPage + 1}...`;
    }
    try {
      const contextToUse = storedContextInfo2 || contextInfo || detectContext();
      if (!contextToUse) throw new Error("Could not detect context for fetching");
      const nextPage = currentChunkPage + 1;
      const result = await fetchContextImages(contextToUse, nextPage, chunkSize);
      if (!result?.images?.length) {
        if (loadingIndicator) loadingIndicator.textContent = "No more items found";
        setTimeout(() => {
          if (loadingIndicator) loadingIndicator.style.display = "none";
        }, 2e3);
        isChunkLoading = false;
        return;
      }
      currentImages.push(...result.images);
      currentChunkPage = nextPage;
      totalPages = result.totalPages || totalPages;
      const isVirtual = currentSwiper?.params?.virtual?.enabled;
      const wrapper = deckContainer.querySelector(".swiper-wrapper");
      if (isVirtual) {
        currentSwiper.virtual.slides = currentImages.map((img) => buildSlideHtml(img, contextInfo, "lazy"));
        currentSwiper.virtual.update(true);
        setTimeout(() => {
          if (currentSwiper) currentSwiper.update();
        }, POST_INIT_UPDATE_DELAY_MS);
      } else if (currentSwiper?.appendSlide) {
        const newSlides = result.images.map((img) => buildSlideHtml(img, contextInfo, "lazy"));
        currentSwiper.appendSlide(newSlides);
        currentSwiper.update();
      } else if (wrapper) {
        const newSlides = result.images.map((img) => buildSlideHtml(img, contextInfo, "lazy")).join("");
        wrapper.insertAdjacentHTML("beforeend", newSlides);
      }
      updateUI(deckContainer);
      if (loadingIndicator) {
        loadingIndicator.textContent = `\u2713 Loaded ${result.images.length} new items`;
        setTimeout(() => {
          loadingIndicator.style.display = "none";
        }, 2e3);
      }
    } catch (error) {
      console.error("[Image Deck] Failed to load chunk:", error);
      if (loadingIndicator) {
        loadingIndicator.textContent = "Error: " + error.message;
        setTimeout(() => {
          loadingIndicator.style.display = "none";
        }, 3e3);
      }
    } finally {
      isChunkLoading = false;
      if (nextChunkButton) {
        nextChunkButton.disabled = false;
        nextChunkButton.style.opacity = "1";
        nextChunkButton.innerHTML = "\u23ED\uFE0F";
      }
    }
  }
  function closeDeck() {
    if (deckClosePromise) {
      console.log("[Image Deck] Close already in progress");
      return deckClosePromise;
    }
    console.log("[Image Deck] Closing deck");
    document.body.style.overflow = "";
    if (currentSwiper) {
      try {
        currentSwiper.destroy(true, true);
      } catch (e) {
        console.warn("[Image Deck] Swiper destruction error:", e);
      }
      currentSwiper = null;
    }
    if (typeof window.memoizedGetSlideTemplate !== "undefined" && typeof window.memoizedGetSlideTemplate.clearCache === "function") {
      try {
        window.memoizedGetSlideTemplate.clearCache();
      } catch (e) {
        console.warn("[Image Deck] Template cache cleanup error:", e);
      }
    }
    cleanupExistingState();
    document.removeEventListener("touchmove", preventBackgroundScroll, { passive: false });
    if (!deckContainer) {
      console.log("[Image Deck] Deck closed and cleaned up");
      return Promise.resolve();
    }
    const container = deckContainer;
    deckContainer = null;
    container.classList.remove("active");
    container.dataset.closing = "true";
    deckClosePromise = new Promise((resolve) => {
      setTimeout(() => {
        try {
          if (container.parentNode) container.remove();
        } catch (e) {
          console.warn("[Image Deck] Container removal error:", e);
        }
        document.body.classList.remove("image-deck-open");
        deckClosePromise = null;
        console.log("[Image Deck] Deck closed and cleaned up");
        resolve();
      }, CLOSE_ANIMATION_MS);
    });
    return deckClosePromise;
  }
  var CLOSE_ANIMATION_MS, POST_INIT_UPDATE_DELAY_MS, pluginConfig, currentSwiper, currentImages, autoPlayInterval, isAutoPlaying, contextInfo, currentChunkPage, chunkSize, totalImageCount, totalPages, storedContextInfo2, cleanupFunctions2, controlsModuleCache, isChunkLoading, currentFilterUpdateListener, sidebarCleanupFn, contextExtensionEnabled, deckContainer, deckClosePromise, isOpening, isModeSwitching, uiUpdatePending;
  var init_deck = __esm({
    "deck.js"() {
      init_config();
      init_context();
      init_metadata();
      init_swiper();
      init_utils();
      init_constants();
      init_state();
      init_filters();
      init_sidebar();
      CLOSE_ANIMATION_MS = 300;
      POST_INIT_UPDATE_DELAY_MS = 100;
      pluginConfig = null;
      currentSwiper = null;
      currentImages = [];
      autoPlayInterval = null;
      isAutoPlaying = false;
      contextInfo = null;
      currentChunkPage = 1;
      chunkSize = 50;
      totalImageCount = 0;
      totalPages = 0;
      storedContextInfo2 = null;
      cleanupFunctions2 = [];
      controlsModuleCache = null;
      isChunkLoading = false;
      currentFilterUpdateListener = null;
      sidebarCleanupFn = null;
      contextExtensionEnabled = false;
      deckContainer = null;
      deckClosePromise = null;
      isOpening = false;
      isModeSwitching = false;
      uiUpdatePending = false;
      if (typeof window !== "undefined") {
        window.addEventListener("beforeunload", () => {
          try {
            closeDeck();
          } catch (e) {
            console.warn("[Image Deck] Final cleanup error:", e);
          }
        });
      }
    }
  });

  // button.js
  init_context();
  var buttonObserver = null;
  function createLaunchButton() {
    const buttonId = "image-deck-nav-btn";
    const existing = document.getElementById(buttonId);
    if (existing) return;
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "col-4 col-sm-3 col-md-2 col-lg-auto nav-link";
    const svgPath = "M1.829,10.195 L18.286,10.195 C19.245,10.195 20.032,10.944 20.108,11.897 L20.114,12.049 L20.114,36.146 C20.114,37.119 19.375,37.917 18.436,37.994 L18.286,38 L1.829,38 C0.869,38 0.082,37.251 0.006,36.298 L0,36.146 L0,12.049 C0,11.076 0.739,10.279 1.679,10.201 L1.829,10.195 L18.286,10.195 Z M17.371,32.293 L15.543,32.293 C15.038,32.293 14.629,32.708 14.629,33.220 C14.629,33.695 14.982,34.087 15.436,34.140 L15.543,34.146 L17.371,34.146 C17.876,34.146 18.286,33.731 18.286,33.220 C18.286,32.293 17.371,32.293 17.371,32.293 Z M28.343,0 C30.363,0 32,1.660 32,3.707 L32,27.805 C32,29.852 30.363,31.512 28.343,31.512 L21.942,31.512 L21.943,12.049 C21.943,10.067 20.409,8.449 18.480,8.347 L18.286,8.341 L8.228,8.341 L8.229,3.707 C8.229,1.660 9.866,0 11.886,0 L28.343,0 Z M12.053,19.463 C11.458,19.463 10.881,19.641 10.391,19.967 L10.211,20.096 L10.057,20.224 C9.506,19.735 8.797,19.463 8.060,19.463 C7.256,19.463 6.485,19.787 5.916,20.363 C5.348,20.940 5.029,21.722 5.029,22.537 C5.029,23.280 5.294,23.995 5.771,24.552 L5.907,24.700 L9.393,28.441 C9.565,28.627 9.806,28.732 10.057,28.732 C10.267,28.732 10.469,28.659 10.630,28.527 L10.722,28.441 L14.215,24.692 C14.770,24.125 15.086,23.348 15.086,22.537 C15.086,21.722 14.766,20.940 14.197,20.363 C13.629,19.787 12.858,19.463 12.053,19.463 Z M12.053,21.317 C12.373,21.317 12.679,21.445 12.905,21.674 C13.130,21.903 13.257,22.213 13.257,22.537 C13.257,22.768 13.192,22.992 13.073,23.185 L12.995,23.297 L12.895,23.409 L10.057,26.455 L7.218,23.408 L7.124,23.302 C6.950,23.082 6.857,22.814 6.857,22.537 C6.857,22.213 6.984,21.903 7.209,21.674 C7.435,21.445 7.741,21.317 8.060,21.317 C8.334,21.317 8.598,21.411 8.810,21.582 L8.911,21.674 L9.411,22.180 L9.497,22.257 C9.823,22.514 10.281,22.516 10.609,22.264 L10.703,22.181 L11.203,21.674 L11.304,21.582 C11.516,21.411 11.780,21.317 12.053,21.317 Z M5.943,22.537 L5.950,22.707 L5.946,22.660 L5.943,22.537 Z M6.686,20.903 L6.580,21.001 L6.624,20.960 C6.644,20.941 6.665,20.922 6.686,20.903 Z M11.615,20.437 L11.398,20.495 L11.566,20.448 L11.615,20.437 Z M11.738,20.414 L11.615,20.437 L11.638,20.432 L11.738,20.414 Z M3.571,12.049 L1.743,12.049 C1.238,12.049 0.829,12.464 0.829,12.976 C0.829,13.451 1.182,13.843 1.636,13.896 L1.743,13.902 L3.571,13.902 C4.076,13.902 4.486,13.487 4.486,12.976 C4.486,12.464 4.076,12.049 3.571,12.049 Z";
    buttonContainer.innerHTML = `
    <a href="javascript:void(0);" id="${buttonId}" class="minimal p-4 p-xl-2 d-flex d-xl-inline-block flex-column justify-content-between align-items-center btn btn-primary" title="Open Deck Viewer">
    <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 38"
    class="svg-inline--fa fa-icon nav-menu-icon d-block d-xl-inline mb-2 mb-xl-0"
    fill="currentColor"
    width="20"
    height="20"
    aria-hidden="true"
    role="img">
    <path d="${svgPath}"/>
    </svg>
    <span>Deck Viewer</span>
    </a>
    `;
    const button = buttonContainer.querySelector(`#${buttonId}`);
    button.addEventListener("click", (e) => {
      Promise.resolve().then(() => (init_deck(), deck_exports)).then((module) => {
        const context = detectContext();
        let targetImageId = null;
        if (context?.isSingleGallery || context?.type === "galleries") {
          const firstImg = document.querySelector('img[src*="/image/"]');
          if (firstImg?.src) {
            const match = firstImg.src.match(/\/image\/(\d+)/);
            if (match) targetImageId = match[1];
          }
        }
        module.openDeck(targetImageId);
      });
    });
    const navTarget = document.querySelector(".navbar-nav");
    if (navTarget) navTarget.appendChild(buttonContainer);
  }
  function watchForNavigation() {
    if (buttonObserver) return;
    buttonObserver = new MutationObserver(() => {
      createLaunchButton();
    });
    buttonObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  watchForNavigation();
  var handlePopState = () => {
    watchForNavigation();
    createLaunchButton();
  };
  window.addEventListener("popstate", handlePopState);

  // ui.js
  var delegatedPreviewRoot = null;
  var delegatedPreviewHandler = null;
  function isStashPreviewButton(el) {
    if (!el) return false;
    const className = (el.className || "").toString().toLowerCase();
    const title = (el.getAttribute("title") || "").toLowerCase();
    return /\bpreview\b/i.test(className) || /\bfa-magnifying-glass\b|\bfa-search\b/i.test(className) || /\bmagnifying-glass\b/i.test(className) || title && /preview|magnifying/i.test(title) && !/zoom/i.test(title);
  }
  function getPreviewButtonFromEvent(e) {
    if (e.target.closest(".image-deck-container")) return null;
    const directButton = e.target.closest("button");
    if (directButton && isStashPreviewButton(directButton)) {
      return directButton;
    }
    const svg = e.target.closest('svg[data-icon="magnifying-glass"], svg[class*="magnifying-glass"], .fa-magnifying-glass');
    if (svg) {
      const btn = svg.closest("button");
      if (btn && !btn.closest(".image-deck-container")) return btn;
    }
    return null;
  }
  function handlePreviewClick(e) {
    const button = getPreviewButtonFromEvent(e);
    if (!button) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const previewContainer = button.closest('[class*="preview"]') || button.parentElement;
    const card = previewContainer.closest('.image-card, .grid-card, .card, [class*="image"], [class*="gallery"]') || previewContainer.parentElement;
    let img = null;
    if (card) {
      img = card.querySelector('img[src*="/image/"]') || card.querySelector("img") || previewContainer.querySelector("img");
    } else {
      img = previewContainer.querySelector("img");
    }
    let targetImageId = null;
    if (img?.src) {
      const idMatch = img.src.match(/\/image\/(\d+)/);
      if (idMatch) targetImageId = idMatch[1];
    }
    if (!targetImageId) {
      console.error("[Image Deck] Could not determine image ID from preview click");
      return;
    }
    Promise.resolve().then(() => (init_deck(), deck_exports)).then((module) => {
      if (typeof module.isDeckTransitioning === "function" && module.isDeckTransitioning()) {
        console.log("[Image Deck] Deck transition in progress, skipping preview open");
        return;
      }
      module.openDeck(targetImageId);
    }).catch((error) => {
      console.error("[Image Deck] Error loading deck module:", error);
    });
  }
  function initPreviewObserver() {
    cleanupPreviewObserver();
    const root = document;
    root.addEventListener("click", handlePreviewClick, true);
    delegatedPreviewRoot = root;
    delegatedPreviewHandler = handlePreviewClick;
  }
  function cleanupPreviewObserver() {
    if (delegatedPreviewRoot && delegatedPreviewHandler) {
      delegatedPreviewRoot.removeEventListener("click", delegatedPreviewHandler, true);
    }
    delegatedPreviewRoot = null;
    delegatedPreviewHandler = null;
  }
  function initialize() {
    console.log("[Image Deck] Initializing...");
    if (typeof Swiper === "undefined") {
      console.error("[Image Deck] Swiper not loaded!");
      return;
    }
    initPreviewObserver();
    createLaunchButton();
    let debounceTimer;
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const hasButton = document.querySelector(".image-deck-launch-btn");
        const hasImages = document.querySelectorAll('img[src*="/image/"]').length > 0;
        if (!hasButton && hasImages) {
          createLaunchButton();
        }
      }, 300);
    });
    const mainContent = document.querySelector(".main-content") || document.querySelector('[role="main"]') || document.body;
    observer.observe(mainContent, {
      childList: true,
      subtree: true
    });
  }

  // main.js
  var originalPushState = null;
  var originalReplaceState = null;
  var popstateHandler = null;
  var navigationInterval = null;
  function initApp() {
    initialize();
  }
  function cleanupNavigationHandlers() {
    if (originalPushState) {
      history.pushState = originalPushState;
      originalPushState = null;
    }
    if (originalReplaceState) {
      history.replaceState = originalReplaceState;
      originalReplaceState = null;
    }
    if (popstateHandler) {
      window.removeEventListener("popstate", popstateHandler);
      popstateHandler = null;
    }
    if (navigationInterval) {
      clearInterval(navigationInterval);
      navigationInterval = null;
    }
  }
  var lastUrl = location.href;
  function handleNavigation() {
    if (lastUrl === location.href) return;
    lastUrl = location.href;
    const existingButton = document.querySelector(".image-deck-launch-btn");
    if (existingButton) existingButton.remove();
    const existingDeck = document.querySelector(".image-deck-container");
    if (existingDeck) {
      try {
        const closeBtn = existingDeck.querySelector(".image-deck-close");
        if (closeBtn) {
          closeBtn.click();
        } else {
          existingDeck.remove();
          document.body.classList.remove("image-deck-open");
        }
      } catch (e) {
        existingDeck.remove();
        document.body.classList.remove("image-deck-open");
      }
    }
  }
  function handlePageUnload() {
    cleanupNavigationHandlers();
    try {
      const existingDeck = document.querySelector(".image-deck-container");
      if (existingDeck) {
        const closeBtn = existingDeck.querySelector(".image-deck-close");
        if (closeBtn) {
          closeBtn.click();
        }
      }
    } catch (e) {
      console.warn("[Image Deck] Error closing deck on unload:", e);
    }
  }
  window.addEventListener("beforeunload", handlePageUnload);
  window.addEventListener("pagehide", handlePageUnload);
  function initNavigationHandlers() {
    originalPushState = history.pushState;
    originalReplaceState = history.replaceState;
    history.pushState = function() {
      originalPushState.apply(history, arguments);
      setTimeout(handleNavigation, 100);
    };
    history.replaceState = function() {
      originalReplaceState.apply(history, arguments);
      setTimeout(handleNavigation, 100);
    };
    popstateHandler = () => {
      setTimeout(handleNavigation, 100);
    };
    window.addEventListener("popstate", popstateHandler);
    navigationInterval = setInterval(handleNavigation, 500);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initApp();
      initNavigationHandlers();
    });
  } else {
    initApp();
    initNavigationHandlers();
  }
  window.addEventListener("beforeunload", handlePageUnload);
  window.addEventListener("pagehide", handlePageUnload);
})();
