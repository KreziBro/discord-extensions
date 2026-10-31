const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('discordExtensions', {
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
    relaunchDiscord: () => ipcRenderer.invoke('relaunch-discord'),
    getLocale: () => ipcRenderer.invoke('get-locale'),
    getPlugins: () => ipcRenderer.invoke('get-plugins'),
    togglePlugin: (name, enable) => ipcRenderer.invoke('toggle-plugin', name, enable),
    getExtensions: () => ipcRenderer.invoke('get-extensions'),
    toggleExtension: (folder, enable) => ipcRenderer.invoke('toggle-extension', folder, enable),
    openExtensionsDir: () => ipcRenderer.invoke('open-extensions-dir'),
    openChromeDir: () => ipcRenderer.invoke('open-chrome-dir'),
    minimizeWindow: () => ipcRenderer.send('minimize-manager-window'),
    closeWindow: () => ipcRenderer.send('close-manager-window'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    applyUpdate: () => ipcRenderer.invoke('apply-update'),
    getCustomCss: () => ipcRenderer.invoke('get-custom-css'),
    saveCustomCss: (css) => ipcRenderer.invoke('save-custom-css', css),
    startQuests: () => ipcRenderer.invoke('start-quests'),
    stopQuests: () => ipcRenderer.invoke('stop-quests'),
    claimQuest: () => ipcRenderer.invoke('claim-quest'),
    getQuestsStatus: () => ipcRenderer.invoke('get-quests-status'),
    getThemesData: () => ipcRenderer.invoke('get-themes-data'),
    setNativeTheme: (themeId) => ipcRenderer.invoke('set-native-theme', themeId),
    toggleCustomTheme: (themeId, enable) => ipcRenderer.invoke('toggle-custom-theme', themeId, enable),
    downloadThemeUrl: (url) => ipcRenderer.invoke('download-theme-url', url),
    deleteTheme: (fileName) => ipcRenderer.invoke('delete-theme', fileName),
    openThemesDir: () => ipcRenderer.invoke('open-themes-dir'),
    getDownloadedPlugins: () => ipcRenderer.invoke('get-downloaded-plugins'),
    openPluginsDir: () => ipcRenderer.invoke('open-plugins-dir'),
    getCustomRPC: () => ipcRenderer.invoke('get-custom-rpc'),
    saveCustomRPC: (rpc) => ipcRenderer.invoke('save-custom-rpc', rpc),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    onConfigUpdated: (callback) => {
        ipcRenderer.on('config-updated', (_, cfg) => callback(cfg));
    },
    onUpdateAvailable: (callback) => {
        ipcRenderer.on('update-available', (_, info) => callback(info));
    },
    onUpdateStatus: (callback) => {
        ipcRenderer.on('update-status', (_, status) => callback(status));
    }
});
