const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const HISTORY_FILE = 'history.json';
const MAX_HISTORY = 200;

function getHistoryPath() {
  return path.join(app.getPath('userData'), HISTORY_FILE);
}

function loadHistory() {
  const p = getHistoryPath();
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return [];
  }
}

function saveHistory(entries) {
  fs.writeFileSync(getHistoryPath(), JSON.stringify(entries, null, 2), 'utf-8');
}

/**
 * Log a prompt run to history.
 */
function logRun(data) {
  const entries = loadHistory();
  entries.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    promptId: data.promptId,
    promptTitle: data.promptTitle,
    variables: data.variables || {},
    timestamp: new Date().toISOString(),
  });
  // Keep only recent entries
  if (entries.length > MAX_HISTORY) entries.length = MAX_HISTORY;
  saveHistory(entries);
  return entries;
}

/**
 * Get all history entries.
 */
function getHistory() {
  return loadHistory();
}

/**
 * Delete a single history entry.
 */
function deleteHistoryEntry(entryId) {
  let entries = loadHistory();
  entries = entries.filter(e => e.id !== entryId);
  saveHistory(entries);
  return entries;
}

/**
 * Clear all history.
 */
function clearHistory() {
  saveHistory([]);
  return [];
}

module.exports = { logRun, getHistory, deleteHistoryEntry, clearHistory };
