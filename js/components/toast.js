let undoTimeout = null;

export function showUndoToast(message, undoFn) {
  const existing = document.getElementById('undoToast');
  if (existing) existing.remove();
  if (undoTimeout) clearTimeout(undoTimeout);

  const toast = document.createElement('div');
  toast.id = 'undoToast';
  toast.className = 'undo-toast';
  const msgEl = document.createElement('span');
  msgEl.textContent = message;
  const undoBtn = document.createElement('button');
  undoBtn.className = 'undo-btn';
  undoBtn.textContent = 'Undo';
  toast.appendChild(msgEl);
  toast.appendChild(undoBtn);
  undoBtn.addEventListener('click', () => {
    undoFn();
    dismissToast(toast);
  });
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('visible'));
  undoTimeout = setTimeout(() => dismissToast(toast), 4000);
}

function dismissToast(toast) {
  if (!toast) return;
  toast.classList.remove('visible');
  setTimeout(() => toast.remove(), 300);
}
