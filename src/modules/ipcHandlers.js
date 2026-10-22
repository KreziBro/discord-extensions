const { ipcMain, app, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { extensionsDir, writeLog } = require('./logger');
const { getConfig, saveConfig } = require('./config');
const { getManagerWindow } = require('./managerWindow');
const { ensureDiscordPatched, getLatestDiscordExe } = require('./persistence');

const pluginsFile = path.join(extensionsDir, 'plugins.json');
const customCssFile = path.join(extensionsDir, 'data', 'custom.css');

let registered = false;

function registerIpcHandlers() {
    if (registered) return;
    registered = true;

    ipcMain.handle('get-config', async () => getConfig());

    ipcMain.handle('save-config', async (_, newCfg) => {
        saveConfig(newCfg);
        return { success: true };
    });

    ipcMain.handle('get-plugins', async () => {
        try {
            if (fs.existsSync(pluginsFile)) {
                const raw = fs.readFileSync(pluginsFile, 'utf8').replace(/^\uFEFF/, '');
                const list = JSON.parse(raw);

                const settingsPaths = [
                    path.join(extensionsDir, 'data', 'settings', 'settings.json'),
                    path.join(process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming'), 'Vencord', 'settings', 'settings.json')
                ];
                let pluginSettings = {};
                for (const sp of settingsPaths) {
                    if (fs.existsSync(sp)) {
                        try {
                            const parsed = JSON.parse(fs.readFileSync(sp, 'utf8').replace(/^\uFEFF/, ''));
                            if (parsed.plugins && typeof parsed.plugins === 'object') {
                                pluginSettings = { ...pluginSettings, ...parsed.plugins };
                            }
                        } catch (_) {}
                    }
                }

                return list.map(p => ({
                    ...p,
                    enabled: pluginSettings[p.name] !== undefined ? Boolean(pluginSettings[p.name].enabled) : Boolean(p.enabledByDefault)
                }));
            }
        } catch (e) {
            writeLog('Plugins file read error:', e.message);
        }
        return [];
    });

    ipcMain.handle('toggle-plugin', async (_, pluginName, enabled) => {
        try {
            const settingsPaths = [
                path.join(extensionsDir, 'data', 'settings', 'settings.json'),
                path.join(process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming'), 'Vencord', 'settings', 'settings.json')
            ];

            for (const sp of settingsPaths) {
                try {
                    const dir = path.dirname(sp);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    let settings = {};
                    if (fs.existsSync(sp)) {
                        const raw = fs.readFileSync(sp, 'utf8').replace(/^\uFEFF/, '');
                        settings = JSON.parse(raw);
                    }
                    if (!settings.plugins) settings.plugins = {};
                    if (!settings.plugins[pluginName]) {
                        settings.plugins[pluginName] = { enabled: Boolean(enabled) };
                    } else {
                        settings.plugins[pluginName].enabled = Boolean(enabled);
                    }
                    fs.writeFileSync(sp, JSON.stringify(settings, null, 2), 'utf8');
                } catch (_) {}
            }
            writeLog('Plugin ' + pluginName + ' state toggled to: ' + enabled);

            const currentConfig = getConfig();
            const disabled = Array.isArray(currentConfig.disabledExtensions) ? [...currentConfig.disabledExtensions] : [];
            if (enabled) {
                const idx = disabled.indexOf(pluginName);
                if (idx !== -1) disabled.splice(idx, 1);
            } else {
                if (!disabled.includes(pluginName)) disabled.push(pluginName);
            }
            saveConfig({ disabledExtensions: disabled });
            return { success: true };
        } catch (e) {
            writeLog('Plugin toggle error:', e.message);
        }
        return { success: false };
    });

    ipcMain.handle('relaunch-discord', async () => {
        try {
            writeLog('Relaunching Discord requested by user.');
            
            ensureDiscordPatched();

            const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
            const discordDir = path.join(localAppData, 'Discord');

            const latest = getLatestDiscordExe();
            if (latest && fs.existsSync(latest.exePath)) {
                writeLog('Relaunching Discord via latest app exe:', latest.exePath);
                spawn(latest.exePath, [], {
                    detached: true,
                    stdio: 'ignore',
                    cwd: latest.appDir
                }).unref();
                app.exit(0);
                return;
            }

            const rootExe = path.join(discordDir, 'Discord.exe');
            if (fs.existsSync(rootExe)) {
                writeLog('Relaunching Discord via root Discord.exe...');
                spawn(rootExe, [], {
                    detached: true,
                    stdio: 'ignore'
                }).unref();
                app.exit(0);
                return;
            }

            const updateExe = path.join(discordDir, 'Update.exe');
            if (fs.existsSync(updateExe)) {
                writeLog('Relaunching Discord via Update.exe...');
                spawn(updateExe, ['--processStart', 'Discord.exe'], {
                    detached: true,
                    stdio: 'ignore'
                }).unref();
                app.exit(0);
                return;
            }
        } catch (e) {
            writeLog('Relaunch error:', e.message);
        }
        app.relaunch();
        app.exit(0);
    });

    ipcMain.handle('get-locale', async () => {
        try {
            return app.getLocale() || 'ru';
        } catch (_) {
            return 'ru';
        }
    });

    ipcMain.handle('open-extensions-dir', async () => {
        shell.openPath(extensionsDir);
        return true;
    });

    ipcMain.handle('get-custom-css', async () => {
        try {
            if (fs.existsSync(customCssFile)) {
                return fs.readFileSync(customCssFile, 'utf8');
            }
        } catch (e) {
            writeLog('Custom CSS read error:', e.message);
        }
        return '';
    });

    ipcMain.handle('save-custom-css', async (_, css) => {
        try {
            const dataDir = path.dirname(customCssFile);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            fs.writeFileSync(customCssFile, css || '', 'utf8');
            writeLog('Custom CSS saved successfully.');
            return { success: true };
        } catch (e) {
            writeLog('Custom CSS save error:', e.message);
            return { success: false, error: e.message };
        }
    });

    // Helper to get Discord main window
    function getDiscordMainWindow() {
        const mgr = getManagerWindow();
        const { isMainWindow } = require('./windowUtils');
        for (const win of electron.BrowserWindow.getAllWindows()) {
            if (win.isDestroyed() || win === mgr) continue;
            if (isMainWindow(win, mgr)) return win;
        }
        return null;
    }

    // Quests IPC Handlers
    ipcMain.handle('start-quests', async () => {
        const win = getDiscordMainWindow();
        if (win) {
            win.webContents.executeJavaScript('if (typeof window.__DISCORD_EXT_START_QUESTS === "function") window.__DISCORD_EXT_START_QUESTS();').catch(() => {});
        }
        return { success: true };
    });

    ipcMain.handle('stop-quests', async () => {
        const win = getDiscordMainWindow();
        if (win) {
            win.webContents.executeJavaScript('if (typeof window.__DISCORD_EXT_STOP_QUESTS === "function") window.__DISCORD_EXT_STOP_QUESTS();').catch(() => {});
        }
        return { success: true };
    });

    ipcMain.handle('claim-quest', async () => {
        const win = getDiscordMainWindow();
        if (win) {
            return await win.webContents.executeJavaScript('if (typeof window.__DISCORD_EXT_CLAIM_QUEST === "function") { window.__DISCORD_EXT_CLAIM_QUEST(); } else { false; }').catch(() => false);
        }
        return false;
    });

    ipcMain.handle('get-quests-status', async () => {
        const win = getDiscordMainWindow();
        if (win) {
            try {
                const res = await win.webContents.executeJavaScript('typeof window.__DISCORD_EXT_GET_QUESTS_STATUS === "function" ? window.__DISCORD_EXT_GET_QUESTS_STATUS() : null;');
                if (res) return res;
            } catch (_) {}
        }
        return {
            running: false,
            activeCount: 0,
            unclaimedCount: 0,
            questName: '',
            secondsDone: 0,
            secondsNeeded: 0,
            statusMsg: 'Ожидание подключения к Discord',
            allFinished: false
        };
    });

    // Themes IPC Handlers
    const themesModule = require('./themes');
    ipcMain.handle('get-themes-data', async () => {
        const state = themesModule.getActiveThemesState();
        return {
            nativeThemes: themesModule.NATIVE_GRADIENT_PRESETS,
            activeNativeTheme: state.activeNativeTheme,
            customThemes: themesModule.getInstalledCustomThemes(),
            enabledCustomThemes: state.enabledCustomThemes
        };
    });

    ipcMain.handle('set-native-theme', async (_, themeId) => {
        saveConfig({ activeNativeTheme: themeId });
        const { BrowserWindow } = electron;
        const { isMainWindow } = require('./windowUtils');
        const mgr = getManagerWindow();
        for (const win of BrowserWindow.getAllWindows()) {
            if (win.isDestroyed()) continue;
            if (mgr && win === mgr) continue;
            if (!isMainWindow(win, mgr)) continue;
            themesModule.applyNativeGradientTheme(win, themeId);
        }
        return { success: true };
    });

    ipcMain.handle('toggle-custom-theme', async (_, themeId, enabled) => {
        const state = themesModule.getActiveThemesState();
        let list = [...state.enabledCustomThemes];
        if (enabled) {
            if (!list.includes(themeId)) list.push(themeId);
        } else {
            list = list.filter(id => id !== themeId);
        }
        saveConfig({ enabledCustomThemes: list });
        themesModule.updateThemesAcrossWindows();
        return { success: true };
    });

    ipcMain.handle('download-theme-url', async (_, url) => {
        try {
            const res = await themesModule.downloadThemeFromUrl(url);
            const state = themesModule.getActiveThemesState();
            let list = [...state.enabledCustomThemes];
            if (!list.includes(res.fileName)) list.push(res.fileName);
            saveConfig({ enabledCustomThemes: list });
            themesModule.updateThemesAcrossWindows();
            return { success: true, fileName: res.fileName };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('delete-theme', async (_, fileName) => {
        try {
            const targetPath = path.join(themesModule.themesDir, fileName);
            if (fs.existsSync(targetPath)) {
                fs.unlinkSync(targetPath);
            }
            const state = themesModule.getActiveThemesState();
            const list = state.enabledCustomThemes.filter(id => id !== fileName);
            saveConfig({ enabledCustomThemes: list });
            themesModule.updateThemesAcrossWindows();
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('open-themes-dir', async () => {
        shell.openPath(themesModule.themesDir);
        return true;
    });

    // Downloaded / User Plugins IPC Handlers
    const userPluginsDir = path.join(extensionsDir, 'data', 'plugins');
    if (!fs.existsSync(userPluginsDir)) {
        try { fs.mkdirSync(userPluginsDir, { recursive: true }); } catch (_) {}
    }

    ipcMain.handle('get-downloaded-plugins', async () => {
        const list = [];
        try {
            if (fs.existsSync(userPluginsDir)) {
                const files = fs.readdirSync(userPluginsDir);
                for (const file of files) {
                    if (file.endsWith('.js') || file.endsWith('.json')) {
                        const filePath = path.join(userPluginsDir, file);
                        const stat = fs.statSync(filePath);
                        list.push({
                            id: file,
                            fileName: file,
                            name: file.replace(/\.(js|json)$/, ''),
                            size: stat.size,
                            modified: stat.mtimeMs,
                            enabled: true
                        });
                    }
                }
            }
        } catch (_) {}
        return list;
    });

    ipcMain.handle('open-plugins-dir', async () => {
        shell.openPath(userPluginsDir);
        return true;
    });

    // CustomRPC IPC Handlers
    const customRPCModule = require('./customRPC');
    ipcMain.handle('get-custom-rpc', async () => {
        return customRPCModule.getCustomRPCConfig();
    });

    ipcMain.handle('save-custom-rpc', async (_, newConfig) => {
        saveConfig({ customRPC: newConfig });
        return { success: true };
    });

    ipcMain.handle('open-external', async (_, url) => {
        if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
            shell.openExternal(url);
            return true;
        }
        return false;
    });

    // Updates IPC Handlers
    const updaterModule = require('./updater');
    ipcMain.handle('check-for-updates', async () => {
        return updaterModule.checkForUpdates();
    });

    ipcMain.handle('apply-update', async () => {
        return updaterModule.applyUpdate();
    });

    ipcMain.on('minimize-manager-window', () => {
        const mgr = getManagerWindow();
        if (mgr && !mgr.isDestroyed()) mgr.minimize();
    });

    ipcMain.on('close-manager-window', () => {
        const mgr = getManagerWindow();
        if (mgr && !mgr.isDestroyed()) mgr.hide();
    });
}

module.exports = {
    registerIpcHandlers
};
