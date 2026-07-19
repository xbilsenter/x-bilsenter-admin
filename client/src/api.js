import { TOKEN_KEY } from './constants.js';

const BASE = '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    const err = new Error(data.error || 'Forespørsel feilet');
    err.status = res.status;
    throw err;
  }

  return data;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function login(username, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  if (data.token) setToken(data.token);
  return data;
}

export function logout() {
  setToken(null);
}

export function getDashboard() {
  return request('/dashboard');
}

export function getHenvendelser() {
  return request('/henvendelser');
}

export function patchHenvendelse(id, body) {
  return request(`/henvendelser/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export function getInnbytte() {
  return request('/innbytte');
}

export function patchInnbytte(id, body) {
  return request(`/innbytte/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export function getBiler() {
  return request('/biler');
}

export function postBil(body) {
  return request('/biler', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function patchBil(id, body) {
  return request(`/biler/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export function getKalender() {
  return request('/kalender');
}

export function postKalender(body) {
  return request('/kalender', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function patchKalender(id, body) {
  return request(`/kalender/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export function lookupKjoretoy(regnr) {
  const reg = encodeURIComponent(String(regnr).trim().toUpperCase());
  return request(`/kjoretoy?regnr=${reg}`);
}

export function getInnstillinger() {
  return request('/innstillinger');
}

export function patchInnstillinger(body) {
  return request('/innstillinger', {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export function getInnboks() {
  return request('/innboks');
}

export function syncInnboks(body = {}) {
  return request('/innboks/sync', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function patchEpost(id, body) {
  return request(`/innboks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export function sendEpost(body) {
  return request('/innboks/send', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export async function sendEpostMultipart(formData) {
  const token = getToken();
  const res = await fetch(`${BASE}/innboks/send`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const err = new Error(data.error || 'Kunne ikke sende e-post.');
    err.status = res.status;
    throw err;
  }
  return data;
}

export function getEpostUtkast() {
  return request('/innboks/utkast');
}

export function getEpostUtkastById(id) {
  return request(`/innboks/utkast/${id}`);
}

export function saveEpostUtkast(body) {
  return request('/innboks/utkast', {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

export function deleteEpostUtkast(id) {
  return request(`/innboks/utkast/${id}`, { method: 'DELETE' });
}

export function opprettHenvFraEpost(id, body = {}) {
  return request(`/innboks/${id}/oppret-henvendelse`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function sendHenvendelseSvar(id, body) {
  return request(`/henvendelser/${id}/send-svar`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function getMailKontoer() {
  return request('/mail/kontoer');
}

export function postMailKonto(body) {
  return request('/mail/kontoer', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function patchMailKonto(id, body) {
  return request(`/mail/kontoer/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export function deleteMailKonto(id) {
  return request(`/mail/kontoer/${id}`, { method: 'DELETE' });
}

export function testMailKonto(id) {
  return request(`/mail/kontoer/${id}/test`, { method: 'POST' });
}

export function getEpostMaler() {
  return request('/mail/maler');
}

export function postEpostMal(body) {
  return request('/mail/maler', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function patchEpostMal(id, body) {
  return request(`/mail/maler/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export function deleteEpostMal(id) {
  return request(`/mail/maler/${id}`, { method: 'DELETE' });
}

export function getMe() {
  return request('/auth/me');
}

export function getBrukereMeta() {
  return request('/brukere/meta');
}

export function getBrukere() {
  return request('/brukere');
}

export function postBruker(body) {
  return request('/brukere', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function patchBruker(id, body) {
  return request(`/brukere/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export function deleteBruker(id) {
  return request(`/brukere/${id}`, { method: 'DELETE' });
}

export async function uploadSignatureImage(file) {
  const token = localStorage.getItem(TOKEN_KEY);
  const form = new FormData();
  form.append('bilde', file);
  const res = await fetch('/api/mail/upload-bilde', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form
  });
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new Error(data.error || 'Opplasting feilet');
  return data;
}
