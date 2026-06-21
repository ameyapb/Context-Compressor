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

**File structure** — Keep one concern per module. If a file grows beyond a single clear responsibility, split it. Follow VS Code extension conventions: activation logic in `extension.js`, pure utilities extracted to separate files under `src/`.

**Security** — Never log or expose document content. The extension reads file text only to count tokens; that text must never be stored, transmitted, or surfaced beyond the immediate computation. Follow the principle of least privilege for any VS Code API usage.

**Dependencies** — Always ask before installing a new library. Prefer using VS Code's built-in APIs or already-present dependencies. If a new dependency is approved, document why it was added.

**No dead code** — Delete unused functions, variables, imports, and branches immediately. Do not comment out code or leave it behind "just in case". If it is not used, it does not belong in the codebase.

**Production mindset** — Every change must be treated as if it ships to production the next day. No half-finished logic, no debug leftovers, no disabled safety checks.

**Tests** — Every new module or exported function must have a corresponding test file in `test/` added in the same change. Run `npm test` before considering any implementation complete; all tests must pass. Pure modules (no VS Code dependency) are always testable — there is no excuse to skip.

**Keep this file updated** — Update this file in the same change whenever: the architecture changes (new module, renamed export, new command), a coding rule is added or modified, or a development workflow step changes.

## Architecture

The extension is split across eleven modules under `src/`:

- **[src/extension.js](src/extension.js)** — activation, command registration, status bar lifecycle. The only module that has no VS Code-free counterpart; all command handlers live here. Registers sixteen commands: `countTokens`, `selectModel`, `countFolderTokens`, `addToContext`, `addActiveFileToContext`, `removeFromContext`, `clearContext`, `setCompressionMode`, `assemblePrompt`, `suggestRelatedFiles`, `managePresets`, `newTemplate`, `saveActiveDocumentAsTemplate`, `editTemplate`, `removeTemplate`, `openTemplate`. Also defines `PromptTemplateItem` and `PromptTemplateTreeProvider` for the Prompt Templates sidebar section. Creates three tree views: `token-budget-builder-files` (Context Files), `token-budget-builder-build` (Build Prompt), and `token-budget-builder-templates` (Prompt Templates).
- **[src/buildPromptProvider.js](src/buildPromptProvider.js)** — `BuildPromptTreeProvider` for the Assemble & Copy sidebar section. Exposes three static tree items — Model, Compression, Copy Prompt — each wired to an existing command via its `command` property and a tooltip explaining what clicking it does. Constructor accepts `getModelLabel` and `getCompressionLabel` callbacks so the provider stays free of direct imports from `contextBuilder.js`. Exports `BuildPromptTreeProvider`. No VS Code dependency on the logic; depends on `vscode` only for `TreeItem`, `TreeItemCollapsibleState`, and `EventEmitter`.
- **[src/models.js](src/models.js)** — model definitions and encoder resolution. Exports `SUPPORTED_MODELS`, `DEFAULT_MODEL_ID`, `getEncoderForModel`, and `getModelById`. Each model carries `contextWindow` (hard token limit) and `practicalTokenLimit` (research-backed quality threshold, 12K–30K, above which LLM output tends to degrade regardless of the available window). No VS Code dependency.
- **[src/fileReader.js](src/fileReader.js)** — shared utility for reading a VS Code URI as UTF-8 text. Exports `readFileAsText(uri)`, returning the file contents as a string or `null` on any error (binary, missing, or permission failure). Used by both `folderCounter.js` and `contextBuilder.js` to avoid duplicating the read-and-decode pattern. Depends on `vscode`.
- **[src/gitignoreFilter.js](src/gitignoreFilter.js)** — pure `.gitignore` parsing and pattern matching with no VS Code dependency. Exports `loadGitignorePatterns(rootFsPath)` (reads the root `.gitignore` and returns parsed pattern strings), `isIgnoredByGitignorePatterns(patterns, relativePath)`, and lower-level helpers `parseGitignoreContent` and `matchesGitignorePattern`. Used by `folderCounter.js` and the `addToContext` command to skip ignored files during folder traversal.
- **[src/folderCounter.js](src/folderCounter.js)** — recursive file collection and aggregate token counting for the Explorer context menu command. Uses `vscode.workspace.fs` to read directories and files. Binary files are skipped silently (UTF-8 decode failure returns 0). Overlapping selections (e.g. a folder and a file inside it) are deduplicated by URI. Depends on `vscode` and `gitignoreFilter.js`.
- **[src/contextBuilder.js](src/contextBuilder.js)** — manages the context file list shown in the sidebar tree view (`ContextFileTreeProvider`). Tracks which files are included, computes per-file token counts, handles checkbox state changes, and assembles the final prompt text with fenced code blocks. Exports `formatBudget(totalTokens, practicalTokenLimit)` which returns a compact string like `12,345 / 25K (49%)` — percentage is relative to the practical limit, not the hard cap. Depends on `compressor.js`, `fileReader.js`, and `vscode`.
- **[src/compressor.js](src/compressor.js)** — pure text compression logic with no VS Code dependency. Exports `compress(text, filePath, compressionModeId)` and `getLanguageTag(filePath)`. Supports four modes: `none`, `stripComments`, `collapseWhitespace`, and `signaturesOnly` (with separate extractors for Python and brace-language grammars). Extension-to-language metadata is stored in a single `EXTENSION_METADATA` map shared by both `detectLanguage` and `getLanguageTag`.
- **[src/relatedFilesResolver.js](src/relatedFilesResolver.js)** — pure text analysis with no VS Code dependency. Exports `extractRelativeImportSpecifiers(text, filePath)`, `buildCandidatePaths(specifier, importingFileDir)`, and `buildTestCandidatePaths(activeFilePath)`. Used by the `suggestRelatedFiles` command to find imported modules and adjacent test files for the active editor without any AI or API calls.
- **[src/presetManager.js](src/presetManager.js)** — pure preset storage logic with no VS Code dependency. Exports `getAllPresets(storage)`, `savePreset(storage, name, relativePaths)`, `deletePreset(storage, name)`, and `derivePresetNameSuggestion(uriStrings, workspaceRootFsPath)`. Presets are stored in `workspaceState` as workspace-relative paths under `PRESETS_STORAGE_KEY`. Used by the `managePresets` command.
- **[src/templateManager.js](src/templateManager.js)** — pure prompt template storage with no VS Code dependency. Exports `getAllTemplates(storage)`, `saveTemplate(storage, name, body)` (returns the slugified id), `deleteTemplate(storage, id)`, and `slugifyTemplateName(name)`. Templates are stored in `globalState` (user-wide, not project-specific) under `TEMPLATES_STORAGE_KEY`.

Key design points:

- **Status bar item** is created on `activate` and shows a live token count with a `$(symbol-numeric)` icon. Clicking it triggers `token-budget-builder.countTokens`, which shows the count as an information message. When context files are loaded, the status bar shows `total / practicalK  •  Model` with three visual zones: normal (within practical limit), warning background (over practical limit but within hard cap), and error background (over hard cap). The denominator switches to the hard cap only in the error zone. Tooltip text explains the zone and always includes the hard cap for reference.
- **Token counting** calls `encode(text).length` from `gpt-tokenizer` — synchronous, no API calls.
- **Live updates** are debounced 300ms on `onDidChangeTextDocument` to avoid recomputing on every keystroke.
- **Folder token count** is triggered from the Explorer right-click menu. Progress is shown via `vscode.window.withProgress` during async file traversal.
- **Activation** — `activationEvents` is set to `[]` in `package.json`. VS Code 1.74+ infers activation events from `contributes` entries automatically; an explicit `"*"` (activates on every workspace open) is deprecated and must not be used.
- **Assemble & Copy sidebar section** — a second `TreeView` (`token-budget-builder-build`) sits between Context Files and Prompt Templates. Its three rows (Model, Compression, Copy Prompt) each fire an existing command on click. `BuildPromptTreeProvider.refresh()` is called inside `refreshContextDisplay()` so the model and compression labels stay in sync.
- **Prompt Templates sidebar section** — a third `TreeView` (`token-budget-builder-templates`) lives at the bottom of the same activity bar container. `PromptTemplateItem.contextValue` is `'promptTemplate'`, which gates the Edit/Remove inline context menu entries. Clicking an item opens a webview panel (`openTemplate`) showing the template body in an editable textarea — the user can fill in placeholders and copy to clipboard; changes are discarded on close and never written back to storage. Template creation and editing writes a draft file to `context.globalStorageUri/template-draft.md` (extension-private storage, invisible to users) and opens it in the editor. An `onDidSaveTextDocument` listener auto-saves the draft to `globalState` when the user presses Ctrl+S, then deletes the draft file and closes the tab. An `onDidCloseTextDocument` listener cleans up the draft file if the user closes the editor without saving.

The extension has no settings, no configuration, and no output channel — all output goes through the status bar, `showInformationMessage`, or the sidebar panel.
