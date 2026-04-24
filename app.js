/* =============================================
   GDAK Task Manager — app.js
   ============================================= */

// ---- DATA MODEL ----

const STATUSES = [
  { key: 'todo',       label: 'To Do',           primary: true },
  { key: 'planned',    label: 'Planned',          primary: false },
  { key: 'inprogress', label: 'In Progress',      primary: false },
  { key: 'updatereq',  label: 'Update Required',  primary: false },
  { key: 'onhold',     label: 'On Hold',          primary: false },
  { key: 'complete',   label: 'Complete',         primary: false },
  { key: 'canceled',   label: 'Canceled',         primary: false },
];

const PRIORITY_META = {
  none:   { label: 'No Priority', color: '#c4c4d0' },
  urgent: { label: 'Urgent',      color: '#ef4444' },
  high:   { label: 'High',        color: '#f59e0b' },
  normal: { label: 'Normal',      color: '#6366f1' },
  low:    { label: 'Low',         color: '#94a3b8' },
};

// ---- TAG COLOUR SYSTEM ----
const TAG_COLORS = [
  { bg: '#ede9fe', text: '#7c3aed' }, // purple
  { bg: '#fce7f3', text: '#be185d' }, // pink
  { bg: '#dcfce7', text: '#15803d' }, // green
  { bg: '#ffedd5', text: '#c2410c' }, // orange
  { bg: '#e0f2fe', text: '#0369a1' }, // blue
  { bg: '#fef9c3', text: '#a16207' }, // yellow
  { bg: '#f1f5f9', text: '#475569' }, // slate
];
const TAG_COLORS_DARK = [
  { bg: '#4c1d95', text: '#ede9fe' },
  { bg: '#831843', text: '#fce7f3' },
  { bg: '#14532d', text: '#dcfce7' },
  { bg: '#7c2d12', text: '#ffedd5' },
  { bg: '#0c4a6e', text: '#e0f2fe' },
  { bg: '#713f12', text: '#fef9c3' },
  { bg: '#334155', text: '#f1f5f9' },
];

// tagColorMap: { tagName -> colorIndex }
let tagColorMap = {};

function loadTagColors() {
  try {
    const raw = localStorage.getItem('gdak_tag_colors');
    if (raw) tagColorMap = JSON.parse(raw);
  } catch {}
}

function saveTagColors() {
  localStorage.setItem('gdak_tag_colors', JSON.stringify(tagColorMap));
}

function getTagColorIndex(tagName) {
  if (tagColorMap[tagName] !== undefined) return tagColorMap[tagName];
  // Find next unused color index
  const usedIndices = new Set(Object.values(tagColorMap));
  for (let i = 0; i < TAG_COLORS.length; i++) {
    if (!usedIndices.has(i)) {
      tagColorMap[tagName] = i;
      saveTagColors();
      return i;
    }
  }
  // All colors in use — wrap around with least-used
  tagColorMap[tagName] = Object.keys(tagColorMap).length % TAG_COLORS.length;
  saveTagColors();
  return tagColorMap[tagName];
}

function pruneTagColors() {
  const allTags = new Set(tasks.flatMap(t => t.tags));
  let changed = false;
  Object.keys(tagColorMap).forEach(tag => {
    if (!allTags.has(tag)) { delete tagColorMap[tag]; changed = true; }
  });
  if (changed) saveTagColors();
}

function tagPillStyle(tagName) {
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  const idx = getTagColorIndex(tagName);
  const palette = isDark ? TAG_COLORS_DARK : TAG_COLORS;
  const c = palette[idx % palette.length];
  return `background:${c.bg};color:${c.text};`;
}

let tasks = [];
let activeSort = { type: 'created', dir: 'asc' };
let expandedSections = { todo: true };

// ---- STORAGE ----

function saveTasks() {
  localStorage.setItem('gdak_tasks', JSON.stringify(tasks));
}

function loadTasks() {
  try {
    const raw = localStorage.getItem('gdak_tasks');
    tasks = raw ? JSON.parse(raw) : [];
  } catch { tasks = []; }
}

function saveExpanded() {
  localStorage.setItem('gdak_expanded', JSON.stringify(expandedSections));
}

function loadExpanded() {
  try {
    const raw = localStorage.getItem('gdak_expanded');
    if (raw) expandedSections = JSON.parse(raw);
  } catch {}
}

// ---- HELPERS ----

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function parseTags(str) {
  const matches = str.match(/#[a-zA-Z0-9_-]+/g);
  return matches ? matches.map(t => t.slice(1).toLowerCase()) : [];
}

function stripTags(str) {
  return str.replace(/#[a-zA-Z0-9_-]+/g, '').trim();
}

function formatDate(dateStr) {
  if (!dateStr) return { text: '—', cls: '' };
  const [y, m, d] = dateStr.split('-').map(Number);
  const today = new Date();
  const dt = new Date(y, m - 1, d);
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = (dt - todayMid) / 86400000;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (diff < 0)  return { text: `${d} ${months[m-1]}`, cls: 'overdue' };
  if (diff === 0) return { text: 'Today', cls: 'today' };
  if (diff === 1) return { text: 'Tomorrow', cls: '' };
  return { text: `${d} ${months[m-1]}`, cls: '' };
}

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3, none: 4 };

function getFilteredTasks(statusKey) {
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

// ---- UNDO TOAST ----

let undoTimeout = null;

function showUndoToast(message, undoFn) {
  const existing = document.getElementById('undoToast');
  if (existing) existing.remove();
  if (undoTimeout) clearTimeout(undoTimeout);

  const toast = document.createElement('div');
  toast.id = 'undoToast';
  toast.className = 'undo-toast';
  toast.innerHTML = `<span>${message}</span><button class="undo-btn">Undo</button>`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('visible'));

  toast.querySelector('.undo-btn').addEventListener('click', () => {
    undoFn();
    dismissToast(toast);
  });

  undoTimeout = setTimeout(() => dismissToast(toast), 4000);
}

function dismissToast(toast) {
  if (!toast) return;
  toast.classList.remove('visible');
  setTimeout(() => toast.remove(), 300);
}

// ---- RENDER ----

function render() {
  const container = document.getElementById('listsContainer');
  container.innerHTML = '';



  STATUSES.forEach(status => {
    const filtered = getFilteredTasks(status.key);
    const allForStatus = tasks.filter(t => t.status === status.key);

    if (!status.primary && allForStatus.length === 0) return;

    const isOpen = !!expandedSections[status.key];

    const section = document.createElement('div');
    section.className = 'section';
    section.dataset.status = status.key;

    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `
      <div class="section-toggle ${isOpen ? 'open' : ''}">
        <svg viewBox="0 0 8 12" fill="none"><path d="M2 2l4 4-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="section-name-badge">
        <span class="status-badge badge-${status.key}">
          <span class="badge-dot"></span>
          ${status.label}
        </span>
      </div>
      <span class="section-count">${allForStatus.length}</span>
    `;
    header.querySelector('.section-toggle').addEventListener('click', () => toggleSection(status.key));
    section.appendChild(header);

    if (isOpen) {
      const body = document.createElement('div');
      body.className = 'section-body';

      const tableHead = document.createElement('div');
      tableHead.className = 'task-table-header';
      tableHead.innerHTML = '<span>Name</span><span>Tag</span><span>Priority</span><span>Due Date</span><span></span>';
      body.appendChild(tableHead);

      const searched = searchQuery
        ? filtered.filter(t => {
            if (t.name.toLowerCase().includes(searchQuery)) return true;
            if (t.tags.some(tag => tag.toLowerCase().includes(searchQuery))) return true;
            if (t.priority && PRIORITY_META[t.priority]?.label.toLowerCase().includes(searchQuery)) return true;
            if (t.due) {
              const fmt = formatDate(t.due);
              if (fmt.text.toLowerCase().includes(searchQuery)) return true;
              // Also search full date string e.g. "2026-04" or "april"
              const months = ['january','february','march','april','may','june',
                              'july','august','september','october','november','december'];
              const [y, m, d] = t.due.split('-').map(Number);
              if (months[m-1].includes(searchQuery)) return true;
              if (String(y).includes(searchQuery)) return true;
              if (t.due.includes(searchQuery)) return true;
            }
            return false;
          })
        : filtered;

      if (searched.length === 0 && allForStatus.length > 0) {
        const hint = document.createElement('div');
        hint.className = 'empty-section-hint';
        hint.textContent = searchQuery ? 'No tasks match your search.' : 'No tasks match the current sort.';
        body.appendChild(hint);
      } else {
        searched.forEach(task => body.appendChild(buildTaskRow(task)));
      }

      if (true) {
        const addRow = document.createElement('div');
        addRow.className = 'inline-add-row';



        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-add-input';
        input.placeholder = allForStatus.length === 0 ? 'Type a task and press Enter…' : 'Add another task…';
        input.autocomplete = 'off';
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') confirmInlineAdd(input);
          if (e.key === 'Escape') input.blur();
        });
        input.addEventListener('blur', () => confirmInlineAdd(input));
        addRow.appendChild(input);
        body.appendChild(addRow);
      }

      section.appendChild(body);
    }

    container.appendChild(section);
  });
}

// ---- FLAG SVG ----

const FLAG_SVG = `<svg class="flag-svg FLAG_CLASS" viewBox="0 0 12 14" fill="none" stroke="none"><line x1="2.5" y1="1" x2="2.5" y2="13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2.5 1.5 L10.5 1.5 L8.5 5 L10.5 8.5 L2.5 8.5 Z" fill="currentColor"/></svg>`;

// ---- BUILD TASK ROW ----

function buildTaskRow(task) {
  const isDone = task.status === 'complete' || task.status === 'canceled';
  const row = document.createElement('div');
  row.className = 'task-row' + (isDone ? ' row-muted' : '');
  row.dataset.id = task.id;

  // Name cell
  const nameCell = document.createElement('div');
  nameCell.className = 'task-name-cell';

  // Checkbox (selection mode only)
  const checkbox = document.createElement('div');
  checkbox.className = 'task-checkbox' + (selectedIds.has(task.id) ? ' checked' : '');
  checkbox.style.display = selectionMode ? 'flex' : 'none';
  checkbox.innerHTML = selectedIds.has(task.id)
    ? `<svg viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : '';
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSelection(task.id);
    checkbox.classList.toggle('checked');
    checkbox.innerHTML = selectedIds.has(task.id)
      ? `<svg viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : '';
    updateBulkBar();
  });

  const ringWrap = document.createElement('div');
  ringWrap.className = 'task-status-icon';
  ringWrap.style.display = selectionMode ? 'none' : '';
  const ring = document.createElement('div');
  ring.className = `status-ring ${task.status}`;
  ringWrap.appendChild(ring);
  ringWrap.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllInlineDropdowns();
    openStatusDropdown(ringWrap, task.id);
  });

  const nameText = document.createElement('span');
  nameText.className = 'task-name-text' + (isDone ? ' strikethrough' : '');
  nameText.textContent = task.name;
  nameText.addEventListener('click', () => startNameEdit(nameText, task));

  nameCell.appendChild(checkbox);
  nameCell.appendChild(ringWrap);
  nameCell.appendChild(nameText);

  // tags shown in tag column only — not inline after name

  // Tag cell
  const tagCell = document.createElement('div');
  tagCell.className = 'tag-cell';
  if (task.tags.length > 0) {
    task.tags.forEach((tag, i) => {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.style.cssText = tagPillStyle(tag);
      pill.textContent = tag;
      if (i === 0) pill.title = task.tags.join(', ');
      tagCell.appendChild(pill);
    });
  } else {
    const empty = document.createElement('span');
    empty.className = 'tag-cell-empty';
    empty.textContent = '—';
    tagCell.appendChild(empty);
  }
  tagCell.addEventListener('click', () => openTagEdit(tagCell, task));

  // Priority cell
  const priCell = document.createElement('div');
  priCell.className = 'priority-cell';
  const meta = PRIORITY_META[task.priority] || PRIORITY_META.none;
  if (task.priority && task.priority !== 'none') {
    priCell.innerHTML = FLAG_SVG.replace('FLAG_CLASS', task.priority) +
      `<span class="priority-text">${meta.label}</span>`;
  } else {
    priCell.innerHTML = `<span class="priority-text" style="color:var(--text-xmuted)">—</span>`;
  }
  priCell.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllInlineDropdowns();
    openPriorityDropdown(priCell, task.id);
  });

  // Due cell
  const dueCell = document.createElement('div');
  dueCell.className = 'due-cell' + (task.due ? (' ' + (formatDate(task.due).cls || '')) : '');

  const dueDateInput = document.createElement('input');
  dueDateInput.type = 'date';
  dueDateInput.className = 'due-inline-input';
  dueDateInput.value = task.due || '';
  dueDateInput.addEventListener('change', () => {
    task.due = dueDateInput.value || null;
    saveTasks();
    render();
  });

  const dueText = document.createElement('span');
  dueText.className = 'due-text';
  if (task.due) {
    const fmt = formatDate(task.due);
    dueText.textContent = fmt.text;
  } else {
    dueText.textContent = '—';
    dueText.style.color = 'var(--text-xmuted)';
  }
  dueCell.appendChild(dueText);

  if (task.recurrence) {
    const recurIcon = document.createElement('span');
    recurIcon.className = 'recur-icon';
    recurIcon.title = { daily: 'Repeats daily', weekly: 'Repeats weekly', monthly: 'Repeats monthly' }[task.recurrence] || '';
    recurIcon.innerHTML = `<img src="assets/icon.png" style="width:13px;height:13px;object-fit:contain;vertical-align:middle;margin-left:3px;filter:invert(var(--icon-invert, 0));">`;
    dueCell.appendChild(recurIcon);
  }

  if (task.due) {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'due-clear-btn';
    clearBtn.title = 'Clear date';
    clearBtn.innerHTML = `<svg viewBox="0 0 10 10" fill="none"><line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      task.due = null;
      saveTasks();
      render();
    });
    dueCell.appendChild(clearBtn);
  }

  dueCell.addEventListener('click', (e) => {
    if (e.target.closest('.due-clear-btn')) return;
    dueDateInput.showPicker?.() || dueDateInput.click();
  });
  dueCell.appendChild(dueDateInput);
  dueDateInput.style.position = 'absolute';
  dueDateInput.style.opacity = '0';
  dueDateInput.style.width = '0';
  dueDateInput.style.height = '0';
  dueDateInput.style.pointerEvents = 'none';

  // Three-dot
  const dotBtn = document.createElement('button');
  dotBtn.className = 'three-dot-btn';
  dotBtn.setAttribute('aria-label', 'Task options');
  dotBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="13" r="1.2"/></svg>`;
  dotBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllInlineDropdowns();
    openDotMenu(row, task.id);
  });

  row.appendChild(nameCell);
  row.appendChild(tagCell);
  row.appendChild(priCell);
  row.appendChild(dueCell);
  row.appendChild(dotBtn);

  return row;
}

// ---- INLINE DROPDOWNS ----

function closeAllInlineDropdowns() {
  document.querySelectorAll('.inline-dropdown, .dot-menu').forEach(el => el.remove());
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.three-dot-btn') && !e.target.closest('.dot-menu')) {
    closeAllInlineDropdowns();
  }
});

function positionDropdown(dd, anchor) {
  document.body.appendChild(dd);
  const rect = anchor.getBoundingClientRect();
  const ddHeight = dd.offsetHeight;
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const top = (spaceBelow >= ddHeight + 8 || spaceBelow >= spaceAbove)
    ? rect.bottom + 4 + window.scrollY
    : rect.top - ddHeight - 4 + window.scrollY;
  dd.style.position = 'absolute';
  dd.style.top = top + 'px';
  dd.style.left = rect.left + window.scrollX + 'px';
  dd.style.zIndex = '9999';
}

function positionDropdownRight(dd, anchor) {
  document.body.appendChild(dd);
  const rect = anchor.getBoundingClientRect();
  const ddWidth = dd.offsetWidth || 160;
  const ddHeight = dd.offsetHeight;
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const top = (spaceBelow >= ddHeight + 8 || spaceBelow >= spaceAbove)
    ? rect.bottom + 4 + window.scrollY
    : rect.top - ddHeight - 4 + window.scrollY;
  const left = rect.right - ddWidth + window.scrollX;
  dd.style.position = 'absolute';
  dd.style.top = top + 'px';
  dd.style.left = Math.max(8, left) + 'px';
  dd.style.zIndex = '9999';
}

function openStatusDropdown(anchor, taskId) {
  const dd = document.createElement('div');
  dd.className = 'inline-dropdown';
  STATUSES.forEach(s => {
    const item = document.createElement('div');
    item.className = 'inline-dropdown-item';
    const dot = document.createElement('span');
    dot.className = `status-dot ${s.key}`;
    item.appendChild(dot);
    item.appendChild(document.createTextNode(s.label));
    const task = tasks.find(t => t.id === taskId);
    if (task && task.status === s.key) item.classList.add('active');
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = tasks.find(t => t.id === taskId);
      if (t) {
        if (s.key === 'complete' && t.recurrence && t.due) {
          advanceRecurringTask(t);
        } else {
          t.status = s.key;
        }
        expandedSections[s.key] = true;
        saveTasks();
        saveExpanded();
        render();
      }
      closeAllInlineDropdowns();
    });
    dd.appendChild(item);
  });
  positionDropdown(dd, anchor);
}

function openPriorityDropdown(anchor, taskId) {
  const dd = document.createElement('div');
  dd.className = 'inline-dropdown';
  Object.entries(PRIORITY_META).forEach(([key, meta]) => {
    const item = document.createElement('div');
    item.className = 'inline-dropdown-item';
    if (key !== 'none') {
      item.innerHTML = FLAG_SVG.replace('FLAG_CLASS', key);
    } else {
      item.innerHTML = `<span style="width:14px;display:inline-block"></span>`;
    }
    item.appendChild(document.createTextNode(meta.label));
    const task = tasks.find(t => t.id === taskId);
    if (task && task.priority === key) item.classList.add('active');
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = tasks.find(t => t.id === taskId);
      if (t) { t.priority = key; saveTasks(); render(); }
      closeAllInlineDropdowns();
    });
    dd.appendChild(item);
  });
  positionDropdown(dd, anchor);
}

function openDotMenu(row, taskId) {
  const menu = document.createElement('div');
  menu.className = 'dot-menu';
  menu.style.minWidth = '150px';

  const task = tasks.find(t => t.id === taskId);
  if (task && task.due) {
    const viewCal = document.createElement('div');
    viewCal.className = 'dot-menu-item';
    viewCal.innerHTML = `<svg viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="10" rx="1.2" stroke="currentColor" stroke-width="1.2"/><line x1="4" y1="1" x2="4" y2="4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="10" y1="1" x2="10" y2="4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="1.5" y1="6" x2="12.5" y2="6" stroke="currentColor" stroke-width="1.2"/></svg> View in Calendar`;
    viewCal.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllInlineDropdowns();
      const [y, m] = task.due.split('-').map(Number);
      calYear  = y;
      calMonth = m - 1;
      switchPage('calendar');
    });
    menu.appendChild(viewCal);
  }

  const recur = document.createElement('div');
  recur.className = 'dot-menu-item';
  const recurTask = tasks.find(t => t.id === taskId);
  const recurLabel = recurTask && recurTask.recurrence
    ? { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }[recurTask.recurrence]
    : null;
  recur.innerHTML = `<img src="assets/icon.png" style="width:13px;height:13px;object-fit:contain;display:inline-block;vertical-align:middle;margin-right:6px;margin-top:1px;filter:invert(var(--icon-invert, 0));"> Recurring${recurLabel ? ` <span style="color:var(--text-muted);font-size:11px">(${recurLabel})</span>` : ''}`;
  recur.addEventListener('click', (e) => {
    e.stopPropagation();
    openRecurrenceSubmenu(recur, taskId);
  });
  menu.appendChild(recur);

  const select = document.createElement('div');
  select.className = 'dot-menu-item';
  select.innerHTML = `<svg viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M4 7l2.5 2.5L10 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg> Select`;
  select.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllInlineDropdowns();
    enterSelectionMode(taskId);
  });
  menu.appendChild(select);

  const menuDivider = document.createElement('div');
  menuDivider.style.cssText = 'height:1px;background:var(--border-light);margin:4px 0;';
  menu.appendChild(menuDivider);

  const duplicate = document.createElement('div');
  duplicate.className = 'dot-menu-item';
  duplicate.innerHTML = `<svg viewBox="0 0 14 14" fill="none"><rect x="4" y="4" width="8" height="8" rx="1.2" stroke="currentColor" stroke-width="1.2"/><path d="M2 10V2h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg> Duplicate`;
  duplicate.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = tasks.find(t => t.id === taskId);
    if (t) {
      const copy = { ...t, id: uid(), name: t.name + ' (copy)', createdAt: Date.now(), status: 'todo' };
      tasks.push(copy);
      saveTasks();
      expandedSections['todo'] = true;
      saveExpanded();
      render();
      setTimeout(() => {
        const newRow = document.querySelector(`.task-row[data-id="${copy.id}"]`);
        if (newRow) {
          newRow.classList.add('row-highlight');
          newRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          setTimeout(() => newRow.classList.remove('row-highlight'), 1500);
        }
      }, 50);
    }
    closeAllInlineDropdowns();
  });

  const del = document.createElement('div');
  del.className = 'dot-menu-item danger';
  del.innerHTML = `<svg viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5 3.5V2h4v1.5M5.5 6v4.5M8.5 6v4.5M3 3.5l.5 8h7l.5-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg> Delete`;
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = tasks.find(t => t.id === taskId);
    if (!t) return;
    const snapshot = [...tasks];
    tasks = tasks.filter(t => t.id !== taskId);
    saveTasks();
    render();
    closeAllInlineDropdowns();
    showUndoToast(`"${t.name}" deleted`, () => {
      tasks = snapshot;
      saveTasks();
      render();
    });
  });

  menu.appendChild(duplicate);
  menu.appendChild(del);

  const dotBtn = row.querySelector('.three-dot-btn');
  positionDropdownRight(menu, dotBtn || row);
}

// ---- RECURRENCE ----

function advanceRecurringTask(task) {
  const [y, m, d] = task.due.split('-').map(Number);
  let next = new Date(y, m - 1, d);
  if (task.recurrence === 'daily')   next.setDate(next.getDate() + 1);
  if (task.recurrence === 'weekly')  next.setDate(next.getDate() + 7);
  if (task.recurrence === 'monthly') next.setMonth(next.getMonth() + 1);
  task.due = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;
  task.status = 'todo';
  expandedSections['todo'] = true;
  saveExpanded();
}

function openRecurrenceSubmenu(anchor, taskId) {
  const existing = document.getElementById('recurrenceSubmenu');
  if (existing) { existing.remove(); return; }

  const task = tasks.find(t => t.id === taskId);
  const dd = document.createElement('div');
  dd.id = 'recurrenceSubmenu';
  dd.className = 'inline-dropdown';

  const options = [
    { key: 'daily',   label: 'Daily' },
    { key: 'weekly',  label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: null,      label: 'No recurrence', noStyle: true },
  ];

  options.forEach(opt => {
    const item = document.createElement('div');
    item.className = 'inline-dropdown-item';
    const isActive = (task && task.recurrence === opt.key);
    if (isActive) item.classList.add('active');
    if (opt.noStyle) {
      item.style.fontWeight = 'normal';
      item.style.textAlign = 'left';
      item.innerHTML = `${opt.label}`;
    } else {
      item.innerHTML = `${opt.label}`;
    }
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = tasks.find(t => t.id === taskId);
      if (t) { t.recurrence = opt.key; saveTasks(); render(); }
      closeAllInlineDropdowns();
    });
    dd.appendChild(item);
  });

  positionDropdown(dd, anchor);
}

// ---- INLINE TAG EDIT ----

function openTagEdit(cell, task) {
  cell.innerHTML = '';
  cell.style.position = 'relative';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'task-name-edit';
  input.style.fontSize = '12px';
  input.style.fontFamily = "'DM Mono', monospace";
  input.value = task.tags.join(' ');
  input.placeholder = 'tag';
  cell.appendChild(input);

  const suggestBox = document.createElement('div');
  suggestBox.className = 'tag-suggest-box';
  cell.appendChild(suggestBox);

  let suppressBlur = false;

  function getAllTags() {
    const map = {};
    tasks.forEach(t => {
      if (t.id === task.id) return;
      t.tags.forEach(tag => { map[tag] = true; });
    });
    return Object.keys(map).sort();
  }

  function getLastWord() {
    const val = input.value;
    const parts = val.trimEnd().split(/\s+/);
    return parts[parts.length - 1] || '';
  }

  function getTypedTags() {
    return input.value.trim() ? input.value.trim().split(/\s+/).map(t => t.replace(/^#+/, '').toLowerCase()).filter(Boolean) : [];
  }

  function renderSuggestions() {
    const word = getLastWord().replace(/^#+/, '').toLowerCase();
    const alreadyTyped = getTypedTags();
    suggestBox.innerHTML = '';
    if (!word) { suggestBox.style.display = 'none'; return; }

    const matches = getAllTags().filter(t => t.startsWith(word) && !alreadyTyped.includes(t));
    if (matches.length === 0) { suggestBox.style.display = 'none'; return; }

    matches.slice(0, 6).forEach(tag => {
      const item = document.createElement('div');
      item.className = 'tag-suggest-item';
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.style.cssText = tagPillStyle(tag);
      pill.textContent = tag;
      item.appendChild(pill);
      item.addEventListener('mousedown', () => { suppressBlur = true; });
      item.addEventListener('click', () => {
        const parts = input.value.trimEnd().split(/\s+/);
        parts[parts.length - 1] = tag;
        input.value = parts.join(' ') + ' ';
        suggestBox.style.display = 'none';
        suppressBlur = false;
        input.focus();
        renderSuggestions();
      });
      suggestBox.appendChild(item);
    });
    suggestBox.style.display = 'block';
  }

  input.addEventListener('input', renderSuggestions);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  function commit() {
    if (suppressBlur) return;
    suggestBox.style.display = 'none';
    const raw = input.value.trim();
    task.tags = raw ? raw.split(/\s+/).map(t => t.replace(/^#+/, '').toLowerCase()).filter(Boolean) : [];
    pruneTagColors();
    saveTasks();
    render();
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') render();
    if (e.key === 'Tab' && suggestBox.style.display !== 'none') {
      e.preventDefault();
      const first = suggestBox.querySelector('.tag-suggest-item');
      if (first) first.click();
    }
  });
}

// ---- INLINE NAME EDIT ----

function startNameEdit(nameSpan, task) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'task-name-edit';
  input.value = task.name;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  function commit() {
    const raw = input.value.trim();
    if (!raw) {
      const snapshot = [...tasks];
      tasks = tasks.filter(t => t.id !== task.id);
      saveTasks();
      render();
      showUndoToast(`"${task.name}" deleted`, () => {
        tasks = snapshot;
        saveTasks();
        render();
      });
    } else {
      task.name = raw;
      saveTasks();
      render();
    }
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') render();
  });
}

// ---- SECTIONS ----

function toggleSection(statusKey) {
  expandedSections[statusKey] = !expandedSections[statusKey];
  saveExpanded();
  render();
}

// ---- ADD TASK ----

function confirmInlineAdd(input) {
  const raw = input.value.trim();
  if (!raw) return;

  const inlineTags = parseTags(raw);
  const name = stripTags(raw) || raw;

  const task = {
    id: uid(),
    name,
    tags: inlineTags,
    priority: 'none',
    due: null,
    status: 'todo',
    createdAt: Date.now(),
  };

  tasks.push(task);
  saveTasks();

  input.value = '';
  render();
  const newInput = document.querySelector('.inline-add-input');
  if (newInput) newInput.focus();
}
// ---- BULK SELECTION ----

let selectionMode = false;
let selectedIds = new Set();

function enterSelectionMode(taskId) {
  selectionMode = true;
  selectedIds = new Set([taskId]);
  render();
  updateBulkBar();
}
document.getElementById('bulkCancelBtn').addEventListener('click', exitSelectionMode);

document.getElementById('bulkDeleteBtn').addEventListener('click', () => {
  const snapshot = [...tasks];
  const count = selectedIds.size;
  tasks = tasks.filter(t => !selectedIds.has(t.id));
  saveTasks();
  exitSelectionMode();
  showUndoToast(`${count} task${count > 1 ? 's' : ''} deleted`, () => {
    tasks = snapshot;
    saveTasks();
    render();
  });
});

document.getElementById('bulkStatusBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const dd = document.getElementById('bulkStatusDd');
  if (dd.children.length === 0) {
    STATUSES.forEach(s => {
      const item = document.createElement('div');
      item.className = 'inline-dropdown-item';
      item.innerHTML = `<span class="status-dot ${s.key}"></span>${s.label}`;
      item.addEventListener('click', () => {
        selectedIds.forEach(id => {
          const t = tasks.find(t => t.id === id);
          if (t) { t.status = s.key; expandedSections[s.key] = true; }
        });
        saveTasks();
        saveExpanded();
        exitSelectionMode();
      });
      dd.appendChild(item);
    });
  }
  dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('bulkPriorityBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const existing = document.getElementById('bulkPriorityDd');
  if (existing) { existing.remove(); return; }
  const dd = document.createElement('div');
  dd.id = 'bulkPriorityDd';
  dd.className = 'inline-dropdown';
  Object.entries(PRIORITY_META).forEach(([key, meta]) => {
    const item = document.createElement('div');
    item.className = 'inline-dropdown-item';
    item.innerHTML = key !== 'none'
      ? FLAG_SVG.replace('FLAG_CLASS', key) + meta.label
      : `<span style="width:14px;display:inline-block"></span>${meta.label}`;
    item.addEventListener('click', () => {
      selectedIds.forEach(id => {
        const t = tasks.find(t => t.id === id);
        if (t) t.priority = key;
      });
      saveTasks();
      exitSelectionMode();
    });
    dd.appendChild(item);
  });
  const btn = document.getElementById('bulkPriorityBtn');
  positionDropdown(dd, btn);
});
function exitSelectionMode() {
  selectionMode = false;
  selectedIds.clear();
  render();
  updateBulkBar();
}

function toggleSelection(taskId) {
  if (selectedIds.has(taskId)) {
    selectedIds.delete(taskId);
  } else {
    selectedIds.add(taskId);
  }
  updateBulkBar();
}

function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  if (!selectionMode || selectedIds.size === 0) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  document.getElementById('bulkCount').textContent = `${selectedIds.size} selected`;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && selectionMode) exitSelectionMode();
});
// ---- SEARCH ----

let searchQuery = '';

document.getElementById('searchInput').addEventListener('input', (e) => {
  searchQuery = e.target.value.trim().toLowerCase();
  document.getElementById('searchClear').style.display = searchQuery ? 'block' : 'none';
  render();
});

document.getElementById('searchClear').addEventListener('click', () => {
  searchQuery = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').style.display = 'none';
  render();
});
// ---- SORT ----

document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.sort;

    if (type === 'none') {
      activeSort = { type: 'created', dir: 'asc' };
      document.querySelectorAll('.sort-btn').forEach(b => {
        b.classList.remove('active');
        const arrow = b.querySelector('.sort-arrow');
        if (arrow) { arrow.style.transform = 'rotate(0deg)'; arrow.style.opacity = '0.3'; }
        b.dataset.dir = 'asc';
      });
      btn.classList.add('active');
      render();
      return;
    }

    if (activeSort.type === type) {
      activeSort.dir = activeSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      activeSort = { type, dir: 'asc' };
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }

    // Update all arrows — never touch innerHTML, only transform and opacity
    document.querySelectorAll('.sort-btn[data-sort]:not([data-sort="none"])').forEach(b => {
      const a = b.querySelector('.sort-arrow');
      if (!a) return;
      if (b === btn) {
        a.style.transform = activeSort.dir === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)';
        a.style.opacity = '1';
      } else {
        a.style.transform = 'rotate(0deg)';
        a.style.opacity = '0.6';
      }
    });

    render();
  });
});
// ---- DARK MODE ----

function applyTheme(dark) {
  document.body.setAttribute('data-theme', dark ? 'dark' : 'light');
  localStorage.setItem('gdak_theme', dark ? 'dark' : 'light');
  const label = document.getElementById('darkModeLabel');
  if (label) label.textContent = dark ? 'Light Mode' : 'Dark Mode';
}

const savedTheme = localStorage.getItem('gdak_theme');
applyTheme(savedTheme === 'dark');

document.getElementById('darkModeToggle').addEventListener('click', () => {
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  applyTheme(!isDark);
});
// ---- INIT ----

loadTasks();
loadExpanded();
loadTagColors();
render();
