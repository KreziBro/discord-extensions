const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('discordExtensions', {
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
    relaunchDiscord: () => ipcRenderer.invoke('relaunch-discord'),
    getLocale: () => ipcRenderer.invoke('get-locale'),
    getExtensions: () => ipcRenderer.invoke('get-extensions'),
    toggleExtension: (folder, enable) => ipcRenderer.invoke('toggle-extension', folder, enable),
    openExtensionsDir: () => ipcRenderer.invoke('open-extensions-dir'),
    minimizeWindow: () => ipcRenderer.send('minimize-manager-window'),
    closeWindow: () => ipcRenderer.send('close-manager-window'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    applyUpdate: () => ipcRenderer.invoke('apply-update'),
    getCustomCss: () => ipcRenderer.invoke('get-custom-css'),
    saveCustomCss: (css) => ipcRenderer.invoke('save-custom-css', css),
    onUpdateAvailable: (callback) => {
        ipcRenderer.on('update-available', (_, info) => callback(info));
    },
    onUpdateStatus: (callback) => {
        ipcRenderer.on('update-status', (_, status) => callback(status));
    }
});
