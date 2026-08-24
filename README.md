# Prompt Manager

An offline-first desktop app to manage, organize, and reuse AI prompts. Built with Electron + Vanilla JS.

**Core philosophy:** Markdown = Source of Truth. Your prompts are plain `.md` files — no database, no lock-in, no cloud required.

## Quick Start

```bash
npm install
npm start
```

On first launch, choose a folder for your prompt library. Sample prompts are seeded automatically.

## Features

### Core (Phase 1)
- **Markdown storage** — each prompt is a `.md` file with YAML front matter
- **Categories** — organize prompts into folders
- **Tags** — add multiple tags per prompt
- **Favorites** — star your most-used prompts
- **Fuzzy search** — find prompts fast (Ctrl+K)
- **Variable system** — define `{variables}` in prompts, fill them at run time
- **Copy to clipboard** — one-click copy of the final prompt
- **Import/Export** — import `.md` files or folders, export as ZIP
- **Backup** — create timestamped ZIP backups of your library
- **Drag & Drop** — drop `.md` files onto the window to import
- **Markdown preview** — rendered preview with DOMPurify sanitization
- **Keyboard shortcuts** — Ctrl+K (search), Ctrl+N (new), Esc (close)

### Productivity (Phase 2)
- **History** — track every prompt run with timestamps and variable values
- **Re-run** — replay any history entry with pre-filled variables
- **Command Palette** — Ctrl+Shift+P for quick access to all commands and prompts
- **Snippets** — reusable text blocks stored as `.md` files in your library

### Power User (Phase 3)
- **Versioning** — auto-saved version snapshots on every edit, view diff, restore
- **Variants** — save run results as named variants of a prompt
- **Composition** — combine multiple prompts and snippets into one

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Focus search |
| `Ctrl+N` | New prompt |
| `Ctrl+Shift+P` | Command Palette |
| `Esc` | Close modal / cancel |

## Prompt File Format

```markdown
---
title: Code Reviewer
description: Review source code for bugs and security issues
category: coding
tags:
  - coding
  - review
  - security
favorite: true
created: 2026-08-23T10:00:00.000Z
updated: 2026-08-23T12:00:00.000Z
variables:
  - name: language
    type: text
    default: JavaScript
    required: true
  - name: code
    type: textarea
    required: true
---

Review the following {language} code.

## Code

{code}
```

## Variable System

Define variables with `{name}` syntax in your prompts. The app auto-detects them.

Supported variable types:
- **text** — single-line input
- **textarea** — multi-line input
- **select** — dropdown with predefined options

Variables can have:
- `default` — pre-filled value
- `required` — must not be empty to generate

Escape variables with backslash: `\{notavar\}`

## Library Structure

```
YourLibrary/
├── prompts/
│   ├── coding/
│   │   ├── code-review.md
│   │   └── debugger.md
│   ├── writing/
│   │   └── rewrite.md
│   └── research/
│       └── deep-research.md
├── snippets/
│   ├── security-rules.md
│   └── json-output.md
```

## Tech Stack

- Electron 33
- Vanilla JavaScript (ES modules)
- No build step, no bundler
- CSS custom properties (dark theme)
- Vendored libs: marked.js, js-yaml, DOMPurify, adm-zip

## License

MIT
