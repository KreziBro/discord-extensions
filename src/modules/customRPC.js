const { writeLog } = require('./logger');
const { getConfig, saveConfig } = require('./config');

const defaultRPC = {
    enabled: false,
    rotationInterval: 10,
    slides: [
        {
            name: 'Visual Studio Code',
            type: 0,
            details: 'Разработка Discord Extensions',
            state: 'JavaScript & Electron',
            largeImageKey: 'https://raw.githubusercontent.com/github/explore/80688e429a7d4ef2fca1e82350fe8e3517d3494d/topics/javascript/javascript.png',
            largeText: 'Visual Studio Code',
            smallImageKey: 'https://assets.stickpng.com/images/5848309bcef1014c0b5e4a9a.png',
            smallText: 'VS Code',
            startTimestamp: true,
            button1Text: 'GitHub Repository',
            button1Url: 'https://github.com/KreziBro/discord-extensions',
            button2Text: 'Поддержать автора (Ko fi)',
            button2Url: 'https://ko-fi.com/krejzibro'
        }
    ]
};

function getCustomRPCConfig() {
    const cfg = getConfig();
    if (cfg && cfg.customRPC && typeof cfg.customRPC === 'object') {
        return cfg.customRPC;
    }
    return defaultRPC;
}

function injectCustomRPCModule(win) {
    if (!win || win.isDestroyed()) return;
    const url = win.webContents.getURL() || '';
    if (!url || (!url.includes('discord.com/app') && !url.includes('discord.com/channels'))) {
        return;
    }

    const rpcConfig = getCustomRPCConfig();
    const script = `
        (function() {
            if (window.__DISCORD_EXT_CUSTOM_RPC_INITIALIZED__) {
                if (typeof window.__DISCORD_EXT_SET_CUSTOM_RPC === 'function') {
                    window.__DISCORD_EXT_SET_CUSTOM_RPC(${JSON.stringify(rpcConfig)});
                }
                return;
            }
            window.__DISCORD_EXT_CUSTOM_RPC_INITIALIZED__ = true;

            let currentConfig = ${JSON.stringify(rpcConfig)};
            let currentSlideIndex = 0;
            let rotationTimer = null;
            let startTime = Date.now();
            const DEFAULT_APP_ID = '1108588077900898414';

            function getFluxDispatcher() {
                try {
                    if (window.DiscordExtensions?.Webpack?.Common?.FluxDispatcher) {
                        return window.DiscordExtensions.Webpack.Common.FluxDispatcher;
                    }
                    if (window.Vencord?.Webpack?.Common?.FluxDispatcher) {
                        return window.Vencord.Webpack.Common.FluxDispatcher;
                    }
                    if (window.webpackChunkdiscord_app) {
                        let wp = null;
                        window.webpackChunkdiscord_app.push([[Symbol()], {}, req => { wp = req; }]);
                        if (typeof window.webpackChunkdiscord_app.pop === 'function') window.webpackChunkdiscord_app.pop();
                        if (wp && wp.c) {
                            for (const id in wp.c) {
                                const m = wp.c[id]?.exports;
                                if (m && typeof m.dispatch === 'function' && typeof m.subscribe === 'function') return m;
                                if (m?.default && typeof m.default.dispatch === 'function' && typeof m.default.subscribe === 'function') return m.default;
                            }
                        }
                    }
                } catch (_) {}
                return null;
            }

            function patchGetAssetImage() {
                try {
                    const assetUtils = window.Vencord?.Webpack?.Common?.ApplicationAssetUtils;
                    if (assetUtils && typeof assetUtils.getAssetImage === 'function' && !assetUtils.getAssetImage.__discordExtPatched) {
                        const orig = assetUtils.getAssetImage;
                        assetUtils.getAssetImage = function(appId, asset, size) {
                            if (typeof asset === 'string' && (asset.startsWith('http://') || asset.startsWith('https://'))) {
                                return asset;
                            }
                            return orig.apply(this, arguments);
                        };
                        assetUtils.getAssetImage.__discordExtPatched = true;
                    }
                } catch (_) {}
            }

            async function resolveExternalAsset(appId, url) {
                patchGetAssetImage();
                if (!url || typeof url !== 'string') return null;
                const trimmed = url.trim();
                if (!trimmed) return null;
                if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
                    return trimmed;
                }

                // 1. Primary: Use Vencord ApplicationAssetUtils.fetchAssetIds
                try {
                    const assetUtils = window.Vencord?.Webpack?.Common?.ApplicationAssetUtils;
                    if (assetUtils && typeof assetUtils.fetchAssetIds === 'function') {
                        const targetAppId = (appId && String(appId).trim()) || DEFAULT_APP_ID;
                        const ids = await assetUtils.fetchAssetIds(targetAppId, [trimmed]);
                        if (ids && ids[0]) {
                            return ids[0];
                        }
                    }
                } catch (_) {}

                // 2. Secondary: Register external URL via Discord RestAPI
                try {
                    const api = window.DiscordExtensions?.Webpack?.Common?.RestAPI ||
                                window.Vencord?.Webpack?.Common?.RestAPI;
                    if (api && typeof api.post === 'function') {
                        const targetAppId = (appId && String(appId).trim()) || DEFAULT_APP_ID;
                        const res = await api.post({
                            url: '/applications/' + targetAppId + '/external-assets',
                            body: { urls: [trimmed] }
                        });
                        const list = Array.isArray(res?.body) ? res.body : [res?.body];
                        if (list[0]?.external_asset_path) {
                            return list[0].external_asset_path;
                        }
                    }
                } catch (_) {}

                return trimmed;
            }

            async function buildActivityObject(slide) {
                if (!slide || !slide.name) return null;
                const appId = (slide.applicationId && String(slide.applicationId).trim()) || DEFAULT_APP_ID;
                const activityType = (slide.type === 2 && (slide.largeImageKey || slide.largeImage)) ? 0 : (typeof slide.type === 'number' ? slide.type : 0);
                const activity = {
                    application_id: appId,
                    name: String(slide.name).trim(),
                    type: activityType,
                    flags: 1
                };

                if (activity.type === 1) {
                    activity.url = slide.streamUrl || 'https://twitch.tv/discord';
                }

                if (slide.details && String(slide.details).trim()) {
                    activity.details = String(slide.details).trim();
                }
                if (slide.state && String(slide.state).trim()) {
                    activity.state = String(slide.state).trim();
                }

                if (slide.startTimestamp) {
                    activity.timestamps = { start: startTime };
                }

                const assets = {};
                const rawLarge = slide.largeImageKey || slide.largeImage;
                if (rawLarge && String(rawLarge).trim()) {
                    const resolved = await resolveExternalAsset(appId, String(rawLarge).trim());
                    if (resolved) assets.large_image = resolved;
                    const txt = slide.largeImageText || slide.largeText;
                    if (txt && String(txt).trim()) {
                        assets.large_text = String(txt).trim();
                    }
                }
                const rawSmall = slide.smallImageKey || slide.smallImage;
                if (rawSmall && String(rawSmall).trim()) {
                    const resolved = await resolveExternalAsset(appId, String(rawSmall).trim());
                    if (resolved) assets.small_image = resolved;
                    const txt = slide.smallImageText || slide.smallText;
                    if (txt && String(txt).trim()) {
                        assets.small_text = String(txt).trim();
                    }
                }
                if (Object.keys(assets).length > 0) {
                    activity.assets = assets;
                }

                const buttons = [];
                const buttonUrls = [];
                if (slide.button1Text && slide.button1Url) {
                    buttons.push(String(slide.button1Text).trim());
                    buttonUrls.push(String(slide.button1Url).trim());
                }
                if (slide.button2Text && slide.button2Url) {
                    buttons.push(String(slide.button2Text).trim());
                    buttonUrls.push(String(slide.button2Url).trim());
                }
                if (buttons.length > 0) {
                    activity.buttons = buttons;
                    activity.metadata = { button_urls: buttonUrls };
                }

                return activity;
            }

            async function dispatchCurrentSlide() {
                const dispatcher = getFluxDispatcher();
                if (!dispatcher) return;

                if (!currentConfig || !currentConfig.enabled || !Array.isArray(currentConfig.slides) || currentConfig.slides.length === 0) {
                    dispatcher.dispatch({
                        type: 'LOCAL_ACTIVITY_UPDATE',
                        activity: null,
                        socketId: 'DiscordExtensionsCustomRPC'
                    });
                    return;
                }

                if (currentSlideIndex >= currentConfig.slides.length) currentSlideIndex = 0;
                const slide = currentConfig.slides[currentSlideIndex];
                const activity = await buildActivityObject(slide);

                if (activity) {
                    for (const key in activity) {
                        if (key === 'type' || key === 'flags') continue;
                        if (activity[key] == null || activity[key] === '') delete activity[key];
                    }
                }

                dispatcher.dispatch({
                    type: 'LOCAL_ACTIVITY_UPDATE',
                    activity,
                    socketId: 'DiscordExtensionsCustomRPC'
                });
            }

            function startRotator() {
                if (rotationTimer) clearInterval(rotationTimer);
                dispatchCurrentSlide();

                if (!currentConfig || !currentConfig.enabled) return;
                const slidesCount = Array.isArray(currentConfig.slides) ? currentConfig.slides.length : 0;
                if (slidesCount <= 1) return;

                const intervalSec = Math.max(3, parseInt(currentConfig.rotationInterval, 10) || 10);
                rotationTimer = setInterval(() => {
                    currentSlideIndex = (currentSlideIndex + 1) % slidesCount;
                    dispatchCurrentSlide();
                }, intervalSec * 1000);
            }

            window.__DISCORD_EXT_SET_CUSTOM_RPC = function(newCfg) {
                currentConfig = newCfg || { enabled: false, slides: [] };
                currentSlideIndex = 0;
                startTime = Date.now();
                startRotator();
            };

            setTimeout(startRotator, 3000);
        })();
    `;

    win.webContents.executeJavaScript(script).catch(() => {});
}

function updateCustomRPCAcrossWindows(rpcConfig) {
    const electron = require('electron');
    const { BrowserWindow } = electron;
    if (!BrowserWindow) return;
    const { isMainWindow } = require('./windowUtils');

    for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue;
        if (!isMainWindow(win)) continue;

        win.webContents.executeJavaScript(`
            if (typeof window.__DISCORD_EXT_SET_CUSTOM_RPC === 'function') {
                window.__DISCORD_EXT_SET_CUSTOM_RPC(${JSON.stringify(rpcConfig)});
            }
        `).catch(() => {});
    }
}

module.exports = {
    injectCustomRPCModule,
    getCustomRPCConfig,
    updateCustomRPCAcrossWindows
};
