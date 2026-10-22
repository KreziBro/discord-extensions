const test = require('node:test');
const assert = require('node:assert');
const { parseAppVersion, compareAppVersions, HOOK_CODE } = require('../src/modules/persistence');

test('Persistence: parseAppVersion handles semver strings', () => {
    assert.deepStrictEqual(parseAppVersion('app-1.0.9266'), [1, 0, 9266]);
    assert.deepStrictEqual(parseAppVersion('app-1.0.9188'), [1, 0, 9188]);
    assert.deepStrictEqual(parseAppVersion('app-2.1.0'), [2, 1, 0]);
    assert.deepStrictEqual(parseAppVersion('1.0.0'), [1, 0, 0]);
});

test('Persistence: compareAppVersions sorts versions correctly', () => {
    assert.ok(compareAppVersions('app-1.0.9266', 'app-1.0.9265') > 0);
    assert.ok(compareAppVersions('app-1.0.9265', 'app-1.0.9266') < 0);
    assert.strictEqual(compareAppVersions('app-1.0.9266', 'app-1.0.9266'), 0);
    assert.ok(compareAppVersions('app-2.0.0', 'app-1.9.9999') > 0);
});

test('Persistence: HOOK_CODE contains valid loader require structure', () => {
    assert.ok(HOOK_CODE.includes('discordExtensionLoader.js'));
    assert.ok(HOOK_CODE.includes("require('./core.asar')"));
    assert.ok(HOOK_CODE.includes('try {'));
    assert.ok(HOOK_CODE.includes('catch'));
});
