import { STATUSES, PRIORITY_META, PRIORITY_ORDER, FLAG_SVG, isDone, DONE_STATUSES } from '../modules/constants.js';
import {
  getTasks, setTasks, persistTasks,
  getExpanded, persistExpanded,
  getFilteredTasks, getSearchQuery, setSearchQuery,
  getActiveSort, setActiveSort,
  getGroupBy, setGroupBy,
  getActiveTasksTab, setActiveTasksTab,
  getEvents, setEvents, persistEvents,
  isSelectionMode, getSelectedIds,
  enterSelectionMode, clearSelectionMode, toggleSelectionId,
  tagPillStyle, pruneTagColors,
} from '../modules/state.js';
import { formatDate, uid, parseTags, stripTags, normaliseTags, dateToStr } from '../modules/utils.js';
import { showUndoToast } from '../components/toast.js';
import {
  closeAllInlineDropdowns,
  openStatusDropdown,
  openPriorityDropdown,
  openDotMenu,
  positionDropdown,
} from '../components/dropdown.js';
import { openAddEventModal, openEventPopup } from '../components/modal.js';
function switchPage(page) {
  document.dispatchEvent(new CustomEvent('app:switchPage', { detail: page }));
}

// ---- Render ----

export function renderTasks() {
  const groupBy = getGroupBy();
  if (groupBy === 'status') {
    _renderByStatus();
  } else {
    _renderByGroup(groupBy);
  }
}

function _applySearch(tasks, searchQuery) {
  if (!searchQuery) return tasks;
  return tasks.filter(t => {
    if (t.name.toLowerCase().includes(searchQuery)) return true;
    if (t.tags.some(tag => tag.toLowerCase().includes(searchQuery))) return true;
    if (t.priority && PRIORITY_META[t.priority]?.label.toLowerCase().includes(searchQuery)) return true;
    if (t.due) {
      const fmt = formatDate(t.due);
      if (fmt.text.toLowerCase().includes(searchQuery)) return true;
      const months = ['january','february','march','april','may','june',
                      'july','august','september','october','november','december'];
      const [y, m] = t.due.split('-').map(Number);
      if (months[m-1].includes(searchQuery)) return true;
      if (String(y).includes(searchQuery)) return true;
      if (t.due.includes(searchQuery)) return true;
    }
    return false;
  });
}

function _buildSectionBody(tasks, searchQuery, allCount, sectionKey, statusKeyForAdd, noAdd = false) {
  const body = document.createElement('div');
  body.className = 'section-body';

  const tableHead = document.createElement('div');
  tableHead.className = 'task-table-header';
  tableHead.innerHTML = '<span>Name</span><span>Tag</span><span>Priority</span><span>Due Date</span><span></span>';
  body.appendChild(tableHead);

  const searched = _applySearch(tasks, searchQuery);

  if (searched.length === 0 && allCount > 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-section-hint';
    hint.textContent = searchQuery ? 'No tasks match your search.' : 'No tasks match the current sort.';
    body.appendChild(hint);
  } else {
    searched.forEach(task => body.appendChild(buildTaskRow(task)));
  }

  if (!noAdd) {
    const addRow = document.createElement('div');
    addRow.className = 'inline-add-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-add-input';
    input.placeholder = allCount === 0 ? 'Type a task and press Enter…' : 'Add another task…';
    input.autocomplete = 'off';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmInlineAdd(input, statusKeyForAdd);
      if (e.key === 'Escape') input.blur();
    });
    input.addEventListener('blur', () => confirmInlineAdd(input, statusKeyForAdd));
    addRow.appendChild(input);
    body.appendChild(addRow);
  }

  return body;
}

function _appendCompletedSection(container, doneTasks, searchQuery) {
  if (doneTasks.length === 0) return;

  const COMPLETED_KEY = '__completed__';
  const isOpen = !!getExpanded()[COMPLETED_KEY]; // default false = collapsed

  const section = document.createElement('div');
  section.className = 'section section-completed';

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `
    <div class="section-toggle ${isOpen ? 'open' : ''}">
      <svg viewBox="0 0 8 12" fill="none"><path d="M2 2l4 4-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="section-name-badge">
      <span class="status-badge badge-complete">
        <span class="badge-dot"></span>
        Completed
      </span>
    </div>
    <span class="section-count">${doneTasks.length}</span>
  `;
  header.querySelector('.section-toggle').addEventListener('click', () => toggleSection(COMPLETED_KEY));
  section.appendChild(header);

  if (isOpen) {
    section.appendChild(_buildSectionBody(doneTasks, searchQuery, doneTasks.length, COMPLETED_KEY, 'complete', true));
  }

  container.appendChild(section);
}

function _renderByStatus() {
  const container = document.getElementById('listsContainer');
  container.innerHTML = '';
  const searchQuery = getSearchQuery();

  STATUSES.forEach(status => {
    const filtered = getFilteredTasks(status.key);
    const allForStatus = getTasks().filter(t => t.status === status.key);

    if (!status.primary && allForStatus.length === 0) return;

    const isOpen = !!getExpanded()[status.key];

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
      section.appendChild(_buildSectionBody(filtered, searchQuery, allForStatus.length, status.key, status.key));
    }

    container.appendChild(section);
  });

  const doneTasks = _sortTasks(getTasks().filter(isDone));
  _appendCompletedSection(container, doneTasks, searchQuery);
}

function _renderByGroup(groupBy) {
  const container = document.getElementById('listsContainer');
  container.innerHTML = '';
  const searchQuery = getSearchQuery();
  const allTasks = getTasks();

  // Build sorted task list — active only; done tasks go to the completed section
  const sorted = _sortTasks(allTasks.filter(t => !isDone(t)));

  // Determine groups and their display info
  let groups; // [{ key, label, headerHtml, tasks }]

  if (groupBy === 'tag') {
    const tagMap = {};
    sorted.forEach(t => {
      const tags = t.tags.length > 0 ? t.tags : ['__none__'];
      tags.forEach(tag => {
        if (!tagMap[tag]) tagMap[tag] = [];
        tagMap[tag].push(t);
      });
    });
    const tagKeys = Object.keys(tagMap).sort((a, b) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      return a.localeCompare(b);
    });
    groups = tagKeys.map(tag => ({
      key: 'group-tag-' + tag,
      label: tag === '__none__' ? 'No Tag' : tag,
      headerHtml: tag === '__none__'
        ? `<span class="group-label-text group-label-none">No Tag</span>`
        : `<span class="tag-pill" style="${tagPillStyle(tag)}">${tag}</span>`,
      tasks: tagMap[tag],
    }));

  } else if (groupBy === 'priority') {
    const priOrder = ['urgent', 'high', 'normal', 'low', 'none'];
    const priMap = {};
    sorted.forEach(t => {
      const p = t.priority || 'none';
      if (!priMap[p]) priMap[p] = [];
      priMap[p].push(t);
    });
    groups = priOrder
      .filter(p => priMap[p] && priMap[p].length > 0)
      .map(p => {
        const meta = PRIORITY_META[p];
        const labelHtml = p !== 'none'
          ? FLAG_SVG.replace('FLAG_CLASS', p) + `<span class="group-label-text">${meta.label}</span>`
          : `<span class="group-label-text group-label-none">${meta.label}</span>`;
        return {
          key: 'group-pri-' + p,
          label: meta.label,
          headerHtml: labelHtml,
          tasks: priMap[p],
        };
      });

  } else if (groupBy === 'due') {
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    function getBucket(t) {
      if (!t.due) return 'none';
      const [y, m, d] = t.due.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      if (dt < today) return 'overdue';
      if (dt.getTime() === today.getTime()) return 'today';
      if (dt.getTime() === tomorrow.getTime()) return 'tomorrow';
      if (dt <= endOfWeek) return 'this-week';
      if (dt <= endOfMonth) return 'this-month';
      return 'later';
    }

    const bucketOrder = ['overdue', 'today', 'tomorrow', 'this-week', 'this-month', 'later', 'none'];
    const bucketLabels = {
      overdue: 'Overdue', today: 'Today', tomorrow: 'Tomorrow',
      'this-week': 'This Week', 'this-month': 'This Month', later: 'Later', none: 'No Due Date',
    };
    const bucketMap = {};
    sorted.forEach(t => {
      const b = getBucket(t);
      if (!bucketMap[b]) bucketMap[b] = [];
      bucketMap[b].push(t);
    });
    groups = bucketOrder
      .filter(b => bucketMap[b] && bucketMap[b].length > 0)
      .map(b => ({
        key: 'group-due-' + b,
        label: bucketLabels[b],
        headerHtml: b === 'overdue'
          ? `<span class="group-label-text group-label-overdue">${bucketLabels[b]}</span>`
          : b === 'none'
            ? `<span class="group-label-text group-label-none">${bucketLabels[b]}</span>`
            : `<span class="group-label-text">${bucketLabels[b]}</span>`,
        tasks: bucketMap[b],
      }));
  }

  const doneTasks = _sortTasks(allTasks.filter(isDone));

  if ((!groups || groups.length === 0) && doneTasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-section-hint';
    empty.textContent = 'No tasks.';
    container.appendChild(empty);
    return;
  }

  groups.forEach(group => {
    const isOpen = getExpanded()[group.key] !== false; // default open
    const section = document.createElement('div');
    section.className = 'section';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `
      <div class="section-toggle ${isOpen ? 'open' : ''}">
        <svg viewBox="0 0 8 12" fill="none"><path d="M2 2l4 4-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="section-name-badge">${group.headerHtml}</div>
      <span class="section-count">${group.tasks.length}</span>
    `;
    header.querySelector('.section-toggle').addEventListener('click', () => toggleSection(group.key));
    section.appendChild(header);

    if (isOpen) {
      section.appendChild(_buildSectionBody(group.tasks, searchQuery, group.tasks.length, group.key, 'todo'));
    }

    container.appendChild(section);
  });

  _appendCompletedSection(container, doneTasks, searchQuery);
}

function _sortTasks(list) {
  const s = getActiveSort();
  if (s.type === 'created') return list.sort((a, b) => a.createdAt - b.createdAt);
  return list.sort((a, b) => {
    let valA, valB;
    if (s.type === 'priority') {
      valA = PRIORITY_ORDER[a.priority] ?? 99;
      valB = PRIORITY_ORDER[b.priority] ?? 99;
    } else if (s.type === 'due') {
      valA = a.due || '9999-99-99';
      valB = b.due || '9999-99-99';
    } else if (s.type === 'tag') {
      valA = (a.tags[0] || 'zzz').toLowerCase();
      valB = (b.tags[0] || 'zzz').toLowerCase();
    }
    if (valA < valB) return s.dir === 'asc' ? -1 : 1;
    if (valA > valB) return s.dir === 'asc' ? 1 : -1;
    return 0;
  });
}

// ---- Events list ----

export function renderEvents() {
  const container = document.getElementById('eventsListContainer');
  if (!container) return;
  container.innerHTML = '';

  const events = getEvents();
  const todayStr = dateToStr(new Date());

  // Sort: upcoming first (by date), then past, then no date
  const withDate = [...events].filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date));
  const noDate   = events.filter(e => !e.date);

  const upcoming = withDate.filter(e => e.date >= todayStr);
  const past     = withDate.filter(e => e.date < todayStr);

  if (events.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'events-empty';
    empty.innerHTML = `
      <svg viewBox="0 0 48 48" fill="none"><rect x="4" y="8" width="40" height="36" rx="4" stroke="currentColor" stroke-width="2"/><line x1="14" y1="4" x2="14" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="34" y1="4" x2="34" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4" y1="20" x2="44" y2="20" stroke="currentColor" stroke-width="2"/></svg>
      <div class="events-empty-title">No events yet</div>
      <div class="events-empty-sub">Click Add Event or click a day in the Calendar to create one.</div>
    `;
    container.appendChild(empty);
    return;
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function _buildEventRow(ev) {
    const row = document.createElement('div');
    row.className = 'event-row';
    row.dataset.id = ev.id;

    const isPast = ev.date && ev.date < todayStr;

    let dateLabel = '—';
    if (ev.date) {
      const [y, m, d] = ev.date.split('-').map(Number);
      dateLabel = `${d} ${MONTHS[m-1]} ${y}`;
    }
    const timeLabel = ev.time ? ev.time.slice(0,5) : '—';
    const durationLabel = ev.duration ? `${ev.duration} min` : '—';

    row.innerHTML = `
      <div class="event-row-dot ${isPast ? 'past' : ''}"></div>
      <div class="event-row-main">
        <span class="event-row-title ${isPast ? 'event-past' : ''}">${esc(ev.title)}</span>
      </div>
      <div class="event-row-date">${dateLabel}</div>
      <div class="event-row-time">${timeLabel}</div>
      <div class="event-row-duration">${durationLabel}</div>
      <div class="event-row-actions">
        <button class="three-dot-btn event-dot-btn" aria-label="Event options">
          <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="13" r="1.2"/></svg>
        </button>
      </div>
    `;

    row.addEventListener('click', (e) => {
      if (e.target.closest('.event-dot-btn')) return;
      openEventPopup(ev);
    });

    row.querySelector('.event-dot-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const snapshot = [...getEvents()];
      setEvents(getEvents().filter(x => x.id !== ev.id));
      persistEvents();
      renderEvents();
      import('../pages/calendar.js').then(m => m.renderCalendar());
      showUndoToast(`"${ev.title}" deleted`, () => {
        setEvents(snapshot);
        persistEvents();
        renderEvents();
        import('../pages/calendar.js').then(m => m.renderCalendar());
      });
    });

    return row;
  }

  function _appendSection(label, evList, muted) {
    if (evList.length === 0) return;
    const heading = document.createElement('div');
    heading.className = 'event-section-heading' + (muted ? ' muted' : '');
    heading.textContent = label;
    container.appendChild(heading);

    const tableHead = document.createElement('div');
    tableHead.className = 'event-table-header';
    tableHead.innerHTML = '<span>Title</span><span>Date</span><span>Time</span><span>Duration</span><span></span>';
    container.appendChild(tableHead);

    evList.forEach(ev => container.appendChild(_buildEventRow(ev)));
  }

  _appendSection('Upcoming', upcoming, false);
  _appendSection('Past', past, true);
  if (noDate.length > 0) _appendSection('No Date', noDate, true);
}

// ---- Build task row ----

function buildTaskRow(task) {
  const isDone = task.status === 'complete' || task.status === 'canceled';
  const row = document.createElement('div');
  row.className = 'task-row' + (isDone ? ' row-muted' : '');
  row.dataset.id = task.id;

  const nameCell = document.createElement('div');
  nameCell.className = 'task-name-cell';

  const checkbox = document.createElement('div');
  checkbox.className = 'task-checkbox' + (getSelectedIds().has(task.id) ? ' checked' : '');
  checkbox.style.display = isSelectionMode() ? 'flex' : 'none';
  checkbox.innerHTML = getSelectedIds().has(task.id)
    ? `<svg viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : '';
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSelectionId(task.id);
    checkbox.classList.toggle('checked');
    checkbox.innerHTML = getSelectedIds().has(task.id)
      ? `<svg viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : '';
    updateBulkBar();
  });

  const ringWrap = document.createElement('div');
  ringWrap.className = 'task-status-icon';
  ringWrap.style.display = isSelectionMode() ? 'none' : '';
  const ring = document.createElement('div');
  ring.className = `status-ring ${task.status}`;
  ringWrap.appendChild(ring);
  ringWrap.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllInlineDropdowns();
    openStatusDropdown(ringWrap, task.id, renderTasks);
  });

  const nameText = document.createElement('span');
  nameText.className = 'task-name-text' + (isDone ? ' strikethrough' : '');
  nameText.textContent = task.name;
  nameText.addEventListener('click', () => startNameEdit(nameText, task));

  nameCell.appendChild(checkbox);
  nameCell.appendChild(ringWrap);
  nameCell.appendChild(nameText);

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
    openPriorityDropdown(priCell, task.id, renderTasks);
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
    persistTasks();
    renderTasks();
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
      persistTasks();
      renderTasks();
    });
    dueCell.appendChild(clearBtn);
  }

  dueCell.addEventListener('click', (e) => {
    if (e.target.closest('.due-clear-btn')) return;
    dueDateInput.showPicker?.() || dueDateInput.click();
  });
  dueDateInput.style.cssText = 'position:absolute;opacity:0;width:0;height:0;pointer-events:none';
  dueCell.appendChild(dueDateInput);

  // Three-dot
  const dotBtn = document.createElement('button');
  dotBtn.className = 'three-dot-btn';
  dotBtn.setAttribute('aria-label', 'Task options');
  dotBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="13" r="1.2"/></svg>`;
  dotBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllInlineDropdowns();
    openDotMenu(row, task.id, {
      onChanged: (action, id) => {
        if (action === 'duplicate') _duplicateTask(id);
        else renderTasks();
      },
      onViewCalendar: (due) => {
        const [y, m] = due.split('-').map(Number);
        import('./calendar.js').then(cal => {
          cal.setCalendarMonth(y, m - 1);
        });
        switchPage('calendar');
      },
      onEnterSelect: (id) => {
        enterSelectionMode(id);
        renderTasks();
        updateBulkBar();
      },
      onDelete: (id) => _deleteTask(id),
    });
  });

  row.appendChild(nameCell);
  row.appendChild(tagCell);
  row.appendChild(priCell);
  row.appendChild(dueCell);
  row.appendChild(dotBtn);

  return row;
}

function _duplicateTask(taskId) {
  const t = getTasks().find(t => t.id === taskId);
  if (!t) return;
  const copy = { ...t, id: uid(), name: t.name + ' (copy)', createdAt: Date.now(), status: 'todo' };
  getTasks().push(copy);
  persistTasks();
  getExpanded()['todo'] = true;
  persistExpanded();
  renderTasks();
  setTimeout(() => {
    const newRow = document.querySelector(`.task-row[data-id="${copy.id}"]`);
    if (newRow) {
      newRow.classList.add('row-highlight');
      newRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setTimeout(() => newRow.classList.remove('row-highlight'), 1500);
    }
  }, 50);
}

function _deleteTask(taskId) {
  const t = getTasks().find(t => t.id === taskId);
  if (!t) return;
  const snapshot = [...getTasks()];
  setTasks(getTasks().filter(t => t.id !== taskId));
  persistTasks();
  renderTasks();
  showUndoToast(`"${t.name}" deleted`, () => {
    setTasks(snapshot);
    persistTasks();
    renderTasks();
  });
}

// ---- Inline name edit ----

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
      const snapshot = [...getTasks()];
      setTasks(getTasks().filter(t => t.id !== task.id));
      persistTasks();
      renderTasks();
      showUndoToast(`"${task.name}" deleted`, () => {
        setTasks(snapshot);
        persistTasks();
        renderTasks();
      });
    } else {
      task.name = raw;
      persistTasks();
      renderTasks();
    }
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') renderTasks();
  });
}

// ---- Inline tag edit ----

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
    getTasks().forEach(t => {
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
    return normaliseTags(input.value);
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
    task.tags = normaliseTags(input.value);
    pruneTagColors();
    persistTasks();
    renderTasks();
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') renderTasks();
    if (e.key === 'Tab' && suggestBox.style.display !== 'none') {
      e.preventDefault();
      const first = suggestBox.querySelector('.tag-suggest-item');
      if (first) first.click();
    }
  });
}

// ---- Sections ----

function toggleSection(statusKey) {
  getExpanded()[statusKey] = !getExpanded()[statusKey];
  persistExpanded();
  renderTasks();
}

// ---- Add task ----

function confirmInlineAdd(input, statusKey) {
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
    status: statusKey || 'todo',
    createdAt: Date.now(),
  };

  getTasks().push(task);
  persistTasks();
  input.value = '';
  renderTasks();
  const newInput = document.querySelector('.inline-add-input');
  if (newInput) newInput.focus();
}

// ---- Bulk selection ----

export function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  if (!isSelectionMode() || getSelectedIds().size === 0) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  document.getElementById('bulkCount').textContent = `${getSelectedIds().size} selected`;
}

function _exitSelection() {
  clearSelectionMode();
  renderTasks();
  updateBulkBar();
}

// ---- Sort ----

function _applyTab(tab) {
  setActiveTasksTab(tab);
  const isEvents = tab === 'events';
  document.getElementById('listsContainer').style.display       = isEvents ? 'none' : '';
  document.getElementById('eventsListContainer').style.display  = isEvents ? '' : 'none';
  document.getElementById('tasksToolbar').style.display         = isEvents ? 'none' : '';
  document.getElementById('eventsToolbar').style.display        = isEvents ? '' : 'none';
  document.getElementById('tasksSearchRow').style.display       = isEvents ? 'none' : '';
  document.querySelectorAll('.tasks-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (isEvents) renderEvents();
}

export function initTasksPage() {
  document.querySelectorAll('.tasks-tab').forEach(btn => {
    btn.addEventListener('click', () => _applyTab(btn.dataset.tab));
  });

  document.getElementById('addEventBtn').addEventListener('click', () => {
    openAddEventModal(dateToStr(new Date()));
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    setSearchQuery(e.target.value.trim().toLowerCase());
    document.getElementById('searchClear').style.display = getSearchQuery() ? 'block' : 'none';
    renderTasks();
  });

  document.getElementById('searchClear').addEventListener('click', () => {
    setSearchQuery('');
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClear').style.display = 'none';
    renderTasks();
  });

  document.querySelectorAll('.group-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setGroupBy(btn.dataset.group);
      document.querySelectorAll('.group-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTasks();
    });
  });

  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.sort;

      if (type === 'none') {
        setActiveSort({ type: 'created', dir: 'asc' });
        document.querySelectorAll('.sort-btn').forEach(b => {
          b.classList.remove('active');
          const arrow = b.querySelector('.sort-arrow');
          if (arrow) { arrow.style.transform = 'rotate(0deg)'; arrow.style.opacity = '0.3'; }
          b.dataset.dir = 'asc';
        });
        btn.classList.add('active');
        renderTasks();
        return;
      }

      const current = getActiveSort();
      if (current.type === type) {
        setActiveSort({ type, dir: current.dir === 'asc' ? 'desc' : 'asc' });
      } else {
        setActiveSort({ type, dir: 'asc' });
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }

      document.querySelectorAll('.sort-btn[data-sort]:not([data-sort="none"])').forEach(b => {
        const a = b.querySelector('.sort-arrow');
        if (!a) return;
        const s = getActiveSort();
        if (b === btn) {
          a.style.transform = s.dir === 'asc' ? 'rotate(0deg)' : 'rotate(180deg)';
          a.style.opacity = '1';
        } else {
          a.style.transform = 'rotate(0deg)';
          a.style.opacity = '0.6';
        }
      });

      renderTasks();
    });
  });

  document.getElementById('bulkCancelBtn').addEventListener('click', _exitSelection);

  document.getElementById('bulkDeleteBtn').addEventListener('click', () => {
    const snapshot = [...getTasks()];
    const count = getSelectedIds().size;
    setTasks(getTasks().filter(t => !getSelectedIds().has(t.id)));
    persistTasks();
    _exitSelection();
    showUndoToast(`${count} task${count > 1 ? 's' : ''} deleted`, () => {
      setTasks(snapshot);
      persistTasks();
      renderTasks();
    });
  });

  document.getElementById('bulkStatusBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = document.getElementById('bulkStatusDd');
    if (dd.children.length === 0) {
      const allStatuses = [
        ...STATUSES,
        { key: 'complete', label: 'Complete' },
        { key: 'canceled', label: 'Canceled' },
      ];
      allStatuses.forEach(s => {
        const item = document.createElement('div');
        item.className = 'inline-dropdown-item';
        item.innerHTML = `<span class="status-dot ${s.key}"></span>${s.label}`;
        item.addEventListener('click', () => {
          getSelectedIds().forEach(id => {
            const t = getTasks().find(t => t.id === id);
            if (t) {
              t.status = s.key;
              if (!DONE_STATUSES.includes(s.key)) getExpanded()[s.key] = true;
            }
          });
          persistTasks();
          persistExpanded();
          _exitSelection();
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
        getSelectedIds().forEach(id => {
          const t = getTasks().find(t => t.id === id);
          if (t) t.priority = key;
        });
        persistTasks();
        _exitSelection();
      });
      dd.appendChild(item);
    });
    const btn = document.getElementById('bulkPriorityBtn');
    positionDropdown(dd, btn);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isSelectionMode()) _exitSelection();
  });
}

