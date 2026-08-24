const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const settings = require('./settings');
const library = require('./library');
const backup = require('./backup');
const watcher = require('./watcher');
const history = require('./history');
const snippets = require('./snippets');
const variants = require('./variants');
const versions = require('./versions');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Prompt Manager',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    backgroundColor: '#1a1b26',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'right' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Start watcher after window loads
  mainWindow.webContents.on('did-finish-load', () => {
    const libPath = settings.getLibraryPath();
    if (libPath) {
      seedSamplePrompts(libPath);
      watcher.startWatcher(libPath);
    }
  });
}

function registerIpc() {
  // Initialize watcher with window getter (breaks circular dependency)
  watcher.init(() => mainWindow);

  // === Settings ===
  ipcMain.handle('get-settings', () => settings.loadSettings());

  ipcMain.handle('choose-library-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Choose Prompt Library Folder',
    });
    if (result.canceled) return { canceled: true };
    const folder = result.filePaths[0];
    settings.setLibraryPath(folder);
    watcher.startWatcher(folder);
    return { path: folder };
  });

  ipcMain.handle('set-library-path', (event, p) => {
    settings.setLibraryPath(p);
    watcher.startWatcher(p);
    return { ok: true };
  });

  // === Library ===
  ipcMain.handle('scan-library', () => {
    const libPath = settings.getLibraryPath();
    if (!libPath) return { prompts: [], categories: [] };
    return library.scanLibrary(libPath);
  });

  ipcMain.handle('save-prompt', (event, data) => {
    const libPath = settings.getLibraryPath();
    const result = library.savePrompt(libPath, data);
    // Auto-version on each save (skip first creation)
    if (data.id && data.body) {
      try {
        const { serializeFrontMatter } = require('./frontmatter');
        const meta = {
          title: data.title, description: data.description || '', category: data.category || 'uncategorized',
          tags: data.tags || [], favorite: data.favorite || false, created: data.created, updated: new Date().toISOString(),
          variables: data.variables || [],
        };
        const content = serializeFrontMatter(meta, data.body || '');
        versions.saveVersion(libPath, data.id, content, 'Auto-saved on edit');
      } catch { /* version save failure is non-fatal */ }
    }
    return result;
  });

  ipcMain.handle('delete-prompt', (event, id) => {
    const libPath = settings.getLibraryPath();
    library.deletePrompt(libPath, id);
    return { ok: true };
  });

  ipcMain.handle('toggle-favorite', (event, id, fav) => {
    const libPath = settings.getLibraryPath();
    library.toggleFavorite(libPath, id, fav);
    return { ok: true };
  });

  ipcMain.handle('create-category', (event, name) => {
    const libPath = settings.getLibraryPath();
    library.createCategory(libPath, name);
    return { ok: true };
  });

  // === Import / Export / Backup ===
  ipcMain.handle('import-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelection'],
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled) return { imported: 0 };
    const libPath = settings.getLibraryPath();
    const count = library.importFiles(libPath, result.filePaths);
    return { imported: count };
  });

  ipcMain.handle('import-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled) return { imported: 0 };
    const libPath = settings.getLibraryPath();
    const count = library.importFiles(libPath, [result.filePaths[0]]);
    return { imported: count };
  });

  ipcMain.handle('import-dropped', (event, paths) => {
    const libPath = settings.getLibraryPath();
    const count = library.importFiles(libPath, paths);
    return { imported: count };
  });

  ipcMain.handle('export-prompt', async (event, id) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.basename(id),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled) return { canceled: true };
    const libPath = settings.getLibraryPath();
    backup.exportPrompt(libPath, id, result.filePath);
    return { savedTo: result.filePath };
  });

  ipcMain.handle('export-library', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'prompt-library.zip',
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (result.canceled) return { canceled: true };
    const libPath = settings.getLibraryPath();
    backup.exportLibrary(libPath, result.filePath);
    return { savedTo: result.filePath };
  });

  ipcMain.handle('backup-library', async () => {
    const date = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `backup-${date}.zip`,
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (result.canceled) return { canceled: true };
    const libPath = settings.getLibraryPath();
    backup.backupLibrary(libPath, result.filePath);
    return { savedTo: result.filePath };
  });

  // === History ===
  ipcMain.handle('log-run', (event, data) => history.logRun(data));
  ipcMain.handle('get-history', () => history.getHistory());
  ipcMain.handle('delete-history-entry', (event, id) => history.deleteHistoryEntry(id));
  ipcMain.handle('clear-history', () => history.clearHistory());

  // === Snippets ===
  ipcMain.handle('list-snippets', () => {
    const libPath = settings.getLibraryPath();
    return snippets.listSnippets(libPath);
  });
  ipcMain.handle('get-snippet', (event, name) => {
    const libPath = settings.getLibraryPath();
    return snippets.getSnippet(libPath, name);
  });
  ipcMain.handle('save-snippet', (event, name, content) => {
    const libPath = settings.getLibraryPath();
    return snippets.saveSnippet(libPath, name, content);
  });
  ipcMain.handle('delete-snippet', (event, name) => {
    const libPath = settings.getLibraryPath();
    snippets.deleteSnippet(libPath, name);
    return { ok: true };
  });

  // === Variants ===
  ipcMain.handle('list-variants', (event, promptId) => {
    const libPath = settings.getLibraryPath();
    return variants.listVariants(libPath, promptId);
  });
  ipcMain.handle('save-variant', (event, promptId, name, content) => {
    const libPath = settings.getLibraryPath();
    return variants.saveVariant(libPath, promptId, name, content);
  });
  ipcMain.handle('delete-variant', (event, promptId, variantName) => {
    const libPath = settings.getLibraryPath();
    variants.deleteVariant(libPath, promptId, variantName);
    return { ok: true };
  });

  // === Versions ===
  ipcMain.handle('list-versions', (event, promptId) => {
    const libPath = settings.getLibraryPath();
    return versions.listVersions(libPath, promptId);
  });
  ipcMain.handle('get-version-content', (event, promptId, versionId) => {
    const libPath = settings.getLibraryPath();
    return versions.getVersionContent(libPath, promptId, versionId);
  });
  ipcMain.handle('restore-version', (event, promptId, versionId) => {
    const libPath = settings.getLibraryPath();
    const content = versions.getVersionForRestore(libPath, promptId, versionId);
    if (!content) return { ok: false, error: 'Version not found' };
    // The renderer will handle saving the restored content as a new save
    return { ok: true, content };
  });
  ipcMain.handle('compute-diff', (event, oldText, newText) => {
    return versions.computeDiff(oldText, newText);
  });

  // === Composition ===
  ipcMain.handle('compose-prompts', (event, parts) => {
    // parts = [{ type: 'prompt'|'snippet', id: string }]
    // Returns the combined text
    const libPath = settings.getLibraryPath();
    let result = '';

    for (const part of parts) {
      if (part.type === 'prompt') {
        const pd = path.join(libPath, 'prompts', part.id);
        try {
          const content = fs.readFileSync(pd, 'utf-8').replace(/\r\n/g, '\n');
          // Strip front matter from composed prompts
          const stripped = content.replace(/^---[\s\S]*?---\n?/, '').trim();
          result += stripped + '\n\n';
        } catch { /* skip missing */ }
      } else if (part.type === 'snippet') {
        const sn = snippets.getSnippet(libPath, part.id);
        if (sn) result += sn.content + '\n\n';
      }
    }

    return { content: result.trim() };
  });
}

/**
 * Copy sample prompts into the library if it's empty.
 */
function seedSamplePrompts(libraryPath) {
  const samplesDir = path.join(__dirname, '..', '..', 'samples');
  if (!fs.existsSync(samplesDir)) return;

  const pd = path.join(libraryPath, 'prompts');
  const entries = fs.readdirSync(samplesDir, { withFileTypes: true });
  if (entries.length === 0) return;

  // Check if library already has prompts
  let hasPrompts = false;
  try {
    const existing = fs.readdirSync(pd, { withFileTypes: true });
    hasPrompts = existing.some(e => e.isDirectory()) ||
      existing.filter(e => e.name.endsWith('.md')).length > 0;
  } catch { /* pd doesn't exist yet */ }

  if (hasPrompts) return;

  // Copy sample structure
  for (const entry of entries) {
    const src = path.join(samplesDir, entry.name);
    const dest = path.join(pd, entry.name);
    if (entry.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else if (entry.name.endsWith('.md')) {
      fs.copyFileSync(src, dest);
    }
  }
}

// === App lifecycle ===
app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  watcher.stopWatcher();
  if (process.platform !== 'darwin') app.quit();
});

// Expose for watcher
module.exports = { getMainWindow: () => mainWindow, seedSamplePrompts };
