const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { extensionsDir, writeLog } = require('./logger');

const DEFAULT_UPDATE_URL = 'https://raw.githubusercontent.com/KreziBro/discord-extensions/main/version.json';
const DEFAULT_ZIP_URL = 'https://github.com/KreziBro/discord-extensions/archive/refs/heads/main.zip';
const GITHUB_API_URL = 'https://api.github.com/repos/KreziBro/discord-extensions/contents/version.json';

let RUNNING_VERSION = null;
let UPDATE_PENDING_RESTART = false;
let PENDING_VERSION = null;

function initRunningVersion() {
    if (!RUNNING_VERSION) {
        const info = getLocalVersionInfo();
        RUNNING_VERSION = info.version || '1.0.2';
    }
    return RUNNING_VERSION;
}

function getLocalVersionInfo() {
    try {
        const localVersionPath = path.join(extensionsDir, 'version.json');
        if (fs.existsSync(localVersionPath)) {
            const raw = fs.readFileSync(localVersionPath, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        writeLog('Error reading local version.json:', e.message);
    }
    return {
        version: '1.0.2',
        name: 'Discord Extensions',
        updateUrl: DEFAULT_UPDATE_URL,
        zipUrl: DEFAULT_ZIP_URL
    };
}

function fetchRemoteVersion() {
    return new Promise((resolve) => {
        const apiReq = https.get(GITHUB_API_URL, {
            headers: {
                'User-Agent': 'DiscordExtensions-Updater',
                'Accept': 'application/vnd.github.v3.raw'
            }
        }, (res) => {
            if (res.statusCode === 200) {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        return resolve(parsed);
                    } catch (_) {}
                    fallbackRaw();
                });
            } else {
                fallbackRaw();
            }
        });
        apiReq.on('error', () => fallbackRaw());

        function fallbackRaw() {
            const rawUrl = DEFAULT_UPDATE_URL + '?t=' + Date.now();
            fetchJson(rawUrl).then(resolve).catch(() => resolve(null));
        }
    });
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        function get(currUrl, hops) {
            if (hops > 8) return reject(new Error('Too many redirects'));
            const client = currUrl.startsWith('https:') ? https : http;
            client.get(currUrl, {
                headers: {
                    'User-Agent': 'DiscordExtensions-Updater',
                    'Cache-Control': 'no-cache'
                }
            }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return get(res.headers.location, hops + 1);
                }
                if (res.statusCode !== 200) {
                    return reject(new Error(`HTTP error ${res.statusCode}`));
                }
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed);
                    } catch (err) {
                        reject(err);
                    }
                });
                res.on('error', reject);
            }).on('error', reject);
        }
        get(url, 0);
    });
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        function get(currUrl, hops) {
            if (hops > 8) return reject(new Error('Too many redirects'));
            const client = currUrl.startsWith('https:') ? https : http;
            client.get(currUrl, {
                headers: {
                    'User-Agent': 'DiscordExtensions-Updater'
                }
            }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return get(res.headers.location, hops + 1);
                }
                if (res.statusCode !== 200) {
                    return reject(new Error(`HTTP error ${res.statusCode}`));
                }
                const fileStream = fs.createWriteStream(destPath);
                res.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close(() => resolve(destPath));
                });
                fileStream.on('error', (err) => {
                    fs.unlink(destPath, () => reject(err));
                });
            }).on('error', reject);
        }
        get(url, 0);
    });
}

function extractZip(zipPath, targetDir) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        execFile('tar.exe', ['-xf', zipPath, '-C', targetDir], (err) => {
            if (!err) return resolve();
            writeLog('tar.exe failed or unavailable, trying PowerShell Expand-Archive:', err ? err.message : '');
            const escapedZip = zipPath.replace(/'/g, "''");
            const escapedTarget = targetDir.replace(/'/g, "''");
            const psCmd = `Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedTarget}' -Force`;
            execFile('powershell.exe', ['-NoProfile', '-Command', psCmd], (psErr) => {
                if (psErr) return reject(psErr);
                resolve();
            });
        });
    });
}

function compareVersions(v1, v2) {
    const p1 = String(v1 || '0.0.0').split('.').map(x => parseInt(x, 10) || 0);
    const p2 = String(v2 || '0.0.0').split('.').map(x => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    return 0;
}

async function checkForUpdates() {
    const runningVer = initRunningVersion();
    const diskInfo = getLocalVersionInfo();
    const diskVer = diskInfo.version || runningVer;

    if (compareVersions(diskVer, runningVer) > 0) {
        UPDATE_PENDING_RESTART = true;
        PENDING_VERSION = diskVer;
    }

    try {
        const remote = await fetchRemoteVersion();
        if (remote && remote.version) {
            const isNewerThanRunning = compareVersions(remote.version, runningVer) > 0;
            const isNewerThanDisk = compareVersions(remote.version, diskVer) > 0;

            if (UPDATE_PENDING_RESTART) {
                return {
                    updateAvailable: true,
                    updatePendingRestart: true,
                    currentVersion: runningVer,
                    latestVersion: PENDING_VERSION || remote.version,
                    changelog: remote.changelog || diskInfo.changelog || '',
                    zipUrl: remote.zipUrl || DEFAULT_ZIP_URL
                };
            }

            return {
                updateAvailable: isNewerThanRunning || isNewerThanDisk,
                updatePendingRestart: false,
                currentVersion: runningVer,
                latestVersion: remote.version,
                changelog: remote.changelog || '',
                zipUrl: remote.zipUrl || DEFAULT_ZIP_URL
            };
        }
    } catch (e) {
        writeLog('Check for updates failed:', e.message);
    }

    if (UPDATE_PENDING_RESTART) {
        return {
            updateAvailable: true,
            updatePendingRestart: true,
            currentVersion: runningVer,
            latestVersion: PENDING_VERSION || diskVer,
            changelog: diskInfo.changelog || '',
            zipUrl: DEFAULT_ZIP_URL
        };
    }

    return {
        updateAvailable: false,
        updatePendingRestart: false,
        currentVersion: runningVer,
        latestVersion: runningVer
    };
}

function copyRecursive(src, dest, exclude = []) {
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const entries = fs.readdirSync(src);
        for (const entry of entries) {
            if (exclude.includes(entry)) continue;
            copyRecursive(path.join(src, entry), path.join(dest, entry), exclude);
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

async function applyUpdate() {
    const tmpZip = path.join(os.tmpdir(), `discord_ext_update_${Date.now()}.zip`);
    const tmpExtract = path.join(os.tmpdir(), `discord_ext_extract_${Date.now()}`);

    try {
        writeLog('Starting update process...');
        const updateInfo = await checkForUpdates();
        const zipUrl = updateInfo.zipUrl || DEFAULT_ZIP_URL;

        writeLog('Downloading update archive from:', zipUrl);
        await downloadFile(zipUrl, tmpZip);

        writeLog('Extracting update archive to:', tmpExtract);
        await extractZip(tmpZip, tmpExtract);

        let repoRoot = tmpExtract;
        const subdirs = fs.readdirSync(tmpExtract);
        if (subdirs.length === 1 && fs.statSync(path.join(tmpExtract, subdirs[0])).isDirectory()) {
            repoRoot = path.join(tmpExtract, subdirs[0]);
        }

        const srcDir = path.join(repoRoot, 'src');
        if (!fs.existsSync(srcDir)) {
            throw new Error('Directory src not found in update archive');
        }

        writeLog('Applying files from update to extensions directory:', extensionsDir);

        const coreFiles = [
            'discordExtensionLoader.js',
            'discordPreload.js',
            'extensionsManager.html',
            'plugins.json',
            'version.json'
        ];

        for (const file of coreFiles) {
            const srcPath = path.join(srcDir, file);
            if (fs.existsSync(srcPath)) {
                fs.copyFileSync(srcPath, path.join(extensionsDir, file));
            }
        }

        const rootVersionPath = path.join(repoRoot, 'version.json');
        if (fs.existsSync(rootVersionPath)) {
            fs.copyFileSync(rootVersionPath, path.join(extensionsDir, 'version.json'));
        }

        const modulesSrc = path.join(srcDir, 'modules');
        if (fs.existsSync(modulesSrc)) {
            const modulesDest = path.join(extensionsDir, 'modules');
            copyRecursive(modulesSrc, modulesDest);
        }

        const coreSrc = path.join(srcDir, 'core');
        if (fs.existsSync(coreSrc)) {
            const coreDest = path.join(extensionsDir, 'core');
            copyRecursive(coreSrc, coreDest);
        }

        const themesSrc = path.join(srcDir, 'themes');
        if (fs.existsSync(themesSrc)) {
            const themesDest = path.join(extensionsDir, 'data', 'themes');
            copyRecursive(themesSrc, themesDest);
        }

        writeLog('Update files copied successfully.');
        UPDATE_PENDING_RESTART = true;
        PENDING_VERSION = updateInfo.latestVersion;

        try {
            if (fs.existsSync(tmpZip)) fs.unlinkSync(tmpZip);
            if (fs.existsSync(tmpExtract)) fs.rmSync(tmpExtract, { recursive: true, force: true });
        } catch (_) {}

        return {
            success: true,
            restartRequired: true,
            latestVersion: updateInfo.latestVersion
        };
    } catch (e) {
        writeLog('Apply update failed:', e.message);
        try {
            if (fs.existsSync(tmpZip)) fs.unlinkSync(tmpZip);
            if (fs.existsSync(tmpExtract)) fs.rmSync(tmpExtract, { recursive: true, force: true });
        } catch (_) {}
        return {
            success: false,
            error: e.message
        };
    }
}

module.exports = {
    checkForUpdates,
    applyUpdate,
    compareVersions
};
