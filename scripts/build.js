// scripts/build.js — Build, clean, and package
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const UNPACKED = path.join(DIST, 'win-unpacked');

console.log('🔨 Building Electron app...');

// Clean previous build using shell command (Node.js fs.rmSync has permission issues on Windows)
try { execSync(`rm -rf "${DIST}"`, { stdio: 'ignore' }); } catch { /* ignore */ }

// Run electron-builder
execSync('npx electron-builder --win --dir', {
  cwd: ROOT,
  stdio: 'inherit',
});

console.log('\n🧹 Cleaning unnecessary files...');

// Files to remove (don't need for our app)
const REMOVE_FILES = [
  'ffmpeg.dll',
  'vk_swiftshader.dll',
  'd3dcompiler_47.dll',
  'libGLESv2.dll',
  'libEGL.dll',
  'vulkan-1.dll',
  'LICENSES.chromium.html',
  'chrome_200_percent.pak',
  'vk_swiftshader_icd.json',
  'swiftshader',
  'ANGLE',
  'EGL',
  'GLES2',
];

// Remove unnecessary DLLs and files
for (const file of REMOVE_FILES) {
  const p = path.join(UNPACKED, file);
  if (fs.existsSync(p)) {
    try { execSync(`rm -rf "${p}"`, { stdio: 'ignore' }); } catch { /* ignore */ }
    console.log(`  ❌ Removed: ${file}`);
  }
}

// Remove all locales except en-US
const localesDir = path.join(UNPACKED, 'locales');
if (fs.existsSync(localesDir)) {
  const files = fs.readdirSync(localesDir);
  for (const f of files) {
    if (f !== 'en-US.pak') {
      try { execSync(`rm -f "${path.join(localesDir, f)}"`, { stdio: 'ignore' }); } catch { /* ignore */ }
    }
  }
  console.log(`  ❌ Removed ${files.length - 1} locale files (kept en-US.pak)`);
}

// Check new size
const dirSize = getDirSize(UNPACKED);
console.log(`\n📦 Cleaned build size: ${(dirSize / 1024 / 1024).toFixed(1)} MB`);

// Create portable zip
console.log('\n📦 Creating portable zip...');
const zipPath = path.join(DIST, 'PromptManager-Portable.zip');
execSync(
  `powershell -Command "Compress-Archive -Path '${UNPACKED}' -DestinationPath '${zipPath}' -CompressionLevel Optimal -Force"`,
  { stdio: 'inherit' }
);

const zipSize = fs.statSync(zipPath).size;
console.log(`📦 Portable zip: ${(zipSize / 1024 / 1024).toFixed(1)} MB`);

// Create NSIS installer
console.log('\n📦 Building NSIS installer...');
execSync('npx electron-builder --win nsis', {
  cwd: ROOT,
  stdio: 'inherit',
});

// Find the installer
const installer = fs.readdirSync(DIST).find(f => f.endsWith('.exe') && f.includes('Setup'));
if (installer) {
  const installerSize = fs.statSync(path.join(DIST, installer)).size;
  console.log(`📦 Installer: ${(installerSize / 1024 / 1024).toFixed(1)} MB`);
}

console.log('\n✅ Build complete!');

function getDirSize(dir) {
  let size = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      size += getDirSize(p);
    } else {
      size += fs.statSync(p).size;
    }
  }
  return size;
}
