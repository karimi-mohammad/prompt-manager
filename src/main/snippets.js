const fs = require('fs');
const path = require('path');

const SNIPPETS_DIR = 'snippets';

function getSnippetsDir(libraryPath) {
  return path.join(libraryPath, SNIPPETS_DIR);
}

function ensureSnippetsDir(libraryPath) {
  const dir = getSnippetsDir(libraryPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * List all snippets.
 */
function listSnippets(libraryPath) {
  ensureSnippetsDir(libraryPath);
  const dir = getSnippetsDir(libraryPath);
  const snippets = [];

  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return []; }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const fullPath = path.join(dir, entry.name);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8').replace(/\r\n/g, '\n');
        snippets.push({
          id: entry.name,
          name: entry.name.replace(/\.md$/, ''),
          content,
        });
      } catch { /* skip unreadable */ }
    }
  }

  return snippets.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get a single snippet by name.
 */
function getSnippet(libraryPath, name) {
  const dir = getSnippetsDir(libraryPath);
  const fullPath = path.join(dir, name + '.md');
  try {
    return {
      id: name + '.md',
      name,
      content: fs.readFileSync(fullPath, 'utf-8').replace(/\r\n/g, '\n'),
    };
  } catch {
    return null;
  }
}

/**
 * Save a snippet (create or update).
 */
function saveSnippet(libraryPath, name, content) {
  ensureSnippetsDir(libraryPath);
  const dir = getSnippetsDir(libraryPath);
  const slug = name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').trim();
  const fullPath = path.join(dir, slug + '.md');
  fs.writeFileSync(fullPath, content, 'utf-8');
  return { id: slug + '.md', name: slug, content };
}

/**
 * Delete a snippet.
 */
function deleteSnippet(libraryPath, name) {
  const dir = getSnippetsDir(libraryPath);
  const fullPath = path.join(dir, name + '.md');
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}

module.exports = { listSnippets, getSnippet, saveSnippet, deleteSnippet };
