# Cabin Kit

[![Version](https://img.shields.io/visual-studio-marketplace/v/Uchiha-Labs.token-budget-builder?color=007ACC&label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=Uchiha-Labs.token-budget-builder)

Assemble, compress, and copy multi-file AI context with a live token budget. No API keys. Runs entirely in VS Code.

Managing your context window is frustrating when you are guessing at your token budget. Unlike standalone token counters that only give you a number, Cabin Kit is a prompt builder that tracks your token count live as you add files, compresses them locally to reduce size, and packages everything into a clean multi-file prompt with one click. No API key required. No document content ever leaves your machine.

![Cabin Kit](media/screenshot-hero.png)

## Why use it

- **You paste files into ChatGPT and never know if you hit the limit.** The status bar shows your live token budget before you copy, so you know exactly where you stand before sending.
- **Your log files are too large to fit in context.** Use the built-in log filter to narrow down to the lines that matter with regex, chain filters to narrow further, then add the trimmed result to your AI context.
- **You rebuild the same set of files from scratch every session.** Save your current context as a named preset and reload it in one click -- the extension stores the file list and model choice for you.
- **You need to check a .sqlite database without leaving VS Code.** The built-in viewer browses tables, runs searches, and applies column filters without a separate app.

## Features at a glance

- **Context Builder** -- file picker with live token count, four context compression modes, named presets, and one-click multi-file prompt assembly; add files from the sidebar toolbar or via Explorer right-click
- **Prompt Templates** -- reusable prompt engineering scaffolds with placeholder support; fill in values and copy without storing anything permanently
- **Line Filter** -- regex log filter with chain support, per-step match counts in the history panel, and configurable context lines above and below each match
- **SQLite Viewer** -- browse any `.sqlite` or `.db` file as a searchable, sortable, paginated table directly inside VS Code
- **Team Tracker** -- lightweight shared board for links, tasks, and notes, stored in VS Code global state

## Getting started

1. Open the Cabin Kit panel in the Activity Bar.
2. Add files using the toolbar icons or by right-clicking a file or folder in the Explorer.
3. Choose a model and compression mode in the panel, then click **Copy Prompt**.

To count tokens for a file or folder without adding it to context, right-click in the Explorer and choose **Count Tokens in Selection**.

## Context Builder

![Context Files panel](media/screenshot-context.png)

The Context Builder is the core of Cabin Kit. It tracks a token budget across every file you add, shows the live count in the status bar, and assembles the final prompt in one formatted block.

**Status bar:** the count displays as `12,345 / 25K (49%)` where the denominator is the practical token limit for the selected model. The bar shifts to a warning color when you approach the limit and to an error color when you exceed the hard context window. Clicking the count opens it as an information message.

**Presets:** click the save icon in the Context Files panel to name and store the current file list. Reopen it from the same panel. Presets are workspace-specific and stored locally.

**Prompt format:** each file is wrapped in a fenced code block with its path as a label. The assembled prompt is copied to the clipboard and never written to disk.

## Compression modes

Use context compression to reduce token count without losing the structure of your code. Four modes let you trade fidelity for size depending on what the AI needs from each file:

| Mode | What it removes |
|---|---|
| None | nothing |
| Strip Comments | Line and block comments (JS/TS/Python/Go/Rust/C) |
| Collapse Whitespace | Blank lines and trailing spaces |
| Signatures Only | Function and class bodies; keeps signatures and docstrings |

Compression is applied per file at copy time. The token count in the sidebar reflects the compressed size, not the raw file size.

## Filter large log files by regex pattern

Large log files do not fit in any context window. The Line Filter tool narrows any text file down to just the lines you need before you add it to context, without modifying the source file.

![Line Filter chain](media/screenshot-filter.png)

**From the sidebar** (Line Filter panel): click "Keep matching lines..." or "Remove matching lines..." to enter a pattern. Select text first and click "From selection" to use the selection directly as the pattern.

**From the editor** right-click menu: "Keep Matching Lines" and "Remove Matching Lines" are available in any open file.

Results open as read-only tabs with a `.log` extension. Filter a result again to chain steps -- the Filter Summary panel shows the full chain with per-step match counts, for example `ERROR (42) > auth (5)`. Chain as many steps as needed; each step is recorded in the history.

**Input format:** plain text is matched case-insensitively as a literal string. Wrap in `/slashes/` for a regex pattern with optional flags: `/\bERROR\b/i`.

**Context lines:** click "Context: N lines" in the panel to include N lines above and below each match, similar to `grep -C`.

**Save result:** click "Save result to file..." in the panel to write the filtered output to a real file.

## Supported models

Token counting is done locally using `gpt-tokenizer`. The status bar tracks two values for each model: the hard context window size (the absolute token limit the model enforces) and a practical token limit (a research-backed threshold, typically 12K to 30K, above which LLM output quality tends to degrade even when the hard limit has not been reached). Both boundaries are reflected in the status bar color zones.

| Model | Encoding | Context window |
|---|---|---|
| GPT-4o / GPT-4o mini | o200k_base | 128,000 |
| o1 / o3 | o200k_base | 200,000 |
| GPT-4 / GPT-4 Turbo | cl100k_base | 128,000 |
| GPT-3.5 Turbo | cl100k_base | 16,385 |
| Claude (approximation) | cl100k_base | 200,000 |
| Gemini 1.5 Pro (approximation) | cl100k_base | 1,000,000 |

Claude and Gemini token counts use cl100k_base as a close approximation; the actual tokenizer for each model may differ slightly from the displayed count.

## Browse SQLite files in VS Code

The built-in sqlite viewer vscode integration opens any `.sqlite` or `.db` file in a paginated table view directly inside the editor. No external database tool or connection string required.

![SQLite Viewer](media/screenshot-sqlite.png)

You can search across all non-binary columns, sort by any column, apply per-column filters (equals, contains, greater than, less than), and copy individual cell values to the clipboard. BLOB columns display their byte size rather than raw binary data. The viewer is read-only; your database is never modified.

To open: right-click any `.sqlite` or `.db` file in the Explorer and choose **Open in SQLite Viewer**, or run `Cabin Kit: Open SQLite Viewer` from the command palette and select a file.

## No API keys. No telemetry.

Unlike cloud-based llm tools that route your files through an external server, Cabin Kit runs entirely on your machine:

- Token counting uses `gpt-tokenizer` locally. No network calls are made. No API keys are required or accepted.
- File content is read only to count tokens and assemble the clipboard prompt. It is never stored beyond the immediate operation, logged, or transmitted outside VS Code.
- No analytics, no telemetry, no external requests of any kind.

This makes Cabin Kit safe for proprietary codebases, air-gapped environments, and any project where sending source code to a third-party server is not acceptable.
