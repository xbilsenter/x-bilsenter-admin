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
    let message = data.error;
    if (!message) {
      if (res.status === 404) message = 'Fant ikke endepunktet. Restart admin-serveren og prøv igjen.';
      else if (res.status === 403) message = 'Ingen tilgang.';
      else message = `Forespørsel feilet (HTTP ${res.status})`;
    }
    const err = new Error(message);
    err.status = res.status;
    if (data.code) err.code = data.code;
    throw err;
  }

  return data;
}

export async function getPublicStatus() {
  const res = await fetch(`${BASE}/public/status`);
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(data.error || 'Kunne ikke hente systemstatus');
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

export function getBootstrap() {
  return request('/bootstrap');
}

export function getDashboard() {
  return request('/dashboard');
}

export function getNettsideDrift() {
  return request('/drift/nettside');
}

export function getSitePreviewUrl() {
  return request('/drift/preview-url');
}

export function refreshFinnInventory() {
  return request('/drift/finn-refresh', { method: 'POST' });
}

export function syncFinnBilerStatus(body = {}) {
  return request('/biler/sync-finn-status', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function getVedlikehold() {
  return request('/vedlikehold');
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

export function deleteHenvendelse(id) {
  return request(`/henvendelser/${id}`, { method: 'DELETE' });
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

export function deleteInnbytte(id) {
  return request(`/innbytte/${id}`, { method: 'DELETE' });
}

export function getSelgBil() {
  return request('/selg-bil');
}

export function patchSelgBil(id, body) {
  return request(`/selg-bil/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export function deleteSelgBil(id) {
  return request(`/selg-bil/${id}`, { method: 'DELETE' });
}

export function sendSelgBilTilbud(id, body) {
  return request(`/selg-bil/${id}/send-tilbud`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function sendInnbytteTilbud(id, body) {
  return request(`/innbytte/${id}/send-tilbud`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function lookupFinnAnnonse(ref) {
  const q = encodeURIComponent(String(ref || '').trim());
  return request(`/finn/annonse?ref=${q}`);
}

export function getFinnMarkedssok({ merke, modell, aar, km, kmSlack } = {}) {
  const params = new URLSearchParams();
  if (merke) params.set('merke', merke);
  if (modell) params.set('modell', modell);
  if (aar != null && aar !== '') params.set('aar', String(aar));
  if (km != null && km !== '') params.set('km', String(km));
  if (kmSlack != null && kmSlack !== '') params.set('kmSlack', String(kmSlack));
  return request(`/finn/markedssok?${params.toString()}`);
}

export function getKunder(q) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  return request(`/kunder${qs}`);
}

export function getKunde(id) {
  return request(`/kunder/${id}`);
}

export function getKundeAktivitet(id) {
  return request(`/kunder/${id}/aktivitet`);
}

export function postKunde(body) {
  return request('/kunder', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function patchKunde(id, body) {
  return request(`/kunder/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export function deleteKunde(id) {
  return request(`/kunder/${id}`, { method: 'DELETE' });
}

export function getBiler(options) {
  const lite = options?.lite ? '?lite=1' : '';
  return request('/biler' + lite);
}

export function getBil(id) {
  return request('/biler/' + id);
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

export function deleteBil(id) {
  return request(`/biler/${id}`, { method: 'DELETE' });
}

export function getBilSlettelog() {
  return request('/biler/slettelog');
}

export function reorderBiler(updates) {
  return request('/biler/reorder', {
    method: 'POST',
    body: JSON.stringify({ updates: updates })
  });
}

export function syncBilerEuKontroll(options = {}) {
  return request('/biler/sync-eu-kontroll', {
    method: 'POST',
    body: JSON.stringify(options)
  });
}

export async function downloadReservasjonPdf(id) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${BASE}/biler/${id}/reservasjon-pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) {
    let message = 'Kunne ikke lage PDF.';
    try {
      const data = await res.json();
      if (data.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.blob();
}

export async function uploadBilDokumenter(id, files) {
  const token = localStorage.getItem(TOKEN_KEY);
  const form = new FormData();
  (files || []).forEach(function (file) {
    form.append('filer', file);
  });
  const res = await fetch(`${BASE}/biler/${id}/dokumenter`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    let message = data.error;
    if (!message) {
      if (res.status === 404) message = 'Opplasting-endepunktet finnes ikke. Restart admin-serveren og prøv igjen.';
      else message = 'Kunne ikke laste opp filer.';
    }
    throw new Error(message);
  }
  return data;
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

export function deleteKalender(id) {
  return request(`/kalender/${id}`, { method: 'DELETE' });
}

export function getInnkjopskalkyle(params = {}) {
  const qs = new URLSearchParams();
  if (params.auksjon) qs.set('auksjon', params.auksjon);
  const query = qs.toString();
  return request(`/innkjopskalkyle${query ? `?${query}` : ''}`);
}

export function postInnkjopskalkyle(body) {
  return request('/innkjopskalkyle', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function patchInnkjopskalkyle(id, body) {
  return request(`/innkjopskalkyle/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export function deleteInnkjopskalkyle(id) {
  return request(`/innkjopskalkyle/${id}`, { method: 'DELETE' });
}

export function lookupKjoretoy(regnr) {
  const reg = encodeURIComponent(String(regnr).trim().toUpperCase());
  return request(`/kjoretoy?regnr=${reg}`);
}

export function lookupKjoretoyByUnderstell(understellsnummer) {
  const value = encodeURIComponent(String(understellsnummer).trim().toUpperCase());
  return request(`/kjoretoy?understellsnummer=${value}`);
}

export async function scanChassisImage(blob) {
  const token = getToken();
  const form = new FormData();
  form.append('image', blob, 'chassis.jpg');
  const res = await fetch(`${BASE}/kjoretoy/scan-chassis`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form
  });
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok) {
    const err = new Error(data.error || 'Vision-OCR feilet.');
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

export function lookupOmregistreringsavgift(regnr, dato) {
  const reg = encodeURIComponent(String(regnr).trim().toUpperCase());
  const params = new URLSearchParams({ regnr: reg });
  if (dato) params.set('dato', String(dato).slice(0, 10));
  return request(`/omregistreringsavgift?${params.toString()}`);
}

export function getInnstillinger() {
  return request('/innstillinger');
}

export function getLister() {
  return request('/lister');
}

export function patchInnstillinger(body) {
  return request('/innstillinger', {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export function getInnboks(params = {}) {
  const qs = new URLSearchParams();
  if (params.kontoId) qs.set('kontoId', String(params.kontoId));
  if (params.mappeId) qs.set('mappeId', String(params.mappeId));
  if (params.status === false) qs.set('status', '0');
  const query = qs.toString();
  return request('/innboks' + (query ? `?${query}` : ''));
}

export function getEpostById(id) {
  return request(`/innboks/${id}`);
}

export function getInnboksMapper(kontoId, refresh) {
  const qs = new URLSearchParams({ kontoId: String(kontoId) });
  if (refresh) qs.set('refresh', '1');
  return request(`/innboks/mapper?${qs.toString()}`);
}

export function createInnboksMappe(body) {
  return request('/innboks/mapper', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function flyttEpost(id, mappeId) {
  return request(`/innboks/${id}/flytt`, {
    method: 'POST',
    body: JSON.stringify({ mappeId })
  });
}

export function deleteEpost(id) {
  return request(`/innboks/${id}`, { method: 'DELETE' });
}

export async function downloadEpostVedlegg(epostId, vedleggId, filnavn) {
  const token = getToken();
  const res = await fetch(`${BASE}/innboks/${epostId}/vedlegg/${vedleggId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) throw new Error('Kunne ikke laste ned vedlegg.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filnavn || 'vedlegg';
  a.click();
  URL.revokeObjectURL(url);
}

export function getMailStatus() {
  return request('/mail/status');
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

export function changeMyPassword(body) {
  return request('/me/password', {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
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

export function getTimeregistrering(params = {}) {
  const q = new URLSearchParams();
  if (params.fra) q.set('fra', params.fra);
  if (params.til) q.set('til', params.til);
  if (params.userId) q.set('userId', String(params.userId));
  const qs = q.toString();
  return request(`/timeregistrering${qs ? `?${qs}` : ''}`);
}

export function getTimeregistreringAktiv(userId) {
  const q = userId ? `?userId=${encodeURIComponent(String(userId))}` : '';
  return request(`/timeregistrering/aktiv${q}`);
}

export function getTimeregistreringOppsummering(params = {}) {
  const q = new URLSearchParams();
  if (params.fra) q.set('fra', params.fra);
  if (params.til) q.set('til', params.til);
  if (params.userId) q.set('userId', String(params.userId));
  const qs = q.toString();
  return request(`/timeregistrering/oppsummering${qs ? `?${qs}` : ''}`);
}

export function stempleInnTimereg() {
  return request('/timeregistrering/stemple-in', { method: 'POST' });
}

export function stempleUtTimereg() {
  return request('/timeregistrering/stemple-ut', { method: 'POST' });
}

export function startPauseTimereg(body = {}) {
  return request('/timeregistrering/pause/start', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function sluttPauseTimereg() {
  return request('/timeregistrering/pause/slutt', { method: 'POST' });
}

export function postTimeregistrering(body) {
  return request('/timeregistrering', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function patchTimeregistrering(id, body) {
  return request(`/timeregistrering/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export function deleteTimeregistrering(id) {
  return request(`/timeregistrering/${id}`, { method: 'DELETE' });
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
