// =====================
// KARTCRM v2 - app.js
// Neon DB + Auth
// =====================

let contacts = [];
let currentDetailId = null;
let selectedCategory = '';
let activeFilter = 'all';
let cameraStream = null;
let editMode = false;
let authToken = localStorage.getItem('kartcrm_token');
let currentUser = JSON.parse(localStorage.getItem('kartcrm_user') || 'null');

// =====================
// AUTH
// =====================
function switchTab(tab) {
  document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
}

async function login() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  if (!email || !password) { errEl.textContent = 'Tüm alanları doldurun'; return; }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('kartcrm_token', authToken);
    localStorage.setItem('kartcrm_user', JSON.stringify(currentUser));
    initApp();
  } catch (e) {
    errEl.textContent = 'Bağlantı hatası';
  }
}

async function register() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl = document.getElementById('reg-error');
  errEl.textContent = '';

  if (!email || !password) { errEl.textContent = 'Tüm alanları doldurun'; return; }
  if (password.length < 6) { errEl.textContent = 'Şifre en az 6 karakter olmalı'; return; }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name: name })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('kartcrm_token', authToken);
    localStorage.setItem('kartcrm_user', JSON.stringify(currentUser));
    initApp();
  } catch (e) {
    errEl.textContent = 'Bağlantı hatası';
  }
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('kartcrm_token');
  localStorage.removeItem('kartcrm_user');
  contacts = [];
  showScreen('screen-auth');
}

// =====================
// API CALLS
// =====================
async function apiGet(path) {
  const res = await fetch(path, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify(body)
  });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(path, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

// =====================
// YARDIMCI
// =====================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const s = document.getElementById(id);
  if (s) { s.classList.add('active'); s.scrollTop = 0; }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarStyle(name) {
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

function getCategoryTagClass(cat) {
  const map = { 'İş görüşmesi': 'tag-blue', 'Toplantı': 'tag-green', 'Fuar': 'tag-amber', 'Yemek': 'tag-purple', 'Karşılaşma': 'tag-gray', 'Dernek': 'tag-gray', 'Diğer': 'tag-gray' };
  return map[cat] || 'tag-gray';
}

function stopAllCameras() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  ['camera-video'].forEach(id => { const v = document.getElementById(id); if (v) v.srcObject = null; });
}

// =====================
// CONTACTS
// =====================
async function loadContacts() {
  const data = await apiGet('/api/contacts');
  if (!data) return;
  contacts = data;
  filterAndRender();
  loadReminders();
}

async function loadReminders() {
  const data = await apiGet('/api/reminders');
  if (!data) return;

  const bar = document.getElementById('reminders-bar');
  const list = document.getElementById('reminders-list');
  document.getElementById('stat-reminders').textContent = data.length;
  document.getElementById('sum-reminders').textContent = data.length;

  if (data.length === 0) { bar.style.display = 'none'; return; }

  bar.style.display = 'block';
  list.innerHTML = data.map(r => `
    <div class="reminder-item">
      <span>⚡</span>
      <div>
        <strong>${r.full_name}</strong>
        <div style="font-size:11px; color:var(--text2);">${r.message}</div>
      </div>
    </div>
  `).join('');
}

function updateStats() {
  const total = contacts.length;
  const now = new Date();
  const month = contacts.filter(c => {
    const d = new Date(c.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-month').textContent = month;
  document.getElementById('sum-total').textContent = total;
  document.getElementById('sum-business').textContent = contacts.filter(c => c.category === 'İş görüşmesi').length;
}

function renderContacts(list) {
  const container = document.getElementById('contacts-list');
  const empty = document.getElementById('empty-state');

  if (list.length === 0) {
    container.innerHTML = '';
    container.appendChild(empty);
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  container.innerHTML = list.map(c => {
    const col = getAvatarStyle(c.full_name);
    const initials = getInitials(c.full_name);
    const tagClass = getCategoryTagClass(c.category);
    return `
      <div class="p-card" data-id="${c.id}">
        <div class="p-card-top">
          <div class="avatar" style="background:${col.bg}; color:${col.color};">${initials}</div>
          <div style="flex:1; min-width:0;">
            <div class="p-name">${c.full_name || ''}</div>
            <div class="p-co">${c.company_name || ''}</div>
          </div>
          <div class="p-arrow">›</div>
        </div>
        <div class="p-tags">
          ${c.category ? `<span class="tag ${tagClass}">${c.category}</span>` : ''}
          ${c.sector ? `<span class="tag tag-gray">${c.sector}</span>` : ''}
          ${c.next_action_date ? `<span class="tag tag-amber">⚡ Takip var</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.p-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.id));
  });
}

function filterAndRender() {
  let list = [...contacts];
  const searchEl = document.getElementById('search-input');
  const search = searchEl ? searchEl.value.toLowerCase() : '';

  if (activeFilter !== 'all') list = list.filter(c => c.category === activeFilter);
  if (search) list = list.filter(c =>
    (c.full_name || '').toLowerCase().includes(search) ||
    (c.company_name || '').toLowerCase().includes(search) ||
    (c.sector || '').toLowerCase().includes(search)
  );
  renderContacts(list);
  updateStats();
}

// =====================
// DETAY
// =====================
function openDetail(id) {
  const c = contacts.find(x => x.id === id);
  if (!c) return;
  currentDetailId = id;

  document.getElementById('detail-avatar').textContent = getInitials(c.full_name);
  document.getElementById('detail-name').textContent = c.full_name || '';
  document.getElementById('detail-sub').textContent = [c.title, c.company_name].filter(Boolean).join(' · ');

  const tagWrap = document.getElementById('detail-tag-wrap');
  tagWrap.innerHTML = c.category
    ? `<span class="tag" style="background:rgba(255,255,255,0.2);color:#fff;font-size:10px;">${c.category}</span>`
    : '';

  const info = document.getElementById('detail-info');
  const rows = [
    { icon: '📞', lbl: 'Tel',    val: c.phone,   href: c.phone ? `tel:${c.phone}` : null },
    { icon: '📱', lbl: 'GSM',    val: c.gsm,     href: c.gsm ? `tel:${c.gsm}` : null },
    { icon: '📠', lbl: 'Fax',    val: c.fax },
    { icon: '✉️', lbl: 'Mail',   val: c.email,   href: c.email ? `mailto:${c.email}` : null },
    { icon: '🌐', lbl: 'Web',    val: c.web,     href: c.web ? (c.web.startsWith('http') ? c.web : 'https://' + c.web) : null },
    { icon: '📍', lbl: 'Adres',  val: c.address },
    { icon: '🏭', lbl: 'Sektör', val: c.sector },
  ].filter(r => r.val);

  info.innerHTML = rows.map(r => `
    <div class="info-row">
      <div class="info-icon">${r.icon}</div>
      <span class="info-lbl">${r.lbl}</span>
      ${r.href ? `<a class="info-val lnk" href="${r.href}">${r.val}</a>` : `<span class="info-val">${r.val}</span>`}
    </div>
  `).join('');

  const noteCard = document.getElementById('detail-note-card');
  if (c.notes) { noteCard.style.display = 'block'; document.getElementById('detail-note').textContent = c.notes; }
  else { noteCard.style.display = 'none'; }

  const actionCard = document.getElementById('detail-action-card');
  if (c.next_action) {
    actionCard.style.display = 'block';
    document.getElementById('detail-action').textContent = c.next_action;
    document.getElementById('detail-action-date').textContent = c.next_action_date ? `📅 ${new Date(c.next_action_date).toLocaleDateString('tr-TR')}` : '';
  } else { actionCard.style.display = 'none'; }

  showScreen('screen-detail');
}

// =====================
// FORM
// =====================
function fillForm(data) {
  document.getElementById('f-name').value    = data.name || data.full_name || '';
  document.getElementById('f-company').value = data.company || data.company_name || '';
  document.getElementById('f-title').value   = data.title   || '';
  document.getElementById('f-phone').value   = data.phone   || '';
  document.getElementById('f-gsm').value     = data.gsm     || '';
  document.getElementById('f-fax').value     = data.fax     || '';
  document.getElementById('f-email').value   = data.email   || '';
  document.getElementById('f-web').value     = data.web     || '';
  document.getElementById('f-address').value = data.address || '';
  document.getElementById('f-sector').value  = data.sector  || '';
}

function readForm() {
  return {
    full_name: document.getElementById('f-name').value.trim(),
    company_name: document.getElementById('f-company').value.trim(),
    title:   document.getElementById('f-title').value.trim(),
    phone:   document.getElementById('f-phone').value.trim(),
    gsm:     document.getElementById('f-gsm').value.trim(),
    fax:     document.getElementById('f-fax').value.trim(),
    email:   document.getElementById('f-email').value.trim(),
    web:     document.getElementById('f-web').value.trim(),
    address: document.getElementById('f-address').value.trim(),
    sector:  document.getElementById('f-sector').value.trim(),
  };
}

// =====================
// KAMERA
// =====================
async function startCamera(videoId) {
  stopAllCameras();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    const video = document.getElementById(videoId);
    video.srcObject = cameraStream;
    await video.play();
  } catch (e) { showToast('Kamera açılamadı'); }
}

function resizeImage(dataUrl, maxW, quality) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxW / img.width, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality || 0.75));
    };
    img.src = dataUrl;
  });
}

async function sendToAI(dataUrl) {
  const resized = await resizeImage(dataUrl, 1000, 0.75);
  const base64 = resized.split(',')[1];
  document.getElementById('ocr-loading').style.display = 'block';
  showScreen('screen-camera');

  try {
    const response = await fetch('https://kartcrm.vercel.app/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 })
    });
    if (!response.ok) throw new Error('Sunucu hatası: ' + response.status);
    const parsed = await response.json();
    fillForm(parsed);
    document.getElementById('ocr-loading').style.display = 'none';
    document.getElementById('ocr-banner').textContent = '✦ AI okudu — bilgileri kontrol edip onaylayın';
    showScreen('screen-verify');
  } catch (e) {
    document.getElementById('ocr-loading').style.display = 'none';
    showToast('Hata: ' + e.message);
    fillForm({});
    showScreen('screen-verify');
  }
}

// =====================
// AI NOT ANALİZİ
// =====================
async function analyzeNote(note) {
  if (!note || note.length < 10) return;
  try {
    const res = await fetch('https://kartcrm.vercel.app/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: null,
        textOnly: true,
        prompt: `Bu iş notunu analiz et ve takip tarihi öner. NOT: "${note}". Sadece JSON döndür: {"next_action":"yapılacak iş","suggested_date":"YYYY-MM-DD veya null","suggestion":"kullanıcıya öneri mesajı"}`
      })
    });
  } catch(e) {}
}

// =====================
// KAYDET
// =====================
async function saveContact(notes, category) {
  const formData = readForm();
  const nextAction = document.getElementById('f-next-action').value.trim();
  const nextDate = document.getElementById('f-next-date').value;

  const payload = { ...formData, notes, category, next_action: nextAction, next_action_date: nextDate || null };

  const data = await apiPost('/api/contacts', payload);
  if (!data || data.error) { showToast('Kayıt hatası: ' + (data?.error || '')); return; }

  await loadContacts();
  showToast('✓ Kaydedildi');
  showScreen('screen-home');
  selectedCategory = '';
}

// =====================
// EXPORT
// =====================
function exportExcel() {
  if (!contacts.length) { showToast('Henüz kişi yok'); return; }
  const rows = contacts.map(c => ({
    'Ad Soyad': c.full_name||'', 'Firma': c.company_name||'', 'Unvan': c.title||'',
    'Telefon': c.phone||'', 'GSM': c.gsm||'', 'Fax': c.fax||'',
    'E-posta': c.email||'', 'Web': c.web||'', 'Adres': c.address||'',
    'Sektör': c.sector||'', 'Kategori': c.category||'', 'Not': c.notes||'',
    'Sonraki Aksiyon': c.next_action||'', 'Takip Tarihi': c.next_action_date||'',
    'Eklenme': c.created_at ? new Date(c.created_at).toLocaleDateString('tr-TR') : '',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Kişiler');
  XLSX.writeFile(wb, 'KartCRM_Kisiler.xlsx');
  showToast('✓ Excel indirildi');
}

function exportPDF() {
  if (!contacts.length) { showToast('Henüz kişi yok'); return; }
  const rows = contacts.map(c => `<tr><td>${c.full_name||''}</td><td>${c.company_name||''}</td><td>${c.phone||''}</td><td>${c.email||''}</td><td>${c.sector||''}</td><td>${c.category||''}</td><td>${c.notes||''}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;font-size:10px;padding:20px;}h1{color:#4B5FFA;}table{width:100%;border-collapse:collapse;}th{background:#4B5FFA;color:#fff;padding:7px 5px;text-align:left;}td{padding:6px 5px;border-bottom:1px solid #EEF0F8;}tr:nth-child(even) td{background:#F4F5FB;}</style></head><body><h1>KartCRM — Kişi Listesi</h1><p>${contacts.length} kişi · ${new Date().toLocaleDateString('tr-TR')}</p><table><thead><tr><th>Ad Soyad</th><th>Firma</th><th>Telefon</th><th>E-posta</th><th>Sektör</th><th>Kategori</th><th>Not</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 600); }
}

// =====================
// PUSH BİLDİRİM
// =====================
async function requestNotificationPermission() {
  if (!('Notification' in window)) { showToast('Tarayıcı bildirimleri desteklemiyor'); return; }
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    document.getElementById('notif-status').textContent = 'Aktif ✓';
    document.getElementById('notif-arrow').textContent = '✓';
    showToast('✓ Bildirimler aktif');
    new Notification('KartCRM', { body: 'Bildirimler başarıyla etkinleştirildi!', icon: '/icon-192.png' });
  } else {
    document.getElementById('notif-status').textContent = 'Reddedildi';
    showToast('Bildirim izni reddedildi');
  }
}

function updateNotifStatus() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    document.getElementById('notif-status').textContent = 'Aktif ✓';
    document.getElementById('notif-arrow').textContent = '✓';
  } else if (Notification.permission === 'denied') {
    document.getElementById('notif-status').textContent = 'Reddedildi';
  }
}

// =====================
// INIT
// =====================
function initApp() {
  if (!authToken || !currentUser) { showScreen('screen-auth'); return; }

  const name = currentUser.full_name || currentUser.email.split('@')[0];
  document.getElementById('greeting-text').textContent = `Merhaba, ${name} 👋`;
  document.getElementById('profile-name').textContent = currentUser.full_name || '-';
  document.getElementById('profile-email').textContent = currentUser.email || '-';
  document.getElementById('profile-avatar').textContent = getInitials(currentUser.full_name || currentUser.email);

  updateNotifStatus();
  showScreen('screen-home');
  loadContacts();
  loadUserCompanies();
}

// =====================
// EVENT LISTENERS
// =====================
document.addEventListener('DOMContentLoaded', () => {
  // Auth check
  if (authToken && currentUser) { initApp(); }
  else { showScreen('screen-auth'); }

  // Login / Register
  document.getElementById('btn-login').addEventListener('click', login);
  document.getElementById('btn-register').addEventListener('click', register);
  document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-logout2').addEventListener('click', logout);

  // FAB
  document.getElementById('fab-add').addEventListener('click', () => {
    editMode = false; fillForm({}); showScreen('screen-add');
  });

  // Search
  document.getElementById('btn-search-toggle').addEventListener('click', () => {
    const bar = document.getElementById('search-bar');
    const hidden = !bar.style.display || bar.style.display === 'none';
    bar.style.display = hidden ? 'flex' : 'none';
    if (hidden) document.getElementById('search-input').focus();
  });
  document.getElementById('search-input').addEventListener('input', filterAndRender);

  // Filter chips
  document.getElementById('filter-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#filter-chips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    filterAndRender();
  });

  // Add options
  document.getElementById('opt-camera').addEventListener('click', async () => {
    showScreen('screen-camera'); await startCamera('camera-video');
  });
  document.getElementById('opt-qr').addEventListener('click', async () => {
    showScreen('screen-camera'); await startCamera('camera-video');
  });
  document.getElementById('opt-manual').addEventListener('click', () => {
    fillForm({});
    document.getElementById('ocr-banner').textContent = '✏️ Bilgileri manuel olarak girin';
    showScreen('screen-verify');
  });

  // Camera
  document.getElementById('btn-capture').addEventListener('click', () => {
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    if (!video.videoWidth) { showToast('Kamera hazır değil'); return; }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    stopAllCameras();
    sendToAI(canvas.toDataURL('image/jpeg', 0.9));
  });

  document.getElementById('file-input').addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { stopAllCameras(); sendToAI(ev.target.result); };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  // Verify
  document.getElementById('btn-verify-next').addEventListener('click', () => {
    const name = document.getElementById('f-name').value.trim();
    const errEl = document.getElementById('verify-error');
    if (!name) { errEl.style.display = 'block'; return; }
    errEl.style.display = 'none';
    document.querySelectorAll('#note-chips .chip').forEach(c => c.classList.remove('on'));
    document.getElementById('f-note').value = '';
    document.getElementById('f-next-action').value = '';
    document.getElementById('f-next-date').value = '';
    selectedCategory = '';
    showScreen('screen-note');
  });

  // Note chips
  document.getElementById('note-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#note-chips .chip').forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
    selectedCategory = chip.dataset.cat;
  });

  // Note auto-analyze
  document.getElementById('f-note').addEventListener('blur', () => {
    const note = document.getElementById('f-note').value.trim();
    analyzeNote(note);
  });

  // Save
  document.getElementById('btn-save').addEventListener('click', () => {
    saveContact(document.getElementById('f-note').value.trim(), selectedCategory);
  });
  document.getElementById('btn-skip-note').addEventListener('click', () => {
    saveContact('', selectedCategory);
  });

  // Delete
  document.getElementById('btn-delete').addEventListener('click', async () => {
    if (!currentDetailId) return;
    if (!confirm('Bu kişiyi silmek istiyor musunuz?')) return;
    await apiDelete(`/api/contacts?id=${currentDetailId}`);
    await loadContacts();
    showToast('🗑 Silindi');
    showScreen('screen-home');
  });

  // Edit
  document.getElementById('btn-edit').addEventListener('click', () => {
    const c = contacts.find(x => x.id === currentDetailId);
    if (!c) return;
    editMode = true;
    fillForm({ ...c, name: c.full_name, company: c.company_name });
    document.getElementById('ocr-banner').textContent = '✏️ Bilgileri düzenleyin';
    showScreen('screen-verify');
  });

  // Export
  document.getElementById('btn-export-excel').addEventListener('click', exportExcel);
  document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);

  // Notification
  document.getElementById('btn-notif-toggle').addEventListener('click', requestNotificationPermission);
  document.getElementById('btn-add-company').addEventListener('click', () => {
    document.getElementById('add-company-form').style.display = 'block';
  });
  document.getElementById('btn-save-company').addEventListener('click', saveUserCompany);
  document.getElementById('btn-cancel-company').addEventListener('click', () => {
    document.getElementById('add-company-form').style.display = 'none';
  });

  // Back buttons
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => { stopAllCameras(); showScreen(btn.dataset.back); });
  });

  // Nav
  document.querySelectorAll('[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });
});

// =====================
// KULLANICI ŞİRKETLERİ
// =====================
let userCompanies = [];

async function loadUserCompanies() {
  const data = await apiGet('/api/usercompanies');
  if (!data) return;
  userCompanies = data;
  renderUserCompanies();
  fillUserCompanySelect();
}

function renderUserCompanies() {
  const list = document.getElementById('user-companies-list');
  if (!list) return;
  if (userCompanies.length === 0) {
    list.innerHTML = '<div style="font-size:12px; color:var(--text3); padding:8px 0; margin-bottom:8px;">Henüz şirket eklenmedi</div>';
    return;
  }
  list.innerHTML = userCompanies.map(c => `
    <div class="p-card" style="margin-bottom:8px;">
      <div class="p-card-top">
        <div class="avatar" style="background:#EEF0FF; color:#4B5FFA; border-radius:10px;">🏢</div>
        <div>
          <div class="p-name">${c.company_name}</div>
          <div class="p-co">${c.title || ''} ${c.is_default ? '⭐ Varsayılan' : ''}</div>
        </div>
        <button onclick="deleteUserCompany('${c.id}')" style="margin-left:auto; background:var(--red-bg); color:var(--red-text); border:none; border-radius:8px; padding:4px 10px; font-size:11px; cursor:pointer;">Sil</button>
      </div>
    </div>
  `).join('');
}

function fillUserCompanySelect() {
  const sel = document.getElementById('f-user-company');
  if (!sel) return;
  sel.innerHTML = '<option value="">Şahsen / Seçiniz</option>';
  userCompanies.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.company_name}${c.title ? ' - ' + c.title : ''}`;
    if (c.is_default) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function deleteUserCompany(id) {
  if (!confirm('Bu şirketi silmek istiyor musunuz?')) return;
  await apiDelete(`/api/usercompanies?id=${id}`);
  await loadUserCompanies();
  showToast('Şirket silindi');
}

async function saveUserCompany() {
  const name = document.getElementById('uc-name').value.trim();
  const title = document.getElementById('uc-title').value.trim();
  const isDefault = document.getElementById('uc-default').checked;
  if (!name) { showToast('Şirket adı gerekli'); return; }
  const data = await apiPost('/api/usercompanies', { company_name: name, title, is_default: isDefault });
  if (data && !data.error) {
    document.getElementById('add-company-form').style.display = 'none';
    document.getElementById('uc-name').value = '';
    document.getElementById('uc-title').value = '';
    document.getElementById('uc-default').checked = false;
    await loadUserCompanies();
    showToast('✓ Şirket eklendi');
  } else {
    showToast('Hata: ' + (data?.error || ''));
  }
}
