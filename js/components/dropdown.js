import { STATUSES, PRIORITY_META, FLAG_SVG, DONE_STATUSES, ROW_COLORS } from '../modules/constants.js';

const ALL_STATUSES = [
  ...STATUSES,
  { key: 'complete', label: 'Complete', shortLabel: 'Complete' },
  { key: 'canceled', label: 'Canceled', shortLabel: 'Canceled' },
];
import { getTasks, persistTasks, getExpanded, persistExpanded, tagPillStyle, setTagColorIndex, getTaskColorIndex, setTaskColor } from '../modules/state.js';
import { uid } from '../modules/utils.js';
import { openRecurringDeleteDialog } from './modal.js';

// ---- Positioning ----

export function positionDropdown(dd, anchor) {
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

export function positionDropdownRight(dd, anchor) {
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

export function closeAllInlineDropdowns() {
  document.querySelectorAll('.inline-dropdown, .dot-menu').forEach(el => el.remove());
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.three-dot-btn') && !e.target.closest('.dot-menu')) {
    closeAllInlineDropdowns();
  }
});

// ---- Status dropdown ----

export function openStatusDropdown(anchor, taskId, onChanged) {
  const dd = document.createElement('div');
  dd.className = 'inline-dropdown';
  const tasks = getTasks();
  ALL_STATUSES.forEach(s => {
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
        if (!DONE_STATUSES.includes(s.key)) {
          getExpanded()[s.key] = true;
          persistExpanded();
        }
        persistTasks();
        onChanged?.();
      }
      closeAllInlineDropdowns();
    });
    dd.appendChild(item);
  });
  positionDropdown(dd, anchor);
}

// ---- Priority dropdown ----

export function openPriorityDropdown(anchor, taskId, onChanged) {
  const dd = document.createElement('div');
  dd.className = 'inline-dropdown';
  const tasks = getTasks();
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
      if (t) { t.priority = key; persistTasks(); onChanged?.(); }
      closeAllInlineDropdowns();
    });
    dd.appendChild(item);
  });
  positionDropdown(dd, anchor);
}

// ---- Recurrence submenu ----

export function openRecurrenceSubmenu(anchor, taskId, onChanged) {
  const existing = document.getElementById('recurrenceSubmenu');
  if (existing) { existing.remove(); return; }

  const tasks = getTasks();
  const task = tasks.find(t => t.id === taskId);
  const dd = document.createElement('div');
  dd.id = 'recurrenceSubmenu';
  dd.className = 'inline-dropdown';

  const options = [
    { key: 'daily',   label: 'Daily' },
    { key: 'weekly',  label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: null,      label: 'No recurrence' },
  ];

  options.forEach(opt => {
    const item = document.createElement('div');
    item.className = 'inline-dropdown-item';
    if (task && task.recurrence === opt.key) item.classList.add('active');
    item.textContent = opt.label;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = tasks.find(t => t.id === taskId);
      if (t) { t.recurrence = opt.key; persistTasks(); onChanged?.(); }
      closeAllInlineDropdowns();
    });
    dd.appendChild(item);
  });

  positionDropdown(dd, anchor);
}

// ---- Dot menu ----

export function openDotMenu(row, taskId, { onChanged, onViewCalendar, onEnterSelect, onDelete, onRename }) {
  const menu = document.createElement('div');
  menu.className = 'dot-menu';
  menu.style.minWidth = '150px';

  const tasks = getTasks();
  const task = tasks.find(t => t.id === taskId);

  // Rename
  const rename = document.createElement('div');
  rename.className = 'dot-menu-item';
  rename.innerHTML = `<svg viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5l2 2L5 11H3v-2l6.5-6.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg> Rename`;
  rename.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllInlineDropdowns();
    onRename?.();
  });
  menu.appendChild(rename);

  // Colour picker
  const colourItem = document.createElement('div');
  colourItem.className = 'dot-menu-item dot-menu-colour';
  const colourLabel = document.createElement('div');
  colourLabel.className = 'dot-menu-colour-label';
  colourLabel.innerHTML = `<svg viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.2"/><circle cx="5" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="7" cy="9.5" r="1" fill="currentColor"/></svg> Colour`;
  colourItem.appendChild(colourLabel);
  const swatches = document.createElement('div');
  swatches.className = 'dot-menu-swatches';
  const currentColorIdx = task ? getTaskColorIndex(task) : 6;
  ROW_COLORS.forEach((hex, idx) => {
    const s = document.createElement('span');
    s.className = 'dot-menu-swatch' + (idx === currentColorIdx ? ' active' : '');
    s.style.background = hex;
    s.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = getTasks().find(t => t.id === taskId);
      if (t) {
        setTaskColor(t, idx);
        persistTasks();
        onChanged?.();
      }
      closeAllInlineDropdowns();
    });
    swatches.appendChild(s);
  });
  colourItem.appendChild(swatches);
  colourItem.addEventListener('click', (e) => e.stopPropagation());
  menu.appendChild(colourItem);

  if (task && task.due) {
    const viewCal = document.createElement('div');
    viewCal.className = 'dot-menu-item';
    viewCal.innerHTML = `<svg viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="10" rx="1.2" stroke="currentColor" stroke-width="1.2"/><line x1="4" y1="1" x2="4" y2="4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="10" y1="1" x2="10" y2="4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="1.5" y1="6" x2="12.5" y2="6" stroke="currentColor" stroke-width="1.2"/></svg> View in Calendar`;
    viewCal.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllInlineDropdowns();
      onViewCalendar?.(task.due);
    });
    menu.appendChild(viewCal);
  }

  const recur = document.createElement('div');
  recur.className = 'dot-menu-item';
  const recurLabel = task?.recurrence
    ? { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }[task.recurrence]
    : null;
  recur.innerHTML = `<img src="assets/icon.png" style="width:13px;height:13px;object-fit:contain;display:inline-block;vertical-align:middle;margin-right:6px;margin-top:1px;filter:invert(var(--icon-invert, 0));"> Recurring${recurLabel ? ` <span style="color:var(--text-muted);font-size:11px">(${recurLabel})</span>` : ''}`;
  recur.addEventListener('click', (e) => {
    e.stopPropagation();
    openRecurrenceSubmenu(recur, taskId, onChanged);
  });
  menu.appendChild(recur);

  const endDateItem = document.createElement('div');
  endDateItem.className = 'dot-menu-item dot-menu-enddate';
  endDateItem.style.position = 'relative';
  endDateItem.style.overflow = 'hidden';
  const endDateLabel = task?.endDate ? task.endDate : '';
  endDateItem.innerHTML = `<svg viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="10" rx="1.2" stroke="currentColor" stroke-width="1.2"/><line x1="4" y1="1" x2="4" y2="4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="10" y1="1" x2="10" y2="4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="1.5" y1="6" x2="12.5" y2="6" stroke="currentColor" stroke-width="1.2"/><line x1="5" y1="9" x2="9" y2="9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg> End Date${endDateLabel ? ` <span style="color:var(--text-muted);font-size:11px">(${endDateLabel})</span>` : ''}`;
  const endDateInput = document.createElement('input');
  endDateInput.type = 'date';
  endDateInput.value = endDateLabel;
  endDateInput.style.cssText = 'position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;';
  endDateInput.addEventListener('click', (e) => e.stopPropagation());
  endDateInput.addEventListener('change', (e) => {
    e.stopPropagation();
    const t = getTasks().find(t => t.id === taskId);
    if (t) {
      t.endDate = e.target.value || null;
      persistTasks();
      onChanged?.();
    }
    closeAllInlineDropdowns();
  });
  endDateItem.appendChild(endDateInput);
  menu.appendChild(endDateItem);

  const select = document.createElement('div');
  select.className = 'dot-menu-item';
  select.innerHTML = `<svg viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M4 7l2.5 2.5L10 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg> Select`;
  select.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllInlineDropdowns();
    onEnterSelect?.(taskId);
  });
  menu.appendChild(select);

  const divider = document.createElement('div');
  divider.style.cssText = 'height:1px;background:var(--border-light);margin:4px 0;';
  menu.appendChild(divider);

  const duplicate = document.createElement('div');
  duplicate.className = 'dot-menu-item';
  duplicate.innerHTML = `<svg viewBox="0 0 14 14" fill="none"><rect x="4" y="4" width="8" height="8" rx="1.2" stroke="currentColor" stroke-width="1.2"/><path d="M2 10V2h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg> Duplicate`;
  duplicate.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllInlineDropdowns();
    onChanged?.('duplicate', taskId);
  });
  menu.appendChild(duplicate);

  const del = document.createElement('div');
  del.className = 'dot-menu-item danger';
  del.innerHTML = `<svg viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5 3.5V2h4v1.5M5.5 6v4.5M8.5 6v4.5M3 3.5l.5 8h7l.5-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg> Delete`;
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllInlineDropdowns();
    if (task && task.recurrence) {
      openRecurringDeleteDialog(task, null, () => {
        import('../pages/tasks.js').then(m => m.renderTasks());
        import('../pages/board.js').then(m => m.renderBoard());
        import('../pages/calendar.js').then(m => m.renderCalendar());
      });
    } else {
      onDelete?.(taskId);
    }
  });
  menu.appendChild(del);

  const dotBtn = row.querySelector('.three-dot-btn');
  positionDropdownRight(menu, dotBtn || row);
}

// ---- Recurrence helper ----

export function advanceRecurringTask(task) {
  // Mark this instance complete (historical record)
  task.status = 'complete';

  // Calculate next due date
  const [y, m, d] = task.due.split('-').map(Number);
  const next = new Date(y, m - 1, d);
  if (task.recurrence === 'daily')   next.setDate(next.getDate() + 1);
  if (task.recurrence === 'weekly')  next.setDate(next.getDate() + 7);
  if (task.recurrence === 'monthly') next.setMonth(next.getMonth() + 1);
  const nextDue = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;

  // Spawn next occurrence as a fresh task
  const nextTask = {
    id: uid(),
    name: task.name,
    tags: [...task.tags],
    priority: task.priority,
    due: nextDue,
    endDate: null,
    recurrence: task.recurrence,
    exceptions: [],
    status: 'todo',
    createdAt: Date.now(),
  };
  getTasks().push(nextTask);

  getExpanded()['todo'] = true;
  persistExpanded();
}
