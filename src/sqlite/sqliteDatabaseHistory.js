'use strict';

const DATABASE_HISTORY_STORAGE_KEY = 'token-budget-builder.sqliteDatabaseHistory';
const MAX_RECENT_DATABASES = 10;

function getRecentDatabases(storage) {
  return storage.get(DATABASE_HISTORY_STORAGE_KEY, []);
}

function addRecentDatabase(storage, fsPath) {
  const existing = getRecentDatabases(storage);
  const updated = [fsPath, ...existing.filter((entry) => entry !== fsPath)].slice(0, MAX_RECENT_DATABASES);
  storage.update(DATABASE_HISTORY_STORAGE_KEY, updated);
}

function removeRecentDatabase(storage, fsPath) {
  const existing = getRecentDatabases(storage);
  storage.update(DATABASE_HISTORY_STORAGE_KEY, existing.filter((entry) => entry !== fsPath));
}

function clearRecentDatabases(storage) {
  storage.update(DATABASE_HISTORY_STORAGE_KEY, []);
}

module.exports = {
  DATABASE_HISTORY_STORAGE_KEY,
  MAX_RECENT_DATABASES,
  getRecentDatabases,
  addRecentDatabase,
  removeRecentDatabase,
  clearRecentDatabases,
};
