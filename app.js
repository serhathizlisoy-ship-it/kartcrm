// =====================
// KARTCRM v3 - app.js (tek dosya)
// =====================

// ---- UI ----
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  var s = document.getElementById(id);
  if (s) { s.classList.add('active'); s.scrollTop = 0; }
}
window.showScreen = showScreen;

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 2800);
}

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(function(n) { return n[0]; }).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(name) {
  var palettes = [
    { bg: '#EEF0FF', color: '#4B5FFA' },
    { bg: '#F0FDF4', color: '#16A34A' },
    { bg: '#FFFBEB', color: '#D97706' },
    { bg: '#FEF2F2', color: '#DC2626' },
    { bg: '#F5F3FF', color: '#7C3AED' },
    { bg: '#EFF6FF', color: '#1D4ED8' },
  ];
  var idx = (name || 'A').charCodeAt(0) % palettes.length;
  return palettes[idx];
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ---- AUTH ----
var authToken = localStorage.getItem('kartcrm_token');
var currentUser = JSON.parse(localStorage.getItem('kartcrm_user') || 'null');

function setAuth(token, user) {
  authToken = token;
  currentUser = user;
  localStorage.setItem('kartcrm_token', token);
  localStorage.setItem('kartcrm_user', JSON.stringify(user));
}

function clearAuth() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('kartcrm_token');
  localStorage.removeItem('kartcrm_user');
}

function logout() {
  clearAuth();
  contacts = [];
  showScreen('screen-auth');
}

async function apiGet(path) {
  var res = await fetch(path, { headers: { 'Authorization': 'Bearer ' + authToken } });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

async function apiPost(path, body) {
  var res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify(body)
  });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

async function apiDelete(path) {
  var res = await fetch(path, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + authToken } });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

async function apiPut(path, body) {
  var res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
    body: JSON.stringify(body || {})
  });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

window.switchTab = function(tab) {
  document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
};

async function login() {
  var email = document.getElementById('login-email').value.trim();
  var password = document.getElementById('login-password').value;
  var errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Tüm alanları doldurun'; return; }
  try {
    var res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    });
    var data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }
    setAuth(data.token, data.user);
    initApp();
  } catch(e) { errEl.textContent = 'Bağlantı hatası'; }
}

async function register() {
  var name = document.getElementById('reg-name').value.trim();
  var email = document.getElementById('reg-email').value.trim();
  var password = document.getElementById('reg-password').value;
  var errEl = document.getElementById('reg-error');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Tüm alanları doldurun'; return; }
  if (password.length < 6) { errEl.textContent = 'Şifre en az 6 karakter olmalı'; return; }
  try {
    var res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password, full_name: name })
    });
    var data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }
    setAuth(data.token, data.user);
    initApp();
  } catch(e) { errEl.textContent = 'Bağlantı hatası'; }
}

// ---- CONTACTS ----
var contacts = [];
var userCompaniesCache = [];
var searchQuery = '';

async function loadContacts() {
  var data = await apiGet('/api/contacts' + (viewingMemberId ? '?member_id=' + viewingMemberId : ''));
  if (!data) return;
  if (data.contacts) {
    contacts = data.contacts;
    userCompaniesCache = data.userCompanies || [];
  } else {
    contacts = Array.isArray(data) ? data : [];
  }
  renderContacts();
  updateStats();
}

function renderContacts() {
  var container = document.getElementById('contacts-list');
  var empty = document.getElementById('empty-state');
  if (!container) return;

  var list = contacts.slice();
  if (searchQuery) {
    list = list.filter(function(c) {
      return (c.full_name || '').toLowerCase().includes(searchQuery) ||
             (c.company_name || '').toLowerCase().includes(searchQuery);
    });
  }

  if (list.length === 0) {
    container.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  // Kullanici sirketlerine gore grupla
  var groups = {};
  userCompaniesCache.forEach(function(uc) {
    groups[uc.id] = { id: uc.id, name: uc.company_name, title: uc.title, contacts: [] };
  });
  groups['__unassigned__'] = { id: '__unassigned__', name: 'Diger', title: '', contacts: [] };

  list.forEach(function(c) {
    var ucIds = [];
    if (c.user_company_ids) {
      try { ucIds = Array.isArray(c.user_company_ids) ? c.user_company_ids : JSON.parse(c.user_company_ids); }
      catch(e) { ucIds = []; }
    }
    if (ucIds.length === 0) {
      groups['__unassigned__'].contacts.push(c);
    } else {
      var added = false;
      ucIds.forEach(function(ucId) {
        if (groups[ucId]) { groups[ucId].contacts.push(c); added = true; }
      });
      if (!added) groups['__unassigned__'].contacts.push(c);
    }
  });

  var groupList = Object.values(groups).filter(function(g) { return g.contacts.length > 0; })
    .sort(function(a, b) {
      if (a.id === '__unassigned__') return 1;
      if (b.id === '__unassigned__') return -1;
      return b.contacts.length - a.contacts.length;
    });

  container.innerHTML = groupList.map(function(g) {
    return '<div class="company-group">' +
      '<div class="company-group-header" onclick="this.parentElement.classList.toggle(\'collapsed\')">' +
        '<div><div class="company-group-name">' + g.name + '</div>' +
        (g.title ? '<div class="company-group-sector">' + g.title + '</div>' : '') + '</div>' +
        '<div class="company-group-count">' + g.contacts.length + '</div>' +
      '</div>' +
      '<div class="company-group-list">' +
        g.contacts.map(function(c) {
          var col = getAvatarColor(c.full_name);
          return '<div class="p-card" data-id="' + c.id + '">' +
            '<div class="p-card-inner">' +
              '<div class="avatar" style="background:' + col.bg + ';color:' + col.color + ';">' + getInitials(c.full_name) + '</div>' +
              '<div class="p-info"><div class="p-name">' + c.full_name + '</div>' +
              (c.title ? '<div class="p-title">' + c.title + '</div>' : '') + '</div>' +
              (c.next_action_date ? '<div class="p-alert">⚡</div>' : '') +
            '</div></div>';
        }).join('') +
      '</div></div>';
  }).join('');

  container.querySelectorAll('.p-card').forEach(function(card) {
    card.addEventListener('click', function() { openDetail(card.dataset.id); });
  });
}

function updateStats() {
  var total = contacts.length;
  document.getElementById('stat-total').textContent = total;
  var sumTotal = document.getElementById('sum-total');
  var sumBusiness = document.getElementById('sum-business');
  if (sumTotal) sumTotal.textContent = total;
  if (sumBusiness) sumBusiness.textContent = contacts.filter(function(c) { return c.category === 'İş görüşmesi'; }).length;
}

function openDetail(id) {
  var c = contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  window._currentDetailId = id;

  var col = getAvatarColor(c.full_name);
  var av = document.getElementById('detail-avatar');
  av.textContent = getInitials(c.full_name);
  av.style.background = col.bg;
  av.style.color = col.color;
  document.getElementById('detail-name').textContent = c.full_name || '';
  document.getElementById('detail-sub').textContent = [c.title, c.company_name].filter(Boolean).join(' · ');

  var rows = [
    { lbl: 'Tel',   val: c.phone,   href: c.phone ? 'tel:' + c.phone : null },
    { lbl: 'GSM',   val: c.gsm,     href: c.gsm ? 'tel:' + c.gsm : null },
    { lbl: 'Fax',   val: c.fax },
    { lbl: 'Mail',  val: c.email,   href: c.email ? 'mailto:' + c.email : null },
    { lbl: 'Web',   val: c.web,     href: c.web ? (c.web.startsWith('http') ? c.web : 'https://' + c.web) : null },
    { lbl: 'Adres', val: c.address },
    { lbl: 'Sektör',val: c.sector },
  ].filter(function(r) { return r.val; });

  document.getElementById('detail-info').innerHTML = rows.map(function(r) {
    return '<div class="info-row"><span class="info-lbl">' + r.lbl + '</span>' +
      (r.href ? '<a class="info-val lnk" href="' + r.href + '">' + r.val + '</a>' : '<span class="info-val">' + r.val + '</span>') +
      '</div>';
  }).join('');

  var btnMeeting = document.getElementById('btn-add-meeting');
  if (btnMeeting) {
    var newBtn = btnMeeting.cloneNode(true);
    btnMeeting.parentNode.replaceChild(newBtn, btnMeeting);
    newBtn.addEventListener('click', function() { startMeetingFlow(c.id, c.full_name, c.company_id); });
  }

  // btn-edit'e contact id yaz
  var btnEditEl = document.getElementById('btn-edit');
  if (btnEditEl) btnEditEl.setAttribute('data-contact-id', c.id);

  loadMeetingCards(c.id);
  showScreen('screen-detail');
}

// ---- CAMERA ----
var cameraStream = null;

function stopCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(function(t) { t.stop(); }); cameraStream = null; }
  var v = document.getElementById('camera-video');
  if (v) v.srcObject = null;
}

async function startCamera() {
  stopCamera();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    var video = document.getElementById('camera-video');
    video.srcObject = cameraStream;
    await video.play();
  } catch(e) { showToast('Kamera açılamadı'); }
}

async function sendToOCR(dataUrl) {
  var resized = await resizeImage(dataUrl);
  var base64 = resized.split(',')[1];
  document.getElementById('ocr-loading').style.display = 'block';
  try {
    var response = await fetch('https://kartcrm.vercel.app/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 })
    });
    if (!response.ok) throw new Error('Sunucu hatası: ' + response.status);
    var parsed = await response.json();
    document.getElementById('ocr-loading').style.display = 'none';
    return parsed;
  } catch(e) {
    document.getElementById('ocr-loading').style.display = 'none';
    showToast('OCR hatası: ' + e.message);
    return {};
  }
}

function resizeImage(dataUrl) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var ratio = Math.min(1000 / img.width, 1);
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.src = dataUrl;
  });
}

function fillVerifyForm(data) {
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
  document.getElementById('ocr-banner').textContent = '✦ AI okudu — bilgileri kontrol edip onaylayın';
}

function readForm() {
  return {
    full_name:    document.getElementById('f-name').value.trim(),
    company_name: document.getElementById('f-company').value.trim(),
    title:        document.getElementById('f-title').value.trim(),
    phone:        document.getElementById('f-phone').value.trim(),
    gsm:          document.getElementById('f-gsm').value.trim(),
    fax:          document.getElementById('f-fax').value.trim(),
    email:        document.getElementById('f-email').value.trim(),
    web:          document.getElementById('f-web').value.trim(),
    address:      document.getElementById('f-address').value.trim(),
    sector:       document.getElementById('f-sector').value.trim(),
  };
}

// ---- MEETINGS ----
var meetingData = { personId: null, personName: null, companyId: null, userCompanyIds: [], userCompanyNames: [], category: null, city: null, notes: '', step: 1 };
var aiResult = null;
var recognition = null;
var isRecording = false;

function startMeetingFlow(personId, personName, companyId) {
  meetingData = { personId: personId, personName: personName, companyId: companyId, userCompanyIds: [], userCompanyNames: [], category: null, city: null, notes: '', step: 1 };
  aiResult = null;
  renderStep1();
  showScreen('screen-meeting');
}

function renderStepBar(current) {
  var bar = document.getElementById('meeting-step-bar');
  if (!bar) return;
  bar.innerHTML = [1,2,3,4].map(function(i) {
    return '<div class="step-dot ' + (i < current ? 'done' : i === current ? 'active' : '') + '"></div>';
  }).join('');
}

function renderPersonTag() {
  var el = document.getElementById('meeting-person-tag');
  if (!el) return;
  var initials = (meetingData.personName || '?').split(' ').map(function(n) { return n[0]; }).join('').slice(0,2);
  el.innerHTML = '<div class="person-tag-inner"><div class="meeting-avatar">' + initials + '</div><div><div class="meeting-person-name">' + (meetingData.personName || '') + '</div></div></div>';
}

async function renderStep1() {
  meetingData.step = 1;
  renderStepBar(1);
  renderPersonTag();
  var body = document.getElementById('meeting-body');
  var companies = await apiGet('/api/usercompanies');

  if (!companies || companies.length === 0) {
    body.innerHTML = '<div class="step-question">Kimi temsil ediyordun?</div><div class="step-sub">Bir veya birden fazla seçebilirsin</div><div class="warning-box"><div class="warning-text">Kayıtlı Şirket Kimliğiniz Bulunamadı.<br>Lütfen sisteme şirket girişi yapınız.</div><button class="warning-btn" onclick="showScreen(\'screen-profile\')">Şirket Ekle</button></div><button class="btn-skip" onclick="nextMeetingStep()">Şimdi Değil, Geç</button>';
    return;
  }

  var defaultCo = companies.find(function(c) { return c.is_default; });
  if (defaultCo) {
    meetingData.userCompanyIds = [defaultCo.id];
    meetingData.userCompanyNames = [defaultCo.company_name];
  }

  var html = '<div class="step-question">Kimi temsil ediyordun?</div><div class="step-sub">Bir veya birden fazla seçebilirsin</div><div id="company-list">';
  companies.forEach(function(c) {
    var sel = c.is_default ? 'selected' : '';
    var act = c.is_default ? 'active' : '';
    html += '<div class="company-select-card ' + sel + '" data-id="' + c.id + '" data-name="' + c.company_name + '"><div><div class="cs-name">' + c.company_name + '</div><div class="cs-title">' + (c.title || '') + '</div></div><div class="cs-check ' + act + '">✓</div></div>';
  });
  html += '<div class="company-select-card" data-id="personal" data-name="Şahsen"><div><div class="cs-name">Şahsen</div><div class="cs-title">Kişisel</div></div><div class="cs-check">✓</div></div>';
  html += '</div><button class="btn-meeting-next" id="btn-step1-next">İleri →</button>';
  body.innerHTML = html;

  document.querySelectorAll('.company-select-card').forEach(function(el) {
    el.addEventListener('click', function() { toggleUserCompany(el); });
  });
  document.getElementById('btn-step1-next').addEventListener('click', nextMeetingStep);
}

function toggleUserCompany(el) {
  var id = el.dataset.id;
  var name = el.dataset.name;
  var isSelected = el.classList.contains('selected');
  if (isSelected) {
    el.classList.remove('selected');
    el.querySelector('.cs-check').classList.remove('active');
    meetingData.userCompanyIds = meetingData.userCompanyIds.filter(function(x) { return x !== id; });
    meetingData.userCompanyNames = meetingData.userCompanyNames.filter(function(x) { return x !== name; });
  } else {
    el.classList.add('selected');
    el.querySelector('.cs-check').classList.add('active');
    if (id !== 'personal') {
      meetingData.userCompanyIds.push(id);
      meetingData.userCompanyNames.push(name);
    }
  }
}

function renderStep2() {
  meetingData.step = 2;
  renderStepBar(2);
  var cats = ['İş görüşmesi', 'Toplantı', 'Yemek', 'Fuar', 'Dernek', 'Karşılaşma', 'Diğer'];
  var html = '<div class="step-question">Nerede tanıştınız?</div><div class="step-sub">Görüşme ortamını seç</div><div class="cat-grid">';
  cats.forEach(function(c) {
    var sel = meetingData.category === c ? 'selected' : '';
    html += '<div class="cat-card ' + sel + '" data-cat="' + c + '"><div class="cat-label">' + c + '</div></div>';
  });
  html += '</div><input class="form-input" type="text" id="f-city" placeholder="Şehir (isteğe bağlı)" value="' + (meetingData.city || '') + '" style="margin:12px 0;">';
  html += '<button class="btn-meeting-next" id="btn-step2-next">İleri →</button>';
  html += '<button class="btn-skip" id="btn-step2-skip">Geç</button>';
  document.getElementById('meeting-body').innerHTML = html;

  document.querySelectorAll('.cat-card').forEach(function(card) {
    card.addEventListener('click', function() {
      document.querySelectorAll('.cat-card').forEach(function(c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      meetingData.category = card.dataset.cat;
    });
  });
  document.getElementById('btn-step2-next').addEventListener('click', nextMeetingStep);
  document.getElementById('btn-step2-skip').addEventListener('click', nextMeetingStep);
}

function renderStep3() {
  meetingData.step = 3;
  renderStepBar(3);
  var body = document.getElementById('meeting-body');
  body.innerHTML =
    '<div class="step-question">Ne konuştunuz?</div>' +
    '<div class="step-sub">Yaz ya da sesle not bırak</div>' +
    '<textarea class="meeting-textarea" id="f-notes" placeholder="Aklında ne kaldı?">' + (meetingData.notes || '') + '</textarea>' +
    '<button class="mic-btn" id="btn-mic">' +
      '<div class="mic-btn-inner">' +
        '<div class="mic-icon-wrap" id="mic-icon-wrap">🎤</div>' +
        '<div><div class="mic-label" id="mic-label">Sesle Not Al</div><div class="mic-sub">Bas ve konuş</div></div>' +
      '</div>' +
    '</button>' +
    '<button class="btn-meeting-next" id="btn-step3-next">İleri →</button>' +
    '<button class="btn-skip" id="btn-step3-skip">Geç</button>';

  document.getElementById('btn-mic').addEventListener('click', toggleMic);
  document.getElementById('btn-step3-next').addEventListener('click', nextMeetingStep);
  document.getElementById('btn-step3-skip').addEventListener('click', nextMeetingStep);
}

function toggleMic() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Tarayıcınız ses tanımayı desteklemiyor'); return;
  }
  if (isRecording) { if (recognition) recognition.stop(); return; }

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'tr-TR';
  recognition.continuous = false;
  recognition.interimResults = true;

  var textarea = document.getElementById('f-notes');
  var micBtn = document.getElementById('btn-mic');
  var micLabel = document.getElementById('mic-label');
  var micIconWrap = document.getElementById('mic-icon-wrap');
  var finalTranscript = textarea ? textarea.value : '';

  recognition.onstart = function() {
    isRecording = true;
    if (micBtn) micBtn.classList.add('recording');
    if (micLabel) micLabel.textContent = 'Dinleniyor...';
    if (micIconWrap) micIconWrap.innerHTML = '<div class="mic-waves"><span></span><span></span><span></span></div>';
  };

  recognition.onresult = function(e) {
    var interim = '';
    for (var i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript + ' ';
      else interim += e.results[i][0].transcript;
    }
    if (textarea) textarea.value = finalTranscript + interim;
  };

  recognition.onend = function() {
    isRecording = false;
    if (micBtn) micBtn.classList.remove('recording');
    if (micLabel) micLabel.textContent = 'Sesle Not Al';
    if (micIconWrap) micIconWrap.innerHTML = '🎤';
    meetingData.notes = textarea ? textarea.value : '';
  };

  recognition.onerror = function(e) {
    isRecording = false;
    showToast('Ses hatası: ' + e.error);
    if (micBtn) micBtn.classList.remove('recording');
    if (micLabel) micLabel.textContent = 'Sesle Not Al';
    if (micIconWrap) micIconWrap.innerHTML = '🎤';
  };

  recognition.start();
}

async function renderStep4() {
  meetingData.step = 4;
  renderStepBar(4);
  var notesEl = document.getElementById('f-notes');
  if (notesEl) meetingData.notes = notesEl.value;

  document.getElementById('meeting-body').innerHTML =
    '<div class="step-question">Görüşme Kartı</div>' +
    '<div class="step-sub">AI analiz ediyor...</div>' +
    '<div class="ai-loading"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div><span>Görüşme analiz ediliyor</span></div>';

  if (meetingData.notes && meetingData.notes.length > 10) {
    var result = await apiPost('/api/ai', { notes: meetingData.notes, person_name: meetingData.personName });
    if (result && !result.error) aiResult = result;
  }
  renderAiResult(false);
}

function renderAiResult(editMode) {
  var body = document.getElementById('meeting-body');
  var r = aiResult || {};
  var ucNames = meetingData.userCompanyNames || [];
  var ucLabel = ucNames.length > 0 ? '<div class="gc-uc-label">Temsil: <strong>' + ucNames.join(' + ') + '</strong></div>' : '';

  if (editMode) {
    var actionsText = (r.actions || []).map(function(a) { return a.text; }).join('\n');
    var remindersText = (r.reminders || []).map(function(rem) { return (rem.date || '') + ' ' + (rem.time || '') + ' ' + rem.text; }).join('\n');
    body.innerHTML =
      '<div class="step-question">Görüşme Kartı</div>' +
      '<div class="ai-badge-row"><span class="ai-badge" style="background:#FEF3C7;color:#92400E;">Düzenleme Modu</span></div>' +
      ucLabel +
      '<div class="gc-section-lbl">Görüşme Özeti</div><textarea class="meeting-textarea" id="edit-summary" style="min-height:80px;">' + (r.summary || '') + '</textarea>' +
      '<div class="gc-section-lbl">Aksiyonlar (her satır ayrı)</div><textarea class="meeting-textarea" id="edit-actions" style="min-height:80px;">' + actionsText + '</textarea>' +
      '<div class="gc-section-lbl">Hatırlatmalar (YYYY-MM-DD HH:MM metin)</div><textarea class="meeting-textarea" id="edit-reminders" style="min-height:80px;">' + remindersText + '</textarea>' +
      '<div class="gc-section-lbl">Beklenen Dönüş</div><textarea class="meeting-textarea" id="edit-followup" style="min-height:60px;">' + (r.followup || '') + '</textarea>' +
      '<button class="btn-meeting-save" id="btn-apply-edits">Onayla</button>' +
      '<button class="btn-skip" id="btn-cancel-edits">Vazgeç</button>';
    document.getElementById('btn-apply-edits').addEventListener('click', applyEdits);
    document.getElementById('btn-cancel-edits').addEventListener('click', function() { renderAiResult(false); });
    return;
  }

  var html = '<div class="step-question">Görüşme Kartı</div><div class="ai-badge-row"><span class="ai-badge">AI Özeti</span></div>' + ucLabel;
  if (r.summary) html += '<div class="gc-section-lbl">Görüşme Özeti</div><div class="gc-card"><div class="gc-text">' + r.summary + '</div></div>';
  if (r.actions && r.actions.length > 0) {
    html += '<div class="gc-section-lbl">Aksiyonlar</div>';
    r.actions.forEach(function(a, i) {
      html += '<div class="gc-action-item" id="action-' + i + '"><div class="gc-check ' + (a.done ? 'done' : '') + '"></div><div><div class="gc-action-text">' + a.text + '</div>' + (a.person ? '<div class="gc-action-sub">' + a.person + '</div>' : '') + '</div></div>';
    });
  }
  if (r.reminders && r.reminders.length > 0) {
    html += '<div class="gc-section-lbl">Hatırlatmalar</div>';
    r.reminders.forEach(function(rem) {
      html += '<div class="gc-reminder-item"><div class="gc-rem-dot ' + (rem.time ? 'urgent' : '') + '"></div><div class="gc-rem-date">' + (rem.date ? formatDate(rem.date) : 'Bugün') + (rem.time ? ' ' + rem.time : '') + '</div><div class="gc-rem-text">' + rem.text + '</div></div>';
    });
  }
  if (r.followup) html += '<div class="gc-section-lbl">Beklenen Dönüş</div><div class="gc-card"><div class="gc-text">' + r.followup + '</div></div>';
  if (!r.summary && !meetingData.notes) html += '<div class="gc-empty">Not girilmedi. Yine de kaydetmek istiyor musunuz?</div>';
  html += '<button class="btn-meeting-save" id="btn-save-meeting">Kaydet</button>';
  html += '<button class="btn-skip" id="btn-edit-meeting">Düzenle</button>';
  body.innerHTML = html;

  document.getElementById('btn-save-meeting').addEventListener('click', saveMeeting);
  document.getElementById('btn-edit-meeting').addEventListener('click', function() { renderAiResult(true); });
  document.querySelectorAll('.gc-action-item').forEach(function(item, i) {
    item.querySelector('.gc-check').addEventListener('click', function() {
      if (aiResult && aiResult.actions) {
        aiResult.actions[i].done = !aiResult.actions[i].done;
        this.classList.toggle('done');
      }
    });
  });
}

function applyEdits() {
  var summary = document.getElementById('edit-summary') ? document.getElementById('edit-summary').value : '';
  var actionsText = document.getElementById('edit-actions') ? document.getElementById('edit-actions').value : '';
  var remindersText = document.getElementById('edit-reminders') ? document.getElementById('edit-reminders').value : '';
  var followup = document.getElementById('edit-followup') ? document.getElementById('edit-followup').value : '';
  if (!aiResult) aiResult = {};
  aiResult.summary = summary;
  aiResult.actions = actionsText.split('\n').filter(function(l) { return l.trim(); }).map(function(l) { return { text: l.trim(), person: '', done: false }; });
  aiResult.reminders = remindersText.split('\n').filter(function(l) { return l.trim(); }).map(function(l) {
    var parts = l.trim().split(' ');
    var date = parts[0] && parts[0].match(/^\d{4}-\d{2}-\d{2}$/) ? parts[0] : null;
    var time = parts[1] && parts[1].match(/^\d{2}:\d{2}$/) ? parts[1] : null;
    var text = parts.slice(date ? (time ? 2 : 1) : 0).join(' ');
    return { date: date, time: time, text: text };
  });
  aiResult.followup = followup;
  renderAiResult(false);
}

async function saveMeeting() {
  var data = await apiPost('/api/meetings', {
    person_id: meetingData.personId,
    company_id: meetingData.companyId,
    user_company_ids: meetingData.userCompanyIds,
    category: meetingData.category,
    city: meetingData.city,
    notes: meetingData.notes,
    ai_summary: aiResult ? aiResult.summary || '' : '',
    ai_actions: aiResult ? aiResult.actions || [] : [],
    ai_reminders: aiResult ? aiResult.reminders || [] : [],
    ai_followup: aiResult ? aiResult.followup || '' : '',
  });
  if (data && !data.error) {
    showToast('✓ Görüşme Kartı kaydedildi');
    showScreen('screen-home');
    loadContacts();
  } else {
    showToast('Hata: ' + (data ? data.error || '' : ''));
  }
}

function nextMeetingStep() {
  if (meetingData.step === 1) renderStep2();
  else if (meetingData.step === 2) {
    var cityEl = document.getElementById('f-city');
    meetingData.city = cityEl ? cityEl.value : '';
    renderStep3();
  } else if (meetingData.step === 3) {
    var notesEl = document.getElementById('f-notes');
    meetingData.notes = notesEl ? notesEl.value : '';
    renderStep4();
  }
}

async function loadMeetingCards(personId) {
  var meetings = await apiGet('/api/meetings?person_id=' + personId + (viewingMemberId ? '&member_id=' + viewingMemberId : ''));
  if (!meetings) return;
  window._currentMeetings = meetings;
  var container = document.getElementById('meeting-cards-list');
  if (!container) return;
  var header = document.getElementById('meeting-cards-header');
  if (header) header.textContent = 'Görüşme Kartları (' + meetings.length + ')';
  if (meetings.length === 0) { container.innerHTML = '<div class="gc-empty">Henüz görüşme kaydı yok</div>'; return; }
  var html = '';
  meetings.forEach(function(m) {
    var actions = Array.isArray(m.ai_actions) ? m.ai_actions : (m.ai_actions ? JSON.parse(m.ai_actions) : []);
    var reminders = Array.isArray(m.ai_reminders) ? m.ai_reminders : (m.ai_reminders ? JSON.parse(m.ai_reminders) : []);
    var doneActions = actions.filter(function(a) { return a.done; }).length;
    var totalActions = actions.length;
    var ucData = m.user_companies_data || [];
    var roleLabel = ucData.length > 0 ? ucData.map(function(uc) { return uc.company_name; }).join(' + ') : 'Şahsen';
    html += '<div class="gk-card" onclick="openMeetingDetail(\'' + m.id + '\')"><div class="gk-date">' + formatDate(m.created_at) + '</div><span class="gk-role">' + roleLabel + ' adına</span><div class="gk-ozet">' + (m.ai_summary || m.notes || '—') + '</div><div class="gk-meta">';
    if (totalActions > 0) {
      var cls = (doneActions === totalActions) ? 'gk-tag done' : 'gk-tag active';
      html += '<span class="' + cls + '">⚡ ' + doneActions + '/' + totalActions + ' aksiyon</span>';
    }
    if (reminders.length > 0) html += '<span class="gk-tag active">🔔 ' + reminders.length + ' hatırlatma</span>';
    if (m.category) html += '<span class="gk-tag">' + m.category + '</span>';
    if (m.city) html += '<span class="gk-tag">' + m.city + '</span>';
    html += '</div></div>';
  });
  container.innerHTML = html;
}

// ---- USER COMPANIES ----
var userCompanies = [];

// ---- GORUSME KARTI DETAY ----
var _currentMeetingId = null;
var _currentMeeting = null;

window.openMeetingDetail = function(meetingId) {
  var meetings = window._currentMeetings || [];
  var m = meetings.find(function(x) { return String(x.id) === String(meetingId); });
  if (!m) { showToast('Kart bulunamadı'); return; }
  _currentMeetingId = meetingId;
  _currentMeeting = JSON.parse(JSON.stringify(m));
  // Ensure arrays
  if (!Array.isArray(_currentMeeting.ai_actions)) {
    _currentMeeting.ai_actions = _currentMeeting.ai_actions ? JSON.parse(_currentMeeting.ai_actions) : [];
  }
  if (!Array.isArray(_currentMeeting.ai_reminders)) {
    _currentMeeting.ai_reminders = _currentMeeting.ai_reminders ? JSON.parse(_currentMeeting.ai_reminders) : [];
  }
  renderMeetingDetail();
  showScreen('screen-meeting-detail');
};

function renderMeetingDetail() {
  var m = _currentMeeting;
  if (!m) return;
  var ucData = m.user_companies_data || [];
  var roleLabel = ucData.length > 0 ? ucData.map(function(uc) { return uc.company_name; }).join(' + ') : 'Şahsen';
  document.getElementById('md-date').textContent = formatDate(m.created_at);
  document.getElementById('md-role').textContent = roleLabel + ' adına' + (m.city ? ' · ' + m.city : '') + (m.category ? ' · ' + m.category : '');
  document.getElementById('md-summary').textContent = m.ai_summary || '—';
  renderMeetingActions();
  renderMeetingReminders();
  // Görüşme notu
  var notesSection = document.getElementById('md-notes-section');
  var notesEl = document.getElementById('md-notes');
  if (m.notes && m.notes.trim()) {
    if (notesSection) notesSection.style.display = 'block';
    if (notesEl) notesEl.textContent = m.notes;
  } else {
    if (notesSection) notesSection.style.display = 'none';
  }
}

function renderMeetingActions() {
  var actions = _currentMeeting.ai_actions || [];
  var head = document.getElementById('md-actions-head');
  var done = actions.filter(function(a) { return a.done; }).length;
  if (head) head.textContent = 'AKSIYONLAR (' + done + '/' + actions.length + ')';
  var list = document.getElementById('md-actions-list');
  if (!list) return;
  if (actions.length === 0) {
    list.innerHTML = '<div class="md-empty">Aksiyon yok</div>';
    return;
  }
  list.innerHTML = actions.map(function(a, idx) {
    var checked = a.done ? 'checked' : '';
    var doneCls = a.done ? ' done' : '';
    var noteHtml = '';
    if (a.done && a.note) {
      noteHtml = '<div class="md-action-note">"' + escapeHtml(a.note) + '"' + (a.done_at ? ' — ' + formatDate(a.done_at) : '') + '</div>';
    }
    return '<div class="md-action-row' + doneCls + '" data-idx="' + idx + '">' +
      '<label class="md-checkbox">' +
        '<input type="checkbox" ' + checked + ' onchange="toggleAction(' + idx + ', this.checked)" />' +
        '<span class="md-checkbox-box"></span>' +
      '</label>' +
      '<div class="md-action-body">' +
        '<div class="md-action-text">' + escapeHtml(a.text || '') + '</div>' +
        noteHtml +
      '</div>' +
      '<button class="md-action-del" onclick="deleteAction(' + idx + ')" title="Sil">×</button>' +
    '</div>';
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

var _currentMeetingReminders = [];

async function renderMeetingReminders() {
  var section = document.getElementById('md-reminders-section');
  var list = document.getElementById('md-reminders-list');
  if (!list) return;
  var mid = _currentMeeting ? _currentMeeting.id : null;
  if (!mid) { if (section) section.style.display = 'none'; return; }
  var rows = await apiGet('/api/reminders?meeting_id=' + mid + (viewingMemberId ? '&member_id=' + viewingMemberId : ''));
  if (!rows || !Array.isArray(rows)) rows = [];
  _currentMeetingReminders = rows;
  if (rows.length === 0) {
    if (section) section.style.display = 'none';
    return;
  }
  if (section) section.style.display = 'block';
  list.innerHTML = rows.map(function(r) {
    var dateTxt = r.reminder_date ? formatDate(r.reminder_date) : '';
    var timeTxt = r.reminder_time ? (' · ' + String(r.reminder_time).slice(0, 5)) : '';
    return '<div class="md-rem-row" data-rid="' + r.id + '">' +
      '<div class="md-rem-dot"></div>' +
      '<div class="md-rem-body">' +
        '<div class="md-rem-text">' + escapeHtml(r.message || '') + '</div>' +
        (dateTxt ? '<div class="md-rem-date">' + dateTxt + timeTxt + '</div>' : '') +
      '</div>' +
      '<button class="md-action-del" onclick="editReminder(\'' + r.id + '\')" title="Düzenle" style="color:#4B5FFA;">✎</button>' +
      '<button class="md-action-del" onclick="deleteReminder(\'' + r.id + '\')" title="Sil">×</button>' +
    '</div>';
  }).join('');
}

window.editReminder = function(id) {
  var r = (_currentMeetingReminders || []).find(function(x) { return String(x.id) === String(id); });
  if (!r) return;
  var row = document.querySelector('.md-rem-row[data-rid="' + id + '"]');
  if (!row) return;
  var d = (r.reminder_date || '').toString().slice(0, 10);
  var t = r.reminder_time ? String(r.reminder_time).slice(0, 5) : '';
  row.innerHTML =
    '<div class="md-rem-body" style="width:100%;">' +
      '<input id="rem-edit-msg-' + id + '" value="' + escapeHtml(r.message || '') + '" style="width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #ddd;border-radius:8px;font-size:13px;margin-bottom:6px;">' +
      '<div style="display:flex;gap:6px;margin-bottom:8px;">' +
        '<input id="rem-edit-date-' + id + '" type="date" value="' + d + '" style="flex:1;box-sizing:border-box;padding:9px 10px;border:1px solid #ddd;border-radius:8px;font-size:13px;">' +
        '<input id="rem-edit-time-' + id + '" type="time" value="' + t + '" style="width:110px;box-sizing:border-box;padding:9px 10px;border:1px solid #ddd;border-radius:8px;font-size:13px;" placeholder="Saat">' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text3,#999);margin-bottom:8px;">Saat opsiyonel — boş bırakabilirsin.</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button onclick="saveReminderEdit(\'' + id + '\')" style="flex:1;background:#4B5FFA;color:#fff;border:none;border-radius:8px;padding:9px;font-size:13px;font-weight:700;cursor:pointer;">Kaydet</button>' +
        '<button onclick="renderMeetingReminders()" style="background:#f3f3f5;color:#444;border:none;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer;">İptal</button>' +
      '</div>' +
    '</div>';
};

window.saveReminderEdit = async function(id) {
  var msgEl = document.getElementById('rem-edit-msg-' + id);
  var dateEl = document.getElementById('rem-edit-date-' + id);
  var timeEl = document.getElementById('rem-edit-time-' + id);
  var message = msgEl ? msgEl.value.trim() : '';
  var reminder_date = dateEl ? dateEl.value : '';
  var reminder_time = timeEl ? timeEl.value : '';
  if (!message) { showToast('Hatırlatma metni boş olamaz'); return; }
  var data = await apiPut('/api/reminders?id=' + id + (viewingMemberId ? '&member_id=' + viewingMemberId : ''), { message: message, reminder_date: reminder_date || null, reminder_time: reminder_time || null });
  if (data && data.error) { showToast(data.error); return; }
  showToast('✓ Hatırlatma güncellendi');
  renderMeetingReminders();
  loadReminders();
};

window.deleteReminder = async function(id) {
  if (!confirm('Bu hatırlatmayı silmek istiyor musunuz?')) return;
  var data = await apiDelete('/api/reminders?id=' + id + (viewingMemberId ? '&member_id=' + viewingMemberId : ''));
  if (data && data.error) { showToast(data.error); return; }
  showToast('Hatırlatma silindi');
  renderMeetingReminders();
  loadReminders();
};

window.toggleAction = function(idx, checked) {
  var a = _currentMeeting.ai_actions[idx];
  if (!a) return;
  if (checked) {
    // Açıklama iste
    var note = prompt('Ne yaptın? (opsiyonel — boş bırakabilirsin)', a.note || '');
    if (note === null) {
      // İptal - checkbox geri
      renderMeetingActions();
      return;
    }
    a.done = true;
    a.note = note || '';
    a.done_at = new Date().toISOString();
    saveMeetingActions();
    // İlişkili hatırlatma varsa güncelleme teklif et
    if (_currentMeetingReminders && _currentMeetingReminders.length > 0) {
      if (confirm('İlgili hatırlatmayı da güncellemek ister misin? (tarih/metin değişmiş olabilir)')) {
        editReminder(_currentMeetingReminders[0].id);
      }
    }
    return;
  } else {
    a.done = false;
    a.note = '';
    a.done_at = null;
  }
  saveMeetingActions();
};

window.deleteAction = function(idx) {
  if (!confirm('Bu aksiyonu silmek istiyor musunuz?')) return;
  _currentMeeting.ai_actions.splice(idx, 1);
  saveMeetingActions();
};

window.addActionPrompt = function() {
  var text = prompt('Yeni aksiyon:');
  if (!text || !text.trim()) return;
  _currentMeeting.ai_actions.push({ text: text.trim(), done: false });
  saveMeetingActions();
};

async function saveMeetingActions() {
  renderMeetingActions();
  try {
    await apiPut('/api/meetings?id=' + _currentMeetingId + (viewingMemberId ? '&member_id=' + viewingMemberId : ''), { ai_actions: _currentMeeting.ai_actions });
    // Cache güncelle
    var cached = (window._currentMeetings || []).find(function(x) { return String(x.id) === String(_currentMeetingId); });
    if (cached) cached.ai_actions = _currentMeeting.ai_actions;
  } catch (e) {
    showToast('Kaydetme hatası');
  }
}

window.toggleSummaryEdit = function() {
  var view = document.getElementById('md-summary');
  var input = document.getElementById('md-summary-input');
  var saveRow = document.getElementById('md-summary-save-row');
  var btn = document.getElementById('md-summary-edit');
  input.value = _currentMeeting.ai_summary || '';
  view.style.display = 'none';
  input.style.display = 'block';
  saveRow.style.display = 'block';
  btn.style.display = 'none';
  input.focus();
};

window.cancelSummaryEdit = function() {
  document.getElementById('md-summary').style.display = 'block';
  document.getElementById('md-summary-input').style.display = 'none';
  document.getElementById('md-summary-save-row').style.display = 'none';
  document.getElementById('md-summary-edit').style.display = 'inline-block';
};

window.saveSummary = async function() {
  var newText = document.getElementById('md-summary-input').value.trim();
  _currentMeeting.ai_summary = newText;
  try {
    await apiPut('/api/meetings?id=' + _currentMeetingId + (viewingMemberId ? '&member_id=' + viewingMemberId : ''), { ai_summary: newText });
    var cached = (window._currentMeetings || []).find(function(x) { return String(x.id) === String(_currentMeetingId); });
    if (cached) cached.ai_summary = newText;
    document.getElementById('md-summary').textContent = newText || '—';
    cancelSummaryEdit();
    showToast('✓ Kaydedildi');
  } catch (e) {
    showToast('Kaydetme hatası');
  }
};

window.deleteCurrentMeeting = async function() {
  if (!_currentMeetingId) return;
  if (!confirm('Bu görüşme kartını silmek istiyor musunuz?')) return;
  try {
    await apiDelete('/api/meetings?id=' + _currentMeetingId);
    showToast('✓ Kart silindi');
    var personId = _currentMeeting.person_id;
    showScreen('screen-detail');
    if (personId) loadMeetingCards(personId);
  } catch (e) {
    showToast('Silme hatası');
  }
};

async function loadUserCompanies() {
  var data = await apiGet('/api/usercompanies');
  if (!data) return;
  userCompanies = data;
  renderUserCompanies();
}

function renderUserCompanies() {
  var list = document.getElementById('user-companies-list');
  if (!list) return;
  if (userCompanies.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 0;">Henüz şirket eklenmedi</div>';
    return;
  }
  list.innerHTML = userCompanies.map(function(c) {
    return '<div class="p-card" style="margin-bottom:8px;"><div class="p-card-inner"><div class="avatar" style="background:#EEF0FF;color:#4B5FFA;border-radius:10px;font-size:16px;">🏢</div><div class="p-info"><div class="p-name">' + c.company_name + '</div><div class="p-title">' + (c.title || '') + (c.is_default ? ' ⭐' : '') + '</div></div><button onclick="deleteUserCompany(\'' + c.id + '\')" style="margin-left:auto;background:#FEF2F2;color:#DC2626;border:none;border-radius:8px;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:700;">Sil</button></div></div>';
  }).join('');
}

window.deleteUserCompany = async function(id) {
  if (!confirm('Bu şirketi silmek istiyor musunuz?')) return;
  await apiDelete('/api/usercompanies?id=' + id);
  await loadUserCompanies();
  showToast('Şirket silindi');
};

// ---- EKİP ----
var teamData = null;
var viewingMemberId = null;
var viewingMemberName = null;

window.viewMemberData = function(memberId, memberName) {
  viewingMemberId = memberId;
  viewingMemberName = memberName;
  showMemberBanner(memberName);
  showScreen('screen-home');
  loadContacts();
  loadReminders();
};

window.exitMemberView = function() {
  viewingMemberId = null;
  viewingMemberName = null;
  removeMemberBanner();
  showScreen('screen-home');
  loadContacts();
  loadReminders();
};

function showMemberBanner(name) {
  removeMemberBanner();
  var bar = document.createElement('div');
  bar.id = 'member-view-banner';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#4B5FFA;color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.18);';
  bar.innerHTML = '<span>👁 ' + name + ' görünümü</span><button onclick="exitMemberView()" style="background:rgba(255,255,255,0.25);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;">Kendime dön</button>';
  document.body.appendChild(bar);
}

function removeMemberBanner() {
  var b = document.getElementById('member-view-banner');
  if (b) b.remove();
}

async function loadTeam() {
  var data = await apiGet('/api/teams');
  if (!data) return;
  teamData = data.team;
  renderTeamSection();
}

function renderTeamSection() {
  var content = document.querySelector('#screen-profile .content');
  if (!content) return;
  var existing = document.getElementById('team-section');
  if (existing) existing.remove();

  var box = document.createElement('div');
  box.id = 'team-section';
  box.style.cssText = 'margin-top:16px;';

  var html = '<div class="sec-lbl" style="margin-bottom:10px;">Ekip</div>';

  if (!teamData) {
    html += '<div style="font-size:12px;color:var(--text3,#888);margin-bottom:12px;">Bir ekip kur veya katılım kodu ile mevcut bir ekibe katıl.</div>';
    html += '<input id="team-name-input" placeholder="Ekip adı" style="width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid var(--line,#ddd);border-radius:10px;font-size:14px;margin-bottom:8px;">';
    html += '<button onclick="createTeam()" style="width:100%;background:#4B5FFA;color:#fff;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:14px;">Ekip Oluştur</button>';
    html += '<div style="display:flex;gap:8px;align-items:center;">';
    html += '<input id="team-code-input" placeholder="Katılım kodu" maxlength="6" style="flex:1;box-sizing:border-box;text-transform:uppercase;padding:11px 12px;border:1px solid var(--line,#ddd);border-radius:10px;font-size:14px;letter-spacing:2px;">';
    html += '<button onclick="joinTeam()" style="background:#EEF0FF;color:#4B5FFA;border:none;border-radius:10px;padding:12px 16px;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;">Katıl</button>';
    html += '</div>';
  } else if (teamData.isLeader) {
    html += '<div style="font-size:13px;margin-bottom:4px;"><b>' + teamData.name + '</b> · Lider</div>';
    html += '<button onclick="openTeamSummary()" style="width:100%;background:#4B5FFA;color:#fff;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;margin:10px 0 14px;">Ekip Özeti</button>';
    html += '<div style="font-size:12px;color:var(--text3,#888);margin-bottom:10px;">Üyelerin bu kodla katılır:</div>';
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;"><span style="font-size:22px;font-weight:800;letter-spacing:4px;color:#4B5FFA;background:#EEF0FF;padding:8px 16px;border-radius:10px;">' + teamData.join_code + '</span><button onclick="copyJoinCode(\'' + teamData.join_code + '\')" style="background:#f3f3f5;color:#444;border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;">Kopyala</button></div>';
    html += '<div style="font-size:12px;color:var(--text3,#888);margin-bottom:6px;">Ekip üyeleri (' + teamData.members.length + ')</div>';
    if (teamData.members.length === 0) {
      html += '<div style="font-size:12px;color:var(--text3,#888);">Henüz üye katılmadı.</div>';
    } else {
      html += teamData.members.map(function(m) {
        var tag = m.role === 'leader' ? ' · Lider' : '';
        var isMember = m.role !== 'leader';
        var clickAttr = isMember ? ' onclick="viewMemberData(\'' + m.id + '\',\'' + (m.full_name || m.email).replace(/['"]/g, "") + '\')" style="cursor:pointer;"' : '';
        var arrow = isMember ? '<div style="margin-left:auto;color:#4B5FFA;font-size:18px;font-weight:700;">›</div>' : '';
        return '<div' + clickAttr + ' style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line,#f0f0f0);' + (isMember ? 'cursor:pointer;' : '') + '"><div class="avatar" style="width:32px;height:32px;font-size:13px;background:#EEF0FF;color:#4B5FFA;">' + getInitials(m.full_name || m.email) + '</div><div><div style="font-size:13px;font-weight:700;">' + (m.full_name || m.email) + tag + '</div><div style="font-size:11px;color:var(--text3,#888);">' + m.email + '</div></div>' + arrow + '</div>';
      }).join('');
    }
  } else {
    html += '<div style="font-size:13px;"><b>' + teamData.name + '</b> ekibinin üyesisin.</div>';
    html += '<div style="font-size:12px;color:var(--text3,#888);margin-top:4px;">Görüşmelerin ekip liderinle paylaşılır.</div>';
  }

  box.innerHTML = html;
  var logoutBtn = document.getElementById('btn-logout2');
  if (logoutBtn && logoutBtn.parentElement === content) {
    content.insertBefore(box, logoutBtn);
  } else {
    content.appendChild(box);
  }
}

window.createTeam = async function() {
  var input = document.getElementById('team-name-input');
  var name = input ? input.value.trim() : '';
  if (!name) { showToast('Ekip adı gir'); return; }
  var data = await apiPost('/api/teams', { action: 'create', name: name });
  if (!data) return;
  if (data.error) { showToast(data.error); return; }
  teamData = data.team;
  renderTeamSection();
  showToast('✓ Ekip oluşturuldu');
};

window.joinTeam = async function() {
  var input = document.getElementById('team-code-input');
  var code = input ? input.value.trim().toUpperCase() : '';
  if (!code) { showToast('Katılım kodu gir'); return; }
  var data = await apiPost('/api/teams', { action: 'join', code: code });
  if (!data) return;
  if (data.error) { showToast(data.error); return; }
  teamData = data.team;
  renderTeamSection();
  showToast('✓ Ekibe katıldın');
};

window.copyJoinCode = function(code) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(function() { showToast('Kod kopyalandı'); }).catch(function() { showToast(code); });
  } else {
    showToast(code);
  }
};

// ---- EKİP ÖZETİ (lider panosu) ----
var _tsPeriod = 'today';

window.openTeamSummary = function() {
  closeTeamSummary();
  _tsPeriod = 'today';
  var ov = document.createElement('div');
  ov.id = 'team-summary-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#eef0f6;overflow-y:auto;';
  ov.innerHTML =
    '<div style="position:sticky;top:0;background:#4B5FFA;color:#fff;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;z-index:1;">' +
      '<div style="font-size:18px;font-weight:800;">Ekip Özeti</div>' +
      '<button onclick="closeTeamSummary()" style="background:rgba(255,255,255,0.25);color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:14px;font-weight:700;cursor:pointer;">Kapat</button>' +
    '</div>' +
    '<div style="padding:16px 18px;">' +
      '<div id="ts-periods" style="display:flex;gap:8px;margin-bottom:16px;"></div>' +
      '<div id="ts-body"><div style="text-align:center;color:#888;padding:30px;">Yükleniyor…</div></div>' +
    '</div>';
  document.body.appendChild(ov);
  renderTsPeriods();
  loadTeamSummary();
};

window.closeTeamSummary = function() {
  var o = document.getElementById('team-summary-overlay');
  if (o) o.remove();
};

function renderTsPeriods() {
  var wrap = document.getElementById('ts-periods');
  if (!wrap) return;
  var opts = [['today', 'Bugün'], ['week', 'Bu hafta'], ['month', 'Bu ay'], ['all', 'Toplam']];
  wrap.innerHTML = opts.map(function(o) {
    var active = _tsPeriod === o[0];
    return '<button onclick="setTsPeriod(\'' + o[0] + '\')" style="flex:1;background:' + (active ? '#4B5FFA' : '#fff') + ';color:' + (active ? '#fff' : '#444') + ';border:1px solid ' + (active ? '#4B5FFA' : '#ddd') + ';border-radius:10px;padding:10px 4px;font-size:13px;font-weight:700;cursor:pointer;">' + o[1] + '</button>';
  }).join('');
}

window.setTsPeriod = function(p) {
  _tsPeriod = p;
  renderTsPeriods();
  loadTeamSummary();
};

function tsRange(period) {
  var today = new Date().toISOString().split('T')[0];
  if (period === 'week') {
    var d = new Date(today + 'T00:00:00Z');
    var day = d.getUTCDay();
    var diff = (day === 0 ? 6 : day - 1); // Pazartesi başlangıç
    d.setUTCDate(d.getUTCDate() - diff);
    return { from: d.toISOString().split('T')[0], to: today };
  }
  if (period === 'month') return { from: today.slice(0, 8) + '01', to: today };
  if (period === 'all') return { from: '2000-01-01', to: today };
  return { from: today, to: today }; // today
}

async function loadTeamSummary() {
  var r = tsRange(_tsPeriod);
  var data = await apiGet('/api/team-summary?from=' + r.from + '&to=' + r.to);
  var body = document.getElementById('ts-body');
  if (!body) return;
  if (!data || data.error) {
    body.innerHTML = '<div style="color:#DC2626;padding:20px;">' + ((data && data.error) || 'Yüklenemedi') + '</div>';
    return;
  }
  var periodLabel = { today: 'Bugün', week: 'Bu hafta', month: 'Bu ay', all: 'Toplam' }[_tsPeriod] || '';
  var T = data.totals || {};
  var html = '';
  html += '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:16px;display:flex;justify-content:space-around;text-align:center;">' +
    tsStat('Görüşme · ' + periodLabel, T.meetings_range) +
    tsStat('Açık aksiyon', T.open_actions) +
    tsStat('Bekleyen htr.', T.pending_reminders) +
    '</div>';
  html += (data.members || []).map(function(m) {
    var isLeaderRow = m.role === 'leader';
    var nm = (m.full_name || m.email).replace(/['"]/g, '');
    var clickAttr = isLeaderRow ? '' : ' onclick="closeTeamSummary();viewMemberData(\'' + m.id + '\',\'' + nm + '\')" style="cursor:pointer;"';
    return '<div' + clickAttr + ' style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:10px;">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
        '<div class="avatar" style="width:34px;height:34px;font-size:13px;background:#EEF0FF;color:#4B5FFA;">' + getInitials(m.full_name || m.email) + '</div>' +
        '<div style="flex:1;"><div style="font-size:14px;font-weight:700;">' + (m.full_name || m.email) + (isLeaderRow ? ' · Lider' : '') + '</div><div style="font-size:11px;color:#888;">' + m.email + '</div></div>' +
        (isLeaderRow ? '' : '<div style="color:#4B5FFA;font-size:18px;font-weight:700;">›</div>') +
      '</div>' +
      '<div style="display:flex;justify-content:space-around;text-align:center;border-top:1px solid #f0f0f0;padding-top:10px;">' +
        tsMini('Görüşme', m.meetings_range) +
        tsMini('Açık aks.', m.open_actions) +
        tsMini('Htr.', m.pending_reminders) +
        tsMini('Toplam', m.meetings_total) +
      '</div>' +
    '</div>';
  }).join('');
  body.innerHTML = html;
}

function tsStat(label, val) {
  return '<div><div style="font-size:22px;font-weight:800;color:#4B5FFA;">' + (val || 0) + '</div><div style="font-size:11px;color:#888;">' + label + '</div></div>';
}

function tsMini(label, val) {
  return '<div><div style="font-size:16px;font-weight:800;">' + (val || 0) + '</div><div style="font-size:10px;color:#888;">' + label + '</div></div>';
}

// ---- EXPORT ----
function exportExcel() {
  if (!contacts.length) { showToast('Henüz kişi yok'); return; }
  var rows = contacts.map(function(c) {
    return { 'Ad Soyad': c.full_name||'', 'Firma': c.company_name||'', 'Unvan': c.title||'', 'Telefon': c.phone||'', 'GSM': c.gsm||'', 'E-posta': c.email||'', 'Web': c.web||'', 'Sektör': c.sector||'' };
  });
  var wb = XLSX.utils.book_new();
  var ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Kişiler');
  XLSX.writeFile(wb, 'KartCRM_Kisiler.xlsx');
  showToast('✓ Excel indirildi');
}

// ---- REMINDERS ----
var _remindersData = [];
var _remindersOpen = {};

async function loadReminders() {
  var data = await apiGet('/api/reminders' + (viewingMemberId ? '?member_id=' + viewingMemberId : ''));
  if (!data) return;
  _remindersData = data;
  renderReminders();
}

function renderReminders() {
  var data = _remindersData || [];
  var bar = document.getElementById('reminders-bar');
  var list = document.getElementById('reminders-list');
  var remCount = document.getElementById('rem-count');
  if (data.length === 0) { if (bar) bar.style.display = 'none'; return; }
  if (bar) bar.style.display = 'block';
  if (remCount) remCount.textContent = data.length;

  // Kişiye göre grupla
  var groups = {};
  var order = [];
  data.forEach(function(r) {
    var key = r.person_id || ('_' + (r.full_name || ''));
    if (!groups[key]) {
      groups[key] = { person_id: r.person_id, name: r.full_name || '(İsimsiz)', items: [] };
      order.push(key);
    }
    groups[key].items.push(r);
  });

  if (!list) return;
  list.innerHTML = order.map(function(key) {
    var g = groups[key];
    var isOpen = !!_remindersOpen[key];
    var arrow = isOpen ? '▼' : '▶';
    var itemsHtml = '';
    if (isOpen) {
      itemsHtml = '<div class="rem-items">' + g.items.map(function(r) {
        var dateTxt = r.reminder_date ? ' — ' + formatDate(r.reminder_date) : '';
        var timeTxt = r.reminder_time ? (' · ' + String(r.reminder_time).slice(0, 5)) : '';
        return '<div class="rem-item-row">' +
          '<div class="rem-item-dot"></div>' +
          '<div class="rem-item-text">' + (r.message || '') + dateTxt + timeTxt + '</div>' +
          '<button class="rem-item-tick" onclick="markReminderDone(\'' + r.id + '\', event)" title="Tamamlandı">✓</button>' +
        '</div>';
      }).join('') + '</div>';
    }
    return '<div class="rem-group">' +
      '<div class="rem-group-head" onclick="toggleReminderGroup(\'' + key + '\')">' +
        '<span class="rem-group-arrow">' + arrow + '</span>' +
        '<span class="rem-group-name">' + g.name + '</span>' +
        '<span class="rem-group-badge">' + g.items.length + '</span>' +
      '</div>' +
      itemsHtml +
    '</div>';
  }).join('');
}

window.toggleReminderGroup = function(key) {
  _remindersOpen[key] = !_remindersOpen[key];
  renderReminders();
};

window.markReminderDone = async function(id, ev) {
  if (ev) ev.stopPropagation();
  // Optimistik UI: hemen kaldır
  _remindersData = _remindersData.filter(function(r) { return String(r.id) !== String(id); });
  renderReminders();
  try {
    await apiPut('/api/reminders?id=' + id + (viewingMemberId ? '&member_id=' + viewingMemberId : ''));
    showToast('✓ Tamamlandı');
  } catch (e) {
    showToast('Hata oluştu');
    // Geri yükle
    loadReminders();
  }
};

// ---- NOTIFICATIONS / PUSH ----
function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var rawData = window.atob(base64);
  var outputArray = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    var reg = await navigator.serviceWorker.register('/service-worker.js');
    return reg;
  } catch (e) {
    console.error('SW kayit hatasi:', e);
    return null;
  }
}

async function requestNotificationPermission() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('Tarayıcı push bildirimleri desteklemiyor');
    return;
  }

  // iOS PWA kontrol
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isIOS && !isStandalone) {
    showToast('iPhone\'da bildirim için: Paylaş → Ana Ekrana Ekle, sonra ana ekrandan açıp tekrar dene');
    return;
  }

  var permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    document.getElementById('notif-status').textContent = 'Reddedildi';
    showToast('Bildirim izni reddedildi');
    return;
  }

  try {
    var reg = await registerServiceWorker();
    if (!reg) { showToast('Service worker yüklenemedi'); return; }
    // SW aktif olana kadar bekle
    if (reg.installing) {
      await new Promise(function(resolve) {
        reg.installing.addEventListener('statechange', function() {
          if (this.state === 'activated') resolve();
        });
      });
    }
    await navigator.serviceWorker.ready;

    // VAPID public key'i backend'den al
    var keyResp = await apiGet('/api/push-subscribe');
    if (!keyResp || !keyResp.publicKey) { showToast('VAPID key alınamadı'); return; }

    var sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyResp.publicKey)
      });
    }

    var saveResp = await apiPost('/api/push-subscribe', { subscription: sub });
    if (saveResp && saveResp.success) {
      document.getElementById('notif-status').textContent = 'Aktif ✓';
      showToast('✓ Bildirimler aktif');
    } else {
      showToast('Abonelik kaydı başarısız');
    }
  } catch (e) {
    console.error('Push abonelik hatasi:', e);
    showToast('Hata: ' + (e.message || e));
  }
}

async function updateNotifStatus() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  var statusEl = document.getElementById('notif-status');
  if (!statusEl) return;
  if (Notification.permission === 'denied') {
    statusEl.textContent = 'Reddedildi';
    return;
  }
  if (Notification.permission !== 'granted') {
    statusEl.textContent = 'Kapalı';
    return;
  }
  try {
    var reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { statusEl.textContent = 'Kapalı'; return; }
    var sub = await reg.pushManager.getSubscription();
    statusEl.textContent = sub ? 'Aktif ✓' : 'Kapalı';
  } catch (e) {
    statusEl.textContent = 'Kapalı';
  }
}

// ---- INIT ----
function initApp() {
  if (!authToken || !currentUser) { showScreen('screen-auth'); return; }
  var name = currentUser.full_name || currentUser.email.split('@')[0];
  var greetEl = document.getElementById('greeting-text');
  if (greetEl) greetEl.textContent = 'Merhaba, ' + name;
  var profName = document.getElementById('profile-name');
  var profEmail = document.getElementById('profile-email');
  var profAv = document.getElementById('profile-avatar');
  if (profName) profName.textContent = currentUser.full_name || '-';
  if (profEmail) profEmail.textContent = currentUser.email || '-';
  if (profAv) profAv.textContent = getInitials(currentUser.full_name || currentUser.email);
  showScreen('screen-home');
  loadContacts();
  loadUserCompanies();
  loadTeam();
  loadReminders();
  updateNotifStatus();
  // Service worker'i pasif olarak kaydet (push gelirse calissin)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(function() {});
  }
}

// ---- EVENT LISTENERS ----

window.deleteCurrentContact = async function() {
  if (!window._currentDetailId) return;
  if (!confirm('Bu kisiyi silmek istiyor musunuz?')) return;
  await apiDelete('/api/contacts?id=' + window._currentDetailId);
  await loadContacts();
  showToast('Silindi');
  showScreen('screen-home');
};

window.editCurrentContact = function() {
  var c = contacts.find(function(x) { return x.id === window._currentDetailId; });
  if (!c) return;
  fillVerifyForm({
    full_name: c.full_name, company_name: c.company_name,
    title: c.title, phone: c.phone, gsm: c.gsm, fax: c.fax,
    email: c.email, web: c.web, address: c.address, sector: c.sector
  });
  var banner = document.getElementById('ocr-banner');
  if (banner) banner.textContent = 'Bilgileri duzenleyin';
  window._editingContactId = c.id;
  showScreen('screen-verify');
};

document.addEventListener('DOMContentLoaded', function() {
  if (authToken && currentUser) initApp();
  else showScreen('screen-auth');

  document.getElementById('btn-login').addEventListener('click', login);
  document.getElementById('btn-register').addEventListener('click', register);
  document.getElementById('login-password').addEventListener('keydown', function(e) { if (e.key === 'Enter') login(); });

  document.querySelectorAll('#btn-logout, #btn-logout2').forEach(function(btn) {
    if (btn) btn.addEventListener('click', logout);
  });

  document.getElementById('fab-add').addEventListener('click', function() {
    fillVerifyForm({});
    document.getElementById('ocr-banner').textContent = 'Kartvizit ekle veya manuel gir';
    showScreen('screen-add');
  });

  document.getElementById('btn-search-toggle').addEventListener('click', function() {
    var bar = document.getElementById('search-bar');
    var hidden = !bar.style.display || bar.style.display === 'none';
    bar.style.display = hidden ? 'flex' : 'none';
    if (hidden) document.getElementById('search-input').focus();
  });

  document.getElementById('search-input').addEventListener('input', function(e) {
    searchQuery = e.target.value.toLowerCase();
    renderContacts();
  });

  document.getElementById('opt-camera').addEventListener('click', async function() {
    showScreen('screen-camera');
    await startCamera();
  });

  document.getElementById('opt-manual').addEventListener('click', function() {
    fillVerifyForm({});
    document.getElementById('ocr-banner').textContent = '✏️ Bilgileri manuel olarak girin';
    showScreen('screen-verify');
  });

  document.getElementById('btn-capture').addEventListener('click', async function() {
    var video = document.getElementById('camera-video');
    var canvas = document.getElementById('camera-canvas');
    if (!video.videoWidth) { showToast('Kamera hazır değil'); return; }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    stopCamera();
    var data = await sendToOCR(canvas.toDataURL('image/jpeg', 0.9));
    fillVerifyForm(data);
    showScreen('screen-verify');
  });

  document.getElementById('file-input').addEventListener('change', async function(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = async function(ev) {
      stopCamera();
      var data = await sendToOCR(ev.target.result);
      fillVerifyForm(data);
      showScreen('screen-verify');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  document.getElementById('btn-verify-next').addEventListener('click', async function() {
    var formData = readForm();
    if (!formData.full_name) { document.getElementById('verify-error').style.display = 'block'; return; }
    document.getElementById('verify-error').style.display = 'none';

    // Düzenleme modu
    if (window._editingContactId) {
      var res = await fetch('/api/contacts?id=' + window._editingContactId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
        body: JSON.stringify(formData)
      });
      var data = await res.json();
      window._editingContactId = null;
      await loadContacts();
      showToast('✓ Güncellendi');
      showScreen('screen-home');
      return;
    }

    // Yeni kişi
    var data = await apiPost('/api/contacts', formData);
    if (data && !data.error) {
      await loadContacts();
      showToast('✓ Kişi kaydedildi');
      startMeetingFlow(data.id, formData.full_name, null);
    } else {
      showToast('Kayıt hatası: ' + (data ? data.error || '' : ''));
    }
  });

  // Sil butonlari
  var btnDel = document.getElementById('btn-delete');
  if (btnDel) btnDel.addEventListener('click', async function() {
    if (!window._currentDetailId) return;
    if (!confirm('Bu kisiyi silmek istiyor musunuz?')) return;
    await apiDelete('/api/contacts?id=' + window._currentDetailId);
    await loadContacts();
    showToast('Silindi');
    showScreen('screen-home');
  });

  var btnDelTop = document.getElementById('btn-delete-top');
  if (btnDelTop) btnDelTop.addEventListener('click', async function() {
    if (!window._currentDetailId) return;
    if (!confirm('Bu kisiyi silmek istiyor musunuz?')) return;
    await apiDelete('/api/contacts?id=' + window._currentDetailId);
    await loadContacts();
    showToast('Silindi');
    showScreen('screen-home');
  });

  // Düzenle butonu
  var btnEdit = document.getElementById('btn-edit');
  if (btnEdit) btnEdit.addEventListener('click', function() {
    var c = contacts.find(function(x) { return x.id === window._currentDetailId; });
    if (!c) return;
    fillVerifyForm({
      full_name: c.full_name, company_name: c.company_name,
      title: c.title, phone: c.phone, gsm: c.gsm, fax: c.fax,
      email: c.email, web: c.web, address: c.address, sector: c.sector
    });
    document.getElementById('ocr-banner').textContent = 'Bilgileri duzenleyin';
    window._editingContactId = c.id;
    showScreen('screen-verify');
  });

  document.getElementById('btn-export-excel').addEventListener('click', exportExcel);
  document.getElementById('btn-notif-toggle').addEventListener('click', requestNotificationPermission);

  document.getElementById('btn-add-company').addEventListener('click', function() {
    document.getElementById('add-company-form').style.display = 'block';
  });
  document.getElementById('btn-cancel-company').addEventListener('click', function() {
    document.getElementById('add-company-form').style.display = 'none';
  });
  document.getElementById('btn-save-company').addEventListener('click', async function() {
    var name = document.getElementById('uc-name').value.trim();
    var title = document.getElementById('uc-title').value.trim();
    var isDefault = document.getElementById('uc-default').checked;
    if (!name) { showToast('Şirket adı gerekli'); return; }
    var data = await apiPost('/api/usercompanies', { company_name: name, title: title, is_default: isDefault });
    if (data && !data.error) {
      document.getElementById('add-company-form').style.display = 'none';
      document.getElementById('uc-name').value = '';
      document.getElementById('uc-title').value = '';
      document.getElementById('uc-default').checked = false;
      await loadUserCompanies();
      showToast('✓ Şirket eklendi');
    }
  });

  document.querySelectorAll('[data-back]').forEach(function(btn) {
    btn.addEventListener('click', function() { stopCamera(); showScreen(btn.dataset.back); });
  });

  document.querySelectorAll('[data-screen]').forEach(function(btn) {
    btn.addEventListener('click', function() { showScreen(btn.dataset.screen); });
  });
});
