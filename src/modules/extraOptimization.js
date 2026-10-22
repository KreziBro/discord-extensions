const electron = require('electron');
const { writeLog } = require('./logger');
const { getConfig } = require('./config');
const { isMainWindow } = require('./windowUtils');

const EXTRA_OPTIMIZATION_CSS = `
/* Discord Extensions Extra Optimization Mode */
html.discord-ext-ultra-ram *,
body.discord-ext-ultra-ram * {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    backdrop-filter: none !important;
}

html.discord-ext-ultra-ram img[src*=".gif"],
body.discord-ext-ultra-ram img[src*=".gif"] {
    image-rendering: pixelated !important;
}

/* Suppress local screen share preview rendering to avoid redundant decoding */
html.discord-ext-ultra-ram div[class*="streamPreview_"] video,
body.discord-ext-ultra-ram div[class*="streamPreview_"] video,
html.discord-ext-ultra-ram div[class*="pictureInPictureVideo_"] video {
    display: none !important;
}

/* Disable particle effects, typing waves, and confetti */
html.discord-ext-ultra-ram canvas[class*="confetti_"],
body.discord-ext-ultra-ram canvas[class*="confetti_"],
html.discord-ext-ultra-ram [class*="typing_"] [class*="dots_"] {
    display: none !important;
}
`;

function injectExtraOptimization(win) {
    if (!win || win.isDestroyed()) return;
    const cfg = getConfig();
    const enabled = Boolean(cfg.extraOptimization);

    const script = `
        (function() {
            try {
                let style = document.getElementById('discord-ext-extra-opt-styles');
                if (!style) {
                    style = document.createElement('style');
                    style.id = 'discord-ext-extra-opt-styles';
                    style.textContent = ${JSON.stringify(EXTRA_OPTIMIZATION_CSS)};
                    (document.head || document.documentElement).appendChild(style);
                }

                function applyState(active) {
                    if (active) {
                        document.documentElement.classList.add('discord-ext-ultra-ram');
                        document.body && document.body.classList.add('discord-ext-ultra-ram');
                        try {
                            if (window.gc) window.gc();
                        } catch (_) {}
                    } else {
                        document.documentElement.classList.remove('discord-ext-ultra-ram');
                        document.body && document.body.classList.remove('discord-ext-ultra-ram');
                    }
                }

                window.__DISCORD_EXT_SET_EXTRA_OPT = applyState;
                applyState(${enabled});

                if (!window.__DISCORD_EXT_EXTRA_OPT_INTERVAL__) {
                    window.__DISCORD_EXT_EXTRA_OPT_INTERVAL__ = setInterval(function() {
                        if (document.documentElement.classList.contains('discord-ext-ultra-ram')) {
                            try {
                                if (window.gc) window.gc();
                            } catch (_) {}
                        }
                    }, 30000);
                }
            } catch (_) {}
        })();
    `;

    win.webContents.executeJavaScript(script).catch(() => {});
}

function updateExtraOptimizationAcrossWindows(enabled) {
    const { BrowserWindow } = electron;
    if (!BrowserWindow) return;
    writeLog('Updating Extra Optimization mode across windows to:', enabled);

    for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue;
        win.webContents.executeJavaScript(`
            if (typeof window.__DISCORD_EXT_SET_EXTRA_OPT === 'function') {
                window.__DISCORD_EXT_SET_EXTRA_OPT(${Boolean(enabled)});
            }
        `).catch(() => {});
    }
}

module.exports = {
    injectExtraOptimization,
    updateExtraOptimizationAcrossWindows
};
