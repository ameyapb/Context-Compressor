# Theme plan for SQLite Viewer + Team Tracker (theme-factory + frontend-design consult)

## Context

The SQLite Viewer (`src/sqlite/sqliteViewer.js`) and Team Tracker (`src/team-tracker/teamTrackerHtml.js`) webviews currently style themselves almost entirely from raw `--vscode-*` variables, with only two custom accent tokens in play: `tokenBudgetBuilder.accentColor` (cosmic blue `#4a4e8f`) and `tokenBudgetBuilder.highlightColor` (lavender `#a490c2`), contributed in `package.json` and exported as `ACCENT_COLOR_ID`/`HIGHLIGHT_COLOR_ID` from `src/shared/theme.js`. Both colors already are the "Cosmic Blue" and "Lavender" entries of the theme-factory **Midnight Galaxy** preset, so the extension is already mid-way into that theme without knowing it.

Beyond that pair, both webviews lean on one-off hardcoded hex values that were each reached for independently: SQLite Viewer's column-type badges (`#1e3a5f/#6cb6ff`, `#2d1f3d/#c586c0`, `#1a3020/#4ec994`, `#3d2400/#ce9178`) and Team Tracker's member palette / focus-ring fallback (`rgba(0,122,204,0.8)`) are both just VS Code's default syntax-highlight hue set, reached for twice, independently — a templated default rather than a deliberate choice. This is the concrete thing both skills flagged as worth fixing.

Per the frontend-design skill's own constraint-handling guidance, and per this codebase's existing pattern (theme.js already only tints sidebar tree icons, never base surfaces): a VS Code webview must keep `--vscode-editor-background`, `--vscode-foreground`, `--vscode-input-*`, `--vscode-panel-border` etc. as the base, so it still adapts correctly to the user's light/dark/high-contrast theme. The Midnight Galaxy palette should layer on as **accent-only** tokens on top of that base — never replace it. That is the one binding decision from talking to both skills: extend the existing 2-token accent system consistently, don't reskin the whole webview.

## Design tokens (from the skill consult)

- **Color** — keep the existing two contributed colors as the only brand identity tokens (no new `contributes.colors` entries): Cosmic Blue `#4a4e8f` (`--vscode-tokenBudgetBuilder-accentColor`, VS Code auto-generates this CSS var for every contributed color) and Lavender `#a490c2` (`--vscode-tokenBudgetBuilder-highlightColor`). Derive tints via fixed-alpha `rgba()` constants (not `color-mix()` — `engines.vscode` is `^1.74.0`, whose bundled Chromium predates `color-mix()` support) precomputed from the known default hex values, exported once from a shared module.
- **Type** — no new fonts (CSP blocks remote fonts; a bundled font file is a new dependency requiring the approval CLAUDE.md's "Dependencies" rule calls for, not justified here). Keep `--vscode-font-family` / `--vscode-editor-font-family`; extend the uppercase-letter-spacing label treatment Team Tracker already uses (`.panel-title`, `.section-label`) to the SQLite Viewer's plain `.header`, which currently has no scale treatment at all.
- **Layout** — both files repeat ad hoc padding values (`8px 12px`, `6px 10px`, `5px 10px`, `4px 8px`...) with no shared scale. Introduce one small spacing scale as CSS custom properties, defined once and shared.
- **Signature** — the destructive/system colors (`#f48771` delete affordances, `vscode-button-background` primary buttons) and the per-member `MEMBER_COLORS` identity ring stay untouched: those are semantic/personal, not brand, and restyling them would hurt usability for a purely decorative win. The brand signature lives in: sidebar active-item left border + tint (Team Tracker already does this; SQLite Viewer's table list currently doesn't), the sticky grid-header underline, and input/textarea focus rings — all switched from generic VS Code blue fallbacks to the accent tokens.

## Implementation plan (for the follow-up pass)

1. **New shared module `src/shared/webviewTheme.js`** (pure, no `vscode` dependency, mirrors the existing pattern of `src/shared/theme.js` and `src/shared/gitignoreFilter.js`):
   - Exports precomputed rgba tint constants derived from the two accent hex defaults (e.g. `ACCENT_TINT_SUBTLE`, `ACCENT_TINT_MEDIUM`, `HIGHLIGHT_TINT_SUBTLE`) for hover/active backgrounds.
   - Exports `buildSharedWebviewStyleBlock()`, a pure function returning one CSS string: the spacing-scale custom properties plus a single `::-webkit-scrollbar` rule set (today only Team Tracker has scrollbar styling; SQLite Viewer has none — this removes that inconsistency instead of hand-duplicating the rules into a second file).
   - Add `test/shared/webviewTheme.test.js` per CLAUDE.md's "every new module needs a test file" rule — assert the constants are valid rgba strings and the style block contains the expected selectors.

2. **`src/sqlite/sqliteViewer.js` (`buildSqliteViewerHtml`)**:
   - Inline `buildSharedWebviewStyleBlock()` at the top of the `<style>` block.
   - `.header`: add the letter-spacing/weight scale used by Team Tracker's `.panel-title`, plus a thin accent-tinted bottom rule.
   - `.table-item.active`: add a left-border + tint using the accent tokens (matching Team Tracker's `.member-row.active` treatment) instead of the bare `vscode-list-activeSelectionBackground`.
   - `.data-grid th`: accent-tinted sticky-header underline (replacing the plain `panel-border`).
   - `.col-type-badge[data-type=...]`: replace the four one-off hex pairs with four tints/shades drawn from the accent + highlight family (still four distinct, legible hues — type-coding is a real wayfinding device worth keeping — just no longer an unrelated lift from VS Code's default syntax palette).
   - `.data-grid tr.selected td` / hover: switch to the new highlight tint constant instead of generic `vscode-list-inactiveSelectionBackground`.
   - `.search-input:focus`, `.detail-drawer` top border, `.drawer-resize-handle:hover`, `.spinner`: swap generic `--vscode-focusBorder` / `--vscode-editor-foreground` fallbacks for the accent token.
   - Leave `.btn-page`, `.btn-drawer-action`, `.btn-filter-apply` etc. on `vscode-button-background` — native-looking system buttons stay native, per the restraint call above.

3. **`src/team-tracker/teamTrackerHtml.js` (`buildTeamStyles`)**:
   - Inline `buildSharedWebviewStyleBlock()` at the top, then drop the now-duplicated local `::-webkit-scrollbar` rules.
   - `.form-input:focus`, `.notes-area:focus`: replace the hardcoded `rgba(0,122,204,0.8)` fallback with the accent token, so the default look matches the brand instead of generic VS Code blue.
   - Leave `MEMBER_COLORS` (`src/team-tracker/teamTrackerState.js`), `.btn-delete-member`/`.btn-delete-task`/`.btn-delete-link` (`#f48771`), and `.btn-sm.confirm` (`vscode-button-background`) unchanged — per-person identity and destructive/system affordances are intentionally out of scope.

4. **Verification for the follow-up pass**: `npm test` (mocha) for the new module's test file plus the existing suite; manually open both webviews via `F5` (Run Extension) — `token-budget-builder.openSqliteViewer` on a `.db`/`.sqlite` file and `token-budget-builder.openTeamTracker` — and check appearance against VS Code's default Dark+, Light+, and a high-contrast theme to confirm the base surfaces still adapt correctly and only the accent layer changed.
