import { showScreen, showToast } from './ui.js';

let cameraStream = null;

export function stopCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  const v = document.getElementById('camera-video');
  if (v) v.srcObject = null;
}

export async function startCamera() {
  stopCamera();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    const video = document.getElementById('camera-video');
    video.srcObject = cameraStream;
    await video.play();
  } catch (e) { showToast('Kamera açılamadı'); }
}

async function resizeImage(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1000 / img.width, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.src = dataUrl;
  });
}

export async function sendToOCR(dataUrl) {
  const resized = await resizeImage(dataUrl);
  const base64 = resized.split(',')[1];
  document.getElementById('ocr-loading').style.display = 'block';

  try {
    const response = await fetch('https://kartcrm.vercel.app/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 })
    });
    if (!response.ok) throw new Error('Sunucu hatası: ' + response.status);
    const parsed = await response.json();
    document.getElementById('ocr-loading').style.display = 'none';
    return parsed;
  } catch (e) {
    document.getElementById('ocr-loading').style.display = 'none';
    showToast('OCR hatası: ' + e.message);
    return {};
  }
}

export function initCamera() {
  document.getElementById('btn-capture')?.addEventListener('click', async () => {
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    if (!video.videoWidth) { showToast('Kamera hazır değil'); return; }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    stopCamera();
    const data = await sendToOCR(canvas.toDataURL('image/jpeg', 0.9));
    fillVerifyForm(data);
    showScreen('screen-verify');
  });

  document.getElementById('file-input')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      stopCamera();
      const data = await sendToOCR(ev.target.result);
      fillVerifyForm(data);
      showScreen('screen-verify');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
}

export function fillVerifyForm(data) {
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
