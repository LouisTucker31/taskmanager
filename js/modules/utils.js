const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Extract #hashtag mentions from a string
export function parseTags(str) {
  const matches = str.match(/#[a-zA-Z0-9_-]+/g);
  return matches ? matches.map(t => t.slice(1).toLowerCase()) : [];
}

// Remove #hashtag mentions from a string
export function stripTags(str) {
  return str.replace(/#[a-zA-Z0-9_-]+/g, '').trim();
}

// Normalise a raw tag string (space-separated words, optional # prefix) into a clean array
export function normaliseTags(raw) {
  if (!raw || !raw.trim()) return [];
  return raw.trim().split(/\s+/).map(t => t.replace(/^#+/, '').toLowerCase()).filter(Boolean);
}

// Returns { text, cls } for display — cls is 'overdue', 'today', or ''
export function formatDate(dateStr) {
  if (!dateStr) return { text: '—', cls: '' };
  const [y, m, d] = dateStr.split('-').map(Number);
  const today = new Date();
  const dt = new Date(y, m - 1, d);
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = (dt - todayMid) / 86400000;
  if (diff < 0)   return { text: `${d} ${MONTHS_SHORT[m-1]}`, cls: 'overdue' };
  if (diff === 0) return { text: 'Today', cls: 'today' };
  if (diff === 1) return { text: 'Tomorrow', cls: '' };
  return { text: `${d} ${MONTHS_SHORT[m-1]}`, cls: '' };
}

// Format a Date object as YYYY-MM-DD
export function dateToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Minimal HTML escaping for safe interpolation into innerHTML
export function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Human-readable date label for a date picker button
export function dueBtnLabel(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS_SHORT[m-1]} ${y}`;
}

