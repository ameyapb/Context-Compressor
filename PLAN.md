# SQLite Viewer - Implementation Plan

## Context

This adds a lightweight read-only SQLite table browser to the extension. The target user is non-technical and should never need to know SQL exists. A user right-clicks a `.sqlite` or `.db` file in the Explorer, opens the viewer, selects a table, and browses/searches/filters rows with UI controls only.

## Key architecture decision: sql.js runs on the extension host, not in the webview

The webview is a **dumb display layer**. All file I/O and SQL execution happen on the extension host (Node.js). Results are pushed to the webview via `postMessage`. User actions (filter changes, page changes, table selection) come back as `postMessage` events; the host runs the corresponding query and pushes fresh data.

This avoids:
- CSP `wasm-unsafe-eval` requirement in the webview
- File system access from the webview
- `localResourceRoots` wiring for the WASM binary
- Any security surface from running user-provided SQLite data in the webview JS context

The CSP stays identical to the existing template preview webview: `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`

---

## New modules

### `src/sqliteReader.js` — pure Node.js, no VS Code dependency

Wraps `sql.js`. Accepts file bytes as a `Uint8Array` (not a path) so it has no filesystem dependency and is trivially testable with in-memory DBs.

**Initialization:**
```js
const initSqlJs = require('sql.js');
const path = require('path');
let _SQL = null;

async function ensureSqlInitialized() {
  if (!_SQL) {
    _SQL = await initSqlJs({
      locateFile: (file) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
    });
  }
  return _SQL;
}
```

**Exports:**
```js
openDatabase(fileBytes: Uint8Array) → Promise<db>
listTables(db) → [{ name: string, rowCount: number }]
getTableSchema(db, tableName) → [{ name: string, type: string, notnull: boolean, pk: boolean }]
getRows(db, tableName, query) → { rows: any[][], totalRows: number }
closeDatabase(db) → void
```

**`query` shape for `getRows`:**
```js
{
  search: string,                              // global substring search across all non-BLOB columns
  columnFilters: [{ column, op, value }],      // op: 'eq' | 'gt' | 'lt' | 'contains'
  sort: { column: string, dir: 'asc'|'desc' } | null,
  page: number,                                // 0-indexed
  pageSize: number,                            // always 50
}
```

**SQL safety rules (strictly enforced):**
- `tableName` is validated against a whitelist derived from `listTables` before any use. Unrecognized name throws.
- Column names in `columnFilters` and `sort` are validated against `getTableSchema` output. Unrecognized name throws.
- All user-supplied filter **values** go through `?` prepared statement parameters — never interpolated.
- Column/table names, after whitelist validation, are interpolated as double-quoted SQL identifiers: `"${name}"`. This handles names with spaces, reserved words, and mixed case.

**Global search SQL pattern:**
```sql
(CAST("col1" AS TEXT) LIKE ? OR CAST("col2" AS TEXT) LIKE ? OR ...)
```
Only non-BLOB columns are included. BLOB columns cannot be searched.

**Special value representation:**
- SQL `NULL` → JS `null` in returned rows
- BLOB values → `{ __type: 'blob', size: N }` object; the raw bytes are not transmitted to the webview

**Validation step after `openDatabase`:**
Run `SELECT name FROM sqlite_master LIMIT 1` immediately. If it throws, the file is not a valid SQLite database; re-throw a typed error so `sqliteViewer.js` can show a clean error message and close the panel.

**Row count for large tables:**
`listTables` runs `SELECT COUNT(*) FROM "tableName"` per table. For DBs with many tables this could be slow, so the function accepts an optional `fastMode: true` flag that returns `rowCount: null` for all tables; the caller then fires a lazy count pass.

---

### `src/sqliteViewer.js` — VS Code-dependent, owns the webview panel

**Single export:**
```js
openSqliteViewer(context: vscode.ExtensionContext, fileUri: vscode.Uri) → Promise<void>
```

**Panel deduplication:**
Maintains a module-level `Map<string, vscode.WebviewPanel>` keyed on `fileUri.fsPath`. If the panel for that path already exists, reveals it and returns early. Removes the entry from the map when the panel is disposed.

**Open flow:**
1. Read file bytes: `vscode.workspace.fs.readFile(fileUri)` → `Uint8Array`
2. Call `openDatabase(fileBytes)` — on error, call `vscode.window.showErrorMessage('Could not open <filename>. The file is not a valid SQLite database.')` and return
3. Call `listTables(db)` (fast mode; counts filled asynchronously)
4. Default table = table with highest `rowCount` (or first if counts are null); call `getTableSchema` + `getRows` for it
5. Create webview panel: `vscode.window.createWebviewPanel('sqliteViewer', fileName, vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] })`
6. Set `panel.webview.html = buildSqliteViewerHtml(nonce, fileName, tables, defaultSchema, firstPageRows, firstPageTotal)`
7. Register `panel.webview.onDidReceiveMessage` handler (see message protocol below)
8. Register `panel.onDidDispose` to call `closeDatabase(db)` and remove panel from dedup map

**Message handler (extension host side):**
```
'query'       → getRows(db, ...) → postMessage({ type: 'tableData', ... })
'selectTable' → getTableSchema + getRows → postMessage({ type: 'tableData', ... })
'copyHex'     → vscode.env.clipboard.writeText(hexString)
```

**Async row count backfill:**
After posting the `init` message, iterate tables with null counts, run `COUNT(*)` for each, and post `{ type: 'rowCounts', counts: { tableName: number } }` messages so the sidebar badges update progressively.

---

## Webview HTML/JS — `buildSqliteViewerHtml` in `sqliteViewer.js`

All HTML, CSS, and JS are inlined in the returned string, exactly like `buildTemplatePreviewHtml` in `extension.js:114`.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  file.sqlite                                                 │
├────────────────┬─────────────────────────────────────────────┤
│ Tables         │  [Search all columns...              ] [×]  │
│                │                                             │
│ > users   84   │  name: alice [×]   age > 20 [×]   [× all] │
│   orders  230  │                                             │
│   products 12  │  name  TEXT ↑  │  age  INT  │  email  TEXT │
│                │  ─────────────   ──────────   ────────────  │
│                │  Alice          │ 28          │ alice@e...  │
│                │  Bob            │ 34          │ bob@ex...   │
│                │                                             │
│                │  Rows 1–50 of 84          [< Prev] [Next >] │
└────────────────┴─────────────────────────────────────────────┘
  ┌── Detail drawer (slides up on row click) ─────────────────┐
  │  name     Alice                                            │
  │  age      28                                               │
  │  email    alice@example.com                                │
  │  notes    [binary data · 2.1 KB]              [Copy hex]  │
  │                                    [Copy row as JSON] [×] │
  └────────────────────────────────────────────────────────────┘
```

### CSS token system — VS Code variables only

| Role | Variable |
|---|---|
| Main background | `--vscode-editor-background` |
| Main text | `--vscode-editor-foreground` |
| Sidebar background | `--vscode-sideBar-background` |
| Sidebar text | `--vscode-sideBar-foreground` |
| Active table item bg | `--vscode-list-activeSelectionBackground` |
| Active table item text | `--vscode-list-activeSelectionForeground` |
| Table row hover | `--vscode-list-hoverBackground` |
| Selected data row | `--vscode-list-inactiveSelectionBackground` |
| Type badge bg | `--vscode-badge-background` |
| Type badge text | `--vscode-badge-foreground` |
| Filter chip bg | `--vscode-badge-background` |
| Filter chip text | `--vscode-badge-foreground` |
| Search input bg | `--vscode-input-background` |
| Search input text | `--vscode-input-foreground` |
| Search border | `--vscode-input-border, var(--vscode-panel-border, #454545)` |
| Focus ring | `--vscode-focusBorder` |
| Panel divider | `--vscode-panel-border` |
| Muted / NULL text | `--vscode-descriptionForeground` |
| Detail drawer bg | `--vscode-editorHoverWidget-background, var(--vscode-editorWidget-background)` |
| Detail drawer border | `--vscode-panel-border` |
| Button bg | `--vscode-button-background` |
| Button text | `--vscode-button-foreground` |
| Button hover | `--vscode-button-hoverBackground` |

### UX behaviors

**Table sidebar:**
- On open, the default table (highest row count) is pre-selected and its data shown immediately — no click required
- Row count badge: shows `12/84` (filtered/total) when any filter or search is active; shows `84` otherwise
- Clicking a table sends `{ type: 'selectTable', tableName }` and resets all filters, search, sort, and page
- Async count update: badges show `...` until the backfill message arrives

**Column headers:**
- Each header shows `name  TYPE` where `TYPE` is a compact badge (`TEXT`, `INT`, `REAL`, `BLOB`, `NUM`)
- Click header → sort ascending; click again → descending; click again → no sort. Arrow `↑` / `↓` indicates current direction
- A small filter icon appears on column header hover (not always visible — avoids clutter). Clicking opens a floating dropdown below the header anchored to that column
- Dropdown content is type-aware:
  - `TEXT` / `NUM`: text input (substring match)
  - `INT` / `REAL`: operator selector (`=`, `>`, `<`) plus a number input
  - `BLOB`: disabled, tooltip: "BLOB columns cannot be filtered"
- Confirming a filter closes the dropdown and adds a chip to the active filters bar

**Global search bar:**
- Substring match across all non-BLOB columns, case-insensitive (`LIKE '%value%'`)
- Posts `query` message on 300ms debounce after each keystroke
- `×` button in the search bar clears it and re-queries

**Active filter chips:**
- Rendered above the grid, hidden when empty
- Each chip: `column: value [×]` for text/number filters, `column > value [×]` for comparisons
- `[× all]` button clears all chips and the search bar in one action

**Data grid cells:**
- Text longer than 40 chars: truncated with `…`; full value visible in the detail drawer
- `null` SQL values: rendered as italic `null` in `--vscode-descriptionForeground` — visually distinct from an empty string
- BLOB values: rendered as `[blob · N KB]` in muted style; no binary content shown
- Clicking any row opens the detail drawer

**Detail drawer:**
- Slides up from the bottom using `transform: translateY` with a 150ms ease transition
- Height: 35% of viewport; a drag handle at the top edge allows resizing (JS drag listener)
- Shows all columns as vertical key-value pairs (column name left, full value right, word-wrap on)
- BLOB values: show `[binary data · N bytes]` with a "Copy hex" button; button posts `{ type: 'copyHex', hex: '...' }` to the extension host, which writes it to clipboard via `vscode.env.clipboard.writeText`
- "Copy row as JSON" button copies the entire row as a JSON object (keys = column names) — directly useful for pasting into LLM prompts
- Closed by `×` button or `Escape`

**Pagination:**
- Label: `Rows 1–50 of 84` or `Rows 1–12 of 12 (filtered)` when filters are active
- Prev button disabled on page 0; Next button disabled on last page
- Any filter/search/table-selection change resets to page 0

**Loading state:**
- A subtle inline spinner overlay is shown over the data grid (only) during each query. The sidebar remains interactive

**Empty states:**
- Empty table (zero rows total): "This table has no rows." centered in the grid
- Filters produce no results: "No rows match the current filters." with a "Clear all filters" link
- These are plain sentences, no SQL jargon

**Keyboard shortcuts:**
- `Ctrl+F` / `Cmd+F`: focus the search bar
- `↑` / `↓`: navigate rows in the grid
- `Enter`: open detail drawer for focused row
- `Escape`: close detail drawer (if open), or clear search (if drawer is closed and search is focused)

**Accessibility:**
- Data grid uses `role="grid"`, `role="row"`, `role="gridcell"`
- Sorted column header has `aria-sort="ascending"` / `"descending"`
- Filter chips have `aria-label="Remove filter: column: value"`
- Focus is returned to the triggering row when the detail drawer closes

---

## Message protocol

**Extension host → webview:**

```js
// Sent once immediately after the panel opens
{ type: 'init', fileName, tables: [{name, rowCount}], activeTable: string,
  schema: [{name, type, notnull, pk}], rows: any[][], totalRows: number }

// Sent after every query/selectTable message
{ type: 'tableData', activeTable: string, schema: [{name, type, notnull, pk}],
  rows: any[][], totalRows: number, filteredCount: number, page: number }

// Sent asynchronously as row counts complete for large DBs
{ type: 'rowCounts', counts: { [tableName]: number } }
```

**Webview → extension host:**

```js
{ type: 'query', tableName: string, search: string,
  columnFilters: [{column, op, value}], sort: {column, dir}|null, page: number }
{ type: 'selectTable', tableName: string }
{ type: 'copyHex', hex: string }   // hex string of BLOB bytes
```

---

## Changes to existing files

### `src/extension.js`
- Add `const { openSqliteViewer } = require('./sqliteViewer');` near other requires
- Register command `token-budget-builder.openSqliteViewer`:
  ```js
  vscode.commands.registerCommand('token-budget-builder.openSqliteViewer', async (fileUri) => {
    await openSqliteViewer(context, fileUri);
  })
  ```
- Push to `context.subscriptions`

### `package.json`
**New command:**
```json
{ "command": "token-budget-builder.openSqliteViewer", "title": "Open SQLite Viewer" }
```

**Explorer context menu entry** (`.sqlite` and `.db`, not folders):
```json
{
  "command": "token-budget-builder.openSqliteViewer",
  "group": "z_contextcompressor@3",
  "when": "resourceExtname == .sqlite || resourceExtname == .db"
}
```

`resourceExtname` includes the leading dot and is empty for folders, so this condition already excludes folders without an explicit `explorerResourceIsFolder` guard.

---

## New files

| File | Description |
|---|---|
| `src/sqliteReader.js` | Pure Node.js sql.js wrapper — no VS Code dependency |
| `src/sqliteViewer.js` | Webview panel lifecycle + `buildSqliteViewerHtml` |
| `test/sqliteReader.test.js` | All `sqliteReader` unit tests |

---

## Test: `test/sqliteReader.test.js`

Uses `sql.js` directly in the test harness to create in-memory DBs — no filesystem access, no VS Code dependency, no mocking needed.

Tests to cover:
- `listTables` returns correct names and row counts from a known schema
- `getTableSchema` returns correct column names, types, notnull, and pk flags
- `getRows` with no query options returns first 50 rows and correct `totalRows`
- `getRows` global search filters by substring across text columns, case-insensitively
- `getRows` column filter `eq` / `gt` / `lt` work for integer columns
- `getRows` column filter `contains` works for text columns
- `getRows` sort ascending and descending returns correct row order
- `getRows` page 1 returns the correct offset
- `getRows` with an unrecognized table name throws (SQL injection guard)
- `getRows` with an unrecognized column in `columnFilters` throws
- `getRows` with an unrecognized column in `sort` throws
- `null` SQL values come back as JS `null`
- BLOB values come back as `{ __type: 'blob', size: N }` without raw bytes
- `openDatabase` with invalid bytes throws a typed error

Test file structure follows the project's existing pattern: `'use strict'`, `node:assert/strict`, mocha `describe`/`it` blocks.

---

## Dependency

`sql.js` — WASM-based SQLite, no native compilation, ships cleanly in a `.vsix`. The WASM binary is located via `locateFile` pointing to `node_modules/sql.js/dist/` using `__dirname`-relative path from `sqliteReader.js`. No additional dependencies.

---

## Verification

1. `npm install sql.js` — no peer conflicts
2. `npm test` — all existing and new tests pass
3. Press `F5` to open Extension Host
4. Right-click a `.sqlite` file → confirm "Open SQLite Viewer" appears
5. Right-click a folder → confirm the entry does NOT appear
6. Open a multi-table DB — sidebar lists all tables; table with most rows is pre-selected
7. Confirm initial data renders without any user interaction
8. Switch VS Code color theme (light and dark) — confirm all colors adapt correctly
9. Type in the search bar — rows filter with ~300ms debounce; badge updates to `N/total`
10. Click a column header — sort toggles asc/desc/none with arrow indicator
11. Hover a column header — filter icon appears; click it — type-appropriate dropdown opens
12. Apply a column filter — chip appears in filter bar; table updates; sidebar badge updates
13. Click `× all` — all chips and search clear, full table reloads
14. Click a row — detail drawer slides up with all column values
15. In the drawer, click "Copy row as JSON" — valid JSON lands in clipboard
16. Click a BLOB cell's "Copy hex" — extension host writes hex to clipboard with no error
17. Test a table with NULL values — cells show italic `null`, distinct from empty string
18. Page through a table with >50 rows — Prev/Next work; label shows correct range
19. Open the same `.sqlite` file a second time — existing panel is focused, not duplicated
20. Close the panel — no errors in VS Code Developer Tools console; DB is closed
