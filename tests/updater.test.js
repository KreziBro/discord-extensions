const test = require('node:test');
const assert = require('node:assert');
const { compareVersions } = require('../src/modules/updater');

test('Updater: compareVersions compares semantic versions properly', () => {
    assert.strictEqual(compareVersions('1.0.1', '1.0.0'), 1);
    assert.strictEqual(compareVersions('1.0.0', '1.0.1'), -1);
    assert.strictEqual(compareVersions('1.0.0', '1.0.0'), 0);
    assert.strictEqual(compareVersions('2.0.0', '1.9.9'), 1);
    assert.strictEqual(compareVersions('1.10.0', '1.2.0'), 1);
    assert.strictEqual(compareVersions('1.0.0', '1.0.0.0'), 0);
});
