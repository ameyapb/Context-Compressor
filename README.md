# Cabin Kit

[![Version](https://img.shields.io/visual-studio-marketplace/v/Uchiha-Labs.token-budget-builder?color=007ACC&label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=Uchiha-Labs.token-budget-builder)

Assemble, compress, and copy multi-file AI context with a live token budget. No API keys. Runs entirely in VS Code.

**TL;DR:** pick files, see your token count live, compress if needed, copy a clean multi-file prompt. Everything stays on your machine.

![Cabin Kit](media/screenshot-hero.png)

## Features at a glance

- **Context Builder** -- file picker with live token count, four compression modes, named presets, and one-click prompt assembly; add files from the sidebar or via Explorer right-click
- **Prompt Templates** -- reusable scaffolds with placeholder support; fill in values and copy without storing anything permanently
- **Line Filter** -- regex log filter with chain support, per-step match counts, and configurable context lines around each match
- **SQLite Viewer** -- browse any `.sqlite` or `.db` file as a searchable, sortable, paginated table directly inside VS Code
- **Team Tracker** -- lightweight board for links, tasks, and notes, stored in VS Code global state

## Getting started

1. Open the Cabin Kit panel in the Activity Bar.
2. Add files using the toolbar icons or by right-clicking a file or folder in the Explorer.
3. Choose a model and compression mode in the panel, then click **Copy Prompt**.

To count tokens for a file or folder without adding it to context, right-click in the Explorer and choose **Count Tokens in Selection**.

## Context Builder

![Context Files panel](media/screenshot-context.png)

Tracks a token budget across every file you add, shows the live count in the status bar, and assembles the final prompt in one formatted block.

**Status bar:** displays as `12,345 / 25K (49%)` where the denominator is the practical token limit for the selected model. Shifts to warning when you approach the limit and error when you exceed the hard context window.

**Presets:** save the current file list by name and reload it in one click. Presets are workspace-specific and stored locally.

**Prompt format:** each file is wrapped in a fenced code block with its path as a label. Copied to clipboard; never written to disk.

## Compression modes

| Mode | What it removes |
|---|---|
| None | nothing |
| Strip Comments | Line and block comments (JS/TS/Python/Go/Rust/C) |
| Collapse Whitespace | Blank lines and trailing spaces |
| Signatures Only | Function and class bodies; keeps signatures and docstrings |

Compression is applied per file at copy time. The token count in the sidebar reflects the compressed size.

## Filter large log files by regex pattern

![Line Filter chain](media/screenshot-filter.png)

Narrows any text file down to the lines you need without modifying the source. Open the Line Filter panel and click "Keep matching lines..." or "Remove matching lines...", or right-click any open file in the editor. Select text first and click "From selection" to use it as the pattern directly.

Results open as read-only tabs. Filter a result again to chain steps -- the history panel shows the full chain with per-step counts, e.g. `ERROR (42) > auth (5)`.

**Input format:** plain text matches case-insensitively as a literal. Wrap in `/slashes/` for regex with optional flags: `/\bERROR\b/i`.

**Context lines:** click "Context: N lines" to include N lines above and below each match, like `grep -C`.

## Supported models

| Model | Encoding | Context window |
|---|---|---|
| GPT-4o / GPT-4o mini | o200k_base | 128,000 |
| o1 / o3 | o200k_base | 200,000 |
| GPT-4 / GPT-4 Turbo | cl100k_base | 128,000 |
| GPT-3.5 Turbo | cl100k_base | 16,385 |
| Claude (approximation) | cl100k_base | 200,000 |
| Gemini 1.5 Pro (approximation) | cl100k_base | 1,000,000 |

Token counting uses `gpt-tokenizer` locally. The status bar tracks both the hard context window and a practical limit (12K to 30K) above which output quality tends to degrade. Claude and Gemini counts are approximations.

## Browse SQLite files in VS Code

![SQLite Viewer](media/screenshot-sqlite.png)

Right-click any `.sqlite` or `.db` file in the Explorer and choose **Open in SQLite Viewer**. Search across all non-binary columns, sort, apply per-column filters, and copy cell values. BLOB columns show byte size only. The viewer is read-only.

## No API keys. No telemetry.

Token counting runs locally with no network calls. File content is read only to count tokens and build the clipboard prompt -- never stored, logged, or transmitted. No analytics of any kind. Safe for proprietary codebases and air-gapped environments.
