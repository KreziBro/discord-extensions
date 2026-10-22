const fs = require('fs');
const path = require('path');
let electron = null;
try {
    electron = require('electron');
} catch (_) {}
const { extensionsDir, writeLog } = require('./logger');
const { isMainWindow } = require('./windowUtils');

const configFile = path.join(extensionsDir, 'config.json');
const settingsFile = path.join(extensionsDir, 'data', 'settings', 'settings.json');

const defaultConfig = {
    performanceMode: false,
    extraOptimization: false,
    hardwareAcceleration: false,
    blockTelemetry: false,
    silentTyping: false,
    nitroCleaner: true,
    volumeBooster: false,
    messageLogger: false,
    autoTranslator: false,
    openInApp: false,
    spotifyControls: false,
    spotifyPauseBypass: false,
    showDockButton: true,
    dockPosition: 'bottom-right',
    dockCustomPosition: { x: 24, y: 24 },
    showQuestsWidget: true,
    autoCollectQuests: true,
    activeNativeTheme: 'none',
    selectedTheme: 'none',
    enabledCustomThemes: [],
    customRPC: {
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
    },
    disabledExtensions: []
};

let clientConfig = { ...defaultConfig };

function loadConfig() {
    if (fs.existsSync(configFile)) {
        try {
            const raw = fs.readFileSync(configFile, 'utf8').replace(/^\uFEFF/, '');
            clientConfig = { ...defaultConfig, ...JSON.parse(raw) };
            writeLog('Config loaded successfully.');
        } catch (e) {
            writeLog('Config parse error, using defaults:', e.message);
            clientConfig = { ...defaultConfig };
        }
    } else {
        try {
            fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2), 'utf8');
            writeLog('Default config created.');
        } catch (e) {
            writeLog('Config write error:', e.message);
        }
    }
    return clientConfig;
}

loadConfig();

function syncToEngineSettings() {
    try {
        const roamingDir = path.join(process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming'), 'Vencord', 'settings');
        const roamingSettingsFile = path.join(roamingDir, 'settings.json');
        const targetFiles = [settingsFile];
        if (fs.existsSync(roamingSettingsFile) && roamingSettingsFile !== settingsFile) {
            targetFiles.push(roamingSettingsFile);
        }

        const mapping = {
            silentTyping: 'SilentTyping',
            volumeBooster: 'VolumeBooster',
            messageLogger: 'MessageLogger',
            autoTranslator: 'Translator',
            openInApp: 'OpenInApp',
            spotifyControls: 'SpotifyControls',
            spotifyPauseBypass: 'SpotifyPauseBypass'
        };

        for (const file of targetFiles) {
            if (!fs.existsSync(file)) continue;
            try {
                const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
                const settings = JSON.parse(raw);
                if (!settings.plugins) settings.plugins = {};

                let changed = false;
                for (const [cfgKey, pluginName] of Object.entries(mapping)) {
                    if (cfgKey in clientConfig) {
                        const targetState = Boolean(clientConfig[cfgKey]);
                        if (!settings.plugins[pluginName]) {
                            settings.plugins[pluginName] = { enabled: targetState };
                            changed = true;
                        } else if (settings.plugins[pluginName].enabled !== targetState) {
                            settings.plugins[pluginName].enabled = targetState;
                            changed = true;
                        }
                    }
                }

                // FakeNitro must always be enabled for official Discord gradient themes and nitro unlocks
                if (!settings.plugins.FakeNitro || !settings.plugins.FakeNitro.enabled) {
                    settings.plugins.FakeNitro = { enabled: true };
                    changed = true;
                }

                if (changed) {
                    fs.writeFileSync(file, JSON.stringify(settings, null, 2), 'utf8');
                    writeLog('Engine settings synced successfully for:', file);
                }
            } catch (_) {}
        }
    } catch (e) {
        writeLog('Error syncing engine settings:', e.message);
    }
}

function updateDockButtonVisibility(show, managerWindow) {
    const { BrowserWindow } = electron;
    if (!BrowserWindow) return;
    for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed() || win === managerWindow) continue;
        if (!isMainWindow(win, managerWindow)) continue;

        win.webContents.executeJavaScript(`
            if (window.__DISCORD_EXT_SET_DOCK_VISIBLE) {
                window.__DISCORD_EXT_SET_DOCK_VISIBLE(${Boolean(show)}, ${JSON.stringify(clientConfig.dockPosition || 'bottom-right')});
            }
        `).catch(() => {});
    }
}

function updateDockButtonPosition(pos, managerWindow) {
    const { BrowserWindow } = electron;
    if (!BrowserWindow) return;
    for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed() || win === managerWindow) continue;
        if (!isMainWindow(win, managerWindow)) continue;

        win.webContents.executeJavaScript(`
            if (window.__DISCORD_EXT_SET_DOCK_POSITION) {
                window.__DISCORD_EXT_SET_DOCK_POSITION(${JSON.stringify(pos || 'bottom-right')});
            }
        `).catch(() => {});
    }
}

function updateQuestsWidgetInWindows(show, managerWindow) {
    const { BrowserWindow } = electron;
    if (!BrowserWindow) return;
    writeLog('Updating Quests widget visibility to:', show);
    for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed() || win === managerWindow) continue;
        if (!isMainWindow(win, managerWindow)) continue;

        win.webContents.executeJavaScript(`
            (function() {
                if (typeof window.__DISCORD_EXT_SET_QUESTS_CONFIG === 'function') {
                    window.__DISCORD_EXT_SET_QUESTS_CONFIG({ showWidget: ${Boolean(show)} });
                }
            })()
        `).catch(err => writeLog('updateQuestsWidget error in win ' + win.id + ':', err.message));
    }
}

let activeManagerWindowGetter = () => null;
function setManagerWindowGetter(fn) {
    activeManagerWindowGetter = fn;
}

function saveConfig(updates) {
    clientConfig = { ...clientConfig, ...updates };
    try {
        fs.writeFileSync(configFile, JSON.stringify(clientConfig, null, 2), 'utf8');
        writeLog('Config updated successfully.');
        syncToEngineSettings();
        const mgr = activeManagerWindowGetter();
        if ('showDockButton' in updates) {
            updateDockButtonVisibility(Boolean(clientConfig.showDockButton), mgr);
        }
        if ('dockPosition' in updates) {
            updateDockButtonPosition(clientConfig.dockPosition, mgr);
        }
        if ('showQuestsWidget' in updates) {
            updateQuestsWidgetInWindows(Boolean(clientConfig.showQuestsWidget), mgr);
        }
        if ('activeNativeTheme' in updates || 'enabledCustomThemes' in updates || 'selectedTheme' in updates) {
            try {
                const { updateThemesAcrossWindows } = require('./themes');
                updateThemesAcrossWindows();
            } catch (_) {}
        }
        if ('customRPC' in updates) {
            try {
                const { updateCustomRPCAcrossWindows } = require('./customRPC');
                updateCustomRPCAcrossWindows(clientConfig.customRPC);
            } catch (_) {}
        }
        if ('extraOptimization' in updates) {
            try {
                const { updateExtraOptimizationAcrossWindows } = require('./extraOptimization');
                updateExtraOptimizationAcrossWindows(Boolean(clientConfig.extraOptimization));
            } catch (_) {}
        }
        if (mgr && !mgr.isDestroyed()) {
            mgr.webContents.send('config-updated', clientConfig);
        }
    } catch (e) {
        writeLog('Config write error:', e.message);
    }
}

module.exports = {
    defaultConfig,
    DEFAULT_CONFIG: defaultConfig,
    getConfig: () => clientConfig,
    loadConfig,
    saveConfig,
    syncToEngineSettings,
    updateDockButtonVisibility,
    updateQuestsWidgetInWindows,
    setManagerWindowGetter,
    configFile,
    settingsFile
};
