const fs = require('fs');
const path = require('path');

const VARIANTS_DIR = '__variants';

function getVariantsDir(libraryPath, promptId) {
  const promptDir = path.dirname(path.join(libraryPath, 'prompts', promptId));
  return path.join(promptDir, VARIANTS_DIR);
}

function getVariantFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').trim() + '.md';
}

/**
 * List all variants for a prompt.
 */
function listVariants(libraryPath, promptId) {
  const dir = getVariantsDir(libraryPath, promptId);
  if (!fs.existsSync(dir)) return [];

  const variants = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return []; }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const fullPath = path.join(dir, entry.name);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8').replace(/\r\n/g, '\n');
        const name = entry.name.replace(/\.md$/, '');
        variants.push({ id: name, name, content });
      } catch { /* skip */ }
    }
  }

  return variants.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Save a variant for a prompt.
 */
function saveVariant(libraryPath, promptId, name, content) {
  const dir = getVariantsDir(libraryPath, promptId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const fileName = getVariantFileName(name);
  const fullPath = path.join(dir, fileName);
  fs.writeFileSync(fullPath, content, 'utf-8');
  return { id: name, name, content };
}

/**
 * Delete a variant.
 */
function deleteVariant(libraryPath, promptId, variantName) {
  const dir = getVariantsDir(libraryPath, promptId);
  const fullPath = path.join(dir, getVariantFileName(variantName));
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

module.exports = { listVariants, saveVariant, deleteVariant };
