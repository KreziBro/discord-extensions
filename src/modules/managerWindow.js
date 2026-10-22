const { BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { extensionsDir, writeLog } = require('./logger');
const { getConfig, setManagerWindowGetter } = require('./config');

let managerWindow = null;

setManagerWindowGetter(() => managerWindow);

function getManagerWindow() {
    return managerWindow;
}

function createManagerWindow() {
    if (managerWindow && !managerWindow.isDestroyed()) {
        managerWindow.focus();
        return managerWindow;
    }

    const htmlPath = path.join(extensionsDir, 'extensionsManager.html');
    const preloadPath = path.join(extensionsDir, 'discordPreload.js');

    managerWindow = new BrowserWindow({
        width: 1040,
        height: 720,
        minWidth: 800,
        minHeight: 560,
        frame: false,
        backgroundColor: '#1e1f22',
        title: 'Discord Extensions Manager',
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            webSecurity: false
        }
    });

    managerWindow.setMenuBarVisibility(false);

    if (fs.existsSync(htmlPath)) {
        managerWindow.loadFile(htmlPath);
    } else {
        managerWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
            <html><body style="background:#1e1f22;color:#f2f3f5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                <h2>Discord Extensions Manager</h2>
            </body></html>
        `));
    }

    managerWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http:') || url.startsWith('https:')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    managerWindow.on('closed', () => {
        managerWindow = null;
    });

    writeLog('Manager window created.');
    return managerWindow;
}

function openManagerWindow() {
    if (managerWindow && !managerWindow.isDestroyed()) {
        managerWindow.show();
        managerWindow.focus();
    } else {
        createManagerWindow();
    }
}

module.exports = {
    createManagerWindow,
    openManagerWindow,
    getManagerWindow
};
