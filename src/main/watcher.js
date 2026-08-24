const fs = require('fs');
const path = require('path');

let watcher = null;
let debounceTimer = null;
let getMainWindow = null;
const DEBOUNCE_MS = 500;

/**
 * Initialize watcher with a function that returns the main window.
 */
function init(mainWindowGetter) {
  getMainWindow = mainWindowGetter;
}

/**
 * Start watching the library folder for changes.
 */
function startWatcher(libraryPath) {
  stopWatcher();

  const pd = path.join(libraryPath, 'prompts');
  if (!fs.existsSync(pd)) return;

  try {
    watcher = fs.watch(pd, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (getMainWindow) {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('library-changed');
          }
        }
      }, DEBOUNCE_MS);
    });

    watcher.on('error', () => {
      // Silently handle watch errors
    });
  } catch {
    // fs.watch with recursive not supported, skip
  }
}

function stopWatcher() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (watcher) {
    try { watcher.close(); } catch { /* ignore */ }
    watcher = null;
  }
}

module.exports = { init, startWatcher, stopWatcher };
