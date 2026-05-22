export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const s = document.getElementById(id);
  if (s) { s.classList.add('active'); s.scrollTop = 0; }
}

export function showToast(msg, type = 'default') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 2800);
}

export function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function getAvatarColor(name) {
  const palettes = [
    { bg: '#EEF0FF', color: '#4B5FFA' },
    { bg: '#F0FDF4', color: '#16A34A' },
    { bg: '#FFFBEB', color: '#D97706' },
    { bg: '#FEF2F2', color: '#DC2626' },
    { bg: '#F5F3FF', color: '#7C3AED' },
    { bg: '#EFF6FF', color: '#1D4ED8' },
  ];
  const idx = (name || 'A').charCodeAt(0) % palettes.length;
  return palettes[idx];
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}
