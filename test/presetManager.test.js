'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const {
  PRESETS_STORAGE_KEY,
  getAllPresets,
  savePreset,
  deletePreset,
  derivePresetNameSuggestion,
} = require('../src/presetManager');

function makeStorage(initial = {}) {
  let store = { ...initial };
  return {
    get(key, defaultValue) {
      return key in store ? store[key] : defaultValue;
    },
    update(key, value) {
      store[key] = value;
    },
    _store: () => store,
  };
}

describe('getAllPresets', () => {
  it('returns empty object when no presets stored', () => {
    const storage = makeStorage();
    assert.deepEqual(getAllPresets(storage), {});
  });

  it('returns stored presets', () => {
    const storage = makeStorage({
      [PRESETS_STORAGE_KEY]: { 'auth flow': ['src/auth.js'] },
    });
    assert.deepEqual(getAllPresets(storage), { 'auth flow': ['src/auth.js'] });
  });
});

describe('savePreset', () => {
  it('saves a new preset', () => {
    const storage = makeStorage();
    savePreset(storage, 'auth flow', ['src/auth.js', 'src/middleware.js']);
    const presets = getAllPresets(storage);
    assert.deepEqual(presets['auth flow'], ['src/auth.js', 'src/middleware.js']);
  });

  it('overwrites an existing preset with the same name', () => {
    const storage = makeStorage({
      [PRESETS_STORAGE_KEY]: { 'auth flow': ['src/old.js'] },
    });
    savePreset(storage, 'auth flow', ['src/new.js']);
    const presets = getAllPresets(storage);
    assert.deepEqual(presets['auth flow'], ['src/new.js']);
  });

  it('preserves other presets when saving a new one', () => {
    const storage = makeStorage({
      [PRESETS_STORAGE_KEY]: { 'API layer': ['src/api.js'] },
    });
    savePreset(storage, 'auth flow', ['src/auth.js']);
    const presets = getAllPresets(storage);
    assert.deepEqual(presets['API layer'], ['src/api.js']);
    assert.deepEqual(presets['auth flow'], ['src/auth.js']);
  });

  it('saves an empty path array', () => {
    const storage = makeStorage();
    savePreset(storage, 'empty', []);
    assert.deepEqual(getAllPresets(storage)['empty'], []);
  });
});

describe('deletePreset', () => {
  it('removes the named preset', () => {
    const storage = makeStorage({
      [PRESETS_STORAGE_KEY]: { 'auth flow': ['src/auth.js'], 'API layer': ['src/api.js'] },
    });
    deletePreset(storage, 'auth flow');
    const presets = getAllPresets(storage);
    assert.equal('auth flow' in presets, false);
    assert.deepEqual(presets['API layer'], ['src/api.js']);
  });

  it('does not throw when deleting a non-existent preset', () => {
    const storage = makeStorage();
    assert.doesNotThrow(() => deletePreset(storage, 'nonexistent'));
  });

  it('leaves storage empty after deleting the last preset', () => {
    const storage = makeStorage({
      [PRESETS_STORAGE_KEY]: { only: ['src/x.js'] },
    });
    deletePreset(storage, 'only');
    assert.deepEqual(getAllPresets(storage), {});
  });
});

describe('derivePresetNameSuggestion', () => {
  it('returns the common top-level directory when all files share one', () => {
    const paths = ['src/auth/middleware.js', 'src/auth/routes.js'];
    assert.equal(derivePresetNameSuggestion(paths), 'src');
  });

  it('returns empty string when files span multiple top-level directories', () => {
    const paths = ['src/auth.js', 'test/auth.test.js'];
    assert.equal(derivePresetNameSuggestion(paths), '');
  });

  it('returns empty string for a file at the root level (no subdirectory)', () => {
    assert.equal(derivePresetNameSuggestion(['index.js']), '');
  });

  it('returns the directory name for a single file in a subdirectory', () => {
    assert.equal(derivePresetNameSuggestion(['src/index.js']), 'src');
  });

  it('returns empty string when array is empty', () => {
    assert.equal(derivePresetNameSuggestion([]), '');
  });

  it('handles Windows-style backslash paths', () => {
    const paths = ['src\\auth\\middleware.js', 'src\\auth\\routes.js'];
    assert.equal(derivePresetNameSuggestion(paths), 'src');
  });

  it('returns empty string when first file is at root and second is in a subdirectory', () => {
    const paths = ['index.js', 'src/utils.js'];
    assert.equal(derivePresetNameSuggestion(paths), '');
  });

  it('handles deeper nesting and still returns the top-level directory', () => {
    const paths = ['src/api/v1/routes.js', 'src/api/v1/controllers.js', 'src/api/v2/routes.js'];
    assert.equal(derivePresetNameSuggestion(paths), 'src');
  });
});
