// store.js — simple pub/sub state store

const state = {
  settings: null,
  libraryPath: null,
  prompts: [],
  categories: [],
  activeView: 'all',          // 'all' | 'favorites' | category name
  selectedPromptId: null,
  activeTab: 'preview',       // 'preview' | 'edit' | 'run'
  sortBy: 'name',             // 'name' | 'created' | 'updated' | 'favorite'
  searchQuery: '',
};

const listeners = new Map();

export function getState() {
  return state;
}

export function setState(updates) {
  Object.assign(state, updates);
  notify();
}

export function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key).delete(fn);
}

function notify() {
  for (const fns of listeners.values()) {
    for (const fn of fns) {
      try { fn(state); } catch (e) { console.error('Store listener error:', e); }
    }
  }
}
