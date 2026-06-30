# SQLite Viewer: Recent Database Paths

## Context

Opening a database in the SQLite Viewer always requires going through `showOpenDialog` to browse to the file, even when reopening the same database repeatedly (the stated server workflow: close tabs often, reopen the same DB path constantly). There's no way to jump straight back to a recently used database. This plan adds a "recent databases" list to the existing SQLite Viewer sidebar section so a single click reopens a known path, no browsing required.

Decisions from discussion:
- **Location**: sidebar list (not just an enhanced quick pick).
- **Save behavior**: fully automatic — every successful open (via picker or explorer right-click) records the path; no manual "save as preset" step.
- **Scope**: global (`context.globalState`), matching Prompt Templates, since this is about reopening the same server-side DB files regardless of which workspace is open.

## Key finding that simplifies this

`package.json` already declares a `token-budget-builder-sqlite` view (lines 87-90) with `viewsWelcome` content (lines 102-105), but `extension.js` never calls `vscode.window.createTreeView` for it — there's currently no `TreeDataProvider` backing that view at all; VS Code just shows the welcome screen unconditionally. We register a provider for that existing view id. VS Code automatically falls back to the `viewsWelcome` content whenever the provider's `getChildren()` returns an empty array, so first-run UX (no recents yet) is unaffected.

## Implementation

### 1. New pure module: `src/sqlite/sqliteDatabaseHistory.js`

Mirrors the existing storage-manager pattern (`src/templates/templateManager.js`, `src/context/presetManager.js`): plain functions taking a `storage` object (here `context.globalState`), no `vscode` import, fully unit-testable.

```js
const DATABASE_HISTORY_STORAGE_KEY = 'token-budget-builder.sqliteDatabaseHistory';
const MAX_RECENT_DATABASES = 10;

function getRecentDatabases(storage) { ... }      // returns string[] of fsPaths, newest first
function addRecentDatabase(storage, fsPath) { ... } // moves-to-front if present, dedups, caps at MAX_RECENT_DATABASES
function removeRecentDatabase(storage, fsPath) { ... }
function clearRecentDatabases(storage) { ... }
```

### 2. `src/extension.js` wiring

- Import the four functions above.
- Add `SqliteDatabaseHistoryItem extends vscode.TreeItem` (same shape as `PromptTemplateItem`, src/extension.js:59-76): label = `path.basename(fsPath)`, `description` = parent directory (shortened), `tooltip` = full fsPath, `iconPath = new vscode.ThemeIcon('database')`, `contextValue = 'sqliteDatabaseHistoryEntry'`, `command` = `token-budget-builder.openSqliteViewer` with the file's `vscode.Uri` as argument (reuses the existing command — no new open path needed).
- Add `SqliteDatabaseHistoryTreeProvider` (same shape as `PromptTemplateTreeProvider`, src/extension.js:78-104): `initialize(storage)`, `getChildren()` maps `getRecentDatabases()` to items, `refresh()`.
- Register it: `vscode.window.createTreeView('token-budget-builder-sqlite', { treeDataProvider: sqliteDatabaseHistoryTreeProvider, showCollapseAll: false })`, alongside the other tree view registrations.
- In the existing `openSqliteViewerCommand` handler (src/extension.js:1238-1254), after `resolvedUri` is determined (whether from explorer right-click, the view-title button, or a recent-item click) and *before/after* calling `openSqliteViewer`, call `addRecentDatabase(context.globalState, resolvedUri.fsPath)` then `sqliteDatabaseHistoryTreeProvider.refresh()`.
- New command `token-budget-builder.removeSqliteDatabaseHistoryEntry(fsPath)`: calls `removeRecentDatabase` + refresh. Wired as an inline trash icon on each tree item.
- New command `token-budget-builder.clearSqliteDatabaseHistory`: calls `clearRecentDatabases` + refresh. Wired as a view-title button next to the existing "Open Database File" button.

### 3. `package.json`

- Add two command contributions: `removeSqliteDatabaseHistoryEntry` (`$(trash)`), `clearSqliteDatabaseHistory` (`$(clear-all)`).
- `view/title` (after line 310 block): add `clearSqliteDatabaseHistory` for `view == token-budget-builder-sqlite`, `group: navigation@2`.
- `view/item/context` (after line 337): add `removeSqliteDatabaseHistoryEntry` for `view == token-budget-builder-sqlite && viewItem == sqliteDatabaseHistoryEntry`, `group: inline`.
- No changes needed to `viewsContainers` or the `views` block — the view id already exists.

### 4. Tests

New `test/sqlite/sqliteDatabaseHistory.test.js`, following the mock-storage pattern used in `test/templates/templateManager.test.js` / `test/context/presetManager.test.js`: covers add (dedup + move-to-front + cap at `MAX_RECENT_DATABASES`), remove, clear, and empty-state behavior.

### 5. CLAUDE.md

Update the `src/sqlite/sqliteViewer.js` bullet section to document the new `src/sqlite/sqliteDatabaseHistory.js` module and the sidebar wiring, per the "keep this file updated when a new module is added" rule.

## Verification

- `npm test` — new `sqliteDatabaseHistory.test.js` plus full suite passes.
- Press F5, open a `.sqlite`/`.db` file via explorer right-click or the view-title button, confirm it appears in the SQLite Viewer sidebar list immediately below the welcome/open button.
- Reopen the same file from the sidebar list — confirm it reveals the already-open panel (existing dedup-by-path behavior in `sqliteViewer.js`) rather than opening a duplicate.
- Open 11+ distinct files, confirm the list caps at 10 and oldest entries drop off.
- Click the trash icon on one entry, confirm it's removed without affecting others; click "Clear list," confirm the welcome screen reappears.
