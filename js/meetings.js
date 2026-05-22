import { showScreen, showToast, formatDate } from './ui.js';
import { apiPost, apiGet } from './auth.js';

let meetingData = {
  personId: null,
  personName: null,
  companyId: null,
  userCompanyId: null,
  category: null,
  city: null,
  notes: '',
  step: 1
};

let aiResult = null;
let recognition = null;
let isRecording = false;

// =====================
// ADIM YÖNETİMİ
// =====================
export function startMeetingFlow(personId, personName, companyId) {
  meetingData = { personId, personName, companyId, userCompanyId: null, category: null, city: null, notes: '', step: 1 };
  aiResult = null;
  renderStep1();
  showScreen('screen-meeting');
}

function renderStepBar(current) {
  const bar = document.getElementById('meeting-step-bar');
  if (!bar) return;
  bar.innerHTML = [1,2,3,4].map(i => 
    `<div class="step-dot ${i < current ? 'done' : i === current ? 'active' : ''}"></div>`
  ).join('');
}

function renderPersonTag() {
  const el = document.getElementById('meeting-person-tag');
  if (!el) return;
  el.innerHTML = `
    <div class="person-tag-inner">
      <div class="meeting-avatar">${meetingData.personName?.split(' ').map(n=>n[0]).join('').slice(0,2) || '?'}</div>
      <div>
        <div class="meeting-person-name">${meetingData.personName || ''}</div>
      </div>
    </div>
  `;
}

// =====================
// ADIM 1: KİMİ TEMSİL EDİYORDUN
// =====================
async function renderStep1() {
  meetingData.step = 1;
  renderStepBar(1);
  renderPersonTag();

  const body = document.getElementById('meeting-body');
  const companies = await apiGet('/api/usercompanies');

  if (!companies || companies.length === 0) {
    body.innerHTML = `
      <div class="step-question">Kimi temsil ediyordun?</div>
      <div class="step-sub">Hangi sıfatla görüştün?</div>
      <div class="warning-box">
        <div class="warning-text">Kayıtlı Şirket Kimliğiniz Bulunamadı.<br>Lütfen sisteme şirket girişi yapınız.</div>
        <button class="warning-btn" onclick="window.showScreen('screen-profile')">Şirket Ekle</button>
      </div>
      <button class="btn-skip" onclick="window.nextStep()">Şimdi Değil, Geç</button>
    `;
    return;
  }

  const defaultCo = companies.find(c => c.is_default);
  if (defaultCo) meetingData.userCompanyId = defaultCo.id;

  body.innerHTML = `
    <div class="step-question">Kimi temsil ediyordun?</div>
    <div class="step-sub">Hangi sıfatla görüştün?</div>
    <div id="company-list">
      ${companies.map(c => `
        <div class="company-select-card ${c.is_default ? 'selected' : ''}" data-id="${c.id}" onclick="window.selectUserCompany('${c.id}', this)">
          <div>
            <div class="cs-name">${c.company_name}</div>
            <div class="cs-title">${c.title || ''}</div>
          </div>
          <div class="cs-check ${c.is_default ? 'active' : ''}">✓</div>
        </div>
      `).join('')}
      <div class="company-select-card ${!defaultCo ? 'selected' : ''}" data-id="" onclick="window.selectUserCompany('', this)">
        <div>
          <div class="cs-name">Şahsen</div>
          <div class="cs-title">Kişisel</div>
        </div>
        <div class="cs-check ${!defaultCo ? 'active' : ''}">✓</div>
      </div>
    </div>
    <button class="btn-meeting-next" onclick="window.nextStep()">İleri →</button>
  `;
}

window.selectUserCompany = function(id, el) {
  document.querySelectorAll('.company-select-card').forEach(c => {
    c.classList.remove('selected');
    c.querySelector('.cs-check')?.classList.remove('active');
  });
  el.classList.add('selected');
  el.querySelector('.cs-check')?.classList.add('active');
  meetingData.userCompanyId = id || null;
};

// =====================
// ADIM 2: NEREDE TANIŞTILAR
// =====================
function renderStep2() {
  meetingData.step = 2;
  renderStepBar(2);

  const cats = ['İş görüşmesi', 'Toplantı', 'Yemek', 'Fuar', 'Dernek', 'Karşılaşma', 'Diğer'];

  document.getElementById('meeting-body').innerHTML = `
    <div class="step-question">Nerede tanıştınız?</div>
    <div class="step-sub">Görüşme ortamını seç</div>
    <div class="cat-grid">
      ${cats.map(c => `
        <div class="cat-card ${meetingData.category === c ? 'selected' : ''}" onclick="window.selectCategory('${c}', this)">
          <div class="cat-label">${c}</div>
        </div>
      `).join('')}
    </div>
    <div class="city-input-wrap">
      <input class="form-input" type="text" id="f-city" placeholder="Şehir (isteğe bağlı)" value="${meetingData.city || ''}">
    </div>
    <button class="btn-meeting-next" onclick="window.nextStep()">İleri →</button>
    <button class="btn-skip" onclick="window.nextStep()">Geç</button>
  `;
}

window.selectCategory = function(cat, el) {
  document.querySelectorAll('.cat-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  meetingData.category = cat;
};

// =====================
// ADIM 3: NE KONUŞTUNUZ
// =====================
function renderStep3() {
  meetingData.step = 3;
  renderStepBar(3);

  document.getElementById('meeting-body').innerHTML = `
    <div class="step-question">Ne konuştunuz?</div>
    <div class="step-sub">Yaz ya da sesle not bırak</div>
    <textarea class="meeting-textarea" id="f-notes" placeholder="Aklında ne kaldı? Birkaç kelime yeterli...">${meetingData.notes || ''}</textarea>
    <button class="mic-btn" id="btn-mic" onclick="window.toggleMic()">
      <div class="mic-btn-inner">
        <div class="mic-icon-wrap" id="mic-icon-wrap">🎤</div>
        <div>
          <div class="mic-label" id="mic-label">Sesle Not Al</div>
          <div class="mic-sub">Bas ve konuş</div>
        </div>
      </div>
    </button>
    <button class="btn-meeting-next" onclick="window.nextStep()">İleri →</button>
    <button class="btn-skip" onclick="window.nextStep()">Geç</button>
  `;
}

window.toggleMic = function() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Tarayıcınız ses tanımayı desteklemiyor');
    return;
  }

  if (isRecording) {
    recognition?.stop();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'tr-TR';
  recognition.continuous = true;
  recognition.interimResults = true;

  const textarea = document.getElementById('f-notes');
  const micBtn = document.getElementById('btn-mic');
  const micLabel = document.getElementById('mic-label');
  const micIconWrap = document.getElementById('mic-icon-wrap');

  let finalTranscript = textarea?.value || '';

  recognition.onstart = () => {
    isRecording = true;
    if (micBtn) micBtn.classList.add('recording');
    if (micLabel) micLabel.textContent = 'Dinleniyor...';
    if (micIconWrap) micIconWrap.innerHTML = '<div class="mic-waves"><span></span><span></span><span></span></div>';
  };

  recognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        finalTranscript += e.results[i][0].transcript + ' ';
      } else {
        interim += e.results[i][0].transcript;
      }
    }
    if (textarea) textarea.value = finalTranscript + interim;
  };

  recognition.onend = () => {
    isRecording = false;
    if (micBtn) micBtn.classList.remove('recording');
    if (micLabel) micLabel.textContent = 'Sesle Not Al';
    if (micIconWrap) micIconWrap.innerHTML = '🎤';
    meetingData.notes = textarea?.value || '';
  };

  recognition.start();
};

// =====================
// ADIM 4: AI ÖZET
// =====================
async function renderStep4() {
  meetingData.step = 4;
  renderStepBar(4);

  const notes = document.getElementById('f-notes')?.value || meetingData.notes;
  meetingData.notes = notes;

  document.getElementById('meeting-body').innerHTML = `
    <div class="step-question">Görüşme Kartı</div>
    <div class="step-sub">AI analiz ediyor...</div>
    <div class="ai-loading">
      <div class="ai-dot"></div>
      <div class="ai-dot"></div>
      <div class="ai-dot"></div>
      <span>Görüşme analiz ediliyor</span>
    </div>
  `;

  // AI analizi yap
  if (notes && notes.length > 10) {
    const result = await apiPost('/api/ai', {
      notes,
      person_name: meetingData.personName
    });
    if (result && !result.error) {
      aiResult = result;
    }
  }

  renderAiResult();
}

function renderAiResult() {
  const body = document.getElementById('meeting-body');
  const r = aiResult || {};

  body.innerHTML = `
    <div class="step-question">Görüşme Kartı</div>
    <div class="ai-badge-row"><span class="ai-badge">AI Özeti</span></div>

    ${r.summary ? `
      <div class="gc-section-lbl">Görüşme Özeti</div>
      <div class="gc-card">
        <div class="gc-text" id="ai-summary-text">${r.summary}</div>
      </div>
    ` : ''}

    ${r.actions && r.actions.length > 0 ? `
      <div class="gc-section-lbl">Aksiyonlar</div>
      ${r.actions.map((a, i) => `
        <div class="gc-action-item" id="action-${i}">
          <div class="gc-check ${a.done ? 'done' : ''}" onclick="window.toggleAction(${i})"></div>
          <div>
            <div class="gc-action-text">${a.text}</div>
            ${a.person ? `<div class="gc-action-sub">${a.person}</div>` : ''}
          </div>
        </div>
      `).join('')}
    ` : ''}

    ${r.reminders && r.reminders.length > 0 ? `
      <div class="gc-section-lbl">Hatırlatmalar</div>
      ${r.reminders.map(rem => `
        <div class="gc-reminder-item">
          <div class="gc-rem-dot ${rem.time ? 'urgent' : ''}"></div>
          <div class="gc-rem-date">${rem.date ? formatDate(rem.date) : 'Bugün'}${rem.time ? ' ' + rem.time : ''}</div>
          <div class="gc-rem-text">${rem.text}</div>
        </div>
      `).join('')}
    ` : ''}

    ${r.followup ? `
      <div class="gc-section-lbl">Beklenen Dönüş</div>
      <div class="gc-card">
        <div class="gc-text">${r.followup}</div>
      </div>
    ` : ''}

    ${!r.summary && !meetingData.notes ? `
      <div class="gc-empty">Not girilmedi. Yine de kaydetmek istiyor musunuz?</div>
    ` : ''}

    <button class="btn-meeting-save" onclick="window.saveMeeting()">Kaydet</button>
    <button class="btn-skip" onclick="window.saveMeeting()">Düzenleme — Kaydet</button>
  `;
}

window.toggleAction = function(i) {
  if (aiResult && aiResult.actions) {
    aiResult.actions[i].done = !aiResult.actions[i].done;
    const check = document.getElementById(`action-${i}`)?.querySelector('.gc-check');
    if (check) check.classList.toggle('done');
  }
};

// =====================
// KAYDET
// =====================
window.saveMeeting = async function() {
  const data = await apiPost('/api/meetings', {
    person_id: meetingData.personId,
    company_id: meetingData.companyId,
    user_company_id: meetingData.userCompanyId,
    category: meetingData.category,
    city: meetingData.city,
    notes: meetingData.notes,
    ai_summary: aiResult?.summary || '',
    ai_actions: aiResult?.actions || [],
    ai_reminders: aiResult?.reminders || [],
    ai_followup: aiResult?.followup || '',
  });

  if (data && !data.error) {
    showToast('✓ Görüşme Kartı kaydedildi');
    showScreen('screen-home');
    window.dispatchEvent(new Event('contacts:reload'));
  } else {
    showToast('Hata: ' + (data?.error || 'Bilinmeyen hata'));
  }
};

// =====================
// İLERİ / GERİ
// =====================
window.nextStep = function() {
  if (meetingData.step === 1) {
    renderStep2();
  } else if (meetingData.step === 2) {
    const city = document.getElementById('f-city')?.value;
    meetingData.city = city;
    renderStep3();
  } else if (meetingData.step === 3) {
    const notes = document.getElementById('f-notes')?.value;
    meetingData.notes = notes;
    renderStep4();
  }
};

// =====================
// GÖRÜŞME KARTLARI LİSTESİ
// =====================
export async function loadMeetingCards(personId) {
  const meetings = await apiGet(`/api/meetings?person_id=${personId}`);
  if (!meetings) return;

  const container = document.getElementById('meeting-cards-list');
  if (!container) return;

  const header = document.getElementById('meeting-cards-header');
  if (header) header.textContent = `Görüşme Kartları (${meetings.length})`;

  if (meetings.length === 0) {
    container.innerHTML = '<div class="gc-empty">Henüz görüşme kaydı yok</div>';
    return;
  }

  container.innerHTML = meetings.map(m => {
    const actions = Array.isArray(m.ai_actions) ? m.ai_actions : (m.ai_actions ? JSON.parse(m.ai_actions) : []);
    const reminders = Array.isArray(m.ai_reminders) ? m.ai_reminders : (m.ai_reminders ? JSON.parse(m.ai_reminders) : []);
    const activeActions = actions.filter(a => !a.done).length;

    return `
      <div class="gk-card" onclick="window.openMeetingCard('${m.id}')">
        <div class="gk-date">${formatDate(m.created_at)}</div>
        ${m.user_company_name ? `<span class="gk-role">${m.user_company_name} adına</span>` : '<span class="gk-role passive">Şahsen</span>'}
        <div class="gk-ozet">${m.ai_summary || m.notes || '—'}</div>
        <div class="gk-meta">
          ${activeActions > 0 ? `<span class="gk-tag active">⚡ ${activeActions} aksiyon</span>` : ''}
          ${reminders.length > 0 ? `<span class="gk-tag active">🔔 ${reminders.length} hatırlatma</span>` : ''}
          ${m.category ? `<span class="gk-tag">${m.category}</span>` : ''}
          ${m.city ? `<span class="gk-tag">${m.city}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

window.openMeetingCard = function(id) {
  // İleride detay ekranı açılacak
  showToast('Görüşme kartı detayı yakında...');
};
