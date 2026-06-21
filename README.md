# Token Budget Builder

[![Version](https://img.shields.io/visual-studio-marketplace/v/Uchiha-Labs.token-budget-builder?color=007ACC&label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=Uchiha-Labs.token-budget-builder)

Assemble, compress, and copy multi-file prompts with a live token budget for any model.

Instead of pasting files into a chat window and guessing whether you fit under the context limit, Token Budget Builder lets you pick the files that matter, compress them locally, and copy a clean formatted prompt to the clipboard in one click. No API keys. Everything runs locally.

![Token Budget Builder](media/screenshot.png)

## How to Use

1. Open the **Context Compressor** panel in the Activity Bar.
2. In **Context Files**, add files via the toolbar or by right-clicking in the Explorer.
3. Check or uncheck files to include or exclude them. The token budget updates in real time.
4. In **Build Prompt**, click **Model** or **Compression** to adjust settings, then click **Copy Prompt** to assemble and copy.

To count tokens in a file or folder without adding it to context, right-click in the Explorer and choose **Count Tokens in Selection**.

## Compression Modes

| Mode | What it removes |
|---|---|
| None | nothing |
| Strip Comments | Line and block comments (JS/TS/Python/Go/Rust/C) |
| Collapse Whitespace | Blank lines and trailing spaces |
| Signatures Only | Function and class bodies; keeps signatures and docstrings |

## Supported Models

| Model | Encoding | Context window |
|---|---|---|
| GPT-4o / GPT-4o mini | o200k_base | 128 000 |
| o1 / o3 | o200k_base | 200 000 |
| GPT-4 / GPT-4 Turbo | cl100k_base | 128 000 |
| GPT-3.5 Turbo | cl100k_base | 16 385 |
| Claude (approx.) | cl100k_base | 200 000 |
