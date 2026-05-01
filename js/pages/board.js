import { STATUSES, PRIORITY_META, FLAG_SVG } from '../modules/constants.js';
import { getTasks, tagPillStyle, getBoardGroupBy, setBoardGroupBy } from '../modules/state.js';
import { formatDate, dateToStr } from '../modules/utils.js';
import { openTaskPopup, openAddFromCal } from '../components/modal.js';

export function renderBoard() {
  const container = document.getElementById('boardColumns');
  container.innerHTML = '';

  const allTasks = getTasks().filter(t => t.status !== 'complete' && t.status !== 'canceled');
  const hasAny = allTasks.length > 0;

  const emptyState = document.getElementById('boardEmptyState');
  if (emptyState) emptyState.style.display = hasAny ? 'none' : 'flex';
  container.style.display = hasAny ? '' : 'none';

  if (!hasAny) return;

  const groupBy = getBoardGroupBy();

  if (groupBy === 'status') {
    _renderByStatus(container, allTasks);
  } else if (groupBy === 'tag') {
    _renderByTag(container, allTasks);
  } else if (groupBy === 'priority') {
    _renderByPriority(container, allTasks);
  } else if (groupBy === 'due') {
    _renderByDue(container, allTasks);
  }
}

function _buildCol(headerHtml, tasks) {
  const col = document.createElement('div');
  col.className = 'board-col';

  const header = document.createElement('div');
  header.className = 'board-col-header';
  header.innerHTML = `
    <span class="board-col-header-label">${headerHtml}</span>
    <span class="board-col-count">${tasks.length}</span>
  `;
  col.appendChild(header);

  const cardList = document.createElement('div');
  cardList.className = 'board-card-list';
  tasks.forEach(task => cardList.appendChild(_buildCard(task)));
  col.appendChild(cardList);

  return col;
}

function _buildCard(task) {
  const card = document.createElement('div');
  card.className = 'board-card';
  card.dataset.id = task.id;

  const isDone = task.status === 'complete' || task.status === 'canceled';
  const fmt = task.due ? formatDate(task.due) : null;

  const nameEl = document.createElement('div');
  nameEl.className = 'board-card-name' + (isDone ? ' strikethrough' : '');
  nameEl.textContent = task.name;
  card.appendChild(nameEl);

  if (task.tags.length) {
    const tagsEl = document.createElement('div');
    tagsEl.className = 'board-card-tags';
    task.tags.forEach(tag => {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.style.cssText = tagPillStyle(tag);
      pill.textContent = tag;
      tagsEl.appendChild(pill);
    });
    card.appendChild(tagsEl);
  }

  const metaEl = document.createElement('div');
  metaEl.className = 'board-card-meta';
  if (task.priority && task.priority !== 'none') {
    const priEl = document.createElement('span');
    priEl.className = `board-card-priority ${task.priority}`;
    priEl.innerHTML = FLAG_SVG.replace('FLAG_CLASS', task.priority);
    metaEl.appendChild(priEl);
  }
  if (fmt) {
    const dueEl = document.createElement('span');
    dueEl.className = 'board-card-due' + (fmt.cls ? ' ' + fmt.cls : '');
    dueEl.textContent = fmt.text;
    metaEl.appendChild(dueEl);
  }
  card.appendChild(metaEl);

  card.addEventListener('click', () => openTaskPopup(task));
  return card;
}

function _renderByStatus(container, allTasks) {
  STATUSES.forEach(status => {
    const colTasks = allTasks.filter(t => t.status === status.key);
    if (colTasks.length === 0) return;

    const headerHtml = `
      <span class="status-badge badge-${status.key}">
        <span class="badge-dot"></span>
        <span class="badge-label-short">${status.shortLabel}</span>
        <span class="badge-label-full">${status.label}</span>
      </span>`;

    const col = document.createElement('div');
    col.className = 'board-col';
    col.dataset.status = status.key;

    const header = document.createElement('div');
    header.className = 'board-col-header';
    header.innerHTML = `${headerHtml}<span class="board-col-count">${colTasks.length}</span>`;
    col.appendChild(header);

    const cardList = document.createElement('div');
    cardList.className = 'board-card-list';
    colTasks.forEach(task => cardList.appendChild(_buildCard(task)));
    col.appendChild(cardList);

    container.appendChild(col);
  });
}

function _renderByTag(container, allTasks) {
  const tagMap = {};
  allTasks.forEach(t => {
    const tags = t.tags.length > 0 ? t.tags : ['__none__'];
    tags.forEach(tag => {
      if (!tagMap[tag]) tagMap[tag] = [];
      tagMap[tag].push(t);
    });
  });

  const keys = Object.keys(tagMap).sort((a, b) => {
    if (a === '__none__') return 1;
    if (b === '__none__') return -1;
    return a.localeCompare(b);
  });

  keys.forEach(tag => {
    const headerHtml = tag === '__none__'
      ? `<span class="board-col-group-label board-col-group-none">No Tag</span>`
      : `<span class="tag-pill" style="${tagPillStyle(tag)}">${tag}</span>`;
    container.appendChild(_buildCol(headerHtml, tagMap[tag]));
  });
}

function _renderByPriority(container, allTasks) {
  const priOrder = ['urgent', 'high', 'normal', 'low', 'none'];
  const priMap = {};
  allTasks.forEach(t => {
    const p = t.priority || 'none';
    if (!priMap[p]) priMap[p] = [];
    priMap[p].push(t);
  });

  priOrder.filter(p => priMap[p]).forEach(p => {
    const meta = PRIORITY_META[p];
    const headerHtml = p !== 'none'
      ? FLAG_SVG.replace('FLAG_CLASS', p) + `<span class="board-col-group-label">${meta.label}</span>`
      : `<span class="board-col-group-label board-col-group-none">${meta.label}</span>`;
    container.appendChild(_buildCol(headerHtml, priMap[p]));
  });
}

function _renderByDue(container, allTasks) {
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
  allTasks.forEach(t => {
    const b = getBucket(t);
    if (!bucketMap[b]) bucketMap[b] = [];
    bucketMap[b].push(t);
  });

  bucketOrder.filter(b => bucketMap[b]).forEach(b => {
    const cls = b === 'overdue' ? 'board-col-group-overdue' : b === 'none' ? 'board-col-group-none' : '';
    const headerHtml = `<span class="board-col-group-label ${cls}">${bucketLabels[b]}</span>`;
    container.appendChild(_buildCol(headerHtml, bucketMap[b]));
  });
}

export function initBoardPage() {
  const btn = document.getElementById('boardAddBtn');
  if (btn) btn.addEventListener('click', () => openAddFromCal(dateToStr(new Date())));

  document.querySelectorAll('.board-group-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setBoardGroupBy(btn.dataset.group);
      document.querySelectorAll('.board-group-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderBoard();
    });
  });

  // Sync active state from restored session
  const restoredBoardGroup = getBoardGroupBy();
  document.querySelectorAll('.board-group-btn').forEach(b => b.classList.toggle('active', b.dataset.group === restoredBoardGroup));
}
