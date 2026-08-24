const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const SETTINGS_FILE = 'settings.json';

function getSettingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

function loadSettings() {
  const p = getSettingsPath();
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

function saveSettings(data) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(data, null, 2), 'utf-8');
}

function getLibraryPath() {
  return loadSettings().libraryPath || null;
}

function setLibraryPath(libPath) {
  const s = loadSettings();
  s.libraryPath = libPath;
  saveSettings(s);
}

module.exports = { getSettingsPath, loadSettings, saveSettings, getLibraryPath, setLibraryPath };
