export const STATUSES = [
  { key: 'todo',       label: 'To Do',           shortLabel: 'To Do',      primary: true },
  { key: 'planned',    label: 'Planned',          shortLabel: 'Planned',    primary: false },
  { key: 'inprogress', label: 'In Progress',      shortLabel: 'In Progress',primary: false },
  { key: 'updatereq',  label: 'Update Required',  shortLabel: 'Update',     primary: false },
  { key: 'onhold',     label: 'On Hold',          shortLabel: 'On Hold',    primary: false },
  { key: 'complete',   label: 'Complete',         shortLabel: 'Complete',   primary: false },
  { key: 'canceled',   label: 'Canceled',         shortLabel: 'Canceled',   primary: false },
];

export const PRIORITY_META = {
  urgent: { label: 'Urgent',      color: '#ef4444' },
  high:   { label: 'High',        color: '#f59e0b' },
  normal: { label: 'Normal',      color: '#6366f1' },
  low:    { label: 'Low',         color: '#94a3b8' },
  none:   { label: 'No Priority', color: '#c4c4d0' },
};

export const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3, none: 4 };

export const TAG_COLORS = [
  { bg: '#ede9fe', text: '#7c3aed' },
  { bg: '#fce7f3', text: '#be185d' },
  { bg: '#dcfce7', text: '#15803d' },
  { bg: '#ffedd5', text: '#c2410c' },
  { bg: '#e0f2fe', text: '#0369a1' },
  { bg: '#fef9c3', text: '#a16207' },
  { bg: '#f1f5f9', text: '#475569' },
];

export const TAG_COLORS_DARK = [
  { bg: '#4c1d95', text: '#ede9fe' },
  { bg: '#831843', text: '#fce7f3' },
  { bg: '#14532d', text: '#dcfce7' },
  { bg: '#7c2d12', text: '#ffedd5' },
  { bg: '#0c4a6e', text: '#e0f2fe' },
  { bg: '#713f12', text: '#fef9c3' },
  { bg: '#334155', text: '#f1f5f9' },
];

export const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export const FLAG_SVG = `<svg class="flag-svg FLAG_CLASS" viewBox="0 0 12 14" fill="none" stroke="none"><line x1="2.5" y1="1" x2="2.5" y2="13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2.5 1.5 L10.5 1.5 L8.5 5 L10.5 8.5 L2.5 8.5 Z" fill="currentColor"/></svg>`;
