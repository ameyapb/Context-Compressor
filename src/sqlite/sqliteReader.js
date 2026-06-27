'use strict';

const path = require('path');

let _SQL = null;

async function ensureSqlInitialized() {
  if (!_SQL) {
    const initSqlJs = require('sql.js');
    _SQL = await initSqlJs({
      locateFile: (file) => path.join(__dirname, '../..', 'node_modules', 'sql.js', 'dist', file),
    });
  }
  return _SQL;
}

const INVALID_SQLITE_DATABASE_ERROR = 'INVALID_SQLITE_DATABASE';

class InvalidSqliteDatabaseError extends Error {
  constructor(filePath) {
    super(`Not a valid SQLite database: ${filePath}`);
    this.code = INVALID_SQLITE_DATABASE_ERROR;
  }
}

async function openDatabase(fileBytes) {
  const SQL = await ensureSqlInitialized();
  let db;
  try {
    db = new SQL.Database(fileBytes);
  } catch (err) {
    throw new InvalidSqliteDatabaseError(String(err));
  }
  try {
    db.exec('SELECT name FROM sqlite_master LIMIT 1');
  } catch (err) {
    db.close();
    throw new InvalidSqliteDatabaseError(String(err));
  }
  return db;
}

function listTables(db, options) {
  const fastMode = options && options.fastMode === true;
  const stmt = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  const tableNames = [];
  while (stmt.step()) {
    tableNames.push(stmt.getAsObject().name);
  }
  stmt.free();

  return tableNames.map((name) => {
    let rowCount = null;
    if (!fastMode) {
      const countStmt = db.prepare(`SELECT COUNT(*) AS c FROM "${escapeSqlIdentifier(name)}"`);
      countStmt.step();
      rowCount = countStmt.getAsObject().c;
      countStmt.free();
    }
    return { name, rowCount };
  });
}

function getTableSchema(db, tableName) {
  const knownTables = listTables(db, { fastMode: true }).map((t) => t.name);
  validateTableName(tableName, knownTables);
  const stmt = db.prepare(`PRAGMA table_info("${escapeSqlIdentifier(tableName)}")`);
  const columns = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    columns.push({
      name: row.name,
      type: normalizeColumnType(row.type),
      notnull: row.notnull === 1 || row.notnull === true,
      pk: row.pk === 1 || row.pk === true,
    });
  }
  stmt.free();
  return columns;
}

const PAGE_SIZE = 50;

function getRows(db, tableName, query) {
  const knownTables = listTables(db, { fastMode: true }).map((t) => t.name);
  validateTableName(tableName, knownTables);

  const schema = getTableSchema(db, tableName);
  const columnNames = schema.map((c) => c.name);
  const blobColumnNames = new Set(
    schema.filter((c) => c.type === 'BLOB').map((c) => c.name)
  );

  const {
    search = '',
    columnFilters = [],
    sort = null,
    page = 0,
    pageSize = PAGE_SIZE,
  } = query || {};

  for (const filter of columnFilters) {
    validateColumnName(filter.column, columnNames);
  }
  if (sort && sort.column) {
    validateColumnName(sort.column, columnNames);
  }

  const whereClauses = [];
  const params = [];

  if (search && search.trim()) {
    const searchableColumns = schema.filter((c) => c.type !== 'BLOB');
    if (searchableColumns.length > 0) {
      const searchClause = searchableColumns
        .map((c) => `CAST("${escapeSqlIdentifier(c.name)}" AS TEXT) LIKE ?`)
        .join(' OR ');
      whereClauses.push(`(${searchClause})`);
      const likeValue = `%${search.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
      for (let i = 0; i < searchableColumns.length; i++) {
        params.push(likeValue);
      }
    }
  }

  for (const filter of columnFilters) {
    const quotedCol = `"${escapeSqlIdentifier(filter.column)}"`;
    if (filter.op === 'eq') {
      whereClauses.push(`${quotedCol} = ?`);
      params.push(filter.value);
    } else if (filter.op === 'gt') {
      whereClauses.push(`${quotedCol} > ?`);
      params.push(filter.value);
    } else if (filter.op === 'lt') {
      whereClauses.push(`${quotedCol} < ?`);
      params.push(filter.value);
    } else if (filter.op === 'contains') {
      whereClauses.push(`CAST(${quotedCol} AS TEXT) LIKE ?`);
      const likeValue = `%${String(filter.value).replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
      params.push(likeValue);
    }
  }

  const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countSQL = `SELECT COUNT(*) AS total FROM "${escapeSqlIdentifier(tableName)}" ${whereSQL}`;
  const countStmt = db.prepare(countSQL);
  countStmt.bind(params);
  countStmt.step();
  const totalRows = countStmt.getAsObject().total;
  countStmt.free();

  let orderSQL = '';
  if (sort && sort.column) {
    const dir = sort.dir === 'desc' ? 'DESC' : 'ASC';
    orderSQL = `ORDER BY "${escapeSqlIdentifier(sort.column)}" ${dir}`;
  }

  const offset = page * pageSize;
  const dataSQL = `SELECT * FROM "${escapeSqlIdentifier(tableName)}" ${whereSQL} ${orderSQL} LIMIT ? OFFSET ?`;
  const dataParams = [...params, pageSize, offset];
  const dataStmt = db.prepare(dataSQL);
  dataStmt.bind(dataParams);

  const rows = [];
  while (dataStmt.step()) {
    const rawRow = dataStmt.getAsObject();
    const row = columnNames.map((colName) => {
      const val = rawRow[colName];
      if (val === null || val === undefined) return null;
      if (blobColumnNames.has(colName)) {
        const size = val instanceof Uint8Array ? val.byteLength : 0;
        return { __type: 'blob', size };
      }
      return val;
    });
    rows.push(row);
  }
  dataStmt.free();

  return { rows, totalRows };
}

function closeDatabase(db) {
  db.close();
}

function validateTableName(tableName, knownTables) {
  if (!knownTables.includes(tableName)) {
    throw new Error(`Unknown table: "${tableName}"`);
  }
}

function validateColumnName(columnName, knownColumns) {
  if (!knownColumns.includes(columnName)) {
    throw new Error(`Unknown column: "${columnName}"`);
  }
}

function escapeSqlIdentifier(name) {
  return name.replace(/"/g, '""');
}

const SQLITE_TYPE_MAP = {
  INTEGER: 'INT',
  INT: 'INT',
  TINYINT: 'INT',
  SMALLINT: 'INT',
  MEDIUMINT: 'INT',
  BIGINT: 'INT',
  INT2: 'INT',
  INT8: 'INT',
  REAL: 'REAL',
  DOUBLE: 'REAL',
  FLOAT: 'REAL',
  NUMERIC: 'NUM',
  DECIMAL: 'NUM',
  BOOLEAN: 'NUM',
  DATE: 'NUM',
  DATETIME: 'NUM',
  BLOB: 'BLOB',
  TEXT: 'TEXT',
  CLOB: 'TEXT',
  CHARACTER: 'TEXT',
  VARCHAR: 'TEXT',
  NCHAR: 'TEXT',
  NVARCHAR: 'TEXT',
};

function normalizeColumnType(rawType) {
  if (!rawType) return 'TEXT';
  const upper = rawType.toUpperCase().trim();
  for (const [prefix, normalized] of Object.entries(SQLITE_TYPE_MAP)) {
    if (upper === prefix || upper.startsWith(prefix + '(') || upper.startsWith(prefix + ' ')) {
      return normalized;
    }
  }
  if (upper.includes('INT')) return 'INT';
  if (upper.includes('CHAR') || upper.includes('TEXT') || upper.includes('CLOB')) return 'TEXT';
  if (upper.includes('BLOB')) return 'BLOB';
  if (upper.includes('REAL') || upper.includes('FLOA') || upper.includes('DOUB')) return 'REAL';
  return 'NUM';
}

module.exports = {
  openDatabase,
  listTables,
  getTableSchema,
  getRows,
  closeDatabase,
  InvalidSqliteDatabaseError,
  INVALID_SQLITE_DATABASE_ERROR,
};
