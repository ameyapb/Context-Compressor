'use strict';

const vscode = require('vscode');
const path = require('path');
const crypto = require('crypto');
const { openDatabase, listTables, getTableSchema, getRows, closeDatabase } = require('./sqliteReader');

const SQLITE_VIEWER_WEBVIEW_TYPE = 'sqliteViewer';
const openPanels = new Map();

async function openSqliteViewer(context, fileUri) {
  const filePath = fileUri.fsPath;
  const fileName = path.basename(filePath);

  const existing = openPanels.get(filePath);
  if (existing) {
    existing.reveal();
    return true;
  }

  let fileBytes;
  try {
    fileBytes = await vscode.workspace.fs.readFile(fileUri);
  } catch (err) {
    vscode.window.showErrorMessage(`Could not read ${fileName}: ${err.message}`);
    return false;
  }

  let db;
  try {
    db = await openDatabase(fileBytes);
  } catch (err) {
    vscode.window.showErrorMessage(
      `Could not open ${fileName}. The file is not a valid SQLite database.`
    );
    return false;
  }

  const tables = listTables(db, { fastMode: true });

  let defaultTable = null;
  let defaultSchema = [];
  let firstPageResult = { rows: [], totalRows: 0 };

  if (tables.length > 0) {
    defaultTable = tables[0].name;
    defaultSchema = getTableSchema(db, defaultTable);
    firstPageResult = getRows(db, defaultTable, {});
  }

  const panel = vscode.window.createWebviewPanel(
    SQLITE_VIEWER_WEBVIEW_TYPE,
    fileName,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [],
    }
  );

  openPanels.set(filePath, panel);

  panel.webview.html = buildSqliteViewerHtml(
    fileName,
    tables,
    defaultTable,
    defaultSchema,
    firstPageResult.rows,
    firstPageResult.totalRows
  );

  panel.webview.onDidReceiveMessage(
    async (message) => {
      if (message.type === 'query') {
        try {
          const schema = getTableSchema(db, message.tableName);
          const result = getRows(db, message.tableName, {
            search: message.search,
            columnFilters: message.columnFilters,
            sort: message.sort,
            page: message.page,
          });
          panel.webview.postMessage({
            type: 'tableData',
            activeTable: message.tableName,
            schema,
            rows: result.rows,
            totalRows: result.totalRows,
            filteredCount: result.rows.length,
            page: message.page,
          });
        } catch (err) {
          vscode.window.showErrorMessage(`SQLite query error: ${err.message}`);
        }
      } else if (message.type === 'selectTable') {
        try {
          const schema = getTableSchema(db, message.tableName);
          const result = getRows(db, message.tableName, { search: message.search });
          panel.webview.postMessage({
            type: 'tableData',
            activeTable: message.tableName,
            schema,
            rows: result.rows,
            totalRows: result.totalRows,
            filteredCount: result.rows.length,
            page: 0,
          });
        } catch (err) {
          vscode.window.showErrorMessage(`SQLite query error: ${err.message}`);
        }
      } else if (message.type === 'copyHex') {
        await vscode.env.clipboard.writeText(message.hex);
      } else if (message.type === 'copyText') {
        await vscode.env.clipboard.writeText(message.text);
      }
    },
    undefined,
    context.subscriptions
  );

  panel.onDidDispose(() => {
    openPanels.delete(filePath);
    closeDatabase(db);
  });

  if (tables.length > 0) {
    fillRowCountsAsync(db, tables, panel);
  }

  return true;
}

async function fillRowCountsAsync(db, tables, panel) {
  const counts = {};
  for (const table of tables) {
    try {
      const result = getRows(db, table.name, { pageSize: 0, page: 0 });
      counts[table.name] = result.totalRows;
      panel.webview.postMessage({ type: 'rowCounts', counts: { [table.name]: result.totalRows } });
    } catch (_) {}
  }
}

function generateNonce() {
  return crypto.randomBytes(24).toString('hex');
}

function buildSqliteViewerHtml(fileName, tables, activeTable, schema, rows, totalRows) {
  const nonce = generateNonce();
  const escapedFileName = escapeHtml(fileName);

  const tablesJson = JSON.stringify(tables);
  const activeTableJson = JSON.stringify(activeTable);
  const schemaJson = JSON.stringify(schema);
  const rowsJson = JSON.stringify(rows);
  const totalRowsJson = JSON.stringify(totalRows);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>${escapedFileName}</title>
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      overflow: hidden;
    }
    .header {
      padding: 8px 12px;
      font-weight: bold;
      font-size: 1.05em;
      border-bottom: 1px solid var(--vscode-panel-border, #454545);
      flex-shrink: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .main-layout {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .sidebar {
      width: 180px;
      min-width: 120px;
      max-width: 280px;
      flex-shrink: 0;
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      color: var(--vscode-sideBar-foreground, var(--vscode-editor-foreground));
      border-right: 1px solid var(--vscode-panel-border, #454545);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }
    .sidebar-label {
      padding: 6px 10px 4px;
      font-size: 0.78em;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 0.65;
      flex-shrink: 0;
    }
    .table-list {
      list-style: none;
      margin: 0;
      padding: 0;
      flex: 1;
    }
    .table-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 10px;
      cursor: pointer;
      user-select: none;
    }
    .table-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .table-item.active {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .table-item-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }
    .table-item-badge {
      font-size: 0.78em;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 8px;
      padding: 1px 6px;
      margin-left: 6px;
      flex-shrink: 0;
    }
    .content-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }
    .toolbar {
      padding: 6px 10px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      border-bottom: 1px solid var(--vscode-panel-border, #454545);
      flex-shrink: 0;
    }
    .search-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .search-input {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, #454545));
      padding: 4px 8px;
      font-family: inherit;
      font-size: inherit;
      outline: none;
    }
    .search-input:focus {
      border-color: var(--vscode-focusBorder);
    }
    .btn-clear-search {
      background: none;
      border: none;
      color: var(--vscode-editor-foreground);
      cursor: pointer;
      padding: 2px 6px;
      font-size: 1em;
      opacity: 0.7;
      line-height: 1;
    }
    .btn-clear-search:hover { opacity: 1; }
    .chips-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
    }
    .chips-row:empty { display: none; }
    .chip {
      display: inline-flex;
      align-items: center;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 10px;
      padding: 2px 8px;
      font-size: 0.82em;
      gap: 4px;
    }
    .chip-remove {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      padding: 0 0 0 2px;
      font-size: 0.9em;
      line-height: 1;
      opacity: 0.8;
    }
    .chip-remove:hover { opacity: 1; }
    .btn-clear-all {
      background: none;
      border: 1px solid var(--vscode-panel-border, #454545);
      color: var(--vscode-editor-foreground);
      cursor: pointer;
      padding: 2px 8px;
      font-size: 0.82em;
      border-radius: 10px;
      opacity: 0.8;
    }
    .btn-clear-all:hover { opacity: 1; }
    .grid-wrapper {
      flex: 1;
      overflow: auto;
      position: relative;
    }
    .loading-overlay {
      position: absolute;
      inset: 0;
      background: var(--vscode-editor-background);
      opacity: 0.7;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      pointer-events: none;
    }
    .loading-overlay.hidden { display: none; }
    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--vscode-editor-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .data-grid {
      border-collapse: collapse;
      width: 100%;
      min-width: max-content;
    }
    .data-grid th {
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      position: sticky;
      top: 0;
      z-index: 2;
      text-align: left;
      padding: 6px 10px;
      border-bottom: 2px solid var(--vscode-panel-border, #454545);
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
    }
    .data-grid th:hover { background: var(--vscode-list-hoverBackground); }
    .col-type-badge {
      font-size: 0.72em;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 4px;
      padding: 1px 4px;
      margin-left: 5px;
      vertical-align: middle;
    }
    .col-type-badge[data-type="INT"],
    .col-type-badge[data-type="INTEGER"] { background: #1e3a5f; color: #6cb6ff; }
    .col-type-badge[data-type="TEXT"]    { background: #2d1f3d; color: #c586c0; }
    .col-type-badge[data-type="REAL"],
    .col-type-badge[data-type="NUMERIC"] { background: #1a3020; color: #4ec994; }
    .col-type-badge[data-type="BLOB"]    { background: #3d2400; color: #ce9178; }
    .sort-indicator {
      margin-left: 4px;
      font-size: 0.85em;
    }
    .filter-icon {
      margin-left: 4px;
      opacity: 0;
      font-size: 0.8em;
      cursor: pointer;
    }
    .data-grid th:hover .filter-icon { opacity: 0.7; }
    .filter-icon:hover { opacity: 1 !important; }
    .data-grid td {
      padding: 5px 10px;
      border-bottom: 1px solid var(--vscode-panel-border, #454545);
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }
    .data-grid tr:hover td { background: var(--vscode-list-hoverBackground); }
    .data-grid tr.selected td { background: var(--vscode-list-inactiveSelectionBackground); }
    .data-grid tr:focus { outline: 1px solid var(--vscode-focusBorder); }
    .null-value {
      font-style: italic;
      color: var(--vscode-descriptionForeground);
    }
    .blob-value {
      font-style: italic;
      color: var(--vscode-descriptionForeground);
    }
    .empty-state {
      padding: 40px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }
    .empty-state a {
      color: var(--vscode-textLink-foreground, #6cb6ff);
      cursor: pointer;
      text-decoration: underline;
    }
    .pagination-bar {
      padding: 6px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid var(--vscode-panel-border, #454545);
      flex-shrink: 0;
      gap: 8px;
    }
    .pagination-label {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }
    .pagination-buttons {
      display: flex;
      gap: 6px;
    }
    .btn-page {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      cursor: pointer;
      padding: 3px 10px;
      font-size: 0.85em;
      font-family: inherit;
    }
    .btn-page:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
    .btn-page:disabled { opacity: 0.4; cursor: default; }
    .detail-drawer {
      position: fixed;
      left: 180px;
      right: 0;
      bottom: 0;
      height: 35%;
      background: var(--vscode-editorHoverWidget-background, var(--vscode-editorWidget-background, var(--vscode-editor-background)));
      border-top: 2px solid var(--vscode-panel-border, #454545);
      z-index: 20;
      display: flex;
      flex-direction: column;
      transform: translateY(100%);
      transition: transform 150ms ease;
    }
    .detail-drawer.open { transform: translateY(0); }
    .drawer-resize-handle {
      height: 5px;
      cursor: ns-resize;
      flex-shrink: 0;
      background: transparent;
    }
    .drawer-resize-handle:hover { background: var(--vscode-focusBorder); }
    .drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 12px;
      border-bottom: 1px solid var(--vscode-panel-border, #454545);
      flex-shrink: 0;
    }
    .drawer-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .btn-drawer-action {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      cursor: pointer;
      padding: 3px 10px;
      font-size: 0.82em;
      font-family: inherit;
    }
    .btn-drawer-action:hover { background: var(--vscode-button-hoverBackground); }
    .btn-close-drawer {
      background: none;
      border: none;
      color: var(--vscode-editor-foreground);
      cursor: pointer;
      font-size: 1.1em;
      padding: 0 4px;
      opacity: 0.7;
      line-height: 1;
    }
    .btn-close-drawer:hover { opacity: 1; }
    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 6px 12px;
    }
    .drawer-fields {
      display: flex;
      flex-direction: column;
    }
    .drawer-field-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 4px 4px 4px 8px;
      border-bottom: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.06));
    }
    .drawer-field-row:hover { background: var(--vscode-list-hoverBackground); }
    .drawer-kv-key {
      flex-shrink: 0;
      width: 130px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-top: 2px;
    }
    .drawer-kv-value {
      flex: 1;
      min-width: 0;
      word-break: break-word;
      white-space: pre-wrap;
      padding-top: 2px;
    }
    .filter-dropdown {
      position: absolute;
      background: var(--vscode-editorHoverWidget-background, var(--vscode-editorWidget-background, var(--vscode-editor-background)));
      border: 1px solid var(--vscode-panel-border, #454545);
      z-index: 30;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 180px;
      box-shadow: 0 3px 8px rgba(0,0,0,0.3);
    }
    .filter-dropdown.hidden { display: none; }
    .filter-dropdown select,
    .filter-dropdown input {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, #454545));
      padding: 3px 6px;
      font-family: inherit;
      font-size: inherit;
      outline: none;
      width: 100%;
    }
    .filter-dropdown select:focus,
    .filter-dropdown input:focus {
      border-color: var(--vscode-focusBorder);
    }
    .filter-dropdown-buttons {
      display: flex;
      gap: 5px;
      justify-content: flex-end;
    }
    .btn-filter-apply, .btn-filter-cancel {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      cursor: pointer;
      padding: 3px 9px;
      font-size: 0.82em;
      font-family: inherit;
    }
    .btn-filter-apply:hover { background: var(--vscode-button-hoverBackground); }
    .btn-filter-cancel {
      background: none;
      color: var(--vscode-editor-foreground);
      border: 1px solid var(--vscode-panel-border, #454545);
    }
    .btn-filter-cancel:hover { background: var(--vscode-list-hoverBackground); }
    .blob-disabled-note {
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
    }
    .drawer-kv-actions {
      display: flex;
      gap: 4px;
      align-items: flex-start;
      flex-shrink: 0;
      padding-top: 2px;
      opacity: 0;
      transition: opacity 0.1s;
    }
    .drawer-field-row:hover .drawer-kv-actions { opacity: 1; }
    .btn-copy-cell {
      background: none;
      border: 1px solid var(--vscode-panel-border, #454545);
      color: var(--vscode-editor-foreground);
      cursor: pointer;
      padding: 1px 7px;
      font-size: 0.78em;
      font-family: inherit;
      white-space: nowrap;
    }
    .btn-copy-cell:hover { background: var(--vscode-list-hoverBackground); }
    .data-grid tbody tr:nth-child(even) td { background: rgba(255,255,255,0.025); }
    .data-grid tr.selected td { background: var(--vscode-list-inactiveSelectionBackground) !important; }
    .drawer-json-tree { width: 100%; padding: 2px 0; }
    .drawer-json-row { display: flex; gap: 8px; padding: 2px 0; align-items: flex-start; }
    .drawer-json-key {
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      min-width: 90px;
      flex-shrink: 0;
      padding-top: 1px;
    }
    .drawer-json-value { flex: 1; word-break: break-word; min-width: 0; }
    .cell-content-badge {
      display: inline-block;
      font-size: 0.72em;
      padding: 0 4px;
      border-radius: 2px;
      margin-left: 5px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      vertical-align: middle;
      opacity: 0.8;
    }
    .cell-json-preview { color: var(--vscode-descriptionForeground); font-style: italic; }
    .html-preview {
      margin-top: 6px;
      padding: 8px 10px;
      border-left: 3px solid var(--vscode-focusBorder, #007acc);
      background: var(--vscode-textBlockQuote-background, rgba(255,255,255,0.05));
      border-radius: 0 2px 2px 0;
      line-height: 1.5;
    }
    .html-preview.hidden { display: none; }
    .html-preview ul, .html-preview ol { margin: 4px 0; padding-left: 18px; }
    .html-preview p { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="header">${escapedFileName}</div>
  <div class="main-layout">
    <div class="sidebar">
      <div class="sidebar-label">Tables</div>
      <ul class="table-list" id="tableList" role="listbox" aria-label="Tables"></ul>
    </div>
    <div class="content-area">
      <div class="toolbar">
        <div class="search-row">
          <input class="search-input" id="searchInput" type="text" placeholder="Search all columns..." aria-label="Search all columns">
          <button class="btn-clear-search" id="btnClearSearch" aria-label="Clear search" title="Clear search">&#x2715;</button>
        </div>
        <div class="chips-row" id="chipsRow"></div>
      </div>
      <div class="grid-wrapper" id="gridWrapper">
        <div class="loading-overlay hidden" id="loadingOverlay" aria-hidden="true">
          <div class="spinner"></div>
        </div>
        <table class="data-grid" role="grid" id="dataGrid" aria-label="Data grid">
          <thead id="gridHead"></thead>
          <tbody id="gridBody"></tbody>
        </table>
        <div class="empty-state hidden" id="emptyState"></div>
      </div>
      <div class="pagination-bar" id="paginationBar">
        <span class="pagination-label" id="paginationLabel"></span>
        <div class="pagination-buttons">
          <button class="btn-page" id="btnPrev">Prev</button>
          <button class="btn-page" id="btnNext">Next</button>
        </div>
      </div>
    </div>
  </div>

  <div class="detail-drawer" id="detailDrawer" role="dialog" aria-label="Row detail">
    <div class="drawer-resize-handle" id="drawerResizeHandle"></div>
    <div class="drawer-header">
      <span id="drawerTitle">Row detail</span>
      <div class="drawer-actions">
        <button class="btn-drawer-action" id="btnCopyJson">Copy row as JSON</button>
        <button class="btn-close-drawer" id="btnCloseDrawer" aria-label="Close detail drawer">&#x2715;</button>
      </div>
    </div>
    <div class="drawer-body" id="drawerBody"></div>
  </div>

  <div class="filter-dropdown hidden" id="filterDropdown"></div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();

      const PAGE_SIZE = 50;

      let state = {
        tables: ${tablesJson},
        activeTable: ${activeTableJson},
        schema: ${schemaJson},
        rows: ${rowsJson},
        totalRows: ${totalRowsJson},
        page: 0,
        search: '',
        columnFilters: [],
        sort: null,
        selectedRowIndex: null,
        drawerOpen: false,
        drawerRow: null,
      };

      const elTableList = document.getElementById('tableList');
      const elGridHead = document.getElementById('gridHead');
      const elGridBody = document.getElementById('gridBody');
      const elEmptyState = document.getElementById('emptyState');
      const elLoadingOverlay = document.getElementById('loadingOverlay');
      const elSearchInput = document.getElementById('searchInput');
      const elBtnClearSearch = document.getElementById('btnClearSearch');
      const elChipsRow = document.getElementById('chipsRow');
      const elPaginationLabel = document.getElementById('paginationLabel');
      const elBtnPrev = document.getElementById('btnPrev');
      const elBtnNext = document.getElementById('btnNext');
      const elDetailDrawer = document.getElementById('detailDrawer');
      const elDrawerBody = document.getElementById('drawerBody');
      const elDrawerTitle = document.getElementById('drawerTitle');
      const elBtnCopyJson = document.getElementById('btnCopyJson');
      const elBtnCloseDrawer = document.getElementById('btnCloseDrawer');
      const elDrawerResizeHandle = document.getElementById('drawerResizeHandle');
      const elFilterDropdown = document.getElementById('filterDropdown');

      let searchDebounceTimer = null;
      let activeFilterColumnIndex = null;

      function renderSidebar() {
        elTableList.innerHTML = '';
        state.tables.forEach(function(table) {
          const li = document.createElement('li');
          li.className = 'table-item' + (table.name === state.activeTable ? ' active' : '');
          li.setAttribute('role', 'option');
          li.setAttribute('aria-selected', table.name === state.activeTable ? 'true' : 'false');
          li.tabIndex = 0;

          const nameSpan = document.createElement('span');
          nameSpan.className = 'table-item-name';
          nameSpan.textContent = table.name;

          const badge = document.createElement('span');
          badge.className = 'table-item-badge';
          badge.setAttribute('data-table', table.name);
          badge.textContent = table.rowCount === null ? '...' : String(table.rowCount);

          li.appendChild(nameSpan);
          li.appendChild(badge);

          li.addEventListener('click', function() { selectTable(table.name); });
          li.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') selectTable(table.name);
          });
          elTableList.appendChild(li);
        });
      }

      function renderGridHeader() {
        elGridHead.innerHTML = '';
        if (!state.schema || state.schema.length === 0) return;
        const tr = document.createElement('tr');
        state.schema.forEach(function(col, i) {
          const th = document.createElement('th');
          th.setAttribute('data-col-index', i);
          if (state.sort && state.sort.column === col.name) {
            th.setAttribute('aria-sort', state.sort.dir === 'asc' ? 'ascending' : 'descending');
          }

          const nameText = document.createTextNode(col.name);
          const typeBadge = document.createElement('span');
          typeBadge.className = 'col-type-badge';
          typeBadge.textContent = col.type;
          typeBadge.setAttribute('data-type', col.type.toUpperCase());

          const sortSpan = document.createElement('span');
          sortSpan.className = 'sort-indicator';
          if (state.sort && state.sort.column === col.name) {
            sortSpan.textContent = state.sort.dir === 'asc' ? '↑' : '↓';
          }

          const filterIcon = document.createElement('span');
          filterIcon.className = 'filter-icon';
          filterIcon.textContent = '▼';
          filterIcon.title = 'Filter this column';
          filterIcon.setAttribute('role', 'button');
          filterIcon.setAttribute('aria-label', 'Filter column ' + col.name);
          filterIcon.addEventListener('click', function(e) {
            e.stopPropagation();
            openFilterDropdown(i, th, col);
          });

          th.appendChild(nameText);
          th.appendChild(typeBadge);
          th.appendChild(sortSpan);
          th.appendChild(filterIcon);

          th.addEventListener('click', function() { toggleSort(col.name); });
          tr.appendChild(th);
        });
        elGridHead.appendChild(tr);
      }

      function renderGridBody() {
        elGridBody.innerHTML = '';
        const hasFilters = state.search || state.columnFilters.length > 0;

        if (state.rows.length === 0) {
          elEmptyState.classList.remove('hidden');
          document.getElementById('dataGrid').style.display = 'none';
          if (state.totalRows === 0) {
            elEmptyState.textContent = 'This table has no rows.';
          } else {
            elEmptyState.innerHTML = 'No rows match the current filters. <a id="clearFiltersLink">Clear all filters</a>';
            const link = document.getElementById('clearFiltersLink');
            if (link) link.addEventListener('click', clearAllFilters);
          }
          return;
        }

        elEmptyState.classList.add('hidden');
        document.getElementById('dataGrid').style.display = '';

        state.rows.forEach(function(row, rowIndex) {
          const tr = document.createElement('tr');
          tr.setAttribute('role', 'row');
          tr.setAttribute('tabindex', '0');
          tr.setAttribute('data-row-index', rowIndex);
          if (rowIndex === state.selectedRowIndex) tr.classList.add('selected');

          row.forEach(function(cell, colIndex) {
            const td = document.createElement('td');
            td.setAttribute('role', 'gridcell');
            renderCell(td, cell, state.schema[colIndex]);
            tr.appendChild(td);
          });

          tr.addEventListener('click', function() { openDrawer(rowIndex); });
          tr.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { openDrawer(rowIndex); return; }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              const next = elGridBody.querySelector('[data-row-index="' + (rowIndex + 1) + '"]');
              if (next) next.focus();
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              const prev = elGridBody.querySelector('[data-row-index="' + (rowIndex - 1) + '"]');
              if (prev) prev.focus();
            }
          });
          elGridBody.appendChild(tr);
        });
      }

      function renderCell(td, cell, col) {
        if (cell === null) {
          const s = document.createElement('span');
          s.className = 'null-value';
          s.textContent = 'null';
          td.appendChild(s);
        } else if (cell && typeof cell === 'object' && cell.__type === 'blob') {
          const s = document.createElement('span');
          s.className = 'blob-value';
          s.textContent = '[blob \xb7 ' + formatBytes(cell.size) + ']';
          td.appendChild(s);
        } else {
          const text = String(cell);
          const parsed = tryParseJson(text);
          if (parsed !== null && typeof parsed === 'object') {
            const preview = document.createElement('span');
            preview.className = 'cell-json-preview';
            const keyCount = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
            preview.textContent = Array.isArray(parsed) ? '[' + keyCount + ' items]' : '{' + keyCount + ' keys}';
            td.appendChild(preview);
            const badge = document.createElement('span');
            badge.className = 'cell-content-badge';
            badge.textContent = 'JSON';
            td.appendChild(badge);
            td.title = text;
          } else if (containsHtmlTags(text)) {
            const truncated = text.length > 40 ? text.slice(0, 40) + '…' : text;
            td.appendChild(document.createTextNode(truncated));
            const badge = document.createElement('span');
            badge.className = 'cell-content-badge';
            badge.textContent = '</>';
            td.appendChild(badge);
            td.title = text;
          } else {
            td.textContent = text.length > 40 ? text.slice(0, 40) + '…' : text;
            td.title = text.length > 40 ? text : '';
          }
        }
      }

      function renderChips() {
        elChipsRow.innerHTML = '';
        if (state.columnFilters.length === 0) return;

        state.columnFilters.forEach(function(filter, i) {
          const chip = document.createElement('span');
          chip.className = 'chip';
          const opLabel = { eq: '=', gt: '>', lt: '<', contains: 'contains' }[filter.op] || filter.op;
          const text = filter.op === 'contains' || filter.op === 'eq'
            ? filter.column + ': ' + filter.value
            : filter.column + ' ' + opLabel + ' ' + filter.value;
          chip.appendChild(document.createTextNode(text + ' '));

          const removeBtn = document.createElement('button');
          removeBtn.className = 'chip-remove';
          removeBtn.textContent = '✕';
          removeBtn.setAttribute('aria-label', 'Remove filter: ' + text);
          removeBtn.addEventListener('click', function() {
            state.columnFilters.splice(i, 1);
            state.page = 0;
            renderChips();
            sendQuery();
          });
          chip.appendChild(removeBtn);
          elChipsRow.appendChild(chip);
        });

        const clearAllBtn = document.createElement('button');
        clearAllBtn.className = 'btn-clear-all';
        clearAllBtn.textContent = '\xd7 all';
        clearAllBtn.addEventListener('click', clearAllFilters);
        elChipsRow.appendChild(clearAllBtn);
      }

      function renderPagination() {
        const start = state.totalRows === 0 ? 0 : state.page * PAGE_SIZE + 1;
        const end = Math.min((state.page + 1) * PAGE_SIZE, state.page * PAGE_SIZE + state.rows.length);
        const hasFilters = state.search || state.columnFilters.length > 0;
        let label = 'Rows ' + start + '–' + end + ' of ' + state.totalRows;
        if (hasFilters && state.totalRows !== null) label += ' (filtered)';
        elPaginationLabel.textContent = label;
        elBtnPrev.disabled = state.page === 0;
        const lastPage = Math.max(0, Math.ceil(state.totalRows / PAGE_SIZE) - 1);
        elBtnNext.disabled = state.page >= lastPage || state.rows.length === 0;
      }

      function updateSidebarBadge(tableName, filteredCount, totalRows) {
        const badge = elTableList.querySelector('[data-table="' + CSS.escape(tableName) + '"]');
        if (!badge) return;
        const hasFilters = state.search || state.columnFilters.length > 0;
        if (hasFilters && tableName === state.activeTable) {
          badge.textContent = filteredCount + '/' + totalRows;
        } else {
          const tableEntry = state.tables.find(function(t) { return t.name === tableName; });
          if (tableEntry && tableEntry.rowCount !== null) {
            badge.textContent = String(tableEntry.rowCount);
          }
        }
      }

      function renderAll() {
        renderSidebar();
        renderGridHeader();
        renderGridBody();
        renderChips();
        renderPagination();
      }

      function selectTable(tableName) {
        if (tableName === state.activeTable) return;
        state.activeTable = tableName;
        state.columnFilters = [];
        state.sort = null;
        state.page = 0;
        state.selectedRowIndex = null;
        closeDrawer();
        showLoading();
        vscode.postMessage({ type: 'selectTable', tableName, search: state.search });
      }

      function toggleSort(colName) {
        if (state.sort && state.sort.column === colName) {
          if (state.sort.dir === 'asc') {
            state.sort = { column: colName, dir: 'desc' };
          } else {
            state.sort = null;
          }
        } else {
          state.sort = { column: colName, dir: 'asc' };
        }
        state.page = 0;
        sendQuery();
      }

      function clearAllFilters() {
        state.search = '';
        state.columnFilters = [];
        state.page = 0;
        elSearchInput.value = '';
        renderChips();
        sendQuery();
      }

      function sendQuery() {
        showLoading();
        vscode.postMessage({
          type: 'query',
          tableName: state.activeTable,
          search: state.search,
          columnFilters: state.columnFilters,
          sort: state.sort,
          page: state.page,
        });
      }

      function showLoading() {
        elLoadingOverlay.classList.remove('hidden');
      }

      function hideLoading() {
        elLoadingOverlay.classList.add('hidden');
      }

      function openDrawer(rowIndex) {
        state.selectedRowIndex = rowIndex;
        state.drawerRow = state.rows[rowIndex];
        state.drawerOpen = true;

        elDrawerTitle.textContent = 'Row ' + (rowIndex + 1) + ' of ' + state.rows.length;

        const row = state.drawerRow;
        const cols = state.schema;

        elDrawerBody.innerHTML = '';
        const fields = document.createElement('div');
        fields.className = 'drawer-fields';

        cols.forEach(function(col, i) {
          const fieldRow = document.createElement('div');
          fieldRow.className = 'drawer-field-row';

          const keyDiv = document.createElement('div');
          keyDiv.className = 'drawer-kv-key';
          keyDiv.textContent = col.name;
          keyDiv.title = col.name;

          const valDiv = document.createElement('div');
          valDiv.className = 'drawer-kv-value';

          const actionsDiv = document.createElement('div');
          actionsDiv.className = 'drawer-kv-actions';

          const cell = row[i];
          if (cell === null) {
            const s = document.createElement('span');
            s.className = 'null-value';
            s.textContent = 'null';
            valDiv.appendChild(s);
          } else if (cell && typeof cell === 'object' && cell.__type === 'blob') {
            const s = document.createElement('span');
            s.className = 'blob-value';
            s.textContent = '[binary data \xb7 ' + formatBytes(cell.size) + ']';
            valDiv.appendChild(s);
            if (cell.hex) {
              const copyHexBtn = document.createElement('button');
              copyHexBtn.className = 'btn-copy-cell';
              copyHexBtn.textContent = 'Copy hex';
              copyHexBtn.addEventListener('click', function() {
                vscode.postMessage({ type: 'copyHex', hex: cell.hex });
                flashButtonCopied(this);
              });
              actionsDiv.appendChild(copyHexBtn);
            }
          } else {
            const cellText = String(cell);

            const copyValueBtn = document.createElement('button');
            copyValueBtn.className = 'btn-copy-cell';
            copyValueBtn.textContent = 'Copy';
            copyValueBtn.addEventListener('click', function() { copyToClipboard(cellText, this); });
            actionsDiv.appendChild(copyValueBtn);

            const parsed = tryParseJson(cellText);
            if (parsed !== null && typeof parsed === 'object') {
              renderJsonTree(parsed, valDiv, actionsDiv);
              const copyPrettyBtn = document.createElement('button');
              copyPrettyBtn.className = 'btn-copy-cell';
              copyPrettyBtn.textContent = 'Copy pretty';
              copyPrettyBtn.addEventListener('click', function() {
                copyToClipboard(JSON.stringify(parsed, null, 2), this);
              });
              actionsDiv.appendChild(copyPrettyBtn);
            } else if (containsHtmlTags(cellText)) {
              attachHtmlRenderToggle(cellText, valDiv, actionsDiv);
            } else {
              valDiv.textContent = cellText;
            }
          }

          fieldRow.appendChild(keyDiv);
          fieldRow.appendChild(valDiv);
          fieldRow.appendChild(actionsDiv);
          fields.appendChild(fieldRow);
        });

        elDrawerBody.appendChild(fields);

        elDetailDrawer.classList.add('open');
        elGridBody.querySelectorAll('tr').forEach(function(tr) { tr.classList.remove('selected'); });
        const selRow = elGridBody.querySelector('[data-row-index="' + rowIndex + '"]');
        if (selRow) selRow.classList.add('selected');
      }

      function closeDrawer() {
        state.drawerOpen = false;
        state.selectedRowIndex = null;
        elDetailDrawer.classList.remove('open');
        elGridBody.querySelectorAll('tr').forEach(function(tr) { tr.classList.remove('selected'); });
      }

      function openFilterDropdown(colIndex, thEl, col) {
        if (activeFilterColumnIndex === colIndex) {
          elFilterDropdown.classList.add('hidden');
          activeFilterColumnIndex = null;
          return;
        }
        activeFilterColumnIndex = colIndex;

        elFilterDropdown.innerHTML = '';
        elFilterDropdown.classList.remove('hidden');

        if (col.type === 'BLOB') {
          const note = document.createElement('p');
          note.className = 'blob-disabled-note';
          note.textContent = 'BLOB columns cannot be filtered';
          elFilterDropdown.appendChild(note);
          positionDropdown(thEl);
          return;
        }

        let opSelect = null;
        let valueInput;

        if (col.type === 'INT' || col.type === 'REAL') {
          opSelect = document.createElement('select');
          ['=', '>', '<'].forEach(function(op) {
            const opt = document.createElement('option');
            opt.value = op === '=' ? 'eq' : op === '>' ? 'gt' : 'lt';
            opt.textContent = op;
            opSelect.appendChild(opt);
          });
          elFilterDropdown.appendChild(opSelect);
        }

        valueInput = document.createElement('input');
        valueInput.type = col.type === 'INT' || col.type === 'REAL' ? 'number' : 'text';
        valueInput.placeholder = 'Filter value';
        elFilterDropdown.appendChild(valueInput);

        const buttons = document.createElement('div');
        buttons.className = 'filter-dropdown-buttons';

        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn-filter-apply';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', function() {
          const val = valueInput.value.trim();
          if (!val) { elFilterDropdown.classList.add('hidden'); activeFilterColumnIndex = null; return; }
          let op;
          if (opSelect) {
            op = opSelect.value;
          } else {
            op = 'contains';
          }
          state.columnFilters = state.columnFilters.filter(function(f) { return f.column !== col.name; });
          state.columnFilters.push({ column: col.name, op, value: val });
          state.page = 0;
          elFilterDropdown.classList.add('hidden');
          activeFilterColumnIndex = null;
          renderChips();
          sendQuery();
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-filter-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function() {
          elFilterDropdown.classList.add('hidden');
          activeFilterColumnIndex = null;
        });

        buttons.appendChild(applyBtn);
        buttons.appendChild(cancelBtn);
        elFilterDropdown.appendChild(buttons);

        positionDropdown(thEl);
        valueInput.focus();

        valueInput.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') applyBtn.click();
          if (e.key === 'Escape') cancelBtn.click();
        });
      }

      function positionDropdown(thEl) {
        const rect = thEl.getBoundingClientRect();
        elFilterDropdown.style.top = (rect.bottom + window.scrollY) + 'px';
        elFilterDropdown.style.left = (rect.left + window.scrollX) + 'px';
      }

      function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      }

      function tryParseJson(str) {
        try { return JSON.parse(str); } catch (_) { return null; }
      }

      function containsHtmlTags(str) {
        return /<[a-zA-Z][^>]{0,100}>/.test(str);
      }

      function renderJsonTree(parsedObj, valueContainer, actionsContainer) {
        if (Array.isArray(parsedObj)) {
          valueContainer.textContent = '[' + parsedObj.length + ' items]';
          return;
        }
        const tree = document.createElement('div');
        tree.className = 'drawer-json-tree';
        Object.keys(parsedObj).forEach(function(key) {
          const row = document.createElement('div');
          row.className = 'drawer-json-row';

          const keyEl = document.createElement('span');
          keyEl.className = 'drawer-json-key';
          keyEl.textContent = key;
          row.appendChild(keyEl);

          const valEl = document.createElement('span');
          valEl.className = 'drawer-json-value';
          const rawVal = parsedObj[key];
          valEl.textContent = rawVal === null ? 'null' : String(rawVal);
          row.appendChild(valEl);

          if (typeof rawVal === 'string' && containsHtmlTags(rawVal)) {
            attachHtmlRenderToggle(rawVal, valEl, row);
          }

          tree.appendChild(row);
        });
        valueContainer.appendChild(tree);
      }

      function attachHtmlRenderToggle(rawText, valueContainer, actionsContainer) {
        valueContainer.textContent = '';
        const rawSpan = document.createElement('span');
        rawSpan.textContent = rawText;
        valueContainer.appendChild(rawSpan);

        const previewDiv = document.createElement('div');
        previewDiv.className = 'html-preview hidden';
        valueContainer.appendChild(previewDiv);

        const renderBtn = document.createElement('button');
        renderBtn.className = 'btn-copy-cell';
        renderBtn.textContent = 'Render HTML';
        let showingHtml = false;
        renderBtn.addEventListener('click', function() {
          showingHtml = !showingHtml;
          if (showingHtml) {
            previewDiv.innerHTML = rawText;
            previewDiv.classList.remove('hidden');
            rawSpan.style.display = 'none';
            renderBtn.textContent = 'Show raw';
          } else {
            previewDiv.classList.add('hidden');
            rawSpan.style.display = '';
            renderBtn.textContent = 'Render HTML';
          }
        });
        actionsContainer.appendChild(renderBtn);
      }

      function copyToClipboard(text, button) {
        vscode.postMessage({ type: 'copyText', text: text });
        if (button) flashButtonCopied(button);
      }

      function flashButtonCopied(btn) {
        const originalText = btn.textContent;
        const originalDisabled = btn.disabled;
        btn.textContent = 'Copied!';
        btn.disabled = true;
        setTimeout(function() {
          btn.textContent = originalText;
          btn.disabled = originalDisabled;
        }, 1200);
      }

      elSearchInput.addEventListener('input', function() {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(function() {
          state.search = elSearchInput.value;
          state.page = 0;
          sendQuery();
        }, 300);
      });

      elBtnClearSearch.addEventListener('click', function() {
        state.search = '';
        elSearchInput.value = '';
        state.page = 0;
        sendQuery();
      });

      elBtnPrev.addEventListener('click', function() {
        if (state.page > 0) { state.page--; sendQuery(); }
      });

      elBtnNext.addEventListener('click', function() {
        const lastPage = Math.max(0, Math.ceil(state.totalRows / PAGE_SIZE) - 1);
        if (state.page < lastPage) { state.page++; sendQuery(); }
      });

      elBtnCloseDrawer.addEventListener('click', closeDrawer);

      elBtnCopyJson.addEventListener('click', function() {
        if (!state.drawerRow || !state.schema) return;
        const obj = {};
        state.schema.forEach(function(col, i) {
          const cell = state.drawerRow[i];
          if (cell && typeof cell === 'object' && cell.__type === 'blob') {
            obj[col.name] = '[blob ' + cell.size + ' bytes]';
          } else {
            obj[col.name] = cell;
          }
        });
        copyToClipboard(JSON.stringify(obj, null, 2), elBtnCopyJson);
      });

      document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
          e.preventDefault();
          elSearchInput.focus();
          elSearchInput.select();
        }
        if (e.key === 'Escape') {
          if (state.drawerOpen) {
            closeDrawer();
          } else if (document.activeElement === elSearchInput) {
            clearAllFilters();
          }
          if (!elFilterDropdown.classList.contains('hidden')) {
            elFilterDropdown.classList.add('hidden');
            activeFilterColumnIndex = null;
          }
        }
      });

      document.addEventListener('click', function(e) {
        if (!elFilterDropdown.classList.contains('hidden') &&
            !elFilterDropdown.contains(e.target) &&
            !e.target.classList.contains('filter-icon')) {
          elFilterDropdown.classList.add('hidden');
          activeFilterColumnIndex = null;
        }
      });

      (function initDragHandle() {
        let dragging = false;
        let startY = 0;
        let startHeight = 0;
        elDrawerResizeHandle.addEventListener('mousedown', function(e) {
          dragging = true;
          startY = e.clientY;
          startHeight = elDetailDrawer.offsetHeight;
          e.preventDefault();
        });
        document.addEventListener('mousemove', function(e) {
          if (!dragging) return;
          const delta = startY - e.clientY;
          const newHeight = Math.max(80, Math.min(window.innerHeight * 0.8, startHeight + delta));
          elDetailDrawer.style.height = newHeight + 'px';
        });
        document.addEventListener('mouseup', function() { dragging = false; });
      })();

      window.addEventListener('message', function(event) {
        const msg = event.data;
        if (msg.type === 'tableData') {
          state.activeTable = msg.activeTable;
          state.schema = msg.schema;
          state.rows = msg.rows;
          state.totalRows = msg.totalRows;
          state.page = msg.page || 0;
          hideLoading();
          renderAll();
          updateSidebarBadge(msg.activeTable, msg.filteredCount, msg.totalRows);
        } else if (msg.type === 'rowCounts') {
          Object.entries(msg.counts).forEach(function(entry) {
            const tableName = entry[0];
            const count = entry[1];
            const tableEntry = state.tables.find(function(t) { return t.name === tableName; });
            if (tableEntry) tableEntry.rowCount = count;
            const badge = elTableList.querySelector('[data-table="' + CSS.escape(tableName) + '"]');
            if (badge && (tableName !== state.activeTable || (!state.search && state.columnFilters.length === 0))) {
              badge.textContent = String(count);
            }
          });
        }
      });

      renderAll();
    })();
  <\/script>
</body>
</html>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { openSqliteViewer, buildSqliteViewerHtml, escapeHtml };
