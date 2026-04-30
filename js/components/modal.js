import { STATUSES, PRIORITY_META, FLAG_SVG } from '../modules/constants.js';
import { getTasks, setTasks, persistTasks, getExpanded, persistExpanded, getEvents, setEvents, persistEvents } from '../modules/state.js';
import { formatDate, esc, dueBtnLabel, parseTags, stripTags, uid, dateToStr, normaliseTags } from '../modules/utils.js';
import { showUndoToast } from './toast.js';

// Shared HTML for the priority picker used in both edit and add-from-calendar forms
function priorityDropdownItems() {
  return Object.entries(PRIORITY_META).map(([k, v]) => {
    const icon = k !== 'none' ? FLAG_SVG.replace('FLAG_CLASS', k) : '<span style="width:14px;display:inline-block"></span>';
    return `<div class="tpop-form-dd-item" data-priority="${k}">${icon} ${v.label}</div>`;
  }).join('');
}

// ---- Recurring delete dialog ----

export function openRecurringDeleteDialog(task, virtualDate, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'task-popup-overlay';
  overlay.style.cssText = 'display:flex;z-index:10000;';

  overlay.innerHTML = `
    <div class="task-popup" style="max-width:340px;padding:28px 24px 20px;">
      <h3 style="font-size:15px;font-weight:600;color:var(--text);margin:0 0 8px;">Delete recurring task</h3>
      <p style="font-size:13px;color:var(--text-muted);margin:0 0 20px;line-height:1.5;">
        "<strong>${esc(task.name)}</strong>" repeats ${task.recurrence}. What would you like to delete?
      </p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button class="btn-add-confirm" id="rdJustThis" style="text-align:left;padding:10px 14px;">Just this event</button>
        <button class="btn-add-confirm" id="rdFromHere" style="text-align:left;padding:10px 14px;background:var(--bg);color:var(--text);border:1px solid var(--border);">This and all future events</button>
        <button class="btn-delete" id="rdAll" style="text-align:left;padding:10px 14px;">All events</button>
      </div>
      <div style="margin-top:12px;text-align:right;">
        <button class="btn-cancel" id="rdCancel">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const remove = () => overlay.remove();

  overlay.querySelector('#rdCancel').addEventListener('click', remove);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) remove(); });

  overlay.querySelector('#rdJustThis').addEventListener('click', () => {
    const dateToSkip = virtualDate || task.due;
    if (dateToSkip) {
      task.exceptions = task.exceptions || [];
      if (!task.exceptions.includes(dateToSkip)) task.exceptions.push(dateToSkip);
      persistTasks();
    }
    remove();
    onDone?.();
  });

  overlay.querySelector('#rdFromHere').addEventListener('click', () => {
    const cutDate = virtualDate || task.due;
    if (cutDate) {
      // Set endDate to the day before the cut date
      const [y, m, d] = cutDate.split('-').map(Number);
      const dayBefore = new Date(y, m - 1, d - 1);
      const endStr = dateToStr(dayBefore);
      if (endStr >= task.due) {
        task.endDate = endStr;
      } else {
        // Cut is at or before the start — delete entirely
        setTasks(getTasks().filter(t => t.id !== task.id));
      }
      persistTasks();
    }
    remove();
    onDone?.();
  });

  overlay.querySelector('#rdAll').addEventListener('click', () => {
    const snapshot = [...getTasks()];
    setTasks(getTasks().filter(t => t.id !== task.id));
    persistTasks();
    remove();
    showUndoToast(`"${task.name}" deleted`, () => {
      setTasks(snapshot);
      persistTasks();
      _refreshAll();
    });
    onDone?.();
  });
}

// ---- Task detail popup ----

export function openTaskPopup(task, virtualDate) {
  renderTaskPopupView(task, virtualDate);
  document.getElementById('taskPopupOverlay').style.display = 'flex';
}

export function closeTaskPopup() {
  document.getElementById('taskPopupOverlay').style.display = 'none';
}

const MONTHS_SHORT_MODAL = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function _fmtPopupDate(dateStr) {
  if (!dateStr) return { text: '—', cls: '' };
  const fmt = formatDate(dateStr);
  const [y, m, d] = dateStr.split('-').map(Number);
  const yy = String(y).slice(-2);
  const base = `${d} ${MONTHS_SHORT_MODAL[m-1]} ${yy}`;
  if (fmt.cls === 'overdue') return { text: base, cls: 'overdue' };
  if (fmt.cls === 'today')   return { text: `Today ${yy}`, cls: 'today' };
  if (fmt.text === 'Tomorrow') return { text: `Tomorrow ${yy}`, cls: '' };
  return { text: base, cls: '' };
}

function renderTaskPopupView(task, virtualDate) {
  const fmt    = _fmtPopupDate(task.due);
  const meta   = PRIORITY_META[task.priority] || PRIORITY_META.none;
  const status = STATUSES.find(s => s.key === task.status);

  const fmtEnd = task.endDate ? _fmtPopupDate(task.endDate) : null;
  document.getElementById('taskPopupContent').innerHTML = `
    <div class="tpop-status badge-${task.status}"><span class="badge-dot"></span>${status ? status.label : ''}</div>
    <h2 class="tpop-name">${esc(task.name)}</h2>
    <div class="tpop-meta">
      <div class="tpop-row"><span class="tpop-label">Due</span><span class="tpop-value ${fmt.cls||''}">${fmt.text}</span></div>
      ${fmtEnd ? `<div class="tpop-row"><span class="tpop-label">End Date</span><span class="tpop-value">${fmtEnd.text}</span></div>` : ''}
      <div class="tpop-row"><span class="tpop-label">Priority</span><span class="tpop-value">${meta.label}</span></div>
      ${task.tags.length ? `<div class="tpop-row"><span class="tpop-label">Tags</span><span class="tpop-value">${task.tags.map(t => esc(t)).join(', ')}</span></div>` : ''}
    </div>
    <div class="tpop-actions">
      <button class="tpop-edit-btn" data-id="${task.id}">Edit</button>
      <button class="tpop-goto-btn" data-id="${task.id}">View in My Tasks</button>
    </div>
  `;

  document.querySelector('.tpop-edit-btn').addEventListener('click', () => {
    renderTaskPopupEdit(task, virtualDate);
  });

  document.querySelector('.tpop-goto-btn').addEventListener('click', () => {
    closeTaskPopup();
    document.dispatchEvent(new CustomEvent('app:switchPage', { detail: 'tasks' }));
    getExpanded()[task.status] = true;
    persistExpanded();
    import('../pages/tasks.js').then(m => {
      m.renderTasks();
      setTimeout(() => {
        const row = document.querySelector(`.task-row[data-id="${task.id}"]`);
        if (row) {
          row.classList.add('row-highlight');
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => row.classList.remove('row-highlight'), 1500);
        }
      }, 80);
    });
  });
}

function renderTaskPopupEdit(task, virtualDate) {
  let editStatus   = task.status;
  let editPriority = task.priority || 'none';
  let editDue      = task.due || '';
  let editEndDate  = task.endDate || '';
  let editDirty    = false;

  document.getElementById('taskPopupContent').innerHTML = `
    <div class="tpop-form-header">
      <div class="tpop-form-status-wrap">
        <button class="status-dot-btn" id="editStatusBtn">
          <span class="status-ring ${editStatus}" id="editStatusRing"></span>
          <span id="editStatusLabel">${STATUSES.find(s=>s.key===editStatus)?.label || editStatus}</span>
        </button>
        <div class="tpop-form-status-dd" id="editStatusDd" style="display:none">
          ${STATUSES.map(s=>`<div class="tpop-form-dd-item" data-status="${s.key}"><span class="status-dot ${s.key}"></span>${s.label}</div>`).join('')}
        </div>
      </div>
    </div>
    <input type="text" class="tpop-name-input" id="editNameInput" value="${esc(task.name)}" placeholder="Task name…" autocomplete="off" />
    <div class="tpop-form-rows">
      <div class="tpop-row">
        <span class="tpop-label">Tag</span>
        <input type="text" class="tpop-field-input" id="editTagInput" value="${esc(task.tags.join(' '))}" placeholder="tag" autocomplete="off" />
      </div>
      <div class="tpop-row">
        <span class="tpop-label">Priority</span>
        <div class="tpop-field-btn-wrap">
          <button class="tpop-field-btn" id="editPriorityBtn">${(PRIORITY_META[editPriority]||PRIORITY_META.none).label}</button>
          <div class="tpop-form-status-dd" id="editPriorityDd" style="display:none">
            ${priorityDropdownItems()}
          </div>
        </div>
      </div>
      <div class="tpop-row">
        <span class="tpop-label">Due</span>
        <input type="date" class="tpop-field-input" id="editDueInput" value="${editDue}" />
      </div>
      <div class="tpop-row">
        <span class="tpop-label">End Date</span>
        <input type="date" class="tpop-field-input" id="editEndDateInput" value="${editEndDate}" />
      </div>
    </div>
    <div class="task-popup-actions">
      <button class="btn-delete" id="editDeleteBtn">Delete</button>
      <button class="btn-cancel" id="editCancelBtn">Cancel</button>
      <button class="btn-add-confirm" id="editSaveBtn">Save</button>
    </div>
  `;

  const content = document.getElementById('taskPopupContent');

  content.querySelector('#editNameInput').addEventListener('input', () => { editDirty = true; });
  content.querySelector('#editTagInput').addEventListener('input', () => { editDirty = true; });

  content.querySelector('#editDeleteBtn').addEventListener('click', () => {
    if (task.recurrence) {
      closeTaskPopup();
      openRecurringDeleteDialog(task, virtualDate, () => _refreshAll());
    } else {
      const snapshot = [...getTasks()];
      setTasks(getTasks().filter(t => t.id !== task.id));
      persistTasks();
      closeTaskPopup();
      showUndoToast(`"${task.name}" deleted`, () => {
        setTasks(snapshot);
        persistTasks();
        _refreshAll();
      });
      _refreshAll();
    }
  });

  content.querySelector('#editCancelBtn').addEventListener('click', () => {
    editDirty = false;
    renderTaskPopupView(task);
  });

  const statusBtn = content.querySelector('#editStatusBtn');
  const statusDd  = content.querySelector('#editStatusDd');
  statusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    statusDd.style.display = statusDd.style.display === 'none' ? 'block' : 'none';
  });
  statusDd.querySelectorAll('.tpop-form-dd-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      editStatus = item.dataset.status;
      editDirty = true;
      content.querySelector('#editStatusRing').className = `status-ring ${editStatus}`;
      content.querySelector('#editStatusLabel').textContent = STATUSES.find(s=>s.key===editStatus)?.label || editStatus;
      statusDd.style.display = 'none';
    });
  });

  const priBtn = content.querySelector('#editPriorityBtn');
  const priDd  = content.querySelector('#editPriorityDd');
  priBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    priDd.style.display = priDd.style.display === 'none' ? 'block' : 'none';
  });
  priDd.querySelectorAll('.tpop-form-dd-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      editPriority = item.dataset.priority;
      editDirty = true;
      priBtn.textContent = (PRIORITY_META[editPriority]||PRIORITY_META.none).label;
      priDd.style.display = 'none';
    });
  });

  content.querySelector('#editDueInput').addEventListener('change', (e) => {
    editDue = e.target.value || '';
    editDirty = true;
  });

  content.querySelector('#editEndDateInput').addEventListener('change', (e) => {
    editEndDate = e.target.value || '';
    editDirty = true;
  });

  content.querySelector('#editSaveBtn').addEventListener('click', () => {
    const nameVal = content.querySelector('#editNameInput').value.trim();
    if (!nameVal) return;
    const tagRaw = content.querySelector('#editTagInput').value.trim();
    task.name     = nameVal;
    task.tags     = normaliseTags(tagRaw);
    task.priority = editPriority;
    task.due      = editDue || null;
    task.status   = editStatus;
    if (editEndDate && editEndDate > (editDue || '')) {
      task.endDate = editEndDate;
    } else {
      delete task.endDate;
    }
    editDirty = false;
    persistTasks();
    getExpanded()[task.status] = true;
    persistExpanded();
    renderTaskPopupView(task);
    _refreshAll();
  });

  content.addEventListener('click', () => {
    statusDd.style.display = 'none';
    priDd.style.display    = 'none';
  });
}

// ---- Add from calendar popup ----

let addCalStatus   = 'todo';
let addCalPriority = 'none';
let addCalDue      = null;
let addCalEndDate  = null;

export function openAddFromCal(dateStr) {
  addCalStatus   = 'todo';
  addCalPriority = 'none';
  addCalDue      = dateStr;
  addCalEndDate  = null;

  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const overlay = document.getElementById('addFromCalOverlay');
  const popup   = document.getElementById('addFromCalPopup');

  popup.innerHTML = `
    <button class="task-popup-close" id="addFromCalClose">&times;</button>
    <div class="tpop-form-header">
      <div class="tpop-form-status-wrap">
        <button class="tpop-form-status-btn status-dot-btn" id="afcStatusBtn">
          <span class="status-ring todo" id="afcStatusRing"></span>
          <span id="afcStatusLabel">To Do</span>
        </button>
        <div class="tpop-form-status-dd" id="afcStatusDd" style="display:none">
          ${STATUSES.map(s => `<div class="tpop-form-dd-item" data-status="${s.key}">
            <span class="status-dot ${s.key}"></span>${s.label}
          </div>`).join('')}
        </div>
      </div>
    </div>
    <input type="text" class="tpop-name-input" id="afcNameInput" placeholder="Task name…" autocomplete="off" />
    <div class="tpop-form-rows">
      <div class="tpop-row">
        <span class="tpop-label">Tag</span>
        <input type="text" class="tpop-field-input" id="afcTagInput" placeholder="tag" autocomplete="off" />
      </div>
      <div class="tpop-row">
        <span class="tpop-label">Priority</span>
        <div class="tpop-field-btn-wrap">
          <button class="tpop-field-btn" id="afcPriorityBtn">— No Priority</button>
          <div class="tpop-form-status-dd" id="afcPriorityDd" style="display:none">
            ${priorityDropdownItems()}
          </div>
        </div>
      </div>
      <div class="tpop-row">
        <span class="tpop-label">Due</span>
        <input type="date" class="tpop-field-input" id="afcDueInput" value="${dateStr}" />
      </div>
      <div class="tpop-row">
        <span class="tpop-label">End Date</span>
        <input type="date" class="tpop-field-input" id="afcEndDateInput" />
      </div>
    </div>
    <div class="task-popup-actions">
      <button class="btn-cancel" id="addFromCalClose2">Cancel</button>
      <button class="btn-add-confirm" id="addFromCalConfirm">Add Task</button>
    </div>
  `;

  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('afcNameInput')?.focus(), 50);

  popup.querySelector('#addFromCalClose').addEventListener('click', closeAddFromCal);
  popup.querySelector('#addFromCalClose2').addEventListener('click', closeAddFromCal);

  popup.querySelector('#afcNameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmAddFromCal();
    if (e.key === 'Escape') closeAddFromCal();
  });

  popup.querySelector('#addFromCalConfirm').addEventListener('click', confirmAddFromCal);

  const statusBtn = popup.querySelector('#afcStatusBtn');
  const statusDd  = popup.querySelector('#afcStatusDd');
  statusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    statusDd.style.display = statusDd.style.display === 'none' ? 'block' : 'none';
  });
  statusDd.querySelectorAll('.tpop-form-dd-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      addCalStatus = item.dataset.status;
      const s = STATUSES.find(s => s.key === addCalStatus);
      popup.querySelector('#afcStatusRing').className = `status-ring ${addCalStatus}`;
      popup.querySelector('#afcStatusLabel').textContent = s ? s.label : addCalStatus;
      statusDd.style.display = 'none';
    });
  });

  const priBtn = popup.querySelector('#afcPriorityBtn');
  const priDd  = popup.querySelector('#afcPriorityDd');
  priBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    priDd.style.display = priDd.style.display === 'none' ? 'block' : 'none';
  });
  priDd.querySelectorAll('.tpop-form-dd-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      addCalPriority = item.dataset.priority;
      const meta = PRIORITY_META[addCalPriority];
      priBtn.textContent = meta ? meta.label : 'No Priority';
      priDd.style.display = 'none';
    });
  });

  popup.querySelector('#afcDueInput').addEventListener('change', (e) => {
    addCalDue = e.target.value || null;
  });

  popup.querySelector('#afcEndDateInput').addEventListener('change', (e) => {
    addCalEndDate = e.target.value || null;
  });

  document.addEventListener('click', _closeAddFromCalDropdowns);
}

function _closeAddFromCalDropdowns() {
  ['afcStatusDd', 'afcPriorityDd'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

export function closeAddFromCal() {
  document.getElementById('addFromCalOverlay').style.display = 'none';
  document.removeEventListener('click', _closeAddFromCalDropdowns);
}

function confirmAddFromCal() {
  const nameInput = document.getElementById('afcNameInput');
  const raw = nameInput ? nameInput.value.trim() : '';
  if (!raw) return;
  const tagRaw = (document.getElementById('afcTagInput')?.value || '').trim();
  const tags = tagRaw ? normaliseTags(tagRaw) : parseTags(raw);
  const task = {
    id: uid(),
    name: stripTags(raw) || raw,
    tags,
    priority: addCalPriority,
    due: addCalDue,
    status: addCalStatus,
    createdAt: Date.now(),
  };
  if (addCalEndDate && addCalDue && addCalEndDate > addCalDue) task.endDate = addCalEndDate;
  getTasks().push(task);
  persistTasks();
  getExpanded()[addCalStatus] = true;
  persistExpanded();
  closeAddFromCal();
  _refreshAll();
}

// ---- Keyboard handling ----

export function initModalKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    const taskOverlay = document.getElementById('taskPopupOverlay');
    if (taskOverlay.style.display !== 'none') {
      const inEditMode = !!document.getElementById('editSaveBtn');
      if (inEditMode) {
        const saveBtn = document.getElementById('editSaveBtn');
        if (saveBtn) {
          const content = document.getElementById('taskPopupContent');
          const nameInput = content?.querySelector('#editNameInput');
          if (nameInput && nameInput.dataset.dirty === 'true') return;
        }
        const taskId = document.querySelector('[data-id]')?.dataset.id;
        const t = getTasks().find(t => t.id === taskId);
        if (t) renderTaskPopupView(t); else closeTaskPopup();
      } else {
        closeTaskPopup();
      }
      return;
    }

    const calOverlay = document.getElementById('addFromCalOverlay');
    if (calOverlay.style.display !== 'none') {
      const nameInput = document.getElementById('afcNameInput');
      if (!nameInput || !nameInput.value.trim()) closeAddFromCal();
    }
  });

  document.getElementById('taskPopupClose').addEventListener('click', closeTaskPopup);
  document.getElementById('taskPopupOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeTaskPopup();
  });
  document.getElementById('addFromCalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAddFromCal();
  });

  document.getElementById('calChoiceOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCalChoice();
  });

  document.getElementById('eventPopupOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEventPopup();
  });
}

// Lazy refresh — avoids circular deps at module parse time
function _refreshAll() {
  Promise.all([
    import('../pages/tasks.js'),
    import('../pages/calendar.js'),
    import('../pages/board.js'),
    import('../pages/gantt.js'),
  ]).then(([t, c, b, g]) => {
    t.renderTasks();
    t.renderEvents();
    c.renderCalendar();
    b.renderBoard();
    g.renderGantt();
  });
}

// ---- Calendar day choice popup ----

export function openCalChoice(dateStr) {
  const overlay = document.getElementById('calChoiceOverlay');
  const popup   = document.getElementById('calChoicePopup');

  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const label = `${d} ${months[m-1]} ${y}`;

  popup.innerHTML = `
    <button class="task-popup-close" id="calChoiceClose">&times;</button>
    <div class="cal-choice-date">${label}</div>
    <div class="cal-choice-title">What would you like to add?</div>
    <div class="cal-choice-btns">
      <button class="cal-choice-btn" id="calChoiceTask">
        <svg viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M7 10l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="cal-choice-btn-label">Task</span>
        <span class="cal-choice-btn-sub">Action item with status &amp; priority</span>
      </button>
      <button class="cal-choice-btn" id="calChoiceEvent">
        <svg viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><line x1="6" y1="2" x2="6" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="14" y1="2" x2="14" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="2" y1="9" x2="18" y2="9" stroke="currentColor" stroke-width="1.5"/></svg>
        <span class="cal-choice-btn-label">Event</span>
        <span class="cal-choice-btn-sub">Something happening at a time</span>
      </button>
    </div>
  `;

  overlay.style.display = 'flex';

  popup.querySelector('#calChoiceClose').addEventListener('click', closeCalChoice);
  popup.querySelector('#calChoiceTask').addEventListener('click', () => {
    closeCalChoice();
    openAddFromCal(dateStr);
  });
  popup.querySelector('#calChoiceEvent').addEventListener('click', () => {
    closeCalChoice();
    openAddEventModal(dateStr);
  });
}

export function closeCalChoice() {
  document.getElementById('calChoiceOverlay').style.display = 'none';
}

// ---- Event popup (add / edit / view) ----

export function openAddEventModal(dateStr) {
  _renderEventForm(null, dateStr);
}

export function openEventPopup(event) {
  _renderEventView(event);
  document.getElementById('eventPopupOverlay').style.display = 'flex';
}

export function closeEventPopup() {
  document.getElementById('eventPopupOverlay').style.display = 'none';
}

function _renderEventView(event) {
  const overlay = document.getElementById('eventPopupOverlay');
  const popup   = document.getElementById('eventPopup');

  const [y, m, d] = event.date.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateLabel = `${d} ${months[m-1]} ${y}`;
  const timeLabel = event.time || null;
  const durationLabel = event.duration ? `${event.duration} min` : null;

  popup.innerHTML = `
    <button class="task-popup-close" id="evtViewClose">&times;</button>
    <div class="evt-view-type">Event</div>
    <h2 class="tpop-name">${esc(event.title)}</h2>
    <div class="tpop-meta">
      <div class="tpop-row"><span class="tpop-label">Date</span><span class="tpop-value">${dateLabel}</span></div>
      ${timeLabel ? `<div class="tpop-row"><span class="tpop-label">Time</span><span class="tpop-value">${timeLabel}</span></div>` : ''}
      ${durationLabel ? `<div class="tpop-row"><span class="tpop-label">Duration</span><span class="tpop-value">${durationLabel}</span></div>` : ''}
      ${event.notes ? `<div class="tpop-row evt-notes-row"><span class="tpop-label">Notes</span><span class="tpop-value evt-notes-val">${esc(event.notes)}</span></div>` : ''}
    </div>
    <div class="tpop-actions">
      <button class="tpop-edit-btn" id="evtViewEdit">Edit</button>
    </div>
  `;

  overlay.style.display = 'flex';
  popup.querySelector('#evtViewClose').addEventListener('click', closeEventPopup);
  popup.querySelector('#evtViewEdit').addEventListener('click', () => _renderEventForm(event, null));
}

function _renderEventForm(event, prefillDate) {
  const overlay = document.getElementById('eventPopupOverlay');
  const popup   = document.getElementById('eventPopup');
  const isEdit  = !!event;
  const dateVal = event ? event.date : (prefillDate || '');

  popup.innerHTML = `
    <button class="task-popup-close" id="evtFormClose">&times;</button>
    <input type="text" class="tpop-name-input" id="evtTitleInput" value="${isEdit ? esc(event.title) : ''}" placeholder="Event title…" autocomplete="off" />
    <div class="tpop-form-rows">
      <div class="tpop-row">
        <span class="tpop-label">Date</span>
        <input type="date" class="tpop-field-input" id="evtDateInput" value="${dateVal}" />
      </div>
      <div class="tpop-row">
        <span class="tpop-label">Time</span>
        <input type="time" class="tpop-field-input" id="evtTimeInput" value="${isEdit && event.time ? event.time : ''}" />
      </div>
      <div class="tpop-row">
        <span class="tpop-label">Duration (min)</span>
        <input type="number" class="tpop-field-input" id="evtDurationInput" value="${isEdit && event.duration ? event.duration : ''}" placeholder="e.g. 60" min="1" style="width:100px" />
      </div>
      <div class="tpop-row" style="align-items:flex-start">
        <span class="tpop-label" style="padding-top:6px">Notes</span>
        <textarea class="tpop-field-input" id="evtNotesInput" placeholder="Optional notes…" rows="3" style="resize:vertical;min-height:60px">${isEdit && event.notes ? esc(event.notes) : ''}</textarea>
      </div>
    </div>
    <div class="task-popup-actions">
      ${isEdit ? `<button class="btn-delete" id="evtDeleteBtn">Delete</button>` : ''}
      <button class="btn-cancel" id="evtCancelBtn">${isEdit ? 'Cancel' : 'Cancel'}</button>
      <button class="btn-add-confirm" id="evtSaveBtn">${isEdit ? 'Save' : 'Add Event'}</button>
    </div>
  `;

  overlay.style.display = 'flex';
  setTimeout(() => popup.querySelector('#evtTitleInput')?.focus(), 50);

  popup.querySelector('#evtFormClose').addEventListener('click', closeEventPopup);
  popup.querySelector('#evtCancelBtn').addEventListener('click', () => {
    if (isEdit) _renderEventView(event);
    else closeEventPopup();
  });

  if (isEdit) {
    popup.querySelector('#evtDeleteBtn').addEventListener('click', () => {
      const snapshot = [...getEvents()];
      setEvents(getEvents().filter(e => e.id !== event.id));
      persistEvents();
      closeEventPopup();
      showUndoToast(`"${event.title}" deleted`, () => {
        setEvents(snapshot);
        persistEvents();
        _refreshAll();
      });
      _refreshAll();
    });
  }

  popup.querySelector('#evtSaveBtn').addEventListener('click', () => {
    const title = popup.querySelector('#evtTitleInput').value.trim();
    if (!title) return;
    const date     = popup.querySelector('#evtDateInput').value || null;
    const time     = popup.querySelector('#evtTimeInput').value || null;
    const duration = parseInt(popup.querySelector('#evtDurationInput').value) || null;
    const notes    = popup.querySelector('#evtNotesInput').value.trim() || null;

    if (isEdit) {
      event.title    = title;
      event.date     = date;
      event.time     = time;
      event.duration = duration;
      event.notes    = notes;
      persistEvents();
      _renderEventView(event);
    } else {
      const newEvent = { id: uid(), title, date, time, duration, notes, createdAt: Date.now() };
      getEvents().push(newEvent);
      persistEvents();
      closeEventPopup();
    }
    _refreshAll();
  });

  popup.querySelector('#evtTitleInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') popup.querySelector('#evtSaveBtn').click();
    if (e.key === 'Escape') closeEventPopup();
  });
}
