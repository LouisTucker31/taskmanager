const KEYS = {
  tasks:     'gdak_tasks',
  expanded:  'gdak_expanded',
  tagColors: 'gdak_tag_colors',
  theme:     'gdak_theme',
  page:      'gdak_page',
  events:    'gdak_events',
};

export function loadTasks() {
  try {
    const raw = localStorage.getItem(KEYS.tasks);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveTasks(tasks) {
  localStorage.setItem(KEYS.tasks, JSON.stringify(tasks));
}

export function loadExpanded() {
  try {
    const raw = localStorage.getItem(KEYS.expanded);
    return raw ? JSON.parse(raw) : { todo: true };
  } catch { return { todo: true }; }
}

export function saveExpanded(expanded) {
  localStorage.setItem(KEYS.expanded, JSON.stringify(expanded));
}

export function loadTagColors() {
  try {
    const raw = localStorage.getItem(KEYS.tagColors);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveTagColors(map) {
  localStorage.setItem(KEYS.tagColors, JSON.stringify(map));
}

export function loadTheme() {
  return localStorage.getItem(KEYS.theme);
}

export function saveTheme(value) {
  localStorage.setItem(KEYS.theme, value);
}

export function loadPage() {
  return localStorage.getItem(KEYS.page) || 'tasks';
}

export function savePage(page) {
  localStorage.setItem(KEYS.page, page);
}

export function loadEvents() {
  try {
    const raw = localStorage.getItem(KEYS.events);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map(ev => ({
      id:        ev.id        || '',
      title:     ev.title     || ev.name || '',
      date:      ev.date      || null,
      endDate:   ev.endDate   || null,
      allDay:    ev.allDay    !== undefined ? ev.allDay : true,
      startTime: ev.startTime || ev.time  || null,
      endTime:   ev.endTime   || null,
      tags:      Array.isArray(ev.tags)   ? ev.tags   : [],
      guests:    Array.isArray(ev.guests) ? ev.guests : [],
      notes:     ev.notes     || null,
      createdAt: ev.createdAt || 0,
    }));
  } catch { return []; }
}

export function saveEvents(events) {
  localStorage.setItem(KEYS.events, JSON.stringify(events));
}
