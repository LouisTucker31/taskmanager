import { initTasks, initExpanded, initTagColors, initEvents } from './modules/state.js';
import { loadTheme, saveTheme, loadPage, savePage } from './modules/storage.js';
import { renderTasks, initTasksPage } from './pages/tasks.js';
import { renderBoard, initBoardPage } from './pages/board.js';
import { renderCalendar, initCalendarPage } from './pages/calendar.js';
import { renderGantt, initGanttPage } from './pages/gantt.js';
import { initModalKeyboard } from './components/modal.js';

// ---- Theme ----

function applyTheme(dark) {
  document.body.setAttribute('data-theme', dark ? 'dark' : 'light');
  saveTheme(dark ? 'dark' : 'light');
  const label = document.getElementById('darkModeLabel');
  if (label) label.textContent = dark ? 'Light Mode' : 'Dark Mode';
}

// ---- Page navigation ----

let currentPage = loadPage();

// Allow other modules to trigger navigation without circular imports
document.addEventListener('app:switchPage', (e) => switchPage(e.detail));

export function switchPage(page) {
  currentPage = page;
  savePage(page);
  document.querySelectorAll('.nav-item[data-page]').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });
  document.getElementById('pageTasks').style.display    = page === 'tasks'    ? 'flex'  : 'none';
  document.getElementById('pageCalendar').style.display = page === 'calendar' ? 'flex'  : 'none';
  document.getElementById('pageBoard').style.display    = page === 'board'    ? 'flex'  : 'none';
  document.getElementById('pageGantt').style.display    = page === 'gantt'    ? 'flex'  : 'none';
  if (page === 'calendar') renderCalendar();
  if (page === 'board')    renderBoard();
  if (page === 'gantt')    renderGantt();
}

// ---- Init ----

initTasks();
initExpanded();
initTagColors();
initEvents();

applyTheme(loadTheme() === 'dark');

document.getElementById('darkModeToggle').addEventListener('click', () => {
  applyTheme(document.body.getAttribute('data-theme') !== 'dark');
});

document.querySelectorAll('.nav-item[data-page]').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    switchPage(item.dataset.page);
  });
});

initTasksPage();
initCalendarPage();
initBoardPage();
initGanttPage();
initModalKeyboard();

renderTasks();
switchPage(currentPage);
