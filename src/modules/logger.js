const path = require('path');
const fs = require('fs');

const extensionsDir = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local'), 'Discord', 'extensions');
const logFile = path.join(extensionsDir, 'discord_extensions.log');

function writeLog(...args) {
    try {
        const msg = `[${new Date().toISOString()}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}\n`;
        fs.appendFileSync(logFile, msg, 'utf8');
    } catch (_) {}
}

module.exports = {
    extensionsDir,
    logFile,
    writeLog
};
