# Token Budget Builder

Assemble, compress, and copy multi-file prompts — with a live token budget for any model.

Instead of copying files into a chat window and guessing whether you fit under the context limit, Token Budget Builder lets you pick the files that matter, compress them locally to reduce token usage, and copy a clean formatted prompt to the clipboard in one click. No API keys. Everything runs locally.

## Features

- Live token count in the status bar for the active file
- Sidebar panel to build a multi-file context list with per-file token counts
- Context budget bar showing `used / limit` for the selected model
- Four compression modes to shrink token usage before copying
- Clipboard assembly — all selected files wrapped in labelled fenced code blocks, ready to paste
- Right-click any file or folder in the Explorer to count tokens or add to context
- Supports GPT-4o, o1, GPT-4, GPT-3.5 Turbo, and Claude (approximated)

## How to Use

1. Open the **Token Budget Builder** panel in the Activity Bar.
2. Right-click files or folders in the Explorer and choose **Add to Context**, or use the **+** button in the panel toolbar.
3. Check or uncheck files to include or exclude them. The token count updates in real time.
4. Pick a compression mode via the gear icon if you need to reduce token usage.
5. Click the copy icon to assemble all included files and copy the prompt to your clipboard.

To count tokens in a file or folder without adding it to context, right-click in the Explorer and choose **Token Budget Builder: Count Tokens in Selection**.

To switch model, run **Token Budget Builder: Select Model** from the Command Palette. The selection is saved across sessions.

## Compression Modes

| Mode | What it removes | Typical savings |
|---|---|---|
| None | — | — |
| Strip Comments | Line and block comments (JS/TS/Python/Go/Rust/C) | 5–20% |
| Collapse Whitespace | Blank lines and trailing spaces | 3–10% |
| Signatures Only | Function and class bodies — keeps signatures and docstrings | 40–70% |

## Supported Models

| Model | Encoding | Context window |
|---|---|---|
| GPT-4o / GPT-4o mini | o200k_base | 128 000 |
| o1 / o3 | o200k_base | 200 000 |
| GPT-4 / GPT-4 Turbo | cl100k_base | 128 000 |
| GPT-3.5 Turbo | cl100k_base | 16 385 |
| Claude (approximation) | cl100k_base | 200 000 |

Claude token counts use the cl100k_base encoding and will not be exact.

## Privacy

All computation is local. File content is read only to count tokens or build the clipboard string. Nothing is stored, logged, or transmitted.
