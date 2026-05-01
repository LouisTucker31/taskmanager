import { MONTH_NAMES, ROW_COLORS } from '../modules/constants.js';
import { getTasks, getTagColorIndex, getEvents, getTaskColorIndex } from '../modules/state.js';
import { dateToStr } from '../modules/utils.js';
import { openTaskPopup, openCalChoice, openEventPopup } from '../components/modal.js';

const calToday = new Date();
let calYear  = calToday.getFullYear();
let calMonth = calToday.getMonth();

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function setCalendarMonth(year, month) {
  calYear  = year;
  calMonth = month;
}

// Returns all dates a recurring task falls on within [rangeStart, rangeEnd] (inclusive, YYYY-MM-DD strings)
function getRecurringOccurrences(task, rangeStart, rangeEnd) {
  if (!task.recurrence || !task.due) return [];
  const results = [];
  const [y, m, d] = task.due.split('-').map(Number);
  let cur = new Date(y, m - 1, d);
  const end = new Date(rangeEnd + 'T00:00:00');
  const start = new Date(rangeStart + 'T00:00:00');
  const taskEnd = task.endDate ? new Date(task.endDate + 'T00:00:00') : null;
  const exceptions = new Set(task.exceptions || []);

  while (cur < start) {
    if (task.recurrence === 'daily')   cur.setDate(cur.getDate() + 1);
    else if (task.recurrence === 'weekly')  cur.setDate(cur.getDate() + 7);
    else if (task.recurrence === 'monthly') cur.setMonth(cur.getMonth() + 1);
    else break;
  }

  let safety = 0;
  while (cur <= end && safety++ < 400) {
    if (taskEnd && cur > taskEnd) break;
    const ds = dateToStr(cur);
    if (!exceptions.has(ds)) results.push(ds);
    if (task.recurrence === 'daily')   cur.setDate(cur.getDate() + 1);
    else if (task.recurrence === 'weekly')  cur.setDate(cur.getDate() + 7);
    else if (task.recurrence === 'monthly') cur.setMonth(cur.getMonth() + 1);
    else break;
  }
  return results;
}

export function renderCalendar() {
  document.getElementById('calMonthTitle').textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  const firstDay  = new Date(calYear, calMonth, 1);
  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;

  const daysInMonth     = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate();
  const todayStr  = dateToStr(calToday);
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
  const numRows = totalCells / 7;

  const gridStart = dateToStr(new Date(calYear, calMonth, 1 - startDow));
  const gridEnd   = dateToStr(new Date(calYear, calMonth, daysInMonth + (totalCells - startDow - daysInMonth)));

  // Map cell index → dateStr
  const cellDates = [];
  for (let i = 0; i < totalCells; i++) {
    let day, dateStr;
    if (i < startDow) {
      day = daysInPrevMonth - startDow + i + 1;
      const m = calMonth === 0 ? 11 : calMonth - 1;
      const y = calMonth === 0 ? calYear - 1 : calYear;
      dateStr = dateToStr(new Date(y, m, day));
    } else if (i >= startDow + daysInMonth) {
      day = i - startDow - daysInMonth + 1;
      const m = calMonth === 11 ? 0 : calMonth + 1;
      const y = calMonth === 11 ? calYear + 1 : calYear;
      dateStr = dateToStr(new Date(y, m, day));
    } else {
      day = i - startDow + 1;
      dateStr = dateToStr(new Date(calYear, calMonth, day));
    }
    cellDates.push({ day, dateStr, isCurrentMonth: i >= startDow && i < startDow + daysInMonth });
  }

  // dateStr → cell index
  const dateToCell = {};
  cellDates.forEach(({ dateStr }, i) => { dateToCell[dateStr] = i; });

  // ---- Separate multi-day spans from single-day entries ----

  // spans: { id, label, startCell, endCell, isEvent, item, color }
  const spans = [];
  // singlesByDate: { dateStr: [item, ...] }
  const singlesByDate = {};

  function _addSingle(ds, entry) {
    if (ds < gridStart || ds > gridEnd) return;
    if (!singlesByDate[ds]) singlesByDate[ds] = [];
    singlesByDate[ds].push(entry);
  }

  function _addSpan(startDs, endDs, item, isEvent) {
    const clampStart = startDs < gridStart ? gridStart : startDs;
    const clampEnd   = endDs   > gridEnd   ? gridEnd   : endDs;
    if (clampStart > clampEnd) return;
    // Split into per-row segments (a span can't visually cross week boundaries)
    let cellA = dateToCell[clampStart];
    const cellB = dateToCell[clampEnd];
    if (cellA === undefined || cellB === undefined) return;
    while (cellA <= cellB) {
      const rowEnd = Math.floor(cellA / 7) * 7 + 6;
      const segEnd = Math.min(cellB, rowEnd);
      spans.push({ startCell: cellA, endCell: segEnd, isEvent, item,
        isSegStart: cellA === dateToCell[clampStart],
        isSegEnd:   segEnd === cellB });
      cellA = rowEnd + 1;
    }
  }

  // Multi-day events → spans, single-day events → singles
  getEvents().forEach(ev => {
    if (!ev.date) return;
    if (ev.endDate && ev.endDate > ev.date) {
      _addSpan(ev.date, ev.endDate, { ...ev, _isEvent: true }, true);
    } else {
      _addSingle(ev.date, { ...ev, _isEvent: true });
    }
  });

  // Tasks: multi-day (endDate) → spans, recurring → singles per occurrence, single-day → singles
  getTasks().filter(t => t.status !== 'complete' && t.status !== 'canceled').forEach(t => {
    if (!t.due) return;
    if (t.recurrence) {
      getRecurringOccurrences(t, gridStart, gridEnd).forEach(ds => {
        _addSingle(ds, { ...t, _virtualDate: ds });
      });
    } else if (t.endDate && t.endDate > t.due) {
      _addSpan(t.due, t.endDate, t, false);
    } else {
      _addSingle(t.due, t);
    }
  });

  // ---- Assign vertical lanes per row for spans ----
  // For each row, greedily assign a lane (0,1,2...) so spans don't overlap
  const spanLanes = spans.map(() => -1);
  for (let row = 0; row < numRows; row++) {
    const rowStart = row * 7;
    const rowEnd   = rowStart + 6;
    const rowSpans = spans.map((s, i) => ({ ...s, i }))
      .filter(s => s.startCell >= rowStart && s.startCell <= rowEnd);
    const laneEnds = []; // laneEnds[lane] = last endCell used in that lane
    rowSpans.forEach(s => {
      let lane = laneEnds.findIndex(end => end < s.startCell);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(s.endCell); }
      else laneEnds[lane] = s.endCell;
      spanLanes[s.i] = lane;
    });
  }

  // ---- Render cells ----
  // Reserve top space per cell for span lanes (each lane = 22px, min 1 lane reserved)
  // We compute max lanes used per row so cells can reserve that space
  const lanesPerRow = Array(numRows).fill(0);
  spans.forEach((s, i) => {
    const row = Math.floor(s.startCell / 7);
    lanesPerRow[row] = Math.max(lanesPerRow[row], (spanLanes[i] ?? 0) + 1);
  });

  const LANE_H = 22; // px per span lane
  const DAY_NUM_H = 28; // px for day number area

  for (let i = 0; i < totalCells; i++) {
    const { day, dateStr, isCurrentMonth } = cellDates[i];
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    cell.dataset.dateStr = dateStr;

    if (!isCurrentMonth) cell.classList.add('cal-cell-muted');
    if (dateStr === todayStr) cell.classList.add('cal-cell-today');

    const row = Math.floor(i / 7);
    const reservedH = DAY_NUM_H + lanesPerRow[row] * LANE_H;
    cell.style.paddingTop = `${reservedH}px`;

    const dayNum = document.createElement('div');
    dayNum.className = 'cal-day-num';
    dayNum.textContent = day;
    cell.appendChild(dayNum);

    const singles = singlesByDate[dateStr] || [];
    singles.slice(0, 3).forEach(t => _appendChip(cell, t));

    if (singles.length > 3) {
      const more = document.createElement('div');
      more.className = 'cal-task-more';
      more.textContent = `+${singles.length - 3} more`;
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        _openDayPopup(cell, dateStr, singles);
      });
      cell.appendChild(more);
    }

    cell.addEventListener('click', () => openCalChoice(dateStr));
    grid.appendChild(cell);
  }

  // ---- Render span bars as overlay inside grid ----
  // The grid is position:relative; bars are absolute, positioned by %
  spans.forEach((s, i) => {
    const lane = spanLanes[i] ?? 0;
    const row  = Math.floor(s.startCell / 7);
    const col  = s.startCell % 7;
    const spanCols = s.endCell - s.startCell + 1;

    const bar = document.createElement('div');
    bar.className = 'cal-span-bar' + (s.isEvent ? ' cal-span-event' : ' cal-span-task');
    if (s.isSegStart) bar.classList.add('seg-start');
    if (s.isSegEnd)   bar.classList.add('seg-end');

    // Apply colour — events full opacity, tasks semi-transparent
    {
      const item = s.item;
      if (s.isEvent) {
        const colorIdx = (item.color !== undefined && item.color !== null) ? item.color : 6;
        const hex = ROW_COLORS[colorIdx % ROW_COLORS.length];
        bar.style.background = hex;
        bar.style.color = '#fff';
      } else {
        const hex = ROW_COLORS[getTaskColorIndex(item) % ROW_COLORS.length];
        bar.style.background = hexToRgba(hex, 0.25);
        bar.style.color = hex;
      }
    }

    // Position: left/width as % of grid width, top as px within the row
    const pct = (v) => `${(v / 7) * 100}%`;
    bar.style.left   = pct(col);
    bar.style.width  = `calc(${pct(spanCols)} - 4px)`;
    bar.style.top    = `calc(${(row / numRows) * 100}% + ${DAY_NUM_H + lane * LANE_H}px)`;
    bar.style.height = `${LANE_H - 3}px`;

    // Label only on segment start
    if (s.isSegStart) {
      const label = document.createElement('span');
      label.className = 'cal-span-label';
      if (s.isEvent) {
        const timePrefix = (!s.item.allDay && s.item.startTime) ? s.item.startTime.slice(0,5) + ' ' : '';
        label.textContent = timePrefix + (s.item.title || '');
      } else {
        label.textContent = s.item.name || '';
      }
      bar.appendChild(label);
    }

    bar.addEventListener('click', (e) => {
      e.stopPropagation();
      if (s.isEvent) {
        const realEvent = getEvents().find(ev => ev.id === s.item.id) || s.item;
        openEventPopup(realEvent);
      } else {
        const realTask = getTasks().find(r => r.id === s.item.id) || s.item;
        openTaskPopup(realTask, s.item._virtualDate);
      }
    });

    grid.appendChild(bar);
  });
}

function _openDayPopup(cell, dateStr, items) {
  document.querySelector('.cal-day-popup')?.remove();

  const [y, m, d] = dateStr.split('-').map(Number);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const label = `${d} ${MONTHS[m-1]} ${y}`;

  const popup = document.createElement('div');
  popup.className = 'cal-day-popup';

  const header = document.createElement('div');
  header.className = 'cal-day-popup-header';
  header.innerHTML = `<span class="cal-day-popup-date">${label}</span><button class="cal-day-popup-close">&times;</button>`;
  popup.appendChild(header);

  const list = document.createElement('div');
  list.className = 'cal-day-popup-list';

  items.forEach(t => {
    const item = document.createElement('div');
    item.className = 'cal-day-popup-item';

    if (t._isEvent) {
      const evColorIdx = (t.color !== undefined && t.color !== null) ? t.color : 6;
      const evHex = ROW_COLORS[evColorIdx % ROW_COLORS.length];
      item.style.borderLeftColor = evHex;
      const timePrefix = (!t.allDay && t.startTime) ? `<span class="cal-day-popup-time">${t.startTime.slice(0,5)}</span>` : '';
      item.innerHTML = `${timePrefix}<span class="cal-day-popup-title">${t.title || ''}</span>`;
      const realEvent = getEvents().find(e => e.id === t.id) || t;
      item.addEventListener('click', () => { popup.remove(); openEventPopup(realEvent); });
    } else {
      const hex = ROW_COLORS[getTaskColorIndex(t) % ROW_COLORS.length];
      item.style.borderLeftColor = hexToRgba(hex, 0.6);
      item.innerHTML = `<span class="cal-day-popup-title">${t.name || ''}</span>`;
      const realTask = getTasks().find(r => r.id === t.id) || t;
      item.addEventListener('click', () => { popup.remove(); openTaskPopup(realTask, t._virtualDate); });
    }

    list.appendChild(item);
  });

  popup.appendChild(list);

  // Position anchored to the cell
  document.body.appendChild(popup);
  const cellRect = cell.getBoundingClientRect();
  const popupW = 220;
  const popupH = popup.offsetHeight;
  let left = cellRect.left + window.scrollX;
  let top  = cellRect.bottom + 4 + window.scrollY;

  if (left + popupW > window.innerWidth - 8) left = window.innerWidth - popupW - 8;
  if (top + popupH > window.innerHeight - 8) top = cellRect.top - popupH - 4 + window.scrollY;

  popup.style.left = `${left}px`;
  popup.style.top  = `${top}px`;

  header.querySelector('.cal-day-popup-close').addEventListener('click', (e) => {
    e.stopPropagation();
    popup.remove();
  });

  const dismiss = (e) => {
    if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', dismiss); }
  };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}

function _appendChip(cell, t) {
  const chip = document.createElement('div');

  if (t._isEvent) {
    chip.className = 'cal-task-chip cal-event-chip';
    const timePrefix = (!t.allDay && t.startTime) ? t.startTime.slice(0,5) + ' ' : '';
    chip.textContent = timePrefix + (t.title || '');
    const evColorIdx = (t.color !== undefined && t.color !== null) ? t.color : 6;
    const evHex = ROW_COLORS[evColorIdx % ROW_COLORS.length];
    chip.style.background = evHex;
    chip.style.color = '#fff';
    const realEvent = getEvents().find(e => e.id === t.id) || t;
    chip.addEventListener('click', (e) => { e.stopPropagation(); openEventPopup(realEvent); });
    cell.appendChild(chip);
    return;
  }

  const dateForOverdue = t._virtualDate || t.due;
  const isOverdue = dateForOverdue < dateToStr(calToday) && t.status !== 'complete' && t.status !== 'canceled';
  chip.className = `cal-task-chip status-${t.status}${isOverdue ? ' overdue' : ''}${t.recurrence ? ' recur' : ''}`;
  {
    const hex = ROW_COLORS[getTaskColorIndex(t) % ROW_COLORS.length];
    chip.style.background = hexToRgba(hex, 0.25);
    chip.style.color = hex;
  }
  chip.textContent = t.name;
  const realTask = getTasks().find(r => r.id === t.id) || t;
  chip.addEventListener('click', (e) => { e.stopPropagation(); openTaskPopup(realTask, t._virtualDate); });
  cell.appendChild(chip);
}

export function initCalendarPage() {
  document.getElementById('calPrev').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });
  document.getElementById('calNext').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });
  document.getElementById('calTodayBtn').addEventListener('click', () => {
    calYear  = calToday.getFullYear();
    calMonth = calToday.getMonth();
    renderCalendar();
  });
}
