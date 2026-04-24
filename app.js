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
  urgent: { label: 'Urgent', color: '#ef4444' },
  high:   { label: 'High',   color: '#f59e0b' },
  normal: { label: 'Normal', color: '#6366f1' },
  low:    { label: 'Low',    color: '#94a3b8' },
};

let tasks = [];
let activeSort = { type: 'created', dir: 'asc' };
let expandedSections = { todo: true };
let contextTarget = null; // task id being right-clicked

// ---- STORAGE ----

function saveTasks() {
  localStorage.setItem('gdak_tasks', JSON.stringify(tasks));
}

function loadTasks() {
  try {
    const raw = localStorage.getItem('gdak_tasks');
    tasks = raw ? JSON.parse(raw) : [];
  } catch {
    tasks = [];
  }
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
  if (!dateStr) return '';
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

function getAllTags() {
  const set = new Set();
  tasks.forEach(t => t.tags.forEach(tag => set.add(tag)));
  return [...set].sort();
}

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

function getFilteredTasks(statusKey) {
  let list = tasks.filter(t => t.status === statusKey);
  if (activeSort.type === 'created') {
    return [...list].sort((a, b) => a.createdAt - b.createdAt);
  }
  if (activeSort.type === 'none') return list;

  list = [...list].sort((a, b) => {
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
  return list;
}

// ---- RENDER ----

function render() {
  const container = document.getElementById('listsContainer');
  container.innerHTML = '';

  STATUSES.forEach(status => {
    const filtered = getFilteredTasks(status.key);
    const allForStatus = tasks.filter(t => t.status === status.key);

    // For non-primary sections: only show if there are tasks (total, not filtered)
    if (!status.primary && allForStatus.length === 0) return;

    const isOpen = !!expandedSections[status.key];

    const section = document.createElement('div');
    section.className = 'section';
    section.dataset.status = status.key;

    // Header
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
    header.addEventListener('click', () => toggleSection(status.key));
    section.appendChild(header);

    // Body
    if (isOpen) {
      const body = document.createElement('div');
      body.className = 'section-body';

      // Table header
      const tableHead = document.createElement('div');
      tableHead.className = 'task-table-header';
      tableHead.innerHTML = '<span>Name</span><span>Priority</span><span>Due Date</span><span></span>';
      // header padding handled by css
      body.appendChild(tableHead);

      if (filtered.length === 0 && allForStatus.length > 0) {
        const hint = document.createElement('div');
        hint.className = 'empty-section-hint';
        hint.textContent = 'No tasks match the current sort.';
        body.appendChild(hint);
      } else {
        filtered.forEach(task => {
          body.appendChild(buildTaskRow(task));
        });
      }

      // Inline add input — only on the To Do section
      if (status.key === 'todo') {
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
        addRow.appendChild(input);
        body.appendChild(addRow);
      }

      section.appendChild(body);
    }

    container.appendChild(section);
  });
}

const FLAG_SVG = `<svg class="flag-svg FLAG_CLASS" viewBox="0 0 12 14" fill="none" stroke="none"><line x1="2.5" y1="1" x2="2.5" y2="13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2.5 1.5 L10.5 1.5 L8.5 5 L10.5 8.5 L2.5 8.5 Z" fill="currentColor"/></svg>`;

function buildTaskRow(task) {
  const row = document.createElement('div');
  row.className = 'task-row';
  row.dataset.id = task.id;

  // --- Name cell ---
  const nameCell = document.createElement('div');
  nameCell.className = 'task-name-cell';

  // Status ring (clickable)
  const ringWrap = document.createElement('div');
  ringWrap.className = 'task-status-icon';
  const ring = document.createElement('div');
  ring.className = `status-ring ${task.status}`;
  ringWrap.appendChild(ring);
  ringWrap.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllInlineDropdowns();
    openStatusDropdown(ringWrap, task.id);
  });

  // Name — click to edit
  const nameText = document.createElement('span');
  nameText.className = 'task-name-text' + (task.status === 'complete' || task.status === 'canceled' ? ' strikethrough' : '');
  nameText.textContent = task.name;
  nameText.addEventListener('click', () => startNameEdit(nameText, task));

  nameCell.appendChild(ringWrap);
  nameCell.appendChild(nameText);

  if (task.tags.length > 0) {
    const tagsEl = document.createElement('div');
    tagsEl.className = 'task-tags';
    task.tags.forEach(tag => {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.textContent = '#' + tag;
      tagsEl.appendChild(pill);
    });
    nameCell.appendChild(tagsEl);
  }

  // --- Priority cell (clickable) ---
  const priCell = document.createElement('div');
  priCell.className = 'priority-cell';
  priCell.style.display = 'flex';
  priCell.style.alignItems = 'center';
  priCell.style.gap = '5px';
  const meta = PRIORITY_META[task.priority] || PRIORITY_META.normal;
  priCell.innerHTML = FLAG_SVG.replace('FLAG_CLASS', task.priority) +
    `<span class="priority-text ${task.priority}">${meta.label}</span>`;
  priCell.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllInlineDropdowns();
    openPriorityDropdown(priCell, task.id);
  });

  // --- Due cell (clickable + inline input) ---
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
  // Show formatted text, reveal native date picker on click
  const dueText = document.createElement('span');
  dueText.style.pointerEvents = 'none';
  dueText.style.fontSize = '12.5px';
  dueText.style.fontFamily = "'DM Mono', monospace";
  if (task.due) {
    const fmt = formatDate(task.due);
    dueText.textContent = fmt.text;
  } else {
    dueText.textContent = 'Set date…';
    dueText.style.color = 'var(--text-xmuted)';
    dueText.style.fontStyle = 'italic';
    dueText.style.fontFamily = "'DM Sans', sans-serif";
    dueText.style.fontSize = '13px';
  }
  dueCell.addEventListener('click', () => dueDateInput.showPicker?.() || dueDateInput.click());
  dueCell.appendChild(dueText);
  dueCell.appendChild(dueDateInput);
  dueDateInput.style.position = 'absolute';
  dueDateInput.style.opacity = '0';
  dueDateInput.style.width = '0';
  dueDateInput.style.height = '0';
  dueDateInput.style.pointerEvents = 'none';

  // --- Three-dot menu ---
  const dotBtn = document.createElement('button');
  dotBtn.className = 'three-dot-btn';
  dotBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="13" r="1.2"/></svg>`;
  dotBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllInlineDropdowns();
    openDotMenu(row, task.id);
  });

  row.appendChild(nameCell);
  row.appendChild(priCell);
  row.appendChild(dueCell);
  row.appendChild(dotBtn);

  // Right-click still works too
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openContextMenu(e, task.id);
  });

  return row;
}

// ---- INLINE DROPDOWNS ----

function closeAllInlineDropdowns() {
  document.querySelectorAll('.inline-dropdown, .dot-menu').forEach(el => el.remove());
}

document.addEventListener('click', closeAllInlineDropdowns);

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

function positionDropdown(dd, anchor) {
  // Append to body so it's never clipped by overflow
  document.body.appendChild(dd);
  const rect = anchor.getBoundingClientRect();
  const ddHeight = dd.offsetHeight;
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  let top;
  if (spaceBelow >= ddHeight + 8 || spaceBelow >= spaceAbove) {
    top = rect.bottom + 4 + window.scrollY;
  } else {
    top = rect.top - ddHeight - 4 + window.scrollY;
  }

  dd.style.position = 'absolute';
  dd.style.top = top + 'px';
  dd.style.left = rect.left + window.scrollX + 'px';
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
      if (t) { t.status = s.key; expandedSections[s.key] = true; saveTasks(); saveExpanded(); render(); }
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
    item.innerHTML = FLAG_SVG.replace('FLAG_CLASS', key);
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
      render();
    }
    closeAllInlineDropdowns();
  });

  const del = document.createElement('div');
  del.className = 'dot-menu-item danger';
  del.innerHTML = `<svg viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5 3.5V2h4v1.5M5.5 6v4.5M8.5 6v4.5M3 3.5l.5 8h7l.5-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg> Delete`;
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    tasks = tasks.filter(t => t.id !== taskId);
    saveTasks();
    render();
    closeAllInlineDropdowns();
  });

  menu.appendChild(duplicate);
  menu.appendChild(del);

  // Position from the three-dot button inside the row
  const dotBtn = row.querySelector('.three-dot-btn');
  positionDropdownRight(menu, dotBtn || row);
}

// ---- INLINE NAME EDIT ----

function startNameEdit(nameSpan, task) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'task-name-edit';
  // Include tags in the editable value
  const tagStr = task.tags.map(t => '#' + t).join(' ');
  input.value = task.name + (tagStr ? ' ' + tagStr : '');
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  function commit() {
    const raw = input.value.trim();
    if (!raw) {
      tasks = tasks.filter(t => t.id !== task.id);
    } else {
      task.tags = parseTags(raw);
      task.name = stripTags(raw) || raw;
    }
    saveTasks();
    render();
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { render(); }
  });
}

// ---- SECTIONS ----

function toggleSection(statusKey) {
  expandedSections[statusKey] = !expandedSections[statusKey];
  saveExpanded();
  render();
}

// ---- ADD TASK ----

let selectedPriority = 'normal';

function confirmInlineAdd(input) {
  const raw = input.value.trim();
  if (!raw) return;

  const inlineTags = parseTags(raw);
  const name = stripTags(raw) || raw;

  const task = {
    id: uid(),
    name,
    tags: inlineTags,
    priority: 'normal',
    due: null,
    status: 'todo',
    createdAt: Date.now(),
  };

  tasks.push(task);
  saveTasks();
  expandedSections['todo'] = true;
  saveExpanded();

  input.value = '';
  render();
  // Re-focus the new inline input after render
  const newInput = document.querySelector('.inline-add-input');
  if (newInput) newInput.focus();
}



// ---- CONTEXT MENU ----

const contextMenu = document.getElementById('contextMenu');

function openContextMenu(e, taskId) {
  contextTarget = taskId;

  const x = Math.min(e.clientX, window.innerWidth - 190);
  const y = Math.min(e.clientY, window.innerHeight - 300);

  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
  contextMenu.style.display = 'block';
  document.getElementById('overlay').style.display = 'block';
}

function closeContextMenu() {
  contextMenu.style.display = 'none';
  document.getElementById('overlay').style.display = 'none';
  contextTarget = null;
}

document.getElementById('overlay').addEventListener('click', closeContextMenu);

contextMenu.querySelectorAll('.context-item[data-status]').forEach(item => {
  item.addEventListener('click', () => {
    if (!contextTarget) return;
    const task = tasks.find(t => t.id === contextTarget);
    if (task) {
      task.status = item.dataset.status;
      // Auto-expand destination section
      expandedSections[task.status] = true;
      saveTasks();
      saveExpanded();
      render();
    }
    closeContextMenu();
  });
});

document.getElementById('contextDelete').addEventListener('click', () => {
  if (!contextTarget) return;
  tasks = tasks.filter(t => t.id !== contextTarget);
  saveTasks();
  render();
  renderFilterPanel();
  closeContextMenu();
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
        if (arrow) arrow.textContent = '↑';
        b.dataset.dir = 'asc';
      });
      btn.classList.add('active');
      render();
      return;
    }

    // If already active, toggle direction
    if (activeSort.type === type) {
      activeSort.dir = activeSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      activeSort = { type, dir: btn.dataset.dir || 'asc' };
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.sort-btn[data-sort="none"]').classList.remove('active');
      btn.classList.add('active');
    }

    // Update arrow
    const arrow = btn.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = activeSort.dir === 'asc' ? '↑' : '↓';

    render();
  });
});

// ---- INIT ----

loadTasks();
loadExpanded();
render();
