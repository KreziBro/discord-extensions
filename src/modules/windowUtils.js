function isMainWindow(win, managerWindow) {
    if (!win || win.isDestroyed()) return false;
    try {
        if (managerWindow && win === managerWindow) return false;
        const prefs = win.webContents.getWebPreferences ? win.webContents.getWebPreferences() : {};
        if (prefs && prefs.offscreen) return false;
        if (win.webContents.isOffscreen && win.webContents.isOffscreen()) return false;

        const url = (win.webContents.getURL() || '').toLowerCase();
        const title = (win.getTitle() || '').toLowerCase();
        if (url.includes('overlay') || url.includes('popout') || title.includes('overlay')) {
            return false;
        }

        if (win.isAlwaysOnTop() && !win.isResizable()) return false;

        if (!win.isMinimized()) {
            const bounds = win.getBounds ? win.getBounds() : { width: 0, height: 0 };
            if (bounds.width < 300 || bounds.height < 200) return false;
        }

        return true;
    } catch (_) {
        return false;
    }
}

module.exports = { isMainWindow };
