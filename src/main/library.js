const fs = require('fs');
const path = require('path');
const { parseFrontMatter, serializeFrontMatter } = require('./frontmatter');

const PROMPTS_DIR = 'prompts';

function getPromptsDir(libraryPath) {
  return path.join(libraryPath, PROMPTS_DIR);
}

/**
 * Ensure the prompts directory structure exists.
 */
function ensureStructure(libraryPath) {
  const pd = getPromptsDir(libraryPath);
  if (!fs.existsSync(pd)) fs.mkdirSync(pd, { recursive: true });
}

/**
 * Slugify a string for use as a filename.
 * Replaces Windows-illegal characters, trims, handles collisions.
 */
function slugify(name, libraryPath) {
  let slug = name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim();

  if (!slug) slug = 'untitled';

  const pd = getPromptsDir(libraryPath);
  let finalSlug = slug;
  let counter = 2;
  while (fs.existsSync(path.join(pd, finalSlug + '.md'))) {
    finalSlug = `${slug}-${counter}`;
    counter++;
  }
  return finalSlug;
}

/**
 * Scan the library and return all prompts + category tree.
 */
function scanLibrary(libraryPath) {
  ensureStructure(libraryPath);
  const pd = getPromptsDir(libraryPath);
  const prompts = [];
  const categoryCounts = {};
  const allFolders = new Set(); // track all folders including empty ones

  function walkDir(dir, relBase) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        // Skip internal dirs (__variants, __versions)
        if (entry.name.startsWith('__')) continue;
        allFolders.add(relPath);
        walkDir(fullPath, relPath);
      } else if (entry.name.endsWith('.md')) {
        const prompt = loadPromptFromFile(fullPath, relPath, libraryPath);
        if (prompt) {
          prompts.push(prompt);
          const cat = prompt.category || 'uncategorized';
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        }
      }
    }
  }

  walkDir(pd, '');

  // Add empty folders to counts so they appear in the tree
  for (const folder of allFolders) {
    if (!categoryCounts[folder]) {
      categoryCounts[folder] = 0;
    }
  }

  // Build category tree from flat counts
  const categoryTree = buildCategoryTree(categoryCounts);

  return { prompts, categories: categoryTree, categoryCounts };
}

/**
 * Build a tree structure from flat category path counts.
 * e.g. { 'coding': 5, 'coding/frontend': 3, 'coding/backend': 2 }
 * → [{ name: 'coding', count: 5, fullPath: 'coding', children: [...] }]
 */
function buildCategoryTree(counts) {
  // Collect all unique paths
  const allPaths = new Set();
  for (const catPath of Object.keys(counts)) {
    // Add all ancestor paths
    const parts = catPath.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? current + '/' + part : part;
      allPaths.add(current);
    }
  }

  // Count prompts for each path (including subcategories)
  const pathCounts = {};
  for (const [catPath, count] of Object.entries(counts)) {
    // Add count to this path and all ancestors
    const parts = catPath.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? current + '/' + part : part;
      pathCounts[current] = (pathCounts[current] || 0) + (catPath === current ? count : 0);
    }
  }

  // Also count prompts from subcategories for parent nodes
  for (const [catPath, count] of Object.entries(counts)) {
    const parts = catPath.split('/');
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? current + '/' + parts[i] : parts[i];
      pathCounts[current] = (pathCounts[current] || 0) + count;
    }
  }

  // Build tree nodes
  const nodeMap = {};
  for (const catPath of allPaths) {
    const parts = catPath.split('/');
    const name = parts[parts.length - 1];
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null;

    nodeMap[catPath] = {
      name,
      fullPath: catPath,
      count: pathCounts[catPath] || 0,
      children: [],
      _parentPath: parentPath,
    };
  }

  // Link parents to children
  const roots = [];
  for (const node of Object.values(nodeMap)) {
    if (node._parentPath && nodeMap[node._parentPath]) {
      nodeMap[node._parentPath].children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children recursively
  function sortTree(nodes) {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortTree(n.children);
  }
  sortTree(roots);

  return roots;
}

/**
 * Load a single prompt file.
 */
function loadPromptFromFile(fullPath, relPath, libraryPath) {
  try {
    const raw = fs.readFileSync(fullPath, 'utf-8').replace(/\r\n/g, '\n');
    const { meta, body } = parseFrontMatter(raw);

    if (!meta) {
      // No front matter — create minimal meta from filename
      const name = path.basename(fullPath, '.md');
      return {
        id: relPath.replace(/\\/g, '/'),
        relPath: relPath.replace(/\\/g, '/'),
        title: name,
        description: '',
        category: path.dirname(relPath) === '.' ? 'uncategorized' : path.dirname(relPath).replace(/\\/g, '/'),
        tags: [],
        favorite: false,
        created: null,
        updated: null,
        variables: [],
        body,
      };
    }

    return {
      id: relPath.replace(/\\/g, '/'),
      relPath: relPath.replace(/\\/g, '/'),
      title: meta.title || path.basename(fullPath, '.md'),
      description: meta.description || '',
      category: meta.category || (path.dirname(relPath) === '.' ? 'uncategorized' : path.dirname(relPath).replace(/\\/g, '/')),
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      favorite: !!meta.favorite,
      created: meta.created || null,
      updated: meta.updated || null,
      variables: Array.isArray(meta.variables) ? meta.variables : [],
      body,
    };
  } catch {
    return null;
  }
}

/**
 * Save a prompt (create or update).
 * If id is provided, it's an update. If category changed, move the file.
 */
function savePrompt(libraryPath, data) {
  ensureStructure(libraryPath);
  const pd = getPromptsDir(libraryPath);
  const now = new Date().toISOString();

  const meta = {
    title: data.title,
    description: data.description || '',
    category: data.category || 'uncategorized',
    tags: data.tags || [],
    favorite: data.favorite || false,
    created: data.created || now,
    updated: now,
    variables: data.variables || [],
  };

  const content = serializeFrontMatter(meta, data.body || '');

  if (data.id) {
    // Update existing — check if category changed
    const oldPath = path.join(pd, data.id);
    const newCategoryDir = path.join(pd, meta.category);
    const newSlug = slugify(meta.title, libraryPath);
    const newRelPath = path.join(meta.category, newSlug + '.md').replace(/\\/g, '/');
    const newPath = path.join(pd, newRelPath);

    // If category or title changed, move the file
    if (data.id !== newRelPath) {
      // Ensure new dir exists
      if (!fs.existsSync(newCategoryDir)) {
        fs.mkdirSync(newCategoryDir, { recursive: true });
      }

      // Write to new location
      fs.writeFileSync(newPath, content, 'utf-8');

      // Remove old file if different
      if (fs.existsSync(oldPath) && oldPath !== newPath) {
        fs.unlinkSync(oldPath);
        // Clean up empty old category dir
        const oldDir = path.dirname(oldPath);
        if (oldDir !== pd && fs.existsSync(oldDir)) {
          try { fs.rmdirSync(oldDir); } catch { /* not empty, ok */ }
        }
      }

      return { id: newRelPath };
    } else {
      // Same path, just overwrite
      fs.writeFileSync(oldPath, content, 'utf-8');
      return { id: data.id };
    }
  } else {
    // Create new
    const slug = slugify(meta.title, libraryPath);
    const relPath = path.join(meta.category, slug + '.md').replace(/\\/g, '/');
    const fullPath = path.join(pd, relPath);

    const catDir = path.join(pd, meta.category);
    if (!fs.existsSync(catDir)) {
      fs.mkdirSync(catDir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, 'utf-8');
    return { id: relPath };
  }
}

/**
 * Delete a prompt file.
 */
function deletePrompt(libraryPath, id) {
  const pd = getPromptsDir(libraryPath);
  const fullPath = path.join(pd, id);

  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    // Clean up empty category dir
    const dir = path.dirname(fullPath);
    if (dir !== pd) {
      try { fs.rmdirSync(dir); } catch { /* not empty, ok */ }
    }
  }
}

/**
 * Toggle favorite on a prompt.
 */
function toggleFavorite(libraryPath, id, fav) {
  const pd = getPromptsDir(libraryPath);
  const fullPath = path.join(pd, id);

  const raw = fs.readFileSync(fullPath, 'utf-8').replace(/\r\n/g, '\n');
  const { meta, body } = parseFrontMatter(raw);

  if (meta) {
    meta.favorite = fav;
    meta.updated = new Date().toISOString();
    fs.writeFileSync(fullPath, serializeFrontMatter(meta, body), 'utf-8');
  }
}

/**
 * Create a new category folder (supports hierarchical paths like "coding/frontend").
 */
function createCategory(libraryPath, categoryPath) {
  ensureStructure(libraryPath);
  const dir = path.join(getPromptsDir(libraryPath), categoryPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Copy .md files from source paths into the library.
 */
function importFiles(libraryPath, sourcePaths) {
  ensureStructure(libraryPath);
  const pd = getPromptsDir(libraryPath);
  let imported = 0;

  for (const src of sourcePaths) {
    if (!fs.existsSync(src)) continue;

    const stat = fs.statSync(src);
    if (stat.isFile() && path.basename(src).endsWith('.md')) {
      const name = path.basename(src, '.md');
      const slug = slugify(name, libraryPath);
      const dest = path.join(pd, slug + '.md');
      fs.copyFileSync(src, dest);
      imported++;
    } else if (stat.isDirectory()) {
      imported += importFolderRecursive(src, pd, libraryPath);
    }
  }

  return imported;
}

function importFolderRecursive(srcDir, destParent, libraryPath) {
  let count = 0;
  const folderName = path.basename(srcDir);
  const targetDir = path.join(destParent, folderName);

  let entries;
  try { entries = fs.readdirSync(srcDir, { withFileTypes: true }); }
  catch { return 0; }

  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      count += importFolderRecursive(src, targetDir, libraryPath);
    } else if (entry.name.endsWith('.md')) {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const name = path.basename(entry.name, '.md');
      const slug = slugify(name, libraryPath);
      const dest = path.join(targetDir, slug + '.md');
      fs.copyFileSync(src, dest);
      count++;
    }
  }
  return count;
}

module.exports = {
  getPromptsDir,
  ensureStructure,
  slugify,
  scanLibrary,
  loadPromptFromFile,
  savePrompt,
  deletePrompt,
  toggleFavorite,
  createCategory,
  importFiles,
};
