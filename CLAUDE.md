# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A VS Code extension that displays a real-time GPT-4 token count for the active file in the status bar. It uses the `cl100k_base` encoding (via `gpt-tokenizer`) — the same encoding used by GPT-4 and Claude's tokenizer approximations.

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

There are no automated tests and no lint scripts defined.

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

**Production mindset** — Every change must be treated as if it ships to production the next day. No half-finished logic, no debug leftovers, no disabled safety checks.

**Keep this file updated** — If a change is made that alters any of the above rules or the architecture described below, update this file in the same commit.

## Architecture

The entire extension lives in [src/extension.js](src/extension.js). Key design points:

- **Status bar item** is created on `activate` and shows a live token count with a `$(symbol-numeric)` icon. Clicking it triggers `context-compressor.countTokens`, which shows the count as an information message.
- **Token counting** calls `encode(text).length` from `gpt-tokenizer` — synchronous, no API calls.
- **Live updates** are debounced 300ms on `onDidChangeTextDocument` to avoid recomputing on every keystroke.
- **`activationEvents: ["*"]`** means the extension activates for every workspace, not lazily on command.

The extension has no settings, no configuration, and no output channel — all output goes through the status bar or `showInformationMessage`.
