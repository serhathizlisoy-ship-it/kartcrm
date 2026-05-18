// =====================
// KARTCRM - app.js
// =====================

const CLAUDE_API_KEY = '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'; // Buraya kendi API anahtarını yaz

// =====================
// STATE
// =====================
let contacts = JSON.parse(localStorage.getItem('kartcrm_contacts') || '[]');
let currentContact = {};
let selectedCategory = '';
let activeFilter = 'all';
let cameraStream = null;
let currentDetailId = null;

// =====================
// YARDIMCI FONKSİYONLAR
// =====================
function saveContacts() {
  localStorage.setItem('kartcrm_contacts', JSON.stringify(contacts));
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  if (screen) screen.classList.add('active');
  window.scrollTo(0, 0);
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(name) {
  const colors = [
    { bg: '#EEF0FF', color: '#4B5FFA' },
    { bg: '#F0FDF4', color: '#16A34A' },
    { bg: '#FFFBEB', color: '#D97706' },
    { bg: '#FEF2F2', color: '#DC2626' },
    { bg: '#F5F3FF', color: '#7C3AED' },
    { bg: '#EFF6FF', color: '#1D4ED8' },
  ];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}

function getCategoryTag(cat) {
  const map = {
    'İş görüşmesi': 'tag-blue',
    'Toplantı':     'tag-green',
    'Fuar':         'tag-amber',
    'Yemek':        'tag-purple',
    'Karşılaşma':   'tag-gray',
    'Dernek':       'tag-gray',
    'Diğer':        'tag-gray',
  };
  return map[cat] || 'tag-gray';
}

function stopCamera(videoEl) {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  if (videoEl) videoEl.srcObject = null;
}

// =====================
// ANA SAYFA
// =====================
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

  // Export summary
  const sumBusiness = contacts.filter(c => c.category === 'İş görüşmesi').length;
  const sumEl = document.getElementById('sum-total');
  if (sumEl) {
    document.getElementById('sum-total').textContent = total;
    document.getElementById('sum-business').textContent = sumBusiness;
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
    const col = getAvatarColor(c.name || 'A');
    const initials = getInitials(c.name || '?');
    const tagClass = getCategoryTag(c.category);
    return `
      <div class="p-card" data-id="${c.id}">
        <div class="p-card-top">
          <div class="avatar" style="background:${col.bg}; color:${col.color};">${initials}</div>
          <div>
            <div class="p-name">${c.name}</div>
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
  const search = document.getElementById('search-input')?.value?.toLowerCase() || '';

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

// =====================
// DETAY
// =====================
function openDetail(id) {
  const c = contacts.find(x => x.id === id);
  if (!c) return;
  currentDetailId = id;

  const col = getAvatarColor(c.name || 'A');
  document.getElementById('detail-avatar').textContent = getInitials(c.name || '?');
  document.getElementById('detail-avatar').style.background = 'rgba(255,255,255,0.2)';
  document.getElementById('detail-name').textContent = c.name;
  document.getElementById('detail-sub').textContent = [c.title, c.company].filter(Boolean).join(' · ');

  const tagWrap = document.getElementById('detail-tag-wrap');
  tagWrap.innerHTML = c.category
    ? `<span class="tag" style="background:rgba(255,255,255,0.2); color:#fff; font-size:10px;">${c.category}</span>`
    : '';

  const info = document.getElementById('detail-info');
  const rows = [
    { icon: '📞', lbl: 'Tel', val: c.phone, link: c.phone ? `tel:${c.phone}` : null },
    { icon: '📠', lbl: 'Fax', val: c.fax },
    { icon: '✉️', lbl: 'Mail', val: c.email, link: c.email ? `mailto:${c.email}` : null },
    { icon: '🌐', lbl: 'Web', val: c.web, link: c.web ? (c.web.startsWith('http') ? c.web : 'https://' + c.web) : null },
    { icon: '📍', lbl: 'Adres', val: c.address },
    { icon: '🏭', lbl: 'Sektör', val: c.sector },
  ].filter(r => r.val);

  info.innerHTML = rows.map(r => `
    <div class="info-row">
      <div class="info-icon">${r.icon}</div>
      <span class="info-lbl">${r.lbl}</span>
      ${r.link
        ? `<a class="info-val lnk" href="${r.link}">${r.val}</a>`
        : `<span class="info-val">${r.val}</span>`
      }
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

// =====================
// KAMERA
// =====================
async function startCamera(videoId) {
  stopCamera(document.getElementById(videoId));
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    const video = document.getElementById(videoId);
    video.srcObject = cameraStream;
  } catch (e) {
    showToast('Kamera erişimi reddedildi');
  }
}

function capturePhoto() {
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  stopCamera(video);
  sendToAI(dataUrl);
}

// =====================
// AI — CLAUDE API
// =====================
async function sendToAI(dataUrl) {
  document.getElementById('ocr-loading').style.display = 'block';
  showScreen('screen-camera');

  const base64 = dataUrl.split(',')[1];

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
            },
            {
              type: 'text',
              text: `Bu kartvizit görüntüsündeki bilgileri çıkar. Sadece JSON formatında yanıt ver, başka hiçbir şey yazma:
{
  "name": "Ad Soyad",
  "company": "Firma adı",
  "title": "Unvan",
  "phone": "Telefon",
  "fax": "Fax",
  "email": "Email",
  "web": "Web sitesi",
  "address": "Adres",
  "sector": "Sektör (tahmin et)"
}
Bulamazsan boş string bırak.`
            }
          ]
        }]
      })
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
console.log('AI yanıtı:', parsed);

    currentContact = { ...currentContact, ...parsed };
    fillVerifyForm(parsed);
    document.getElementById('ocr-loading').style.display = 'none';
    document.getElementById('ocr-banner').textContent = '✦ AI okudu — bilgileri kontrol edip onaylayın';
    showScreen('screen-verify');
  } catch (e) {
    document.getElementById('ocr-loading').style.display = 'none';
    showToast('AI okuma başarısız, lütfen manuel girin');
    fillVerifyForm({});
    showScreen('screen-verify');
  }
}

function fillVerifyForm(data) {
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

function readVerifyForm() {
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

// =====================
// KAYDET
// =====================
function saveContact(note, category) {
  const formData = readVerifyForm();
  const contact = {
    id: Date.now().toString(),
    ...formData,
    note,
    category,
    createdAt: new Date().toISOString(),
  };
  contacts.unshift(contact);
  saveContacts();
  filterAndRender();
  showToast('✓ Kişi kaydedildi');
  showScreen('screen-home');
  currentContact = {};
  selectedCategory = '';
}

// =====================
// EXPORT
// =====================
function exportExcel() {
  if (contacts.length === 0) { showToast('Henüz kişi yok'); return; }

  const rows = contacts.map(c => ({
    'Ad Soyad': c.name || '',
    'Firma': c.company || '',
    'Unvan': c.title || '',
    'Telefon': c.phone || '',
    'Fax': c.fax || '',
    'E-posta': c.email || '',
    'Web sitesi': c.web || '',
    'Adres': c.address || '',
    'Sektör': c.sector || '',
    'Kategori': c.category || '',
    'Not': c.note || '',
    'Eklenme Tarihi': c.createdAt ? new Date(c.createdAt).toLocaleDateString('tr-TR') : '',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    {wch:20},{wch:22},{wch:18},{wch:16},{wch:14},{wch:26},{wch:22},{wch:28},{wch:14},{wch:14},{wch:40},{wch:14}
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Kişiler');
  XLSX.writeFile(wb, 'KartCRM_Kisiler.xlsx');
  showToast('✓ Excel indirildi');
}

function exportPDF() {
  if (contacts.length === 0) { showToast('Henüz kişi yok'); return; }

  const rows = contacts.map(c => `
    <tr>
      <td>${c.name || ''}</td>
      <td>${c.company || ''}</td>
      <td>${c.title || ''}</td>
      <td>${c.phone || ''}</td>
      <td>${c.email || ''}</td>
      <td>${c.web || ''}</td>
      <td>${c.sector || ''}</td>
      <td>${c.category || ''}</td>
      <td>${c.note || ''}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8">
    <style>
      body { font-family: Arial, sans-serif; font-size: 10px; }
      h1 { color: #4B5FFA; font-size: 18px; margin-bottom: 8px; }
      p { color: #6B7280; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #4B5FFA; color: #fff; padding: 8px 6px; text-align: left; font-size: 10px; }
      td { padding: 7px 6px; border-bottom: 1px solid #EEF0F8; }
      tr:nth-child(even) td { background: #F4F5FB; }
    </style></head><body>
    <h1>🪪 KartCRM — Kişi Listesi</h1>
    <p>Toplam ${contacts.length} kişi · ${new Date().toLocaleDateString('tr-TR')}</p>
    <table>
      <thead><tr>
        <th>Ad Soyad</th><th>Firma</th><th>Unvan</th><th>Telefon</th>
        <th>E-posta</th><th>Web</th><th>Sektör</th><th>Kategori</th><th>Not</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </body></html>
  `;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// =====================
// EVENT LISTENERS
// =====================
document.addEventListener('DOMContentLoaded', () => {
  filterAndRender();

  // FAB
  document.getElementById('fab-add').addEventListener('click', () => {
    fillVerifyForm({});
    showScreen('screen-add');
  });

  // SEARCH TOGGLE
  document.getElementById('btn-search-toggle').addEventListener('click', () => {
    const bar = document.getElementById('search-bar');
    bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
    if (bar.style.display === 'flex') document.getElementById('search-input').focus();
  });

  document.getElementById('search-input').addEventListener('input', filterAndRender);

  // FILTER CHIPS
  document.getElementById('filter-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#filter-chips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    filterAndRender();
  });

  // ADD OPTIONS
  document.getElementById('opt-camera').addEventListener('click', async () => {
    showScreen('screen-camera');
    await startCamera('camera-video');
  });

  document.getElementById('opt-qr').addEventListener('click', async () => {
    showScreen('screen-qr');
    await startCamera('qr-video');
    startQRScan();
  });

  document.getElementById('opt-manual').addEventListener('click', () => {
    fillVerifyForm({});
    document.getElementById('ocr-banner').textContent = '✏️ Bilgileri manuel olarak girin';
    showScreen('screen-verify');
  });

  // CAMERA BUTTONS
  document.getElementById('btn-capture').addEventListener('click', capturePhoto);

  document.getElementById('btn-gallery').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  document.getElementById('file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      stopCamera(document.getElementById('camera-video'));
      sendToAI(ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  // VERIFY NEXT
  document.getElementById('btn-verify-next').addEventListener('click', () => {
    const name = document.getElementById('f-name').value.trim();
    if (!name) {
      document.getElementById('verify-error').style.display = 'block';
      return;
    }
    document.getElementById('verify-error').style.display = 'none';

    // Reset note chips
    document.querySelectorAll('#note-chips .chip').forEach(c => c.classList.remove('on'));
    document.getElementById('f-note').value = '';
    selectedCategory = '';
    showScreen('screen-note');
  });

  // NOTE CHIPS
  document.getElementById('note-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#note-chips .chip').forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
    selectedCategory = chip.dataset.cat;
  });

  // SAVE
  document.getElementById('btn-save').addEventListener('click', () => {
    const note = document.getElementById('f-note').value.trim();
    saveContact(note, selectedCategory);
  });

  document.getElementById('btn-skip-note').addEventListener('click', () => {
    saveContact('', selectedCategory);
  });

  // DELETE
  document.getElementById('btn-delete').addEventListener('click', () => {
    if (!currentDetailId) return;
    if (!confirm('Bu kişiyi silmek istediğinizden emin misiniz?')) return;
    contacts = contacts.filter(c => c.id !== currentDetailId);
    saveContacts();
    filterAndRender();
    showToast('🗑 Kişi silindi');
    showScreen('screen-home');
  });

  // EXPORT
  document.getElementById('btn-export-excel').addEventListener('click', exportExcel);
  document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);

  // BACK BUTTONS
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.back;
      stopCamera(document.getElementById('camera-video'));
      stopCamera(document.getElementById('qr-video'));
      showScreen(target);
    });
  });

  // NAV BUTTONS
  document.querySelectorAll('[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => {
      showScreen(btn.dataset.screen);
    });
  });

  // EDIT
  document.getElementById('btn-edit').addEventListener('click', () => {
    const c = contacts.find(x => x.id === currentDetailId);
    if (!c) return;
    fillVerifyForm(c);
    document.getElementById('ocr-banner').textContent = '✏️ Bilgileri düzenleyin';

    // Geçici olarak güncelleme modunda kaydet
    document.getElementById('btn-verify-next').onclick = () => {
      const name = document.getElementById('f-name').value.trim();
      if (!name) { document.getElementById('verify-error').style.display = 'block'; return; }
      document.getElementById('verify-error').style.display = 'none';
      const updated = { ...c, ...readVerifyForm() };
      const idx = contacts.findIndex(x => x.id === currentDetailId);
      contacts[idx] = updated;
      saveContacts();
      filterAndRender();
      showToast('✓ Güncellendi');
      openDetail(currentDetailId);

      // Orijinal davranışı geri yükle
      document.getElementById('btn-verify-next').onclick = null;
      document.getElementById('btn-verify-next').addEventListener('click', () => {
        const nm = document.getElementById('f-name').value.trim();
        if (!nm) { document.getElementById('verify-error').style.display = 'block'; return; }
        document.getElementById('verify-error').style.display = 'none';
        document.querySelectorAll('#note-chips .chip').forEach(c => c.classList.remove('on'));
        document.getElementById('f-note').value = '';
        selectedCategory = '';
        showScreen('screen-note');
      });
    };

    showScreen('screen-verify');
  });
});

// =====================
// QR TARAMA (basit URL parse)
// =====================
function startQRScan() {
  // QR kütüphanesi olmadan basit URL yakalama
  // Gerçek QR için html5-qrcode kütüphanesi eklenecek
  document.getElementById('qr-status').textContent = '📱 QR kod bekleniyor... (yakında tam destek)';
}

// =====================
// SERVICE WORKER
// =====================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
