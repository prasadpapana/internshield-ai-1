// src/popup/popup.js
import { getSettings } from '../services/storage.js';

function getVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const RISK_COLOR = {
  safe: getVar('--safe'), low: getVar('--low'), medium: getVar('--medium'),
  high: getVar('--high'), critical: getVar('--critical'),
};

const app = document.getElementById('app');
const $ = (id) => document.getElementById(id);

let currentScan = null;

// ---- messaging ------------------------------------------------------------
function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
        return;
      }
      resolve(resp || {});
    });
  });
}

// ---- theme ----------------------------------------------------------------
async function applyTheme() {
  const settings = await getSettings();
  let theme = settings.theme;
  if (theme === 'system') {
    theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
}

// ---- state ----------------------------------------------------------------
function setState(state) { app.setAttribute('data-state', state); }

const LOADING_STEPS = [
  'Reading the page\u2026',
  'Checking the company\u2026',
  'Inspecting the domain\u2026',
  'Scoring the posting\u2026',
];
let loadingTimer = null;
function startLoading() {
  setState('loading');
  let i = 0;
  $('loadingStatus').textContent = LOADING_STEPS[0];
  loadingTimer = setInterval(() => {
    i = (i + 1) % LOADING_STEPS.length;
    $('loadingStatus').textContent = LOADING_STEPS[i];
  }, 650);
}
function stopLoading() {
  if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = null; }
}

function showError(msg) {
  stopLoading();
  $('errorMsg').textContent = msg || 'Something went wrong.';
  setState('error');
}

// ---- scan -----------------------------------------------------------------
async function scan() {
  startLoading();
  const resp = await send({ type: 'SCAN_PAGE' });
  stopLoading();
  if (resp.error) { showError(resp.error); return; }
  if (!resp.scan) { showError('No result returned. Try again.'); return; }
  currentScan = resp.scan;
  renderResult(resp.scan);
}

// ---- render ---------------------------------------------------------------
function renderResult(scan) {
  const color = RISK_COLOR[scan.riskLevel] || getVar('--brand');
  app.style.setProperty('--verdict', color);

  // verdict gauge
  $('riskPill').textContent = scan.riskLabel;
  $('summary').textContent = scan.summary;
  $('scamVal').textContent = `${scan.scamProbability}%`;
  $('confVal').textContent = `${scan.confidence}%`;

  // job reference (textContent => XSS-safe)
  $('jobTitle').textContent = scan.jobTitle;
  $('jobCompany').textContent = scan.company;

  // breakdown bars
  const bd = $('breakdown');
  bd.replaceChildren();
  const labels = { company: 'Company', domain: 'Domain', content: 'Content', recruiter: 'Recruiter' };
  for (const key of ['company', 'domain', 'content', 'recruiter']) {
    const row = document.createElement('div');
    row.className = 'bd';
    const lbl = document.createElement('span'); lbl.className = 'bd__lbl'; lbl.textContent = labels[key];
    const track = document.createElement('div'); track.className = 'bd__track';
    const fill = document.createElement('div'); fill.className = 'bd__fill';
    const val = document.createElement('span'); val.className = 'bd__val';
    val.textContent = String(scan.breakdown[key]);
    track.appendChild(fill);
    row.append(lbl, track, val);
    bd.appendChild(row);
    requestAnimationFrame(() => { fill.style.width = `${scan.breakdown[key]}%`; });
  }

  renderList($('posList'), scan.positives, 'No strong positive signals found.');
  renderList($('negList'), scan.negatives, 'No red flags detected.');

  // recommendation
  $('reco').replaceChildren();
  const strong = document.createElement('strong'); strong.textContent = 'Advice: ';
  $('reco').append(strong, document.createTextNode(scan.recommendation));

  setState('result');

  // animate gauge: dashoffset 327 -> based on score, count up number
  const fillEl = $('gaugeFill');
  const circumference = 327; // 2*pi*52 rounded
  const offset = circumference - (circumference * scan.trustScore) / 100;
  requestAnimationFrame(() => { fillEl.style.strokeDashoffset = String(offset); });
  countUp($('scoreVal'), scan.trustScore);
}

function renderList(ul, items, emptyMsg) {
  ul.replaceChildren();
  if (!items || items.length === 0) {
    const li = document.createElement('li');
    li.className = 'findlist__empty';
    li.textContent = emptyMsg;
    ul.appendChild(li);
    return;
  }
  for (const item of items.slice(0, 6)) {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  }
}

function countUp(el, target) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { el.textContent = String(target); return; }
  const dur = 900; const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(target * eased));
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---- report modal ---------------------------------------------------------
function openReport() {
  $('reportReason').value = '';
  $('reportModal').hidden = false;
  $('reportReason').focus();
}
function closeReport() { $('reportModal').hidden = true; }

async function submitReport() {
  if (!currentScan) { closeReport(); return; }
  const reason = $('reportReason').value;
  const btn = $('reportSubmit');
  btn.disabled = true; btn.textContent = 'Saving\u2026';
  await send({ type: 'REPORT_SCAM', scanId: currentScan.id, reason });
  btn.disabled = false; btn.textContent = 'Save report';
  closeReport();
}

// ---- wiring ---------------------------------------------------------------
function init() {
  applyTheme();
  $('scanBtn').addEventListener('click', scan);
  $('rescanBtn').addEventListener('click', scan);
  $('retryBtn').addEventListener('click', scan);
  $('reportBtn').addEventListener('click', openReport);
  $('reportCancel').addEventListener('click', closeReport);
  $('reportSubmit').addEventListener('click', submitReport);
  $('reportModal').addEventListener('click', (e) => {
    if (e.target === $('reportModal')) closeReport();
  });
  $('openHistory').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/history/history.html') });
  });
  $('openSettings').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else chrome.tabs.create({ url: chrome.runtime.getURL('src/settings/settings.html') });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('reportModal').hidden) closeReport();
  });
}

init();
