(() => {
'use strict';

/* ───────────────────────── Réglages & état ───────────────────────── */
const LS_SET = 'passlab.settings.v1';
const LS_STATE = 'passlab.state.v1';

const DEFAULTS = {
  appName: 'PassLab',
  logoText: 'P',
  logoImage: '',
  holderName: 'Camille Demo',
  photo: '',
  passTitle: 'Pass mensuel 18-64 ans',
  network: 'Réseau Démo',
  theme: 'dark',
  accent: '#34D1B6',
  accent2: '#FFB547',
  startDay: 4,
  startTime: '08:51',
  endTime: '02:00',
  transferMin: 60,
  memoryMin: 120,
  texts: {
    scanTitle: 'Scanne le QR code',
    travelersLabel: 'Nombre de voyageurs',
    validityLabel: 'Période de validité',
    lastLabel: 'Dernière validation',
    transferText: 'Correspondance possible encore {n} min',
    transferBtn: 'Valider une correspondance',
  },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } };

function merge(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (base[k] && typeof base[k] === 'object') merge(base[k], extra[k]);
    else if (extra[k] !== undefined && extra[k] !== null) base[k] = extra[k];
  }
  return base;
}

let settings = merge(clone(DEFAULTS), load(LS_SET));
let state = Object.assign({ lastScan: null, travelers: 1, cameraId: '' }, load(LS_STATE) || {});

const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, p, v) => { const ks = p.split('.'); const l = ks.pop(); ks.reduce((a, k) => a[k], o)[l] = v; };

/* ───────────────────────── Outils ───────────────────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const p2 = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${p2(d.getFullYear() % 100)}`;
const fmtTime = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const params = new URLSearchParams(location.search);

function parseTime(s, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
  return m ? [Math.min(23, +m[1]), Math.min(59, +m[2])] : fallback;
}

/** Période : jour N du mois courant (début) → même jour du mois suivant (fin). */
function validity(now) {
  const day = Math.min(28, Math.max(1, Number(settings.startDay) || 4));
  const [sh, sm] = parseTime(settings.startTime, [8, 51]);
  const [eh, em] = parseTime(settings.endTime, [2, 0]);
  return {
    start: new Date(now.getFullYear(), now.getMonth(), day, sh, sm),
    end: new Date(now.getFullYear(), now.getMonth() + 1, day, eh, em),
  };
}

function resizeImage(file, size, mime) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL(mime, 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
    img.src = url;
  });
}

/* ───────────────────────── Application des réglages ───────────────────────── */
function applySettings() {
  const root = document.documentElement;
  root.dataset.theme = settings.theme === 'light' ? 'light' : 'dark';
  root.style.setProperty('--accent', settings.accent);
  root.style.setProperty('--accent2', settings.accent2);
  const n = parseInt(settings.accent.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  root.style.setProperty('--on-accent', lum > 150 ? '#06120F' : '#FFFFFF');
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  $('meta[name="theme-color"]').setAttribute('content', bg);
  document.title = settings.appName || 'PassLab';

  const t = settings.texts;
  $('#scanHint').textContent = 'Cadre le code dans le viseur';
  $('#travLabel').textContent = t.travelersLabel;
  $('#lblValidity').textContent = t.validityLabel;
  $('#lblLast').textContent = t.lastLabel;
  $('#btnTransfer').textContent = t.transferBtn;
  $('#holderName').textContent = settings.holderName;
  $('#passTitle').textContent = settings.passTitle;
  $('#passNet').textContent = settings.network;

  // logo
  const core = $('#logoCore');
  core.textContent = '';
  if (settings.logoImage) {
    const img = new Image();
    img.src = settings.logoImage;
    img.alt = '';
    core.appendChild(img);
  } else {
    const sp = document.createElement('span');
    sp.textContent = settings.logoText || settings.appName.slice(0, 1) || 'P';
    core.appendChild(sp);
  }

  // avatar
  const av = $('#avatar');
  av.textContent = '';
  if (settings.photo) {
    av.style.backgroundImage = `url("${settings.photo}")`;
  } else {
    av.style.backgroundImage = '';
    const sp = document.createElement('span');
    sp.textContent = (settings.holderName || '?').split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
    av.appendChild(sp);
  }
  renderTitle(currentView === 'settings' ? 'settings' : currentView);
  renderPass();
}

/* ───────────────────────── Navigation ───────────────────────── */
let currentView = 'scan';
let previousView = 'scan';
let manualScan = false;

function renderTitle(view) {
  let title;
  if (view === 'scan') title = settings.texts.scanTitle;
  else if (view === 'pass') title = settings.appName;
  else if (view === 'settings') title = 'Réglages';
  else title = settings.appName;
  $('#topTitle').textContent = title;
  $('#btnBack').hidden = !(view === 'settings' || (view === 'scan' && state.lastScan));
  $('#btnSettings').hidden = view === 'loading';
}

function show(view, { animate = true } = {}) {
  if (view !== 'settings') previousView = view;
  currentView = view;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  $('#view-pass').classList.toggle('noanim', !animate);
  renderTitle(view);
  window.scrollTo(0, 0);
  if (view === 'scan') startCamera(); else stopCamera();
  if (view === 'pass') renderPass();
}

function route() {
  const fresh = state.lastScan && Date.now() - state.lastScan < Math.max(1, settings.memoryMin) * 60000;
  show(fresh ? 'pass' : 'scan', { animate: false });
}

/* ───────────────────────── Écran titre ───────────────────────── */
function renderPass() {
  const now = new Date();
  const { start, end } = validity(now);
  $('#vFromD').textContent = fmtDate(start);
  $('#vFromT').textContent = fmtTime(start);
  $('#vToD').textContent = fmtDate(end);
  $('#vToT').textContent = fmtTime(end);

  const chip = $('#travChip');
  chip.hidden = state.travelers < 2;
  chip.textContent = `${state.travelers} voyageurs`;

  const last = state.lastScan ? new Date(state.lastScan) : null;
  $('#lastD').textContent = last ? fmtDate(last) : '--/--/--';
  $('#lastT').textContent = last ? fmtTime(last) : '--:--';

  const total = Math.max(1, settings.transferMin) * 60000;
  const remaining = last ? state.lastScan + total - now.getTime() : 0;
  const mins = Math.max(0, Math.ceil(remaining / 60000));
  const expired = remaining <= 0;
  const ring = $('.tring');
  ring.classList.toggle('expired', expired);
  $('#tMin').textContent = expired ? '0' : String(mins);
  $('#tText').textContent = expired ? 'Correspondance expirée' : settings.texts.transferText.replace('{n}', mins);
  $('#tSub').textContent = last ? `Dernier scan à ${fmtTime(last)}` : '';
  const frac = expired ? 0 : Math.min(1, remaining / total);
  $('#tProg').style.strokeDashoffset = String(169.65 * (1 - frac));
}
setInterval(() => { if (currentView === 'pass') renderPass(); }, 1000);

/* ───────────────────────── Caméra & détection QR ───────────────────────── */
const video = $('#video');
const camMsg = $('#camMsg');
const camMsgText = $('#camMsgText');
const btnSim = $('#btnSim');
const frame = $('#frame');
const canvas = document.createElement('canvas');
const cctx = canvas.getContext('2d', { willReadFrequently: true });

let stream = null;
let scanning = false;
let busy = false;
let rafId = 0; // minuteur de la boucle de détection
let detector = null;
let zoomCaps = null;
let zoomVal = 1;
let startToken = 0;

async function initDetector() {
  if (detector || !('BarcodeDetector' in window)) return;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    if (formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  } catch { /* on retombe sur jsQR */ }
}

function setCamMessage(text, { sim = false, hide = false } = {}) {
  camMsg.classList.toggle('hidden', hide);
  camMsgText.textContent = text;
  btnSim.hidden = !(sim || params.has('sim'));
}

async function fillCameraList() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const sel = $('#camSelect');
    sel.textContent = '';
    devs.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `Caméra ${i + 1}`;
      sel.appendChild(o);
    });
    const current = stream && stream.getVideoTracks()[0] && stream.getVideoTracks()[0].getSettings().deviceId;
    if (current) sel.value = current;
    sel.hidden = devs.length < 2;
  } catch { /* ignoré */ }
}

function setupZoom() {
  const track = stream && stream.getVideoTracks()[0];
  const caps = track && track.getCapabilities ? track.getCapabilities() : null;
  zoomCaps = caps && caps.zoom ? caps.zoom : null;
  $('#zoomCtl').hidden = !zoomCaps;
  if (zoomCaps) { zoomVal = Math.max(zoomCaps.min, 1); updateZoomLabel(); }
}
function updateZoomLabel() { $('#zoomVal').textContent = `${zoomVal.toFixed(1).replace(/\.0$/, '')}×`; }
async function changeZoom(dir) {
  if (!zoomCaps) return;
  const step = Math.max(zoomCaps.step || 0.1, (zoomCaps.max - zoomCaps.min) / 8);
  zoomVal = Math.min(zoomCaps.max, Math.max(zoomCaps.min, zoomVal + dir * step));
  try { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ zoom: zoomVal }] }); } catch { /* ignoré */ }
  updateZoomLabel();
}

async function startCamera(deviceId) {
  stopCamera();
  frame.classList.remove('ok');
  const token = ++startToken;
  await initDetector();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setCamMessage('Caméra indisponible ici : ouvre la page en HTTPS.', { sim: true });
    return;
  }
  setCamMessage('Démarrage de la caméra…');
  const id = deviceId || state.cameraId;
  const video_ = id
    ? { deviceId: { exact: id } }
    : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: video_ });
    if (token !== startToken || currentView !== 'scan') { s.getTracks().forEach((t) => t.stop()); return; }
    stream = s;
    video.srcObject = s;
    await video.play().catch(() => {});
    setCamMessage('', { hide: true });
    setupZoom();
    fillCameraList();
    scanning = true;
    rafId = setTimeout(tick, 120);
  } catch (e) {
    if (token !== startToken) return;
    const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
    if (id && !denied) { state.cameraId = ''; save(LS_STATE, state); return startCamera(); }
    setCamMessage(denied ? 'Accès caméra refusé. Autorise-le dans les réglages du navigateur.' : 'Caméra introuvable.', { sim: true });
  }
}

function stopCamera() {
  scanning = false;
  startToken++;
  clearTimeout(rafId);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
}

async function tick() {
  if (!scanning) return;
  rafId = setTimeout(tick, 120);
  if (busy || video.readyState < 2 || !video.videoWidth) return;
  busy = true;
  let found = false;
  try {
    if (detector) {
      found = (await detector.detect(video)).length > 0;
    } else if (typeof jsQR === 'function') {
      const w = video.videoWidth, h = video.videoHeight;
      const k = Math.min(1, 720 / Math.max(w, h));
      canvas.width = Math.round(w * k);
      canvas.height = Math.round(h * k);
      cctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = cctx.getImageData(0, 0, canvas.width, canvas.height);
      found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' }) !== null;
    }
  } catch { /* image non exploitable, on réessaie */ }
  busy = false;
  if (found && scanning) onDetected();
}

/* ───────────────────────── Séquence de validation ───────────────────────── */
let validating = false;
async function onDetected() {
  if (validating) return;
  validating = true;
  scanning = false;
  try { navigator.vibrate && navigator.vibrate(70); } catch { /* ignoré */ }

  frame.classList.add('ok');
  const vp = $('#viewport');
  vp.classList.remove('flash'); void vp.offsetWidth; vp.classList.add('flash');
  await sleep(450);

  state.lastScan = Date.now();
  save(LS_STATE, state);
  manualScan = false;

  const wrap = $('#logoWrap');
  wrap.classList.remove('done', 'pulse');
  $('#loadingText').textContent = 'Validation en cours…';
  show('loading');
  await sleep(1100);
  wrap.classList.add('done', 'pulse');
  $('#loadingText').textContent = 'Titre validé';
  await sleep(650);

  show('pass');
  validating = false;
}

/* ───────────────────────── Réglages : liaison des champs ───────────────────────── */
function bindSettings() {
  $$('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    el.value = getPath(settings, key);
    el.addEventListener('input', () => {
      let v = el.value;
      if (el.type === 'number') {
        v = Number(v);
        if (!Number.isFinite(v) || v < Number(el.min || 0)) return;
        v = Math.min(v, Number(el.max || Infinity));
      }
      setPath(settings, key, v);
      save(LS_SET, settings);
      applySettings();
    });
  });

  const pick = (btn, input) => $(btn).addEventListener('click', () => $(input).click());
  pick('#photoPick', '#photoFile');
  pick('#logoPick', '#logoFile');
  $('#photoFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { settings.photo = await resizeImage(f, 320, 'image/jpeg'); save(LS_SET, settings); applySettings(); } catch { /* ignoré */ }
    e.target.value = '';
  });
  $('#logoFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { settings.logoImage = await resizeImage(f, 256, 'image/png'); save(LS_SET, settings); applySettings(); } catch { /* ignoré */ }
    e.target.value = '';
  });
  $('#photoClear').addEventListener('click', () => { settings.photo = ''; save(LS_SET, settings); applySettings(); });
  $('#logoClear').addEventListener('click', () => { settings.logoImage = ''; save(LS_SET, settings); applySettings(); });

  $('#btnClearScan').addEventListener('click', () => { state.lastScan = null; save(LS_STATE, state); applySettings(); });
  $('#btnReset').addEventListener('click', () => {
    if (!confirm('Réinitialiser tous les réglages ?')) return;
    settings = clone(DEFAULTS);
    save(LS_SET, settings);
    $$('[data-key]').forEach((el) => { el.value = getPath(settings, el.dataset.key); });
    applySettings();
  });
}

/* ───────────────────────── Événements ───────────────────────── */
function bindEvents() {
  $('#btnSettings').addEventListener('click', () => show('settings'));
  $('#btnBack').addEventListener('click', () => {
    if (currentView === 'settings') show(previousView === 'loading' ? 'pass' : previousView, { animate: false });
    else if (currentView === 'scan' && state.lastScan) { manualScan = false; show('pass', { animate: false }); }
  });
  $('#btnTransfer').addEventListener('click', () => { manualScan = true; show('scan'); });
  $('#btnSim').addEventListener('click', () => onDetected());

  $('#zoomIn').addEventListener('click', () => changeZoom(1));
  $('#zoomOut').addEventListener('click', () => changeZoom(-1));
  $('#camSelect').addEventListener('change', (e) => { state.cameraId = e.target.value; save(LS_STATE, state); startCamera(e.target.value); });

  const setTrav = (n) => { state.travelers = Math.min(9, Math.max(1, n)); $('#travVal').textContent = state.travelers; save(LS_STATE, state); };
  $('#travMinus').addEventListener('click', () => setTrav(state.travelers - 1));
  $('#travPlus').addEventListener('click', () => setTrav(state.travelers + 1));
  $('#travVal').textContent = state.travelers;

  const dlg = $('#helpDlg');
  $('#btnHelp').addEventListener('click', () => dlg.showModal());
  $('#helpClose').addEventListener('click', () => dlg.close());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopCamera(); return; }
    if (validating || currentView === 'settings' || currentView === 'loading') return;
    if (currentView === 'scan' && manualScan) { startCamera(); return; }
    route();
  });
}

/* ───────────────────────── Démarrage ───────────────────────── */
bindSettings();
bindEvents();
applySettings();
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
})();
