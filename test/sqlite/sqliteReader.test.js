'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const {
  openDatabase,
  listTables,
  getTableSchema,
  getRows,
  closeDatabase,
  InvalidSqliteDatabaseError,
  INVALID_SQLITE_DATABASE_ERROR,
} = require('../../src/sqlite/sqliteReader');

let SQL = null;

async function getSql() {
  if (!SQL) {
    const initSqlJs = require('sql.js');
    SQL = await initSqlJs({
      locateFile: (file) => path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file),
    });
  }
  return SQL;
}

function buildInMemoryDb(setupSql) {
  const db = new SQL.Database();
  db.run(setupSql);
  return db;
}

function dbToBytes(db) {
  return db.export();
}

before(async function() {
  this.timeout(10000);
  await getSql();
});

describe('openDatabase', function() {
  it('opens a valid SQLite database from bytes', async function() {
    const inMem = buildInMemoryDb('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    const bytes = dbToBytes(inMem);
    inMem.close();
    const db = await openDatabase(bytes);
    assert.ok(db);
    closeDatabase(db);
  });

  it('throws InvalidSqliteDatabaseError for invalid bytes', async function() {
    const badBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    await assert.rejects(
      () => openDatabase(badBytes),
      (err) => {
        assert.ok(err instanceof InvalidSqliteDatabaseError);
        assert.equal(err.code, INVALID_SQLITE_DATABASE_ERROR);
        return true;
      }
    );
  });
});

describe('listTables', function() {
  let db;

  before(async function() {
    const inMem = buildInMemoryDb(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO users VALUES (1, 'Alice');
      INSERT INTO users VALUES (2, 'Bob');
      CREATE TABLE products (id INTEGER PRIMARY KEY, label TEXT);
    `);
    const bytes = dbToBytes(inMem);
    inMem.close();
    db = await openDatabase(bytes);
  });

  after(function() { closeDatabase(db); });

  it('returns the correct table names', function() {
    const tables = listTables(db, { fastMode: true });
    const names = tables.map(t => t.name).sort();
    assert.deepEqual(names, ['products', 'users']);
  });

  it('returns rowCount: null in fastMode', function() {
    const tables = listTables(db, { fastMode: true });
    assert.ok(tables.every(t => t.rowCount === null));
  });

  it('returns correct row counts when fastMode is false', function() {
    const tables = listTables(db, { fastMode: false });
    const userTable = tables.find(t => t.name === 'users');
    const productTable = tables.find(t => t.name === 'products');
    assert.equal(userTable.rowCount, 2);
    assert.equal(productTable.rowCount, 0);
  });

  it('does not include sqlite_ internal tables', function() {
    const tables = listTables(db, { fastMode: true });
    assert.ok(tables.every(t => !t.name.startsWith('sqlite_')));
  });
});

describe('getTableSchema', function() {
  let db;

  before(async function() {
    const inMem = buildInMemoryDb(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL,
        data BLOB
      );
    `);
    const bytes = dbToBytes(inMem);
    inMem.close();
    db = await openDatabase(bytes);
  });

  after(function() { closeDatabase(db); });

  it('returns the correct column names', function() {
    const schema = getTableSchema(db, 'items');
    const names = schema.map(c => c.name);
    assert.deepEqual(names, ['id', 'name', 'price', 'data']);
  });

  it('returns the correct normalized types', function() {
    const schema = getTableSchema(db, 'items');
    assert.equal(schema.find(c => c.name === 'id').type, 'INT');
    assert.equal(schema.find(c => c.name === 'name').type, 'TEXT');
    assert.equal(schema.find(c => c.name === 'price').type, 'REAL');
    assert.equal(schema.find(c => c.name === 'data').type, 'BLOB');
  });

  it('reports NOT NULL constraint correctly', function() {
    const schema = getTableSchema(db, 'items');
    assert.equal(schema.find(c => c.name === 'name').notnull, true);
    assert.equal(schema.find(c => c.name === 'price').notnull, false);
  });

  it('reports primary key correctly', function() {
    const schema = getTableSchema(db, 'items');
    assert.equal(schema.find(c => c.name === 'id').pk, true);
    assert.equal(schema.find(c => c.name === 'name').pk, false);
  });
});

describe('getRows — basic pagination', function() {
  let db;

  before(async function() {
    const rows = Array.from({ length: 70 }, (_, i) => `(${i + 1}, 'name${i + 1}')`).join(', ');
    const inMem = buildInMemoryDb(
      `CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO people VALUES ${rows};`
    );
    const bytes = dbToBytes(inMem);
    inMem.close();
    db = await openDatabase(bytes);
  });

  after(function() { closeDatabase(db); });

  it('returns first 50 rows with no query options', function() {
    const result = getRows(db, 'people', {});
    assert.equal(result.rows.length, 50);
  });

  it('returns correct totalRows', function() {
    const result = getRows(db, 'people', {});
    assert.equal(result.totalRows, 70);
  });

  it('returns the correct rows on page 1', function() {
    const result = getRows(db, 'people', { page: 1 });
    assert.equal(result.rows.length, 20);
    assert.equal(result.rows[0][0], 51);
  });
});

describe('getRows — global search', function() {
  let db;

  before(async function() {
    const inMem = buildInMemoryDb(`
      CREATE TABLE logs (id INTEGER, message TEXT);
      INSERT INTO logs VALUES (1, 'Error connecting to database');
      INSERT INTO logs VALUES (2, 'User logged in');
      INSERT INTO logs VALUES (3, 'ERROR: timeout exceeded');
    `);
    const bytes = dbToBytes(inMem);
    inMem.close();
    db = await openDatabase(bytes);
  });

  after(function() { closeDatabase(db); });

  it('filters rows by substring across text columns, case-insensitively', function() {
    const result = getRows(db, 'logs', { search: 'error' });
    assert.equal(result.rows.length, 2);
  });

  it('updates totalRows to reflect filtered count', function() {
    const result = getRows(db, 'logs', { search: 'error' });
    assert.equal(result.totalRows, 2);
  });
});

describe('getRows — column filters', function() {
  let db;

  before(async function() {
    const inMem = buildInMemoryDb(`
      CREATE TABLE scores (id INTEGER, player TEXT, score INTEGER);
      INSERT INTO scores VALUES (1, 'Alice', 30);
      INSERT INTO scores VALUES (2, 'Bob', 50);
      INSERT INTO scores VALUES (3, 'Carol', 70);
      INSERT INTO scores VALUES (4, 'Dave', 50);
    `);
    const bytes = dbToBytes(inMem);
    inMem.close();
    db = await openDatabase(bytes);
  });

  after(function() { closeDatabase(db); });

  it('eq filter returns only matching rows', function() {
    const result = getRows(db, 'scores', { columnFilters: [{ column: 'score', op: 'eq', value: 50 }] });
    assert.equal(result.rows.length, 2);
    assert.ok(result.rows.every(r => r[2] === 50));
  });

  it('gt filter returns only rows greater than value', function() {
    const result = getRows(db, 'scores', { columnFilters: [{ column: 'score', op: 'gt', value: 40 }] });
    assert.equal(result.rows.length, 3);
    assert.ok(result.rows.every(r => r[2] > 40));
  });

  it('lt filter returns only rows less than value', function() {
    const result = getRows(db, 'scores', { columnFilters: [{ column: 'score', op: 'lt', value: 50 }] });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0][2], 30);
  });

  it('contains filter matches substring in text columns', function() {
    const result = getRows(db, 'scores', { columnFilters: [{ column: 'player', op: 'contains', value: 'li' }] });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0][1], 'Alice');
  });
});

describe('getRows — sorting', function() {
  let db;

  before(async function() {
    const inMem = buildInMemoryDb(`
      CREATE TABLE nums (val INTEGER);
      INSERT INTO nums VALUES (30);
      INSERT INTO nums VALUES (10);
      INSERT INTO nums VALUES (20);
    `);
    const bytes = dbToBytes(inMem);
    inMem.close();
    db = await openDatabase(bytes);
  });

  after(function() { closeDatabase(db); });

  it('sorts ascending', function() {
    const result = getRows(db, 'nums', { sort: { column: 'val', dir: 'asc' } });
    const vals = result.rows.map(r => r[0]);
    assert.deepEqual(vals, [10, 20, 30]);
  });

  it('sorts descending', function() {
    const result = getRows(db, 'nums', { sort: { column: 'val', dir: 'desc' } });
    const vals = result.rows.map(r => r[0]);
    assert.deepEqual(vals, [30, 20, 10]);
  });
});

describe('getRows — SQL injection guards', function() {
  let db;

  before(async function() {
    const inMem = buildInMemoryDb(`
      CREATE TABLE safe (id INTEGER, val TEXT);
      INSERT INTO safe VALUES (1, 'ok');
    `);
    const bytes = dbToBytes(inMem);
    inMem.close();
    db = await openDatabase(bytes);
  });

  after(function() { closeDatabase(db); });

  it('throws for an unrecognized table name', function() {
    assert.throws(
      () => getRows(db, 'DROP TABLE safe; --', {}),
      /Unknown table/
    );
  });

  it('throws for an unrecognized column in columnFilters', function() {
    assert.throws(
      () => getRows(db, 'safe', { columnFilters: [{ column: 'notacolumn', op: 'eq', value: 1 }] }),
      /Unknown column/
    );
  });

  it('throws for an unrecognized column in sort', function() {
    assert.throws(
      () => getRows(db, 'safe', { sort: { column: 'notacolumn', dir: 'asc' } }),
      /Unknown column/
    );
  });
});

describe('getRows — null and BLOB values', function() {
  let db;

  before(async function() {
    const inMem = buildInMemoryDb(`
      CREATE TABLE mixed (id INTEGER, name TEXT, photo BLOB);
      INSERT INTO mixed VALUES (1, NULL, X'DEADBEEF');
      INSERT INTO mixed VALUES (2, 'Bob', NULL);
    `);
    const bytes = dbToBytes(inMem);
    inMem.close();
    db = await openDatabase(bytes);
  });

  after(function() { closeDatabase(db); });

  it('returns SQL NULL as JS null', function() {
    const result = getRows(db, 'mixed', {});
    const row1 = result.rows[0];
    assert.equal(row1[1], null);
    const row2 = result.rows[1];
    assert.equal(row2[2], null);
  });

  it('returns BLOB columns as { __type: "blob", size: N } without raw bytes', function() {
    const result = getRows(db, 'mixed', {});
    const blobCell = result.rows[0][2];
    assert.ok(blobCell && typeof blobCell === 'object');
    assert.equal(blobCell.__type, 'blob');
    assert.equal(blobCell.size, 4);
    assert.ok(!('data' in blobCell));
    assert.ok(!('bytes' in blobCell));
  });
});
