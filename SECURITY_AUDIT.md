# Security Audit Report — Token Budget Builder VS Code Extension

Date: 2026-06-21

---

## Vuln 1 (HIGH): Markdown Injection via Template Name/Body — `src/extension.js:55`

* **Severity:** High
* **Category:** Markdown Injection / Potential Command URI Execution
* **Description:** `PromptTemplateItem` passes the raw user-controlled `name` and `body` directly into `tooltip.appendMarkdown()` without sanitisation. A template named `**x** [run](command:workbench.action.reloadWindow)` would render a clickable `command:` URI in the sidebar tooltip. While `MarkdownString.isTrusted` defaults to `false` (which blocks command URIs in the current VS Code version), this is a documentation default only — if it is ever set to `true`, any user-visible tooltip in the sidebar triggers arbitrary VS Code command execution on hover.
* **Exploit Scenario:** A malicious extension or shared workspace sync writes a template entry with name `[pwn](command:token-budget-builder.clearContext)` into `globalState`. The victim opens VS Code; hovering over the template item in the sidebar executes the command silently.
* **Recommendation:** Replace `appendMarkdown` with `appendText` for all user-supplied name and body content. If Markdown formatting is desired, escape `*`, `[`, `]`, and backtick characters before passing to `appendMarkdown`, and add a comment that `isTrusted` must never be set to `true` on this object.

---

## Vuln 2 (MEDIUM): Weak CSP Nonce — `Math.random()` Instead of Crypto — `src/extension.js:100-103`

* **Severity:** Medium
* **Category:** Weak Cryptographic Nonce
* **Description:** `generateNonce()` uses `Math.random()`, which is not a CSPRNG. The nonce is the sole barrier preventing inline script injection into the webview (the CSP is otherwise well-structured with `default-src 'none'`). A predictable nonce can be brute-forced by a co-resident malicious extension that observes `Date.now()` or `performance.now()` at panel creation time, then reconstructs the PRNG state.
* **Exploit Scenario:** A malicious companion extension injects a webview message or reads shared process timing to predict the nonce, constructs a `<script nonce="predicted">` payload, and achieves CSP bypass inside the template preview webview.
* **Recommendation:** Replace with Node.js built-in crypto — `require('crypto').randomBytes(24).toString('hex')` — which is already available in the extension host without any new dependency.

---

## Vuln 3 (MEDIUM): Path Traversal in Preset Loading — `src/extension.js:696-699`

* **Severity:** Medium
* **Category:** Path Traversal
* **Description:** Preset relative paths are loaded from `workspaceState` and joined against the workspace root via `vscode.Uri.joinPath`, which resolves `..` segments. A path stored as `../../.env` resolves outside the workspace. The resolved URI is then read and added to context; when the user clicks "Copy Prompt", the file contents (which may include API keys or secrets) are placed on the clipboard and are one paste away from being sent to an external LLM.
* **Exploit Scenario:** A malicious extension or poisoned `.vscode/` workspace state sync writes a preset entry with path `../../.env`. The victim loads the preset normally. The `.env` file is silently read, token-counted, and included in the assembled prompt. The victim pastes the prompt into their LLM chat, leaking credentials to a third-party service.
* **Recommendation:** Before constructing the URI, reject any path containing `..` segments. After joining, assert that the resolved `fsPath` starts with `workspaceFolder.uri.fsPath`:
  ```js
  if (!resolvedUri.fsPath.startsWith(workspaceFolder.uri.fsPath)) {
    // skip or warn
  }
  ```

---

## Vuln 4 (MEDIUM): Missing `localResourceRoots` Restriction on Webview — `src/extension.js:743-748`

* **Severity:** Medium
* **Category:** Least-Privilege Violation (Webview)
* **Description:** The template preview webview panel is created with `{ enableScripts: true }` but no `localResourceRoots` constraint. VS Code defaults to allowing the extension directory when this is omitted. The VS Code webview security docs explicitly recommend setting `localResourceRoots: []` when no local resources need loading. Any future code change that adds a `vscode-resource:` URI would inadvertently have broad local filesystem access.
* **Recommendation:** Add `localResourceRoots: []` to the webview options since the current webview is fully self-contained with inline styles/scripts.

---

## Vuln 5 (LOW): File Path Logged to Console — `src/folderCounter.js:69`

* **Severity:** Low
* **Category:** Path Metadata Disclosure
* **Description:** `console.warn` logs full `fsPath` values for skipped files. In VS Code Remote / Server environments with multiple shared users, extension host stdout/stderr is accessible to other extensions. This also violates the CLAUDE.md rule "Never log or expose document content."
* **Recommendation:** Remove the `console.warn` line — the silent `return 0` already handles the skip gracefully.

---

## Summary

| # | Severity | File | Lines | Issue |
|---|----------|------|-------|-------|
| 1 | HIGH | `src/extension.js` | 55 | Markdown injection in template tooltip |
| 2 | MEDIUM | `src/extension.js` | 100–103 | Weak CSP nonce (`Math.random`) |
| 3 | MEDIUM | `src/extension.js` | 696–699 | Path traversal in preset loading |
| 4 | MEDIUM | `src/extension.js` | 743–748 | Missing `localResourceRoots: []` |
| 5 | LOW | `src/folderCounter.js` | 69 | File path logged to console |

**No issues found in:** `compressor.js`, `relatedFilesResolver.js`, `presetManager.js`, `templateManager.js`, `models.js`, `fileReader.js`, `gitignoreFilter.js`, `buildPromptProvider.js`. No `eval`, `innerHTML`, shell execution, or network calls anywhere in the codebase. The webview CSP structure is otherwise correct.
