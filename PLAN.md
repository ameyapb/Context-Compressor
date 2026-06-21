# UX Improvement Plan

## Problem

The Context Files panel is doing too much. It has 8 toolbar icons (add, suggest related, add active file, compression mode, assemble & copy, presets, model selection, clear), which is too many actions crammed into one toolbar. There is no clear separation between "managing what goes in" vs. "configuring how it comes out." A new user has no obvious starting point.

## Proposed Three-Panel Structure

```
Context Compressor (activity bar container)
  |
  |-- [1] Context Files      (what files are included)
  |-- [2] Build Prompt       (how to assemble and copy — NEW)
  |-- [3] Prompt Templates   (reusable template wrappers — unchanged)
```

### Panel 1: Context Files (trimmed down)

Toolbar keeps only file-management actions:

| Icon | Command |
|---|---|
| $(add) | Add files via dialog |
| $(file-add) | Add active editor file |
| $(type-hierarchy-sub) | Suggest related files |
| $(bookmark) | Manage presets |
| $(clear-all) | Clear all |

The panel's description still shows the live budget string (e.g. `12,345 / 25K (49%)`).

### Panel 2: Build Prompt (new)

A tree view with interactive rows. Each row is a tree item with a command fired on click.

| Row label (rendered as tree item) | Behavior on click |
|---|---|
| Model: GPT-4o | Opens model picker quickpick |
| Compression: None | Opens compression mode picker |
| Copy Prompt | Runs assemble & copy |

The view's `description` field shows the live budget string so the user always sees `tokens / limit` at a glance from the panel header.

Toolbar has one button: $(copy) Assemble & Copy (the primary CTA).

This panel makes the output/settings step its own explicit stage. A new user reads top-to-bottom: pick files → configure output → copy.

### Panel 3: Prompt Templates (unchanged)

No changes needed.

## Implementation Steps

1. **package.json** — add a third view `token-budget-builder-build` inside the existing sidebar container. Redistribute `view/title` menu entries: remove `setCompressionMode`, `assemblePrompt`, `selectModel` from the Context Files toolbar; add `assemblePrompt` to the Build Prompt toolbar.

2. **src/buildPromptProvider.js** (new module) — `BuildPromptTreeProvider` with three static tree items (model row, compression row, copy row). Each item has a `command` property so clicking it fires the appropriate command. Provider exposes a `refresh()` method called alongside `refreshContextDisplay()`. Update CLAUDE.md architecture section.

3. **extension.js** — register `BuildPromptTreeProvider`, create the tree view, call `buildPromptProvider.refresh()` inside `refreshContextDisplay()`. No command logic changes; all existing command handlers stay.

4. **README rewrite** — concise, human prose. Remove the "—" cells from tables. Trim the How to Use section to match the new three-panel flow.

5. **viewsWelcome** — add a welcome message for `token-budget-builder-build` (shown while context is empty, guiding user to add files first). Update the existing Context Files welcome message to remove references to compression and copy (those now live in panel 2).

## README Rewrite Goals

- Lead with what it solves, not what it is.
- No em-dashes (—) used as table cell fillers.
- No passive constructions like "can be triggered."
- Under 50 lines.
- Tables stay (they are genuinely useful for scanning models/compression modes) but cells that currently contain "—" get "n/a" or a short plain-language value.
- Remove the "Privacy" section header; fold it into a single sentence at the end.

## What Does Not Change

- All command logic in extension.js
- All src/ modules except extension.js (no logic changes needed in contextBuilder, compressor, etc.)
- The Prompt Templates panel (panel 3)
- Status bar behavior
- Keyboard shortcuts, explorer context menu, editor context menu
