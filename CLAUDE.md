# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Prompt Manager — offline Markdown-based AI prompt manager. Electron 33 + Vanilla JS (no TypeScript, no bundler, no framework). Personal hobby project built with Claude Code.

Core philosophy: Markdown = Source of Truth. Each prompt is a `.md` file with YAML front matter. No database, no lock-in.

## Commands

```bash
npm install            # Install dependencies
npm start              # Run the app
npm run dev            # Run with DevTools open
npm run build          # Build NSIS installer + unpacked dir
node scripts/build.js  # Full optimized build (cleans unnecessary Electron files, creates portable zip)
node scripts/convert-icon.js  # Convert assets/icon.svg → icon.ico + icon.png
```

**Release workflow:**
```bash
git tag v1.1.0 && git push origin v1.1.0
# GitHub Actions auto-builds and creates a GitHub Release with installer + portable zip
```

No linter, no tests, no formatter configured.

## Architecture

**Two-process Electron model:**

- **Main process** (`src/main/`) — does ALL filesystem work, exposes IPC handlers via `ipcMain.handle()`
- **Renderer** (`src/renderer/`) — pure UI, accesses fs only through `window.api.*` (contextBridge)
- **Preload** (`src/preload/preload.js`) — bridges main↔renderer with `contextBridge.exposeInMainWorld('api', {...})`

`contextIsolation: true`, `nodeIntegration: false` — renderer has zero Node.js access.

**Renderer state:** Simple pub/sub store (`store.js`), no Redux/Vue/etc. UI modules in `src/renderer/js/` import each other directly as ES modules (`<script type="module">`).

**Vendor libs** (marked.js, js-yaml, DOMPurify) are vendored in `src/renderer/vendor/` and loaded as `<script>` globals before the module entry point.

**Data flow:**
```
Renderer UI → window.api.someMethod() → IPC → main process handler → fs operations → returns data
```

**Library watcher:** `src/main/watcher.js` uses `fs.watch({recursive: true})` with 500ms debounce, sends `library-changed` event to renderer for live sync with external editors.

## Key Patterns

**Front matter round-trip** (`src/main/frontmatter.js`):
- `parseFrontMatter()` → `{meta, body, rawMeta}`
- `serializeFrontMatter(meta, body)` → preserves unknown YAML keys
- Malformed YAML → prompt loads with title=filename, body=full text (never auto-overwrites)

**Category = folder path.** Changing `category` in YAML moves the `.md` file between folders. `slugify()` handles Windows-illegal chars `[\\/:*?"<>|]` → `-`. Empty categories are shown (scan walks all folders, not just those with prompts).

**Variable engine** (`src/renderer/js/variables.js`):
- Regex: `/(?<!\\)\{([a-zA-Z_][a-zA-Z0-9_-]*)\}/g`
- `\{escaped\}` is NOT a variable (lookbehind)
- Duplicate `{name}` in body → single input field
- Merges detected vars with YAML metadata (type/default/required/options)

**Security:** All markdown output goes through `DOMPurify.sanitize()`. All user data in template literals uses `escHtml()`. No `innerHTML` with raw user content.

**CRLF handling:** All reads normalize `.replace(/\r\n/g, '\n')`, all writes use `\n`.

## File Structure

```
src/main/           # Main process modules (Node.js CJS)
  main.js           # Entry: window, IPC registration, lifecycle
  settings.js       # userData/settings.json persistence
  library.js        # scanLibrary, savePrompt, deletePrompt, importFiles, category tree
  frontmatter.js    # YAML parse/serialize (js-yaml)
  history.js        # Run history (userData/history.json)
  snippets.js       # Reusable text blocks (library/snippets/*.md)
  variants.js       # Per-prompt variants (library/prompts/{cat}/__variants/*.md)
  versions.js       # Auto-version snapshots + LCS diff (library/prompts/{cat}/__versions/*.json+md)
  backup.js         # ZIP via adm-zip
  watcher.js        # fs.watch recursive + debounce
src/preload/        # contextBridge (single file)
src/renderer/       # UI (ES modules, no build step)
  js/app.js         # Main entry: init, all render functions, event binding
  js/store.js       # { state, setState, subscribe } pub/sub
  js/fuzzy.js       # Subsequence scorer: +10/char, +8 consecutive, +5 word-start
  js/variables.js   # detect/merge/replace engine
  js/markdown.js    # marked.parse() → DOMPurify.sanitize()
  styles/           # CSS: base.css (tokens), layout.css (grid), components.css
  vendor/           # marked.min.js, js-yaml.min.js, purify.min.js
samples/            # 4 seed prompts (coding, writing, research)
scripts/            # build.js, convert-icon.js
assets/             # icon.svg, icon.png, icon.ico
```

## IPC API (window.api.*)

Settings: `getSettings`, `chooseLibraryFolder`, `setLibraryPath`
Library: `scanLibrary`, `savePrompt`, `deletePrompt`, `toggleFavorite`, `createCategory`
Import/Export: `importFiles`, `importFolder`, `importDropped`, `exportPrompt`, `exportLibrary`, `backupLibrary`
History: `logRun`, `getHistory`, `deleteHistoryEntry`, `clearHistory`
Snippets: `listSnippets`, `getSnippet`, `saveSnippet`, `deleteSnippet`
Variants: `listVariants`, `saveVariant`, `deleteVariant`
Versions: `listVersions`, `getVersionContent`, `restoreVersion`, `computeDiff`
Composition: `composePrompts`
Events: `onLibraryChanged` (main → renderer)

## Build Details

electron-builder targets: NSIS installer + unpacked directory. Post-build cleanup removes 54 locales (keep en-US), GPU libs (libGLESv2, libEGL, vk_swiftshader, d3dcompiler_47), ffmpeg, and other unnecessary Electron files. Result: ~78MB installer, ~90MB portable zip.

GitHub Actions workflow (`.github/workflows/build.yml`): builds on push/PR, auto-creates release on `v*` tag push.
