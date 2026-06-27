# Rebrand and Marketing Plan

## Situation

The extension has two identities at once: the marketplace lists it as "Token Budget Builder" while the sidebar shows "Context Compressor". The README is thin and does not reflect the full feature set. The extension now ships five distinct tools, but the listing page describes one. This gap between the actual product and its presentation is the primary blocker to organic discovery.

Discovery on the VS Code Marketplace is almost entirely text-driven: the search index is built from `displayName`, `description`, `keywords`, README body, and category tags. The name "Cabin Kit" is intentionally brand-neutral, which means every other field must carry the full SEO weight. This plan treats that constraint as the organizing principle.

---

## Step 1: Settle on one name

**Decision: Cabin Kit**

- Unique in the VS Code Marketplace (no competing extension owns this string).
- Short and brand-friendly.
- Discovery is handled through keywords and README copy, not the name itself (see Step 2 and Step 3).

**What to change and what to leave alone:**

The internal `name` field in package.json (`token-budget-builder`) is the extension ID. Changing it creates a new Marketplace listing and breaks all existing installs. Leave it alone.

Change only `displayName` to `"Cabin Kit"`. This is what users see in search results, the installed-extensions list, and the Activity Bar.

**Tagline (used in `description` field and README hero):**

> Assemble, compress, and copy multi-file AI context with a live token budget. No API keys. Runs entirely in VS Code.

This answers: what it does, how it is different (no API calls), and where it runs. It front-loads the three highest-value search terms: "AI context", "token budget", and "VS Code".

---

## Step 2: SEO Strategy

### How the Marketplace ranks extensions

The VS Code Marketplace does not publish its ranking algorithm, but the observable signals are:

1. **Keyword match** in `displayName`, `description`, and `keywords` (exact and fuzzy).
2. **README body** is indexed and contributes to full-text search.
3. **Install velocity** (new installs per week) affects trending placement.
4. **Rating and review count** affects "Editor's Choice" and featured placement.
5. **Category tags** determine which browse pages the extension appears on.

Of these, only 1, 2, and 5 are directly controllable through copy. Install velocity follows from distribution (GitHub stars, community posts, direct links). This plan addresses both layers.

### Primary keywords (highest search volume for this tool category)

These are the terms developers type when they have the problem this extension solves. Every one of these must appear naturally in the README at least once:

| Keyword | Search intent |
|---|---|
| token counter | User wants to know how many tokens their text uses |
| context window | User is managing LLM input size |
| token budget | User is trying to stay within a limit |
| prompt builder | User is assembling a prompt from multiple sources |
| ai context | User is preparing input for an AI model |
| llm tools | User is looking for developer utilities for LLM work |
| prompt engineering | Broad category, high volume |
| context compression | User wants to reduce token count without losing meaning |
| multi-file prompt | Specific to the core workflow |
| log filter | Secondary use case with its own search audience |
| sqlite viewer vscode | Specific and high-intent |

### Long-tail keywords (lower volume, higher conversion)

Long-tail searches come from users with a specific problem. These are easier to rank for and convert at a higher rate because intent is clear:

- "how to count tokens before sending to ChatGPT"
- "vscode extension token count claude"
- "compress code for llm context"
- "filter log file by pattern vscode"
- "browse sqlite file in vscode"
- "prompt template vscode extension"
- "gpt-4 context window vscode"
- "reduce tokens in prompt"
- "multi file context claude"
- "vscode llm context builder"

These phrases belong in the README as natural sentences, not as a list. The README is indexed by the Marketplace and by Google. Writing a README that reads like a user asking a question and then answering it is the highest-leverage SEO action available.

### Competitor keyword gap

The extensions ranking for "token counter" and "context window" on the Marketplace in mid-2025 are mostly single-purpose counters. None of them combine token counting, file compression, log filtering, and SQLite browsing. This is a differentiation gap. The README should call this out explicitly: "Unlike standalone token counters, Cabin Kit lets you..." This phrasing captures users who have already tried the alternatives.

### External discovery channels

The Marketplace is not the only place users find extensions. Priority order:

1. **GitHub repository** - The repo README and repo description are indexed by GitHub search and Google. Keep the repo description in sync with the `description` field in package.json. Add GitHub topics: `vscode-extension`, `token-counter`, `llm`, `prompt-engineering`, `ai-tools`, `sqlite-viewer`, `log-filter`.

2. **Reddit** - Post to r/vscode, r/LocalLLaMA, r/ChatGPT, r/MachineLearning with a short demo. Do not make it look like an ad. Lead with the use case, not the product name. "I built a VS Code extension that shows you your token count before you copy to Claude" is a better opener than "Check out Cabin Kit".

3. **Hacker News** - A Show HN post for a free developer tool with a clear use case does well. Title should include the pain ("I got tired of pasting files into ChatGPT and not knowing if I'd hit the limit"). Post on a weekday morning US Eastern time.

4. **dev.to and Hashnode** - Write one article per major feature. "How to filter large log files in VS Code with regex chains" targets the log filter audience without mentioning the extension until the solution section. Each article links back to the Marketplace listing.

5. **Twitter/X** - Short demo GIF per feature. The SQLite viewer and line filter chain are visually interesting; token count updating in the status bar is not. Prioritize GIFs that show something happening on screen.

6. **Product Hunt** - Launch after the README and screenshots are updated. A Product Hunt launch with a strong README converts well when the Marketplace page backs it up.

---

## Step 3: Update package.json metadata

### displayName
Change `"Token Budget Builder"` to `"Cabin Kit"`.

### description
Replace with the tagline. One sharp sentence converts better in search results and carries the SEO weight the name does not. The current description is too long and reads as a keyword dump in the search result snippet (which truncates at ~150 characters).

### keywords
The `keywords` array is a primary ranking signal. Load it with terms users actually search for. Order matters: the Marketplace weighs earlier entries more heavily.

```json
"keywords": [
  "token counter",
  "context window",
  "token budget",
  "prompt builder",
  "context compression",
  "ai context",
  "llm",
  "claude",
  "chatgpt",
  "gpt-4",
  "gemini",
  "copilot",
  "log filter",
  "sqlite viewer",
  "multi-file prompt",
  "prompt engineering",
  "vscode ai",
  "ai tools"
]
```

### categories
Current: `["AI", "Machine Learning", "Other"]`

Keep as-is. "AI" and "Machine Learning" are the right top-level categories for Marketplace search ranking. Do not add more; the Marketplace limits category weight beyond two or three.

### galleryBanner
The current `#1e1e1e` dark background is fine. The banner is the strip behind the extension icon on the Marketplace detail page. If the icon is updated (see Step 5), revisit the color.

---

## Step 4: Rewrite README.md

The README is the Marketplace listing page and the primary SEO surface after `keywords`. It needs to earn the install and rank for the terms in Step 2.

**Target length:** 200-250 lines with clear H2/H3 headings (Marketplace search indexes heading text separately), at least three screenshots, and natural use of primary keywords in the first 100 lines.

**SEO principle for README copy:** Write each section as if answering a specific search query. The H2 headings should be phrased the way a user would ask a question, then the section body answers it. This is the same structure that earns featured snippets in Google.

### Section structure

**1. Hero**
- H1: "Cabin Kit"
- One-sentence tagline
- Badges: Marketplace version, installs (once available)
- Best composite screenshot

Front-load these phrases in the first paragraph (they carry the most index weight): "token budget", "AI context", "VS Code", "context window", "no API keys".

**2. Why use it**
Frame pain first, solution second. This section targets users searching for a problem, not a product name:

- "Paste files into ChatGPT and wonder if you exceeded the limit? The status bar shows your live token count before you copy."
- "Working with large logs? Filter down to the lines that matter before adding them to your context."
- "Tired of rebuilding the same set of files every session? Save and reload context as a named preset."
- "Need to browse a .sqlite database without leaving VS Code? The built-in viewer handles it."

**3. Features at a glance**
A quick bulleted list of all five tool areas. Each bullet uses the primary keyword for that tool:

- Context Builder: file picker, live token count, compression, presets
- Prompt Templates: reusable scaffolds with placeholder support
- Line Filter: regex-based log narrowing with chain support and context lines
- SQLite Viewer: browse .sqlite and .db files without leaving VS Code
- Team Tracker: shared links, tasks, and notes board

**4. Getting started**
Three steps. No more. Keep it scannable.

1. Open the Cabin Kit panel in the Activity Bar.
2. Add files using the toolbar or by right-clicking in the Explorer.
3. Choose a model and compression mode, then click Copy Prompt.

**5. Compression modes**
Keep the existing table. Add a one-sentence intro that uses "reduce token count" and "context compression" before the table.

**6. Line Filter**
Tighten the language. Add a screenshot showing a filter chain. The section heading should be "Filter large log files by regex pattern" rather than just "Line Filter" - the former is a search phrase; the latter is a label.

**7. Supported models**
Expand the table to include Gemini models (they are in the keywords list). Clarify that Claude uses an approximation. Add a sentence that mentions "context window size" and "token limit" - both are searched terms.

**8. SQLite Viewer**
New section. One paragraph. One screenshot. Target the query "browse sqlite in vscode" by using that phrase naturally in the body.

**9. No API keys. No telemetry.**
Trust copy. Developers installing AI tools are rightfully skeptical. State explicitly:
- All token counting is local (gpt-tokenizer, no network calls)
- No document content is logged or transmitted
- No API keys required

This section also converts searches for "vscode extension no telemetry" and "local token counter".

---

## Step 5: Screenshots

The current screenshot shows only the Context Files panel. The Marketplace detail page displays the first README image prominently. A weak or partial screenshot is the single biggest drop-off point after a user clicks through from search.

**Minimum set:**

| File | What to capture | SEO value |
|---|---|---|
| `media/screenshot-context.png` | Context Files panel with 3-4 files checked, status bar showing a real token count | Demonstrates the core "token budget" use case visually |
| `media/screenshot-filter.png` | Line Filter panel with a two-step chain and per-step counts | Shows the log filter use case; unique visual that competitors lack |
| `media/screenshot-sqlite.png` | SQLite Viewer with a real table and search applied | Demonstrates the "sqlite viewer vscode" use case |
| `media/screenshot-hero.png` | Composite or best single image for the top of the README | First image seen in Marketplace search results |

**Quality rules:** Default VS Code dark theme. 1440px window width. No placeholder or lorem ipsum data. Real files, real token counts, real SQL data. Screenshots with realistic data convert better than clean demos because they look like the user's actual environment.

---

## Step 6: Housekeeping files

These are blocking issues for a clean Marketplace publish.

### LICENSE
Missing. The package.json declares `"license": "MIT"` but no LICENSE file exists at the repo root. The Marketplace will warn about this. Create `LICENSE` with the standard MIT text and the correct year and author name.

### CHANGELOG.md
Missing. The Marketplace surfaces a changelog tab when this file is present. A changelog signals active maintenance, which increases install confidence.

Create `CHANGELOG.md` starting from the current version (0.1.8):

```
## [0.1.8]
- Team Tracker: shared link, note, and task board
- SQLite Viewer: browse .sqlite and .db files in a table
- Line Filter: regex line filtering with chain support and context lines
- Prompt Templates: reusable prompt scaffolds with placeholder support
- Context compression: Strip Comments, Collapse Whitespace, Signatures Only
- Token counting for all files, folders, and the current context
```

### .vscodeignore
Create or update to exclude non-essential content from the packaged .vsix:

```
.vscode/**
test/**
PLAN.md
CLAUDE.md
node_modules/**
.gitignore
```

Screenshots referenced in the README must be included in the .vsix. The Marketplace serves the README with relative paths pointing into the extension package; do not exclude any `media/` files the README links to.

---

## Step 7: Update CLAUDE.md

After the rebrand, update CLAUDE.md to reflect:
- New displayName ("Cabin Kit")
- Any screenshot filenames that changed
- The existence of LICENSE and CHANGELOG.md

---

## Implementation order

This order is chosen to unblock publishing first, then maximize search ranking, then add distribution surface.

1. **Housekeeping** (LICENSE, CHANGELOG, .vscodeignore) - unblocks publishing immediately
2. **package.json metadata** (displayName, description, keywords) - takes effect on next publish; small change, high ranking impact
3. **README rewrite** - write copy first, then take screenshots and drop them in; this is the highest SEO leverage action
4. **Screenshots** - requires the extension running; do this after Step 3 so you know exactly which panels to capture
5. **GitHub repo metadata** (description, topics) - takes effect immediately; costs five minutes
6. **CLAUDE.md update** - housekeeping
7. **Run `npm test`, then `npx vsce package`** - verify the .vsix is clean before publishing
8. **Publish to Marketplace**
9. **Distribution** (Reddit, HN, dev.to articles) - after the Marketplace page is strong enough to convert

---

## What this plan does not cover

- Changing the internal command IDs (e.g. `token-budget-builder.countTokens`). These are user-facing in keybindings and the command palette. Renaming them would break existing user setups.
- Changing the `name` field in package.json (would create a new extension, orphaning current installs).
- Paid promotion. Outside scope.
- New features. This plan is purely about presentation and discovery, not product.
