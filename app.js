// =====================
// KARTCRM - app.js v2
// =====================

const CLAUDE_API_KEY = 'YOUR_CLAUDE_API_KEY_HERE';

let contacts = JSON.parse(localStorage.getItem('kartcrm_contacts') || '[]');
let selectedCategory = '';
let activeFilter = 'all';
let cameraStream = null;
let currentDetailId = null;
let editMode = false;

function saveContacts() {
  localStorage.setItem('kartcrm_contacts', JSON.stringify(contacts));
}

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
  const map = {
    'İş görüşmesi': 'tag-blue',
    'Toplantı': 'tag-green',
    'Fuar': 'tag-amber',
    'Yemek': 'tag-purple',
    'Karşılaşma': 'tag-gray',
    'Dernek': 'tag-gray',
    'Diğer': 'tag-gray',
  };
  return map[cat] || 'tag-gray';
}

function stopAllCameras() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  ['camera-video', 'qr-video'].forEach(id => {
    const v = document.getElementById(id);
    if (v) v.srcObject = null;
  });
}

function updateStats() {
  const total = contacts.length;
  const now = new Date();
  const month = contacts.filter(c => {
    const d = new Date(c.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const sectors = new Set(contacts.map(c => c.sector).filter(Boolean)).size;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-month').textContent = month;
  document.getElementById('stat-sectors').textContent = sectors;

  const sumTotal = document.getElementById('sum-total');
  if (sumTotal) {
    sumTotal.textContent = total;
    document.getElementById('sum-business').textContent =
      contacts.filter(c => c.category === 'İş görüşmesi').length;
    document.getElementById('sum-sectors').textContent = sectors;
  }
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
    const col = getAvatarStyle(c.name);
    const initials = getInitials(c.name);
    const tagClass = getCategoryTagClass(c.category);
    return `
      <div class="p-card" data-id="${c.id}">
        <div class="p-card-top">
          <div class="avatar" style="background:${col.bg}; color:${col.color};">${initials}</div>
          <div style="flex:1; min-width:0;">
            <div class="p-name">${c.name || ''}</div>
            <div class="p-co">${c.company || ''}</div>
          </div>
          <div class="p-arrow">›</div>
        </div>
        <div class="p-tags">
          ${c.category ? `<span class="tag ${tagClass}">${c.category}</span>` : ''}
          ${c.sector ? `<span class="tag tag-gray">${c.sector}</span>` : ''}
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

  if (activeFilter !== 'all') {
    list = list.filter(c => c.category === activeFilter);
  }
  if (search) {
    list = list.filter(c =>
      (c.name || '').toLowerCase().includes(search) ||
      (c.company || '').toLowerCase().includes(search) ||
      (c.sector || '').toLowerCase().includes(search)
    );
  }
  renderContacts(list);
  updateStats();
}

function openDetail(id) {
  const c = contacts.find(x => x.id === id);
  if (!c) return;
  currentDetailId = id;

  document.getElementById('detail-avatar').textContent = getInitials(c.name);
  document.getElementById('detail-name').textContent = c.name || '';
  document.getElementById('detail-sub').textContent = [c.title, c.company].filter(Boolean).join(' · ');

  const tagWrap = document.getElementById('detail-tag-wrap');
  tagWrap.innerHTML = c.category
    ? `<span class="tag" style="background:rgba(255,255,255,0.2);color:#fff;font-size:10px;">${c.category}</span>`
    : '';

  const info = document.getElementById('detail-info');
  const rows = [
    { icon: '📞', lbl: 'Tel',    val: c.phone,   href: c.phone ? `tel:${c.phone}` : null },
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
      ${r.href
        ? `<a class="info-val lnk" href="${r.href}">${r.val}</a>`
        : `<span class="info-val">${r.val}</span>`}
    </div>
  `).join('');

  const noteCard = document.getElementById('detail-note-card');
  if (c.note) {
    noteCard.style.display = 'block';
    document.getElementById('detail-note').textContent = c.note;
  } else {
    noteCard.style.display = 'none';
  }

  showScreen('screen-detail');
}

function fillForm(data) {
  document.getElementById('f-name').value    = data.name    || '';
  document.getElementById('f-company').value = data.company || '';
  document.getElementById('f-title').value   = data.title   || '';
  document.getElementById('f-phone').value   = data.phone   || '';
  document.getElementById('f-fax').value     = data.fax     || '';
  document.getElementById('f-email').value   = data.email   || '';
  document.getElementById('f-web').value     = data.web     || '';
  document.getElementById('f-address').value = data.address || '';
  document.getElementById('f-sector').value  = data.sector  || '';
}

function readForm() {
  return {
    name:    document.getElementById('f-name').value.trim(),
    company: document.getElementById('f-company').value.trim(),
    title:   document.getElementById('f-title').value.trim(),
    phone:   document.getElementById('f-phone').value.trim(),
    fax:     document.getElementById('f-fax').value.trim(),
    email:   document.getElementById('f-email').value.trim(),
    web:     document.getElementById('f-web').value.trim(),
    address: document.getElementById('f-address').value.trim(),
    sector:  document.getElementById('f-sector').value.trim(),
  };
}

async function startCamera(videoId) {
  stopAllCameras();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }
    });
    const video = document.getElementById(videoId);
    video.srcObject = cameraStream;
    await video.play();
  } catch (e) {
    showToast('Kamera açılamadı');
  }
}

function resizeImage(dataUrl, maxW, quality) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxW / img.width, 1);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * ratio);
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
    const response = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 })
    });

    if (!response.ok) throw new Error('Sunucu hatası: ' + response.status);

    const parsed = await response.json();
    console.log('AI:', parsed);

    fillForm(parsed);
    document.getElementById('ocr-loading').style.display = 'none';
    document.getElementById('ocr-banner').textContent = '✦ AI okudu — bilgileri kontrol edip onaylayın';
    showScreen('screen-verify');

  } catch (e) {
    console.error('Hata:', e);
    document.getElementById('ocr-loading').style.display = 'none';
    showToast('Hata: ' + e.message);
    fillForm({});
    showScreen('screen-verify');
  }
}

function saveContact(note, category) {
  const formData = readForm();
  if (editMode && currentDetailId) {
    const idx = contacts.findIndex(x => x.id === currentDetailId);
    if (idx !== -1) contacts[idx] = { ...contacts[idx], ...formData, note, category };
    editMode = false;
  } else {
    contacts.unshift({ id: Date.now().toString(), ...formData, note, category, createdAt: new Date().toISOString() });
  }
  saveContacts();
  filterAndRender();
  showToast('✓ Kaydedildi');
  showScreen('screen-home');
  selectedCategory = '';
}

function exportExcel() {
  if (!contacts.length) { showToast('Henüz kişi yok'); return; }
  const rows = contacts.map(c => ({
    'Ad Soyad': c.name||'', 'Firma': c.company||'', 'Unvan': c.title||'',
    'Telefon': c.phone||'', 'Fax': c.fax||'', 'E-posta': c.email||'',
    'Web sitesi': c.web||'', 'Adres': c.address||'', 'Sektör': c.sector||'',
    'Kategori': c.category||'', 'Not': c.note||'',
    'Tarih': c.createdAt ? new Date(c.createdAt).toLocaleDateString('tr-TR') : '',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{wch:20},{wch:22},{wch:18},{wch:16},{wch:14},{wch:26},{wch:22},{wch:28},{wch:14},{wch:14},{wch:40},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, 'Kişiler');
  XLSX.writeFile(wb, 'KartCRM_Kisiler.xlsx');
  showToast('✓ Excel indirildi');
}

function exportPDF() {
  if (!contacts.length) { showToast('Henüz kişi yok'); return; }
  const rows = contacts.map(c => `<tr><td>${c.name||''}</td><td>${c.company||''}</td><td>${c.title||''}</td><td>${c.phone||''}</td><td>${c.email||''}</td><td>${c.web||''}</td><td>${c.sector||''}</td><td>${c.category||''}</td><td>${c.note||''}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;font-size:10px;padding:20px;}h1{color:#4B5FFA;}table{width:100%;border-collapse:collapse;}th{background:#4B5FFA;color:#fff;padding:7px 5px;text-align:left;}td{padding:6px 5px;border-bottom:1px solid #EEF0F8;}tr:nth-child(even) td{background:#F4F5FB;}</style></head><body><h1>KartCRM — Kişi Listesi</h1><p>${contacts.length} kişi · ${new Date().toLocaleDateString('tr-TR')}</p><table><thead><tr><th>Ad Soyad</th><th>Firma</th><th>Unvan</th><th>Telefon</th><th>E-posta</th><th>Web</th><th>Sektör</th><th>Kategori</th><th>Not</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 600); }
}

document.addEventListener('DOMContentLoaded', () => {
  filterAndRender();

  document.getElementById('fab-add').addEventListener('click', () => {
    editMode = false; fillForm({}); showScreen('screen-add');
  });

  document.getElementById('btn-search-toggle').addEventListener('click', () => {
    const bar = document.getElementById('search-bar');
    const hidden = !bar.style.display || bar.style.display === 'none';
    bar.style.display = hidden ? 'flex' : 'none';
    if (hidden) document.getElementById('search-input').focus();
  });

  document.getElementById('search-input').addEventListener('input', filterAndRender);

  document.getElementById('filter-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#filter-chips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    filterAndRender();
  });

  document.getElementById('opt-camera').addEventListener('click', async () => {
    showScreen('screen-camera');
    await startCamera('camera-video');
  });

  document.getElementById('opt-qr').addEventListener('click', async () => {
    showScreen('screen-qr');
    await startCamera('qr-video');
  });

  document.getElementById('opt-manual').addEventListener('click', () => {
    fillForm({});
    document.getElementById('ocr-banner').textContent = '✏️ Bilgileri manuel olarak girin';
    showScreen('screen-verify');
  });

  document.getElementById('btn-capture').addEventListener('click', () => {
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    if (!video.videoWidth) { showToast('Kamera hazır değil'); return; }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
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

  document.getElementById('btn-verify-next').addEventListener('click', () => {
    const name = document.getElementById('f-name').value.trim();
    const errEl = document.getElementById('verify-error');
    if (!name) { errEl.style.display = 'block'; return; }
    errEl.style.display = 'none';
    document.querySelectorAll('#note-chips .chip').forEach(c => c.classList.remove('on'));
    document.getElementById('f-note').value = '';
    selectedCategory = '';
    showScreen('screen-note');
  });

  document.getElementById('note-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#note-chips .chip').forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
    selectedCategory = chip.dataset.cat;
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    saveContact(document.getElementById('f-note').value.trim(), selectedCategory);
  });

  document.getElementById('btn-skip-note').addEventListener('click', () => {
    saveContact('', selectedCategory);
  });

  document.getElementById('btn-delete').addEventListener('click', () => {
    if (!currentDetailId) return;
    if (!confirm('Bu kişiyi silmek istiyor musunuz?')) return;
    contacts = contacts.filter(c => c.id !== currentDetailId);
    saveContacts(); filterAndRender();
    showToast('🗑 Silindi');
    showScreen('screen-home');
  });

  document.getElementById('btn-edit').addEventListener('click', () => {
    const c = contacts.find(x => x.id === currentDetailId);
    if (!c) return;
    editMode = true;
    fillForm(c);
    document.getElementById('ocr-banner').textContent = '✏️ Bilgileri düzenleyin';
    showScreen('screen-verify');
  });

  document.getElementById('btn-export-excel').addEventListener('click', exportExcel);
  document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);

  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => { stopAllCameras(); showScreen(btn.dataset.back); });
  });

  document.querySelectorAll('[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });
});

