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
  function detectContext2() {
    const path = window.location.pathname;
    const hash = window.location.hash;
    const search = window.location.search;
    let filters = {};
    const urlParams = new URLSearchParams(search);
    if (urlParams.has("sortby")) {
      filters.sortBy = urlParams.get("sortby");
    }
    if (urlParams.has("sortdir")) {
      filters.sortDir = urlParams.get("sortdir");
    }
    if (urlParams.has("tags")) {
      const tags = urlParams.get("tags").split(",");
      if (tags.length > 0) {
        filters.tags = {
          value: tags,
          modifier: "INCLUDES"
        };
      }
    }
    if (urlParams.has("performers")) {
      const performers = urlParams.get("performers").split(",");
      if (performers.length > 0) {
        filters.performers = {
          value: performers,
          modifier: "INCLUDES"
        };
      }
    }
    if (urlParams.has("studios")) {
      const studios = urlParams.get("studios").split(",");
      if (studios.length > 0) {
        filters.studios = {
          value: studios,
          modifier: "INCLUDES"
        };
      }
    }
    if (urlParams.has("rating")) {
      const rating = parseInt(urlParams.get("rating"), 10);
      if (!isNaN(rating)) {
        filters.rating100 = {
          value: [rating * 10],
          // Convert to 100-point scale
          modifier: "GREATER_THAN"
        };
      }
    }
    const storedMode = sessionStorage.getItem("imageDeckMode");
    const isImageMode = storedMode === "image";
    if (path === "/") {
      const tagFilter2 = sessionStorage.getItem("galleryTagFilter");
      if (tagFilter2) {
        try {
          const filterObj = JSON.parse(tagFilter2);
          if (filterObj.includedTags && filterObj.includedTags.length > 0 || filterObj.excludedTags && filterObj.excludedTags.length > 0) {
            if (!filters) filters = {};
            if (filterObj.includedTags && filterObj.includedTags.length > 0) {
              filters.tags = {
                value: filterObj.includedTags,
                modifier: "INCLUDES"
              };
            }
            if (filterObj.excludedTags && filterObj.excludedTags.length > 0) {
              if (filters.tags) {
                filters.tags.excludes = filterObj.excludedTags;
              } else {
                filters.tags = {
                  value: [],
                  modifier: "INCLUDES",
                  excludes: filterObj.excludedTags
                };
              }
            }
          }
          if (filterObj.includedPerformers && filterObj.includedPerformers.length > 0 || filterObj.excludedPerformers && filterObj.excludedPerformers.length > 0) {
            if (!filters) filters = {};
            if (filterObj.includedPerformers && filterObj.includedPerformers.length > 0) {
              filters.performers = {
                value: filterObj.includedPerformers,
                modifier: "INCLUDES"
              };
            }
            if (filterObj.excludedPerformers && filterObj.excludedPerformers.length > 0) {
              if (filters.performers) {
                filters.performers.excludes = filterObj.excludedPerformers;
              } else {
                filters.performers = {
                  value: [],
                  modifier: "INCLUDES",
                  excludes: filterObj.excludedPerformers
                };
              }
            }
          }
        } catch (e) {
          console.error("[Image Deck] Error parsing tag filter:", e);
        }
      }
      if (!filters) filters = {};
      if (!filters.sortBy) filters.sortBy = "created_at";
      if (!filters.sortDir) filters.sortDir = "desc";
      return {
        type: isImageMode ? "images" : "galleries",
        isGalleryListing: !isImageMode,
        isGeneralListing: isImageMode,
        filter: filters,
        hash
      };
    }
    if (path.startsWith("/galleries")) {
      const galleryIdMatch = path.match(/^\/galleries\/(\d+)/);
      if (galleryIdMatch) {
        let singleGalleryFilters = {};
        const galleryParams = new URLSearchParams(search);
        if (galleryParams.has("sortby")) {
          singleGalleryFilters.sortBy = galleryParams.get("sortby");
        }
        if (galleryParams.has("sortdir")) {
          singleGalleryFilters.sortDir = galleryParams.get("sortdir");
        }
        if (!galleryParams.get("sortby") && !galleryParams.get("sortdir")) {
          singleGalleryFilters.sortBy = "title";
          singleGalleryFilters.sortDir = "desc";
        }
        return { type: "galleries", id: galleryIdMatch[1], hash, isSingleGallery: true, filter: singleGalleryFilters };
      } else {
        let galleryFilters = {};
        const galleryListingParams = new URLSearchParams(search);
        if (galleryListingParams.has("sortby")) {
          galleryFilters.sortBy = galleryListingParams.get("sortby");
        }
        if (galleryListingParams.has("sortdir")) {
          galleryFilters.sortDir = galleryListingParams.get("sortdir");
        }
        if (!galleryFilters.sortBy) galleryFilters.sortBy = "created_at";
        if (!galleryFilters.sortDir) galleryFilters.sortDir = "desc";
        const tagFilter2 = sessionStorage.getItem("galleryTagFilter");
        if (tagFilter2) {
          try {
            const filterObj = JSON.parse(tagFilter2);
            if (filterObj.includedTags && filterObj.includedTags.length > 0 || filterObj.excludedTags && filterObj.excludedTags.length > 0) {
              if (!galleryFilters) {
                galleryFilters = {};
              }
              if (filterObj.includedTags && filterObj.includedTags.length > 0) {
                galleryFilters.tags = {
                  value: filterObj.includedTags,
                  modifier: "INCLUDES"
                };
              }
              if (filterObj.excludedTags && filterObj.excludedTags.length > 0) {
                if (galleryFilters.tags) {
                  galleryFilters.tags.excludes = filterObj.excludedTags;
                } else {
                  galleryFilters.tags = {
                    value: [],
                    modifier: "INCLUDES",
                    excludes: filterObj.excludedTags
                  };
                }
              }
            }
            if (filterObj.includedPerformers && filterObj.includedPerformers.length > 0 || filterObj.excludedPerformers && filterObj.excludedPerformers.length > 0) {
              if (!galleryFilters) {
                galleryFilters = {};
              }
              if (filterObj.includedPerformers && filterObj.includedPerformers.length > 0) {
                galleryFilters.performers = {
                  value: filterObj.includedPerformers,
                  modifier: "INCLUDES"
                };
              }
              if (filterObj.excludedPerformers && filterObj.excludedPerformers.length > 0) {
                if (galleryFilters.performers) {
                  galleryFilters.performers.excludes = filterObj.excludedPerformers;
                } else {
                  galleryFilters.performers = {
                    value: [],
                    modifier: "INCLUDES",
                    excludes: filterObj.excludedPerformers
                  };
                }
              }
            }
          } catch (e) {
            console.error("Error parsing tag filter:", e);
          }
        }
        return { type: "galleries", isGalleryListing: true, filter: galleryFilters, hash };
      }
    }
    if (path.startsWith("/images")) {
      let imageFilters = {};
      const imageParams = new URLSearchParams(search);
      if (imageParams.has("sortby")) {
        imageFilters.sortBy = imageParams.get("sortby");
      }
      if (imageParams.has("sortdir")) {
        imageFilters.sortDir = imageParams.get("sortdir");
      }
      if (!imageFilters.sortBy) imageFilters.sortBy = "created_at";
      if (!imageFilters.sortDir) imageFilters.sortDir = "desc";
      const tagFilter2 = sessionStorage.getItem("galleryTagFilter");
      if (tagFilter2) {
        try {
          const filterObj = JSON.parse(tagFilter2);
          if (filterObj.includedTags && filterObj.includedTags.length > 0 || filterObj.excludedTags && filterObj.excludedTags.length > 0) {
            if (!imageFilters) {
              imageFilters = {};
            }
            if (filterObj.includedTags && filterObj.includedTags.length > 0) {
              imageFilters.tags = {
                value: filterObj.includedTags,
                modifier: "INCLUDES"
              };
            }
            if (filterObj.excludedTags && filterObj.excludedTags.length > 0) {
              if (imageFilters.tags) {
                imageFilters.tags.excludes = filterObj.excludedTags;
              } else {
                imageFilters.tags = {
                  value: [],
                  modifier: "INCLUDES",
                  excludes: filterObj.excludedTags
                };
              }
            }
          }
          if (filterObj.includedPerformers && filterObj.includedPerformers.length > 0 || filterObj.excludedPerformers && filterObj.excludedPerformers.length > 0) {
            if (!imageFilters) {
              imageFilters = {};
            }
            if (filterObj.includedPerformers && filterObj.includedPerformers.length > 0) {
              imageFilters.performers = {
                value: filterObj.includedPerformers,
                modifier: "INCLUDES"
              };
            }
            if (filterObj.excludedPerformers && filterObj.excludedPerformers.length > 0) {
              if (imageFilters.performers) {
                imageFilters.performers.excludes = filterObj.excludedPerformers;
              } else {
                imageFilters.performers = {
                  value: [],
                  modifier: "INCLUDES",
                  excludes: filterObj.excludedPerformers
                };
              }
            }
          }
        } catch (e) {
          console.error("Error parsing tag filter for images:", e);
        }
      }
      return {
        type: "images",
        isFilteredView: !!search,
        isGeneralListing: !search,
        filter: imageFilters,
        hash
      };
    }
    const performerMatch = path.match(/^\/performers\/(\d+)(?:\/(galleries|images))?/);
    if (performerMatch) {
      const [, performerId, viewType] = performerMatch;
      let type = "galleries";
      if (viewType === "images" || isImageMode) {
        type = "images";
      } else if (viewType === "galleries") {
        type = "galleries";
      }
      let performerFilters = {};
      const performerParams = new URLSearchParams(search);
      if (performerParams.has("sortby")) {
        performerFilters.sortBy = performerParams.get("sortby");
      }
      if (performerParams.has("sortdir")) {
        performerFilters.sortDir = performerParams.get("sortdir");
      }
      if (!performerFilters.sortBy) performerFilters.sortBy = "created_at";
      if (!performerFilters.sortDir) performerFilters.sortDir = "desc";
      performerFilters.performers = { value: [performerId], modifier: "INCLUDES" };
      const tagFilter2 = sessionStorage.getItem("galleryTagFilter");
      if (tagFilter2) {
        try {
          const filterObj = JSON.parse(tagFilter2);
          if (filterObj.includedTags && filterObj.includedTags.length > 0 || filterObj.excludedTags && filterObj.excludedTags.length > 0) {
            if (filterObj.includedTags && filterObj.includedTags.length > 0) {
              performerFilters.tags = {
                value: filterObj.includedTags,
                modifier: "INCLUDES"
              };
            }
            if (filterObj.excludedTags && filterObj.excludedTags.length > 0) {
              if (performerFilters.tags) {
                performerFilters.tags.excludes = filterObj.excludedTags;
              } else {
                performerFilters.tags = {
                  value: [],
                  modifier: "INCLUDES",
                  excludes: filterObj.excludedTags
                };
              }
            }
          }
          if (filterObj.includedPerformers && filterObj.includedPerformers.length > 0 || filterObj.excludedPerformers && filterObj.excludedPerformers.length > 0) {
            if (filterObj.includedPerformers && filterObj.includedPerformers.length > 0) {
              if (performerFilters.performers) {
                const combinedPerformers = [.../* @__PURE__ */ new Set([...performerFilters.performers.value, ...filterObj.includedPerformers])];
                performerFilters.performers.value = combinedPerformers;
              } else {
                performerFilters.performers = {
                  value: filterObj.includedPerformers,
                  modifier: "INCLUDES"
                };
              }
            }
            if (filterObj.excludedPerformers && filterObj.excludedPerformers.length > 0) {
              if (performerFilters.performers) {
                performerFilters.performers.excludes = filterObj.excludedPerformers;
              } else {
                performerFilters.performers = {
                  value: [performerId],
                  modifier: "INCLUDES",
                  excludes: filterObj.excludedPerformers
                };
              }
            }
          }
        } catch (e) {
          console.error("Error parsing tag filter for performer:", e);
        }
      }
      return {
        type,
        id: performerId,
        performerId,
        isPerformerContext: true,
        filter: performerFilters,
        hash
      };
    }
    let fallbackFilters = {};
    const fallbackParams = new URLSearchParams(search);
    if (fallbackParams.has("sortby")) {
      fallbackFilters.sortBy = fallbackParams.get("sortby");
    }
    if (fallbackParams.has("sortdir")) {
      fallbackFilters.sortDir = fallbackParams.get("sortdir");
    }
    if (!fallbackFilters.sortBy) fallbackFilters.sortBy = "created_at";
    if (!fallbackFilters.sortDir) fallbackFilters.sortDir = "desc";
    const tagFilter = sessionStorage.getItem("galleryTagFilter");
    if (tagFilter) {
      try {
        const filterObj = JSON.parse(tagFilter);
        if (filterObj.includedTags && filterObj.includedTags.length > 0 || filterObj.excludedTags && filterObj.excludedTags.length > 0) {
          if (!fallbackFilters) fallbackFilters = {};
          if (filterObj.includedTags && filterObj.includedTags.length > 0) {
            fallbackFilters.tags = {
              value: filterObj.includedTags,
              modifier: "INCLUDES"
            };
          }
          if (filterObj.excludedTags && filterObj.excludedTags.length > 0) {
            if (fallbackFilters.tags) {
              fallbackFilters.tags.excludes = filterObj.excludedTags;
            } else {
              fallbackFilters.tags = {
                value: [],
                modifier: "INCLUDES",
                excludes: filterObj.excludedTags
              };
            }
          }
        }
        if (filterObj.includedPerformers && filterObj.includedPerformers.length > 0 || filterObj.excludedPerformers && filterObj.excludedPerformers.length > 0) {
          if (!fallbackFilters) fallbackFilters = {};
          if (filterObj.includedPerformers && filterObj.includedPerformers.length > 0) {
            fallbackFilters.performers = {
              value: filterObj.includedPerformers,
              modifier: "INCLUDES"
            };
          }
          if (filterObj.excludedPerformers && filterObj.excludedPerformers.length > 0) {
            if (fallbackFilters.performers) {
              fallbackFilters.performers.excludes = filterObj.excludedPerformers;
            } else {
              fallbackFilters.performers = {
                value: [],
                modifier: "INCLUDES",
                excludes: filterObj.excludedPerformers
              };
            }
          }
        }
      } catch (e) {
        console.error("Error parsing tag filter for fallback:", e);
      }
    }
    return {
      type: "images",
      isGeneralListing: true,
      filter: fallbackFilters,
      hash
    };
  }
  function getVisibleImages() {
    const images = [];
    const imageGrid = document.querySelector('.main-content, [role="main"]') || document.body;
    const imageElements = imageGrid.querySelectorAll(".image-card img, .grid-card img");
    const imageArray = Array.from(imageElements);
    imageArray.forEach((img, index) => {
      if (img.src && img.src.includes("/image/") && !img.src.includes("/studio/") && !img.closest(".logo, .sidebar, .header")) {
        const idMatch = img.src.match(/\/image\/(\d+)/);
        const id = idMatch ? idMatch[1] : `img_${index}`;
        const fullImageUrl = img.src.includes("/thumbnail/") ? img.src.replace("/thumbnail/", "/image/") : img.src;
        const card = img.closest(".image-card, .grid-card");
        const previewButton = card?.querySelector(".preview-button");
        images.push({
          id,
          title: img.alt || `Image ${index + 1}`,
          paths: {
            image: fullImageUrl
          },
          previewButton
        });
      }
    });
    return images;
  }
  async function fetchContextImages(context, page = 1, perPage = 50) {
    const { type, id, filter, isSingleGallery, isGalleryListing, isGeneralListing } = context;
    const isFetchingGalleries = isGalleryListing || type === "galleries" && !isSingleGallery || type === "galleries" && isGeneralListing === false;
    const isFetchingImages = !isFetchingGalleries;
    let query = "";
    if (isFetchingGalleries) {
      query = `query FindGalleries($filter: FindFilterType!, $gallery_filter: GalleryFilterType) {
            findGalleries(filter: $filter, gallery_filter: $gallery_filter) {
                count
                galleries {
                    id title image_count cover { paths { thumbnail image } }
                    performers {
                        id
                        name
                    }
                    tags {
                        id
                        name
                    }
                    date
                    rating100
                    organized
                }
            }
        }`;
    } else {
      query = `query FindImages($filter: FindFilterType!, $image_filter: ImageFilterType) {
            findImages(filter: $filter, image_filter: $image_filter) {
                count
                images {
                    id title paths { thumbnail image }
                    performers {
                        id
                        name
                    }
                    tags {
                        id
                        name
                    }
                    date
                    rating100
                    organized
                }
            }
        }`;
    }
    let activeFilter = {};
    if (isSingleGallery && id) {
      activeFilter = { galleries: { value: [parseInt(id, 10)], modifier: "INCLUDES" } };
    } else if (filter) {
      Object.keys(filter).forEach((field) => {
        if (filter[field] && field !== "tags" && field !== "performers" && field !== "studios" && field !== "sortBy" && field !== "sortDir") {
          activeFilter[field] = filter[field];
        }
      });
      if (filter.tags) {
        if (filter.tags.value && filter.tags.value.length > 0 || filter.tags.excludes && filter.tags.excludes.length > 0) {
          activeFilter.tags = {};
          if (filter.tags.value && filter.tags.value.length > 0) {
            const tagIds = filter.tags.value.map((id2) => {
              return typeof id2 === "string" ? parseInt(id2, 10) : id2;
            });
            activeFilter.tags.value = tagIds;
            activeFilter.tags.modifier = filter.tags.modifier || "INCLUDES";
          } else {
            activeFilter.tags.value = [];
            activeFilter.tags.modifier = "INCLUDES_ALL";
          }
          if (filter.tags.excludes && filter.tags.excludes.length > 0) {
            const excludedTagIds = filter.tags.excludes.map((id2) => {
              return typeof id2 === "string" ? parseInt(id2, 10) : id2;
            });
            activeFilter.tags.excludes = excludedTagIds;
          }
        }
      }
      if (filter.performers) {
        if (filter.performers.value && filter.performers.value.length > 0 || filter.performers.excludes && filter.performers.excludes.length > 0) {
          activeFilter.performers = {};
          if (filter.performers.value && filter.performers.value.length > 0) {
            const performerIds = filter.performers.value.map((id2) => {
              return typeof id2 === "string" ? parseInt(id2, 10) : id2;
            });
            activeFilter.performers.value = performerIds;
            activeFilter.performers.modifier = filter.performers.modifier || "INCLUDES";
          } else {
            activeFilter.performers.value = [];
            activeFilter.performers.modifier = "INCLUDES_ALL";
          }
          if (filter.performers.excludes && filter.performers.excludes.length > 0) {
            const excludedPerformerIds = filter.performers.excludes.map((id2) => {
              return typeof id2 === "string" ? parseInt(id2, 10) : id2;
            });
            activeFilter.performers.excludes = excludedPerformerIds;
          }
        }
      }
      if (filter.studios) {
        if (filter.studios.value && filter.studios.value.length > 0 || filter.studios.excludes && filter.studios.excludes.length > 0) {
          activeFilter.studios = {};
          if (filter.studios.value && filter.studios.value.length > 0) {
            const studioIds = filter.studios.value.map((id2) => {
              return typeof id2 === "string" ? parseInt(id2, 10) : id2;
            });
            activeFilter.studios.value = studioIds;
            activeFilter.studios.modifier = filter.studios.modifier || "INCLUDES";
          } else {
            activeFilter.studios.value = [];
            activeFilter.studios.modifier = "INCLUDES_ALL";
          }
          if (filter.studios.excludes && filter.studios.excludes.length > 0) {
            const excludedStudioIds = filter.studios.excludes.map((id2) => {
              return typeof id2 === "string" ? parseInt(id2, 10) : id2;
            });
            activeFilter.studios.excludes = excludedStudioIds;
          }
        }
      }
    }
    if (context.performerId && !activeFilter.performers) {
      activeFilter.performers = {
        value: [parseInt(context.performerId, 10)],
        modifier: "INCLUDES"
      };
    }
    const variables = {
      filter: {
        per_page: perPage,
        page,
        sort: filter?.sortBy || "created_at",
        direction: (filter?.sortDir || "DESC").toUpperCase()
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
        console.error("[Image Deck] GraphQL Errors:", data.errors);
        throw new Error(data.errors[0].message);
      }
      let normalizedImages = [];
      let totalCount = 0;
      if (isFetchingGalleries) {
        let result = data?.data?.findGalleries;
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
        let result = data?.data?.findImages;
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
      const calculatedTotalPages = Math.ceil(totalCount / perPage);
      return {
        images: normalizedImages,
        totalCount,
        currentPage: page,
        totalPages: calculatedTotalPages,
        hasNextPage: page < calculatedTotalPages
      };
    } catch (error) {
      console.error(`[Image Deck] Fetch Error:`, error);
      return {
        images: [],
        totalCount: 0,
        currentPage: 1,
        totalPages: 0,
        hasNextPage: false
      };
    }
  }
  var init_context = __esm({
    "context.js"() {
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
      PLUGIN_NAME = "image-deck";
    }
  });

  // graphql.js
  var graphql_exports = {};
  __export(graphql_exports, {
    applyGalleryTagFilter: () => applyGalleryTagFilter,
    clearGalleryTagFilter: () => clearGalleryTagFilter,
    detectContextWithFilter: () => detectContextWithFilter,
    fetchGalleriesByTags: () => fetchGalleriesByTags,
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
  function detectContextWithFilter() {
    const baseContext = detectContext();
    const tagFilter = sessionStorage.getItem("galleryTagFilter");
    if (tagFilter) {
      try {
        const tagIds = JSON.parse(tagFilter);
        if (tagIds.length > 0) {
          if (!baseContext.filter) {
            baseContext.filter = {};
          }
          baseContext.filter = {
            ...baseContext.filter,
            tags: {
              value: tagIds,
              modifier: "INCLUDES"
            }
          };
        }
      } catch (e) {
        console.error("Error parsing tag filter:", e);
      }
    }
    return baseContext;
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
          const { searchPerformers: searchPerformers2 } = await Promise.resolve().then(() => (init_graphql(), graphql_exports));
          const performers = await searchPerformers2(query);
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
          const { searchTags: searchTags2 } = await Promise.resolve().then(() => (init_graphql(), graphql_exports));
          const tags = await searchTags2(query);
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
        performerDisplay = `<div class="gallery-performers" style="margin-top: 5px; font-size: 18px; color: #ccc;">${performerNames}</div>`;
      }
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
            <img src="${fullSrc}" alt="${title}" decoding="async" loading="${loading}" 
                 style="max-width: 100%; height: auto; display: block; margin: 0 auto;" />
        </div>`;
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
      initialSlide: 0,
      // Simplified zoom configuration - let our custom handlers manage zoom
      zoom: {
        maxRatio: 3,
        minRatio: 1,
        toggle: false,
        // Disable swiper's zoom toggle
        containerClass: "swiper-zoom-container",
        zoomedSlideClass: "swiper-slide-zoomed"
      },
      // Disable swiper's built-in gesture handling
      doubleTapZoom: false,
      doubleTapZoomRatio: 2,
      // Touch configuration that doesn't interfere with custom handlers
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
        },
        // Completely disable swiper's built-in gesture handlers
        doubleTap: function(swiper2, event) {
          event.preventDefault();
          event.stopPropagation();
          return false;
        },
        touchStart: function(swiper2, event) {
        },
        touchMove: function(swiper2, event) {
        },
        touchEnd: function(swiper2, event) {
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
    return swiper;
  }
  var EFFECT_CONFIGS, memoizedGetSlideTemplate;
  var init_swiper = __esm({
    "swiper.js"() {
      init_constants();
      init_state();
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

  // controls.js
  var controls_exports = {};
  __export(controls_exports, {
    cleanupEventHandlers: () => cleanupEventHandlers,
    getElementData: () => getElementData,
    setDeckActive: () => setDeckActive,
    setupEventHandlers: () => setupEventHandlers,
    storeElementData: () => storeElementData
  });
  function storeElementData(element, data) {
    elementData.set(element, data);
  }
  function getElementData(element) {
    return elementData.get(element);
  }
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
        container.classList.remove("hiding-ui");
      }
    }
  }
  function updateControlVisibility(isVisible = true) {
    const container = document.querySelector(".image-deck-container");
    if (!container) return;
    const isInFullscreen = !!document.fullscreenElement;
    if (isInFullscreen) {
      if (isVisible) {
        container.classList.remove("hiding-ui");
      } else {
        container.classList.add("hiding-ui");
      }
    } else {
      const controlsWrapper = container.querySelector(".image-deck-controls-wrapper");
      const topBar = container.querySelector(".image-deck-topbar");
      const speedIndicator = container.querySelector(".image-deck-speed");
      const filterDisplay = container.querySelector(".image-deck-current-filters");
      const fullscreenBtn = container.querySelector(".image-deck-fullscreen");
      const closeBtn = container.querySelector(".image-deck-close");
      const opacity = isVisible ? "1" : "0";
      const pointerEvents = isVisible ? "auto" : "none";
      const elements = [topBar, controlsWrapper, speedIndicator, filterDisplay, fullscreenBtn, closeBtn];
      elements.forEach((el) => {
        if (el) {
          el.style.opacity = opacity;
          el.style.pointerEvents = pointerEvents;
        }
      });
    }
  }
  function isCurrentSlideGallery() {
    const swiper = state.getSwiper();
    if (!swiper) return false;
    const currentIndex = swiper.activeIndex;
    const currentImages2 = window.currentImages || [];
    if (currentIndex < currentImages2.length) {
      const currentImage = currentImages2[currentIndex];
      if (currentImage) {
        return !!(currentImage.url && currentImage.image_count !== void 0);
      }
    }
    const activeSlide = swiper.slides[swiper.activeIndex];
    if (activeSlide) {
      const zoomContainer = activeSlide.querySelector(".swiper-zoom-container");
      return zoomContainer && zoomContainer.dataset.type === "gallery";
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
  function showGalleryTagFilter() {
    const existingModal = document.querySelector(".gallery-tag-filter-modal");
    if (existingModal) {
      existingModal.remove();
    }
    const modal = document.createElement("div");
    modal.className = "gallery-tag-filter-modal image-deck-metadata-modal";
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        max-width: 500px;
        max-height: 90vh;
        background: rgba(0, 0, 0, 0.95);
        backdrop-filter: blur(20px);
        border-radius: 20px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        z-index: 10000;
        display: flex;
        flex-direction: column;
    `;
    modal.innerHTML = `
        <div class="image-deck-metadata-content" style="display: flex; flex-direction: column; height: auto; max-height: 90vh;">
            <div class="image-deck-metadata-header">
                <h3>Filter Galleries by Tag</h3>
                <button class="close-filter-modal image-deck-metadata-close" style="width: 36px; height: 36px; font-size: 24px;">\u2715</button>
            </div>
            <div class="image-deck-metadata-body" style="flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column;">
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: rgba(255,255,255,0.7); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 600;">Included Tags</label>
                    <input type="text" class="included-tag-search" placeholder="Search tags..." style="width: 100%; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; padding: 12px; font-size: 14px; margin-bottom: 10px;">
                    <div class="included-tag-list" style="max-height: 150px; overflow-y: auto; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 5px; margin-bottom: 15px;"></div>
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: rgba(255,255,255,0.7); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 600;">Excluded Tags</label>
                    <input type="text" class="excluded-tag-search" placeholder="Search tags..." style="width: 100%; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; padding: 12px; font-size: 14px; margin-bottom: 10px;">
                    <div class="excluded-tag-list" style="max-height: 150px; overflow-y: auto; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 5px; margin-bottom: 15px;"></div>
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: rgba(255,255,255,0.7); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 600;">Included Performers</label>
                    <input type="text" class="included-performer-search" placeholder="Search performers..." style="width: 100%; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; padding: 12px; font-size: 14px; margin-bottom: 10px;">
                    <div class="included-performer-list" style="max-height: 150px; overflow-y: auto; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 5px; margin-bottom: 15px;"></div>
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: rgba(255,255,255,0.7); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 600;">Excluded Performers</label>
                    <input type="text" class="excluded-performer-search" placeholder="Search performers..." style="width: 100%; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; padding: 12px; font-size: 14px; margin-bottom: 10px;">
                    <div class="excluded-performer-list" style="max-height: 150px; overflow-y: auto; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 5px; margin-bottom: 15px;"></div>
                </div>
            </div>
            <div style="padding: 0 20px 20px 20px;">
                <div style="display: flex; gap: 12px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <button class="clear-tag-filter" style="flex: 1; padding: 14px 24px; border-radius: 8px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">Clear</button>
                    <button class="apply-tag-filter" style="flex: 1; padding: 14px 24px; border-radius: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">Apply Filter</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const cleanupFunctions2 = [];
    const closeBtn = modal.querySelector(".close-filter-modal");
    const closeHandler = () => {
      modal.remove();
      cleanupFunctions2.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          console.warn("[Image Deck] Modal cleanup error:", e);
        }
      });
    };
    closeBtn.addEventListener("click", closeHandler);
    cleanupFunctions2.push(() => closeBtn.removeEventListener("click", closeHandler));
    const escapeHandler = (e) => {
      if (e.key === "Escape") {
        modal.remove();
        document.removeEventListener("keydown", escapeHandler);
        cleanupFunctions2.forEach((fn) => {
          try {
            fn();
          } catch (e2) {
            console.warn("[Image Deck] Modal cleanup error:", e2);
          }
        });
      }
    };
    document.addEventListener("keydown", escapeHandler);
    cleanupFunctions2.push(() => document.removeEventListener("keydown", escapeHandler));
    const modalClickHandler = (e) => {
      if (e.target === modal) {
        modal.remove();
        cleanupFunctions2.forEach((fn) => {
          try {
            fn();
          } catch (e2) {
            console.warn("[Image Deck] Modal cleanup error:", e2);
          }
        });
      }
    };
    modal.addEventListener("click", modalClickHandler);
    cleanupFunctions2.push(() => modal.removeEventListener("click", modalClickHandler));
    const includedSearchInput = modal.querySelector(".included-tag-search");
    const excludedSearchInput = modal.querySelector(".excluded-tag-search");
    const includedPerformerSearchInput = modal.querySelector(".included-performer-search");
    const excludedPerformerSearchInput = modal.querySelector(".excluded-performer-search");
    const includedTagList = modal.querySelector(".included-tag-list");
    const excludedTagList = modal.querySelector(".excluded-tag-list");
    const includedPerformerList = modal.querySelector(".included-performer-list");
    const excludedPerformerList = modal.querySelector(".excluded-performer-list");
    let includedTags = [];
    let excludedTags = [];
    let includedPerformers = [];
    let excludedPerformers = [];
    function setupTagSearch(inputElement, tagListContainer, selectedTags, type) {
      let searchTimeout;
      const inputHandler = async (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        if (query.length >= 1) {
          searchTimeout = setTimeout(async () => {
            try {
              const tags = await searchTags(query);
              renderTagList(tags, tagListContainer, selectedTags, type);
            } catch (error) {
              console.error("Error searching tags:", error);
              tagListContainer.innerHTML = '<div style="color: #ff6b6b; padding: 8px;">Error loading tags</div>';
            }
          }, 300);
        } else {
          tagListContainer.innerHTML = '<div style="color: #999; padding: 8px; text-align: center;">Type to search tags</div>';
        }
      };
      inputElement.addEventListener("input", inputHandler);
      cleanupFunctions2.push(() => inputElement.removeEventListener("input", inputHandler));
    }
    function setupPerformerSearch(inputElement, performerListContainer, selectedPerformers, type) {
      let searchTimeout;
      const inputHandler = async (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        if (query.length >= 1) {
          searchTimeout = setTimeout(async () => {
            try {
              const performers = await searchPerformers(query);
              renderPerformerList(performers, performerListContainer, selectedPerformers, type);
            } catch (error) {
              console.error("Error searching performers:", error);
              performerListContainer.innerHTML = '<div style="color: #ff6b6b; padding: 8px;">Error loading performers</div>';
            }
          }, 300);
        } else {
          performerListContainer.innerHTML = '<div style="color: #999; padding: 8px; text-align: center;">Type to search performers</div>';
        }
      };
      inputElement.addEventListener("input", inputHandler);
      cleanupFunctions2.push(() => inputElement.removeEventListener("input", inputHandler));
    }
    const currentFilter = sessionStorage.getItem("galleryTagFilter");
    if (currentFilter) {
      try {
        const filterObj = JSON.parse(currentFilter);
        includedTags = filterObj.includedTags || [];
        excludedTags = filterObj.excludedTags || [];
        includedPerformers = filterObj.includedPerformers || [];
        excludedPerformers = filterObj.excludedPerformers || [];
        setTimeout(() => {
          if (includedSearchInput.value.trim().length >= 1) {
            includedSearchInput.dispatchEvent(new Event("input"));
          }
          if (excludedSearchInput.value.trim().length >= 1) {
            excludedSearchInput.dispatchEvent(new Event("input"));
          }
          if (includedPerformerSearchInput.value.trim().length >= 1) {
            includedPerformerSearchInput.dispatchEvent(new Event("input"));
          }
          if (excludedPerformerSearchInput.value.trim().length >= 1) {
            excludedPerformerSearchInput.dispatchEvent(new Event("input"));
          }
        }, 100);
      } catch (e) {
        console.error("Error parsing current filter:", e);
      }
    }
    setupTagSearch(includedSearchInput, includedTagList, includedTags, "included");
    setupTagSearch(excludedSearchInput, excludedTagList, excludedTags, "excluded");
    setupPerformerSearch(includedPerformerSearchInput, includedPerformerList, includedPerformers, "included");
    setupPerformerSearch(excludedPerformerSearchInput, excludedPerformerList, excludedPerformers, "excluded");
    if (includedSearchInput.value.trim().length >= 1) {
      includedSearchInput.dispatchEvent(new Event("input"));
    } else {
      includedTagList.innerHTML = '<div style="color: #999; padding: 8px; text-align: center;">Type at least 2 characters to search</div>';
    }
    if (excludedSearchInput.value.trim().length >= 1) {
      excludedSearchInput.dispatchEvent(new Event("input"));
    } else {
      excludedTagList.innerHTML = '<div style="color: #999; padding: 8px; text-align: center;">Type at least 2 characters to search</div>';
    }
    if (includedPerformerSearchInput.value.trim().length >= 1) {
      includedPerformerSearchInput.dispatchEvent(new Event("input"));
    } else {
      includedPerformerList.innerHTML = '<div style="color: #999; padding: 8px; text-align: center;">Type at least 2 characters to search</div>';
    }
    if (excludedPerformerSearchInput.value.trim().length >= 1) {
      excludedPerformerSearchInput.dispatchEvent(new Event("input"));
    } else {
      excludedPerformerList.innerHTML = '<div style="color: #999; padding: 8px; text-align: center;">Type at least 2 characters to search</div>';
    }
    const applyBtn = modal.querySelector(".apply-tag-filter");
    const applyHandler = () => {
      if (includedTags.length > 0 || excludedTags.length > 0 || includedPerformers.length > 0 || excludedPerformers.length > 0) {
        applyGalleryTagFilter(includedTags, excludedTags, includedPerformers, excludedPerformers);
      } else {
        clearGalleryTagFilter();
      }
      modal.remove();
      cleanupFunctions2.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          console.warn("[Image Deck] Modal cleanup error:", e);
        }
      });
    };
    applyBtn.addEventListener("click", applyHandler);
    cleanupFunctions2.push(() => applyBtn.removeEventListener("click", applyHandler));
    const clearBtn = modal.querySelector(".clear-tag-filter");
    const clearHandler = () => {
      includedTags = [];
      excludedTags = [];
      includedPerformers = [];
      excludedPerformers = [];
      includedSearchInput.value = "";
      excludedSearchInput.value = "";
      includedPerformerSearchInput.value = "";
      excludedPerformerSearchInput.value = "";
      includedTagList.innerHTML = '<div style="color: #999; padding: 8px; text-align: center;">Type at least 2 characters to search</div>';
      excludedTagList.innerHTML = '<div style="color: #999; padding: 8px; text-align: center;">Type at least 2 characters to search</div>';
      includedPerformerList.innerHTML = '<div style="color: #999; padding: 8px; text-align: center;">Type at least 2 characters to search</div>';
      excludedPerformerList.innerHTML = '<div style="color: #999; padding: 8px; text-align: center;">Type at least 2 characters to search</div>';
      clearGalleryTagFilter();
      window.dispatchEvent(new CustomEvent("updateDeckContent", {
        detail: { tagIds: [] }
      }));
    };
    clearBtn.addEventListener("click", clearHandler);
    cleanupFunctions2.push(() => clearBtn.removeEventListener("click", clearHandler));
  }
  function renderPerformerList(performers, container, selectedPerformers, type) {
    if (!performers || performers.length === 0) {
      container.innerHTML = '<div style="color: #999; padding: 8px; text-align: center;">No performers found</div>';
      return;
    }
    container.innerHTML = performers.map((performer) => `  
        <div class="performer-item" style="padding: 8px; cursor: pointer; display: flex; align-items: center; border-radius: 4px; margin-bottom: 2px; ${selectedPerformers.includes(performer.id) ? "background: #444;" : "background: #333;"}">
            <input type="checkbox" id="performer-${type}-${performer.id}" ${selectedPerformers.includes(performer.id) ? "checked" : ""} style="margin-right: 8px; cursor: pointer;">
            <label for="performer-${type}-${performer.id}" style="cursor: pointer; flex-grow: 1;">${performer.name}</label>
        </div>
    `).join("");
    container.querySelectorAll(".performer-item").forEach((item, index) => {
      const checkbox = item.querySelector('input[type="checkbox"]');
      const performerId = performers[index].id;
      const clickHandler = (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          updateSelectedPerformers(selectedPerformers, performerId, checkbox.checked);
        }
      };
      const changeHandler = (e) => {
        updateSelectedPerformers(selectedPerformers, performerId, e.target.checked);
      };
      item.addEventListener("click", clickHandler);
      checkbox.addEventListener("change", changeHandler);
    });
  }
  function updateSelectedPerformers(selectedPerformers, performerId, isSelected) {
    if (isSelected) {
      if (!selectedPerformers.includes(performerId)) {
        selectedPerformers.push(performerId);
      }
    } else {
      const idx = selectedPerformers.indexOf(performerId);
      if (idx > -1) {
        selectedPerformers.splice(idx, 1);
      }
    }
  }
  function renderTagList(tags, container, selectedTags, type) {
    if (!tags || tags.length === 0) {
      container.innerHTML = '<div style="color: #999; padding: 8px; text-align: center;">No tags found</div>';
      return;
    }
    container.innerHTML = tags.map((tag) => `
        <div class="tag-item" style="padding: 8px; cursor: pointer; display: flex; align-items: center; border-radius: 4px; margin-bottom: 2px; ${selectedTags.includes(tag.id) ? "background: #444;" : "background: #333;"}">
            <input type="checkbox" id="tag-${type}-${tag.id}" ${selectedTags.includes(tag.id) ? "checked" : ""} style="margin-right: 8px; cursor: pointer;">
            <label for="tag-${type}-${tag.id}" style="cursor: pointer; flex-grow: 1;">${tag.name}</label>
        </div>
    `).join("");
    container.querySelectorAll(".tag-item").forEach((item, index) => {
      const checkbox = item.querySelector('input[type="checkbox"]');
      const tagId = tags[index].id;
      const clickHandler = (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          updateSelectedTags(selectedTags, tagId, checkbox.checked);
        }
      };
      const changeHandler = (e) => {
        updateSelectedTags(selectedTags, tagId, e.target.checked);
      };
      item.addEventListener("click", clickHandler);
      checkbox.addEventListener("change", changeHandler);
    });
  }
  function updateSelectedTags(selectedTags, tagId, isSelected) {
    if (isSelected) {
      if (!selectedTags.includes(tagId)) {
        selectedTags.push(tagId);
      }
    } else {
      const idx = selectedTags.indexOf(tagId);
      if (idx > -1) {
        selectedTags.splice(idx, 1);
      }
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
        return { includedTags: [], excludedTags: [], includedPerformers: [], excludedPerformers: [] };
      }
    }
    return { includedTags: [], excludedTags: [], includedPerformers: [], excludedPerformers: [] };
  }
  function setupEventHandlers(container, callbacks = {}) {
    const { closeDeck: closeDeck2, startAutoPlay: startAutoPlay2, stopAutoPlay: stopAutoPlay2, loadNextChunk: loadNextChunk2 } = callbacks;
    setDeckActive(true);
    const filterChangeListener = async (e) => {
      console.log("[Image Deck] Filter changed, updating content");
      storedContextInfo = detectContext2();
      await updateContentViewWithFilter();
    };
    const cleanupFilterListener = () => {
      window.removeEventListener("galleryTagFilterChanged", filterChangeListener);
    };
    window.addEventListener("galleryTagFilterChanged", filterChangeListener);
    const keyboardHandler = handleKeyboard;
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
        updateControlVisibility(true);
      });
    }
    const galleryFilterBtn = container.querySelector(".gallery-filter-btn");
    if (galleryFilterBtn) {
      eventManager.add(galleryFilterBtn, "click", showGalleryTagFilter);
    }
    const controlButtons = container.querySelectorAll(".image-deck-control-btn");
    controlButtons.forEach((button) => {
      eventManager.add(button, "click", (e) => {
        const action = button.dataset.action;
        const swiper2 = state.getSwiper();
        if (button.classList.contains("gallery-filter-btn")) {
          showGalleryTagFilter();
          return;
        }
        if (!action) return;
        switch (action) {
          case "prev":
            if (swiper2) {
              swiper2.slidePrev();
            } else {
              console.error("[Image Deck] Prev failed: swiper is not defined");
            }
            break;
          case "next":
            if (swiper2) {
              swiper2.slideNext();
              setTimeout(() => {
                loadNextChunk2();
              }, 100);
            } else {
              console.error("[Image Deck] Next failed: swiper is not defined");
            }
            break;
          case "play":
            const playBtn = document.querySelector('[data-action="play"]');
            const isAutoPlaying2 = playBtn && playBtn.classList.contains("active");
            if (isAutoPlaying2) {
              stopAutoPlay2();
            } else {
              startAutoPlay2();
            }
            break;
          case "info":
            updateControlVisibility(false);
            openMetadataModal();
            break;
          case "zoom-in":
            if (swiper2 && swiper2.zoom && !isCurrentSlideGallery()) {
              swiper2.zoom.in();
            }
            break;
          case "zoom-out":
            if (swiper2 && swiper2.zoom && !isCurrentSlideGallery()) {
              swiper2.zoom.out();
            }
            break;
          case "next-chunk":
            loadNextChunk2(container);
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
        const tagId = newButton.dataset.tagId;
        const performerId = newButton.dataset.performerId;
        const currentTags = getCurrentFilterTags();
        let newIncludedTags = currentTags.includedTags.filter((id) => id !== tagId);
        let newExcludedTags = currentTags.excludedTags.filter((id) => id !== tagId);
        let newIncludedPerformers = currentTags.includedPerformers.filter((id) => id !== performerId);
        let newExcludedPerformers = currentTags.excludedPerformers.filter((id) => id !== performerId);
        if (newIncludedTags.length > 0 || newExcludedTags.length > 0 || newIncludedPerformers.length > 0 || newExcludedPerformers.length > 0) {
          const filterObj = {
            includedTags: newIncludedTags,
            excludedTags: newExcludedTags,
            includedPerformers: newIncludedPerformers,
            excludedPerformers: newExcludedPerformers
          };
          sessionStorage.setItem("galleryTagFilter", JSON.stringify(filterObj));
        } else {
          sessionStorage.removeItem("galleryTagFilter");
        }
        window.dispatchEvent(new CustomEvent("galleryTagFilterChanged"));
      });
    });
    const swiper = state.getSwiper();
    let slideChangeListener = null;
    if (swiper) {
      slideChangeListener = function() {
        updateGalleryStateClass();
        updateControlVisibility(true);
      };
      swiper.on("slideChangeTransitionEnd", slideChangeListener);
      setTimeout(() => {
        updateGalleryStateClass();
      }, 0);
    }
    const keyboardHandlerWithActions = (e) => handleKeyboard(e, callbacks);
    eventManager.add(document, "keydown", keyboardHandlerWithActions, true);
    setupSwipeGestures(container, eventManager);
    setupMouseWheel(container, eventManager);
    if (cleanupFilterListener) {
      window._imageDeckFilterCleanup = cleanupFilterListener;
    }
    if (slideChangeListener) {
      window._imageDeckSwiperCleanup = () => {
        if (swiper) {
          swiper.off("slideChangeTransitionEnd", slideChangeListener);
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
    let firstTouchEndTime = 0;
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
        if (e.target.closest(".image-deck-metadata-modal, .gallery-tag-filter-modal") || e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "BUTTON") {
          return;
        }
        touchMoved = false;
        touchCancelled = false;
        const touch = e.touches[0];
        touchStartTime = (/* @__PURE__ */ new Date()).getTime();
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
      },
      handleTouchMove: (e) => {
        if (touchCancelled || e.touches.length > 1) {
          return;
        }
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          const deltaX = Math.abs(touch.clientX - touchStartX);
          const deltaY = Math.abs(touch.clientY - touchStartY);
          if (deltaX > 10 || deltaY > 10) {
            touchMoved = true;
            clearDoubleTapTimer();
          }
          const swiper = state.getSwiper();
          if (swiper && swiper.zoom && swiper.zoom.scale > 1) {
            e.preventDefault();
          }
        }
      },
      handleTouchEnd: (e) => {
        if (e.changedTouches.length === 0) return;
        const currentTime = (/* @__PURE__ */ new Date()).getTime();
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
        if (touchMoved && touchTime > 50 && touchTime < 500) {
          const deltaX = Math.abs(touch.clientX - touchStartX);
          const deltaY = touch.clientY - touchStartY;
          const isInFullscreen = !!document.fullscreenElement;
          if (!isInFullscreen && deltaY > 100 && deltaX < 50) {
            const closeBtn = container.querySelector(".image-deck-close");
            if (closeBtn) {
              closeBtn.click();
            }
          }
        }
      }
    };
    eventManager2.add(swiperEl, "touchstart", touchHandler.handleTouchStart, { passive: false });
    eventManager2.add(swiperEl, "touchmove", touchHandler.handleTouchMove, { passive: false });
    eventManager2.add(swiperEl, "touchend", touchHandler.handleTouchEnd, { passive: true });
    eventManager2.add(swiperEl, "contextmenu", (e) => {
      e.preventDefault();
    });
    eventManager2.add(swiperEl, "gesturestart", (e) => {
      e.preventDefault();
    });
    eventManager2.add(swiperEl, "gesturechange", (e) => {
      e.preventDefault();
    });
    eventManager2.add(swiperEl, "gestureend", (e) => {
      e.preventDefault();
    });
  }
  function handleDoubleTapZoom(event, container) {
    const swiper = state.getSwiper();
    if (!swiper || !swiper.zoom) return;
    event.preventDefault();
    event.stopPropagation();
    if (isCurrentSlideGallery()) {
      console.log("[Image Deck] Double tap ignored - gallery slide");
      return;
    }
    const touch = event.changedTouches[0];
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (touch.clientX - rect.left) / rect.width;
    const y = (touch.clientY - rect.top) / rect.height;
    if (swiper.zoom.scale === 1) {
      swiper.zoom.in(2);
      console.log("[Image Deck] Double tap zoom in");
    } else {
      swiper.zoom.out();
      console.log("[Image Deck] Double tap zoom out");
    }
  }
  function setupMouseWheel(container, eventManager2) {
    const swiperEl = container.querySelector(".image-deck-swiper");
    if (!swiperEl) return;
    eventManager2.add(swiperEl, "wheel", (e) => {
      const swiper = state.getSwiper();
      if (!swiper) return;
      e.preventDefault();
      if (swiper.wheeling) return;
      swiper.wheeling = true;
      if (e.deltaY > 0) {
        swiper.slideNext();
      } else if (e.deltaY < 0) {
        swiper.slidePrev();
      }
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
    const formElements = ["INPUT", "TEXTAREA", "SELECT"];
    if (formElements.includes(e.target.tagName)) {
      if (e.key === " " && e.target.tagName === "INPUT") {
        e.stopPropagation();
        return;
      }
      return;
    }
    const inModalInput = (e.target.closest(".gallery-tag-filter-modal") || e.target.closest(".image-deck-metadata-modal")) && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    if (inModalInput && e.key === " ") {
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Escape", "+", "-", "0"].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
    }
    const swiper = state.getSwiper();
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      if (e.key === "Escape") {
        closeMetadataModal();
        return;
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        const modal = document.querySelector(".image-deck-metadata-modal");
        if (modal && modal.classList.contains("active")) {
          closeMetadataModal();
        } else if (closeDeck2) {
          closeDeck2();
        }
        break;
      case " ":
        e.preventDefault();
        e.stopPropagation();
        const playBtn = document.querySelector('[data-action="play"]');
        if (playBtn && playBtn.classList.contains("active")) {
          if (stopAutoPlay2) stopAutoPlay2();
        } else {
          if (startAutoPlay2) startAutoPlay2();
        }
        break;
      case "i":
      case "I":
        e.preventDefault();
        e.stopPropagation();
        const metadataModal = document.querySelector(".image-deck-metadata-modal");
        if (metadataModal && metadataModal.classList.contains("active")) {
          closeMetadataModal();
        } else {
          updateControlVisibility(false);
          openMetadataModal();
        }
        break;
      case "+":
      case "=":
        e.preventDefault();
        if (swiper && swiper.zoom && !isCurrentSlideGallery()) {
          swiper.zoom.in();
        }
        break;
      case "-":
      case "_":
        e.preventDefault();
        if (swiper && swiper.zoom && !isCurrentSlideGallery()) {
          swiper.zoom.out();
        }
        break;
      case "0":
        e.preventDefault();
        if (swiper && swiper.zoom && !isCurrentSlideGallery()) {
          swiper.zoom.reset();
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        e.stopPropagation();
        if (swiper) {
          swiper.slidePrev();
        }
        break;
      case "ArrowRight":
        e.preventDefault();
        e.stopPropagation();
        if (swiper) {
          swiper.slideNext();
          setTimeout(() => {
            if (swiper) {
              const currentIndex = swiper.activeIndex;
              const totalCurrentSlides = swiper.virtual ? swiper.virtual.slides.length : swiper.slides.length;
            }
          }, 100);
        }
        break;
    }
  }
  function cleanupEventHandlers() {
    eventManager.removeAll();
    isDeckActive = false;
    document.removeEventListener("keydown", handleKeyboard, true);
    const swiper = state.getSwiper();
    if (swiper) {
      swiper.off("slideChangeTransitionEnd");
    }
  }
  var elementData, EventHandlerManager, eventManager, isDeckActive, EventManager;
  var init_controls = __esm({
    "controls.js"() {
      init_graphql();
      init_metadata();
      init_utils();
      init_state();
      init_context();
      elementData = /* @__PURE__ */ new WeakMap();
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
      EventManager = class _EventManager {
        static instance = new _EventManager();
        constructor() {
          this.handlers = /* @__PURE__ */ new Map();
        }
        static add(element, event, handler, options = false) {
          const key = `${element.constructor.name}_${event}_${Date.now()}_${Math.random()}`;
          element.addEventListener(event, handler, options);
          this.instance.handlers.set(key, { element, event, handler, options });
          return key;
        }
        static remove(key) {
          if (this.instance.handlers.has(key)) {
            const { element, event, handler } = this.instance.handlers.get(key);
            element.removeEventListener(event, handler);
            this.instance.handlers.delete(key);
          }
        }
        static removeAll() {
          for (const [key, { element, event, handler }] of this.instance.handlers) {
            try {
              element.removeEventListener(event, handler);
            } catch (e) {
              console.warn("Failed to remove event listener:", e);
            }
          }
          this.instance.handlers.clear();
        }
      };
    }
  });

  // deck.js
  var deck_exports = {};
  __export(deck_exports, {
    closeDeck: () => closeDeck,
    loadNextChunk: () => loadNextChunk,
    openDeck: () => openDeck,
    startAutoPlay: () => startAutoPlay,
    stopAutoPlay: () => stopAutoPlay
  });
  function applySessionFiltersToContext(context) {
    if (!context) return context;
    const tagFilter = sessionStorage.getItem("galleryTagFilter");
    if (!tagFilter) return context;
    try {
      const filterObj = JSON.parse(tagFilter);
      if (!context.filter) {
        context.filter = {};
      }
      if (filterObj.includedTags && filterObj.includedTags.length > 0 || filterObj.excludedTags && filterObj.excludedTags.length > 0) {
        if (!context.filter.tags) {
          context.filter.tags = {};
        }
        if (filterObj.includedTags && filterObj.includedTags.length > 0) {
          context.filter.tags.value = filterObj.includedTags;
          context.filter.tags.modifier = "INCLUDES";
        }
        if (filterObj.excludedTags && filterObj.excludedTags.length > 0) {
          context.filter.tags.excluded = filterObj.excludedTags;
        }
      }
      if (filterObj.includedPerformers && filterObj.includedPerformers.length > 0 || filterObj.excludedPerformers && filterObj.excludedPerformers.length > 0) {
        if (!context.filter.performers) {
          context.filter.performers = {};
        }
        if (filterObj.includedPerformers && filterObj.includedPerformers.length > 0) {
          context.filter.performers.value = filterObj.includedPerformers;
          context.filter.performers.modifier = "INCLUDES";
        }
        if (filterObj.excludedPerformers && filterObj.excludedPerformers.length > 0) {
          context.filter.performers.excluded = filterObj.excludedPerformers;
        }
      }
    } catch (e) {
      console.error("[Image Deck] Error applying stored tag filter:", e);
    }
    return context;
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
    if (chunkLoadTimeout) {
      clearTimeout(chunkLoadTimeout);
      chunkLoadTimeout = null;
    }
    if (performanceMonitor) {
      clearInterval(performanceMonitor);
      performanceMonitor = null;
    }
    if (autoPlayInterval) {
      clearInterval(autoPlayInterval);
      autoPlayInterval = null;
    }
    stopAutoPlay();
    stopPerformanceMonitoring();
    cleanupControls().catch((e) => {
      console.warn("[Image Deck] Controls cleanup error:", e);
    });
    cleanupFunctions.forEach((cleanup, index) => {
      try {
        cleanup();
      } catch (e) {
        console.warn(`[Image Deck] Cleanup function ${index} error:`, e);
      }
    });
    cleanupFunctions = [];
    if (autoPlayInterval) {
      try {
        clearInterval(autoPlayInterval);
      } catch (e) {
        console.warn("[Image Deck] AutoPlay interval clear error:", e);
      }
      autoPlayInterval = null;
    }
    if (performanceMonitor) {
      try {
        clearInterval(performanceMonitor);
      } catch (e) {
        console.warn("[Image Deck] Performance monitor clear error:", e);
      }
      performanceMonitor = null;
    }
    isAutoPlaying = false;
    frameDropCount = 0;
    controlsModuleCache = null;
    currentSwiper = null;
    currentImages = [];
    contextInfo = null;
    storedContextInfo2 = null;
    pluginConfig = null;
    console.log("[Image Deck] Existing state cleaned up");
  }
  function startPerformanceMonitoring() {
    if (!isMobile) return;
    let lastTime = performance.now();
    const fpsThreshold = 30;
    performanceMonitor = setInterval(() => {
      const currentTime = performance.now();
      const deltaTime = currentTime - lastTime;
      const fps = 1e3 / deltaTime;
      if (fps < fpsThreshold) {
        frameDropCount++;
        if (frameDropCount > 5) {
          reduceVisualEffects();
          frameDropCount = 0;
        }
      } else {
        frameDropCount = Math.max(0, frameDropCount - 0.1);
      }
      lastTime = currentTime;
    }, 1e3);
  }
  function reduceVisualEffects() {
    const styles = document.getElementById("image-deck-dynamic-styles");
    if (styles) {
      styles.textContent += `
            .swiper-slide img {
                filter: none !important; /* Remove glow effects */
            }
            .image-deck-ambient {
                display: none !important; /* Hide ambient background */
            }
        `;
    }
  }
  function stopPerformanceMonitoring() {
    if (performanceMonitor) {
      try {
        clearInterval(performanceMonitor);
      } catch (e) {
        console.warn("[Image Deck] Error clearing performance monitor:", e);
      }
      performanceMonitor = null;
    }
    frameDropCount = 0;
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
        return { includedTags: [], excludedTags: [], includedPerformers: [], excludedPerformers: [] };
      }
    }
    return { includedTags: [], excludedTags: [], includedPerformers: [], excludedPerformers: [] };
  }
  async function restoreFilterDisplayOnOpen(container) {
    const existingFilters = container.querySelectorAll(".image-deck-current-filters");
    existingFilters.forEach((el) => el.remove());
    const currentTags = getCurrentFilterTags2();
    const includedTags = currentTags.includedTags || [];
    const excludedTags = currentTags.excludedTags || [];
    const includedPerformers = currentTags.includedPerformers || [];
    const excludedPerformers = currentTags.excludedPerformers || [];
    if (includedTags.length > 0 || excludedTags.length > 0 || includedPerformers.length > 0 || excludedPerformers.length > 0) {
      const allTagIds = [...includedTags, ...excludedTags];
      const allPerformerIds = [...includedPerformers, ...excludedPerformers];
      const tagNames = await getTagNames(allTagIds);
      const performerNames = await getPerformerNames(allPerformerIds);
      const filterDisplay = document.createElement("div");
      filterDisplay.className = "image-deck-current-filters";
      filterDisplay.style.cssText = "position: absolute; top: 60px; left: 20px; right: 20px; z-index: 10; display: flex; flex-wrap: wrap; gap: 5px;";
      let filterHtml = '<span style="color: #ccc; font-size: 12px; background: rgba(0,0,0,0.5); padding: 2px 8px; border-radius: 10px;">FILTERED BY:</span>';
      filterHtml += includedTags.map((tagId) => {
        const tagName = tagNames[tagId] || `Tag:${tagId}`;
        return `
                <span class="filter-tag-display" data-tag-id="${tagId}" style="color: white; font-size: 12px; background: rgba(46, 204, 113, 0.7); padding: 2px 8px; border-radius: 10px; display: flex; align-items: center;">
                    \u2705 ${tagName}
                    <button class="remove-filter-tag" data-tag-id="${tagId}" data-type="included" style="background: none; border: none; color: white; margin-left: 5px; cursor: pointer; font-size: 14px;">\xD7</button>
                </span>`;
      }).join("");
      filterHtml += excludedTags.map((tagId) => {
        const tagName = tagNames[tagId] || `Tag:${tagId}`;
        return `
                <span class="filter-tag-display" data-tag-id="${tagId}" style="color: white; font-size: 12px; background: rgba(231, 76, 60, 0.7); padding: 2px 8px; border-radius: 10px; display: flex; align-items: center;">
                    \u274C ${tagName}
                    <button class="remove-filter-tag" data-tag-id="${tagId}" data-type="excluded" style="background: none; border: none; color: white; margin-left: 5px; cursor: pointer; font-size: 14px;">\xD7</button>
                </span>`;
      }).join("");
      filterHtml += includedPerformers.map((performerId) => {
        const performerName = performerNames[performerId] || `Performer:${performerId}`;
        return `
                <span class="filter-tag-display" data-performer-id="${performerId}" style="color: white; font-size: 12px; background: rgba(233, 30, 99, 0.7); padding: 2px 8px; border-radius: 10px; display: flex; align-items: center;">
                    \u2705 ${performerName}
                    <button class="remove-filter-tag" data-performer-id="${performerId}" data-type="included" style="background: none; border: none; color: white; margin-left: 5px; cursor: pointer; font-size: 14px;">\xD7</button>
                </span>`;
      }).join("");
      filterHtml += excludedPerformers.map((performerId) => {
        const performerName = performerNames[performerId] || `Performer:${performerId}`;
        return `
                <span class="filter-tag-display" data-performer-id="${performerId}" style="color: white; font-size: 12px; background: rgba(233, 30, 99, 0.7); padding: 2px 8px; border-radius: 10px; display: flex; align-items: center;">
                    \u274C ${performerName}
                    <button class="remove-filter-tag" data-performer-id="${performerId}" data-type="excluded" style="background: none; border: none; color: white; margin-left: 5px; cursor: pointer; font-size: 14px;">\xD7</button>
                </span>`;
      }).join("");
      filterDisplay.innerHTML = filterHtml;
      container.insertBefore(filterDisplay, container.querySelector(".image-deck-progress"));
      setTimeout(() => {
        filterDisplay.querySelectorAll(".remove-filter-tag").forEach((button) => {
          button.addEventListener("click", async (e) => {
            e.stopPropagation();
            const tagId = button.dataset.tagId;
            const performerId = button.dataset.performerId;
            const type = button.dataset.type;
            const currentTags2 = getCurrentFilterTags2();
            let newIncludedTags = [...currentTags2.includedTags || []];
            let newExcludedTags = [...currentTags2.excludedTags || []];
            let newIncludedPerformers = [...currentTags2.includedPerformers || []];
            let newExcludedPerformers = [...currentTags2.excludedPerformers || []];
            if (tagId) {
              if (type === "included") {
                newIncludedTags = newIncludedTags.filter((id) => id !== tagId);
              } else if (type === "excluded") {
                newExcludedTags = newExcludedTags.filter((id) => id !== tagId);
              }
            }
            if (performerId) {
              if (type === "included") {
                newIncludedPerformers = newIncludedPerformers.filter((id) => id !== performerId);
              } else if (type === "excluded") {
                newExcludedPerformers = newExcludedPerformers.filter((id) => id !== performerId);
              }
            }
            if (newIncludedTags.length > 0 || newExcludedTags.length > 0 || newIncludedPerformers.length > 0 || newExcludedPerformers.length > 0) {
              const filterObj = {
                includedTags: newIncludedTags,
                excludedTags: newExcludedTags,
                includedPerformers: newIncludedPerformers,
                excludedPerformers: newExcludedPerformers
              };
              sessionStorage.setItem("galleryTagFilter", JSON.stringify(filterObj));
            } else {
              sessionStorage.removeItem("galleryTagFilter");
            }
            window.dispatchEvent(new CustomEvent("galleryTagFilterChanged"));
          });
        });
      }, 0);
    }
  }
  async function getPerformerNames(performerIds) {
    if (!performerIds || performerIds.length === 0) return {};
    try {
      const performerPromises = performerIds.map(async (performerId) => {
        const query = `query FindPerformer($id: ID!) {
                findPerformer(id: $id) {
                    id
                    name
                }
            }`;
        const response = await fetch("/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            variables: { id: performerId }
          })
        });
        const data = await response.json();
        return data?.data?.findPerformer;
      });
      const performerResults = await Promise.all(performerPromises);
      const performerMap = {};
      performerResults.forEach((performer) => {
        if (performer) {
          performerMap[performer.id] = performer.name;
        }
      });
      return performerMap;
    } catch (error) {
      console.error("[Image Deck] Error fetching performer names:", error);
      return {};
    }
  }
  async function forceRefreshGalleryCovers() {
    console.log("[Image Deck] Force refreshing content");
    try {
      const freshContext = applySessionFiltersToContext(detectContext2());
      if (!freshContext) {
        console.error("[Image Deck] Could not detect context for refresh");
        return;
      }
      currentChunkPage = 1;
      const result = await fetchContextImages(freshContext, 1, chunkSize);
      console.log("[Image Deck] Fresh content result:", result);
      if (result && result.images) {
        currentImages = result.images;
        window.currentImages = currentImages;
        totalImageCount = result.totalCount || 0;
        totalPages = result.totalPages || 1;
        if (currentSwiper) {
          console.log("[Image Deck] Rebuilding Swiper with fresh content");
          const container = document.querySelector(".image-deck-container");
          if (container) {
            if (currentSwiper && typeof currentSwiper.destroy === "function") {
              currentSwiper.destroy(true, true);
            }
            currentSwiper = null;
            const swiperEl = container.querySelector(".swiper");
            if (swiperEl) {
              const wrapper = swiperEl.querySelector(".swiper-wrapper");
              if (wrapper) {
                wrapper.innerHTML = "";
              }
            }
            currentSwiper = initSwiper(
              container,
              currentImages,
              pluginConfig,
              () => {
                updateUI(container);
                checkAndLoadNextChunk();
              },
              savePosition,
              freshContext
            );
            window.currentSwiperInstance = currentSwiper;
            setCurrentSwiper(currentSwiper);
            setTimeout(() => {
              if (currentSwiper) {
                currentSwiper.update();
                currentSwiper.slideTo(0, 0, false);
              }
            }, 50);
            setTimeout(() => {
              if (currentSwiper) {
                currentSwiper.update();
              }
            }, 100);
            updateUI(container);
            updateFilterDisplayInUI().catch((error) => {
              console.error("[Image Deck] Error updating filter display:", error);
            });
            console.log("[Image Deck] Swiper rebuilt with", currentImages.length, "items");
          }
        }
      }
    } catch (error) {
      console.error("[Image Deck] Error force refreshing content:", error);
    }
  }
  async function openDeck(targetImageId = null) {
    console.log("[Image Deck] Opening deck...", targetImageId);
    console.log("[Image Deck] Current URL:", window.location.pathname);
    cleanupExistingState();
    try {
      currentChunkPage = 1;
      chunkSize = 50;
      totalImageCount = 0;
      totalPages = 0;
      pluginConfig = await getPluginConfig();
      console.log("[Image Deck] Plugin config loaded:", pluginConfig);
      injectDynamicStyles(pluginConfig);
      let detectedContext = detectContext2();
      const storedMode = localStorage.getItem("imageDeckMode");
      if (detectedContext && detectedContext.type === "galleries" && storedMode === "image") {
        detectedContext = {
          type: "images",
          isGeneralListing: true,
          filter: detectedContext.filter || {},
          hash: window.location.hash
        };
      } else if (detectedContext && (detectedContext.type === "images" || detectedContext.isGeneralListing) && storedMode === "gallery") {
        detectedContext = {
          type: "galleries",
          isGalleryListing: true,
          filter: detectedContext.filter || {},
          hash: window.location.hash
        };
      }
      const path = window.location.pathname;
      const performerMatch = path.match(/^\/performers\/(\d+)(?:\/(galleries|images))?/);
      if (performerMatch) {
        const [, performerId, viewType] = performerMatch;
        let type = "galleries";
        if (viewType === "images" || storedMode === "image") {
          type = "images";
        } else if (viewType === "galleries" || storedMode === "gallery") {
          type = "galleries";
        }
        const existingFilters = detectedContext?.filter || {};
        if (!existingFilters.performers) {
          existingFilters.performers = {
            value: [performerId],
            modifier: "INCLUDES"
          };
        }
        if (!existingFilters.sortBy) existingFilters.sortBy = "created_at";
        if (!existingFilters.sortDir) existingFilters.sortDir = "desc";
        detectedContext = {
          type,
          id: performerId,
          performerId,
          isPerformerContext: true,
          filter: existingFilters
        };
      }
      detectedContext = applySessionFiltersToContext(detectedContext);
      storedContextInfo2 = detectedContext;
      contextInfo = detectedContext;
      console.log("[Image Deck] Context assigned:", contextInfo);
      let imageResult;
      const isListContext = contextInfo && (contextInfo.isSingleGallery || contextInfo.isGalleryListing || contextInfo.type === "images" || contextInfo.isFilteredView || contextInfo.isPerformerContext || window.location.pathname.startsWith("/images"));
      if (targetImageId) {
        console.log("[Image Deck] Using visible images for target navigation");
        imageResult = getVisibleImages();
      } else if (isListContext) {
        console.log("[Image Deck] Using context-based fetching for page 1");
        imageResult = await fetchContextImages(contextInfo, 1, chunkSize);
      } else {
        console.log("[Image Deck] Falling back to visible images");
        imageResult = getVisibleImages();
      }
      if (Array.isArray(imageResult)) {
        currentImages = imageResult;
        totalImageCount = imageResult.length;
        totalPages = 1;
        currentChunkPage = 1;
      } else if (imageResult) {
        currentImages = imageResult.images || [];
        totalImageCount = imageResult.totalCount || 0;
        totalPages = imageResult.totalPages || 1;
        currentChunkPage = imageResult.currentPage || 1;
      }
      console.log(`[Image Deck] Opening with ${currentImages.length} items (chunk 1 of ${totalPages || 1})`);
      const container = await createDeckUI();
      document.body.classList.add("image-deck-open");
      document.body.appendChild(container);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      requestAnimationFrame(() => {
        container.classList.add("active");
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
      setCurrentSwiper(currentSwiper);
      if (currentSwiper) {
        const handleFullscreenUI = () => {
          const isInFullscreen = !!document.fullscreenElement;
          const container2 = document.querySelector(".image-deck-container");
          if (!container2) return;
          if (isInFullscreen) {
            container2.classList.add("fullscreen-mode");
          } else {
            container2.classList.remove("fullscreen-mode");
            container2.classList.remove("hiding-ui");
          }
          const fullscreenBtn = container2.querySelector(".image-deck-fullscreen");
          if (fullscreenBtn) {
            fullscreenBtn.textContent = isInFullscreen ? "\u26F6" : "\u26F6";
          }
        };
        document.addEventListener("fullscreenchange", handleFullscreenUI);
        const cleanupFullscreenListener = () => {
          document.removeEventListener("fullscreenchange", handleFullscreenUI);
        };
        cleanupFunctions.push(cleanupFullscreenListener);
        setTimeout(handleFullscreenUI, 100);
        currentSwiper.on("zoomChange", (swiper, scale) => {
          const container2 = document.querySelector(".image-deck-container");
          if (!container2) return;
          const isInFullscreen = !!document.fullscreenElement;
          if (scale > 1) {
            if (isInFullscreen) {
              container2.classList.add("hiding-ui");
            }
          } else {
            if (isInFullscreen) {
              container2.classList.remove("hiding-ui");
            }
          }
        });
      }
      if (targetImageId) {
        const targetIndex = currentImages.findIndex((img) => img.id === targetImageId);
        if (targetIndex !== -1) {
          console.log(`[Image Deck] Navigating to target image at index ${targetIndex}`);
          setTimeout(() => {
            if (currentSwiper) {
              currentSwiper.slideTo(targetIndex, 0);
              updateUI(container);
            }
          }, 100);
        } else {
          console.warn(`[Image Deck] Target image ${targetImageId} not found in current images`);
          restorePosition();
        }
      } else {
        restorePosition();
      }
      updateUI(container);
      await restoreFilterDisplayOnOpen(container);
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
      const filterUpdateListener = async (e) => {
        console.log("[Image Deck] Received updateDeckContent event:", e.detail);
        setTimeout(async () => {
          await forceRefreshGalleryCovers();
          const container2 = document.querySelector(".image-deck-container");
          if (container2) {
            updateUI(container2);
            await updateFilterDisplayInUI().catch((error) => {
              console.error("[Image Deck] Error updating filter display:", error);
            });
          }
        }, 100);
      };
      if (currentFilterUpdateListener) {
        window.removeEventListener("updateDeckContent", currentFilterUpdateListener);
      }
      currentFilterUpdateListener = filterUpdateListener;
      window.addEventListener("updateDeckContent", currentFilterUpdateListener);
      const cleanupFilterListener = () => {
        if (currentFilterUpdateListener) {
          window.removeEventListener("updateDeckContent", currentFilterUpdateListener);
          currentFilterUpdateListener = null;
        }
      };
      cleanupFunctions = cleanupFunctions.filter((fn) => fn !== cleanupFilterListener);
      cleanupFunctions.push(cleanupFilterListener);
      startPerformanceMonitoring();
    } catch (error) {
      console.error("[Image Deck] Error opening deck:", error);
      alert("Error opening Image Deck: " + error.message);
      cleanupExistingState();
    }
  }
  async function getTagNames(tagIds) {
    if (!tagIds || tagIds.length === 0) return {};
    try {
      const tagPromises = tagIds.map(async (tagId) => {
        const query = `query FindTag($id: ID!) {
                findTag(id: $id) {
                    id
                    name
                }
            }`;
        const response = await fetch("/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            variables: { id: tagId }
          })
        });
        const data = await response.json();
        return data?.data?.findTag;
      });
      const tagResults = await Promise.all(tagPromises);
      const tagMap = {};
      tagResults.forEach((tag) => {
        if (tag) {
          tagMap[tag.id] = tag.name;
        }
      });
      return tagMap;
    } catch (error) {
      console.error("[Image Deck] Error fetching tag names:", error);
      return {};
    }
  }
  async function createDeckUI() {
    const existing = document.querySelector(".image-deck-container");
    if (existing) existing.remove();
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
                <button class="image-deck-control-btn" data-action="prev">\u25C0</button>
                <button class="image-deck-control-btn" data-action="play">\u25B6</button>
                <button class="image-deck-control-btn" data-action="next">\u25B6</button>
                <button class="image-deck-control-btn image-deck-info-btn" data-action="info" title="Image Info (I)">\u2139</button>
                <button class="image-deck-control-btn" data-action="next-chunk" title="Load Next Chunk">\u23ED\uFE0F</button>
                <!-- Gallery filter button only appears in deck viewer -->
                <button class="image-deck-control-btn gallery-filter-btn" title="Filter Galleries by Tag">\u2630</button>
            </div>
        </div>
        <div class="image-deck-speed">Speed: ${pluginConfig?.autoPlayInterval || 3e3}ms</div>
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
    const existingFilters = container.querySelectorAll(".image-deck-current-filters");
    existingFilters.forEach((el) => el.remove());
    const currentTags = getCurrentFilterTags2();
    const includedTags = currentTags.includedTags || [];
    const excludedTags = currentTags.excludedTags || [];
    const includedPerformers = currentTags.includedPerformers || [];
    const excludedPerformers = currentTags.excludedPerformers || [];
    if (includedTags.length > 0 || excludedTags.length > 0 || includedPerformers.length > 0 || excludedPerformers.length > 0) {
      const allTagIds = [...includedTags, ...excludedTags];
      const allPerformerIds = [...includedPerformers, ...excludedPerformers];
      const tagNames = await getTagNames(allTagIds);
      const performerNames = await getPerformerNames(allPerformerIds);
      const filterDisplay = document.createElement("div");
      filterDisplay.className = "image-deck-current-filters";
      filterDisplay.style.cssText = "position: absolute; top: 60px; left: 20px; right: 20px; z-index: 10; display: flex; flex-wrap: wrap; gap: 5px;";
      let filterHtml = '<span style="color: #ccc; font-size: 12px; background: rgba(0,0,0,0.5); padding: 2px 8px; border-radius: 10px;">FILTERED BY:</span>';
      filterHtml += includedTags.map((tagId) => {
        const tagName = tagNames[tagId] || `Tag:${tagId}`;
        return `
                <span class="filter-tag-display" data-tag-id="${tagId}" style="color: white; font-size: 12px; background: rgba(46, 204, 113, 0.7); padding: 2px 8px; border-radius: 10px; display: flex; align-items: center;">
                    \u2705 ${tagName}
                    <button class="remove-filter-tag" data-tag-id="${tagId}" data-type="included" style="background: none; border: none; color: white; margin-left: 5px; cursor: pointer; font-size: 14px;">\xD7</button>
                </span>`;
      }).join("");
      filterHtml += excludedTags.map((tagId) => {
        const tagName = tagNames[tagId] || `Tag:${tagId}`;
        return `
                <span class="filter-tag-display" data-tag-id="${tagId}" style="color: white; font-size: 12px; background: rgba(231, 76, 60, 0.7); padding: 2px 8px; border-radius: 10px; display: flex; align-items: center;">
                    \u274C ${tagName}
                    <button class="remove-filter-tag" data-tag-id="${tagId}" data-type="excluded" style="background: none; border: none; color: white; margin-left: 5px; cursor: pointer; font-size: 14px;">\xD7</button>
                </span>`;
      }).join("");
      filterHtml += includedPerformers.map((performerId) => {
        const performerName = performerNames[performerId] || `Performer:${performerId}`;
        return `
                <span class="filter-tag-display" data-performer-id="${performerId}" style="color: white; font-size: 12px; background: rgba(233, 30, 99, 0.7); padding: 2px 8px; border-radius: 10px; display: flex; align-items: center;">
                    \u2705 ${performerName}
                    <button class="remove-filter-tag" data-performer-id="${performerId}" data-type="included" style="background: none; border: none; color: white; margin-left: 5px; cursor: pointer; font-size: 14px;">\xD7</button>
                </span>`;
      }).join("");
      filterHtml += excludedPerformers.map((performerId) => {
        const performerName = performerNames[performerId] || `Performer:${performerId}`;
        return `
                <span class="filter-tag-display" data-performer-id="${performerId}" style="color: white; font-size: 12px; background: rgba(233, 30, 99, 0.7); padding: 2px 8px; border-radius: 10px; display: flex; align-items: center;">
                    \u274C ${performerName}
                    <button class="remove-filter-tag" data-performer-id="${performerId}" data-type="excluded" style="background: none; border: none; color: white; margin-left: 5px; cursor: pointer; font-size: 14px;">\xD7</button>
                </span>`;
      }).join("");
      filterDisplay.innerHTML = filterHtml;
      container.insertBefore(filterDisplay, container.querySelector(".image-deck-progress"));
      setTimeout(() => {
        const filterButtons = filterDisplay.querySelectorAll(".remove-filter-tag");
        filterButtons.forEach((button) => {
          const newButton = button.cloneNode(true);
          button.parentNode.replaceChild(newButton, button);
          newButton.addEventListener("click", async (e) => {
            e.stopPropagation();
            const tagId = newButton.dataset.tagId;
            const performerId = newButton.dataset.performerId;
            const type = newButton.dataset.type;
            const currentTags2 = getCurrentFilterTags2();
            let newIncludedTags = [...currentTags2.includedTags || []];
            let newExcludedTags = [...currentTags2.excludedTags || []];
            let newIncludedPerformers = [...currentTags2.includedPerformers || []];
            let newExcludedPerformers = [...currentTags2.excludedPerformers || []];
            if (tagId) {
              if (type === "included") {
                newIncludedTags = newIncludedTags.filter((id) => id !== tagId);
              } else if (type === "excluded") {
                newExcludedTags = newExcludedTags.filter((id) => id !== tagId);
              }
            }
            if (performerId) {
              if (type === "included") {
                newIncludedPerformers = newIncludedPerformers.filter((id) => id !== performerId);
              } else if (type === "excluded") {
                newExcludedPerformers = newExcludedPerformers.filter((id) => id !== performerId);
              }
            }
            if (newIncludedTags.length > 0 || newExcludedTags.length > 0 || newIncludedPerformers.length > 0 || newExcludedPerformers.length > 0) {
              const filterObj = {
                includedTags: newIncludedTags,
                excludedTags: newExcludedTags,
                includedPerformers: newIncludedPerformers,
                excludedPerformers: newExcludedPerformers
              };
              sessionStorage.setItem("galleryTagFilter", JSON.stringify(filterObj));
            } else {
              sessionStorage.removeItem("galleryTagFilter");
            }
            window.dispatchEvent(new CustomEvent("galleryTagFilterChanged"));
          });
        });
      }, 0);
    }
    return container;
  }
  async function updateFilterDisplayInUI() {
    const container = document.querySelector(".image-deck-container");
    if (!container) return;
    const existingFilterDisplay = container.querySelector(".image-deck-current-filters");
    if (existingFilterDisplay) {
      existingFilterDisplay.remove();
    }
    const currentTags = getCurrentFilterTags2();
    const includedTags = currentTags.includedTags || [];
    const excludedTags = currentTags.excludedTags || [];
    const includedPerformers = currentTags.includedPerformers || [];
    const excludedPerformers = currentTags.excludedPerformers || [];
    if (includedTags.length > 0 || excludedTags.length > 0 || includedPerformers.length > 0 || excludedPerformers.length > 0) {
      const allTagIds = [...includedTags, ...excludedTags];
      const allPerformerIds = [...includedPerformers, ...excludedPerformers];
      try {
        const [tagNames, performerNames] = await Promise.all([
          getTagNames(allTagIds),
          getPerformerNames(allPerformerIds)
        ]);
        const filterDisplay = document.createElement("div");
        filterDisplay.className = "image-deck-current-filters";
        filterDisplay.style.cssText = "position: absolute; top: 70px; left: 20px; z-index: 10; display: flex; flex-wrap: wrap; gap: 5px; max-width: calc(100% - 40px);";
        let filterHtml = '<span style="color: #ccc; font-size: 12px; background: rgba(0,0,0,0.5); padding: 2px 8px; border-radius: 10px;">FILTERED BY:</span>';
        filterHtml += includedTags.map((tagId) => {
          const tagName = tagNames[tagId] || `Tag:${tagId}`;
          return `
                    <span class="filter-tag-display" data-tag-id="${tagId}" style="color: white; font-size: 12px; background: rgba(46, 204, 113, 0.7); padding: 2px 8px; border-radius: 10px; display: flex; align-items: center; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.3); margin: 2px;">
                        \u2705 ${tagName}
                        <button class="remove-filter-tag" data-tag-id="${tagId}" data-type="included" style="background: none; border: none; color: white; margin-left: 5px; cursor: pointer; font-size: 14px;">\xD7</button>
                    </span>`;
        }).join("");
        filterHtml += excludedTags.map((tagId) => {
          const tagName = tagNames[tagId] || `Tag:${tagId}`;
          return `
                    <span class="filter-tag-display" data-tag-id="${tagId}" style="color: white; font-size: 12px; background: rgba(231, 76, 60, 0.7); padding: 2px 8px; border-radius: 10px; display: flex; align-items: center; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.3); margin: 2px;">
                        \u274C ${tagName}
                        <button class="remove-filter-tag" data-tag-id="${tagId}" data-type="excluded" style="background: none; border: none; color: white; margin-left: 5px; cursor: pointer; font-size: 14px;">\xD7</button>
                    </span>`;
        }).join("");
        filterHtml += includedPerformers.map((performerId) => {
          const performerName = performerNames[performerId] || `Performer:${performerId}`;
          return `
                    <span class="filter-tag-display" data-performer-id="${performerId}" style="color: white; font-size: 12px; background: rgba(233, 30, 99, 0.7); padding: 2px 8px; border-radius: 10px; display: flex; align-items: center; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.3); margin: 2px;">
                        \u2705 ${performerName}
                        <button class="remove-filter-tag" data-performer-id="${performerId}" data-type="included" style="background: none; border: none; color: white; margin-left: 5px; cursor: pointer; font-size: 14px;">\xD7</button>
                    </span>`;
        }).join("");
        filterHtml += excludedPerformers.map((performerId) => {
          const performerName = performerNames[performerId] || `Performer:${performerId}`;
          return `
                    <span class="filter-tag-display" data-performer-id="${performerId}" style="color: white; font-size: 12px; background: rgba(156, 39, 176, 0.7); padding: 2px 8px; border-radius: 10px; display: flex; align-items: center; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.3); margin: 2px;">
                        \u274C ${performerName}
                        <button class="remove-filter-tag" data-performer-id="${performerId}" data-type="excluded" style="background: none; border: none; color: white; margin-left: 5px; cursor: pointer; font-size: 14px;">\xD7</button>
                    </span>`;
        }).join("");
        filterDisplay.innerHTML = filterHtml;
        container.insertBefore(filterDisplay, container.querySelector(".image-deck-progress"));
        setTimeout(() => {
          const filterButtons = filterDisplay.querySelectorAll(".remove-filter-tag");
          filterButtons.forEach((button) => {
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            newButton.addEventListener("click", async (e) => {
              e.stopPropagation();
              const tagId = newButton.dataset.tagId;
              const performerId = newButton.dataset.performerId;
              const type = newButton.dataset.type;
              const currentTags2 = getCurrentFilterTags2();
              let newIncludedTags = [...currentTags2.includedTags || []];
              let newExcludedTags = [...currentTags2.excludedTags || []];
              let newIncludedPerformers = [...currentTags2.includedPerformers || []];
              let newExcludedPerformers = [...currentTags2.excludedPerformers || []];
              if (tagId) {
                if (type === "included") {
                  newIncludedTags = newIncludedTags.filter((id) => id !== tagId);
                } else if (type === "excluded") {
                  newExcludedTags = newExcludedTags.filter((id) => id !== tagId);
                }
              }
              if (performerId) {
                if (type === "included") {
                  newIncludedPerformers = newIncludedPerformers.filter((id) => id !== performerId);
                } else if (type === "excluded") {
                  newExcludedPerformers = newExcludedPerformers.filter((id) => id !== performerId);
                }
              }
              if (newIncludedTags.length > 0 || newExcludedTags.length > 0 || newIncludedPerformers.length > 0 || newExcludedPerformers.length > 0) {
                const filterObj = {
                  includedTags: newIncludedTags,
                  excludedTags: newExcludedTags,
                  includedPerformers: newIncludedPerformers,
                  excludedPerformers: newExcludedPerformers
                };
                sessionStorage.setItem("galleryTagFilter", JSON.stringify(filterObj));
              } else {
                sessionStorage.removeItem("galleryTagFilter");
              }
              window.dispatchEvent(new CustomEvent("galleryTagFilterChanged"));
              await forceRefreshGalleryCovers();
            });
          });
        }, 100);
      } catch (error) {
        console.error("[Image Deck] Error updating filter display:", error);
      }
    }
  }
  function updateUI(container) {
    if (!currentSwiper || uiUpdatePending) return;
    uiUpdatePending = true;
    requestAnimationFrame(() => {
      let modeIndicator = container.querySelector(".mode-indicator");
      if (!modeIndicator) {
        const topBar = container.querySelector(".image-deck-topbar");
        if (topBar) {
          modeIndicator = document.createElement("div");
          modeIndicator.className = "mode-indicator";
          modeIndicator.style.cssText = `
                    position: absolute;
                    left: 20px;
                    top: 40px;  /* Position below the counter */
                    font-size: 14px;
                    font-weight: bold;
                    z-index: 11;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    cursor: pointer;
                `;
          topBar.appendChild(modeIndicator);
          modeIndicator.addEventListener("click", async () => {
            const currentMode = contextInfo?.type === "galleries" ? "gallery" : "image";
            const newMode = currentMode === "gallery" ? "image" : "gallery";
            localStorage.setItem("imageDeckMode", newMode);
            const currentFilters = { ...contextInfo?.filter || {} };
            if (!currentFilters.sortBy) currentFilters.sortBy = "created_at";
            if (!currentFilters.sortDir) currentFilters.sortDir = "desc";
            if (contextInfo?.performerId) {
              if (!currentFilters.performers) {
                currentFilters.performers = {
                  value: [contextInfo.performerId],
                  modifier: "INCLUDES"
                };
              }
              let newPath = `/performers/${contextInfo.performerId}`;
              if (newMode === "gallery") {
                newPath += "/galleries";
              } else {
                newPath += "/images";
              }
              history.pushState({}, "", newPath);
              const newContext = {
                type: newMode === "gallery" ? "galleries" : "images",
                performerId: contextInfo.performerId,
                isPerformerContext: true,
                filter: currentFilters
              };
              Promise.resolve().then(() => (init_deck(), deck_exports)).then((module) => {
                module.closeDeck();
                setTimeout(() => {
                  module.openDeck();
                }, 100);
              });
            } else {
              let basePath = "/";
              if (newMode === "gallery") {
                basePath = "/galleries";
              } else {
                basePath = "/images";
              }
              history.pushState({}, "", basePath);
              const newContext = {
                type: newMode === "gallery" ? "galleries" : "images",
                isGalleryListing: newMode === "gallery",
                isGeneralListing: newMode === "image",
                filter: currentFilters
              };
              Promise.resolve().then(() => (init_deck(), deck_exports)).then((module) => {
                module.closeDeck();
                setTimeout(() => {
                  module.openDeck();
                }, 100);
              });
            }
          });
        }
      }
      if (modeIndicator) {
        const isGalleryMode = contextInfo?.type === "galleries";
        modeIndicator.innerHTML = isGalleryMode ? "\u{1F5BC}\uFE0F Gallery Mode Enabled \u{1F5BC}\uFE0F" : "\u{1F4F7} Image Mode Enabled \u{1F4F7}";
      }
      let current = 1;
      const displayedTotal = currentImages.length;
      const actualTotal = totalImageCount || displayedTotal;
      if (currentSwiper.virtual) {
        current = currentSwiper.activeIndex + 1;
      } else {
        if (currentSwiper.params.loop && contextInfo?.isSingleGallery) {
          const realIndex = currentSwiper.realIndex + 1;
          if (realIndex === 0) {
            current = displayedTotal;
          } else if (realIndex > displayedTotal) {
            current = 1;
          } else {
            current = realIndex;
          }
        } else {
          current = currentSwiper.activeIndex + 1;
        }
      }
      if (pluginConfig.showCounter) {
        const counter = container.querySelector(".image-deck-counter");
        const chunkInfo = totalPages > 1 ? ` (chunk ${currentChunkPage}/${totalPages})` : "";
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
  function savePosition() {
    if (!currentSwiper || !contextInfo) return;
    const key = `${PLUGIN_NAME}_position_${contextInfo.type}_${contextInfo.id}`;
    sessionStorage.setItem(key, currentSwiper.activeIndex.toString());
  }
  function restorePosition() {
    if (!currentSwiper || !contextInfo) return;
    const key = `${PLUGIN_NAME}_position_${contextInfo.type}_${contextInfo.id}`;
    const savedPosition = sessionStorage.getItem(key);
    if (savedPosition) {
      const index = parseInt(savedPosition);
      if (!isNaN(index) && index < (currentSwiper.slides.length || currentImages.length)) {
        currentSwiper.slideTo(index, 0);
      }
    }
  }
  async function loadNextChunk(container = null) {
    if (chunkLoadTimeout) {
      clearTimeout(chunkLoadTimeout);
      chunkLoadTimeout = null;
    }
    chunkLoadTimeout = setTimeout(async () => {
      if (isChunkLoading) {
        console.log("[Image Deck] Load already in progress, skipping...");
        chunkLoadTimeout = null;
        return;
      }
      if (currentChunkPage >= totalPages && totalPages !== 0) {
        console.log("[Image Deck] All chunks already loaded.");
        const loadingIndicator2 = document.querySelector(".image-deck-loading");
        if (loadingIndicator2) {
          loadingIndicator2.textContent = "All items loaded";
          setTimeout(() => {
            if (loadingIndicator2) loadingIndicator2.style.display = "none";
          }, 2e3);
        }
        chunkLoadTimeout = null;
        return;
      }
      isChunkLoading = true;
      const loadingIndicator = document.querySelector(".image-deck-loading");
      const nextChunkButton = document.querySelector('[data-action="next-chunk"]');
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
        const contextToUse = storedContextInfo2 || contextInfo || detectContext2();
        if (!contextToUse) throw new Error("Could not detect context for fetching");
        const nextPage = currentChunkPage + 1;
        const result = await fetchContextImages(contextToUse, nextPage, chunkSize);
        if (!result || !result.images || result.images.length === 0) {
          if (loadingIndicator) loadingIndicator.textContent = "No more items found";
          setTimeout(() => {
            if (loadingIndicator) loadingIndicator.style.display = "none";
          }, 2e3);
          isChunkLoading = false;
          chunkLoadTimeout = null;
          return;
        }
        currentImages.push(...result.images);
        currentChunkPage = nextPage;
        totalPages = result.totalPages || totalPages;
        if (currentSwiper && currentSwiper.virtual) {
          const allSlides = currentImages.map((img) => {
            const fullSrc = img.paths.image;
            const isGallery = img.url && !contextInfo?.isSingleGallery;
            const title = img.title || "Untitled";
            const loading = "lazy";
            if (isGallery) {
              const imageCountDisplay = img.image_count !== void 0 ? `${GALLERY_ICON_SVG}: ${img.image_count}` : "";
              let performerDisplay = "";
              if (img.performers && img.performers.length > 0) {
                const performerNames = img.performers.map((p) => p.name).join(", ");
                performerDisplay = `<div class="gallery-performers" style="margin-top: 5px; font-size: 18px; color: #ccc;">${performerNames}</div>`;
              }
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
                            <img src="${fullSrc}" alt="${title}" decoding="async" loading="${loading}" 
                                 style="max-width: 100%; height: auto; display: block; margin: 0 auto;" />
                        </div>`;
          });
          currentSwiper.virtual.slides = allSlides;
          currentSwiper.virtual.update(true);
          setTimeout(() => {
            if (currentSwiper) currentSwiper.update();
          }, 100);
        } else {
          const galleryGrid = document.querySelector(".gallery-grid");
          if (galleryGrid) {
            result.images.forEach((img) => {
              const imgHTML = `<div class="gallery-item"><img src="${img.paths.image}" alt="${img.title || ""}" class="gallery-img" /></div>`;
              galleryGrid.insertAdjacentHTML("beforeend", imgHTML);
            });
          }
        }
        const container2 = document.querySelector(".image-deck-container");
        if (container2 && typeof updateUI === "function") updateUI(container2);
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
        chunkLoadTimeout = null;
        if (nextChunkButton) {
          nextChunkButton.disabled = false;
          nextChunkButton.style.opacity = "1";
          nextChunkButton.innerHTML = "\u23ED\uFE0F";
        }
      }
    }, 100);
  }
  function closeDeck() {
    console.log("[Image Deck] Closing deck");
    if (chunkLoadTimeout) {
      clearTimeout(chunkLoadTimeout);
      chunkLoadTimeout = null;
    }
    stopAutoPlay();
    stopPerformanceMonitoring();
    cleanupControls().catch((e) => {
      console.warn("[Image Deck] Controls cleanup error:", e);
    });
    cleanupFunctions.forEach((cleanup, index) => {
      try {
        cleanup();
      } catch (e) {
        console.warn(`[Image Deck] Cleanup function ${index} error:`, e);
      }
    });
    cleanupFunctions = [];
    if (window._imageDeckFilterCleanup) {
      try {
        window._imageDeckFilterCleanup();
      } catch (e) {
        console.warn("[Image Deck] Filter listener cleanup error:", e);
      }
      window._imageDeckFilterCleanup = null;
    }
    if (window._imageDeckSwiperCleanup) {
      try {
        window._imageDeckSwiperCleanup();
      } catch (e) {
        console.warn("[Image Deck] Swiper listener cleanup error:", e);
      }
      window._imageDeckSwiperCleanup = null;
    }
    const container = document.querySelector(".image-deck-container");
    if (container) {
      container.classList.remove("active");
      setTimeout(() => {
        try {
          if (container.parentNode) {
            container.remove();
          }
        } catch (e) {
          console.warn("[Image Deck] Container removal error:", e);
        }
        document.body.classList.remove("image-deck-open");
      }, 300);
    }
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
    currentImages = [];
    contextInfo = null;
    storedContextInfo2 = null;
    if (autoPlayInterval) {
      try {
        clearInterval(autoPlayInterval);
      } catch (e) {
        console.warn("[Image Deck] AutoPlay interval clear error:", e);
      }
      autoPlayInterval = null;
    }
    if (performanceMonitor) {
      try {
        clearInterval(performanceMonitor);
      } catch (e) {
        console.warn("[Image Deck] Performance monitor clear error:", e);
      }
      performanceMonitor = null;
    }
    isAutoPlaying = false;
    frameDropCount = 0;
    controlsModuleCache = null;
    storedContextInfo2 = null;
    contextInfo = null;
    pluginConfig = null;
    console.log("[Image Deck] Deck closed and cleaned up");
  }
  var chunkLoadTimeout, pluginConfig, currentSwiper, currentImages, autoPlayInterval, isAutoPlaying, contextInfo, currentChunkPage, chunkSize, totalImageCount, totalPages, storedContextInfo2, performanceMonitor, frameDropCount, cleanupFunctions, controlsModuleCache, isChunkLoading, currentFilterUpdateListener, uiUpdatePending;
  var init_deck = __esm({
    "deck.js"() {
      init_config();
      init_context();
      init_metadata();
      init_swiper();
      init_utils();
      init_constants();
      chunkLoadTimeout = null;
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
      performanceMonitor = null;
      frameDropCount = 0;
      cleanupFunctions = [];
      controlsModuleCache = null;
      isChunkLoading = false;
      currentFilterUpdateListener = null;
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
    <a href="javascript:void(0);" id="${buttonId}" class="minimal p-4 p-xl-2 d-flex d-xl-inline-block flex-column justify-content-between align-items-center btn btn-primary" title="Open Image Deck">
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
      Promise.resolve().then(() => (init_deck(), deck_exports)).then((module) => module.openDeck());
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
  function retryCreateButton(attempts = 0, maxAttempts = 5) {
    createLaunchButton();
  }

  // ui.js
  var processedButtons = /* @__PURE__ */ new Set();
  function processPreviewButton(previewContainer) {
    if (!previewContainer || previewContainer.dataset.deckProcessed === "true") {
      return;
    }
    const button = previewContainer.querySelector("button");
    if (!button) return;
    const svg = button.querySelector("svg");
    const isPreviewButton = svg && svg.dataset.icon === "magnifying-glass";
    if (!isPreviewButton) return;
    previewContainer.dataset.deckProcessed = "true";
    processedButtons.add(previewContainer);
    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("[Image Deck] Preview button clicked (dynamic)");
      const card = previewContainer.closest(".image-card, .grid-card");
      const img = card?.querySelector('img[src*="/image/"]');
      let targetImageId = null;
      if (img) {
        const idMatch = img.src.match(/\/image\/(\d+)/);
        if (idMatch) {
          targetImageId = idMatch[1];
        }
      }
      Promise.resolve().then(() => (init_deck(), deck_exports)).then((module) => {
        module.openDeck(targetImageId);
      }).catch((error) => {
        console.error("[Image Deck] Error loading deck module:", error);
      });
    };
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    newButton.addEventListener("click", handleClick);
    newButton._deckCleanup = function() {
      newButton.removeEventListener("click", handleClick);
      delete newButton._deckCleanup;
      if (previewContainer.parentNode) {
        delete previewContainer.dataset.deckProcessed;
      }
      processedButtons.delete(previewContainer);
    };
    previewContainer._deckButtonCleanup = newButton._deckCleanup;
  }
  function processExistingPreviewButtons() {
    const buttons = document.querySelectorAll("button");
    buttons.forEach((button) => {
      const svg = button.querySelector("svg");
      if (svg && svg.dataset.icon === "magnifying-glass" && !button.closest('[data-deck-processed="true"]')) {
        const previewContainer = button.closest('[class*="preview"]') || button.parentElement;
        if (previewContainer) {
          processPreviewButton(previewContainer);
        }
      }
    });
  }
  var previewObserver = null;
  function initPreviewObserver() {
    if (previewObserver) {
      previewObserver.disconnect();
    }
    previewObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            let previewContainers = [];
            const possibleContainers = node.querySelectorAll('.image-card, .grid-card, [class*="preview"]');
            possibleContainers.forEach((container) => {
              if (!container.dataset.deckProcessed) {
                const previewBtn = container.querySelector('button svg[data-icon="magnifying-glass"]');
                if (previewBtn) {
                  previewContainers.push(container);
                }
              }
            });
            if (node.nodeType === 1 && !node.dataset.deckProcessed) {
              const previewBtn = node.querySelector('button svg[data-icon="magnifying-glass"]');
              if (previewBtn) {
                previewContainers.push(node);
              }
            }
            previewContainers.forEach((container) => {
              if (!container.dataset.deckProcessed) {
                processPreviewButton(container);
              }
            });
          }
        });
      });
    });
    previewObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    processExistingPreviewButtons();
  }
  function initialize() {
    console.log("[Image Deck] Initializing...");
    if (typeof Swiper === "undefined") {
      console.error("[Image Deck] Swiper not loaded!");
      return;
    }
    retryCreateButton();
    initPreviewObserver();
    let debounceTimer;
    const observer = new MutationObserver((mutations) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const hasButton = document.querySelector(".image-deck-launch-btn");
        const shouldHaveButton = document.querySelectorAll('img[src*="/image/"]').length > 0 || document.querySelectorAll(".gallery-cover img, .gallery-card img").length > 0;
        if (!hasButton && shouldHaveButton) {
          createLaunchButton();
        }
      }, 300);
    });
    const mainContent = document.querySelector(".main-content") || document.querySelector('[role="main"]') || document.body;
    observer.observe(mainContent, {
      childList: true,
      subtree: true
    });
    console.log("[Image Deck] Initialized");
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
