import { STATUSES, PRIORITY_META, FLAG_SVG } from '../modules/constants.js';
import { getTasks, tagPillStyle } from '../modules/state.js';
import { formatDate, dateToStr } from '../modules/utils.js';
import { openTaskPopup, openAddFromCal } from '../components/modal.js';

export function renderBoard() {
  const container = document.getElementById('boardColumns');
  container.innerHTML = '';

  const allTasks = getTasks();
  const hasAny = allTasks.length > 0;

  const emptyState = document.getElementById('boardEmptyState');
  if (emptyState) emptyState.style.display = hasAny ? 'none' : 'flex';
  container.style.display = hasAny ? '' : 'none';

  if (!hasAny) return;

  STATUSES.forEach(status => {
    const colTasks = allTasks.filter(t => t.status === status.key);

    if (colTasks.length === 0) return;

    const col = document.createElement('div');
    col.className = 'board-col';
    col.dataset.status = status.key;

    const header = document.createElement('div');
    header.className = 'board-col-header';
    header.innerHTML = `
      <span class="status-badge badge-${status.key}">
        <span class="badge-dot"></span>
        <span class="badge-label-short">${status.shortLabel}</span>
        <span class="badge-label-full">${status.label}</span>
      </span>
      <span class="board-col-count">${colTasks.length}</span>
    `;
    col.appendChild(header);

    const cardList = document.createElement('div');
    cardList.className = 'board-card-list';

    colTasks.forEach(task => {
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
        priEl.innerHTML = FLAG_SVG.replace('FLAG_CLASS', task.priority); // FLAG_SVG is a static constant
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
      cardList.appendChild(card);
    });

    col.appendChild(cardList);
    container.appendChild(col);
  });
}

export function initBoardPage() {
  const btn = document.getElementById('boardAddBtn');
  if (btn) btn.addEventListener('click', () => openAddFromCal(dateToStr(new Date())));
}
