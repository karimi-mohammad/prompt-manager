const fs = require('fs');
const path = require('path');

const VERSIONS_DIR = '__versions';

function getVersionsDir(libraryPath, promptId) {
  const promptDir = path.dirname(path.join(libraryPath, 'prompts', promptId));
  return path.join(promptDir, VERSIONS_DIR);
}

/**
 * Save a version snapshot of a prompt.
 * Called automatically on each save.
 */
function saveVersion(libraryPath, promptId, content, message) {
  const dir = getVersionsDir(libraryPath, promptId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const versionId = timestamp;
  const meta = {
    id: versionId,
    timestamp: new Date().toISOString(),
    message: message || 'Auto-saved',
  };

  // Save metadata
  const metaPath = path.join(dir, versionId + '.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

  // Save content snapshot
  const contentPath = path.join(dir, versionId + '.md');
  fs.writeFileSync(contentPath, content, 'utf-8');

  // Keep only last 50 versions
  pruneVersions(dir, 50);

  return meta;
}

/**
 * List all versions for a prompt.
 */
function listVersions(libraryPath, promptId) {
  const dir = getVersionsDir(libraryPath, promptId);
  if (!fs.existsSync(dir)) return [];

  const versions = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return []; }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      const fullPath = path.join(dir, entry.name);
      try {
        const meta = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        versions.push(meta);
      } catch { /* skip */ }
    }
  }

  return versions.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Get a specific version's content.
 */
function getVersionContent(libraryPath, promptId, versionId) {
  const dir = getVersionsDir(libraryPath, promptId);
  const contentPath = path.join(dir, versionId + '.md');
  try {
    return fs.readFileSync(contentPath, 'utf-8').replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
}

/**
 * Restore a prompt to a specific version.
 * Returns the content to be saved.
 */
function getVersionForRestore(libraryPath, promptId, versionId) {
  return getVersionContent(libraryPath, promptId, versionId);
}

/**
 * Compute a simple line-by-line diff between two texts.
 * Returns array of { type: 'same'|'added'|'removed', line: string }.
 */
function computeDiff(oldText, newText) {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');
  const result = [];

  // Simple LCS-based diff
  const lcs = lcsMatrix(oldLines, newLines);
  let oi = oldLines.length, ni = newLines.length;

  const stack = [];
  while (oi > 0 || ni > 0) {
    if (oi > 0 && ni > 0 && oldLines[oi - 1] === newLines[ni - 1]) {
      stack.push({ type: 'same', line: oldLines[oi - 1] });
      oi--; ni--;
    } else if (ni > 0 && (oi === 0 || lcs[oi][ni - 1] >= lcs[oi - 1][ni])) {
      stack.push({ type: 'added', line: newLines[ni - 1] });
      ni--;
    } else {
      stack.push({ type: 'removed', line: oldLines[oi - 1] });
      oi--;
    }
  }

  return stack.reverse();
}

function lcsMatrix(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function pruneVersions(dir, maxCount) {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length > maxCount) {
      for (const f of files.slice(maxCount)) {
        const base = f.replace('.json', '');
        try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
        try { fs.unlinkSync(path.join(dir, base + '.md')); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

module.exports = { saveVersion, listVersions, getVersionContent, getVersionForRestore, computeDiff };
