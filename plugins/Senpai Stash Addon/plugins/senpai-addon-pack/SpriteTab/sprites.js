(function () {
    'use strict';

    // --- CONFIGURATION ---
    const STORAGE_KEY = 'stash_plugin_sprite_settings';
    const PLUGIN_ID = 'SpriteTab';
    const SPRITE_WIDTH_GUESS = 160;
    const DEFAULT_PREVIEW_WIDTH = 300; // Default size of the magnified pop-up in pixels
    const DEFAULTS = { cols: 4 };

    // Plugin settings cache
    let pluginSettings = {
        tooltip_enabled: true,
        tooltip_width: DEFAULT_PREVIEW_WIDTH,
        show_timestamps: true,
        compact_view: false,
        auto_scroll: true,
        grid_columns: null
    };

    // Initialization state to prevent race conditions
    let isInitializing = false;

    // Store scene data for rebuilding on settings change
    let currentSceneData = null;

    // Track if sprites panel is currently shown
    let spritesVisible = false;

    // --- HELPERS ---
    function getSettings() {
        try {
            return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
        } catch (e) { return DEFAULTS; }
    }

    function saveSettings(newSettings) {
        const merged = { ...getSettings(), ...newSettings };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        return merged;
    }

    function formatTime(seconds) {
        if (!seconds) return "0:00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return h > 0
            ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
            : `${m}:${s.toString().padStart(2, '0')}`;
    }

    function getPlayer() {
        return document.querySelector('video.vjs-tech') || document.querySelector('video');
    }

    function isMobileLayout() {
        return window.matchMedia('(max-width: 767px)').matches;
    }

    // --- INJECT CUSTOM STYLES ---
    function injectStyles() {
        // Remove existing styles to allow for settings updates
        const existing = document.getElementById('stash-sprites-css');
        if (existing) existing.remove();

        const style = document.createElement('style');
        style.id = 'stash-sprites-css';
        style.textContent = `
            /* Hide other tab panes when sprites panel is active */
            .tab-content.stash-plugin-sprites-active > .tab-pane {
                display: none !important;
            }
            .tab-content.stash-plugin-sprites-active > #sprites-panel {
                display: block !important;
            }
            /* Pop-up specific styles */
            #stash-sprite-preview {
                position: fixed;
                width: ${pluginSettings.tooltip_width}px;
                aspect-ratio: 16/9;
                background-repeat: no-repeat;
                background-color: #000;
                border: 2px solid #fff;
                box-shadow: 0 4px 15px rgba(0,0,0,0.8);
                z-index: 10000;
                pointer-events: none; /* Allows clicking through the popup */
                display: none;
                border-radius: 4px;
            }
            #stash-sprite-preview .preview-time {
                position: absolute;
                bottom: 5px;
                right: 5px;
                background: rgba(0,0,0,0.8);
                color: #fff;
                font-size: 14px;
                padding: 2px 6px;
                border-radius: 4px;
                font-weight: bold;
            }
            /* Sprite cell styles */
            .sprite-cell {
                /* Prevent native long-press behaviors on mobile */
                -webkit-touch-callout: none;
                -webkit-user-select: none;
                user-select: none;
                touch-action: pan-y; /* Allow vertical scrolling, prevent other gestures */
            }
            /* Toolbar button active state */
            #sprites-toolbar-btn.sprites-active {
                color: #007bff !important;
            }
        `;
        document.head.appendChild(style);
    }

    async function stashGQL(query, variables) {
        const response = await fetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables })
        });
        const json = await response.json();
        return json.data;
    }

    async function loadPluginSettings() {
        const query = `query Configuration { configuration { plugins } }`;
        try {
            const data = await stashGQL(query);
            const allPlugins = data?.configuration?.plugins;
            if (allPlugins && allPlugins[PLUGIN_ID]) {
                const settings = allPlugins[PLUGIN_ID];
                pluginSettings.tooltip_enabled = settings.tooltip_enabled ?? true;
                pluginSettings.tooltip_width = settings.tooltip_width ?? DEFAULT_PREVIEW_WIDTH;
                pluginSettings.show_timestamps = settings.show_timestamps ?? true;
                pluginSettings.compact_view = settings.compact_view ?? false;
                pluginSettings.auto_scroll = settings.auto_scroll ?? true;
                pluginSettings.grid_columns = settings.grid_columns ?? null;
            }
        } catch (e) {
            console.warn('SpriteTab: Could not load plugin settings, using defaults', e);
        }
        return pluginSettings;
    }

    async function getSceneData(sceneId) {
        const query = `query FindScene($id: ID!) { findScene(id: $id) { id files { duration } paths { sprite } } }`;
        try {
            const data = await stashGQL(query, { id: sceneId });
            const scene = data.findScene;
            if (!scene) return null;
            scene.duration = (scene.files?.[0]?.duration) || 0;
            return scene;
        } catch (e) { return null; }
    }

    // --- UI RENDERER ---
    function renderControls(container, updateCallback) {
        // Hide toolbar if grid_columns is configured in plugin settings
        if (pluginSettings.grid_columns) return null;

        const settings = getSettings();
        const bar = document.createElement('div');

        // Sticky positioning to keep controls visible
        bar.style.cssText = `
            padding: 5px 10px;
            display: flex;
            align-items: center;
            background: rgba(30, 30, 30, 0.95);
            border-bottom: 1px solid #444;
            position: sticky;
            top: 0;
            z-index: 100;
            backdrop-filter: blur(5px);
        `;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '1';
        slider.max = '12';
        slider.value = 13 - settings.cols;
        slider.style.cssText = 'cursor: pointer; width: 100%;';

        slider.oninput = (e) => {
            const newVal = parseInt(e.target.value);
            const newCols = 13 - newVal;
            saveSettings({ cols: newCols });
            updateCallback('cols');
        };

        bar.appendChild(slider);

        return bar;
    }

    function renderSpriteGrid(sceneData) {
        if (!sceneData?.paths?.sprite) return null;

        const mainContainer = document.createElement('div');
        mainContainer.style.cssText = "width: 100%; display: flex; flex-direction: column;";

        // Create or get the preview box
        let previewBox = document.getElementById('stash-sprite-preview');
        if (!previewBox) {
            previewBox = document.createElement('div');
            previewBox.id = 'stash-sprite-preview';
            // Add a time display inside the preview
            const timeDisplay = document.createElement('div');
            timeDisplay.className = 'preview-time';
            previewBox.appendChild(timeDisplay);
            document.body.appendChild(previewBox);
        }
        const previewTimeDisplay = previewBox.querySelector('.preview-time');

        const scrollArea = document.createElement('div');
        scrollArea.className = 'sprite-scroll-area';
        scrollArea.style.cssText = 'position: relative; width: 100%; padding-bottom: 50px;';

        const grid = document.createElement('div');
        grid.id = 'stash-sprite-grid';
        const cols = pluginSettings.grid_columns || getSettings().cols;
        grid.style.cssText = `display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: ${pluginSettings.compact_view ? '0' : '5px'}; padding-right: 5px;`;

        const cells = [];
        let totalSpritesCount = 0;

        // Re-query DOM each time to handle React re-renders that may detach elements
        const updateUI = (key) => {
            const ns = getSettings();
            const currentGrid = document.getElementById('stash-sprite-grid');
            if (!currentGrid) return;

            if (key === 'cols') {
                currentGrid.style.gridTemplateColumns = `repeat(${ns.cols}, 1fr)`;
            }
        };

        const controls = renderControls(mainContainer, updateUI);
        if (controls) mainContainer.appendChild(controls);
        mainContainer.appendChild(scrollArea);

        const img = new Image();
        img.src = sceneData.paths.sprite;
        img.onload = () => {
            const sourceW = img.naturalWidth;
            const sourceH = img.naturalHeight;
            const sourceCols = Math.round(sourceW / SPRITE_WIDTH_GUESS);
            const singleH = (sourceW / sourceCols) * (9/16);
            const sourceRows = Math.round(sourceH / singleH);
            totalSpritesCount = sourceCols * sourceRows;

            // Shared across all cells so any touch blocks synthetic mouse events on all cells
            let lastTouchTime = 0;

            for (let i = 0; i < totalSpritesCount; i++) {
                const cell = document.createElement('div');
                cell.className = 'sprite-cell';
                cell.style.cssText = `width: 100%; aspect-ratio: 16/9; background-image: url('${sceneData.paths.sprite}'); background-repeat: no-repeat; cursor: pointer; position: relative;`;
                cell.style.border = pluginSettings.compact_view ? 'none' : '1px solid #333';
                cell.style.borderRadius = pluginSettings.compact_view ? '0' : '4px';

                // Set background mapping
                cell.style.backgroundSize = `${sourceCols * 100}%`;
                const colIdx = i % sourceCols;
                const rowIdx = Math.floor(i / sourceCols);
                const bgPos = `${(colIdx / (sourceCols - 1)) * 100}% ${(rowIdx / (sourceRows - 1)) * 100}%`;
                cell.style.backgroundPosition = bgPos;

                const time = (i / totalSpritesCount) * sceneData.duration;
                const timeStr = formatTime(time);

                if (pluginSettings.show_timestamps) {
                    const ts = document.createElement('span');
                    ts.className = 'sprite-timestamp';
                    ts.innerText = timeStr;
                    ts.style.cssText = 'position: absolute; bottom: 0; right: 0; background: rgba(0,0,0,0.7); color: #fff; font-size: 11px; padding: 1px 4px; pointer-events: none;';
                    cell.appendChild(ts);
                }

                // --- TOOLTIP HELPER FUNCTIONS ---
                const showTooltip = (clientX, clientY, bgPosOverride, timeStrOverride) => {
                    if (!pluginSettings.tooltip_enabled) return;

                    previewBox.style.backgroundImage = `url('${sceneData.paths.sprite}')`;
                    previewBox.style.backgroundSize = `${sourceCols * 100}%`;
                    previewBox.style.backgroundPosition = bgPosOverride !== undefined ? bgPosOverride : bgPos;
                    previewTimeDisplay.innerText = timeStrOverride !== undefined ? timeStrOverride : timeStr;

                    // Calculate tooltip dimensions (use fixed aspect ratio since we know it)
                    const tooltipWidth = pluginSettings.tooltip_width;
                    const tooltipHeight = tooltipWidth * (9 / 16);

                    const vpWidth = window.innerWidth;
                    const vpHeight = window.innerHeight;
                    const offset = 20;
                    const edgePadding = 10;

                    // Calculate position with bounds checking
                    let left = clientX + offset;
                    let top = clientY + offset;

                    // If clipping right edge, flip to left of cursor
                    if (left + tooltipWidth + edgePadding > vpWidth) {
                        left = clientX - tooltipWidth - offset;
                    }
                    // If still clipping left edge, align to left edge with padding
                    if (left < edgePadding) {
                        left = edgePadding;
                    }

                    // If clipping bottom edge, flip to above cursor
                    if (top + tooltipHeight + edgePadding > vpHeight) {
                        top = clientY - tooltipHeight - offset;
                    }
                    // If still clipping top edge, align to top edge with padding
                    if (top < edgePadding) {
                        top = edgePadding;
                    }

                    previewBox.style.top = `${top}px`;
                    previewBox.style.left = `${left}px`;
                    previewBox.style.display = 'block';
                };

                const hideTooltip = () => {
                    previewBox.style.display = 'none';
                };

                const seekToTime = () => {
                    const p = getPlayer();
                    if (p) { p.currentTime = time; p.play(); }
                };

                // --- CLICK HANDLER (desktop) ---
                cell.onclick = (e) => {
                    // Ignore clicks that are synthetic from touch events
                    if (Date.now() - lastTouchTime < 500) return;
                    seekToTime();
                };

                // --- HOVER LOGIC (desktop) ---
                cell.onmouseenter = (e) => {
                    // Ignore synthetic mouse events after touch
                    if (Date.now() - lastTouchTime < 500) return;
                    if(!pluginSettings.compact_view) cell.style.borderColor = '#fff';
                    showTooltip(e.clientX, e.clientY);
                };

                cell.onmousemove = (e) => {
                    // Ignore synthetic mouse events after touch
                    if (Date.now() - lastTouchTime < 500) return;
                    showTooltip(e.clientX, e.clientY);
                };

                cell.onmouseleave = () => {
                    if(!pluginSettings.compact_view) cell.style.border = '1px solid #333';
                    hideTooltip();
                };

                // --- TOUCH LOGIC (mobile) ---
                let touchTimer = null;
                let touchStartPos = null;
                let isLongPress = false;
                let isScrolling = false;

                cell.ontouchstart = (e) => {
                    const touch = e.touches[0];
                    touchStartPos = { x: touch.clientX, y: touch.clientY };
                    isLongPress = false;
                    isScrolling = false;

                    // Only set up long-press if tooltip is enabled
                    if (pluginSettings.tooltip_enabled) {
                        // Start long-press timer (500ms)
                        touchTimer = setTimeout(() => {
                            isLongPress = true;
                            // Prevent default to stop any remaining native behaviors
                            showTooltip(touch.clientX, touch.clientY);
                            if(!pluginSettings.compact_view) cell.style.borderColor = '#fff';
                        }, 500);
                    }
                };

                cell.ontouchmove = (e) => {
                    if (!touchStartPos) return;

                    const touch = e.touches[0];

                    if (isLongPress) {
                        // Long press active: prevent scrolling and update tooltip
                        // to show whichever sprite is currently under the finger
                        e.preventDefault();
                        const hoveredEl = document.elementFromPoint(touch.clientX, touch.clientY);
                        const hoveredCell = hoveredEl && hoveredEl.closest('.sprite-cell');
                        if (hoveredCell && hoveredCell !== cell) {
                            const tsEl = hoveredCell.querySelector('.sprite-timestamp');
                            showTooltip(touch.clientX, touch.clientY,
                                hoveredCell.style.backgroundPosition,
                                tsEl ? tsEl.innerText : '');
                        } else {
                            showTooltip(touch.clientX, touch.clientY);
                        }
                        return;
                    }

                    // Long press not yet active: detect scrolling to cancel the timer
                    const dx = Math.abs(touch.clientX - touchStartPos.x);
                    const dy = Math.abs(touch.clientY - touchStartPos.y);
                    if (dy > 10 || dx > 10) {
                        isScrolling = true;
                        if (touchTimer) {
                            clearTimeout(touchTimer);
                            touchTimer = null;
                        }
                    }
                };

                cell.ontouchend = (e) => {
                    // Record touch time to ignore synthetic mouse events
                    lastTouchTime = Date.now();

                    // Clear the long-press timer
                    if (touchTimer) {
                        clearTimeout(touchTimer);
                        touchTimer = null;
                    }

                    // Hide tooltip
                    hideTooltip();
                    if(!pluginSettings.compact_view) cell.style.border = '1px solid #333';

                    // If it was a long press, don't seek
                    if (isLongPress) {
                        e.preventDefault();
                        isLongPress = false;
                        touchStartPos = null;
                        return;
                    }

                    // If user was scrolling, don't seek
                    if (isScrolling) {
                        isScrolling = false;
                        touchStartPos = null;
                        return;
                    }

                    // Short tap without scrolling - seek to time, then scroll to player
                    seekToTime();
                    if (pluginSettings.auto_scroll && isMobileLayout()) {
                        const player = getPlayer();
                        if (player) player.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                    touchStartPos = null;
                };

                cell.ontouchcancel = () => {
                    // Record touch time to ignore synthetic mouse events
                    lastTouchTime = Date.now();

                    if (touchTimer) {
                        clearTimeout(touchTimer);
                        touchTimer = null;
                    }
                    hideTooltip();
                    if(!pluginSettings.compact_view) cell.style.border = '1px solid #333';
                    isLongPress = false;
                    isScrolling = false;
                    touchStartPos = null;
                };

                cells.push({ element: cell, time: time });
                grid.appendChild(cell);
            }
            scrollArea.appendChild(grid);
            attachVideoListeners(cells, sceneData.duration);
        };

        return mainContainer;
    }

    function attachVideoListeners(cells, duration) {
        let currentActiveIndex = -1;
        const total = cells.length;

        const update = () => {
            const player = getPlayer();
            if (!player) return;

            const idx = Math.floor((player.currentTime / duration) * total);
            const safeIdx = Math.max(0, Math.min(idx, total - 1));

            if (safeIdx !== currentActiveIndex) {
                if (currentActiveIndex >= 0 && cells[currentActiveIndex]) {
                    cells[currentActiveIndex].element.style.boxShadow = 'none';
                    cells[currentActiveIndex].element.style.zIndex = '0';
                }

                if (cells[safeIdx]) {
                    cells[safeIdx].element.style.boxShadow = 'inset 0 0 0 2px #00BFFF';
                    cells[safeIdx].element.style.zIndex = '1';

                    if (pluginSettings.auto_scroll && spritesVisible && !isMobileLayout()) {
                        cells[safeIdx].element.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center',
                            inline: 'nearest'
                        });
                    }

                    currentActiveIndex = safeIdx;
                }
            }
        };

        const poller = setInterval(() => {
            const player = getPlayer();
            if (player) {
                player.addEventListener('timeupdate', update);
                update();
                clearInterval(poller);
            }
        }, 1000);
    }

    // --- MAIN LOGIC ---
    async function init(sceneId) {
        // Prevent duplicate initialization from race conditions
        if (document.getElementById('sprites-toolbar-btn')) return;
        if (isInitializing) return;
        isInitializing = true;

        try {
            // Find the scene toolbar - get the last .scene-toolbar-group (the one with action buttons)
            const toolbarGroups = document.querySelectorAll('.scene-toolbar-group');
            if (toolbarGroups.length === 0) return;
            const toolbar = toolbarGroups[toolbarGroups.length - 1];

            // Load plugin settings first
            await loadPluginSettings();

            // Double-check after async operation to prevent duplicates
            if (document.getElementById('sprites-toolbar-btn')) return;

            injectStyles();

            // Create the toolbar button with an image/photo icon (fa-images)
            const btn = document.createElement('button');
            btn.id = 'sprites-toolbar-btn';
            btn.type = 'button';
            btn.title = 'Sprites';
            btn.className = 'minimal btn btn-secondary';
            btn.innerHTML = `<svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="images" class="svg-inline--fa fa-images fa-icon" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path fill="currentColor" d="M160 32c-35.3 0-64 28.7-64 64l0 224c0 35.3 28.7 64 64 64l352 0c35.3 0 64-28.7 64-64l0-224c0-35.3-28.7-64-64-64L160 32zM396 138.7l96 144c4.9 7.4 5.4 16.8 1.2 24.6S480.9 320 472 320l-144 0-48 0-80 0c-9.2 0-17.6-5.3-21.6-13.6s-2.9-18.2 2.9-25.4l64-80c4.6-5.7 11.4-9 18.7-9s14.2 3.3 18.7 9l17.3 21.6 56-84C360.5 132 368 128 376 128s15.5 4 20 10.7zM192 128a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zM48 120c0-13.3-10.7-24-24-24S0 106.7 0 120L0 344c0 75.1 60.9 136 136 136l320 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-320 0c-48.6 0-88-39.4-88-88l0-224z"></path></svg>`;

            // Insert button before the operations dropdown wrapper (last child)
            const operationsDropdown = toolbar.querySelector('.dropdown');
            if (operationsDropdown && operationsDropdown.parentElement === toolbar) {
                toolbar.insertBefore(btn, operationsDropdown);
            } else if (operationsDropdown && operationsDropdown.parentElement.parentElement === toolbar) {
                // Dropdown is wrapped in a span
                toolbar.insertBefore(btn, operationsDropdown.parentElement);
            } else {
                toolbar.appendChild(btn);
            }

            // Find or create the sprites panel in tab-content
            const navTabs = document.querySelector('.nav-tabs');
            const firstPane = document.querySelector('.tab-content .tab-pane');
            const tabContent = firstPane ? firstPane.parentElement : (navTabs ? navTabs.nextElementSibling : null);
            if (!tabContent) return;

            const tabPane = document.createElement('div');
            tabPane.id = 'sprites-panel';
            tabPane.className = 'tab-pane';
            tabContent.appendChild(tabPane);

            const data = await getSceneData(sceneId);
            currentSceneData = data;
            const grid = renderSpriteGrid(data);
            if (grid) tabPane.appendChild(grid);
            else tabPane.innerHTML = '<div style="padding:20px;">No sprites available.</div>';

            // Helper to rebuild the panel with fresh settings
            const rebuildPanel = async () => {
                const oldSettings = { ...pluginSettings };
                await loadPluginSettings();

                // Check if any settings changed
                const settingsChanged = Object.keys(pluginSettings).some(
                    key => pluginSettings[key] !== oldSettings[key]
                );

                if (settingsChanged && currentSceneData) {
                    injectStyles();
                    tabPane.innerHTML = '';
                    const newGrid = renderSpriteGrid(currentSceneData);
                    if (newGrid) tabPane.appendChild(newGrid);
                    else tabPane.innerHTML = '<div style="padding:20px;">No sprites available.</div>';
                }
            };

            // Toggle sprites panel visibility
            const toggleSprites = async () => {
                spritesVisible = !spritesVisible;

                if (spritesVisible) {
                    // Reload settings in case they changed
                    await rebuildPanel();

                    // Deactivate other tabs and activate sprites
                    if (navTabs) {
                        navTabs.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
                    }
                    tabContent.classList.add('stash-plugin-sprites-active');
                    btn.classList.add('sprites-active');

                    if (pluginSettings.auto_scroll) {
                        const activeCell = tabPane.querySelector('.sprite-cell[style*="box-shadow"]');
                        if (activeCell) activeCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                } else {
                    // Hide sprites panel and show the first tab
                    tabContent.classList.remove('stash-plugin-sprites-active');
                    btn.classList.remove('sprites-active');

                    // Activate the first tab
                    if (navTabs) {
                        const firstTab = navTabs.querySelector('.nav-link');
                        if (firstTab) firstTab.click();
                    }
                }
            };

            btn.onclick = toggleSprites;

            // When any nav tab is clicked, deactivate sprites view
            if (navTabs) {
                navTabs.addEventListener('click', (e) => {
                    const link = e.target.closest('.nav-link');
                    if (link) {
                        spritesVisible = false;
                        tabContent.classList.remove('stash-plugin-sprites-active');
                        btn.classList.remove('sprites-active');
                    }
                }, { capture: true });
            }
        } finally {
            isInitializing = false;
        }
    }

    // --- OBSERVER ---
    const observer = new MutationObserver((mutations) => {
        const match = window.location.pathname.match(/\/scenes\/(\d+)/);
        if (match) {
            const toolbar = document.querySelector('.scene-toolbar-group');
            if (toolbar && !document.getElementById('sprites-toolbar-btn')) {
                init(match[1]);
            }
        } else {
            // Cleanup popup if leaving scene page
            const popup = document.getElementById('stash-sprite-preview');
            if (popup) popup.remove();
            spritesVisible = false;
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();
