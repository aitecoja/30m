// 30 m ajanotto — päälogiikka.
//
// Aika mitataan kuvavirran omista ruutuaikaleimoista (requestVideoFrameCallback,
// metadata.mediaTime). Sekä lähtö että maali luetaan samasta virrasta, joten
// kameran putkiviive on molemmissa sama ja kumoutuu vähennyslaskussa.

import { RoiDetector, EdgeTrigger } from './detector.js';
import { settings, saveSettings, resetSettings } from './settings.js';
import * as db from './storage.js';

/* ------------------------------------------------------------------ */
/* DOM-viitteet                                                        */
/* ------------------------------------------------------------------ */

const el = (id) => document.getElementById(id);

const stageEl = el('stage');
const previewEl = el('preview');
const overlayEl = el('overlay');
const overlayCtx = overlayEl.getContext('2d');

const camPromptEl = el('camPrompt');
const startCamBtn = el('startCamBtn');
const camErrorEl = el('camError');

const hudEl = el('hud');
const statusLineEl = el('statusLine');
const timeReadoutEl = el('timeReadout');
const uncertaintyEl = el('uncertainty');
const meterStartEl = el('meterStart');
const meterFinishEl = el('meterFinish');
const drawHintEl = el('drawHint');
const fpsReadoutEl = el('fpsReadout');

const athleteBtn = el('athleteBtn');
const menuBtn = el('menuBtn');
const roiStartBtn = el('roiStartBtn');
const roiFinishBtn = el('roiFinishBtn');
const armBtn = el('armBtn');
const cancelBtn = el('cancelBtn');
const reviewBtn = el('reviewBtn');
const discardBtn = el('discardBtn');
const saveBtn = el('saveBtn');
const toastEl = el('toast');

const menuDialog = el('menuDialog');
const athleteDialog = el('athleteDialog');
const historyDialog = el('historyDialog');
const settingsDialog = el('settingsDialog');
const reviewDialog = el('reviewDialog');

/* ------------------------------------------------------------------ */
/* Tila                                                                */
/* ------------------------------------------------------------------ */

const STATE = {
  IDLE: 'idle',
  READY: 'ready',
  ARMED: 'armed',
  RUNNING: 'running',
  FINISHED: 'finished'
};

let state = STATE.IDLE;
let stream = null;
let videoTrack = null;

const startDetector = new RoiDetector(48, 64);
const finishDetector = new RoiDetector(48, 64);
const startTrigger = new EdgeTrigger(2);
const finishTrigger = new EdgeTrigger(2);

let armedAtTime = 0;      // ruutuaikaleima, jolloin viritys alkoi
let startTime = null;     // ruutuaikaleima, jolloin liike lähti
let finishTime = null;    // ruutuaikaleima maalissa
let lastFrameTime = null;
const frameIntervals = [];
let measuredFps = 0;

let drawMode = null;      // null | 'start' | 'finish'
let dragRect = null;      // piirron aikainen suorakulmio

let athletes = [];
let currentAthlete = null;

let recorder = null;
let recordedChunks = [];
let recordedBlob = null;
let recordedUrl = null;

let pendingResult = null; // tallentamaton tulos
let reviewStartMark = null;
let reviewFinishMark = null;

let wakeLock = null;
let audioCtx = null;
let useRvfc = typeof HTMLVideoElement.prototype.requestVideoFrameCallback === 'function';
let rafId = 0;

/* ------------------------------------------------------------------ */
/* Apufunktiot                                                         */
/* ------------------------------------------------------------------ */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Sekunnit suomalaisittain pilkulla. */
function fmt(seconds, decimals = 2) {
  if (!isFinite(seconds)) return '–';
  return seconds.toFixed(decimals).replace('.', ',');
}

function fmtDate(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${fmtDate(iso)} klo ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

let toastTimer = 0;
function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

function ensureAudio() {
  if (!settings.sound) return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/** Lyhyt merkkiääni. Käytetään vain palautteena, ei ajanottoon. */
function beep(frequency, durationMs, delayMs = 0) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + delayMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.05);
}

function buzz(pattern) {
  if (!settings.vibrate) return;
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (err) { /* ei tuettu */ }
  }
}

/* ------------------------------------------------------------------ */
/* Kamera                                                              */
/* ------------------------------------------------------------------ */

async function startCamera() {
  camErrorEl.hidden = true;
  ensureAudio();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showCameraError('Selain ei tarjoa kameraa. Varmista, että sovellus on avattu https-osoitteesta tai asennettu kotivalikkoon.');
    return;
  }

  // Pyynnöt tärkeysjärjestyksessä. Jos puhelin hylkää tarkemman pyynnön,
  // kokeillaan seuraavaa. Viimeinen pyytää vain takakameraa ilman muita ehtoja.
  const attempts = [
    { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
    { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    { facingMode: { ideal: 'environment' } },
    true
  ];

  try {
    let lastError = null;
    stream = null;
    for (const video of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
        break;
      } catch (err) {
        lastError = err;
        // Luvan epääminen ei korjaudu uudella yrityksellä.
        if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) throw err;
      }
    }
    if (!stream) throw lastError || new Error('Kamera ei käynnistynyt');
  } catch (err) {
    if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
      showCameraError('Kameran käyttö estettiin. Salli kamera selaimen osoiterivin lukkokuvakkeesta ja yritä uudelleen.');
    } else if (err && err.name === 'NotFoundError') {
      showCameraError('Kameraa ei löytynyt.');
    } else {
      showCameraError('Kameraa ei saatu käyttöön: ' + (err && err.name ? err.name : 'tuntematon virhe'));
    }
    return;
  }

  videoTrack = stream.getVideoTracks()[0];
  previewEl.srcObject = stream;
  await previewEl.play().catch(() => {});

  camPromptEl.hidden = true;
  hudEl.hidden = false;
  setState(STATE.READY);

  applyStoredRois();
  resizeOverlay();
  requestWakeLock();
  scheduleFrame();
  updateFpsReadout();
}

function showCameraError(message) {
  camErrorEl.textContent = message;
  camErrorEl.hidden = false;
}

function updateFpsReadout() {
  const settingsFps = videoTrack && videoTrack.getSettings ? videoTrack.getSettings().frameRate : null;
  const shown = measuredFps || settingsFps || 0;
  fpsReadoutEl.textContent = shown ? `${Math.round(shown)} fps` : '–';
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (err) {
    // Näytönlukko ei ole käytettävissä. Mittaus toimii silti.
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !wakeLock && state !== STATE.IDLE) {
    requestWakeLock();
  }
});

/* ------------------------------------------------------------------ */
/* Alueiden rajaus                                                     */
/* ------------------------------------------------------------------ */

function applyStoredRois() {
  startDetector.setRoi(settings.roiStart);
  finishDetector.setRoi(settings.roiFinish);
  updateControls();
}

/** Videon todellinen näyttöalue, kun object-fit: contain jättää mustat reunat. */
function displayRect() {
  const rect = previewEl.getBoundingClientRect();
  const vw = previewEl.videoWidth;
  const vh = previewEl.videoHeight;
  if (!vw || !vh) return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  const scale = Math.min(rect.width / vw, rect.height / vh);
  const width = vw * scale;
  const height = vh * scale;
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height
  };
}

function toNormalized(clientX, clientY) {
  const d = displayRect();
  return {
    x: clamp((clientX - d.left) / d.width, 0, 1),
    y: clamp((clientY - d.top) / d.height, 0, 1)
  };
}

function resizeOverlay() {
  const dpr = window.devicePixelRatio || 1;
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  overlayEl.width = Math.round(w * dpr);
  overlayEl.height = Math.round(h * dpr);
  overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', resizeOverlay);
if ('ResizeObserver' in window) {
  new ResizeObserver(resizeOverlay).observe(stageEl);
}

let dragOrigin = null;

stageEl.addEventListener('pointerdown', (ev) => {
  if (!drawMode) return;
  stageEl.setPointerCapture(ev.pointerId);
  dragOrigin = toNormalized(ev.clientX, ev.clientY);
  dragRect = { x: dragOrigin.x, y: dragOrigin.y, w: 0, h: 0 };
  ev.preventDefault();
});

stageEl.addEventListener('pointermove', (ev) => {
  if (!drawMode || !dragOrigin) return;
  const p = toNormalized(ev.clientX, ev.clientY);
  dragRect = {
    x: Math.min(dragOrigin.x, p.x),
    y: Math.min(dragOrigin.y, p.y),
    w: Math.abs(p.x - dragOrigin.x),
    h: Math.abs(p.y - dragOrigin.y)
  };
  ev.preventDefault();
});

stageEl.addEventListener('pointerup', (ev) => {
  if (!drawMode || !dragOrigin) return;
  dragOrigin = null;
  const rect = dragRect;
  dragRect = null;

  if (!rect || rect.w < 0.02 || rect.h < 0.02) {
    toast('Alue jäi liian pieneksi. Vedä isompi suorakulmio.');
    ev.preventDefault();
    return;
  }

  if (drawMode === 'start') {
    settings.roiStart = rect;
    startDetector.setRoi(rect);
  } else {
    settings.roiFinish = rect;
    finishDetector.setRoi(rect);
  }
  saveSettings();
  setDrawMode(null);
  beep(880, 70);
  buzz(25);
  ev.preventDefault();
});

function setDrawMode(mode) {
  drawMode = mode;
  drawHintEl.hidden = !mode;
  if (mode === 'start') drawHintEl.textContent = 'Vedä suorakulmio lähtöviivan kohdalle';
  if (mode === 'finish') drawHintEl.textContent = 'Vedä suorakulmio maaliviivan kohdalle';
  roiStartBtn.textContent = mode === 'start' ? 'Peruuta' : 'Lähtöalue';
  roiFinishBtn.textContent = mode === 'finish' ? 'Peruuta' : 'Maalialue';
  updateControls();
}

/* ------------------------------------------------------------------ */
/* Piirto                                                              */
/* ------------------------------------------------------------------ */

function drawOverlay() {
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  overlayCtx.clearRect(0, 0, w, h);

  const stageRect = stageEl.getBoundingClientRect();
  const d = displayRect();
  const ox = d.left - stageRect.left;
  const oy = d.top - stageRect.top;

  const box = (roi, color, label) => {
    if (!roi) return;
    const x = ox + roi.x * d.width;
    const y = oy + roi.y * d.height;
    const bw = roi.w * d.width;
    const bh = roi.h * d.height;
    overlayCtx.lineWidth = 3;
    overlayCtx.strokeStyle = color;
    overlayCtx.strokeRect(x, y, bw, bh);
    overlayCtx.fillStyle = color;
    overlayCtx.font = '600 14px system-ui, sans-serif';
    overlayCtx.fillText(label, x + 4, Math.max(14, y - 6));
  };

  const startActive = state === STATE.ARMED;
  const finishActive = state === STATE.RUNNING
    && startTime !== null
    && lastFrameTime !== null
    && (lastFrameTime - startTime) >= settings.finishGuardSeconds;

  box(settings.roiStart, startActive ? '#f5a524' : '#4c7fbf', 'Lähtö');
  box(settings.roiFinish, finishActive ? '#f5a524' : '#2fa8a0', 'Maali');

  if (dragRect) {
    const x = ox + dragRect.x * d.width;
    const y = oy + dragRect.y * d.height;
    overlayCtx.setLineDash([8, 6]);
    overlayCtx.lineWidth = 3;
    overlayCtx.strokeStyle = '#edeae3';
    overlayCtx.strokeRect(x, y, dragRect.w * d.width, dragRect.h * d.height);
    overlayCtx.setLineDash([]);
  }
}

/* ------------------------------------------------------------------ */
/* Ruutusilmukka                                                       */
/* ------------------------------------------------------------------ */

function scheduleFrame() {
  if (useRvfc) {
    previewEl.requestVideoFrameCallback(onVideoFrame);
  } else {
    rafId = requestAnimationFrame((now) => onVideoFrame(now, null));
  }
}

function onVideoFrame(now, metadata) {
  let t;
  if (metadata && typeof metadata.mediaTime === 'number') {
    t = metadata.mediaTime;
  } else {
    t = now / 1000;
  }
  processFrame(t);
  scheduleFrame();
}

function trackFps(t) {
  if (lastFrameTime !== null) {
    const dt = t - lastFrameTime;
    if (dt > 0.002 && dt < 0.5) {
      frameIntervals.push(dt);
      if (frameIntervals.length > 40) frameIntervals.shift();
    }
  }
  lastFrameTime = t;
  if (frameIntervals.length >= 8) {
    const sorted = frameIntervals.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    measuredFps = 1 / median;
  }
}

/** Yhden ruudun epävarmuus sekunteina. */
function frameUncertainty() {
  return measuredFps > 0 ? 1 / measuredFps : 1 / 30;
}

let fpsUiCounter = 0;

function processFrame(t) {
  trackFps(t);

  if (++fpsUiCounter % 30 === 0) updateFpsReadout();

  const px = settings.pixelThreshold;
  const adapt = settings.backgroundAdapt;
  const area = settings.areaThreshold;

  if (state === STATE.READY) {
    // Esikatselussa mittarit auttavat kynnysten säätämisessä.
    if (settings.roiStart) startDetector.update(previewEl, px, adapt);
    if (settings.roiFinish) finishDetector.update(previewEl, px, adapt);
  } else if (state === STATE.ARMED) {
    const scoreStart = startDetector.update(previewEl, px, adapt);
    finishDetector.update(previewEl, px, adapt); // lämmittää taustan valmiiksi

    const settled = (t - armedAtTime) >= settings.settleSeconds;
    if (settled && startDetector.isReady) {
      statusLineEl.textContent = 'Odottaa lähtöä';
      const triggered = startTrigger.feed(scoreStart, area, t);
      if (triggered !== null) beginRun(triggered);
    } else {
      statusLineEl.textContent = 'Viritetään taustaa…';
    }
  } else if (state === STATE.RUNNING) {
    const scoreFinish = finishDetector.update(previewEl, px, adapt);
    const elapsed = t - startTime;

    if (elapsed >= settings.finishGuardSeconds && finishDetector.isReady) {
      const triggered = finishTrigger.feed(scoreFinish, area, t);
      if (triggered !== null) {
        endRun(triggered);
        return;
      }
    }

    timeReadoutEl.textContent = fmt(elapsed);

    if (elapsed > settings.maxRunSeconds) {
      abortRun('Maalia ei havaittu. Mittaus keskeytettiin.');
      return;
    }
  }

  meterStartEl.style.width = `${Math.min(100, startDetector.score * 400)}%`;
  meterFinishEl.style.width = `${Math.min(100, finishDetector.score * 400)}%`;
  meterStartEl.dataset.over = startDetector.score > area ? '1' : '0';
  meterFinishEl.dataset.over = finishDetector.score > area ? '1' : '0';

  drawOverlay();
}

/* ------------------------------------------------------------------ */
/* Mittauksen kulku                                                    */
/* ------------------------------------------------------------------ */

function setState(next) {
  state = next;
  statusLineEl.dataset.state = next;
  updateControls();
}

function updateControls() {
  const hasRois = Boolean(settings.roiStart && settings.roiFinish);
  const idle = state === STATE.IDLE;

  roiStartBtn.hidden = idle || state === STATE.RUNNING || state === STATE.ARMED || state === STATE.FINISHED;
  roiFinishBtn.hidden = roiStartBtn.hidden;

  armBtn.hidden = !(state === STATE.READY);
  armBtn.disabled = !hasRois || Boolean(drawMode);

  cancelBtn.hidden = !(state === STATE.ARMED || state === STATE.RUNNING);
  saveBtn.hidden = state !== STATE.FINISHED;
  discardBtn.hidden = state !== STATE.FINISHED;
  reviewBtn.hidden = !(state === STATE.FINISHED && recordedBlob);
}

function arm() {
  if (!settings.roiStart || !settings.roiFinish) {
    toast('Rajaa ensin lähtö- ja maalialue.');
    return;
  }
  ensureAudio();
  startDetector.setRoi(settings.roiStart);
  finishDetector.setRoi(settings.roiFinish);
  startTrigger.reset();
  finishTrigger.reset();
  startTime = null;
  finishTime = null;
  pendingResult = null;
  clearRecording();

  armedAtTime = lastFrameTime !== null ? lastFrameTime : 0;
  timeReadoutEl.textContent = '0,00';
  uncertaintyEl.textContent = '';
  setState(STATE.ARMED);
  statusLineEl.textContent = 'Viritetään taustaa…';
  beep(660, 90);
  buzz(40);

  if (settings.recordVideo) startRecording();
}

function beginRun(triggerTime) {
  startTime = triggerTime;
  finishTrigger.reset();
  setState(STATE.RUNNING);
  statusLineEl.textContent = 'Juoksu käynnissä';
  beep(1180, 80);
  buzz(30);
}

function endRun(triggerTime) {
  finishTime = triggerTime;
  const seconds = finishTime - startTime;
  const uncertainty = frameUncertainty();

  pendingResult = {
    seconds,
    rawSeconds: seconds,
    correction: 0,
    method: 'kamera',
    fps: measuredFps ? Math.round(measuredFps * 10) / 10 : null,
    uncertainty
  };

  setState(STATE.FINISHED);
  statusLineEl.textContent = 'Tulos valmis';
  showResult();
  stopRecording();
  beep(1180, 90);
  beep(1560, 140, 130);
  buzz([40, 60, 90]);
}

function showResult() {
  if (!pendingResult) return;
  timeReadoutEl.textContent = fmt(pendingResult.seconds);
  const u = pendingResult.uncertainty;
  const fpsText = pendingResult.fps ? `${pendingResult.fps} fps` : 'kuvataajuus tuntematon';
  const corrected = pendingResult.method !== 'kamera' ? ' · videosta korjattu' : '';
  uncertaintyEl.textContent = `± ${fmt(u, 3)} s · ${fpsText}${corrected}`;
}

function abortRun(message) {
  startTrigger.reset();
  finishTrigger.reset();
  startTime = null;
  finishTime = null;
  pendingResult = null;
  stopRecording();
  clearRecording();
  setState(STATE.READY);
  statusLineEl.textContent = message || 'Valmis';
  timeReadoutEl.textContent = '0,00';
  uncertaintyEl.textContent = '';
  if (message) toast(message);
  beep(320, 180);
  buzz(120);
}

function discardResult() {
  pendingResult = null;
  clearRecording();
  setState(STATE.READY);
  statusLineEl.textContent = 'Tulos hylätty';
  timeReadoutEl.textContent = '0,00';
  uncertaintyEl.textContent = '';
  buzz(60);
}

async function saveResult() {
  if (!pendingResult) return;
  if (!currentAthlete) {
    toast('Valitse ensin urheilija.');
    openDialog(athleteDialog);
    return;
  }
  await db.addRun({
    athleteId: currentAthlete.id,
    at: new Date().toISOString(),
    seconds: Math.round(pendingResult.seconds * 1000) / 1000,
    rawSeconds: Math.round(pendingResult.rawSeconds * 1000) / 1000,
    correction: Math.round(pendingResult.correction * 1000) / 1000,
    method: pendingResult.method,
    fps: pendingResult.fps,
    uncertainty: Math.round(pendingResult.uncertainty * 1000) / 1000,
    note: ''
  });

  toast(`Tallennettu: ${fmt(pendingResult.seconds)} s`);
  pendingResult = null;
  clearRecording();
  setState(STATE.READY);
  statusLineEl.textContent = 'Valmis seuraavaan';
  timeReadoutEl.textContent = '0,00';
  uncertaintyEl.textContent = '';
  beep(880, 70);
  buzz(35);
}

/* ------------------------------------------------------------------ */
/* Videotallennus ja jälkitarkastus                                    */
/* ------------------------------------------------------------------ */

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4'
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

function startRecording() {
  if (!stream || typeof MediaRecorder === 'undefined') return;
  const mimeType = pickMimeType();
  try {
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch (err) {
    recorder = null;
    return;
  }
  recordedChunks = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) recordedChunks.push(ev.data);
  };
  recorder.onstop = () => {
    if (recordedChunks.length === 0) return;
    recordedBlob = new Blob(recordedChunks, { type: recorder.mimeType || 'video/webm' });
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    recordedUrl = URL.createObjectURL(recordedBlob);
    updateControls();
  };
  recorder.start(500);
}

function stopRecording() {
  if (recorder && recorder.state !== 'inactive') {
    try { recorder.stop(); } catch (err) { /* jo pysäytetty */ }
  }
  recorder = null;
}

function clearRecording() {
  if (recordedUrl) {
    URL.revokeObjectURL(recordedUrl);
    recordedUrl = null;
  }
  recordedBlob = null;
  recordedChunks = [];
  reviewStartMark = null;
  reviewFinishMark = null;
  updateControls();
}

const reviewVideo = el('reviewVideo');
const reviewFrameTimeEl = el('reviewFrameTime');
const reviewScrub = el('reviewScrub');
const reviewMarksEl = el('reviewMarks');
const applyReviewBtn = el('applyReviewBtn');

let reviewFrameTime = 0;

/** MediaRecorderin webm ilmoittaa keston usein äärettömänä ennen ensimmäistä hakua. */
function resolveDuration(video) {
  return new Promise((resolve) => {
    if (isFinite(video.duration) && video.duration > 0) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('durationchange', onChange);
      video.currentTime = 0;
      resolve();
    };
    const onChange = () => {
      if (isFinite(video.duration) && video.duration > 0) finish();
    };
    video.addEventListener('durationchange', onChange);
    video.currentTime = 1e6;
    setTimeout(finish, 1500);
  });
}

function readReviewFrameTime() {
  reviewFrameTime = reviewVideo.currentTime;
  if (typeof reviewVideo.requestVideoFrameCallback === 'function') {
    reviewVideo.requestVideoFrameCallback((now, metadata) => {
      if (metadata && typeof metadata.mediaTime === 'number') {
        reviewFrameTime = metadata.mediaTime;
      }
      paintReviewTime();
    });
  }
  paintReviewTime();
}

function paintReviewTime() {
  reviewFrameTimeEl.textContent = `${fmt(reviewFrameTime, 3)} s`;
  const duration = isFinite(reviewVideo.duration) && reviewVideo.duration > 0 ? reviewVideo.duration : 1;
  reviewScrub.value = String(Math.round((reviewFrameTime / duration) * 1000));
  reviewMarksEl.textContent =
    `Lähtö: ${reviewStartMark === null ? '–' : fmt(reviewStartMark, 3) + ' s'} · ` +
    `Maali: ${reviewFinishMark === null ? '–' : fmt(reviewFinishMark, 3) + ' s'}`;
  const valid = reviewStartMark !== null && reviewFinishMark !== null && reviewFinishMark > reviewStartMark;
  applyReviewBtn.disabled = !valid;
}

async function openReview() {
  if (!recordedUrl) return;
  reviewVideo.src = recordedUrl;
  reviewStartMark = null;
  reviewFinishMark = null;
  openDialog(reviewDialog);
  await new Promise((resolve) => {
    if (reviewVideo.readyState >= 1) { resolve(); return; }
    reviewVideo.addEventListener('loadedmetadata', resolve, { once: true });
    setTimeout(resolve, 2000);
  });
  await resolveDuration(reviewVideo);
  reviewVideo.pause();
  reviewVideo.currentTime = 0;
  readReviewFrameTime();
}

function stepFrame(direction) {
  const step = measuredFps > 0 ? 1 / measuredFps : 1 / 30;
  const duration = isFinite(reviewVideo.duration) && reviewVideo.duration > 0 ? reviewVideo.duration : 0;
  const next = clamp(reviewVideo.currentTime + direction * step, 0, Math.max(0, duration - 0.001));
  reviewVideo.pause();
  reviewVideo.currentTime = next;
}

reviewVideo.addEventListener('seeked', readReviewFrameTime);

el('reviewPrev').addEventListener('click', () => stepFrame(-1));
el('reviewNext').addEventListener('click', () => stepFrame(1));

reviewScrub.addEventListener('input', () => {
  const duration = isFinite(reviewVideo.duration) && reviewVideo.duration > 0 ? reviewVideo.duration : 0;
  reviewVideo.pause();
  reviewVideo.currentTime = (Number(reviewScrub.value) / 1000) * duration;
});

el('markStartBtn').addEventListener('click', () => {
  reviewStartMark = reviewFrameTime;
  paintReviewTime();
  buzz(25);
});

el('markFinishBtn').addEventListener('click', () => {
  reviewFinishMark = reviewFrameTime;
  paintReviewTime();
  buzz(25);
});

applyReviewBtn.addEventListener('click', () => {
  if (reviewStartMark === null || reviewFinishMark === null) return;
  if (!pendingResult) return;
  const corrected = reviewFinishMark - reviewStartMark;
  pendingResult.correction = corrected - pendingResult.rawSeconds;
  pendingResult.seconds = corrected;
  pendingResult.method = 'kamera + videokorjaus';
  showResult();
  closeDialog(reviewDialog);
  toast(`Korjattu aika ${fmt(corrected)} s`);
});

/* ------------------------------------------------------------------ */
/* Urheilijat                                                          */
/* ------------------------------------------------------------------ */

async function loadAthletes() {
  athletes = await db.listAthletes();
  if (settings.lastAthleteId) {
    currentAthlete = athletes.find((a) => a.id === settings.lastAthleteId) || null;
  }
  if (!currentAthlete && athletes.length === 1) currentAthlete = athletes[0];
  paintAthleteButton();
  paintAthleteList();
}

function paintAthleteButton() {
  athleteBtn.textContent = currentAthlete ? currentAthlete.name : 'Valitse urheilija';
}

function paintAthleteList() {
  const list = el('athleteList');
  list.textContent = '';

  if (athletes.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Lisää ensimmäinen urheilija yläreunan kentästä.';
    list.appendChild(li);
    return;
  }

  for (const athlete of athletes) {
    const li = document.createElement('li');
    li.dataset.selected = currentAthlete && currentAthlete.id === athlete.id ? '1' : '0';

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'btn grow';
    pick.style.minHeight = '44px';
    pick.textContent = athlete.name;
    pick.addEventListener('click', () => {
      currentAthlete = athlete;
      settings.lastAthleteId = athlete.id;
      saveSettings();
      paintAthleteButton();
      paintAthleteList();
      closeDialog(athleteDialog);
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'iconbtn';
    remove.textContent = 'Poista';
    remove.addEventListener('click', async () => {
      if (!confirm(`Poistetaanko ${athlete.name} ja kaikki hänen tuloksensa?`)) return;
      await db.deleteAthlete(athlete.id);
      if (currentAthlete && currentAthlete.id === athlete.id) {
        currentAthlete = null;
        settings.lastAthleteId = null;
        saveSettings();
      }
      await loadAthletes();
    });

    li.appendChild(pick);
    li.appendChild(remove);
    list.appendChild(li);
  }
}

el('addAthleteBtn').addEventListener('click', async () => {
  const input = el('newAthleteName');
  const name = input.value.trim();
  if (!name) return;
  const id = await db.addAthlete(name);
  input.value = '';
  await loadAthletes();
  currentAthlete = athletes.find((a) => a.id === id) || currentAthlete;
  if (currentAthlete) {
    settings.lastAthleteId = currentAthlete.id;
    saveSettings();
  }
  paintAthleteButton();
  paintAthleteList();
});

/* ------------------------------------------------------------------ */
/* Historia                                                            */
/* ------------------------------------------------------------------ */

async function openHistory() {
  const title = el('historyTitle');
  const summary = el('sessionSummary');
  const trend = el('trendWrap');
  const list = el('runList');

  summary.textContent = '';
  trend.textContent = '';
  list.textContent = '';

  if (!currentAthlete) {
    title.textContent = 'Historia';
    const li = document.createElement('li');
    li.textContent = 'Valitse urheilija nähdäksesi tulokset.';
    list.appendChild(li);
    openDialog(historyDialog);
    return;
  }

  title.textContent = `Historia · ${currentAthlete.name}`;
  const runs = await db.listRuns(currentAthlete.id);

  if (runs.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Ei vielä tuloksia.';
    list.appendChild(li);
    openDialog(historyDialog);
    return;
  }

  const today = new Date().toDateString();
  const session = runs.filter((r) => new Date(r.at).toDateString() === today);
  const source = session.length > 0 ? session : runs;
  const times = source.map((r) => r.seconds);
  const best = Math.min(...runs.map((r) => r.seconds));
  const sessionBest = Math.min(...times);
  const average = times.reduce((a, b) => a + b, 0) / times.length;

  summary.appendChild(summaryCell(session.length > 0 ? 'Tämän päivän juoksuja' : 'Juoksuja', String(source.length)));
  summary.appendChild(summaryCell(session.length > 0 ? 'Päivän paras' : 'Paras', fmt(sessionBest)));
  summary.appendChild(summaryCell('Keskiarvo', fmt(average)));
  summary.appendChild(summaryCell('Ennätys', fmt(best)));

  trend.innerHTML = buildTrendSvg(runs.slice(-20));

  for (const run of runs.slice().reverse()) {
    list.appendChild(runListItem(run, best));
  }

  openDialog(historyDialog);
}

function summaryCell(key, value) {
  const div = document.createElement('div');
  const k = document.createElement('span');
  k.className = 'k';
  k.textContent = key;
  const v = document.createElement('span');
  v.className = 'v';
  v.textContent = value;
  div.appendChild(k);
  div.appendChild(v);
  return div;
}

function runListItem(run, best) {
  const li = document.createElement('li');

  const time = document.createElement('span');
  time.className = 'mono';
  time.style.fontSize = '1.25rem';
  time.style.minWidth = '4.2em';
  time.textContent = fmt(run.seconds);

  const info = document.createElement('span');
  info.className = 'grow';
  const main = document.createElement('span');
  main.textContent = fmtDateTime(run.at) + (run.seconds === best ? ' · ennätys' : '');
  const sub = document.createElement('span');
  sub.className = 'sub';
  sub.textContent = `${run.method} · ± ${fmt(run.uncertainty, 3)} s`
    + (run.fps ? ` · ${fmt(run.fps, 1)} fps` : '')
    + (run.correction ? ` · korjaus ${fmt(run.correction, 3)} s` : '');
  info.appendChild(main);
  info.appendChild(sub);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'iconbtn';
  remove.textContent = 'Poista';
  remove.addEventListener('click', async () => {
    await db.deleteRun(run.id);
    closeDialog(historyDialog);
    openHistory();
  });

  li.appendChild(time);
  li.appendChild(info);
  li.appendChild(remove);
  return li;
}

/** Yksinkertainen kehityskäyrä. Pienempi aika on ylempänä. */
function buildTrendSvg(runs) {
  if (runs.length < 2) return '';
  const width = 600;
  const height = 130;
  const padX = 10;
  const padY = 14;
  const times = runs.map((r) => r.seconds);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(0.05, max - min);

  const points = runs.map((run, i) => {
    const x = padX + (i / (runs.length - 1)) * (width - 2 * padX);
    const y = padY + ((run.seconds - min) / span) * (height - 2 * padY);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const dots = points.map((p) => {
    const [x, y] = p.split(',');
    return `<circle cx="${x}" cy="${y}" r="4" fill="#4c7fbf" />`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Kehityskäyrä">
    <polyline points="${points.join(' ')}" fill="none" stroke="#4c7fbf" stroke-width="2.5" />
    ${dots}
    <text x="${padX}" y="12" fill="#94a1ae" font-size="12">${fmt(min)} s</text>
    <text x="${padX}" y="${height - 3}" fill="#94a1ae" font-size="12">${fmt(max)} s</text>
  </svg>`;
}

/* ------------------------------------------------------------------ */
/* CSV-vienti                                                          */
/* ------------------------------------------------------------------ */

function csvField(value) {
  const text = value === null || typeof value === 'undefined' ? '' : String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function exportCsv() {
  const runs = await db.listAllRuns();
  if (runs.length === 0) {
    toast('Ei vietävää.');
    return;
  }
  const names = new Map(athletes.map((a) => [a.id, a.name]));

  const header = ['Päivä', 'Kello', 'Urheilija', 'Aika (s)', 'Mittaustapa', 'Korjaus (s)', 'Kuvataajuus (fps)', 'Epävarmuus (s)', 'Huomiot'];
  const lines = [header.join(';')];

  for (const run of runs) {
    const d = new Date(run.at);
    const pad = (n) => String(n).padStart(2, '0');
    lines.push([
      fmtDate(run.at),
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
      names.get(run.athleteId) || 'Tuntematon',
      fmt(run.seconds, 3),
      run.method,
      fmt(run.correction || 0, 3),
      run.fps ? fmt(run.fps, 1) : '',
      fmt(run.uncertainty || 0, 3),
      run.note || ''
    ].map(csvField).join(';'));
  }

  // BOM, jotta taulukkolaskenta tunnistaa ääkköset.
  const blob = new Blob(['\uFEFF' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const today = new Date();
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const link = document.createElement('a');
  link.href = url;
  link.download = `30m-ajanotto-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('CSV tallennettu latauksiin.');
}

/* ------------------------------------------------------------------ */
/* Asetusten käyttöliittymä                                            */
/* ------------------------------------------------------------------ */

function paintSettings() {
  el('setGuard').value = settings.finishGuardSeconds;
  el('setMaxRun').value = settings.maxRunSeconds;
  el('setPixel').value = settings.pixelThreshold;
  el('setArea').value = settings.areaThreshold;
  el('setAdapt').value = settings.backgroundAdapt;
  el('setRecord').checked = settings.recordVideo;
  el('setSound').checked = settings.sound;
  el('setVibrate').checked = settings.vibrate;
}

function bindNumber(id, key, lo, hi) {
  el(id).addEventListener('change', () => {
    const value = Number(el(id).value);
    if (!isFinite(value)) { paintSettings(); return; }
    settings[key] = clamp(value, lo, hi);
    saveSettings();
    paintSettings();
  });
}

bindNumber('setGuard', 'finishGuardSeconds', 0, 20);
bindNumber('setMaxRun', 'maxRunSeconds', 5, 120);
bindNumber('setPixel', 'pixelThreshold', 4, 80);
bindNumber('setArea', 'areaThreshold', 0.01, 0.6);
bindNumber('setAdapt', 'backgroundAdapt', 0.002, 0.3);

el('setRecord').addEventListener('change', () => { settings.recordVideo = el('setRecord').checked; saveSettings(); });
el('setSound').addEventListener('change', () => { settings.sound = el('setSound').checked; saveSettings(); });
el('setVibrate').addEventListener('change', () => { settings.vibrate = el('setVibrate').checked; saveSettings(); });

el('resetSettingsBtn').addEventListener('click', () => {
  resetSettings();
  paintSettings();
  toast('Oletukset palautettu.');
});

/* ------------------------------------------------------------------ */
/* Dialogien hallinta                                                  */
/* ------------------------------------------------------------------ */

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const dialog = btn.closest('dialog');
    if (dialog) closeDialog(dialog);
  });
});

document.querySelectorAll('[data-open]').forEach((btn) => {
  btn.addEventListener('click', () => {
    closeDialog(menuDialog);
    const target = el(btn.dataset.open);
    if (target === historyDialog) {
      openHistory();
    } else {
      if (target === settingsDialog) paintSettings();
      openDialog(target);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Painikkeet                                                          */
/* ------------------------------------------------------------------ */

startCamBtn.addEventListener('click', startCamera);
menuBtn.addEventListener('click', () => openDialog(menuDialog));
athleteBtn.addEventListener('click', () => { paintAthleteList(); openDialog(athleteDialog); });

roiStartBtn.addEventListener('click', () => setDrawMode(drawMode === 'start' ? null : 'start'));
roiFinishBtn.addEventListener('click', () => setDrawMode(drawMode === 'finish' ? null : 'finish'));

armBtn.addEventListener('click', arm);
cancelBtn.addEventListener('click', () => abortRun('Keskeytetty'));
discardBtn.addEventListener('click', discardResult);
saveBtn.addEventListener('click', saveResult);
reviewBtn.addEventListener('click', openReview);

el('exportBtn').addEventListener('click', () => { closeDialog(menuDialog); exportCsv(); });

el('fullscreenBtn').addEventListener('click', async () => {
  closeDialog(menuDialog);
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
      if (screen.orientation && screen.orientation.lock) {
        try { await screen.orientation.lock('landscape'); } catch (err) { /* lukitus ei tuettu */ }
      }
    }
  } catch (err) {
    toast('Kokoruututila ei ole käytettävissä.');
  }
  setTimeout(resizeOverlay, 300);
});

/* ------------------------------------------------------------------ */
/* Käynnistys                                                          */
/* ------------------------------------------------------------------ */

async function boot() {
  paintSettings();
  await loadAthletes();
  updateControls();

  if (navigator.storage && navigator.storage.persist) {
    try { await navigator.storage.persist(); } catch (err) { /* ei kriittinen */ }
  }

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (err) {
      // Ilman service workeria sovellus toimii verkossa mutta ei offline.
    }
  }
}

boot();
