import { loadTasks, saveTasks, loadExpanded, saveExpanded, loadTagColors, saveTagColors } from './storage.js';
import { PRIORITY_ORDER, TAG_COLORS, TAG_COLORS_DARK } from './constants.js';

// ---- Tasks ----

let tasks = [];

export function getTasks() { return tasks; }
export function setTasks(t) { tasks = t; }

export function persistTasks() { saveTasks(tasks); }

export function initTasks() {
  tasks = loadTasks();
}

// ---- Expanded sections ----

let expandedSections = { todo: true };

export function getExpanded() { return expandedSections; }
export function setExpanded(e) { expandedSections = e; }

export function persistExpanded() { saveExpanded(expandedSections); }

export function initExpanded() {
  expandedSections = loadExpanded();
}

// ---- Sort ----

let activeSort = { type: 'created', dir: 'asc' };

export function getActiveSort() { return activeSort; }
export function setActiveSort(s) { activeSort = s; }

// ---- Group by ----

let activeGroupBy = 'status'; // 'status' | 'tag' | 'priority' | 'due'

export function getGroupBy() { return activeGroupBy; }
export function setGroupBy(g) { activeGroupBy = g; }

export function getFilteredTasks(statusKey) {
  let list = tasks.filter(t => t.status === statusKey);
  const isDone = t => t.status === 'complete' || t.status === 'canceled';
  if (activeSort.type === 'created') {
    const sorted = [...list].sort((a, b) => a.createdAt - b.createdAt);
    return [...sorted.filter(t => !isDone(t)), ...sorted.filter(t => isDone(t))];
  }
  const sorted = [...list].sort((a, b) => {
    let valA, valB;
    if (activeSort.type === 'priority') {
      valA = PRIORITY_ORDER[a.priority] ?? 99;
      valB = PRIORITY_ORDER[b.priority] ?? 99;
    } else if (activeSort.type === 'due') {
      valA = a.due || '9999-99-99';
      valB = b.due || '9999-99-99';
    } else if (activeSort.type === 'tag') {
      valA = (a.tags[0] || 'zzz').toLowerCase();
      valB = (b.tags[0] || 'zzz').toLowerCase();
    }
    if (valA < valB) return activeSort.dir === 'asc' ? -1 : 1;
    if (valA > valB) return activeSort.dir === 'asc' ? 1 : -1;
    return 0;
  });
  return [...sorted.filter(t => !isDone(t)), ...sorted.filter(t => isDone(t))];
}

// ---- Board group by ----

let boardGroupBy = 'status'; // 'status' | 'tag' | 'priority' | 'due'

export function getBoardGroupBy() { return boardGroupBy; }
export function setBoardGroupBy(g) { boardGroupBy = g; }

// ---- Search ----

let searchQuery = '';

export function getSearchQuery() { return searchQuery; }
export function setSearchQuery(q) { searchQuery = q; }

// ---- Bulk selection ----

let selectionMode = false;
let selectedIds = new Set();

export function isSelectionMode() { return selectionMode; }
export function getSelectedIds() { return selectedIds; }

export function enterSelectionMode(taskId) {
  selectionMode = true;
  selectedIds = new Set([taskId]);
}

export function clearSelectionMode() {
  selectionMode = false;
  selectedIds.clear();
}

export function toggleSelectionId(taskId) {
  if (selectedIds.has(taskId)) {
    selectedIds.delete(taskId);
  } else {
    selectedIds.add(taskId);
  }
}

// ---- Tag colors ----

let tagColorMap = {};

export function initTagColors() {
  tagColorMap = loadTagColors();
}

export function getTagColorIndex(tagName) {
  if (tagColorMap[tagName] !== undefined) return tagColorMap[tagName];
  const usedIndices = new Set(Object.values(tagColorMap));
  for (let i = 0; i < TAG_COLORS.length; i++) {
    if (!usedIndices.has(i)) {
      tagColorMap[tagName] = i;
      saveTagColors(tagColorMap);
      return i;
    }
  }
  tagColorMap[tagName] = Object.keys(tagColorMap).length % TAG_COLORS.length;
  saveTagColors(tagColorMap);
  return tagColorMap[tagName];
}

export function pruneTagColors() {
  const allTags = new Set(tasks.flatMap(t => t.tags));
  let changed = false;
  Object.keys(tagColorMap).forEach(tag => {
    if (!allTags.has(tag)) { delete tagColorMap[tag]; changed = true; }
  });
  if (changed) saveTagColors(tagColorMap);
}

export function tagPillStyle(tagName) {
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  const idx = getTagColorIndex(tagName);
  const palette = isDark ? TAG_COLORS_DARK : TAG_COLORS;
  const c = palette[idx % palette.length];
  return `background:${c.bg};color:${c.text};`;
}

export function getTagColor(tagName) {
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  const idx = getTagColorIndex(tagName);
  const palette = isDark ? TAG_COLORS_DARK : TAG_COLORS;
  return palette[idx % palette.length];
}
