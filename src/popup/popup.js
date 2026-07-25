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

let loadingProgress = 0;
let loadingTarget = 90;
let loadingInterval = null;
let scanResultData = null;

function startLoading() {
  setState('loading');
  loadingProgress = 0;
  loadingTarget = 90;
  scanResultData = null;

  // Reset loading step checklist elements
  const stepIds = ['url', 'domain', 'company', 'ssl', 'db', 'ai'];
  stepIds.forEach(id => {
    const el = $(`load-proc-${id}`);
    if (el) {
      el.className = 'proc-item proc-item--pending';
      const statusEl = el.querySelector('.proc-item__status');
      if (statusEl) statusEl.textContent = '○';
    }
  });
  $('loadProgressBarFill').style.width = '0%';
  $('loadProgressVal').textContent = '0%';

  loadingInterval = setInterval(() => {
    // If scan has already returned, we can speed up the progress bar to 100%
    const currentTarget = scanResultData ? 100 : loadingTarget;
    if (loadingProgress < currentTarget) {
      const diff = currentTarget - loadingProgress;
      const step = scanResultData ? Math.max(4, diff * 0.2) : Math.max(1, diff * 0.1);
      loadingProgress = Math.min(currentTarget, loadingProgress + step);
    }

    // Update progress bar
    $('loadProgressBarFill').style.width = `${Math.round(loadingProgress)}%`;
    $('loadProgressVal').textContent = `${Math.round(loadingProgress)}%`;

    // Update loading steps checklist states
    updateLoadingSteps(loadingProgress);

    // If 100% progress and data is available, render it
    if (loadingProgress >= 100) {
      stopLoading();
      if (scanResultData) {
        renderResult(scanResultData);
      } else {
        showError('No scan data received.');
      }
    }
  }, 50);
}

function updateLoadingSteps(progress) {
  const steps = [
    { id: 'url', min: 0, max: 15 },
    { id: 'domain', min: 15, max: 35 },
    { id: 'company', min: 35, max: 55 },
    { id: 'ssl', min: 55, max: 70 },
    { id: 'db', min: 70, max: 85 },
    { id: 'ai', min: 85, max: 100 }
  ];

  steps.forEach(step => {
    const el = $(`load-proc-${step.id}`);
    if (!el) return;
    const statusEl = el.querySelector('.proc-item__status');

    if (progress >= step.max) {
      el.className = 'proc-item proc-item--done';
      if (statusEl) statusEl.textContent = '✓';
    } else if (progress >= step.min) {
      el.className = 'proc-item proc-item--active';
      if (statusEl) statusEl.textContent = '●';
    } else {
      el.className = 'proc-item proc-item--pending';
      if (statusEl) statusEl.textContent = '○';
    }
  });
}

function stopLoading() {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
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
  if (resp.error) {
    stopLoading();
    showError(resp.error);
    return;
  }
  if (!resp.scan) {
    stopLoading();
    showError('No result returned. Try again.');
    return;
  }
  currentScan = resp.scan;
  scanResultData = resp.scan;
}

// ---- render ---------------------------------------------------------------
function updateFactor(el, pass, text) {
  if (!el) return;
  el.className = `factor-item factor-item--${pass ? 'pass' : 'fail'}`;
  const iconEl = el.querySelector('.factor-icon');
  const lblEl = el.querySelector('.factor-lbl');
  if (iconEl) iconEl.textContent = pass ? '✓' : '✗';
  if (lblEl) lblEl.textContent = text;
}

function renderResult(scan) {
  const color = RISK_COLOR[scan.riskLevel] || getVar('--brand');
  app.style.setProperty('--verdict', color);

  // populate score and badge
  $('riskBadge').textContent = scan.riskLabel;
  
  // Custom simple recommendation text:
  let recLabel = 'Safe';
  if (scan.riskLevel === 'low') recLabel = 'Safe';
  else if (scan.riskLevel === 'medium') recLabel = 'Be Cautious';
  else if (scan.riskLevel === 'high') recLabel = 'High Risk';
  else if (scan.riskLevel === 'critical') recLabel = 'Likely Scam';
  $('recoText').textContent = `Recommendation: ${recLabel}`;

  // Update Risk Factors
  const hasWebsite = !!(scan.companyData && (scan.companyData.website || scan.companyData.linkedin));
  const isValidCompany = !!(scan.companyData && (scan.companyData.verificationStatus === 'verified' || scan.companyData.verificationStatus === 'partially_verified'));
  const noPhishing = scan.scamProbability < 30;

  updateFactor($('factor-website'), hasWebsite, 'Official website');
  updateFactor($('factor-company'), isValidCompany, 'Valid company');
  updateFactor($('factor-phishing'), noPhishing, 'No phishing detected');

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

  // animate score number count up
  countUp($('scoreNum'), scan.trustScore);
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
