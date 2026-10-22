const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const { execFile } = require('child_process');
const electron = require('electron');

const { app, BrowserWindow, ipcMain, session, globalShortcut, shell } = electron;

const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Local');
const discordBaseDir = path.join(localAppData, 'Discord');
const extensionsDir = path.join(discordBaseDir, 'extensions');
const chromeExtensionsDir = path.join(extensionsDir, 'chrome');
const logFile = path.join(extensionsDir, 'discord_extensions.log');
const configFile = path.join(extensionsDir, 'config.json');
const pluginsDir = path.join(extensionsDir, 'plugins');
const themesDir = path.join(extensionsDir, 'themes');
const customCssFile = path.join(extensionsDir, 'custom.css');

for (const d of [extensionsDir, chromeExtensionsDir, pluginsDir, themesDir]) {
    if (!fs.existsSync(d)) {
        try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
    }
}

function writeLog(...args) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}\n`;
    try {
        fs.appendFileSync(logFile, line, 'utf8');
    } catch (_) {}
    console.log('[DiscordExt]', ...args);
}

writeLog('Discord Extensions Loader initialized.');

// Config management
const defaultConfig = {
    performanceMode: true,
    hardwareAcceleration: true,
    blockTelemetry: true,
    silentTyping: true,
    nitroCleaner: true,
    volumeBooster: true,
    messageLogger: true,
    autoTranslator: true,
    openInApp: true,
    platformIndicators: true,
    serverGrid: false,
    spotifyControls: true,
    spotifyPauseBypass: true,
    showDockButton: true,
    selectedTheme: 'none',
    disabledExtensions: []
};

let clientConfig = { ...defaultConfig };
if (fs.existsSync(configFile)) {
    try {
        clientConfig = { ...defaultConfig, ...JSON.parse(fs.readFileSync(configFile, 'utf8')) };
    } catch (e) {
        writeLog('Config read error, using defaults:', e.message);
    }
} else {
    try {
        fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2), 'utf8');
    } catch (_) {}
}

function saveConfig(updates) {
    clientConfig = { ...clientConfig, ...updates };
    try {
        fs.writeFileSync(configFile, JSON.stringify(clientConfig, null, 2), 'utf8');
        writeLog('Config updated successfully.');
    } catch (e) {
        writeLog('Config write error:', e.message);
    }
}

// Version & Auto-update
const localVersionFile = path.join(extensionsDir, 'version.json');
let versionInfo = { version: '1.0.0', name: 'Discord Extensions', updateUrl: '', zipUrl: '' };
if (fs.existsSync(localVersionFile)) {
    try {
        versionInfo = { ...versionInfo, ...JSON.parse(fs.readFileSync(localVersionFile, 'utf8')) };
    } catch (_) {}
}
const CURRENT_VERSION = versionInfo.version || '1.0.0';
let UPDATE_VERSION_URL = versionInfo.updateUrl || 'https://raw.githubusercontent.com/KreziBro/discord-extensions/main/version.json';
let UPDATE_ZIP_URL = versionInfo.zipUrl || 'https://github.com/KreziBro/discord-extensions/archive/refs/heads/main.zip';

function fetchUrl(targetUrl, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects < 0) return reject(new Error('Too many redirects'));
        const client = targetUrl.startsWith('https:') ? https : http;
        client.get(targetUrl, { headers: { 'User-Agent': 'Discord-Extensions/1.0' } }, (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                const redirectTarget = new URL(res.headers.location, targetUrl).toString();
                return resolve(fetchUrl(redirectTarget, maxRedirects - 1));
            }
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function downloadFile(targetUrl, destPath, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects < 0) return reject(new Error('Too many redirects'));
        const client = targetUrl.startsWith('https:') ? https : http;
        client.get(targetUrl, { headers: { 'User-Agent': 'Discord-Extensions/1.0' } }, (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                const redirectTarget = new URL(res.headers.location, targetUrl).toString();
                return resolve(downloadFile(redirectTarget, destPath, maxRedirects - 1));
            }
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const fileStream = fs.createWriteStream(destPath);
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                resolve(destPath);
            });
            fileStream.on('error', (err) => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
        }).on('error', reject);
    });
}

function compareSemver(remote, local) {
    const r = (remote || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const l = (local || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(r.length, l.length); i++) {
        const rv = r[i] || 0;
        const lv = l[i] || 0;
        if (rv > lv) return 1;
        if (rv < lv) return -1;
    }
    return 0;
}

function copyDirRecursive(src, dest, ignore = []) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        if (ignore.includes(entry.name)) continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath, ignore);
        } else {
            try { fs.copyFileSync(srcPath, destPath); } catch (_) {}
        }
    }
}

let updateStatus = { checking: false, updateAvailable: false, latestVersion: CURRENT_VERSION, downloading: false };

async function checkForUpdates(silent = false) {
    if (updateStatus.checking || updateStatus.downloading) return updateStatus;
    if (!UPDATE_VERSION_URL) {
        return { checking: false, updateAvailable: false, currentVersion: CURRENT_VERSION, latestVersion: CURRENT_VERSION };
    }
    updateStatus.checking = true;
    try {
        const rawJson = await fetchUrl(UPDATE_VERSION_URL);
        const remoteData = JSON.parse(rawJson);
        const latestVersion = remoteData.version || CURRENT_VERSION;
        const isNewer = compareSemver(latestVersion, CURRENT_VERSION) > 0;
        if (remoteData.zipUrl) UPDATE_ZIP_URL = remoteData.zipUrl;

        updateStatus = {
            checking: false,
            updateAvailable: isNewer,
            currentVersion: CURRENT_VERSION,
            latestVersion: latestVersion,
            downloading: false,
            changelog: remoteData.changelog || ''
        };
        writeLog(`Update check complete. Current: v${CURRENT_VERSION}, Latest: v${latestVersion}, Update available: ${isNewer}`);
        if (isNewer && managerWindow && !managerWindow.isDestroyed()) {
            managerWindow.webContents.send('update-available', updateStatus);
        }
        return updateStatus;
    } catch (err) {
        updateStatus.checking = false;
        writeLog('Update check failed:', err.message || err);
        return { checking: false, updateAvailable: false, currentVersion: CURRENT_VERSION, latestVersion: CURRENT_VERSION, error: err.message };
    }
}

async function downloadAndApplyUpdate() {
    if (updateStatus.downloading) return { success: false, error: 'Update is already downloading' };
    if (!UPDATE_ZIP_URL) return { success: false, error: 'Update archive URL not configured' };
    updateStatus.downloading = true;
    writeLog('[AutoUpdate] Starting download from GitHub:', UPDATE_ZIP_URL);

    const tempDir = path.join(os.tmpdir(), 'discord_ext_update_' + Date.now());
    const zipPath = path.join(os.tmpdir(), 'discord_ext_update.zip');

    try {
        fs.mkdirSync(tempDir, { recursive: true });
        await downloadFile(UPDATE_ZIP_URL, zipPath);
        writeLog('[AutoUpdate] Download complete. Extracting archive...');

        await new Promise((resolve, reject) => {
            const extractCmd = `Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force`;
            execFile('powershell.exe', ['-NoProfile', '-Command', extractCmd], (err, stdout, stderr) => {
                if (err) return reject(new Error(stderr || err.message));
                resolve();
            });
        });

        const entries = fs.readdirSync(tempDir);
        let extractedRoot = tempDir;
        for (const entry of entries) {
            const full = path.join(tempDir, entry);
            if (fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'src'))) {
                extractedRoot = full;
                break;
            }
        }

        const extractedSrc = path.join(extractedRoot, 'src');
        if (fs.existsSync(extractedSrc)) {
            copyDirRecursive(extractedSrc, extensionsDir);
        }

        const srcVersionJson = path.join(extractedRoot, 'version.json');
        if (fs.existsSync(srcVersionJson)) {
            fs.copyFileSync(srcVersionJson, path.join(extensionsDir, 'version.json'));
        }

        try {
            fs.unlinkSync(zipPath);
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (_) {}

        updateStatus.downloading = false;
        writeLog('[AutoUpdate] Update applied! Restarting Discord...');
        relaunchDiscord();
        return { success: true };
    } catch (err) {
        updateStatus.downloading = false;
        writeLog('[AutoUpdate] Update failed:', err.message || err);
        return { success: false, error: err.message };
    }
}

function relaunchDiscord() {
    writeLog('Relaunching Discord client...');
    setTimeout(() => {
        app.relaunch();
        app.exit(0);
    }, 1000);
}

// Manager Window
let managerWindow = null;

function openManagerWindow() {
    if (managerWindow && !managerWindow.isDestroyed()) {
        managerWindow.show();
        managerWindow.focus();
        return;
    }

    const htmlPath = path.join(extensionsDir, 'extensionsManager.html');
    const preloadPath = path.join(extensionsDir, 'discordPreload.js');

    managerWindow = new BrowserWindow({
        width: 860,
        height: 640,
        minWidth: 740,
        minHeight: 540,
        backgroundColor: '#1e1f22',
        frame: false,
        title: 'Discord Extensions',
        resizable: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            preload: preloadPath
        }
    });

    managerWindow.loadFile(htmlPath);
    managerWindow.on('closed', () => {
        managerWindow = null;
    });
}

// IPC Handlers
ipcMain.handle('get-config', async () => clientConfig);
ipcMain.handle('save-config', async (_, newCfg) => {
    saveConfig(newCfg);
    return clientConfig;
});
ipcMain.handle('relaunch-discord', async () => {
    relaunchDiscord();
    return { success: true };
});
ipcMain.handle('get-locale', async () => {
    try {
        const sysLocale = app.getLocale() || 'en';
        return sysLocale.toLowerCase().startsWith('ru') ? 'ru' : 'en';
    } catch (_) {
        return 'ru';
    }
});
ipcMain.handle('open-extensions-dir', async () => {
    shell.openPath(chromeExtensionsDir);
    return true;
});
ipcMain.handle('get-custom-css', async () => {
    if (fs.existsSync(customCssFile)) {
        try {
            return fs.readFileSync(customCssFile, 'utf8');
        } catch (_) {}
    }
    return '';
});
ipcMain.handle('save-custom-css', async (_, css) => {
    try {
        fs.writeFileSync(customCssFile, css || '', 'utf8');
        return true;
    } catch (e) {
        writeLog('Error saving custom CSS:', e.message);
        return false;
    }
});
ipcMain.handle('get-extensions', async () => {
    const list = [];
    if (!fs.existsSync(chromeExtensionsDir)) return list;
    try {
        const entries = fs.readdirSync(chromeExtensionsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const extPath = path.join(chromeExtensionsDir, entry.name);
                const manifestFile = path.join(extPath, 'manifest.json');
                let name = entry.name;
                let version = '1.0.0';
                let description = '';
                if (fs.existsSync(manifestFile)) {
                    try {
                        const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
                        name = m.name || name;
                        version = m.version || version;
                        description = m.description || '';
                    } catch (_) {}
                }
                const isEnabled = !Array.isArray(clientConfig.disabledExtensions) || !clientConfig.disabledExtensions.includes(entry.name);
                list.push({ folder: entry.name, name, version, description, enabled: isEnabled });
            }
        }
    } catch (e) {
        writeLog('Error getting extensions:', e.message);
    }
    return list;
});
ipcMain.handle('toggle-extension', async (_, folder, enable) => {
    let disabled = Array.isArray(clientConfig.disabledExtensions) ? [...clientConfig.disabledExtensions] : [];
    if (enable) {
        disabled = disabled.filter(f => f !== folder);
    } else {
        if (!disabled.includes(folder)) disabled.push(folder);
    }
    saveConfig({ disabledExtensions: disabled });
    return true;
});
ipcMain.handle('check-for-updates', async () => checkForUpdates(false));
ipcMain.handle('apply-update', async () => downloadAndApplyUpdate());

ipcMain.on('minimize-manager-window', () => {
    if (managerWindow && !managerWindow.isDestroyed()) managerWindow.minimize();
});
ipcMain.on('close-manager-window', () => {
    if (managerWindow && !managerWindow.isDestroyed()) managerWindow.close();
});

// App & WebContents Hooks
app.whenReady().then(() => {
    writeLog('Electron app is ready.');

    // Global shortcut Ctrl+Shift+E
    try {
        globalShortcut.register('CommandOrControl+Shift+E', () => {
            openManagerWindow();
        });
        writeLog('Global shortcut Ctrl+Shift+E registered.');
    } catch (e) {
        writeLog('Shortcut registration error:', e.message);
    }

    // Network & Telemetry & Spotify Pause Blocking
    const filter = {
        urls: [
            '*://*.sentry.io/*',
            '*://*.datadoghq.com/*',
            '*://discord.com/api/v*/science*',
            '*://discord.com/api/v*/track*',
            '*://*.discord.com/api/v*/science*',
            '*://*.discord.com/api/v*/track*',
            '*://*.discord.com/api/v*/channels/*/typing*',
            '*://discord.com/api/v*/channels/*/typing*',
            '*://*.discord.com/api/v*/users/@me/connections/spotify/pause*',
            '*://discord.com/api/v*/users/@me/connections/spotify/pause*'
        ]
    };

    session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
        const url = details.url;

        // Block typing if silentTyping is enabled
        if (url.includes('/typing')) {
            if (clientConfig.silentTyping) {
                return callback({ cancel: true });
            }
            return callback({ cancel: false });
        }

        // Bypass Spotify pause on long voice transmissions
        if (url.includes('/connections/spotify/pause')) {
            if (clientConfig.spotifyPauseBypass) {
                return callback({ cancel: true });
            }
            return callback({ cancel: false });
        }

        // Block telemetry
        if (clientConfig.blockTelemetry) {
            return callback({ cancel: true });
        }

        callback({ cancel: false });
    });

    // Load Chrome extensions if any
    if (fs.existsSync(chromeExtensionsDir)) {
        try {
            const entries = fs.readdirSync(chromeExtensionsDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const isEnabled = !Array.isArray(clientConfig.disabledExtensions) || !clientConfig.disabledExtensions.includes(entry.name);
                    if (isEnabled) {
                        const extPath = path.join(chromeExtensionsDir, entry.name);
                        session.defaultSession.loadExtension(extPath).then(ext => {
                            writeLog(`Loaded Chrome extension: ${ext.name || entry.name}`);
                        }).catch(err => {
                            writeLog(`Failed loading Chrome extension ${entry.name}:`, err.message);
                        });
                    }
                }
            }
        } catch (e) {
            writeLog('Chrome extension loader error:', e.message);
        }
    }

    // Check updates after startup
    setTimeout(() => {
        checkForUpdates(true).catch(() => {});
    }, 5000);
});

// Hook browser windows for Discord client injection
app.on('browser-window-created', (_, win) => {
    win.webContents.on('did-finish-load', () => {
        const currentUrl = (win.webContents.getURL() || '').toLowerCase();
        const currentTitle = (win.getTitle() || '').toLowerCase();

        // STRICT OVERLAY CHECK: Do NOT inject anything into in-game overlay windows!
        if (currentUrl.includes('overlay') || currentTitle.includes('overlay')) {
            writeLog('Skipping injection in overlay window:', currentUrl);
            return;
        }

        // DevTools F12 and Ctrl+Shift+E in Discord window
        win.webContents.on('before-input-event', (event, input) => {
            if (input.type === 'keyDown' && input.key === 'F12') {
                win.webContents.toggleDevTools();
                event.preventDefault();
            }
            if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'e') {
                openManagerWindow();
                event.preventDefault();
            }
        });

        // Inject Native Plugins
        try {
            // 1. Nitro Cleaner
            if (clientConfig.nitroCleaner) {
                const p = path.join(pluginsDir, 'nitroCleaner.js');
                if (fs.existsSync(p)) win.webContents.executeJavaScript(fs.readFileSync(p, 'utf8')).catch(() => {});
            }

            // 2. Volume Booster
            if (clientConfig.volumeBooster) {
                const p = path.join(pluginsDir, 'volumeBooster.js');
                if (fs.existsSync(p)) win.webContents.executeJavaScript(fs.readFileSync(p, 'utf8')).catch(() => {});
            }

            // 3. Message Logger
            if (clientConfig.messageLogger) {
                const p = path.join(pluginsDir, 'messageLogger.js');
                if (fs.existsSync(p)) win.webContents.executeJavaScript(fs.readFileSync(p, 'utf8')).catch(() => {});
            }

            // 4. Auto Translator
            if (clientConfig.autoTranslator) {
                const p = path.join(pluginsDir, 'autoTranslator.js');
                if (fs.existsSync(p)) win.webContents.executeJavaScript(fs.readFileSync(p, 'utf8')).catch(() => {});
            }

            // 5. Open In App
            if (clientConfig.openInApp) {
                const p = path.join(pluginsDir, 'openInApp.js');
                if (fs.existsSync(p)) win.webContents.executeJavaScript(fs.readFileSync(p, 'utf8')).catch(() => {});
            }

            // 6. Platform Indicators
            if (clientConfig.platformIndicators) {
                const p = path.join(pluginsDir, 'platformIndicators.js');
                if (fs.existsSync(p)) win.webContents.executeJavaScript(fs.readFileSync(p, 'utf8')).catch(() => {});
            }

            // 7. Server Grid
            if (clientConfig.serverGrid) {
                const p = path.join(pluginsDir, 'serverGrid.js');
                if (fs.existsSync(p)) win.webContents.executeJavaScript(fs.readFileSync(p, 'utf8')).catch(() => {});
            }

            // 8. Spotify Controls
            if (clientConfig.spotifyControls) {
                const p = path.join(pluginsDir, 'spotifyControls.js');
                if (fs.existsSync(p)) win.webContents.executeJavaScript(fs.readFileSync(p, 'utf8')).catch(() => {});
            }

            // 9. Themes (AMOLED, Dracula, Catppuccin, Nord, Custom)
            const selTheme = clientConfig.selectedTheme;
            if (selTheme && selTheme !== 'none') {
                let themeFile = null;
                if (selTheme === 'amoled') themeFile = path.join(themesDir, 'amoled.css');
                else if (selTheme === 'dracula') themeFile = path.join(themesDir, 'dracula.css');
                else if (selTheme === 'catppuccin') themeFile = path.join(themesDir, 'catppuccin.css');
                else if (selTheme === 'nord') themeFile = path.join(themesDir, 'nord.css');

                if (themeFile && fs.existsSync(themeFile)) {
                    win.webContents.insertCSS(fs.readFileSync(themeFile, 'utf8')).catch(() => {});
                }
            }

            // 10. User Custom CSS
            if (fs.existsSync(customCssFile)) {
                const customCss = fs.readFileSync(customCssFile, 'utf8');
                if (customCss.trim()) {
                    win.webContents.insertCSS(customCss).catch(() => {});
                }
            }

            // 11. Dock Button (ONLY if showDockButton is enabled, and NEVER in overlay)
            if (clientConfig.showDockButton) {
                win.webContents.executeJavaScript(`
                    (function() {
                        if (window.location.href.includes('overlay') || window.__OVERLAY__ || document.getElementById('overlay-mount')) return;
                        if (document.getElementById('discord-ext-dock-btn')) return;

                        const btn = document.createElement('div');
                        btn.id = 'discord-ext-dock-btn';
                        btn.title = 'Discord Extensions (Ctrl+Shift+E)';
                        btn.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:999999;width:38px;height:38px;border-radius:50%;background:#5865F2;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.4);transition:transform 0.2s ease, background 0.2s ease;';
                        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"/></svg>';
                        btn.onmouseenter = () => { btn.style.transform = 'scale(1.1)'; btn.style.background = '#4752C4'; };
                        btn.onmouseleave = () => { btn.style.transform = 'scale(1.0)'; btn.style.background = '#5865F2'; };
                        btn.onclick = () => {
                            console.log('__OPEN_DISCORD_EXTENSIONS__');
                        };
                        document.body.appendChild(btn);
                    })();
                `).catch(() => {});

                win.webContents.on('console-message', (_, level, message) => {
                    if (message === '__OPEN_DISCORD_EXTENSIONS__') {
                        openManagerWindow();
                    }
                });
            }
        } catch (e) {
            writeLog('Injection error in Discord window:', e.message);
        }
    });
});

module.exports = {
    openManagerWindow,
    checkForUpdates,
    clientConfig
};
