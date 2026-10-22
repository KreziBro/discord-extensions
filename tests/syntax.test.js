const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getJsFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) {
            results = results.concat(getJsFiles(full));
        } else if (f.endsWith('.js')) {
            results.push(full);
        }
    }
    return results;
}

test('Syntax: All JavaScript files in src and plugins compile without errors', () => {
    const root = path.join(__dirname, '..');
    const srcFiles = getJsFiles(path.join(root, 'src'));
    const pluginFiles = getJsFiles(path.join(root, 'extensions', 'data', 'plugins'));
    const allFiles = [...srcFiles, ...pluginFiles];

    assert.ok(allFiles.length > 5, 'Expected multiple JavaScript source files');

    for (const file of allFiles) {
        try {
            execSync(`node -c "${file}"`, { stdio: 'pipe' });
        } catch (e) {
            assert.fail(`Syntax error in file: ${path.relative(root, file)}\n${e.message}`);
        }
    }
});
