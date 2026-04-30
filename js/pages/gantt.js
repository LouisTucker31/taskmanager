import { STATUSES, PRIORITY_META } from '../modules/constants.js';
import { getTasks, getTagColor } from '../modules/state.js';
import { dateToStr } from '../modules/utils.js';
import { openTaskPopup, openAddFromCal } from '../components/modal.js';

// Status dot colours keyed by status key
const STATUS_COLORS = {
  todo:       '#94a3b8',
  planned:    '#818cf8',
  inprogress: '#6366f1',
  updatereq:  '#f59e0b',
  onhold:     '#f97316',
  complete:   '#22c55e',
  canceled:   '#d1d5db',
};

// Bar fill colours (slightly richer than dot colours)
const BAR_COLORS = {
  todo:       '#94a3b8',
  planned:    '#818cf8',
  inprogress: '#6366f1',
  updatereq:  '#f59e0b',
  onhold:     '#f97316',
  complete:   '#22c55e',
  canceled:   '#cbd5e1',
};


function _barColors(task) {
  if (task.tags && task.tags.length) {
    const c = getTagColor(task.tags[0]);
    return { bg: c.bg, text: c.text };
  }
  return { bg: BAR_COLORS[task.status] || '#94a3b8', text: '#fff' };
}

let currentRange = 'month';

// ---- helpers ----

function todayStr() {
  return dateToStr(new Date());
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dateToStr(dt);
}

function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return (new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000;
}

// ISO week number
function isoWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const jan4 = new Date(dt.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return Math.floor((dt - startOfWeek1) / 604800000) + 1;
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];


// ---- empty state: hide chart, show placeholder ----

function _setEmptyMode(isEmpty) {
  const chart    = document.getElementById('ganttChart');
  const empty    = document.getElementById('ganttEmptyState');
  const addBtn   = document.getElementById('ganttAddBtn');
  const rangeBtns = document.querySelectorAll('.gantt-range-btn');
  if (chart)  chart.style.display  = isEmpty ? 'none' : '';
  if (empty)  empty.style.display  = isEmpty ? 'flex' : 'none';
  // Add Task button stays visible even when empty
  rangeBtns.forEach(b => b.style.display = isEmpty ? 'none' : '');
}

function _emptyState() { _setEmptyMode(true);  }
function _showChart()   { _setEmptyMode(false); }

// ---- main render ----

export function renderGantt() {
  if (currentRange === 'quarter') { _renderQuarter(); return; }
  if (currentRange === 'month')   { _renderMonth();   return; }

  _renderWeek();
}

function _renderWeek() {
  const container = document.getElementById('ganttBody');
  const headerTimeline = document.getElementById('ganttTimelineHeader');
  const chart = document.getElementById('ganttChart');
  if (!container || !headerTimeline) return;

  container.innerHTML = '';
  headerTimeline.innerHTML = '';
  if (chart) chart.style.removeProperty('--gantt-cell-w');

  const tasksWithDates = getTasks().filter(t => t.due && t.status !== 'complete' && t.status !== 'canceled');

  const today = todayStr();
  const MIN_WEEKS = 12;

  // Snap today back to Monday of its week
  const [ty, tm, td] = today.split('-').map(Number);
  const todayDow = (new Date(ty, tm - 1, td).getDay() + 6) % 7;
  const thisMonday = addDays(today, -todayDow);

  if (tasksWithDates.length === 0) {
    _emptyState();
    return;
  }

  // Find earliest due and latest end/due across all tasks
  let earliest = tasksWithDates.reduce((min, t) => t.due < min ? t.due : min, tasksWithDates[0].due);
  let latest   = tasksWithDates.reduce((max, t) => {
    const end = t.endDate || t.due;
    return end > max ? end : max;
  }, tasksWithDates[0].endDate || tasksWithDates[0].due);

  // Snap earliest back to Monday — but never later than this Monday
  const [ey, em, ed] = earliest.split('-').map(Number);
  const earlyDate = new Date(ey, em - 1, ed);
  const dowEarly = (earlyDate.getDay() + 6) % 7;
  const snapEarliest = addDays(earliest, -dowEarly);
  const rangeStart = snapEarliest < thisMonday ? snapEarliest : thisMonday;

  // Ensure minimum 12 weeks from rangeStart
  const minEnd = addDays(rangeStart, MIN_WEEKS * 7 - 1);
  const rangeEnd = latest > minEnd ? latest : minEnd;

  // Snap rangeEnd forward to Sunday of that week
  const [ly, lm, ld] = rangeEnd.split('-').map(Number);
  const lateDate = new Date(ly, lm - 1, ld);
  const dowLate = (lateDate.getDay() + 6) % 7;
  const snapEnd = addDays(rangeEnd, 6 - dowLate);

  const totalDays  = daysBetween(rangeStart, snapEnd) + 1;
  const totalWeeks = totalDays / 7;

  // ---- Header: one cell per week ----
  for (let w = 0; w < totalWeeks; w++) {
    const weekStart = addDays(rangeStart, w * 7);
    const cell = document.createElement('div');
    cell.className = 'gantt-day-header gantt-week-header';
    cell.style.flex = '1 0 0';
    cell.textContent = `W${isoWeek(weekStart)}`;
    if (weekStart <= today && today <= addDays(weekStart, 6)) cell.classList.add('gantt-week-current');
    headerTimeline.appendChild(cell);
  }

  _showChart();

  // ---- Today stripe: positioned as % across the full range ----
  const todayPct = (daysBetween(rangeStart, today) / totalDays) * 100;

  // ---- Rows ----
  tasksWithDates.forEach(task => {
    // Snap start back to Monday of its week
    const [sy, sm, sd] = task.due.split('-').map(Number);
    const dowStart = (new Date(sy, sm - 1, sd).getDay() + 6) % 7;
    const weekStart = addDays(task.due, -dowStart);
    // Snap end forward to Sunday of the end week
    const rawEnd = task.endDate || task.due;
    const [ey, em, ed] = rawEnd.split('-').map(Number);
    const dowEnd = (new Date(ey, em - 1, ed).getDay() + 6) % 7;
    const weekEnd = addDays(rawEnd, 6 - dowEnd);

    const startPct = Math.max(0, (daysBetween(rangeStart, weekStart) / totalDays) * 100);
    const endPct   = Math.min(100, ((daysBetween(rangeStart, weekEnd) + 1) / totalDays) * 100);
    const widthPct = endPct - startPct;

    const row = document.createElement('div');
    row.className = 'gantt-row gantt-segment-row';

    // Label
    const label = document.createElement('div');
    label.className = 'gantt-row-label';
    label.title = task.name;
    const dot = document.createElement('span');
    dot.className = 'gantt-row-status-dot';
    dot.style.background = STATUS_COLORS[task.status] || '#94a3b8';
    const isDone = task.status === 'complete' || task.status === 'canceled';
    const nameEl = document.createElement('span');
    nameEl.className = 'gantt-row-name' + (isDone ? ' strikethrough' : '');
    nameEl.textContent = task.name;
    label.appendChild(dot);
    label.appendChild(nameEl);
    label.addEventListener('click', () => openTaskPopup(task));
    row.appendChild(label);

    // Timeline
    const timeline = document.createElement('div');
    timeline.className = 'gantt-fixed-timeline';

    // Today stripe
    if (todayPct >= 0 && todayPct <= 100) {
      const stripe = document.createElement('div');
      stripe.className = 'gantt-today-line';
      stripe.style.left  = `${(Math.floor(daysBetween(rangeStart, today) / 7) / totalWeeks) * 100}%`;
      stripe.style.width = `${(1 / totalWeeks) * 100}%`;
      timeline.appendChild(stripe);
    }

    // Bar — always at least one full week wide
    const bc = _barColors(task);
    const bar = document.createElement('div');
    bar.className = 'gantt-bar gantt-fixed-bar';
    bar.style.background = bc.bg;
    bar.style.color = bc.text;
    bar.style.left  = `calc(${startPct}% + 3px)`;
    bar.style.width = `calc(${widthPct}% - 6px)`;
    bar.textContent = task.name;
    bar.title = task.name;
    bar.addEventListener('click', () => openTaskPopup(task));
    timeline.appendChild(bar);

    row.appendChild(timeline);
    container.appendChild(row);
  });
  _appendGridOverlay(container, totalWeeks);
}

function _appendGridOverlay(container, cols) {
  const overlay = document.createElement('div');
  overlay.className = 'gantt-grid-overlay';

  // Divider between label column and timeline
  const labelLine = document.createElement('div');
  labelLine.className = 'gantt-grid-overlay-line';
  labelLine.style.left = '200px';
  overlay.appendChild(labelLine);

  // Inter-column lines within the timeline area
  for (let i = 1; i < cols; i++) {
    const line = document.createElement('div');
    line.className = 'gantt-grid-overlay-line';
    line.style.left = `calc(200px + (100% - 200px) * ${i} / ${cols})`;
    overlay.appendChild(line);
  }
  container.appendChild(overlay);
}

// ---- Quarter view ----

function _quarterOf(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return { year: y, q: Math.ceil(m / 3) };
}

// Shared helper: render a fixed-column view (month = 12 cols, quarter = 4 cols)
function _renderFixedCols({ cols, headerClass, headerLabels, colOf, totalCols }) {
  const container = document.getElementById('ganttBody');
  const headerTimeline = document.getElementById('ganttTimelineHeader');
  const chart = document.getElementById('ganttChart');
  if (!container || !headerTimeline) return;

  container.innerHTML = '';
  headerTimeline.innerHTML = '';
  if (chart) chart.style.removeProperty('--gantt-cell-w');

  // Header
  headerLabels.forEach(label => {
    const cell = document.createElement('div');
    cell.className = `gantt-day-header ${headerClass}`;
    cell.textContent = label;
    headerTimeline.appendChild(cell);
  });

  const year = new Date().getFullYear();
  const allTasks = getTasks().filter(t => t.due && t.status !== 'complete' && t.status !== 'canceled');
  const yearTasks = allTasks.filter(t => t.due.startsWith(String(year)));

  if (yearTasks.length === 0) { _emptyState(); return; }

  _showChart();
  yearTasks.forEach(task => {
    const startCol = colOf(task.due);
    const endCol   = task.endDate ? Math.min(totalCols - 1, colOf(task.endDate)) : startCol;

    const row = document.createElement('div');
    row.className = 'gantt-row gantt-segment-row';

    // Label
    const label = document.createElement('div');
    label.className = 'gantt-row-label';
    label.title = task.name;
    const dot = document.createElement('span');
    dot.className = 'gantt-row-status-dot';
    dot.style.background = STATUS_COLORS[task.status] || '#94a3b8';
    const isDone = task.status === 'complete' || task.status === 'canceled';
    const nameEl = document.createElement('span');
    nameEl.className = 'gantt-row-name' + (isDone ? ' strikethrough' : '');
    nameEl.textContent = task.name;
    label.appendChild(dot);
    label.appendChild(nameEl);
    label.addEventListener('click', () => openTaskPopup(task));
    row.appendChild(label);

    // Timeline
    const timeline = document.createElement('div');
    timeline.className = 'gantt-fixed-timeline';

    // One continuous bar
    const leftPct  = (startCol / totalCols) * 100;
    const widthPct = ((endCol - startCol + 1) / totalCols) * 100;

    const bc = _barColors(task);
    const bar = document.createElement('div');
    bar.className = 'gantt-bar gantt-fixed-bar';
    bar.style.background = bc.bg;
    bar.style.color = bc.text;
    bar.style.left  = `calc(${leftPct}% + 5px)`;
    bar.style.width = `calc(${widthPct}% - 10px)`;
    bar.textContent = task.name;
    bar.title = task.name;
    bar.addEventListener('click', () => openTaskPopup(task));
    timeline.appendChild(bar);

    row.appendChild(timeline);
    container.appendChild(row);
  });
  _appendGridOverlay(container, totalCols);
}

function _renderMonth() {
  _renderFixedCols({
    totalCols:    12,
    headerClass:  'gantt-month-header',
    headerLabels: MONTHS_SHORT,
    colOf: (dateStr) => { const [,m] = dateStr.split('-').map(Number); return m - 1; },
  });
}

function _renderQuarter() {
  const year = new Date().getFullYear();
  _renderFixedCols({
    totalCols:    4,
    headerClass:  'gantt-quarter-header',
    headerLabels: [`Q1 ${year}`, `Q2 ${year}`, `Q3 ${year}`, `Q4 ${year}`],
    colOf: (dateStr) => { const [,m] = dateStr.split('-').map(Number); return Math.ceil(m / 3) - 1; },
  });
}

// ---- Init (called once from main.js) ----

export function initGanttPage() {
  const addBtn = document.getElementById('ganttAddBtn');
  if (addBtn) addBtn.addEventListener('click', () => openAddFromCal(dateToStr(new Date())));

  document.querySelectorAll('.gantt-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentRange = btn.dataset.range;
      document.querySelectorAll('.gantt-range-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.range === currentRange)
      );
      renderGantt();
    });
  });

}
