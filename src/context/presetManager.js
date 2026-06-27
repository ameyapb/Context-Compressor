'use strict';

const PRESETS_STORAGE_KEY = 'token-budget-builder.presets';

function getAllPresets(storage) {
  return storage.get(PRESETS_STORAGE_KEY, {});
}

function savePreset(storage, name, relativePaths) {
  const existing = getAllPresets(storage);
  storage.update(PRESETS_STORAGE_KEY, { ...existing, [name]: relativePaths });
}

function deletePreset(storage, name) {
  const existing = getAllPresets(storage);
  const updated = { ...existing };
  delete updated[name];
  storage.update(PRESETS_STORAGE_KEY, updated);
}

function derivePresetNameSuggestion(relativePaths) {
  if (relativePaths.length === 0) return '';
  const dirs = relativePaths.map((p) => {
    const parts = p.replace(/\\/g, '/').split('/');
    return parts.length > 1 ? parts[0] : '';
  });
  const firstDir = dirs[0];
  if (!firstDir) return '';
  return dirs.every((d) => d === firstDir) ? firstDir : '';
}

module.exports = {
  PRESETS_STORAGE_KEY,
  getAllPresets,
  savePreset,
  deletePreset,
  derivePresetNameSuggestion,
};
