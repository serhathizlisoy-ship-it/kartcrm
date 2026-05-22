import { showScreen, showToast } from './ui.js';

export let authToken = localStorage.getItem('kartcrm_token');
export let currentUser = JSON.parse(localStorage.getItem('kartcrm_user') || 'null');

export function setAuth(token, user) {
  authToken = token;
  currentUser = user;
  localStorage.setItem('kartcrm_token', token);
  localStorage.setItem('kartcrm_user', JSON.stringify(user));
}

export function clearAuth() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('kartcrm_token');
  localStorage.removeItem('kartcrm_user');
}

export async function apiGet(path) {
  const res = await fetch(path, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify(body)
  });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

export async function apiDelete(path) {
  const res = await fetch(path, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

export function logout() {
  clearAuth();
  showScreen('screen-auth');
}

export function initAuth() {
  const btnLogin = document.getElementById('btn-login');
  const btnRegister = document.getElementById('btn-register');

  if (btnLogin) btnLogin.addEventListener('click', login);
  if (btnRegister) btnRegister.addEventListener('click', register);

  document.getElementById('login-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });

  document.querySelectorAll('#btn-logout, #btn-logout2').forEach(btn => {
    btn?.addEventListener('click', logout);
  });
}

export function switchTab(tab) {
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
    setAuth(data.token, data.user);
    window.dispatchEvent(new Event('auth:login'));
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
    setAuth(data.token, data.user);
    window.dispatchEvent(new Event('auth:login'));
  } catch (e) {
    errEl.textContent = 'Bağlantı hatası';
  }
}
