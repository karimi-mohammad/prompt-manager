const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  chooseLibraryFolder: () => ipcRenderer.invoke('choose-library-folder'),
  setLibraryPath: (p) => ipcRenderer.invoke('set-library-path', p),

  // Library
  scanLibrary: () => ipcRenderer.invoke('scan-library'),
  savePrompt: (data) => ipcRenderer.invoke('save-prompt', data),
  deletePrompt: (id) => ipcRenderer.invoke('delete-prompt', id),
  toggleFavorite: (id, fav) => ipcRenderer.invoke('toggle-favorite', id, fav),
  createCategory: (name) => ipcRenderer.invoke('create-category', name),

  // Import / Export / Backup
  importFiles: () => ipcRenderer.invoke('import-files'),
  importFolder: () => ipcRenderer.invoke('import-folder'),
  importDropped: (fileList) => {
    const paths = [];
    for (const file of fileList) {
      paths.push(webUtils.getPathForFile(file));
    }
    return ipcRenderer.invoke('import-dropped', paths);
  },
  exportPrompt: (id) => ipcRenderer.invoke('export-prompt', id),
  exportLibrary: () => ipcRenderer.invoke('export-library'),
  backupLibrary: () => ipcRenderer.invoke('backup-library'),

  // History
  logRun: (data) => ipcRenderer.invoke('log-run', data),
  getHistory: () => ipcRenderer.invoke('get-history'),
  deleteHistoryEntry: (id) => ipcRenderer.invoke('delete-history-entry', id),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  // Snippets
  listSnippets: () => ipcRenderer.invoke('list-snippets'),
  getSnippet: (name) => ipcRenderer.invoke('get-snippet', name),
  saveSnippet: (name, content) => ipcRenderer.invoke('save-snippet', name, content),
  deleteSnippet: (name) => ipcRenderer.invoke('delete-snippet', name),

  // Variants
  listVariants: (promptId) => ipcRenderer.invoke('list-variants', promptId),
  saveVariant: (promptId, name, content) => ipcRenderer.invoke('save-variant', promptId, name, content),
  deleteVariant: (promptId, variantName) => ipcRenderer.invoke('delete-variant', promptId, variantName),

  // Versions
  listVersions: (promptId) => ipcRenderer.invoke('list-versions', promptId),
  getVersionContent: (promptId, versionId) => ipcRenderer.invoke('get-version-content', promptId, versionId),
  restoreVersion: (promptId, versionId) => ipcRenderer.invoke('restore-version', promptId, versionId),
  computeDiff: (oldText, newText) => ipcRenderer.invoke('compute-diff', oldText, newText),

  // Composition
  composePrompts: (parts) => ipcRenderer.invoke('compose-prompts', parts),

  // Events
  onLibraryChanged: (cb) => ipcRenderer.on('library-changed', cb),
});
