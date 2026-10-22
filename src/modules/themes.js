const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { extensionsDir, writeLog } = require('./logger');
const { getConfig, saveConfig } = require('./config');

const themesDir = path.join(extensionsDir, 'data', 'themes');
if (!fs.existsSync(themesDir)) {
    try {
        fs.mkdirSync(themesDir, { recursive: true });
    } catch (_) {}
}

const NATIVE_GRADIENT_PRESETS = [
    { id: 'none', presetId: -1, name: 'Стандартная тема Discord', angle: 135, colors: ['#313338', '#1e1f22'] },
    { id: 'mint_apple', presetId: 0, name: 'Мятное яблоко', angle: 180, colors: ['#56b69f', '#63bc61', '#9eca67'] },
    { id: 'citrus', presetId: 1, name: 'Цитрус', angle: 180, colors: ['#f3b336', '#ee8558'] },
    { id: 'retro_raincloud', presetId: 2, name: 'Ретро дождь', angle: 149, colors: ['#3a7ca1', '#7f7eb9', '#3a7ca1'] },
    { id: 'sakura', presetId: 3, name: 'Сакура', angle: 38, colors: ['#efaab3', '#efd696', '#a6daa2'] },
    { id: 'sunrise', presetId: 4, name: 'Восход', angle: 154, colors: ['#9f4175', '#c49064', '#a6953d'] },
    { id: 'cotton_candy', presetId: 5, name: 'Сладкая вата', angle: 180, colors: ['#f4abb8', '#b1c2fc'] },
    { id: 'lofi_vibes', presetId: 6, name: 'Лоу фай', angle: 180, colors: ['#a4c0f7', '#a9e4e8', '#b0e2b8', '#cfdfa2'] },
    { id: 'desert_khaki', presetId: 7, name: 'Пустынный хаки', angle: 39, colors: ['#e7dbd0', '#dfd0b2', '#e0d6a3'] },
    { id: 'sunset', presetId: 8, name: 'Закат', angle: 142, colors: ['#48288c', '#db7f4b'] },
    { id: 'chroma', presetId: 9, name: 'Хрома', angle: 129, colors: ['#0eb5bf', '#4c0ce0', '#a308a7', '#9a53ff', '#218be0'] },
    { id: 'forest', presetId: 10, name: 'Лес', angle: 162, colors: ['#142215', '#2d4d39', '#454c32', '#5a7c58', '#a98e4b'] },
    { id: 'crimson', presetId: 11, name: 'Багровый', angle: 65, colors: ['#950909', '#000000'] },
    { id: 'midnight', presetId: 12, name: 'Полночь', angle: 48, colors: ['#5348ca', '#140730'] },
    { id: 'mars', presetId: 13, name: 'Марс', angle: 171, colors: ['#895240', '#8f4343'] },
    { id: 'dusk', presetId: 14, name: 'Сумерки', angle: 180, colors: ['#665069', '#91a3d1'] },
    { id: 'under_the_sea', presetId: 15, name: 'Морские глубины', angle: 179, colors: ['#647962', '#588575', '#6a8482'] },
    { id: 'retro_storm', presetId: 17, name: 'Ретро шторм', angle: 149, colors: ['#3a7ca1', '#58579a', '#3a7ca1'] },
    { id: 'neon_nights', presetId: 18, name: 'Неоновые ночи', angle: 180, colors: ['#01a89e', '#7d60ba', '#b43898'] },
    { id: 'aurora', presetId: 21, name: 'Аврора', angle: 239, colors: ['#062053', '#191fbb', '#13929a', '#218573', '#051a81'] },
    { id: 'blurple_twilight', presetId: 22, name: 'Сумеречный блёрпл', angle: 48, colors: ['#2c3fe7', '#261d83'] },
    { id: 'sepia', presetId: 23, name: 'Сепия', angle: 70, colors: ['#857664', '#5b4421'] }
];

function parseThemeMeta(content) {
    const meta = {
        name: 'Пользовательская тема',
        description: 'Стили оформления Discord',
        author: 'Неизвестно',
        version: '1.0.0'
    };
    try {
        const metaMatch = content.match(/\/\*\*?[\s\S]*?\*\//) || content.match(/\/\/META[\s\S]*?\*\//);
        if (metaMatch) {
            const block = metaMatch[0];
            const name = block.match(/@name\s+([^\r\n*]+)/i);
            const desc = block.match(/@description\s+([^\r\n*]+)/i);
            const auth = block.match(/@author\s+([^\r\n*]+)/i);
            const ver = block.match(/@version\s+([^\r\n*]+)/i);
            if (name) meta.name = name[1].trim();
            if (desc) meta.description = desc[1].trim();
            if (auth) meta.author = auth[1].trim();
            if (ver) meta.version = ver[1].trim();
        }
    } catch (_) {}
    return meta;
}

function getInstalledCustomThemes() {
    const list = [];
    if (!fs.existsSync(themesDir)) return list;
    try {
        const files = fs.readdirSync(themesDir);
        for (const file of files) {
            if (file.endsWith('.css') || file.endsWith('.theme.css')) {
                const fullPath = path.join(themesDir, file);
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
                        continue;
                    }
                    const meta = parseThemeMeta(content);
                    list.push({
                        id: file,
                        fileName: file,
                        name: meta.name || file,
                        description: meta.description,
                        author: meta.author,
                        version: meta.version,
                        path: fullPath,
                        css: content
                    });
                } catch (_) {}
            }
        }
    } catch (_) {}
    return list;
}

function getActiveThemesState() {
    const cfg = getConfig();
    return {
        activeNativeTheme: cfg.activeNativeTheme || 'none',
        enabledCustomThemes: Array.isArray(cfg.enabledCustomThemes) ? cfg.enabledCustomThemes : []
    };
}

function applyNativeGradientTheme(win, themeId) {
    if (!win || win.isDestroyed()) return;
    const isNone = (!themeId || themeId === 'none');
    const preset = NATIVE_GRADIENT_PRESETS.find(p => p.id === themeId) || NATIVE_GRADIENT_PRESETS[0];
    const targetPresetId = isNone ? -1 : preset.presetId;

    const script = `
        (function() {
            try {
                const targetId = ${targetPresetId};
                window.__discordExtTargetPresetId = targetId;

                // Remove legacy override element if present
                const oldEl = document.getElementById('discord-ext-native-gradient');
                if (oldEl) oldEl.remove();

                function getWebpackStuff() {
                    try {
                        const wp = window.Vencord?.Webpack;
                        if (!wp || !wp.wreq) {
                            return { perks: null, store: null, dispatcher: null };
                        }
                        let perks = null;
                        try {
                            perks = wp.findByProps('canUseClientThemes');
                        } catch (_) {}

                        let store = null;
                        try {
                            store = wp.findStore('ClientThemesBackgroundStore');
                        } catch (_) {}

                        let dispatcher = null;
                        try {
                            dispatcher = wp.Common?.FluxDispatcher || wp.findByProps('dispatch', 'subscribe');
                        } catch (_) {}

                        return { perks, store, dispatcher };
                    } catch (_) {
                        return { perks: null, store: null, dispatcher: null };
                    }
                }

                function doApply(pId) {
                    try {
                        const { perks, store, dispatcher } = getWebpackStuff();
                        if (!dispatcher || typeof dispatcher.dispatch !== 'function') return false;

                        if (perks && typeof perks.canUseClientThemes === 'function') {
                            perks.canUseClientThemes = () => true;
                        }

                        if (store) {
                            try {
                                Object.defineProperty(store, 'isPreview', { get: () => false, configurable: true });
                            } catch (_) {}

                            const currentPreset = (typeof store.backgroundGradientPresetId !== 'undefined')
                                ? store.backgroundGradientPresetId
                                : (store.gradientPreset?.presetId ?? -1);

                            const neededPreset = pId >= 0 ? pId : null;
                            if (currentPreset === neededPreset) {
                                return true;
                            }
                        }

                        try {
                            dispatcher.dispatch({
                                type: 'UPDATE_BACKGROUND_GRADIENT_PRESET',
                                presetId: pId >= 0 ? pId : null
                            });
                            return true;
                        } catch (dispatchErr) {
                            return false;
                        }
                    } catch (_) {
                        return false;
                    }
                }

                let syncTimer = null;
                function setupSyncListeners() {
                    try {
                        if (window.__discordExtThemeSubscribed) return;
                        const { dispatcher } = getWebpackStuff();
                        if (!dispatcher || typeof dispatcher.subscribe !== 'function') return;

                        window.__discordExtThemeSubscribed = true;
                        const syncEvents = [
                            'CONNECTION_OPEN',
                            'CACHE_LOADED',
                            'USER_SETTINGS_PROTO_UPDATE',
                            'SELECTIVELY_SYNCED_USER_SETTINGS_UPDATE',
                            'UNSYNCED_USER_SETTINGS_UPDATE'
                        ];

                        syncEvents.forEach(evt => {
                            try {
                                dispatcher.subscribe(evt, () => {
                                    const currentTarget = window.__discordExtTargetPresetId;
                                    if (typeof currentTarget === 'number') {
                                        if (syncTimer) clearTimeout(syncTimer);
                                        syncTimer = setTimeout(() => {
                                            doApply(currentTarget);
                                        }, 120);
                                    }
                                });
                            } catch (_) {}
                        });
                    } catch (_) {}
                }

                // If Webpack provides onceReady, listen to it immediately
                try {
                    const wp = window.Vencord?.Webpack;
                    if (wp && wp.onceReady && typeof wp.onceReady.then === 'function') {
                        wp.onceReady.then(() => {
                            try {
                                setupSyncListeners();
                                doApply(targetId);
                            } catch (_) {}
                        });
                    }
                } catch (_) {}

                // Initial application attempt
                try {
                    doApply(targetId);
                    setupSyncListeners();
                } catch (_) {}

                // Startup watchdog timer: ensures Webpack is ready and re-applies if cloud sync wiped it
                if (window.__discordExtThemeWatchdog) {
                    clearInterval(window.__discordExtThemeWatchdog);
                }

                let checks = 0;
                window.__discordExtThemeWatchdog = setInterval(() => {
                    try {
                        checks++;
                        const currentTarget = window.__discordExtTargetPresetId;
                        setupSyncListeners();

                        if (typeof currentTarget === 'number') {
                            const { store, dispatcher } = getWebpackStuff();
                            if (dispatcher && store) {
                                const currentPreset = (typeof store.backgroundGradientPresetId !== 'undefined')
                                    ? store.backgroundGradientPresetId
                                    : (store.gradientPreset?.presetId ?? -1);
                                const neededPreset = currentTarget >= 0 ? currentTarget : null;
                                if (currentPreset !== neededPreset) {
                                    doApply(currentTarget);
                                }
                            }
                        }

                        if (checks >= 15) {
                            clearInterval(window.__discordExtThemeWatchdog);
                            window.__discordExtThemeWatchdog = null;
                        }
                    } catch (_) {}
                }, 500);

            } catch (e) {
                console.error('[DiscordExtensions] applyNativeGradientTheme error:', e);
            }
        })();
    `;
    win.webContents.executeJavaScript(script).catch(() => {});
}

function applyThemesToWindow(win) {
    if (!win || win.isDestroyed()) return;
    const state = getActiveThemesState();
    applyNativeGradientTheme(win, state.activeNativeTheme);

    const customThemes = getInstalledCustomThemes();
    const activeCustomCss = [];
    for (const theme of customThemes) {
        if (state.enabledCustomThemes.includes(theme.id) || state.enabledCustomThemes.includes(theme.fileName)) {
            activeCustomCss.push({ id: theme.id, css: theme.css });
        }
    }

    const script = `
        (function() {
            try {
                const currentActiveIds = ${JSON.stringify(activeCustomCss.map(x => x.id))};
                const existingStyles = document.querySelectorAll('[id^="discord-ext-custom-theme-"]');
                for (const st of existingStyles) {
                    const id = st.id.replace('discord-ext-custom-theme-', '');
                    if (!currentActiveIds.includes(id)) {
                        st.remove();
                    }
                }

                const activeList = ${JSON.stringify(activeCustomCss)};
                const rootTarget = document.documentElement || document.head;

                for (const item of activeList) {
                    const styleId = 'discord-ext-custom-theme-' + item.id;
                    let st = document.getElementById(styleId);
                    if (!st) {
                        st = document.createElement('style');
                        st.id = styleId;
                        st.textContent = item.css;
                        if (rootTarget) rootTarget.appendChild(st);
                    } else {
                        if (st.textContent !== item.css) {
                            st.textContent = item.css;
                        }
                        if (rootTarget && st.parentNode !== rootTarget) {
                            rootTarget.appendChild(st);
                        }
                    }
                }
            } catch (_) {}
        })();
    `;
    win.webContents.executeJavaScript(script).catch(() => {});
}

function updateThemesAcrossWindows() {
    let electron = null;
    try {
        electron = require('electron');
    } catch (_) {}
    const BrowserWindow = electron?.BrowserWindow;
    if (!BrowserWindow) return;
    const { isMainWindow } = require('./windowUtils');
    const { getManagerWindow } = require('./managerWindow');
    const mgr = getManagerWindow();

    for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue;
        if (mgr && win === mgr) continue;
        if (!isMainWindow(win, mgr)) continue;
        applyThemesToWindow(win);
    }
}

function normalizeThemeDownloadUrl(inputUrl) {
    let u = String(inputUrl || '').trim();
    // GitHub blob to raw URL: https://github.com/user/repo/blob/ref/path -> https://raw.githubusercontent.com/user/repo/ref/path
    const ghBlobMatch = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
    if (ghBlobMatch) {
        return 'https://raw.githubusercontent.com/' + ghBlobMatch[1] + '/' + ghBlobMatch[2] + '/' + ghBlobMatch[3];
    }
    // GitHub gist to raw: https://gist.github.com/user/id -> https://gist.githubusercontent.com/user/id/raw
    const gistMatch = u.match(/^https?:\/\/gist\.github\.com\/([^/]+)\/([a-f0-9]+)$/i);
    if (gistMatch) {
        return 'https://gist.githubusercontent.com/' + gistMatch[1] + '/' + gistMatch[2] + '/raw';
    }
    return u;
}

function downloadThemeFromUrl(rawUrl) {
    const url = normalizeThemeDownloadUrl(rawUrl);
    return new Promise((resolve, reject) => {
        try {
            const parsed = new URL(url);
            const client = parsed.protocol === 'https:' ? https : http;
            client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    let nextUrl = res.headers.location;
                    if (!nextUrl.startsWith('http')) {
                        nextUrl = new URL(nextUrl, url).href;
                    }
                    return downloadThemeFromUrl(nextUrl).then(resolve).catch(reject);
                }
                if (res.statusCode !== 200) {
                    return reject(new Error('HTTP статус ' + res.statusCode));
                }
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    if (data.includes('<!DOCTYPE html>') || data.includes('<html')) {
                        return reject(new Error('Ссылка ведет на веб страницу HTML, а не на чистый CSS файл темы.'));
                    }
                    let fileName = path.basename(parsed.pathname) || 'custom_theme.theme.css';
                    if (!fileName.endsWith('.css')) fileName += '.theme.css';
                    const targetPath = path.join(themesDir, fileName);
                    try {
                        fs.writeFileSync(targetPath, data, 'utf8');
                        writeLog('Theme downloaded successfully:', fileName);
                        updateThemesAcrossWindows();
                        resolve({ success: true, fileName, path: targetPath });
                    } catch (err) {
                        reject(err);
                    }
                });
            }).on('error', (err) => {
                reject(err);
            });
        } catch (e) {
            reject(e);
        }
    });
}

// Watch themes directory for external file additions or deletions
let watchDebounceTimer = null;
try {
    if (fs.existsSync(themesDir)) {
        const watcher = fs.watch(themesDir, (eventType) => {
            if (eventType === 'rename' || eventType === 'change') {
                if (watchDebounceTimer) clearTimeout(watchDebounceTimer);
                watchDebounceTimer = setTimeout(() => {
                    updateThemesAcrossWindows();
                }, 500);
            }
        });
        if (watcher && typeof watcher.unref === 'function') watcher.unref();
    }
} catch (_) {}

module.exports = {
    themesDir,
    parseThemeMeta,
    NATIVE_GRADIENT_PRESETS,
    getInstalledCustomThemes,
    getActiveThemesState,
    applyNativeGradientTheme,
    applyThemesToWindow,
    updateThemesAcrossWindows,
    downloadThemeFromUrl,
    normalizeThemeDownloadUrl
};
