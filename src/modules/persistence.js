const path = require('path');
const fs = require('fs');
const { writeLog } = require('./logger');

const HOOK_CODE = `const path = require('path');
try {
    const extDir = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local'), 'Discord', 'extensions');
    require(path.join(extDir, 'discordExtensionLoader.js'));
} catch (e) {
    console.error('[DiscordExtensions] Init failure:', e);
}
module.exports = require('./core.asar');
`;

function getDiscordBaseDir() {
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
    return path.join(localAppData, 'Discord');
}

function parseAppVersion(dirName) {
    const clean = dirName.replace(/^app-/, '');
    return clean.split('.').map(n => parseInt(n, 10) || 0);
}

function compareAppVersions(a, b) {
    const va = parseAppVersion(a);
    const vb = parseAppVersion(b);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
        const numA = va[i] || 0;
        const numB = vb[i] || 0;
        if (numA !== numB) return numA - numB;
    }
    return 0;
}

function ensureDiscordPatched() {
    try {
        const discordBase = getDiscordBaseDir();
        if (!fs.existsSync(discordBase)) return false;

        const entries = fs.readdirSync(discordBase, { withFileTypes: true });
        const appDirs = entries
            .filter(d => d.isDirectory() && d.name.startsWith('app-'))
            .map(d => d.name)
            .sort(compareAppVersions)
            .reverse();

        let patchedAny = false;

        for (const appName of appDirs) {
            const appPath = path.join(discordBase, appName);
            const modulesPath = path.join(appPath, 'modules');
            if (!fs.existsSync(modulesPath)) continue;

            const modEntries = fs.readdirSync(modulesPath, { withFileTypes: true });
            const coreDirs = modEntries.filter(d => d.isDirectory() && d.name.startsWith('discord_desktop_core'));

            for (const coreDir of coreDirs) {
                const targetJs = path.join(modulesPath, coreDir.name, 'discord_desktop_core', 'index.js');
                if (fs.existsSync(targetJs)) {
                    try {
                        const content = fs.readFileSync(targetJs, 'utf8');
                        if (!content.includes('discordExtensionLoader.js')) {
                            const backupPath = path.join(modulesPath, coreDir.name, 'discord_desktop_core', 'index.js.original');
                            if (!fs.existsSync(backupPath)) {
                                fs.writeFileSync(backupPath, content, 'utf8');
                            }
                            fs.writeFileSync(targetJs, HOOK_CODE, 'utf8');
                            writeLog(`[Persistence] Injected loader into: ${targetJs}`);
                            patchedAny = true;
                        }
                    } catch (readWriteErr) {
                        writeLog(`[Persistence] Failed to patch ${targetJs}:`, readWriteErr.message);
                    }
                }
            }
        }

        return patchedAny;
    } catch (err) {
        writeLog('[Persistence] ensureDiscordPatched error:', err.message);
        return false;
    }
}

function getLatestDiscordExe() {
    try {
        const discordBase = getDiscordBaseDir();
        if (!fs.existsSync(discordBase)) return null;

        const entries = fs.readdirSync(discordBase, { withFileTypes: true });
        const appDirs = entries
            .filter(d => d.isDirectory() && d.name.startsWith('app-'))
            .map(d => d.name)
            .sort(compareAppVersions)
            .reverse();

        for (const appName of appDirs) {
            const exePath = path.join(discordBase, appName, 'Discord.exe');
            if (fs.existsSync(exePath)) {
                return { exePath, appDir: path.join(discordBase, appName) };
            }
        }
    } catch (_) {}
    return null;
}

function initPersistenceWatcher() {
    ensureDiscordPatched();

    const interval = setInterval(() => {
        ensureDiscordPatched();
    }, 30000);
    if (interval.unref) interval.unref();

    try {
        const discordBase = getDiscordBaseDir();
        if (fs.existsSync(discordBase)) {
            const watcher = fs.watch(discordBase, (eventType, filename) => {
                if (filename && filename.startsWith('app-')) {
                    setTimeout(() => {
                        ensureDiscordPatched();
                    }, 2000);
                }
            });
            if (watcher && typeof watcher.unref === 'function') watcher.unref();
        }
    } catch (_) {}
}

module.exports = {
    ensureDiscordPatched,
    getLatestDiscordExe,
    initPersistenceWatcher,
    parseAppVersion,
    compareAppVersions,
    HOOK_CODE,
    getDiscordBaseDir
};
