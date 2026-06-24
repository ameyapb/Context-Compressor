# Line Filter UX Improvements

## Context

The Line Filter sidebar panel (powered by `FilterPanelProvider`) currently has several friction points: Keep and Remove look identical at a glance, the history gives no visual cue about which result is currently open, match stats require expanding items, patterns cannot be reused from history, and the empty state gives no guidance. This plan addresses all eleven improvements identified in the brainstorm, grouped by implementation order.

---

## Items in Priority Order

### G - Visual distinction between Keep and Remove icons

**Files:** `src/filterPanelProvider.js` line 169-184

Change the Remove action's icon from `'filter-filled'` to `'remove'` (a minus-circle). Keep uses `'filter'`, Remove uses `'remove'`. These two icons communicate inclusion vs exclusion without reading the label.

```js
// Keep (no change):
new FilterActionItem('Keep matching lines...', COMMAND_FILTER_LINES, 'filter', ...)
// Remove (change icon):
new FilterActionItem('Remove matching lines...', COMMAND_FILTER_LINES_INVERSE, 'remove', ...)
```

---

### H - Inline match rate percentage in history label

**Files:** `src/filterPanelProvider.js` line 64

In `FilterHistoryGroupItem` constructor, change description to include percentage:

```js
const pct = entry.total > 0 ? Math.round((entry.matched / entry.total) * 100) : 0;
this.description = `${entry.matched.toLocaleString()} matched (${pct}%)`;
```

The `total` field is already on every history entry. No data-structure changes needed.

---

### B - Guided empty state

**Files:** `src/filterPanelProvider.js` line 124-126

Replace the bare "No filter results yet" item with one that directs the user to act:

```js
return [new FilterInfoItem('Open a file and use an action below', '', 'info')];
```

---

### A - Active item indicator in history

**Files:** `src/filterPanelProvider.js`, `src/extension.js` line 342-345

`FilterPanelProvider` needs to know the URI of the currently active editor so it can highlight the matching history entry.

1. Add a third constructor callback: `getActiveEditorUri`.
2. In `extension.js`, pass `() => vscode.window.activeTextEditor?.document?.uri` as the third argument.
3. In `_buildHistoryItems()`, compare each `entry.uri.toString()` against `this._getActiveEditorUri()?.toString()`. If they match, set `$(circle-filled)` as the icon instead of the default `$(filter)`.

```js
// filterPanelProvider.js - FilterHistoryGroupItem will accept an optional isActive flag
class FilterHistoryGroupItem extends vscode.TreeItem {
  constructor(entry, isActive) {
    // ...existing code...
    this.iconPath = new vscode.ThemeIcon(isActive ? 'circle-filled' : 'filter');
  }
}

// _buildHistoryItems in FilterPanelProvider:
_buildHistoryItems() {
  const history = this._getFilterHistory();
  if (history.length === 0) { ... }
  const activeUriStr = this._getActiveEditorUri()?.toString();
  return history.map(entry =>
    new FilterHistoryGroupItem(entry, entry.uri.toString() === activeUriStr)
  );
}
```

No change to `onDidChangeActiveTextEditor` listener needed - it already calls `filterPanelProvider.refresh()`.

---

### C - Action labels adapt when active editor is a filter result

**Files:** `src/filterPanelProvider.js`, `src/extension.js`

When the active editor is a filter result (URI scheme is `line-filter`), the Keep and Remove labels should read "in result..." to clarify the user is narrowing an existing chain.

1. Add a fourth constructor callback to `FilterPanelProvider`: `getIsActiveEditorFilterResult`.
2. In `extension.js`, pass `() => vscode.window.activeTextEditor?.document?.uri?.scheme === LOG_FILTER_SCHEME`.
3. In `_buildActionItems()`:

```js
const onResult = this._getIsActiveEditorFilterResult();
const keepLabel = onResult ? 'Keep matching lines in result...' : 'Keep matching lines...';
const removeLabel = onResult ? 'Remove matching lines in result...' : 'Remove matching lines...';
```

---

### F - Persist recent patterns across sessions

**Files:** `src/extension.js`

After every successful manual filter (not "From selection"), prepend the raw user input to a `workspaceState` list capped at 5 unique entries.

Constants to add at the top of `extension.js`:
```js
const RECENT_PATTERNS_STORAGE_KEY = 'filter-recent-patterns';
const RECENT_PATTERNS_MAX = 5;
```

At the end of `runFilterCommand`, after the result is opened, add (only when `preSuppliedPattern === null`, meaning it came from manual input):

```js
if (preSuppliedPattern === null) {
  const existing = context.workspaceState.get(RECENT_PATTERNS_STORAGE_KEY, []);
  const updated = [rawInput, ...existing.filter(p => p !== rawInput)].slice(0, RECENT_PATTERNS_MAX);
  await context.workspaceState.update(RECENT_PATTERNS_STORAGE_KEY, updated);
}
```

This requires hoisting `rawInput` to a variable available after the early-return guards.

---

### E - Pattern input with recent suggestions (quick pick)

**Files:** `src/extension.js` - `runFilterCommand` lines 431-439

Replace `vscode.window.showInputBox` with `vscode.window.createQuickPick` so previously-used patterns appear as selectable items. Users can still type freely.

```js
const recentPatterns = context.workspaceState.get(RECENT_PATTERNS_STORAGE_KEY, []);
const qp = vscode.window.createQuickPick();
qp.title = invert ? 'Remove lines containing:' : 'Keep lines containing:';
qp.placeholder = invert ? 'debug' : 'error';
qp.items = recentPatterns.map(p => ({ label: p, description: 'recent' }));

const rawInput = await new Promise(resolve => {
  qp.onDidAccept(() => {
    const value = qp.selectedItems.length > 0 ? qp.selectedItems[0].label : qp.value;
    resolve(value || null);
    qp.hide();
  });
  qp.onDidHide(() => resolve(null));
  qp.show();
});
if (!rawInput || !rawInput.trim()) return;
resolvedPattern = resolveFilterPattern(rawInput.trim());
```

This replaces the existing `showInputBox` block. The `rawInput` variable is then used in item F's persistence logic.

---

### D - Per-step match counts stored in history entries

**Files:** `src/extension.js` - `runFilterCommand` line 447-490

To show how each filter narrowed the result, store `chainStepCounts: number[]` alongside each history entry. Each index aligns with `chain[i]`.

In `runFilterCommand`, after determining `existingChain`, also look up the previous step counts:

```js
const sourceHistoryEntry = filterHistory.find(
  h => h.uri.toString() === editor.document.uri.toString()
);
const existingStepCounts = sourceHistoryEntry?.chainStepCounts ?? [];
```

Then in the `filterHistory.unshift(...)` call, add:

```js
chainStepCounts: [...existingStepCounts, result.matchedCount],
```

---

### K - Chain funnel view in expanded history items

**Files:** `src/filterPanelProvider.js` - `FilterHistoryGroupItem` constructor and `_buildHistoryGroupChildren`

**Part 1 - Group item label** uses `chainStepCounts` to annotate each step:

```js
const chainLabel = entry.chain.map((pattern, i) => {
  const count = entry.chainStepCounts?.[i];
  return count !== undefined ? `${pattern} (${count.toLocaleString()})` : pattern;
}).join(' > ');
super(chainLabel, vscode.TreeItemCollapsibleState.Collapsed);
```

**Part 2 - Expanded children** replace the generic step info items with per-step funnel rows:

```js
_buildHistoryGroupChildren(entry) {
  const items = [];
  items.push(new FilterSourceItem(entry.source, entry.sourceUri));
  entry.chain.forEach((pattern, index) => {
    const stepCount = entry.chainStepCounts?.[index];
    const denominator = index === 0
      ? entry.total
      : entry.chainStepCounts?.[index - 1];
    const countStr = (stepCount !== undefined && denominator !== undefined)
      ? `${stepCount.toLocaleString()} of ${denominator.toLocaleString()}`
      : `step ${index + 1} of ${entry.chain.length}`;
    items.push(new FilterInfoItem(`"${pattern}"`, countStr, 'search'));
  });
  return items;
}
```

This removes the redundant bottom "matched of total" item since the last step row shows the final count.

---

### I - Save filter result to file

**Files:** `src/filterPanelProvider.js`, `src/extension.js`, `package.json`

**New command** `token-budget-builder.saveFilterResult` in `extension.js`:

```js
const saveFilterResultCommand = vscode.commands.registerCommand(
  'token-budget-builder.saveFilterResult',
  async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== LOG_FILTER_SCHEME) {
      vscode.window.showInformationMessage('Open a filter result tab first.');
      return;
    }
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file('filter-result.log'),
      filters: { 'Log files': ['log', 'txt'], 'All files': ['*'] },
    });
    if (!saveUri) return;
    const content = editor.document.getText();
    await vscode.workspace.fs.writeFile(saveUri, Buffer.from(content, 'utf8'));
    vscode.window.showInformationMessage(`Saved to ${path.basename(saveUri.fsPath)}`);
  }
);
context.subscriptions.push(saveFilterResultCommand);
```

**Panel action item** in `_buildActionItems()` (using the existing `getIsActiveEditorFilterResult` callback from item C):

```js
const COMMAND_SAVE_FILTER_RESULT = 'token-budget-builder.saveFilterResult';

// Add at the end of the returned action items array:
...(onResult ? [new FilterActionItem(
  'Save result to file...',
  COMMAND_SAVE_FILTER_RESULT,
  'save',
  'Save this filter result as a file on disk.'
)] : []),
```

Only visible when a filter result is the active editor, preventing confusion when no result is open.

**Register in `package.json`** under `contributes.commands`:
```json
{
  "command": "token-budget-builder.saveFilterResult",
  "title": "Save Filter Result to File",
  "category": "Context Compressor"
}
```

---

### J - Context lines: number input instead of fixed options

**Files:** `src/extension.js` - `setContextLinesCommand` lines 1159-1176

Replace `showQuickPick` with `showInputBox` accepting any non-negative integer. Remove the `CONTEXT_LINES_OPTIONS` constraint.

```js
const setContextLinesCommand = vscode.commands.registerCommand(
  'token-budget-builder.setContextLines',
  async () => {
    const current = getContextLines();
    const input = await vscode.window.showInputBox({
      title: 'Context lines around each match',
      prompt: 'Enter a number (0 = matched lines only)',
      value: String(current),
      validateInput: val => {
        const n = parseInt(val, 10);
        return (!Number.isInteger(n) || n < 0) ? 'Enter a whole number 0 or greater' : null;
      },
    });
    if (input === undefined) return;
    const lines = parseInt(input, 10);
    await context.workspaceState.update(CONTEXT_LINES_STORAGE_KEY, lines);
    filterPanelProvider.refresh();
  }
);
```

Remove the `CONTEXT_LINES_OPTIONS` constant and its import if nothing else references it.

---

## Tests

- `buildFilterState` in `filterPanelProvider.js` is already exported. No new pure functions are added by these changes that need a test file.
- If `formatMatchRate` (item H percentage) is extracted to a standalone function, add it to `test/filterPanelProvider.test.js`. Otherwise the inline expression is too simple to warrant a separate test.
- Run `npm test` after all changes to confirm existing tests still pass.

---

## Implementation Order

1. G (icon change) - 1 line, zero risk, immediate visual improvement
2. H (percentage) - 1 expression, no dependencies
3. B (empty state) - 1 line
4. J (context lines input) - isolated command change
5. A (active indicator) - adds constructor callback; update extension.js + filterPanelProvider.js
6. C (adaptive labels) - adds second callback; depends on LOG_FILTER_SCHEME being available
7. F (persist patterns) - storage-only, no UI change
8. E (quick pick) - depends on F for the recent patterns list
9. D (per-step counts) - data structure addition in history
10. K (funnel view) - depends on D for counts; pure rendering change
11. I (save command) - new command + panel item; depends on C's `getIsActiveEditorFilterResult` callback
