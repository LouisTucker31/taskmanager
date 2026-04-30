import { MONTH_NAMES, TAG_COLORS, TAG_COLORS_DARK } from '../modules/constants.js';
import { getTasks, getTagColorIndex } from '../modules/state.js';
import { dateToStr } from '../modules/utils.js';
import { openTaskPopup } from '../components/modal.js';
import { openAddFromCal } from '../components/modal.js';

const calToday = new Date();
let calYear  = calToday.getFullYear();
let calMonth = calToday.getMonth();

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

  // advance past range start without exceeding end
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

  // Build date range for the full grid (including prev/next month padding cells)
  const gridStart = dateToStr(new Date(calYear, calMonth, 1 - startDow));
  const gridEnd   = dateToStr(new Date(calYear, calMonth, daysInMonth + (totalCells - startDow - daysInMonth)));

  const tasksByDate = {};

  function _addToDate(ds, entry) {
    if (ds < gridStart || ds > gridEnd) return;
    if (!tasksByDate[ds]) tasksByDate[ds] = [];
    tasksByDate[ds].push(entry);
  }

  getTasks().filter(t => t.status !== 'complete' && t.status !== 'canceled').forEach(t => {
    if (!t.due) return;
    if (t.recurrence) {
      // Virtual occurrences — show on every recurrence date in the visible grid
      getRecurringOccurrences(t, gridStart, gridEnd).forEach(ds => {
        _addToDate(ds, { ...t, _virtualDate: ds });
      });
    } else if (t.endDate && t.endDate > t.due) {
      // Multi-day task — show chip on every day from due to endDate
      const [sy, sm, sd] = t.due.split('-').map(Number);
      let cur = new Date(sy, sm - 1, sd);
      const last = new Date(t.endDate + 'T00:00:00');
      while (cur <= last) {
        _addToDate(dateToStr(cur), t);
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      _addToDate(t.due, t);
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
    cellTasks.slice(0, 3).forEach(t => _appendChip(cell, t));

    if (cellTasks.length > 3) {
      const more = document.createElement('div');
      more.className = 'cal-task-more';
      more.textContent = `+${cellTasks.length - 3} more`;
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        more.remove();
        cellTasks.slice(3).forEach(t => _appendChip(cell, t));
      });
      cell.appendChild(more);
    }

    cell.addEventListener('click', () => openAddFromCal(dateStr));
    grid.appendChild(cell);
  }
}

function _appendChip(cell, t) {
  const chip = document.createElement('div');
  const dateForOverdue = t._virtualDate || t.due;
  const isOverdue = dateForOverdue < dateToStr(calToday) && t.status !== 'complete' && t.status !== 'canceled';
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  const palette = isDark ? TAG_COLORS_DARK : TAG_COLORS;
  const idx = t.tags.length > 0 ? getTagColorIndex(t.tags[0]) : null;
  chip.className = `cal-task-chip status-${t.status}${isOverdue ? ' overdue' : ''}${t.recurrence ? ' recur' : ''}`;
  if (idx !== null) chip.style.cssText = `background:${palette[idx % palette.length].bg};color:${palette[idx % palette.length].text};`;
  chip.textContent = t.name;
  // Always open the real task (strip virtual wrapper)
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
