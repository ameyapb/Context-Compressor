# Context Compressor — Product Plan

## Problem

Basic token counting for VS Code is a solved problem. At least five published extensions already show a live token count in the status bar. None of them help developers *act* on that count — there is no tool that lets you assemble a multi-file prompt, compress it locally, and stay within a model's context window without paying for an API call.

## Goal

Turn the extension from a passive token counter into an active prompt assembly tool. A developer working with any LLM (Claude, GPT-4, Gemini, etc.) should be able to:

1. Select the files relevant to their task.
2. Apply local compression to reduce token usage.
3. See exactly how much of the target model's context window they are filling.
4. Copy a clean, formatted prompt to the clipboard — ready to paste.

Everything runs locally. No API keys. No cost. No data leaves the machine.

---

## Competitive Landscape

| Extension | Token count | Multi-model | Multi-file assembly | Compression | Cost estimate |
|---|---|---|---|---|---|
| Live LLM Token Counter | Yes | Yes | No | No | No |
| Tokenlint | Yes | Yes | No | No | Yes |
| LLM Token Counter | Yes (codebase total) | Yes | No | No | No |
| LLM Tokenizer | Yes | 60+ models | No | No | No |
| **This extension (target)** | **Yes** | **Yes** | **Yes** | **Yes** | **No (free)** |

The gap is the assembly + compression workflow. Every competitor is a counter; this extension is a tool.

---

## Architecture

The extension will grow from three modules to five:

```
src/
  extension.js        — activation, command registration, status bar lifecycle (existing)
  models.js           — model definitions, encoder resolution, context window sizes (extend existing)
  folderCounter.js    — recursive file collection and aggregate token counting (existing)
  contextBuilder.js   — multi-file selection state, budget calculation, prompt formatting (new)
  compressor.js       — local, language-aware compression transformations (new)
```

A new TreeView panel (registered in `package.json` as a view container) replaces the Explorer-only right-click flow as the primary UI surface.

---

## Phases

### Phase 1 — Multi-file Context Builder (TreeView panel)

**What it does:**
A side panel lists workspace files. The user checks files to include. A live token budget bar shows `X / <context window>` for the selected model. No network call — pure token arithmetic.

**Technical approach:**
- Register a `TreeDataProvider` that mirrors the workspace file tree.
- Each `TreeItem` has a checkbox state (VS Code 1.90+ supports native checkbox on tree items).
- On check/uncheck, recount tokens for all selected files and update a status bar item and a dedicated progress bar in the panel.
- Context window sizes are stored as constants in `models.js` alongside the existing model definitions.

**Acceptance criteria:**
- Selecting 5 files shows their combined token count and percentage of the active model's context window.
- Switching the active model updates the budget bar in real time.
- Deselecting a file immediately removes its tokens from the total.

---

### Phase 2 — Local Compression Engine

**What it does:**
Three compression modes that transform file text locally before token counting or copying. Each mode shows a before/after token delta so the user can see the savings.

**Modes:**

| Mode | What it removes | Typical savings |
|---|---|---|
| Strip comments | Line and block comments for JS/TS/Python/Go/Rust/C | 5–20% |
| Collapse whitespace | Blank lines, trailing spaces, redundant indentation | 3–10% |
| Signatures only | Function and class bodies, keep only signatures and docstrings | 40–70% |

**Technical approach:**
- All transformations are pure string functions in `compressor.js` — input text, output text.
- Language is detected from the file extension.
- Comment stripping uses language-specific regex patterns (no external parser dependency needed for the common cases).
- Signature extraction uses indentation heuristics for Python and brace counting for C-family languages; accurate enough for token reduction without requiring a full AST.
- The compression mode is a setting stored in VS Code workspace state, not a global config file.

**Acceptance criteria:**
- Stripping comments from a JS file with heavy JSDoc reduces token count visibly.
- Signatures-only mode on a 500-line Python file retains all `def` and `class` lines plus their first docstring line.
- Unknown file extensions pass through unchanged (no error).

---

### Phase 3 — Prompt Assembly and Clipboard Copy

**What it does:**
One button in the TreeView panel: assemble all checked files (with the active compression applied), wrap each in a labelled markdown code block, and copy the result to the clipboard.

**Output format:**
```
### src/extension.js
```js
<file content here>
```

### src/compressor.js
```js
<file content here>
```
```

**Technical approach:**
- Assembly is a single reduce over the checked file list in `contextBuilder.js`.
- If the assembled token count exceeds the model's context window, the copy button is disabled and a warning is shown inline in the panel — no silent truncation.
- The language tag on each code block is derived from the file extension via a small lookup table.

**Acceptance criteria:**
- Copying 3 checked files produces a clipboard string with each file under its own heading.
- Exceeding the context window disables the copy button and shows the overage in tokens.
- Empty files are skipped silently.

---

### Phase 4 — Smart File Suggestions (local heuristics)

**What it does:**
When the user opens a file, the panel highlights suggested related files to include in the prompt. Suggestions are ranked by a relevance-per-token ratio so the user gets the most context for the fewest tokens.

**Signals used (all local, no LLM):**

| Signal | How it is computed |
|---|---|
| Import graph | Parse `import`/`require`/`from` statements in the active file and trace one level of dependencies |
| Git recency | Run `git log --name-only -n 20 HEAD` and surface files that appear in the same commits as the active file |
| Directory proximity | Files in the same directory or immediate parent directory |

**Ranking formula:**
```
score = (number of signals matching) / (token count of file)
```
Files with a high score appear at the top of the suggestion list with a visual indicator.

**Technical approach:**
- Import parsing uses regex sufficient for JS/TS/Python/Go — not a full AST. Relative paths are resolved against the workspace root.
- Git log is called via `child_process.execFile` with a fixed argument list (no shell interpolation) pointing at the workspace root.
- Suggestions update when the active editor changes (debounced 500ms).

**Acceptance criteria:**
- Opening `extension.js` surfaces `models.js` and `folderCounter.js` as suggestions because they are imported.
- A file with 100 tokens and two matching signals ranks above a file with 2000 tokens and three matching signals.
- If git is not available, the git signal is silently skipped — no error surfaced to the user.

---

### Phase 5 — Diff-aware Context Mode

**What it does:**
Instead of sending an entire file, extract only the changed hunks from `git diff HEAD` plus a configurable number of surrounding context lines. Show the token delta vs. sending the full file so the user can decide which mode to use.

**Technical approach:**
- Run `git diff HEAD -- <filepath>` via `child_process.execFile`.
- Parse the unified diff output to extract changed line ranges plus N surrounding lines (default: 10).
- Token count both the full file and the diff slice; display both in the panel.
- The clipboard copy respects whichever mode is active per file.

**Acceptance criteria:**
- A file with one changed function shows only that function's hunk plus 10 surrounding lines in diff mode.
- The panel shows `Full: 1 200 tokens | Diff: 80 tokens` for that file.
- If the file has no uncommitted changes, diff mode falls back to full mode automatically.

---

## Build Order Rationale

Phases 1–3 together form a shippable v1 that is already more capable than every competing extension. Phases 4–5 deepen the moat:

- **Ship after Phase 3:** prompt assembly with compression, zero API cost, clearly differentiated.
- **Ship after Phase 5:** the only extension that surfaces relevant files and can send minimal diffs instead of whole files.

---

## Constraints

- **No paid APIs.** All computation is local. The extension must work fully offline.
- **No new dependencies without approval.** The existing `gpt-tokenizer` dependency is sufficient for all token counting. Compression and parsing use built-in string operations.
- **All existing coding rules apply.** See `CLAUDE.md` for the full list (DRY, named constants, no magic strings, no comments that restate code, etc.).
- **Security.** File content is read only to count tokens or build the clipboard string. It is never logged, stored beyond the current operation, or transmitted.
