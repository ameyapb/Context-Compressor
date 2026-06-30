'use strict';

const assert = require('node:assert/strict');
const {
  DATABASE_HISTORY_STORAGE_KEY,
  MAX_RECENT_DATABASES,
  getRecentDatabases,
  addRecentDatabase,
  removeRecentDatabase,
  clearRecentDatabases,
} = require('../../src/sqlite/sqliteDatabaseHistory');

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

describe('getRecentDatabases', () => {
  it('returns an empty array when nothing stored', () => {
    const storage = makeStorage();
    assert.deepEqual(getRecentDatabases(storage), []);
  });

  it('returns stored paths', () => {
    const storage = makeStorage({ [DATABASE_HISTORY_STORAGE_KEY]: ['/a/db.sqlite', '/b/db.sqlite'] });
    assert.deepEqual(getRecentDatabases(storage), ['/a/db.sqlite', '/b/db.sqlite']);
  });
});

describe('addRecentDatabase', () => {
  it('adds a new path to the front', () => {
    const storage = makeStorage();
    addRecentDatabase(storage, '/a/db.sqlite');
    assert.deepEqual(getRecentDatabases(storage), ['/a/db.sqlite']);
  });

  it('moves an existing path to the front instead of duplicating it', () => {
    const storage = makeStorage({
      [DATABASE_HISTORY_STORAGE_KEY]: ['/a/db.sqlite', '/b/db.sqlite', '/c/db.sqlite'],
    });
    addRecentDatabase(storage, '/b/db.sqlite');
    assert.deepEqual(getRecentDatabases(storage), ['/b/db.sqlite', '/a/db.sqlite', '/c/db.sqlite']);
  });

  it('caps the list at MAX_RECENT_DATABASES, dropping the oldest entries', () => {
    const storage = makeStorage();
    for (let i = 0; i < MAX_RECENT_DATABASES + 3; i++) {
      addRecentDatabase(storage, `/db-${i}.sqlite`);
    }
    const recent = getRecentDatabases(storage);
    assert.equal(recent.length, MAX_RECENT_DATABASES);
    assert.equal(recent[0], `/db-${MAX_RECENT_DATABASES + 2}.sqlite`);
    assert.ok(!recent.includes('/db-0.sqlite'));
    assert.ok(!recent.includes('/db-1.sqlite'));
    assert.ok(!recent.includes('/db-2.sqlite'));
  });
});

describe('removeRecentDatabase', () => {
  it('removes the given path', () => {
    const storage = makeStorage({
      [DATABASE_HISTORY_STORAGE_KEY]: ['/a/db.sqlite', '/b/db.sqlite'],
    });
    removeRecentDatabase(storage, '/a/db.sqlite');
    assert.deepEqual(getRecentDatabases(storage), ['/b/db.sqlite']);
  });

  it('does not throw when removing a non-existent path', () => {
    const storage = makeStorage();
    assert.doesNotThrow(() => removeRecentDatabase(storage, '/missing.sqlite'));
  });

  it('leaves storage empty after removing the last entry', () => {
    const storage = makeStorage({ [DATABASE_HISTORY_STORAGE_KEY]: ['/a/db.sqlite'] });
    removeRecentDatabase(storage, '/a/db.sqlite');
    assert.deepEqual(getRecentDatabases(storage), []);
  });
});

describe('clearRecentDatabases', () => {
  it('empties the list', () => {
    const storage = makeStorage({
      [DATABASE_HISTORY_STORAGE_KEY]: ['/a/db.sqlite', '/b/db.sqlite'],
    });
    clearRecentDatabases(storage);
    assert.deepEqual(getRecentDatabases(storage), []);
  });

  it('does not throw when already empty', () => {
    const storage = makeStorage();
    assert.doesNotThrow(() => clearRecentDatabases(storage));
  });
});
