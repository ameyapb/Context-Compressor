# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A VS Code extension for assembling, compressing, and copying multi-file prompts with a live token budget for any supported model. It shows a real-time token count in the status bar and provides a sidebar panel to select files, apply local compression, and copy a formatted prompt to the clipboard. Token counting uses `gpt-tokenizer` with `cl100k_base` (GPT-4 family) or `o200k_base` (GPT-4o / o1 family) depending on the selected model.

## Development

**Install dependencies:**
```
npm install
```

**Run the extension (launch Extension Host):**
Press `F5` in VS Code, or use the "Run Extension" launch configuration in [.vscode/launch.json](.vscode/launch.json). This opens a new VS Code window with the extension loaded.

**Package for distribution:**
```
npx vsce package
```

**Publish to the VS Code Marketplace:**
```
npx vsce publish
```
Requires a Personal Access Token from https://marketplace.visualstudio.com/manage. The `publisher` field in `package.json` must match your registered publisher ID.

**Pre-publish checklist:**
- `publisher` in `package.json` is set to your actual publisher ID (not the placeholder).
- `README.md` exists at the repo root — the Marketplace uses it as the extension listing page.
- `media/icon.png` exists (128x128 PNG minimum) and `package.json` has `"icon": "media/icon.png"` — the Marketplace does not accept SVG for the thumbnail.
- `LICENSE` file exists at the repo root.
- `repository` and `keywords` fields are present in `package.json`.
- `activationEvents` is removed from `package.json` (VS Code 1.74+ infers them from `contributes`; `"*"` is deprecated).
- `.vscodeignore` excludes `PLAN.md`, `test/`, and `.vscode/`.

Tests live in `test/` and are run with `npm test` (mocha). To run a single test file: `npx mocha test/<file>.test.js`. No lint scripts are defined.

## Coding Rules

These apply to all code in this repository, no exceptions.

**DRY** — Never repeat even a single line of logic. Extract any duplicated expression into a named constant, helper function, or shared module before committing.

**Constants over magic numbers/strings** — Every literal value that carries meaning (timeouts, alignment priorities, command IDs, encoding names, icon names) must live in a named constant. No bare numbers or opaque strings inline.

**Naming** — Use long, self-explanatory names for functions and variables. A name should make the intent obvious without needing a comment. Abbreviations are not allowed unless they are universally understood (e.g. `url`, `id`).

**No unnecessary comments** — Do not add comments that restate what the code already says. Only comment when explaining a non-obvious constraint, a workaround, or a subtle invariant. No section dividers, no TODO comments in committed code.

**No emojis** — Never use emojis in source code, commit messages, or this file.

**No em dashes** — Never use em dashes (—) in README copy, commit messages, or user-facing strings. They read as AI-generated filler. Use a plain sentence instead.

**File structure** — Keep one concern per module. If a file grows beyond a single clear responsibility, split it. Follow VS Code extension conventions: activation logic in `extension.js`, pure utilities extracted to separate files under `src/`.

**Security** — Never log or expose document content. The extension reads file text only to count tokens; that text must never be stored, transmitted, or surfaced beyond the immediate computation. Follow the principle of least privilege for any VS Code API usage.

**Dependencies** — Always ask before installing a new library. Prefer using VS Code's built-in APIs or already-present dependencies. If a new dependency is approved, document why it was added.

**No dead code** — Delete unused functions, variables, imports, and branches immediately. Do not comment out code or leave it behind "just in case". If it is not used, it does not belong in the codebase.

**Production mindset** — Every change must be treated as if it ships to production the next day. No half-finished logic, no debug leftovers, no disabled safety checks.

**Tests** — Every new module or exported function must have a corresponding test file in `test/` added in the same change. Run `npm test` before considering any implementation complete; all tests must pass. Pure modules (no VS Code dependency) are always testable — there is no excuse to skip.

**Keep this file updated** — Update this file in the same change whenever: the architecture changes (new module, renamed export, new command), a coding rule is added or modified, or a development workflow step changes.

## Architecture

The extension is split across twelve modules under `src/`:

- **[src/extension.js](src/extension.js)** — activation, command registration, status bar lifecycle. The only module that has no VS Code-free counterpart; all command handlers live here. Registers twenty commands: `countTokens`, `selectModel`, `countFolderTokens`, `addToContext`, `addActiveFileToContext`, `removeFromContext`, `clearContext`, `setCompressionMode`, `assemblePrompt`, `suggestRelatedFiles`, `managePresets`, `newTemplate`, `saveActiveDocumentAsTemplate`, `editTemplate`, `removeTemplate`, `openTemplate`, `filterLines`, `filterLinesInverse`, `filterLinesFromSelection`, `setContextLines`. Also defines `PromptTemplateItem` and `PromptTemplateTreeProvider` for the Prompt Templates sidebar section. Creates three tree views: `token-budget-builder-files` (Context Files), `token-budget-builder-templates` (Prompt Templates), and `token-budget-builder-filter` (Line Filter). Contains `runFilterCommand(invert, preSuppliedPattern)` and `resolveFilterPattern(input)` private helpers (inside `activate`) used by filter commands. Registers a `LogFilterContentProvider` on scheme `line-filter` for virtual filter-result documents (no save prompt on close). Context lines preference is persisted in `workspaceState` under `CONTEXT_LINES_STORAGE_KEY` and read by `getContextLines()` at filter time. A debounced `onDidChangeTextEditorSelection` listener refreshes the filter panel so the "From selection" action updates dynamically.
- **[src/models.js](src/models.js)** — model definitions and encoder resolution. Exports `SUPPORTED_MODELS`, `DEFAULT_MODEL_ID`, `getEncoderForModel`, and `getModelById`. Each model carries `contextWindow` (hard token limit) and `practicalTokenLimit` (research-backed quality threshold, 12K–30K, above which LLM output tends to degrade regardless of the available window). No VS Code dependency.
- **[src/fileReader.js](src/fileReader.js)** — shared utility for reading a VS Code URI as UTF-8 text. Exports `readFileAsText(uri)`, returning the file contents as a string or `null` on any error (binary, missing, or permission failure). Used by both `folderCounter.js` and `contextBuilder.js` to avoid duplicating the read-and-decode pattern. Depends on `vscode`.
- **[src/gitignoreFilter.js](src/gitignoreFilter.js)** — pure `.gitignore` parsing and pattern matching with no VS Code dependency. Exports `loadGitignorePatterns(rootFsPath)` (reads the root `.gitignore` and returns parsed pattern strings), `isIgnoredByGitignorePatterns(patterns, relativePath)`, and lower-level helpers `parseGitignoreContent` and `matchesGitignorePattern`. Used by `folderCounter.js` and the `addToContext` command to skip ignored files during folder traversal.
- **[src/folderCounter.js](src/folderCounter.js)** — recursive file collection and aggregate token counting for the Explorer context menu command. Uses `vscode.workspace.fs` to read directories and files. Binary files are skipped silently (UTF-8 decode failure returns 0). Overlapping selections (e.g. a folder and a file inside it) are deduplicated by URI. Depends on `vscode` and `gitignoreFilter.js`.
- **[src/contextBuilder.js](src/contextBuilder.js)** — manages the context file list and the unified Context Files panel (`ContextFileTreeProvider`). Tracks which files are included, computes per-file token counts, handles checkbox state changes, and assembles the final prompt text with fenced code blocks. `ContextFileTreeProvider` accepts optional `getModelLabel` and `getCompressionLabel` callbacks; when provided, `getChildren()` prepends three action items (Copy Prompt, Model, Compression) before the file list so the panel serves as a single unified section. Action items have no `checkboxState` and are visually distinct from file items. `ContextFileTreeProvider.refresh()` fires `onDidChangeTreeDataEmitter` to re-render the tree when model or compression changes. Exports `formatBudget(totalTokens, practicalTokenLimit)` which returns a compact string like `12,345 / 25K (49%)` — percentage is relative to the practical limit, not the hard cap. Depends on `compressor.js`, `fileReader.js`, and `vscode`.
- **[src/logFilter.js](src/logFilter.js)** — pure line filtering with no VS Code dependency. Exports `filterLines(text, pattern, options)` where `options` supports `invert`, `contextBefore`, `contextAfter`, and `flags` (regex flags string, e.g. `'i'` for case-insensitive); `escapePatternLiteral(str)` which escapes all regex metacharacters so a string matches literally in `filterLines`; `parseFilterHeader(firstLine)` which parses a filter result header and returns `{ chain, source, matched, total }` or `null`; `buildFilterHeader(chain, source, matchedCount, totalCount)` which produces a single-step or chained header string; and constants `FILTER_HEADER_TAG`, `CONTEXT_SEPARATOR`.
- **[src/logFilterContentProvider.js](src/logFilterContentProvider.js)** — `LogFilterContentProvider` implementing `TextDocumentContentProvider` for the `line-filter://` URI scheme. Filter results are opened as virtual read-only documents (VS Code never prompts to save them on close). Exports `LogFilterContentProvider` and `LOG_FILTER_SCHEME`. Static `createUri(counter)` produces URIs like `line-filter://result/filter-N.log`; the `.log` extension triggers VS Code's log language detection automatically. Depends on `vscode`.
- **[src/compressor.js](src/compressor.js)** — pure text compression logic with no VS Code dependency. Exports `compress(text, filePath, compressionModeId)` and `getLanguageTag(filePath)`. Supports four modes: `none`, `stripComments`, `collapseWhitespace`, and `signaturesOnly` (with separate extractors for Python and brace-language grammars). Extension-to-language metadata is stored in a single `EXTENSION_METADATA` map shared by both `detectLanguage` and `getLanguageTag`.
- **[src/relatedFilesResolver.js](src/relatedFilesResolver.js)** — pure text analysis with no VS Code dependency. Exports `extractRelativeImportSpecifiers(text, filePath)`, `buildCandidatePaths(specifier, importingFileDir)`, and `buildTestCandidatePaths(activeFilePath)`. Used by the `suggestRelatedFiles` command to find imported modules and adjacent test files for the active editor without any AI or API calls.
- **[src/presetManager.js](src/presetManager.js)** — pure preset storage logic with no VS Code dependency. Exports `getAllPresets(storage)`, `savePreset(storage, name, relativePaths)`, `deletePreset(storage, name)`, and `derivePresetNameSuggestion(uriStrings, workspaceRootFsPath)`. Presets are stored in `workspaceState` as workspace-relative paths under `PRESETS_STORAGE_KEY`. Used by the `managePresets` command.
- **[src/templateManager.js](src/templateManager.js)** — pure prompt template storage with no VS Code dependency. Exports `getAllTemplates(storage)`, `saveTemplate(storage, name, body)` (returns the slugified id), `deleteTemplate(storage, id)`, and `slugifyTemplateName(name)`. Templates are stored in `globalState` (user-wide, not project-specific) under `TEMPLATES_STORAGE_KEY`.
- **[src/filterPanelProvider.js](src/filterPanelProvider.js)** — `FilterPanelProvider` for the Line Filter sidebar section. Constructor accepts a `getContextLines` callback. Shows two collapsible groups: Filter Summary (parses the current document's filter header via `parseFilterHeader` from `logFilter.js` and displays the source filename, each chain step with its position, and the match count) and Actions (four clickable items: "Keep matching lines...", "Remove matching lines...", a selection-aware "From selection" item that shows a preview of the current selection, and a "Context: N lines" item that fires `setContextLines`). Exports `FilterPanelProvider` and the pure helper `buildFilterState(firstLine)` which wraps `parseFilterHeader` and returns `{ hasFilter, chain, source, matched, total }` or `{ hasFilter: false }`. `FilterPanelProvider.refresh()` is called from `extension.js` after any filter command completes, on every active editor change, and on every text-selection change (debounced 150ms).

Key design points:

- **Status bar item** is created on `activate` and shows a live token count with a `$(symbol-numeric)` icon. Clicking it triggers `token-budget-builder.countTokens`, which shows the count as an information message. When context files are loaded, the status bar shows `total / practicalK  •  Model` with three visual zones: normal (within practical limit), warning background (over practical limit but within hard cap), and error background (over hard cap). The denominator switches to the hard cap only in the error zone. Tooltip text explains the zone and always includes the hard cap for reference.
- **Token counting** calls `encode(text).length` from `gpt-tokenizer` — synchronous, no API calls.
- **Live updates** are debounced 300ms on `onDidChangeTextDocument` to avoid recomputing on every keystroke.
- **Folder token count** is triggered from the Explorer right-click menu. Progress is shown via `vscode.window.withProgress` during async file traversal.
- **Activation** — `activationEvents` is set to `[]` in `package.json`. VS Code 1.74+ infers activation events from `contributes` entries automatically; an explicit `"*"` (activates on every workspace open) is deprecated and must not be used.
- **Context Files sidebar section** — the single `TreeView` (`token-budget-builder-files`) powered by `ContextFileTreeProvider`. The provider always returns three action items at the top (Copy Prompt, Model, Compression) followed by the checked file list. Action items have `ThemeIcon` paths and fire existing commands on click; they carry no `checkboxState` so no checkbox is rendered for them. `contextFileTreeProvider.refresh()` is called inside `refreshContextDisplay()` so the model and compression labels update whenever the user switches model or compression mode.
- **Prompt Templates sidebar section** — a second `TreeView` (`token-budget-builder-templates`). `PromptTemplateItem.contextValue` is `'promptTemplate'`, which gates the Edit/Remove inline context menu entries. Clicking an item opens a webview panel (`openTemplate`) showing the template body in an editable textarea — the user can fill in placeholders and copy to clipboard; changes are discarded on close and never written back to storage. Template creation and editing writes a draft file to `context.globalStorageUri/template-draft.md` (extension-private storage, invisible to users) and opens it in the editor. An `onDidSaveTextDocument` listener auto-saves the draft to `globalState` when the user presses Ctrl+S, then deletes the draft file and closes the tab. An `onDidCloseTextDocument` listener cleans up the draft file if the user closes the editor without saving.
- **Line Filter sidebar section** — a third `TreeView` (`token-budget-builder-filter`). Uses `FilterPanelProvider` from `filterPanelProvider.js`. Shows a "Filter Summary" group (reads the active editor's first line to detect and display the filter chain; shows "No filter result open" when the active document is not a filter result) and an "Actions" group (always visible; four items). Filter results open as virtual documents via `LogFilterContentProvider` on the `line-filter://` scheme; they are read-only and VS Code never prompts to save them. Input defaults to literal text search (case-insensitive); wrapping input in `/slashes/` activates regex mode (e.g. `/\bERROR\b/i`). Context lines (lines shown around each match) is a persistent workspace setting defaulting to 0, changeable from the panel. Refreshed on every active editor change, every selection change (debounced 150ms), and immediately after any filter command completes.

The extension has no settings, no configuration, and no output channel — all output goes through the status bar, `showInformationMessage`, or the sidebar panel.
