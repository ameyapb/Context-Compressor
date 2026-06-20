# Context Compressor

Assemble, compress, and copy multi-file prompts — with a live token budget for any model.

Instead of manually copying files into a chat window and hoping you fit under the context limit, Context Compressor lets you select the files that matter, apply local compression to reduce token usage, and copy a clean formatted prompt to your clipboard in one click. No API keys. No cost. Everything runs locally.

## Features

- **Live token count** in the status bar for the active file
- **Sidebar panel** to build a multi-file context list with per-file token counts
- **Context budget bar** showing `X / <context window>` for the selected model
- **Four compression modes** to shrink token usage before copying
- **Clipboard assembly** — all selected files wrapped in labelled fenced code blocks, ready to paste
- **Explorer integration** — right-click any file or folder to count tokens or add to context
- **Multi-model support** — GPT-4o, o1, GPT-4, GPT-3.5 Turbo, and Claude

## How to Use

### Build a context

1. Open the **Context Compressor** panel in the Activity Bar (the list icon).
2. Right-click files or folders in the Explorer and choose **Add to Context**, or use the **+** button in the panel toolbar.
3. Check and uncheck files to include or exclude them. The token budget updates in real time.
4. Select a compression mode via the gear icon to reduce token usage.
5. Click the copy icon to assemble all included files and copy the prompt to your clipboard.

### Count tokens in a file or folder

Right-click any file or folder in the Explorer and choose **Context Compressor: Count Tokens in Selection**.

### Switch model

Click the token count in the status bar, or run **Context Compressor: Count Tokens in File** from the Command Palette, then use **Context Compressor: Select Model** to change the active model.

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

Claude token counts are approximated using the cl100k_base encoding and will not be exact.

## Commands

| Command | Description |
|---|---|
| `Context Compressor: Count Tokens in File` | Show token count for the active file |
| `Context Compressor: Select Model` | Change the active model |
| `Context Compressor: Count Tokens in Selection` | Count tokens across selected files/folders |
| `Add to Context` | Add selected files or folders to the context panel |
| `Remove from Context` | Remove a file from the context panel |
| `Clear Context` | Remove all files from the context panel |
| `Set Compression Mode` | Choose a compression mode |
| `Assemble & Copy Prompt` | Copy all included files as a formatted prompt |

## Privacy

All computation is local. File content is read only to count tokens or build the clipboard string. No data is stored, logged, or transmitted.
