const electron = require('electron');
const path = require('path');
const fs = require('fs');

const { app, BrowserWindow, globalShortcut } = electron;
const { extensionsDir, writeLog } = require('./modules/logger');
const { getConfig, saveConfig, syncToEngineSettings } = require('./modules/config');
const { isMainWindow } = require('./modules/windowUtils');
const { openManagerWindow, getManagerWindow } = require('./modules/managerWindow');
const { registerIpcHandlers } = require('./modules/ipcHandlers');
const { injectDockButton } = require('./modules/dockButton');
const { injectQuestsModule } = require('./modules/quests');
const { injectThemesModule, applyThemesToWindow } = require('./modules/themes');
const { injectCustomRPCModule } = require('./modules/customRPC');
const { injectExtraOptimization } = require('./modules/extraOptimization');
const { checkForUpdates, applyUpdate } = require('./modules/updater');
const { ensureDiscordPatched, initPersistenceWatcher } = require('./modules/persistence');

writeLog('Discord Extensions loader initializing...');
try {
    initPersistenceWatcher();
} catch (persistErr) {
    writeLog('Persistence watcher init error:', persistErr.message);
}

// Configure Engine User Data Directory to extensions/data
try {
    const dataDir = path.join(extensionsDir, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    process.env.VENCORD_USER_DATA_DIR = dataDir;
} catch (_) {}

// 1. Initialize Core Engine (Webpack and React patching)
const coreDir = path.join(extensionsDir, 'core');
const patcherPath = path.join(coreDir, 'patcher.js');
if (fs.existsSync(patcherPath)) {
    try {
        require(patcherPath);
        writeLog('Core Engine loaded successfully.');
    } catch (e) {
        writeLog('Error loading Core Engine:', e.message);
    }
} else {
    writeLog('Warning: Core Engine patcher.js not found at:', patcherPath);
}

// 2. Register IPC Handlers
registerIpcHandlers();
syncToEngineSettings();

// 3. Window Hooking and Injections
const hookedWindows = new Set();

function injectUserPlugins(win) {
    if (!win || win.isDestroyed()) return;
    try {
        const userPluginsDir = path.join(extensionsDir, 'data', 'plugins');
        if (!fs.existsSync(userPluginsDir)) return;
        const files = fs.readdirSync(userPluginsDir).filter(f => f.endsWith('.js'));
        for (const file of files) {
            const filePath = path.join(userPluginsDir, file);
            try {
                const code = fs.readFileSync(filePath, 'utf8');
                if (code.trim()) {
                    writeLog('Injecting user plugin:', file);
                    win.webContents.executeJavaScript(`
                        try {
                            /* User Plugin: ${file} */
                            ${code}
                        } catch (err) {
                            console.error('[DiscordExtensions] User plugin ${file} error:', err);
                        }
                    `).catch(e => {
                        writeLog('Execute user plugin error (' + file + '):', e.message);
                    });
                }
            } catch (readErr) {
                writeLog('Failed to read user plugin ' + file + ':', readErr.message);
            }
        }
    } catch (e) {
        writeLog('injectUserPlugins error:', e.message);
    }
}

function hookWindow(win) {
    if (!win || win.isDestroyed() || hookedWindows.has(win.id)) return;
    const mgr = getManagerWindow();
    if (win === mgr) return;

    hookedWindows.add(win.id);
    writeLog('Hooking Discord window:', win.id);

    win.on('closed', () => {
        hookedWindows.delete(win.id);
    });

    // Developer tools hotkeys (F12, Ctrl + Shift + I)
    win.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && (input.key === 'I' || input.key === 'i')))) {
            win.webContents.toggleDevTools();
            event.preventDefault();
        }
    });

    // Console message listener for floating dock button, in-page hotkey, and widget hide
    win.webContents.on('console-message', (_, level, message) => {
        writeLog('Renderer console [' + level + ']: ' + message);
        if (message && message.includes('__DISCORD_EXT_OPEN_MANAGER__')) {
            openManagerWindow();
        }
        if (message && message.includes('__DISCORD_EXT_HIDE_QUESTS_WIDGET__')) {
            writeLog('Quests widget closed in client, updating config.');
            saveConfig({ showQuestsWidget: false });
        }
        if (message && message.includes('__DISCORD_EXT_SAVE_DOCK_CUSTOM_POS__:')) {
            const parts = message.split('__DISCORD_EXT_SAVE_DOCK_CUSTOM_POS__:')[1]?.split(':');
            if (parts && parts.length === 2) {
                const x = parseInt(parts[0], 10);
                const y = parseInt(parts[1], 10);
                if (!isNaN(x) && !isNaN(y)) {
                    saveConfig({ dockPosition: 'custom', dockCustomPosition: { x, y } });
                }
            }
        }
    });

    const runInjections = () => {
        if (win.isDestroyed()) return;
        const url = win.webContents.getURL() || '';
        if (!url || url === 'about:blank') return;
        const currentMgr = getManagerWindow();
        if (!isMainWindow(win, currentMgr)) return;
        injectDockButton(win, currentMgr);
        injectQuestsModule(win);
        applyThemesToWindow(win);
        injectCustomRPCModule(win);
        injectExtraOptimization(win);
        injectUserPlugins(win);
    };

    win.webContents.on('dom-ready', runInjections);
    win.webContents.on('did-finish-load', runInjections);

    const initialUrl = win.webContents.getURL() || '';
    if (initialUrl && initialUrl !== 'about:blank' && !win.webContents.isLoading()) {
        runInjections();
    }
}

// 4. Electron App Lifecycle and Global Shortcuts
app.whenReady().then(() => {
    writeLog('Electron app is ready.');

    // Remove CSP headers to allow external theme @import styles, fonts, and assets
    try {
        const { session } = electron;
        if (session && session.defaultSession) {
            session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
                const responseHeaders = { ...(details.responseHeaders || {}) };
                delete responseHeaders['content-security-policy'];
                delete responseHeaders['content-security-policy-report-only'];
                delete responseHeaders['Content-Security-Policy'];
                delete responseHeaders['Content-Security-Policy-Report-Only'];
                callback({ cancel: false, responseHeaders });
            });
            writeLog('CSP headers bypass configured.');
        }
    } catch (e) {
        writeLog('CSP headers bypass error:', e.message);
    }

    // Global shortcut Ctrl + Shift + E
    try {
        globalShortcut.register('CommandOrControl+Shift+E', () => {
            openManagerWindow();
        });
        writeLog('Global shortcut Ctrl + Shift + E registered.');
    } catch (e) {
        writeLog('Global shortcut registration error:', e.message);
    }

    // Hook existing windows
    for (const win of BrowserWindow.getAllWindows()) {
        hookWindow(win);
    }

    // Hook future windows
    app.on('browser-window-created', (_, win) => {
        hookWindow(win);
    });

    // Background update check after Discord loads
    setTimeout(async () => {
        try {
            const info = await checkForUpdates();
            if (info && info.updateAvailable) {
                writeLog('Background update check found new version:', info.latestVersion);
                try {
                    const updateRes = await applyUpdate();
                    writeLog('Background auto update applied:', JSON.stringify(updateRes));
                } catch (applyErr) {
                    writeLog('Background auto update error:', applyErr.message);
                }
                for (const win of BrowserWindow.getAllWindows()) {
                    if (win && !win.isDestroyed()) {
                        win.webContents.send('update-available', info);
                    }
                }
            }
        } catch (e) {
            writeLog('Background update check error:', e.message);
        }
    }, 12000);
});

app.on('before-quit', () => {
    try {
        ensureDiscordPatched();
    } catch (_) {}
});

writeLog('Discord Extensions loader setup complete.');
