import { showScreen, showToast, getInitials, getAvatarColor } from './ui.js';
import { apiGet, apiPost, apiDelete } from './auth.js';
import { loadMeetingCards, startMeetingFlow } from './meetings.js';

export let contacts = [];
let activeFilter = 'all';
let searchQuery = '';

export async function loadContacts() {
  const data = await apiGet('/api/contacts');
  if (!data) return;
  contacts = Array.isArray(data) ? data : [];
  renderContacts();
  updateStats();
}

function groupByCompany(list) {
  const groups = {};
  list.forEach(c => {
    const key = c.company_name || '—';
    if (!groups[key]) groups[key] = { name: key, sector: c.sector, contacts: [] };
    groups[key].contacts.push(c);
  });
  return Object.values(groups).sort((a, b) => b.contacts.length - a.contacts.length);
}

export function renderContacts() {
  const container = document.getElementById('contacts-list');
  const empty = document.getElementById('empty-state');
  if (!container) return;

  let list = [...contacts];
  if (activeFilter !== 'all') list = list.filter(c => c.category === activeFilter);
  if (searchQuery) list = list.filter(c =>
    (c.full_name || '').toLowerCase().includes(searchQuery) ||
    (c.company_name || '').toLowerCase().includes(searchQuery) ||
    (c.sector || '').toLowerCase().includes(searchQuery)
  );

  if (list.length === 0) {
    container.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  const groups = groupByCompany(list);

  container.innerHTML = groups.map(g => `
    <div class="company-group">
      <div class="company-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
        <div>
          <div class="company-group-name">${g.name}</div>
          ${g.sector ? `<div class="company-group-sector">${g.sector}</div>` : ''}
        </div>
        <div class="company-group-count">${g.contacts.length}</div>
      </div>
      <div class="company-group-list">
        ${g.contacts.map(c => {
          const col = getAvatarColor(c.full_name);
          return `
            <div class="p-card" data-id="${c.id}">
              <div class="p-card-inner">
                <div class="avatar" style="background:${col.bg}; color:${col.color};">${getInitials(c.full_name)}</div>
                <div class="p-info">
                  <div class="p-name">${c.full_name}</div>
                  ${c.title ? `<div class="p-title">${c.title}</div>` : ''}
                </div>
                ${c.next_action_date ? '<div class="p-alert">⚡</div>' : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.p-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.id));
  });
}

function updateStats() {
  const total = contacts.length;
  const now = new Date();
  const month = contacts.filter(c => {
    const d = new Date(c.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const withReminders = contacts.filter(c => c.next_action_date).length;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-month').textContent = month;
  document.getElementById('stat-reminders').textContent = withReminders;
  document.getElementById('sum-total').textContent = total;
  document.getElementById('sum-business').textContent = contacts.filter(c => c.category === 'İş görüşmesi').length;
}

export function openDetail(id) {
  const c = contacts.find(x => x.id === id);
  if (!c) return;
  window._currentDetailId = id;

  const col = getAvatarColor(c.full_name);
  document.getElementById('detail-avatar').textContent = getInitials(c.full_name);
  document.getElementById('detail-avatar').style.background = col.bg;
  document.getElementById('detail-avatar').style.color = col.color;
  document.getElementById('detail-name').textContent = c.full_name || '';
  document.getElementById('detail-sub').textContent = [c.title, c.company_name].filter(Boolean).join(' · ');

  const info = document.getElementById('detail-info');
  const rows = [
    { lbl: 'Tel',    val: c.phone,   href: c.phone ? `tel:${c.phone}` : null },
    { lbl: 'GSM',    val: c.gsm,     href: c.gsm ? `tel:${c.gsm}` : null },
    { lbl: 'Fax',    val: c.fax },
    { lbl: 'Mail',   val: c.email,   href: c.email ? `mailto:${c.email}` : null },
    { lbl: 'Web',    val: c.web,     href: c.web ? (c.web.startsWith('http') ? c.web : 'https://' + c.web) : null },
    { lbl: 'Adres',  val: c.address },
    { lbl: 'Sektör', val: c.sector },
  ].filter(r => r.val);

  info.innerHTML = rows.map(r => `
    <div class="info-row">
      <span class="info-lbl">${r.lbl}</span>
      ${r.href ? `<a class="info-val lnk" href="${r.href}">${r.val}</a>` : `<span class="info-val">${r.val}</span>`}
    </div>
  `).join('');

  // Görüşme kartı ekle butonu
  document.getElementById('btn-add-meeting')?.addEventListener('click', () => {
    startMeetingFlow(c.id, c.full_name, c.company_id);
  });

  loadMeetingCards(c.id);
  showScreen('screen-detail');
}

export function initContacts() {
  document.getElementById('btn-search-toggle')?.addEventListener('click', () => {
    const bar = document.getElementById('search-bar');
    const hidden = !bar.style.display || bar.style.display === 'none';
    bar.style.display = hidden ? 'flex' : 'none';
    if (hidden) document.getElementById('search-input')?.focus();
  });

  document.getElementById('search-input')?.addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
    renderContacts();
  });

  document.getElementById('btn-delete')?.addEventListener('click', async () => {
    if (!window._currentDetailId) return;
    if (!confirm('Bu kişiyi silmek istiyor musunuz?')) return;
    await apiDelete(`/api/contacts?id=${window._currentDetailId}`);
    await loadContacts();
    showToast('Silindi');
    showScreen('screen-home');
  });

  window.addEventListener('contacts:reload', loadContacts);
}
