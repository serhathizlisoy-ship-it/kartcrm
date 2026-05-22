import { showScreen, showToast, getInitials } from './js/ui.js';
import { authToken, currentUser, initAuth, switchTab, logout, apiGet, apiPost } from './js/auth.js';
import { loadContacts, initContacts, contacts, openDetail } from './js/contacts.js';
import { startCamera, stopCamera, initCamera, fillVerifyForm } from './js/camera.js';
import { startMeetingFlow } from './js/meetings.js';
import { exportExcel, exportPDF } from './js/export.js';

let userCompanies = [];

window.switchTab = switchTab;
window.showScreen = showScreen;

async function initApp() {
  const { authToken: token, currentUser: user } = await import('./js/auth.js');
  if (!token || !user) { showScreen('screen-auth'); return; }

  const name = user.full_name || user.email.split('@')[0];
  document.getElementById('greeting-text').textContent = `Merhaba, ${name} 👋`;
  document.getElementById('profile-name').textContent = user.full_name || '-';
  document.getElementById('profile-email').textContent = user.email || '-';
  document.getElementById('profile-avatar').textContent = getInitials(user.full_name || user.email);

  showScreen('screen-home');
  loadContacts();
  loadUserCompanies();
  loadReminders();
  updateNotifStatus();
}

// =====================
// REMINDERS
// =====================
async function loadReminders() {
  const data = await apiGet('/api/reminders');
  if (!data) return;
  const bar = document.getElementById('reminders-bar');
  const list = document.getElementById('reminders-list');
  document.getElementById('stat-reminders').textContent = data.length;
  if (data.length === 0) { bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  list.innerHTML = data.map(r => `
    <div class="reminder-item">
      <div class="rem-dot"></div>
      <div>
        <strong>${r.full_name || ''}</strong>
        <div style="font-size:11px; color:var(--text2);">${r.message}</div>
      </div>
    </div>
  `).join('');
}

// =====================
// USER COMPANIES
// =====================
async function loadUserCompanies() {
  const data = await apiGet('/api/usercompanies');
  if (!data) return;
  userCompanies = data;
  renderUserCompanies();
}

function renderUserCompanies() {
  const list = document.getElementById('user-companies-list');
  if (!list) return;
  if (userCompanies.length === 0) {
    list.innerHTML = '<div style="font-size:12px; color:var(--text3); padding:8px 0;">Henüz şirket eklenmedi</div>';
    return;
  }
  list.innerHTML = userCompanies.map(c => `
    <div class="p-card" style="margin-bottom:8px;">
      <div class="p-card-inner">
        <div class="avatar" style="background:#EEF0FF; color:#4B5FFA; border-radius:10px; font-size:16px;">🏢</div>
        <div class="p-info">
          <div class="p-name">${c.company_name}</div>
          <div class="p-title">${c.title || ''} ${c.is_default ? '⭐' : ''}</div>
        </div>
        <button onclick="deleteUserCompany('${c.id}')" style="margin-left:auto; background:#FEF2F2; color:#DC2626; border:none; border-radius:8px; padding:4px 10px; font-size:11px; cursor:pointer; font-weight:700;">Sil</button>
      </div>
    </div>
  `).join('');
}

window.deleteUserCompany = async function(id) {
  if (!confirm('Bu şirketi silmek istiyor musunuz?')) return;
  const { apiDelete } = await import('./js/auth.js');
  await apiDelete(`/api/usercompanies?id=${id}`);
  await loadUserCompanies();
  showToast('Şirket silindi');
};

// =====================
// VERIFY FORM
// =====================
function readForm() {
  return {
    full_name: document.getElementById('f-name').value.trim(),
    company_name: document.getElementById('f-company').value.trim(),
    title: document.getElementById('f-title').value.trim(),
    phone: document.getElementById('f-phone').value.trim(),
    gsm: document.getElementById('f-gsm').value.trim(),
    fax: document.getElementById('f-fax').value.trim(),
    email: document.getElementById('f-email').value.trim(),
    web: document.getElementById('f-web').value.trim(),
    address: document.getElementById('f-address').value.trim(),
    sector: document.getElementById('f-sector').value.trim(),
  };
}

async function saveContact() {
  const formData = readForm();
  if (!formData.full_name) {
    document.getElementById('verify-error').style.display = 'block';
    return;
  }
  document.getElementById('verify-error').style.display = 'none';

  const data = await apiPost('/api/contacts', formData);
  if (data && !data.error) {
    await loadContacts();
    showToast('✓ Kişi kaydedildi');

    // Görüşme akışını başlat
    startMeetingFlow(data.id, formData.full_name, null);
  } else {
    showToast('Kayıt hatası: ' + (data?.error || ''));
  }
}

// =====================
// BİLDİRİM
// =====================
async function requestNotificationPermission() {
  if (!('Notification' in window)) { showToast('Tarayıcı bildirimleri desteklemiyor'); return; }
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    document.getElementById('notif-status').textContent = 'Aktif ✓';
    showToast('✓ Bildirimler aktif');
  } else {
    document.getElementById('notif-status').textContent = 'Reddedildi';
    showToast('Bildirim izni reddedildi');
  }
}

function updateNotifStatus() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    document.getElementById('notif-status').textContent = 'Aktif ✓';
  } else if (Notification.permission === 'denied') {
    document.getElementById('notif-status').textContent = 'Reddedildi';
  }
}

// =====================
// EVENT LISTENERS
// =====================
document.addEventListener('DOMContentLoaded', () => {
  const { authToken, currentUser } = { 
    authToken: localStorage.getItem('kartcrm_token'),
    currentUser: JSON.parse(localStorage.getItem('kartcrm_user') || 'null')
  };

  if (authToken && currentUser) { initApp(); }
  else { showScreen('screen-auth'); }

  initAuth();
  initContacts();
  initCamera();

  window.addEventListener('auth:login', initApp);

  // FAB
  document.getElementById('fab-add')?.addEventListener('click', () => {
    fillVerifyForm({});
    showScreen('screen-add');
  });

  // Add options
  document.getElementById('opt-camera')?.addEventListener('click', async () => {
    showScreen('screen-camera');
    await startCamera();
  });
  document.getElementById('opt-manual')?.addEventListener('click', () => {
    fillVerifyForm({});
    document.getElementById('ocr-banner').textContent = '✏️ Bilgileri manuel olarak girin';
    showScreen('screen-verify');
  });

  // Verify
  document.getElementById('btn-verify-next')?.addEventListener('click', saveContact);

  // Back buttons
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => { stopCamera(); showScreen(btn.dataset.back); });
  });

  // Nav
  document.querySelectorAll('[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });

  // Export
  document.getElementById('btn-export-excel')?.addEventListener('click', () => exportExcel(contacts));
  document.getElementById('btn-export-pdf')?.addEventListener('click', () => exportPDF(contacts));

  // Notification
  document.getElementById('btn-notif-toggle')?.addEventListener('click', requestNotificationPermission);

  // User company form
  document.getElementById('btn-add-company')?.addEventListener('click', () => {
    document.getElementById('add-company-form').style.display = 'block';
  });
  document.getElementById('btn-cancel-company')?.addEventListener('click', () => {
    document.getElementById('add-company-form').style.display = 'none';
  });
  document.getElementById('btn-save-company')?.addEventListener('click', async () => {
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
    }
  });
});
