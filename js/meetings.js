import { showScreen, showToast, formatDate } from './ui.js';
import { apiPost, apiGet } from './auth.js';

let meetingData = {
  personId: null,
  personName: null,
  companyId: null,
  userCompanyIds: [],
  userCompanyNames: [],
  category: null,
  city: null,
  notes: '',
  step: 1
};

let aiResult = null;
let recognition = null;
let isRecording = false;

export function startMeetingFlow(personId, personName, companyId) {
  meetingData = { personId, personName, companyId, userCompanyIds: [], userCompanyNames: [], category: null, city: null, notes: '', step: 1 };
  aiResult = null;
  renderStep1();
  showScreen('screen-meeting');
}

function renderStepBar(current) {
  const bar = document.getElementById('meeting-step-bar');
  if (!bar) return;
  bar.innerHTML = [1,2,3,4].map(i =>
    '<div class="step-dot ' + (i < current ? 'done' : i === current ? 'active' : '') + '"></div>'
  ).join('');
}

function renderPersonTag() {
  const el = document.getElementById('meeting-person-tag');
  if (!el) return;
  const initials = (meetingData.personName || '?').split(' ').map(n => n[0]).join('').slice(0,2);
  el.innerHTML = '<div class="person-tag-inner"><div class="meeting-avatar">' + initials + '</div><div><div class="meeting-person-name">' + (meetingData.personName || '') + '</div></div></div>';
}

// ADIM 1: KİMİ TEMSİL EDİYORDUN
async function renderStep1() {
  meetingData.step = 1;
  renderStepBar(1);
  renderPersonTag();

  const body = document.getElementById('meeting-body');
  const companies = await apiGet('/api/usercompanies');

  if (!companies || companies.length === 0) {
    body.innerHTML = '<div class="step-question">Kimi temsil ediyordun?</div><div class="step-sub">Bir veya birden fazla seçebilirsin</div><div class="warning-box"><div class="warning-text">Kayıtlı Şirket Kimliğiniz Bulunamadı.<br>Lütfen sisteme şirket girişi yapınız.</div><button class="warning-btn" onclick="window.showScreen(\'screen-profile\')">Şirket Ekle</button></div><button class="btn-skip" onclick="window.nextStep()">Şimdi Değil, Geç</button>';
    return;
  }

  const defaultCo = companies.find(c => c.is_default);
  if (defaultCo) {
    meetingData.userCompanyIds = [defaultCo.id];
    meetingData.userCompanyNames = [defaultCo.company_name];
  }

  let html = '<div class="step-question">Kimi temsil ediyordun?</div><div class="step-sub">Bir veya birden fazla seçebilirsin</div><div id="company-list">';
  companies.forEach(c => {
    const sel = c.is_default ? 'selected' : '';
    const act = c.is_default ? 'active' : '';
    html += '<div class="company-select-card ' + sel + '" data-id="' + c.id + '" data-name="' + c.company_name + '" onclick="window.toggleUserCompany(this)"><div><div class="cs-name">' + c.company_name + '</div><div class="cs-title">' + (c.title || '') + '</div></div><div class="cs-check ' + act + '">✓</div></div>';
  });
  html += '<div class="company-select-card" data-id="personal" data-name="Şahsen" onclick="window.toggleUserCompany(this)"><div><div class="cs-name">Şahsen</div><div class="cs-title">Kişisel</div></div><div class="cs-check">✓</div></div>';
  html += '</div><button class="btn-meeting-next" onclick="window.nextStep()">İleri →</button>';
  body.innerHTML = html;
}

window.toggleUserCompany = function(el) {
  const id = el.dataset.id;
  const name = el.dataset.name;
  const isSelected = el.classList.contains('selected');
  if (isSelected) {
    el.classList.remove('selected');
    el.querySelector('.cs-check').classList.remove('active');
    meetingData.userCompanyIds = meetingData.userCompanyIds.filter(x => x !== id);
    meetingData.userCompanyNames = meetingData.userCompanyNames.filter(x => x !== name);
  } else {
    el.classList.add('selected');
    el.querySelector('.cs-check').classList.add('active');
    if (id !== 'personal') {
      meetingData.userCompanyIds.push(id);
      meetingData.userCompanyNames.push(name);
    }
  }
};

// ADIM 2: NEREDE TANIŞTILAR
function renderStep2() {
  meetingData.step = 2;
  renderStepBar(2);
  const cats = ['İş görüşmesi', 'Toplantı', 'Yemek', 'Fuar', 'Dernek', 'Karşılaşma', 'Diğer'];
  let html = '<div class="step-question">Nerede tanıştınız?</div><div class="step-sub">Görüşme ortamını seç</div><div class="cat-grid">';
  cats.forEach(c => {
    const sel = meetingData.category === c ? 'selected' : '';
    html += '<div class="cat-card ' + sel + '" onclick="window.selectCategory(\'' + c + '\', this)"><div class="cat-label">' + c + '</div></div>';
  });
  html += '</div><div class="city-input-wrap"><input class="form-input" type="text" id="f-city" placeholder="Şehir (isteğe bağlı)" value="' + (meetingData.city || '') + '"></div>';
  html += '<button class="btn-meeting-next" onclick="window.nextStep()">İleri →</button>';
  html += '<button class="btn-skip" onclick="window.nextStep()">Geç</button>';
  document.getElementById('meeting-body').innerHTML = html;
}

window.selectCategory = function(cat, el) {
  document.querySelectorAll('.cat-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  meetingData.category = cat;
};

// ADIM 3: NE KONUŞTUNUZ
function renderStep3() {
  meetingData.step = 3;
  renderStepBar(3);
  document.getElementById('meeting-body').innerHTML =
    '<div class="step-question">Ne konuştunuz?</div>' +
    '<div class="step-sub">Yaz ya da sesle not bırak</div>' +
    '<textarea class="meeting-textarea" id="f-notes" placeholder="Aklında ne kaldı?">' + (meetingData.notes || '') + '</textarea>' +
    '<button class="mic-btn" id="btn-mic">' +
      '<div class="mic-btn-inner">' +
        '<div class="mic-icon-wrap" id="mic-icon-wrap">🎤</div>' +
        '<div><div class="mic-label" id="mic-label">Sesle Not Al</div><div class="mic-sub">Bas ve konuş</div></div>' +
      '</div>' +
    '</button>' +
    '<button class="btn-meeting-next" onclick="window.nextStep()">İleri →</button>' +
    '<button class="btn-skip" onclick="window.nextStep()">Geç</button>';
  setTimeout(function() {
    var micBtn = document.getElementById('btn-mic');
    if (micBtn) micBtn.addEventListener('click', window.toggleMic);
  }, 50);
}

window.toggleMic = async function() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Tarayıcınız ses tanımayı desteklemiyor');
    return;
  }
  if (isRecording) { if (recognition) recognition.stop(); return; }
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch(e) {
    showToast('Mikrofon izni gerekli');
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'tr-TR';
  recognition.continuous = true;
  recognition.interimResults = true;

  const textarea = document.getElementById('f-notes');
  const micBtn = document.getElementById('btn-mic');
  const micLabel = document.getElementById('mic-label');
  const micIconWrap = document.getElementById('mic-icon-wrap');
  let finalTranscript = textarea ? textarea.value : '';

  recognition.onstart = function() {
    isRecording = true;
    if (micBtn) micBtn.classList.add('recording');
    if (micLabel) micLabel.textContent = 'Dinleniyor...';
    if (micIconWrap) micIconWrap.innerHTML = '<div class="mic-waves"><span></span><span></span><span></span></div>';
  };

  recognition.onresult = function(e) {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
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

  recognition.start();
};

// ADIM 4: AI ÖZET
async function renderStep4() {
  meetingData.step = 4;
  renderStepBar(4);
  const notes = document.getElementById('f-notes') ? document.getElementById('f-notes').value : meetingData.notes;
  meetingData.notes = notes;

  document.getElementById('meeting-body').innerHTML =
    '<div class="step-question">Görüşme Kartı</div>' +
    '<div class="step-sub">AI analiz ediyor...</div>' +
    '<div class="ai-loading"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div><span>Görüşme analiz ediliyor</span></div>';

  if (notes && notes.length > 10) {
    const result = await apiPost('/api/ai', { notes: notes, person_name: meetingData.personName });
    if (result && !result.error) aiResult = result;
  }

  renderAiResult(false);
}

function renderAiResult(editMode) {
  const body = document.getElementById('meeting-body');
  const r = aiResult || {};
  const ucNames = meetingData.userCompanyNames || [];
  const ucLabel = ucNames.length > 0 ? '<div class="gc-uc-label">Temsil: <strong>' + ucNames.join(' + ') + '</strong></div>' : '';

  if (editMode) {
    const actionsText = (r.actions || []).map(function(a) { return a.text; }).join('\n');
    const remindersText = (r.reminders || []).map(function(rem) { return (rem.date || '') + ' ' + (rem.time || '') + ' ' + rem.text; }).join('\n');
    body.innerHTML =
      '<div class="step-question">Görüşme Kartı</div>' +
      '<div class="ai-badge-row"><span class="ai-badge" style="background:#FEF3C7;color:#92400E;">Düzenleme Modu</span></div>' +
      ucLabel +
      '<div class="gc-section-lbl">Görüşme Özeti</div>' +
      '<textarea class="meeting-textarea" id="edit-summary" style="min-height:80px;">' + (r.summary || '') + '</textarea>' +
      '<div class="gc-section-lbl">Aksiyonlar (her satır ayrı)</div>' +
      '<textarea class="meeting-textarea" id="edit-actions" style="min-height:80px;">' + actionsText + '</textarea>' +
      '<div class="gc-section-lbl">Hatırlatmalar (YYYY-MM-DD HH:MM metin)</div>' +
      '<textarea class="meeting-textarea" id="edit-reminders" style="min-height:80px;">' + remindersText + '</textarea>' +
      '<div class="gc-section-lbl">Beklenen Dönüş</div>' +
      '<textarea class="meeting-textarea" id="edit-followup" style="min-height:60px;">' + (r.followup || '') + '</textarea>' +
      '<button class="btn-meeting-save" onclick="window.applyEdits()">Onayla</button>' +
      '<button class="btn-skip" onclick="window.renderAiResultPublic(false)">Vazgeç</button>';
    return;
  }

  let html = '<div class="step-question">Görüşme Kartı</div><div class="ai-badge-row"><span class="ai-badge">AI Özeti</span></div>' + ucLabel;

  if (r.summary) {
    html += '<div class="gc-section-lbl">Görüşme Özeti</div><div class="gc-card"><div class="gc-text">' + r.summary + '</div></div>';
  }

  if (r.actions && r.actions.length > 0) {
    html += '<div class="gc-section-lbl">Aksiyonlar</div>';
    r.actions.forEach(function(a, i) {
      html += '<div class="gc-action-item" id="action-' + i + '"><div class="gc-check ' + (a.done ? 'done' : '') + '" onclick="window.toggleAction(' + i + ')"></div><div><div class="gc-action-text">' + a.text + '</div>' + (a.person ? '<div class="gc-action-sub">' + a.person + '</div>' : '') + '</div></div>';
    });
  }

  if (r.reminders && r.reminders.length > 0) {
    html += '<div class="gc-section-lbl">Hatırlatmalar</div>';
    r.reminders.forEach(function(rem) {
      html += '<div class="gc-reminder-item"><div class="gc-rem-dot ' + (rem.time ? 'urgent' : '') + '"></div><div class="gc-rem-date">' + (rem.date ? formatDate(rem.date) : 'Bugün') + (rem.time ? ' ' + rem.time : '') + '</div><div class="gc-rem-text">' + rem.text + '</div></div>';
    });
  }

  if (r.followup) {
    html += '<div class="gc-section-lbl">Beklenen Dönüş</div><div class="gc-card"><div class="gc-text">' + r.followup + '</div></div>';
  }

  if (!r.summary && !meetingData.notes) {
    html += '<div class="gc-empty">Not girilmedi. Yine de kaydetmek istiyor musunuz?</div>';
  }

  html += '<button class="btn-meeting-save" onclick="window.saveMeeting()">Kaydet</button>';
  html += '<button class="btn-skip" onclick="window.renderAiResultPublic(true)">Düzenle</button>';

  body.innerHTML = html;
}

window.renderAiResultPublic = function(editMode) { renderAiResult(editMode); };

window.applyEdits = function() {
  const summary = document.getElementById('edit-summary') ? document.getElementById('edit-summary').value : '';
  const actionsText = document.getElementById('edit-actions') ? document.getElementById('edit-actions').value : '';
  const remindersText = document.getElementById('edit-reminders') ? document.getElementById('edit-reminders').value : '';
  const followup = document.getElementById('edit-followup') ? document.getElementById('edit-followup').value : '';

  if (!aiResult) aiResult = {};
  aiResult.summary = summary;
  aiResult.actions = actionsText.split('\n').filter(function(l) { return l.trim(); }).map(function(l) { return { text: l.trim(), person: '', done: false }; });
  aiResult.reminders = remindersText.split('\n').filter(function(l) { return l.trim(); }).map(function(l) {
    const parts = l.trim().split(' ');
    const date = parts[0] && parts[0].match(/^\d{4}-\d{2}-\d{2}$/) ? parts[0] : null;
    const time = parts[1] && parts[1].match(/^\d{2}:\d{2}$/) ? parts[1] : null;
    const text = parts.slice(date ? (time ? 2 : 1) : 0).join(' ');
    return { date: date, time: time, text: text };
  });
  aiResult.followup = followup;
  renderAiResult(false);
};

window.toggleAction = function(i) {
  if (aiResult && aiResult.actions) {
    aiResult.actions[i].done = !aiResult.actions[i].done;
    const el = document.getElementById('action-' + i);
    if (el) el.querySelector('.gc-check').classList.toggle('done');
  }
};

window.saveMeeting = async function() {
  const data = await apiPost('/api/meetings', {
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
    window.dispatchEvent(new Event('contacts:reload'));
  } else {
    showToast('Hata: ' + (data ? data.error || '' : ''));
  }
};

window.nextStep = function() {
  if (meetingData.step === 1) renderStep2();
  else if (meetingData.step === 2) {
    const cityEl = document.getElementById('f-city');
    meetingData.city = cityEl ? cityEl.value : '';
    renderStep3();
  } else if (meetingData.step === 3) {
    const notesEl = document.getElementById('f-notes');
    meetingData.notes = notesEl ? notesEl.value : '';
    renderStep4();
  }
};

// GÖRÜŞME KARTLARI LİSTESİ
export async function loadMeetingCards(personId) {
  const meetings = await apiGet('/api/meetings?person_id=' + personId);
  if (!meetings) return;

  const container = document.getElementById('meeting-cards-list');
  if (!container) return;

  const header = document.getElementById('meeting-cards-header');
  if (header) header.textContent = 'Görüşme Kartları (' + meetings.length + ')';

  if (meetings.length === 0) {
    container.innerHTML = '<div class="gc-empty">Henüz görüşme kaydı yok</div>';
    return;
  }

  let html = '';
  meetings.forEach(function(m) {
    const actions = Array.isArray(m.ai_actions) ? m.ai_actions : (m.ai_actions ? JSON.parse(m.ai_actions) : []);
    const reminders = Array.isArray(m.ai_reminders) ? m.ai_reminders : (m.ai_reminders ? JSON.parse(m.ai_reminders) : []);
    const activeActions = actions.filter(function(a) { return !a.done; }).length;
    const ucData = m.user_companies_data || [];
    const roleLabel = ucData.length > 0 ? ucData.map(function(uc) { return uc.company_name; }).join(' + ') : 'Şahsen';

    html += '<div class="gk-card">';
    html += '<div class="gk-date">' + formatDate(m.created_at) + '</div>';
    html += '<span class="gk-role">' + roleLabel + ' adına</span>';
    html += '<div class="gk-ozet">' + (m.ai_summary || m.notes || '—') + '</div>';
    html += '<div class="gk-meta">';
    if (activeActions > 0) html += '<span class="gk-tag active">⚡ ' + activeActions + ' aksiyon</span>';
    if (reminders.length > 0) html += '<span class="gk-tag active">🔔 ' + reminders.length + ' hatırlatma</span>';
    if (m.category) html += '<span class="gk-tag">' + m.category + '</span>';
    if (m.city) html += '<span class="gk-tag">' + m.city + '</span>';
    html += '</div></div>';
  });

  container.innerHTML = html;
}
