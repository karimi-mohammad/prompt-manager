const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { getPromptsDir } = require('./library');

/**
 * Create a zip backup of the entire library.
 */
function backupLibrary(libraryPath, destPath) {
  const pd = getPromptsDir(libraryPath);
  if (!fs.existsSync(pd)) throw new Error('Prompts directory does not exist');

  const zip = new AdmZip();
  addFolderToZip(zip, pd, 'prompts');
  zip.writeZip(destPath);
  return destPath;
}

/**
 * Export a single prompt file.
 */
function exportPrompt(libraryPath, id, destPath) {
  const src = path.join(getPromptsDir(libraryPath), id);
  if (!fs.existsSync(src)) throw new Error('Prompt not found');
  fs.copyFileSync(src, destPath);
  return destPath;
}

/**
 * Export entire library as zip.
 */
function exportLibrary(libraryPath, destPath) {
  return backupLibrary(libraryPath, destPath);
}

function addFolderToZip(zip, folderPath, zipPath) {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name);
    const entryZipPath = `${zipPath}/${entry.name}`;
    if (entry.isDirectory()) {
      addFolderToZip(zip, fullPath, entryZipPath);
    } else {
      const content = fs.readFileSync(fullPath);
      zip.addFile(entryZipPath, content);
    }
  }
}

module.exports = { backupLibrary, exportPrompt, exportLibrary };
