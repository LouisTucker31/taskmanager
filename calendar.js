/* =============================================
   GDAK Task Manager — calendar.js
   ============================================= */

// ---- PAGE NAVIGATION ----

let currentPage = localStorage.getItem('gdak_page') || 'tasks';

document.querySelectorAll('.nav-item[data-page]').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    switchPage(item.dataset.page);
  });
});

function switchPage(page) {
  currentPage = page;
  localStorage.setItem('gdak_page', page);
  document.querySelectorAll('.nav-item[data-page]').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });
  document.getElementById('pageTasks').style.display    = page === 'tasks'    ? 'block' : 'none';
  document.getElementById('pageCalendar').style.display = page === 'calendar' ? 'block' : 'none';
  if (page === 'calendar') renderCalendar();
}

// Restore last page — both pages start hidden via CSS, this reveals the right one
window.addEventListener('load', () => switchPage(currentPage));

// ---- CALENDAR STATE ----

const calToday = new Date();
let calYear  = calToday.getFullYear();
let calMonth = calToday.getMonth();

document.getElementById('calPrev').addEventListener('click', () => {
  calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
});
document.getElementById('calNext').addEventListener('click', () => {
  calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
});
document.getElementById('calTodayBtn').addEventListener('click', () => {
  calYear = calToday.getFullYear(); calMonth = calToday.getMonth();
  renderCalendar();
});

// ---- RENDER CALENDAR ----

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

function dateToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function renderCalendar() {
  document.getElementById('calMonthTitle').textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  const firstDay = new Date(calYear, calMonth, 1);
  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1; // Mon=0

  const daysInMonth    = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate();
  const todayStr = dateToStr(calToday);
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

  const tasksByDate = {};
  tasks.forEach(t => {
    if (t.due) {
      if (!tasksByDate[t.due]) tasksByDate[t.due] = [];
      tasksByDate[t.due].push(t);
    }
  });

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell';

    let day, dateStr, isCurrentMonth = true;

    if (i < startDow) {
      day = daysInPrevMonth - startDow + i + 1;
      const m = calMonth === 0 ? 11 : calMonth - 1;
      const y = calMonth === 0 ? calYear - 1 : calYear;
      dateStr = dateToStr(new Date(y, m, day));
      isCurrentMonth = false;
    } else if (i >= startDow + daysInMonth) {
      day = i - startDow - daysInMonth + 1;
      const m = calMonth === 11 ? 0 : calMonth + 1;
      const y = calMonth === 11 ? calYear + 1 : calYear;
      dateStr = dateToStr(new Date(y, m, day));
      isCurrentMonth = false;
    } else {
      day = i - startDow + 1;
      dateStr = dateToStr(new Date(calYear, calMonth, day));
    }

    if (!isCurrentMonth) cell.classList.add('cal-cell-muted');
    if (dateStr === todayStr) cell.classList.add('cal-cell-today');

    const dayNum = document.createElement('div');
    dayNum.className = 'cal-day-num';
    dayNum.textContent = day;
    cell.appendChild(dayNum);

    const cellTasks = tasksByDate[dateStr] || [];
    cellTasks.slice(0, 3).forEach(t => {
      const chip = document.createElement('div');
      const isOverdue = t.due < dateToStr(calToday)
        && t.status !== 'complete'
        && t.status !== 'canceled';
      const chipColorIdx = t.tags.length > 0 ? getTagColorIndex(t.tags[0]) : null;
const isDarkTheme = document.body.getAttribute('data-theme') === 'dark';
const chipPalette = isDarkTheme ? TAG_COLORS_DARK : TAG_COLORS;
const chipStyle = chipColorIdx !== null ? `background:${chipPalette[chipColorIdx % chipPalette.length].bg};color:${chipPalette[chipColorIdx % chipPalette.length].text};` : '';
chip.className = `cal-task-chip${isOverdue ? ' overdue' : ''}`;
chip.style.cssText = chipStyle;
      chip.textContent = t.name;
      chip.addEventListener('click', (e) => { e.stopPropagation(); openTaskPopup(t); });
      cell.appendChild(chip);
    });

    if (cellTasks.length > 3) {
      const more = document.createElement('div');
      more.className = 'cal-task-more';
      more.textContent = `+${cellTasks.length - 3} more`;
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        more.remove();
        cellTasks.slice(3).forEach(t => {
          const chip = document.createElement('div');
          const isOverdue = t.due < dateToStr(calToday) && t.status !== 'complete' && t.status !== 'canceled';
          const chipColorIdx = t.tags.length > 0 ? getTagColorIndex(t.tags[0]) : null;
const isDarkTheme = document.body.getAttribute('data-theme') === 'dark';
const chipPalette = isDarkTheme ? TAG_COLORS_DARK : TAG_COLORS;
const chipStyle = chipColorIdx !== null ? `background:${chipPalette[chipColorIdx % chipPalette.length].bg};color:${chipPalette[chipColorIdx % chipPalette.length].text};` : '';
chip.className = `cal-task-chip${isOverdue ? ' overdue' : ''}`;
chip.style.cssText = chipStyle;
          chip.textContent = t.name;
          chip.addEventListener('click', (e) => { e.stopPropagation(); openTaskPopup(t); });
          cell.appendChild(chip);
        });
      });
      cell.appendChild(more);
    }

    cell.addEventListener('click', () => openAddFromCal(dateStr));
    grid.appendChild(cell);
  }
}

// ---- TASK DETAIL POPUP ----

function openTaskPopup(task) {
  renderTaskPopupView(task);
  document.getElementById('taskPopupOverlay').style.display = 'flex';
}

function renderTaskPopupView(task) {
  const fmt    = formatDate(task.due);
  const meta   = PRIORITY_META[task.priority] || PRIORITY_META.none;
  const status = STATUSES.find(s => s.key === task.status);

  document.getElementById('taskPopupContent').innerHTML = `
    <div class="tpop-status badge-${task.status}"><span class="badge-dot"></span>${status ? status.label : ''}</div>
    <h2 class="tpop-name">${esc(task.name)}</h2>
    <div class="tpop-meta">
      <div class="tpop-row"><span class="tpop-label">Due</span><span class="tpop-value ${fmt.cls||''}">${fmt.text}</span></div>
      <div class="tpop-row"><span class="tpop-label">Priority</span><span class="tpop-value">${meta.label}</span></div>
      ${task.tags.length ? `<div class="tpop-row"><span class="tpop-label">Tags</span><span class="tpop-value">${task.tags.join(', ')}</span></div>` : ''}
    </div>
    <div class="tpop-actions">
      <button class="tpop-edit-btn" data-id="${task.id}">Edit</button>
      <button class="tpop-goto-btn" data-id="${task.id}">View in My Tasks</button>
    </div>
  `;

  document.querySelector('.tpop-edit-btn').addEventListener('click', () => {
    renderTaskPopupEdit(task);
  });

  document.querySelector('.tpop-goto-btn').addEventListener('click', () => {
    closeTaskPopup();
    switchPage('tasks');
    expandedSections[task.status] = true;
    saveExpanded();
    render();
    setTimeout(() => {
      const row = document.querySelector(`.task-row[data-id="${task.id}"]`);
      if (row) {
        row.classList.add('row-highlight');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => row.classList.remove('row-highlight'), 1500);
      }
    }, 80);
  });
}

function renderTaskPopupEdit(task) {
  let editStatus   = task.status;
  let editPriority = task.priority || 'none';
  let editDue      = task.due || '';

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function dueBtnLabel(d) {
    if (!d) return '—';
    const [y,m,dd] = d.split('-').map(Number);
    return `${dd} ${months[m-1]} ${y}`;
  }

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
        <input type="text" class="tpop-field-input" id="editTagInput" value="${task.tags.join(' ')}" placeholder="tag" autocomplete="off" />
      </div>
      <div class="tpop-row">
        <span class="tpop-label">Priority</span>
        <div class="tpop-field-btn-wrap">
          <button class="tpop-field-btn" id="editPriorityBtn">${(PRIORITY_META[editPriority]||PRIORITY_META.none).label}</button>
          <div class="tpop-form-status-dd" id="editPriorityDd" style="display:none">
            ${Object.entries(PRIORITY_META).map(([k,v])=>`<div class="tpop-form-dd-item" data-priority="${k}">${k!=='none'?`<svg class="flag-svg ${k}" viewBox="0 0 12 14" fill="none"><line x1="2.5" y1="1" x2="2.5" y2="13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2.5 1.5 L10.5 1.5 L8.5 5 L10.5 8.5 L2.5 8.5 Z" fill="currentColor"/></svg>`:'<span style="width:14px;display:inline-block"></span>'} ${v.label}</div>`).join('')}
          </div>
        </div>
      </div>
      <div class="tpop-row">
        <span class="tpop-label">Due</span>
        <div class="tpop-field-btn-wrap">
          <button class="tpop-field-btn" id="editDueBtn">${dueBtnLabel(editDue)}</button>
          <input type="date" id="editDueInput" value="${editDue}" style="position:absolute;opacity:0;width:0;height:0;pointer-events:none" />
        </div>
      </div>
    </div>
    <div class="task-popup-actions">
      <button class="btn-cancel" id="editCancelBtn">Cancel</button>
      <button class="btn-add-confirm" id="editSaveBtn">Save</button>
    </div>
  `;

  const content = document.getElementById('taskPopupContent');

  // Cancel → back to view
  content.querySelector('#editCancelBtn').addEventListener('click', () => renderTaskPopupView(task));

  // Status
  const statusBtn = content.querySelector('#editStatusBtn');
  const statusDd  = content.querySelector('#editStatusDd');
  statusBtn.addEventListener('click', (e) => { e.stopPropagation(); statusDd.style.display = statusDd.style.display === 'none' ? 'block' : 'none'; });
  statusDd.querySelectorAll('.tpop-form-dd-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      editStatus = item.dataset.status;
      content.querySelector('#editStatusRing').className = `status-ring ${editStatus}`;
      content.querySelector('#editStatusLabel').textContent = STATUSES.find(s=>s.key===editStatus)?.label || editStatus;
      statusDd.style.display = 'none';
    });
  });

  // Priority
  const priBtn = content.querySelector('#editPriorityBtn');
  const priDd  = content.querySelector('#editPriorityDd');
  priBtn.addEventListener('click', (e) => { e.stopPropagation(); priDd.style.display = priDd.style.display === 'none' ? 'block' : 'none'; });
  priDd.querySelectorAll('.tpop-form-dd-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      editPriority = item.dataset.priority;
      priBtn.textContent = (PRIORITY_META[editPriority]||PRIORITY_META.none).label;
      priDd.style.display = 'none';
    });
  });

  // Due date
  const dueBtn   = content.querySelector('#editDueBtn');
  const dueInput = content.querySelector('#editDueInput');
  dueBtn.addEventListener('click', (e) => { e.stopPropagation(); dueInput.showPicker?.() || dueInput.click(); });
  dueInput.addEventListener('change', () => {
    editDue = dueInput.value || '';
    dueBtn.textContent = dueBtnLabel(editDue);
  });

  // Save
  content.querySelector('#editSaveBtn').addEventListener('click', () => {
    const nameVal = content.querySelector('#editNameInput').value.trim();
    if (!nameVal) return;
    const tagRaw = content.querySelector('#editTagInput').value.trim();
    task.name     = nameVal;
    task.tags     = tagRaw ? tagRaw.split(/\s+/).map(t=>t.replace(/^#+/,'').toLowerCase()).filter(Boolean) : [];
    task.priority = editPriority;
    task.due      = editDue || null;
    task.status   = editStatus;
    saveTasks();
    expandedSections[task.status] = true;
    saveExpanded();
    render();
    renderCalendar();
    renderTaskPopupView(task);
  });

  // Close dropdowns on outside click inside popup
  content.addEventListener('click', () => {
    statusDd.style.display = 'none';
    priDd.style.display    = 'none';
  });
}

function closeTaskPopup() {
  document.getElementById('taskPopupOverlay').style.display = 'none';
}

document.getElementById('taskPopupClose').addEventListener('click', closeTaskPopup);
document.getElementById('taskPopupOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeTaskPopup();
});

// ---- ADD FROM CALENDAR ----

let pendingCalDate = null;

// Add form state
let addCalStatus   = 'todo';
let addCalPriority = 'none';
let addCalDue      = null;

function openAddFromCal(dateStr) {
  pendingCalDate = dateStr;
  addCalStatus   = 'todo';
  addCalPriority = 'none';
  addCalDue      = dateStr;

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
            ${Object.entries(PRIORITY_META).map(([k,v]) => `<div class="tpop-form-dd-item" data-priority="${k}">${k !== 'none' ? `<svg class="flag-svg ${k}" viewBox="0 0 12 14" fill="none"><line x1="2.5" y1="1" x2="2.5" y2="13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2.5 1.5 L10.5 1.5 L8.5 5 L10.5 8.5 L2.5 8.5 Z" fill="currentColor"/></svg>` : '<span style="width:14px;display:inline-block"></span>'} ${v.label}</div>`).join('')}
          </div>
        </div>
      </div>
      <div class="tpop-row">
        <span class="tpop-label">Due</span>
        <div class="tpop-field-btn-wrap">
          <button class="tpop-field-btn" id="afcDueBtn">${d} ${months[m-1]} ${y}</button>
          <input type="date" id="afcDueInput" value="${dateStr}" style="position:absolute;opacity:0;width:0;height:0;pointer-events:none" />
        </div>
      </div>
    </div>
    <div class="task-popup-actions">
      <button class="btn-cancel" id="addFromCalClose2">Cancel</button>
      <button class="btn-add-confirm" id="addFromCalConfirm">Add Task</button>
    </div>
  `;

  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('afcNameInput').focus(), 50);

  // Close button
  popup.querySelector('#addFromCalClose').addEventListener('click', closeAddFromCal);
  popup.querySelector('#addFromCalClose2').addEventListener('click', closeAddFromCal);

  // Name enter key
  popup.querySelector('#afcNameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmAddFromCal();
    if (e.key === 'Escape') closeAddFromCal();
  });

  // Confirm
  popup.querySelector('#addFromCalConfirm').addEventListener('click', confirmAddFromCal);

  // Status dropdown
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

  // Priority dropdown
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

  // Due date
  const dueBtn   = popup.querySelector('#afcDueBtn');
  const dueInput = popup.querySelector('#afcDueInput');
  dueBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dueInput.showPicker?.() || dueInput.click();
  });
  dueInput.addEventListener('change', () => {
    addCalDue = dueInput.value || null;
    if (addCalDue) {
      const [dy, dm, dd2] = addCalDue.split('-').map(Number);
      const months2 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      dueBtn.textContent = `${dd2} ${months2[dm-1]} ${dy}`;
    } else {
      dueBtn.textContent = '—';
    }
  });

  // Close dropdowns on outside click
  document.addEventListener('click', closeAfcDropdowns);
}

function closeAfcDropdowns() {
  ['afcStatusDd','afcPriorityDd'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function closeAddFromCal() {
  document.getElementById('addFromCalOverlay').style.display = 'none';
  document.removeEventListener('click', closeAfcDropdowns);
  pendingCalDate = null;
}

document.getElementById('addFromCalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeAddFromCal();
});

function confirmAddFromCal() {
  const nameInput = document.getElementById('afcNameInput');
  const raw = nameInput ? nameInput.value.trim() : '';
  if (!raw) return;
  const tagRaw = (document.getElementById('afcTagInput')?.value || '').trim();
  const tags = tagRaw ? tagRaw.split(/\s+/).map(t => t.replace(/^#+/,'').toLowerCase()).filter(Boolean) : parseTags(raw);
  const task = {
    id: uid(),
    name: stripTags(raw) || raw,
    tags,
    priority: addCalPriority,
    due: addCalDue,
    status: addCalStatus,
    createdAt: Date.now(),
  };
  tasks.push(task);
  saveTasks();
  expandedSections[addCalStatus] = true;
  saveExpanded();
  closeAddFromCal();
  renderCalendar();
  render(); // keep My Tasks in sync
}

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}