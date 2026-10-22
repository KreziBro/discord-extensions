const test = require('node:test');
const assert = require('node:assert');
const {
    parseThemeMeta,
    NATIVE_GRADIENT_PRESETS,
    normalizeThemeDownloadUrl
} = require('../src/modules/themes');

test('Themes: parseThemeMeta parses meta comments from CSS', () => {
    const sampleCss = `/**
 * @name Dark Cyberpunk
 * @description A neon themed dark mode
 * @author KrejziBro
 * @version 2.1.0
 */
body { background: #000; }`;

    const meta = parseThemeMeta(sampleCss);
    assert.strictEqual(meta.name, 'Dark Cyberpunk');
    assert.strictEqual(meta.description, 'A neon themed dark mode');
    assert.strictEqual(meta.author, 'KrejziBro');
    assert.strictEqual(meta.version, '2.1.0');
});

test('Themes: parseThemeMeta falls back to defaults on unannotated CSS', () => {
    const rawCss = 'body { color: red; }';
    const meta = parseThemeMeta(rawCss);
    assert.strictEqual(meta.name, 'Пользовательская тема');
    assert.strictEqual(meta.author, 'Неизвестно');
});

test('Themes: NATIVE_GRADIENT_PRESETS has complete valid gradient presets', () => {
    assert.ok(Array.isArray(NATIVE_GRADIENT_PRESETS));
    assert.ok(NATIVE_GRADIENT_PRESETS.length >= 10);

    for (const preset of NATIVE_GRADIENT_PRESETS) {
        assert.ok(typeof preset.id === 'string');
        assert.ok(typeof preset.name === 'string');
        assert.ok(typeof preset.presetId === 'number');
        assert.ok(Array.isArray(preset.colors));
    }
});

test('Themes: normalizeThemeDownloadUrl converts GitHub blob to raw URL', () => {
    const blobUrl = 'https://github.com/user/repo/blob/main/theme.css';
    const expected = 'https://raw.githubusercontent.com/user/repo/main/theme.css';
    assert.strictEqual(normalizeThemeDownloadUrl(blobUrl), expected);
});

test('Themes: normalizeThemeDownloadUrl leaves direct URLs intact', () => {
    const rawUrl = 'https://example.com/styles.css';
    assert.strictEqual(normalizeThemeDownloadUrl(rawUrl), rawUrl);
});
