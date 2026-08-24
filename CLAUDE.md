# Prompt Manager — Project Context

## What This Is

Offline Markdown-based AI prompt manager. Desktop app built with Electron + Vanilla JS.
Personal hobby project — built with Claude Code as an experiment in AI-assisted development.

**Core philosophy:** Markdown = Source of Truth. Prompts are plain `.md` files with YAML front matter. No database, no lock-in, no cloud.

## Tech Stack

- **Electron 33** — desktop runtime
- **Vanilla JS (ES modules)** — no React/Vue/TypeScript, no build step, no bundler
- **CSS custom properties** — dark theme (Tokyo Night inspired)
- **Vendored libs** — marked.js, js-yaml, DOMPurify (loaded as `<script>` globals in renderer)
- **Runtime deps:** adm-zip (backup/zip), js-yaml (front matter)
- **Dev deps:** electron, electron-builder, sharp (icon conversion)

## Project Structure

```
src/
├── main/                    # Electron main process (Node.js)
│   ├── main.js              # Window creation, IPC registration, lifecycle
│   ├── ipc.js               # (unused — handlers are in main.js)
│   ├── settings.js          # Settings persistence in app.getPath('userData')
│   ├── library.js           # Scan, CRUD, category tree, import files
│   ├── frontmatter.js       # YAML parse/serialize with round-trip preservation
│   ├── history.js           # Usage history (JSON in userData)
│   ├── snippets.js          # Reusable text blocks (.md in library/snippets/)
│   ├── variants.js          # Prompt variants (.md in __variants/ per prompt)
│   ├── versions.js          # Version snapshots + diff (JSON+md in __versions/)
│   ├── backup.js            # ZIP export/backup via adm-zip
│   └── watcher.js           # fs.watch recursive + debounce → renderer events
├── preload/
│   └── preload.js           # contextBridge: exposes window.api to renderer
└── renderer/
    ├── index.html           # 3-column layout + modals
    ├── styles/
    │   ├── base.css         # Reset, design tokens, dark theme
    │   ├── layout.css       # Grid: sidebar / list / detail
    │   └── components.css   # Buttons, inputs, modals, toasts, tags
    ├── js/
    │   ├── app.js           # Main entry: init, UI wiring, all render functions
    │   ├── store.js         # Simple state + pub/sub
    │   ├── api.js           # Thin wrapper: `window.api`
    │   ├── fuzzy.js         # Subsequence fuzzy search scorer
    │   ├── variables.js     # Detect/merge/replace {variables}
    │   └── markdown.js      # Render via marked + sanitize via DOMPurify
    └── vendor/              # Vendored libs (loaded as globals)
        ├── marked.min.js
        ├── js-yaml.min.js
        └── purify.min.js
```

## Architecture Decisions

- **Main process does all fs work** — renderer never touches filesystem directly
- **IPC via contextBridge** — contextIsolation: true, nodeIntegration: false
- **State in renderer** — simple pub/sub store (store.js), no framework
- **Security:** DOMPurify sanitizes all markdown output to prevent XSS
- **No bundler** — ES modules via `<script type="module">`, vendor libs as `<script>` globals
- **Categories = folders** — changing category moves the file on disk
- **History/stats outside library** — stored in userData, not in prompt files
- **fs.watch for sync** — debounced 500ms, emits 'library-changed' to renderer

## Key Algorithms

### Variable Detection
```
/(?<!\\)\{([a-zA-Z_][a-zA-Z0-9_-]*)\}/g
```
- Escape-aware: `\{text\}` is NOT a variable
- Deduplicated preserving order
- Merged with YAML metadata (type/default/required/options)

### Fuzzy Search
- Subsequence matching, case-insensitive
- Scoring: +10 per char, +8 consecutive, +5 word-start, +2 exact case
- Searches: title (1.5x weight), description, category, tags

### Category Tree
- Built from flat `{ path: count }` map
- Ancestors auto-created from child paths (e.g. `coding/frontend` creates `coding`)
- Empty folders included (count=0)

## Build & Release

```bash
npm start              # Run locally
npm run dev            # Run with DevTools
npm run build          # Build installer + portable (local)
node scripts/build.js  # Full optimized build with cleanup
```

### GitHub Actions
- **On push/PR:** builds, uploads artifacts (7-day retention)
- **On tag push (v*):** auto-creates GitHub Release with installer + portable

```bash
git tag v1.1.0
git push origin v1.1.0
# → GitHub Actions builds + creates release automatically
```

### Build Optimization
Post-build cleanup removes:
- 54 locale files (keep en-US.pak only)
- GPU libs: libGLESv2.dll, libEGL.dll, vk_swiftshader.dll, d3dcompiler_47.dll
- Media: ffmpeg.dll
- Other: LICENSES.chromium.html, chrome_200_percent.pak

Result: Installer ~78MB, Portable ZIP ~90MB

## File Format

Each prompt is a `.md` file with YAML front matter:

```yaml
---
title: Code Reviewer
description: Review source code for bugs
category: coding          # = folder name; changing moves file
tags: [coding, review]
favorite: true
created: 2026-08-23T10:00:00.000Z
updated: 2026-08-23T12:00:00.000Z
variables:
  - name: language
    type: text            # text | textarea | select
    default: JavaScript
    required: true
---
Body with {language} and {code} variables.
```

## IPC API Surface

All methods exposed via `window.api` (contextBridge):

**Settings:** getSettings, chooseLibraryFolder, setLibraryPath
**Library:** scanLibrary, savePrompt, deletePrompt, toggleFavorite, createCategory
**Import/Export:** importFiles, importFolder, importDropped, exportPrompt, exportLibrary, backupLibrary
**History:** logRun, getHistory, deleteHistoryEntry, clearHistory
**Snippets:** listSnippets, getSnippet, saveSnippet, deleteSnippet
**Variants:** listVariants, saveVariant, deleteVariant
**Versions:** listVersions, getVersionContent, restoreVersion, computeDiff
**Composition:** composePrompts
**Events:** onLibraryChanged (main → renderer)

## Important Patterns

- `escHtml()` used everywhere in template literals to prevent XSS
- `renderMarkdown()` always goes through DOMPurify.sanitize()
- Front matter round-trip preserves unknown YAML keys
- Category slugify: `[\\/:*?"<>|]` → `-`, collision → suffix `-2`, `-3`
- CRLF normalized: reads use `.replace(/\r\n/g, '\n')`, writes use `\n`

## Known Limitations

- No TypeScript (intentional — keeping it simple)
- No unit tests
- No bundler (vendor libs loaded as globals)
- fs.watch recursive only works on Windows/macOS (not Linux without flag)
- Large libraries (>5000 prompts) may slow on initial scan
