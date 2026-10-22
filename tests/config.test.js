const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { getConfig, saveConfig, DEFAULT_CONFIG } = require('../src/modules/config');

test('Config: Default config contains expected core flags', () => {
    assert.strictEqual(typeof DEFAULT_CONFIG, 'object');
    assert.strictEqual(typeof DEFAULT_CONFIG.performanceMode, 'boolean');
    assert.strictEqual(typeof DEFAULT_CONFIG.showDockButton, 'boolean');
    assert.strictEqual(typeof DEFAULT_CONFIG.selectedTheme, 'string');
    assert.ok(Array.isArray(DEFAULT_CONFIG.disabledExtensions));
});

test('Config: getConfig returns a valid configuration object', () => {
    const cfg = getConfig();
    assert.ok(cfg !== null && typeof cfg === 'object');
    assert.ok('performanceMode' in cfg);
    assert.ok('showDockButton' in cfg);
});

test('Config: saveConfig safely merges partial updates', () => {
    const initial = getConfig();
    const testVal = !initial.performanceMode;
    saveConfig({ performanceMode: testVal });

    const updated = getConfig();
    assert.strictEqual(updated.performanceMode, testVal);

    // Restore initial state
    saveConfig({ performanceMode: initial.performanceMode });
    assert.strictEqual(getConfig().performanceMode, initial.performanceMode);
});
