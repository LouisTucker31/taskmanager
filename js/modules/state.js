import { loadTasks, saveTasks, loadExpanded, saveExpanded, loadTagColors, saveTagColors, loadEvents, saveEvents } from './storage.js';
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

// ---- Session state helpers (survive refresh, reset on new open) ----

function _ss(key, defaultVal) {
  try { const v = sessionStorage.getItem(key); return v !== null ? JSON.parse(v) : defaultVal; }
  catch { return defaultVal; }
}
function _ssSave(key, val) {
  try { sessionStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ---- Sort ----

let activeSort = _ss('gdak_sort', { type: 'created', dir: 'asc' });

export function getActiveSort() { return activeSort; }
export function setActiveSort(s) { activeSort = s; _ssSave('gdak_sort', s); }

// ---- Group by ----

let activeGroupBy = _ss('gdak_groupBy', 'status');

export function getGroupBy() { return activeGroupBy; }
export function setGroupBy(g) { activeGroupBy = g; _ssSave('gdak_groupBy', g); }

export function getFilteredTasks(statusKey) {
  let list = tasks.filter(t => t.status === statusKey);
  if (activeSort.type === 'created') {
    return [...list].sort((a, b) => a.createdAt - b.createdAt);
  }
  return [...list].sort((a, b) => {
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
}

// ---- Board group by ----

let boardGroupBy = _ss('gdak_boardGroupBy', 'status');

export function getBoardGroupBy() { return boardGroupBy; }
export function setBoardGroupBy(g) { boardGroupBy = g; _ssSave('gdak_boardGroupBy', g); }

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

// ---- Events ----

let events = [];

export function getEvents() { return events; }
export function setEvents(e) { events = e; }
export function persistEvents() { saveEvents(events); }
export function initEvents() { events = loadEvents(); }

// ---- Tasks page tab ----

let activeTasksTab = _ss('gdak_tasksTab', 'tasks');

export function getActiveTasksTab() { return activeTasksTab; }
export function setActiveTasksTab(t) { activeTasksTab = t; _ssSave('gdak_tasksTab', t); }

// ---- Events sort / search ----

let eventsSort = _ss('gdak_eventsSort', { type: 'date', dir: 'asc' });
let eventsSearch = '';

export function getEventsSort()   { return eventsSort; }
export function setEventsSort(s)  { eventsSort = s; _ssSave('gdak_eventsSort', s); }
export function getEventsSearch() { return eventsSearch; }
export function setEventsSearch(q){ eventsSearch = q; }

// ---- Row color cycling ----

let _nextColorIdx = _ss('gdak_nextColorIdx', 0);

export function nextColor() {
  const idx = _nextColorIdx;
  _nextColorIdx = (_nextColorIdx + 1) % 7;
  _ssSave('gdak_nextColorIdx', _nextColorIdx);
  return idx;
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

export function setTagColorIndex(tagName, idx) {
  tagColorMap[tagName] = idx;
  saveTagColors(tagColorMap);
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
