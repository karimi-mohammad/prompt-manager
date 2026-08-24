// app.js — Prompt Manager entry point (Phase 1 + 2)
import { api } from './api.js';
import { getState, setState, subscribe } from './store.js';
import { fuzzySearch } from './fuzzy.js';
import { detectVariables, mergeVariables } from './variables.js';
import { renderMarkdown } from './markdown.js';

// === DOM refs ===
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const onboarding = $('#onboarding');
const globalSearch = $('#global-search');
const categoriesList = $('#categories-list');
const snippetsList = $('#snippets-list');
const promptList = $('#prompt-list');
const listTitle = $('#list-title');
const listSort = $('#list-sort');
const detailEmpty = $('#detail-empty');
const detailContent = $('#detail-content');
const tabContent = $('#tab-content');
const detailActions = $('#detail-actions');
const modalDelete = $('#modal-delete');
const modalNewPrompt = $('#modal-new-prompt');
const modalSort = $('#modal-sort');
const sortDropdown = $('#sort-dropdown');
const modalCmdPalette = $('#modal-command-palette');
const cmdPaletteSearch = $('#cmd-palette-search');
const cmdPaletteList = $('#cmd-palette-list');
const toastContainer = $('#toast-container');
const dropOverlay = $('#drop-overlay');

// === Init ===
async function init() {
  const settings = await api.getSettings();

  if (!settings.libraryPath) {
    showOnboarding();
    return;
  }

  setState({ settings, libraryPath: settings.libraryPath });
  await loadLibrary();
  await loadSnippets();
  bindEvents();
}

// === Onboarding ===
function showOnboarding() {
  onboarding.style.display = 'flex';
  $('#btn-default-location').onclick = async () => {
    const path = await api.chooseLibraryFolder();
    if (path && !path.canceled) {
      await api.setLibraryPath(path.path);
      setState({ libraryPath: path.path });
      onboarding.style.display = 'none';
      await loadLibrary();
      await loadSnippets();
      bindEvents();
    }
  };
  $('#btn-choose-location').onclick = async () => {
    const result = await api.chooseLibraryFolder();
    if (result && !result.canceled) {
      await api.setLibraryPath(result.path);
      setState({ libraryPath: result.path });
      onboarding.style.display = 'none';
      await loadLibrary();
      await loadSnippets();
      bindEvents();
    }
  };
}

// === Load Library ===
async function loadLibrary() {
  const data = await api.scanLibrary();
  setState({
    prompts: data.prompts || [],
    categories: data.categories || [],
  });
  renderSidebar();
  renderPromptList();
}

// === Load Snippets ===
async function loadSnippets() {
  try {
    const data = await api.listSnippets();
    setState({ snippets: data || [] });
    renderSnippetsList();
  } catch {
    setState({ snippets: [] });
  }
}

// === Render Sidebar ===
function renderSidebar() {
  const { prompts, categories, activeView } = getState();
  const favCount = prompts.filter(p => p.favorite).length;

  $('#count-all').textContent = prompts.length;
  $('#count-fav').textContent = favCount;

  $$('.sidebar__item[data-view]').forEach(el => {
    el.classList.toggle('sidebar__item--active', el.dataset.view === activeView);
  });

  // Render category tree recursively
  categoriesList.innerHTML = renderCategoryTree(categories, 0) + `
    <div class="sidebar__item" data-action="new-subcategory" style="color:var(--text-muted); font-size:var(--fs-xs); margin-top:var(--sp-1);">
      <span class="sidebar__item-icon">+</span>
      <span class="sidebar__item-label">New Category</span>
    </div>
  `;
}

function renderCategoryTree(nodes, depth) {
  if (!nodes || nodes.length === 0) return '';
  const indent = depth * 16;

  return nodes.map(node => {
    const hasChildren = node.children && node.children.length > 0;
    const isActive = getState().activeView === node.fullPath;
    const chevron = hasChildren ? '▾' : '';

    return `
      <div class="sidebar__item ${isActive ? 'sidebar__item--active' : ''}"
           data-view="${escHtml(node.fullPath)}"
           style="padding-left:calc(var(--sp-4) + ${indent}px)">
        ${hasChildren
          ? `<span class="sidebar__item-icon" data-toggle-cat="${escHtml(node.fullPath)}" style="cursor:pointer; font-size:10px; width:12px;">${chevron}</span>`
          : `<span class="sidebar__item-icon" style="width:12px;">　</span>`
        }
        <span class="sidebar__item-icon">📁</span>
        <span class="sidebar__item-label">${escHtml(node.name)}</span>
        <span class="sidebar__item-count">${node.count}</span>
      </div>
      <div class="category-children" data-parent-cat="${escHtml(node.fullPath)}" style="${depth > 0 && !isActive ? '' : ''}">
        ${renderCategoryTree(node.children, depth + 1)}
      </div>
    `;
  }).join('');
}

// === Render Snippets List ===
function renderSnippetsList() {
  const { snippets } = getState();
  snippetsList.innerHTML = snippets.map(s => `
    <div class="sidebar__item" data-snippet="${escHtml(s.name)}">
      <span class="sidebar__item-icon">🧩</span>
      <span class="sidebar__item-label">${escHtml(s.name)}</span>
    </div>
  `).join('') + `
    <div class="sidebar__item" data-action="new-snippet" style="color:var(--text-muted); font-size:var(--fs-xs);">
      <span class="sidebar__item-icon">+</span>
      <span class="sidebar__item-label">New Snippet</span>
    </div>
  `;
}

// === Render Prompt List ===
function renderPromptList() {
  const { prompts, activeView, sortBy, searchQuery, selectedPromptId } = getState();

  if (activeView === 'history') {
    renderHistoryList();
    return;
  }

  let filtered = prompts;
  if (activeView === 'favorites') {
    filtered = prompts.filter(p => p.favorite);
  } else if (activeView !== 'all' && activeView !== 'history') {
    // Match category exactly OR any subcategory (prefix match)
    filtered = prompts.filter(p => p.category === activeView || (p.category || '').startsWith(activeView + '/'));
  }

  filtered = sortPrompts(filtered, sortBy);

  const results = searchQuery
    ? fuzzySearch(filtered, searchQuery)
    : filtered.map(p => ({ prompt: p, score: 0, titlePositions: [] }));

  const viewLabels = { all: 'All Prompts', favorites: '⭐ Favorites' };
  if (viewLabels[activeView]) {
    listTitle.textContent = viewLabels[activeView];
  } else if (activeView.includes('/')) {
    // Show short name for nested categories
    const parts = activeView.split('/');
    listTitle.textContent = '📁 ' + parts[parts.length - 1];
    listTitle.title = activeView;
  } else {
    listTitle.textContent = `📁 ${activeView}`;
  }

  if (results.length === 0) {
    promptList.innerHTML = `
      <div class="empty-state" style="padding:var(--sp-6)">
        <div class="empty-state__icon">📋</div>
        <div class="empty-state__text">${searchQuery ? 'No matches found' : 'No prompts yet'}</div>
        <div class="empty-state__hint">${searchQuery ? 'Try a different search' : 'Create your first prompt!'}</div>
      </div>
    `;
    return;
  }

  promptList.innerHTML = results.map(({ prompt: p, titlePositions }) => {
    const title = titlePositions.length
      ? highlightPositions(p.title, titlePositions)
      : escHtml(p.title);

    return `
      <div class="prompt-card ${p.id === selectedPromptId ? 'prompt-card--active' : ''}" data-id="${escHtml(p.id)}">
        <div class="prompt-card__title">
          ${p.favorite ? '<span class="fav-star">⭐</span>' : ''}
          ${title}
        </div>
        <div class="prompt-card__meta">
          <span class="prompt-card__category">${escHtml(p.category)}</span>
          ${p.tags.length ? '· ' + p.tags.slice(0, 3).map(t => escHtml(t)).join(' · ') : ''}
        </div>
      </div>
    `;
  }).join('');
}

// === Render History List ===
async function renderHistoryList() {
  listTitle.textContent = '🕒 History';
  try {
    const history = await api.getHistory();
    $('#count-history').textContent = history.length;

    if (history.length === 0) {
      promptList.innerHTML = `
        <div class="empty-state" style="padding:var(--sp-6)">
          <div class="empty-state__icon">🕒</div>
          <div class="empty-state__text">No history yet</div>
          <div class="empty-state__hint">Run a prompt to see it here</div>
        </div>
      `;
      return;
    }

    promptList.innerHTML = history.map(entry => {
      const time = new Date(entry.timestamp);
      const timeStr = time.toLocaleDateString() + ' ' + time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const vars = Object.entries(entry.variables || {}).map(([k, v]) =>
        `${escHtml(k)}=${escHtml(v.substring(0, 30))}${v.length > 30 ? '...' : ''}`
      ).join(', ');

      return `
        <div class="prompt-card" data-history-id="${escHtml(entry.id)}" data-prompt-id="${escHtml(entry.promptId)}">
          <div class="prompt-card__title">${escHtml(entry.promptTitle || 'Untitled')}</div>
          <div class="prompt-card__meta">
            <span>${timeStr}</span>
            ${vars ? `<span>· ${vars}</span>` : ''}
          </div>
          <div style="margin-top:var(--sp-1); display:flex; gap:var(--sp-2);">
            <button class="btn btn--primary btn--sm" data-re-run="${escHtml(entry.id)}">↻ Re-run</button>
            <button class="btn btn--ghost btn--sm" data-delete-history="${escHtml(entry.id)}">✕</button>
          </div>
        </div>
      `;
    }).join('');
  } catch {
    promptList.innerHTML = `
      <div class="empty-state" style="padding:var(--sp-6)">
        <div class="empty-state__icon">🕒</div>
        <div class="empty-state__text">No history yet</div>
      </div>
    `;
  }
}

// === Sort Prompts ===
function sortPrompts(prompts, sortBy) {
  const sorted = [...prompts];
  switch (sortBy) {
    case 'name':
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      break;
    case 'created':
      sorted.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      break;
    case 'updated':
      sorted.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
      break;
    case 'favorite':
      sorted.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || (a.title || '').localeCompare(b.title || ''));
      break;
  }
  return sorted;
}

// === Select Prompt ===
function selectPrompt(id) {
  const { prompts } = getState();
  const prompt = prompts.find(p => p.id === id);
  if (!prompt) return;

  setState({ selectedPromptId: id, activeTab: 'preview' });
  renderPromptList();
  renderDetail(prompt);
}

// === Render Detail Panel ===
function renderDetail(prompt) {
  detailEmpty.style.display = 'none';
  detailContent.style.display = 'flex';
  detailActions.style.display = 'flex';

  $('#btn-fav-toggle').textContent = prompt.favorite ? '★' : '☆';
  $('#btn-fav-toggle').classList.toggle('btn--primary', prompt.favorite);

  renderTab(prompt);
}

function renderTab(prompt) {
  const { activeTab } = getState();

  $$('.detail-tab').forEach(el => {
    el.classList.toggle('detail-tab--active', el.dataset.tab === activeTab);
  });

  switch (activeTab) {
    case 'preview': renderPreview(prompt); break;
    case 'edit': renderEditor(prompt); break;
    case 'run': renderRunner(prompt); break;
    case 'versions': renderVersions(prompt); break;
    case 'variants': renderVariants(prompt); break;
  }
}

function renderPreview(prompt) {
  const tagsHtml = (prompt.tags || []).map(t => `<span class="tag">${escHtml(t)}</span>`).join('');
  const metaHtml = prompt.created
    ? `<div style="font-size:var(--fs-xs); color:var(--text-muted); margin-bottom:var(--sp-3);">
        Created: ${new Date(prompt.created).toLocaleDateString()}
        ${prompt.updated ? ' · Updated: ' + new Date(prompt.updated).toLocaleDateString() : ''}
       </div>`
    : '';

  tabContent.innerHTML = `
    <div class="detail-content">
      <div class="detail-content__header">
        <div class="detail-content__title">${escHtml(prompt.title)}</div>
        ${prompt.description ? `<div class="detail-content__desc">${escHtml(prompt.description)}</div>` : ''}
        <div class="detail-content__tags">${tagsHtml}</div>
        ${metaHtml}
      </div>
      <div class="markdown-body">${renderMarkdown(prompt.body || '')}</div>
    </div>
  `;
}

function renderEditor(prompt) {
  const detected = detectVariables(prompt.body || '');
  const merged = mergeVariables(detected, prompt.variables);
  const varChips = merged.map(v =>
    `<span class="var-chip">{${escHtml(v.name)}}${v.required ? ' <span style="color:var(--danger)">*</span>' : ''}</span>`
  ).join('');

  tabContent.innerHTML = `
    <div style="display:flex; flex-direction:column; height:100%; padding:var(--sp-5);">
      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" class="input" id="edit-title" value="${escHtml(prompt.title)}">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <input type="text" class="input" id="edit-desc" value="${escHtml(prompt.description || '')}">
      </div>
      <div style="display:flex; gap:var(--sp-3); margin-bottom:var(--sp-3);">
        <div class="form-group" style="flex:1">
          <label class="form-label">Category</label>
          <select class="select" id="edit-category" style="width:100%"></select>
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label">Tags (comma-separated)</label>
          <input type="text" class="input" id="edit-tags" value="${(prompt.tags || []).join(', ')}">
        </div>
      </div>
      <div class="form-group" style="flex:1; display:flex; flex-direction:column;">
        <label class="form-label">Prompt Body</label>
        <div class="var-chips" id="edit-var-chips">${varChips || '<span style="font-size:var(--fs-xs);color:var(--text-muted)">No variables detected</span>'}</div>
        <textarea class="textarea" id="edit-body" style="flex:1">${escHtml(prompt.body || '')}</textarea>
      </div>
      <div style="display:flex; gap:var(--sp-2); justify-content:flex-end; margin-top:var(--sp-3);">
        <button class="btn btn--secondary" id="edit-cancel">Cancel</button>
        <button class="btn btn--primary" id="edit-save">💾 Save</button>
      </div>
    </div>
  `;

  // Populate category dropdown
  populateCategoryDropdown($('#edit-category'), prompt.category);

  const bodyEl = $('#edit-body');
  const chipsEl = $('#edit-var-chips');
  bodyEl.addEventListener('input', () => {
    const detected = detectVariables(bodyEl.value);
    const merged = mergeVariables(detected, prompt.variables);
    chipsEl.innerHTML = merged.map(v =>
      `<span class="var-chip">{${escHtml(v.name)}}${v.required ? ' <span style="color:var(--danger)">*</span>' : ''}</span>`
    ).join('') || '<span style="font-size:var(--fs-xs);color:var(--text-muted)">No variables detected</span>';
  });

  $('#edit-save').onclick = async () => {
    const newTags = $('#edit-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    const detected = detectVariables(bodyEl.value);
    const merged = mergeVariables(detected, prompt.variables);

    const data = {
      id: prompt.id,
      title: $('#edit-title').value.trim() || prompt.title,
      description: $('#edit-desc').value.trim(),
      category: $('#edit-category').value || 'uncategorized',
      tags: newTags,
      favorite: prompt.favorite,
      created: prompt.created,
      variables: merged,
      body: bodyEl.value,
    };

    await api.savePrompt(data);
    showToast('Prompt saved', 'success');
    await loadLibrary();
    selectPrompt(data.id);
  };

  $('#edit-cancel').onclick = () => {
    setState({ activeTab: 'preview' });
    renderTab(prompt);
  };
}

function renderRunner(prompt) {
  const detected = detectVariables(prompt.body || '');
  const merged = mergeVariables(detected, prompt.variables);

  const formHtml = merged.map(v => {
    const defaultVal = v.default || '';
    if (v.type === 'textarea') {
      return `<div class="form-group">
        <label class="form-label ${v.required ? 'form-label--required' : ''}">${escHtml(v.name)}</label>
        <textarea class="textarea" data-var="${escHtml(v.name)}" style="min-height:120px">${escHtml(defaultVal)}</textarea>
      </div>`;
    }
    if (v.type === 'select' && v.options) {
      const opts = v.options.map(o =>
        `<option value="${escHtml(o)}" ${o === defaultVal ? 'selected' : ''}>${escHtml(o)}</option>`
      ).join('');
      return `<div class="form-group">
        <label class="form-label ${v.required ? 'form-label--required' : ''}">${escHtml(v.name)}</label>
        <select class="select" data-var="${escHtml(v.name)}">${opts}</select>
      </div>`;
    }
    return `<div class="form-group">
      <label class="form-label ${v.required ? 'form-label--required' : ''}">${escHtml(v.name)}</label>
      <input type="text" class="input" data-var="${escHtml(v.name)}" value="${escHtml(defaultVal)}">
    </div>`;
  }).join('');

  if (merged.length === 0) {
    tabContent.innerHTML = `
      <div class="detail-content">
        <div class="markdown-body">${renderMarkdown(prompt.body || '')}</div>
        <div style="margin-top:var(--sp-4)">
          <button class="btn btn--primary" id="runner-copy">📋 Copy to Clipboard</button>
        </div>
      </div>
    `;
    $('#runner-copy').onclick = () => copyToClipboard(prompt.body || '');
    return;
  }

  tabContent.innerHTML = `
    <div style="padding:var(--sp-5);">
      <h3 style="font-size:var(--fs-md); margin-bottom:var(--sp-4); color:var(--text-primary);">Fill Variables</h3>
      <div id="runner-form">${formHtml}</div>
      <div id="runner-error" style="color:var(--danger); font-size:var(--fs-sm); margin-bottom:var(--sp-3); display:none;"></div>
      <button class="btn btn--primary btn--lg" id="runner-generate">▶ Generate Prompt</button>
    </div>
    <div id="runner-result" style="display:none; padding:var(--sp-5); border-top:1px solid var(--border);">
      <h3 style="font-size:var(--fs-md); margin-bottom:var(--sp-3); color:var(--text-primary);">Final Prompt</h3>
      <div class="markdown-body" id="runner-output"></div>
      <div style="margin-top:var(--sp-4); display:flex; gap:var(--sp-2);">
        <button class="btn btn--primary" id="runner-copy">📋 Copy to Clipboard</button>
        <button class="btn btn--secondary" id="runner-reset">↻ Reset</button>
      </div>
    </div>
  `;

  $('#runner-generate').onclick = () => {
    const values = {};
    const missing = [];
    tabContent.querySelectorAll('[data-var]').forEach(el => {
      const name = el.dataset.var;
      const val = el.value.trim();
      values[name] = val;
      const varMeta = merged.find(v => v.name === name);
      if (varMeta && varMeta.required && !val) missing.push(name);
    });

    if (missing.length) {
      const errEl = $('#runner-error');
      errEl.textContent = `Required fields missing: ${missing.join(', ')}`;
      errEl.style.display = 'block';
      return;
    }

    let result = prompt.body;
    for (const [name, val] of Object.entries(values)) {
      result = result.replace(new RegExp(`(?<!\\\\)\\{${escapeRegex(name)}\\}`, 'g'), val);
    }
    result = result.replace(/\\{([^}]+)\\}/g, '{$1}');

    $('#runner-output').innerHTML = renderMarkdown(result);
    $('#runner-result').style.display = 'block';
    $('#runner-copy').onclick = () => copyToClipboard(result);
    $('#runner-reset').onclick = () => {
      $('#runner-result').style.display = 'none';
      $('#runner-error').style.display = 'none';
    };

    // Log to history
    api.logRun({
      promptId: prompt.id,
      promptTitle: prompt.title,
      variables: values,
    });

    // Save as variant option
    const saveAsVariantBtn = document.createElement('button');
    saveAsVariantBtn.className = 'btn btn--secondary';
    saveAsVariantBtn.textContent = '💾 Save as Variant';
    saveAsVariantBtn.onclick = async () => {
      const name = prompt.title + ' — ' + Object.values(values).filter(Boolean).join(', ').substring(0, 30);
      await api.saveVariant(prompt.id, name, result);
      showToast('Variant saved!', 'success');
    };
    $('#runner-result').querySelector('div:last-child').appendChild(saveAsVariantBtn);
  };
}

// === Command Palette ===
const COMMANDS = [
  { id: 'new-prompt', label: 'New Prompt', icon: '+', action: () => $('#btn-new-prompt').click() },
  { id: 'search', label: 'Focus Search', icon: '🔍', shortcut: 'Ctrl+K', action: () => { globalSearch.focus(); globalSearch.select(); } },
  { id: 'import', label: 'Import Files', icon: '📥', action: () => $('#btn-import').click() },
  { id: 'export', label: 'Import / Export / Backup', icon: '📤', action: () => $('#btn-export').click() },
  { id: 'settings', label: 'Change Library Folder', icon: '⚙️', action: () => $('#btn-settings').click() },
  { id: 'all-prompts', label: 'View All Prompts', icon: '📄', action: () => switchView('all') },
  { id: 'favorites', label: 'View Favorites', icon: '⭐', action: () => switchView('favorites') },
  { id: 'history', label: 'View History', icon: '🕒', action: () => switchView('history') },
  { id: 'clear-history', label: 'Clear History', icon: '🗑', action: async () => { await api.clearHistory(); showToast('History cleared', 'success'); if (getState().activeView === 'history') renderHistoryList(); } },
  { id: 'compose', label: 'Compose Prompts', icon: '🔗', action: () => openComposeModal() },
];

function switchView(view) {
  setState({ activeView: view, selectedPromptId: null, activeTab: 'preview' });
  renderSidebar();
  renderPromptList();
  detailEmpty.style.display = 'flex';
  detailContent.style.display = 'none';
  detailActions.style.display = 'none';
}

function openCommandPalette() {
  openModal(modalCmdPalette);
  cmdPaletteSearch.value = '';
  renderCommandList('');
  setTimeout(() => cmdPaletteSearch.focus(), 100);
}

function renderCommandList(query) {
  const q = query.toLowerCase();
  const filtered = COMMANDS.filter(c => c.label.toLowerCase().includes(q));

  // Also add prompts as commands
  const { prompts } = getState();
  const promptCmds = q
    ? fuzzySearch(prompts, q).slice(0, 5).map(r => ({
        id: 'run-prompt:' + r.prompt.id,
        label: `Run: ${r.prompt.title}`,
        icon: '▶',
        action: () => { selectPrompt(r.prompt.id); setState({ activeTab: 'run' }); renderTab(r.prompt); },
      }))
    : [];

  const all = [...filtered, ...promptCmds];

  cmdPaletteList.innerHTML = all.map((cmd, i) => `
    <div class="sidebar__item" data-cmd-idx="${i}" style="cursor:pointer">
      <span class="sidebar__item-icon">${cmd.icon}</span>
      <span class="sidebar__item-label">${escHtml(cmd.label)}</span>
      ${cmd.shortcut ? `<span style="font-size:var(--fs-xs);color:var(--text-muted)">${cmd.shortcut}</span>` : ''}
    </div>
  `).join('') || '<div style="padding:var(--sp-3);color:var(--text-muted);text-align:center;">No commands found</div>';

  // Store filtered for keyboard nav
  cmdPaletteList._cmds = all;
  cmdPaletteList._selectedIdx = 0;
  highlightCmdItem(0);
}

function highlightCmdItem(idx) {
  const items = cmdPaletteList.querySelectorAll('.sidebar__item');
  items.forEach((el, i) => el.classList.toggle('sidebar__item--active', i === idx));
  cmdPaletteList._selectedIdx = idx;
}

// === Event Binding ===
function bindEvents() {
  // Sidebar navigation
  document.addEventListener('click', (e) => {
    // Toggle category expand/collapse
    const toggleBtn = e.target.closest('[data-toggle-cat]');
    if (toggleBtn) {
      e.stopPropagation();
      const catPath = toggleBtn.dataset.toggleCat;
      const childrenEl = categoriesList.querySelector(`[data-parent-cat="${catPath}"]`);
      if (childrenEl) {
        childrenEl.classList.toggle('collapsed');
        toggleBtn.textContent = childrenEl.classList.contains('collapsed') ? '▸' : '▾';
      }
      return;
    }

    // Sidebar view items
    const viewItem = e.target.closest('.sidebar__item[data-view]');
    if (viewItem) {
      switchView(viewItem.dataset.view);
      return;
    }

    // New category button
    const newCatBtn = e.target.closest('[data-action="new-subcategory"]');
    if (newCatBtn) {
      openNewCategoryModal();
      return;
    }

    // Snippet click
    const snippetItem = e.target.closest('.sidebar__item[data-snippet]');
    if (snippetItem) {
      showSnippetDetail(snippetItem.dataset.snippet);
      return;
    }

    // New snippet
    const newSnippet = e.target.closest('[data-action="new-snippet"]');
    if (newSnippet) {
      openSnippetEditor(null);
      return;
    }

    // Command palette item
    const cmdItem = e.target.closest('[data-cmd-idx]');
    if (cmdItem && cmdPaletteList._cmds) {
      const cmd = cmdPaletteList._cmds[parseInt(cmdItem.dataset.cmdIdx)];
      if (cmd) {
        closeModal(modalCmdPalette);
        cmd.action();
      }
      return;
    }

    // History re-run
    const reRunBtn = e.target.closest('[data-re-run]');
    if (reRunBtn) {
      reRunHistoryEntry(reRunBtn.dataset.reRun);
      return;
    }

    // History delete
    const delHistBtn = e.target.closest('[data-delete-history]');
    if (delHistBtn) {
      deleteHistoryEntry(delHistBtn.dataset.deleteHistory);
      return;
    }

    // History card click → navigate to prompt
    const histCard = e.target.closest('[data-history-id]');
    if (histCard && !e.target.closest('button')) {
      const promptId = histCard.dataset.promptId;
      if (promptId) {
        switchView('all');
        selectPrompt(promptId);
      }
      return;
    }
  });

  // Prompt list selection
  promptList.addEventListener('click', (e) => {
    const card = e.target.closest('.prompt-card[data-id]');
    if (card) selectPrompt(card.dataset.id);
  });

  // Detail tabs
  $$('.detail-tab').forEach(el => {
    el.addEventListener('click', () => {
      const tab = el.dataset.tab;
      const { prompts, selectedPromptId } = getState();
      const prompt = prompts.find(p => p.id === selectedPromptId);
      if (prompt) {
        setState({ activeTab: tab });
        renderTab(prompt);
      }
    });
  });

  // Search
  globalSearch.addEventListener('input', () => {
    setState({ searchQuery: globalSearch.value });
    renderPromptList();
  });

  // New prompt button
  $('#btn-new-prompt').onclick = () => {
    populateCategoryDropdown($('#new-prompt-category'));

    // Pre-fill category if viewing one
    const { activeView } = getState();
    const catSelect = $('#new-prompt-category');
    if (activeView && activeView !== 'all' && activeView !== 'favorites' && activeView !== 'history') {
      catSelect.value = activeView;
    }

    openModal(modalNewPrompt);
  };

  // Confirm new prompt
  $('#btn-confirm-new-prompt').onclick = async () => {
    const title = $('#new-prompt-title').value.trim();
    if (!title) return;
    const data = {
      title,
      description: $('#new-prompt-desc').value.trim(),
      category: $('#new-prompt-category').value || 'uncategorized',
      tags: $('#new-prompt-tags').value.split(',').map(t => t.trim()).filter(Boolean),
      body: '',
    };
    const result = await api.savePrompt(data);
    showToast('Prompt created', 'success');
    closeModal(modalNewPrompt);
    $('#new-prompt-title').value = '';
    $('#new-prompt-desc').value = '';
    $('#new-prompt-category').value = '';
    $('#new-prompt-tags').value = '';
    await loadLibrary();
    selectPrompt(result.id);
  };

  // Delete
  $('#btn-delete').onclick = () => {
    const { prompts, selectedPromptId } = getState();
    const prompt = prompts.find(p => p.id === selectedPromptId);
    if (!prompt) return;
    $('#delete-prompt-name').textContent = prompt.title;
    openModal(modalDelete);
  };

  $('#btn-confirm-delete').onclick = async () => {
    const { selectedPromptId } = getState();
    if (!selectedPromptId) return;
    await api.deletePrompt(selectedPromptId);
    showToast('Prompt deleted', 'success');
    closeModal(modalDelete);
    setState({ selectedPromptId: null, activeTab: 'preview' });
    detailEmpty.style.display = 'flex';
    detailContent.style.display = 'none';
    detailActions.style.display = 'none';
    await loadLibrary();
  };

  // Favorite toggle
  $('#btn-fav-toggle').onclick = async () => {
    const { prompts, selectedPromptId } = getState();
    const prompt = prompts.find(p => p.id === selectedPromptId);
    if (!prompt) return;
    await api.toggleFavorite(selectedPromptId, !prompt.favorite);
    await loadLibrary();
    selectPrompt(selectedPromptId);
  };

  // Copy button (preview)
  $('#btn-copy').onclick = () => {
    const { prompts, selectedPromptId } = getState();
    const prompt = prompts.find(p => p.id === selectedPromptId);
    if (prompt) copyToClipboard(prompt.body || '');
  };

  // Run button
  $('#btn-run').onclick = () => {
    const { prompts, selectedPromptId } = getState();
    const prompt = prompts.find(p => p.id === selectedPromptId);
    if (prompt) {
      setState({ activeTab: 'run' });
      renderTab(prompt);
    }
  };

  // Sort
  listSort.onclick = (e) => {
    const rect = listSort.getBoundingClientRect();
    sortDropdown.style.position = 'fixed';
    sortDropdown.style.left = rect.left + 'px';
    sortDropdown.style.top = (rect.bottom + 4) + 'px';
    sortDropdown.style.width = '160px';
    openModal(modalSort);
  };

  sortDropdown.addEventListener('click', (e) => {
    const item = e.target.closest('[data-sort]');
    if (item) {
      setState({ sortBy: item.dataset.sort });
      listSort.textContent = '↕ ' + item.dataset.sort.charAt(0).toUpperCase() + item.dataset.sort.slice(1);
      renderPromptList();
      closeModal(modalSort);
    }
  });

  // New category confirm
  $('#btn-confirm-new-category').onclick = async () => {
    const name = $('#new-cat-name').value.trim();
    if (!name) return;
    const parent = $('#new-cat-parent').value;
    const fullPath = parent ? parent + '/' + name : name;
    await api.createCategory(fullPath);
    showToast(`Category "${fullPath}" created`, 'success');
    closeModal($('#modal-new-category'));
    await loadLibrary();
  };

  // Modal close buttons
  $$('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => closeModal(document.getElementById(el.dataset.closeModal)));
  });

  // Click outside modal to close
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
  });

  // Command Palette
  cmdPaletteSearch.addEventListener('input', () => renderCommandList(cmdPaletteSearch.value));
  cmdPaletteSearch.addEventListener('keydown', (e) => {
    const items = cmdPaletteList.querySelectorAll('.sidebar__item');
    const max = items.length;
    let idx = cmdPaletteList._selectedIdx || 0;

    if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx + 1) % max; highlightCmdItem(idx); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + max) % max; highlightCmdItem(idx); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (cmdPaletteList._cmds && cmdPaletteList._cmds[idx]) {
        closeModal(modalCmdPalette);
        cmdPaletteList._cmds[idx].action();
      }
    }
  });

  // Drag & Drop
  document.addEventListener('dragover', (e) => { e.preventDefault(); dropOverlay.style.display = 'block'; });
  document.addEventListener('dragleave', (e) => { if (e.relatedTarget === null) dropOverlay.style.display = 'none'; });
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropOverlay.style.display = 'none';
    if (e.dataTransfer.files.length) {
      const count = await api.importDropped(e.dataTransfer.files);
      if (count > 0) { showToast(`Imported ${count} file(s)`, 'success'); await loadLibrary(); }
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+K — focus search
    if (e.ctrlKey && e.key === 'k') { e.preventDefault(); globalSearch.focus(); globalSearch.select(); }
    // Ctrl+N — new prompt
    if (e.ctrlKey && e.key === 'n') { e.preventDefault(); $('#btn-new-prompt').click(); }
    // Ctrl+Shift+P — command palette
    if (e.ctrlKey && e.shiftKey && e.key === 'P') { e.preventDefault(); openCommandPalette(); }
    // Escape — close modals
    if (e.key === 'Escape') closeAllModals();
  });

  // Settings button
  $('#btn-settings').onclick = async () => {
    const result = await api.chooseLibraryFolder();
    if (result && !result.canceled) {
      await api.setLibraryPath(result.path);
      setState({ libraryPath: result.path });
      await loadLibrary();
      await loadSnippets();
    }
  };

  // Import buttons
  $('#btn-import').onclick = async () => {
    const result = await api.importFiles();
    if (result.imported > 0) { showToast(`Imported ${result.imported} file(s)`, 'success'); await loadLibrary(); }
  };

  // Export button
  $('#btn-export').onclick = () => openModal($('#modal-export'));

  // Export modal actions
  $('#modal-export').addEventListener('click', async (e) => {
    const item = e.target.closest('[data-action]');
    if (!item) return;
    const action = item.dataset.action;
    closeModal($('#modal-export'));

    switch (action) {
      case 'import-files': {
        const result = await api.importFiles();
        if (result.imported > 0) { showToast(`Imported ${result.imported} file(s)`, 'success'); await loadLibrary(); }
        break;
      }
      case 'import-folder': {
        const result = await api.importFolder();
        if (result.imported > 0) { showToast(`Imported ${result.imported} file(s)`, 'success'); await loadLibrary(); }
        break;
      }
      case 'export-current': {
        const { selectedPromptId } = getState();
        if (!selectedPromptId) { showToast('No prompt selected', 'error'); break; }
        const result = await api.exportPrompt(selectedPromptId);
        if (result && !result.canceled) showToast('Exported!', 'success');
        break;
      }
      case 'export-library': {
        const result = await api.exportLibrary();
        if (result && !result.canceled) showToast('Library exported!', 'success');
        break;
      }
      case 'backup-library': {
        const result = await api.backupLibrary();
        if (result && !result.canceled) showToast('Backup created!', 'success');
        break;
      }
    }
  });

  // Library changed (external edits)
  api.onLibraryChanged(async () => {
    await loadLibrary();
    const { selectedPromptId } = getState();
    if (selectedPromptId) {
      const prompt = getState().prompts.find(p => p.id === selectedPromptId);
      if (prompt) renderDetail(prompt);
    }
  });
}

// === Snippet Detail ===
async function showSnippetDetail(name) {
  const snippet = await api.getSnippet(name);
  if (!snippet) return;

  detailEmpty.style.display = 'none';
  detailContent.style.display = 'flex';
  detailActions.style.display = 'none';

  tabContent.innerHTML = `
    <div class="detail-content">
      <div class="detail-content__header">
        <div class="detail-content__title">🧩 ${escHtml(snippet.name)}</div>
        <div style="font-size:var(--fs-xs); color:var(--text-muted); margin-bottom:var(--sp-2);">Snippet — reusable text block</div>
      </div>
      <pre style="background:var(--bg-tertiary); padding:var(--sp-4); border-radius:var(--r-md); overflow-x:auto; font-family:var(--font-mono); font-size:var(--fs-sm); white-space:pre-wrap;">${escHtml(snippet.content)}</pre>
      <div style="margin-top:var(--sp-4); display:flex; gap:var(--sp-2);">
        <button class="btn btn--secondary" id="snippet-edit">✏️ Edit</button>
        <button class="btn btn--primary" id="snippet-copy">📋 Copy</button>
        <button class="btn btn--danger btn--sm" id="snippet-delete">🗑 Delete</button>
      </div>
    </div>
  `;

  $('#snippet-copy').onclick = () => copyToClipboard(snippet.content);
  $('#snippet-edit').onclick = () => openSnippetEditor(snippet);
  $('#snippet-delete').onclick = async () => {
    await api.deleteSnippet(name);
    showToast('Snippet deleted', 'success');
    await loadSnippets();
    detailEmpty.style.display = 'flex';
    detailContent.style.display = 'none';
  };
}

function openSnippetEditor(existing) {
  const title = existing ? 'Edit Snippet' : 'New Snippet';
  const name = existing ? existing.name : '';
  const content = existing ? existing.content : '';

  tabContent.innerHTML = `
    <div style="display:flex; flex-direction:column; height:100%; padding:var(--sp-5);">
      <h3 style="font-size:var(--fs-md); margin-bottom:var(--sp-4);">${escHtml(title)}</h3>
      <div class="form-group">
        <label class="form-label form-label--required">Name</label>
        <input type="text" class="input" id="snippet-name" value="${escHtml(name)}" placeholder="e.g. security-rules" ${existing ? 'readonly' : ''}>
      </div>
      <div class="form-group" style="flex:1; display:flex; flex-direction:column;">
        <label class="form-label form-label--required">Content</label>
        <textarea class="textarea" id="snippet-content" style="flex:1">${escHtml(content)}</textarea>
      </div>
      <div style="display:flex; gap:var(--sp-2); justify-content:flex-end; margin-top:var(--sp-3);">
        <button class="btn btn--secondary" onclick="document.querySelector('#detail-content').style.display='none'; document.querySelector('#detail-empty').style.display='flex';">Cancel</button>
        <button class="btn btn--primary" id="snippet-save">💾 Save</button>
      </div>
    </div>
  `;

  $('#snippet-save').onclick = async () => {
    const snName = $('#snippet-name').value.trim();
    const snContent = $('#snippet-content').value;
    if (!snName || !snContent) { showToast('Name and content required', 'error'); return; }
    await api.saveSnippet(snName, snContent);
    showToast('Snippet saved', 'success');
    await loadSnippets();
    showSnippetDetail(snName);
  };
}

// === History Actions ===
async function reRunHistoryEntry(entryId) {
  const history = await api.getHistory();
  const entry = history.find(e => e.id === entryId);
  if (!entry) return;

  const { prompts } = getState();
  const prompt = prompts.find(p => p.id === entry.promptId);
  if (!prompt) { showToast('Prompt not found — it may have been deleted', 'error'); return; }

  selectPrompt(prompt.id);
  setState({ activeTab: 'run' });
  renderTab(prompt);

  // Pre-fill variables from history
  setTimeout(() => {
    for (const [name, val] of Object.entries(entry.variables || {})) {
      const el = tabContent.querySelector(`[data-var="${name}"]`);
      if (el) el.value = val;
    }
  }, 50);
}

async function deleteHistoryEntry(entryId) {
  await api.deleteHistoryEntry(entryId);
  showToast('History entry removed', 'success');
  renderHistoryList();
}

// === Composition ===
function openComposeModal() {
  const { prompts, snippets } = getState();
  const selected = [];

  const availableEl = $('#compose-available');
  const selectedEl = $('#compose-selected');

  function renderAvailable() {
    let html = '<div style="font-size:var(--fs-xs);color:var(--text-muted);margin-bottom:var(--sp-2)">Prompts:</div>';
    prompts.forEach(p => {
      html += `<div class="sidebar__item compose-item" data-type="prompt" data-id="${escHtml(p.id)}" style="cursor:pointer">
        <span class="sidebar__item-icon">📄</span>
        <span class="sidebar__item-label">${escHtml(p.title)}</span>
      </div>`;
    });
    if (snippets.length) {
      html += '<div style="font-size:var(--fs-xs);color:var(--text-muted);margin:var(--sp-2) 0 var(--sp-1)">Snippets:</div>';
      snippets.forEach(s => {
        html += `<div class="sidebar__item compose-item" data-type="snippet" data-id="${escHtml(s.name)}" style="cursor:pointer">
          <span class="sidebar__item-icon">🧩</span>
          <span class="sidebar__item-label">${escHtml(s.name)}</span>
        </div>`;
      });
    }
    availableEl.innerHTML = html;
  }

  function renderSelected() {
    if (selected.length === 0) {
      selectedEl.innerHTML = '<div style="padding:var(--sp-2);color:var(--text-muted);font-size:var(--fs-xs);text-align:center;">Click items above to add them</div>';
      return;
    }
    selectedEl.innerHTML = selected.map((s, i) => `
      <div style="display:flex;align-items:center;gap:var(--sp-2);padding:2px var(--sp-2);background:var(--bg-tertiary);border-radius:var(--r-sm);margin-bottom:2px;">
        <span style="font-size:var(--fs-xs);color:var(--text-muted);">${i + 1}</span>
        <span>${s.type === 'prompt' ? '📄' : '🧩'}</span>
        <span style="flex:1;font-size:var(--fs-sm);">${escHtml(s.id)}</span>
        <button class="btn btn--ghost btn--sm compose-remove" data-idx="${i}" style="padding:0 4px;">✕</button>
      </div>
    `).join('');
  }

  renderAvailable();
  renderSelected();
  openModal($('#modal-compose'));

  // Add/remove items
  availableEl.onclick = (e) => {
    const item = e.target.closest('.compose-item');
    if (!item) return;
    selected.push({ type: item.dataset.type, id: item.dataset.id });
    renderSelected();
  };

  selectedEl.onclick = (e) => {
    const removeBtn = e.target.closest('.compose-remove');
    if (removeBtn) {
      selected.splice(parseInt(removeBtn.dataset.idx), 1);
      renderSelected();
    }
  };

  // Compose button
  $('#btn-do-compose').onclick = async () => {
    if (selected.length === 0) { showToast('Select items to compose', 'error'); return; }
    const result = await api.composePrompts(selected);
    closeModal($('#modal-compose'));

    // Show result as a new prompt in the detail panel
    const composedPrompt = {
      id: '__composed__',
      title: 'Composed Prompt',
      description: `Composed from ${selected.length} items`,
      category: '',
      tags: [],
      favorite: false,
      created: null,
      updated: null,
      variables: [],
      body: result.content,
    };

    detailEmpty.style.display = 'none';
    detailContent.style.display = 'flex';
    detailActions.style.display = 'none';
    setState({ activeTab: 'preview' });
    renderDetail(composedPrompt);

    // Override the copy button to copy composed content
    setTimeout(() => {
      const copyBtn = $('#btn-copy');
      if (copyBtn) copyBtn.onclick = () => copyToClipboard(result.content);
    }, 50);
  };
}

// === Render Versions ===
async function renderVersions(prompt) {
  try {
    const versionList = await api.listVersions(prompt.id);

    if (versionList.length === 0) {
      tabContent.innerHTML = `
        <div class="detail-content">
          <div class="empty-state" style="padding:var(--sp-6)">
            <div class="empty-state__icon">📜</div>
            <div class="empty-state__text">No versions yet</div>
            <div class="empty-state__hint">Versions are saved automatically each time you edit this prompt</div>
          </div>
        </div>
      `;
      return;
    }

    tabContent.innerHTML = `
      <div class="detail-content">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--sp-4);">
          <h3 style="font-size:var(--fs-md);">Version History (${versionList.length})</h3>
        </div>
        <div id="version-list">
          ${versionList.map((v, i) => {
            const time = new Date(v.timestamp);
            const timeStr = time.toLocaleDateString() + ' ' + time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
              <div class="prompt-card" data-version-idx="${i}">
                <div class="prompt-card__title" style="font-size:var(--fs-sm);">
                  <span style="color:var(--text-muted)">v${versionList.length - i}</span>
                  ${escHtml(v.message || 'Auto-saved')}
                </div>
                <div class="prompt-card__meta">${timeStr}</div>
                <div style="margin-top:var(--sp-1); display:flex; gap:var(--sp-2);">
                  <button class="btn btn--ghost btn--sm" data-view-version="${i}">👁 View</button>
                  <button class="btn btn--secondary btn--sm" data-restore-version="${i}">↻ Restore</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div id="version-diff" style="display:none; margin-top:var(--sp-4);">
          <div style="display:flex; gap:var(--sp-2); margin-bottom:var(--sp-3);">
            <button class="btn btn--ghost btn--sm" id="close-diff">✕ Close</button>
            <button class="btn btn--primary btn--sm" id="restore-from-diff">↻ Restore this version</button>
          </div>
          <pre id="diff-content" style="background:var(--bg-tertiary); padding:var(--sp-4); border-radius:var(--r-md); overflow-x:auto; font-family:var(--font-mono); font-size:var(--fs-sm); white-space:pre-wrap; max-height:400px; overflow-y:auto;"></pre>
        </div>
      </div>
    `;

    // Event handlers for version actions
    const versionListEl = $('#version-list');
    const diffEl = $('#version-diff');
    const diffContent = $('#diff-content');

    versionListEl.addEventListener('click', async (e) => {
      // View version
      const viewBtn = e.target.closest('[data-view-version]');
      if (viewBtn) {
        const idx = parseInt(viewBtn.dataset.viewVersion);
        const version = versionList[idx];
        const content = await api.getVersionContent(prompt.id, version.id);
        if (content) {
          // Show diff against current
          const diff = await api.computeDiff(prompt.body || '', content);
          diffContent.innerHTML = diff.map(d => {
            if (d.type === 'added') return `<span style="color:var(--success)">${escHtml(d.line)}</span>`;
            if (d.type === 'removed') return `<span style="color:var(--danger); text-decoration:line-through;">${escHtml(d.line)}</span>`;
            return escHtml(d.line);
          }).join('\n');
          diffEl.style.display = 'block';
          diffEl._versionIdx = idx;
        }
        return;
      }

      // Restore version
      const restoreBtn = e.target.closest('[data-restore-version]');
      if (restoreBtn) {
        const idx = parseInt(restoreBtn.dataset.restoreVersion);
        const version = versionList[idx];
        const result = await api.restoreVersion(prompt.id, version.id);
        if (result.ok) {
          // Save the restored content as a new save
          const data = {
            id: prompt.id,
            title: prompt.title,
            description: prompt.description,
            category: prompt.category,
            tags: prompt.tags,
            favorite: prompt.favorite,
            created: prompt.created,
            variables: prompt.variables,
            body: result.content,
          };
          await api.savePrompt(data);
          showToast('Version restored!', 'success');
          await loadLibrary();
          selectPrompt(prompt.id);
        }
      }
    });

    // Close diff
    if ($('#close-diff')) {
      $('#close-diff').onclick = () => { diffEl.style.display = 'none'; };
    }

    // Restore from diff view
    if ($('#restore-from-diff')) {
      $('#restore-from-diff').onclick = async () => {
        const idx = diffEl._versionIdx;
        const version = versionList[idx];
        const result = await api.restoreVersion(prompt.id, version.id);
        if (result.ok) {
          const data = {
            id: prompt.id, title: prompt.title, description: prompt.description,
            category: prompt.category, tags: prompt.tags, favorite: prompt.favorite,
            created: prompt.created, variables: prompt.variables, body: result.content,
          };
          await api.savePrompt(data);
          showToast('Version restored!', 'success');
          await loadLibrary();
          selectPrompt(prompt.id);
        }
      };
    }
  } catch (err) {
    console.error('Failed to load versions:', err);
    tabContent.innerHTML = '<div class="detail-content"><p style="color:var(--danger)">Failed to load versions</p></div>';
  }
}

// === Render Variants ===
async function renderVariants(prompt) {
  try {
    const variantList = await api.listVariants(prompt.id);

    if (variantList.length === 0) {
      tabContent.innerHTML = `
        <div class="detail-content">
          <div class="empty-state" style="padding:var(--sp-6)">
            <div class="empty-state__icon">🔀</div>
            <div class="empty-state__text">No variants yet</div>
            <div class="empty-state__hint">Run this prompt and click "Save as Variant" to create one</div>
          </div>
        </div>
      `;
      return;
    }

    tabContent.innerHTML = `
      <div class="detail-content">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--sp-4);">
          <h3 style="font-size:var(--fs-md);">Variants (${variantList.length})</h3>
        </div>
        <div id="variant-list">
          ${variantList.map((v, i) => `
            <div class="prompt-card" data-variant-idx="${i}">
              <div class="prompt-card__title">${escHtml(v.name)}</div>
              <div class="prompt-card__meta" style="margin-top:var(--sp-1); white-space:pre-wrap; font-family:var(--font-mono); font-size:var(--fs-xs); color:var(--text-muted); max-height:60px; overflow:hidden;">${escHtml(v.content.substring(0, 200))}${v.content.length > 200 ? '...' : ''}</div>
              <div style="margin-top:var(--sp-2); display:flex; gap:var(--sp-2);">
                <button class="btn btn--secondary btn--sm" data-view-variant="${i}">👁 View</button>
                <button class="btn btn--primary btn--sm" data-use-variant="${i}">▶ Use</button>
                <button class="btn btn--danger btn--sm" data-delete-variant="${i}">✕</button>
              </div>
            </div>
          `).join('')}
        </div>
        <div id="variant-detail" style="display:none; margin-top:var(--sp-4);">
          <div style="display:flex; gap:var(--sp-2); margin-bottom:var(--sp-3);">
            <button class="btn btn--ghost btn--sm" id="close-variant-detail">✕ Close</button>
            <button class="btn btn--primary btn--sm" id="copy-variant">📋 Copy</button>
          </div>
          <div class="markdown-body" id="variant-output"></div>
        </div>
      </div>
    `;

    const variantListEl = $('#variant-list');
    const detailEl = $('#variant-detail');

    variantListEl.addEventListener('click', async (e) => {
      // View variant
      const viewBtn = e.target.closest('[data-view-variant]');
      if (viewBtn) {
        const idx = parseInt(viewBtn.dataset.viewVariant);
        const v = variantList[idx];
        $('#variant-output').innerHTML = renderMarkdown(v.content);
        detailEl.style.display = 'block';
        $('#copy-variant').onclick = () => copyToClipboard(v.content);
        return;
      }

      // Use variant → load in runner
      const useBtn = e.target.closest('[data-use-variant]');
      if (useBtn) {
        const idx = parseInt(useBtn.dataset.useVariant);
        const v = variantList[idx];
        // Create a temporary prompt object with the variant content
        const tempPrompt = { ...prompt, body: v.content };
        setState({ activeTab: 'run' });
        renderRunner(tempPrompt);
        return;
      }

      // Delete variant
      const delBtn = e.target.closest('[data-delete-variant]');
      if (delBtn) {
        const idx = parseInt(delBtn.dataset.deleteVariant);
        const v = variantList[idx];
        await api.deleteVariant(prompt.id, v.name);
        showToast('Variant deleted', 'success');
        renderVariants(prompt);
        return;
      }
    });

    if ($('#close-variant-detail')) {
      $('#close-variant-detail').onclick = () => { detailEl.style.display = 'none'; };
    }
  } catch (err) {
    console.error('Failed to load variants:', err);
    tabContent.innerHTML = '<div class="detail-content"><p style="color:var(--danger)">Failed to load variants</p></div>';
  }
}

// === New Category Modal ===
function openNewCategoryModal() {
  const { categories } = getState();

  // Populate parent dropdown with all existing categories
  const parentSelect = $('#new-cat-parent');
  parentSelect.innerHTML = '<option value="">— None (root level) —</option>';
  function addCatOptions(nodes, depth) {
    for (const node of nodes) {
      const prefix = '—'.repeat(depth);
      parentSelect.innerHTML += `<option value="${escHtml(node.fullPath)}">${prefix} ${escHtml(node.name)}</option>`;
      if (node.children) addCatOptions(node.children, depth + 1);
    }
  }
  addCatOptions(categories, 1);

  // If currently viewing a category, pre-select it as parent
  const { activeView } = getState();
  if (activeView && activeView !== 'all' && activeView !== 'favorites' && activeView !== 'history') {
    parentSelect.value = activeView;
  }

  $('#new-cat-name').value = '';
  openModal($('#modal-new-category'));
  setTimeout(() => $('#new-cat-name').focus(), 100);
}

// === Helpers ===
function openModal(el) { el.classList.add('modal-overlay--open'); }
function closeModal(el) { el.classList.remove('modal-overlay--open'); }
function closeAllModals() { $$('.modal-overlay--open').forEach(el => closeModal(el)); }

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!', 'success');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('Copied to clipboard!', 'success');
  }
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Populate a <select> element with category tree options.
 * Uses indented labels to show hierarchy.
 */
function populateCategoryDropdown(selectEl, selectedValue) {
  const { categories } = getState();
  selectEl.innerHTML = '<option value="uncategorized">— Uncategorized —</option>';

  function addOptions(nodes, depth) {
    for (const node of nodes) {
      const prefix = depth > 0 ? '  '.repeat(depth) + '└ ' : '';
      const option = document.createElement('option');
      option.value = node.fullPath;
      option.textContent = prefix + node.name;
      selectEl.appendChild(option);
      if (node.children && node.children.length) {
        addOptions(node.children, depth + 1);
      }
    }
  }

  addOptions(categories, 0);

  if (selectedValue) {
    selectEl.value = selectedValue;
  }
}

function highlightPositions(str, positions) {
  if (!str) return '';
  const posSet = new Set(positions);
  let result = '';
  for (let i = 0; i < str.length; i++) {
    if (posSet.has(i)) {
      result += `<mark style="background:var(--accent-muted);color:var(--accent);border-radius:2px;padding:0 1px;">${escHtml(str[i])}</mark>`;
    } else {
      result += escHtml(str[i]);
    }
  }
  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// === Start ===
init();
