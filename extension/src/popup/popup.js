// extension/src/popup/popup.js
import { getSettings } from '../background/storage.js';
import { renderScoreComponent } from './components/score.js';
import { renderRiskLevelComponent } from './components/risk-level.js';
import { renderSignalsComponent } from './components/signals.js';
import { renderRecommendationComponent } from './components/recommendation.js';

function getVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const RISK_COLOR = {
  safe: getVar('--safe'),
  low: getVar('--low'),
  medium: getVar('--medium'),
  high: getVar('--high'),
  critical: getVar('--critical'),
};

const app = document.getElementById('app');
const $ = (id) => document.getElementById(id);

let currentScan = null;

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

async function applyTheme() {
  const settings = await getSettings();
  let theme = settings.theme;
  if (theme === 'system') {
    theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
}

function setState(state) {
  app.setAttribute('data-state', state);
  const panelLeft = document.getElementById('sidePanelLeft');
  const panelRight = document.getElementById('sidePanelRight');
  if (state === 'result') {
    panelLeft && panelLeft.classList.add('sp-visible');
    panelRight && panelRight.classList.add('sp-visible');
  } else {
    panelLeft && panelLeft.classList.remove('sp-visible');
    panelRight && panelRight.classList.remove('sp-visible');
  }
}

let loadingProgress = 0;
let loadingTarget = 90;
let loadingInterval = null;
let scanResultData = null;

function startLoading() {
  setState('loading');
  loadingProgress = 0;
  loadingTarget = 90;
  scanResultData = null;

  const stepIds = ['url', 'domain', 'company', 'ssl', 'db', 'ai'];
  stepIds.forEach((id) => {
    const el = $(`load-proc-${id}`);
    if (el) {
      el.className = 'proc-item proc-item--pending';
      const statusEl = el.querySelector('.proc-item__status');
      if (statusEl) statusEl.textContent = '○';
    }
  });

  const fillEl = $('loadProgressBarFill');
  const valEl = $('loadProgressVal');
  if (fillEl) fillEl.style.width = '0%';
  if (valEl) valEl.textContent = '0%';

  loadingInterval = setInterval(() => {
    const currentTarget = scanResultData ? 100 : loadingTarget;
    if (loadingProgress < currentTarget) {
      const diff = currentTarget - loadingProgress;
      const step = scanResultData ? Math.max(4, diff * 0.2) : Math.max(1, diff * 0.1);
      loadingProgress = Math.min(currentTarget, loadingProgress + step);
    }

    if (fillEl) fillEl.style.width = `${Math.round(loadingProgress)}%`;
    if (valEl) valEl.textContent = `${Math.round(loadingProgress)}%`;

    updateLoadingSteps(loadingProgress);

    if (loadingProgress >= 100) {
      stopLoading();
      if (scanResultData) {
        renderResult(scanResultData);
      } else {
        showError('No scan data received from analysis worker.');
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
    { id: 'ai', min: 85, max: 100 },
  ];

  steps.forEach((step) => {
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

function updateFactor(el, pass, text) {
  if (!el) return;
  el.className = `factor-item factor-item--${pass ? 'pass' : 'fail'}`;
  const iconEl = el.querySelector('.factor-icon');
  const lblEl = el.querySelector('.factor-lbl');
  if (iconEl) iconEl.textContent = pass ? '✓' : '✗';
  if (lblEl) lblEl.textContent = text;
}

function renderResult(scan) {
  const levelKey = String(scan.riskLevel || '').toLowerCase().replace(/[^a-z]/g, '');
  let colorKey = 'medium';
  if (levelKey === 'low' || levelKey === 'safe') colorKey = 'safe';
  else if (levelKey === 'moderate') colorKey = 'medium';
  else if (levelKey === 'high') colorKey = 'high';
  else if (levelKey === 'veryhigh' || levelKey === 'critical') colorKey = 'critical';

  const color = RISK_COLOR[colorKey] || getVar('--brand');
  app.style.setProperty('--verdict', color);

  // AI badge
  const aiBadge = $('aiBadge');
  const aiProcItem = $('aiProcessItem');
  const aiProcLbl = $('aiProcessLabel');
  if (scan.source === 'grok-enriched') {
    if (aiBadge) aiBadge.hidden = false;
    if (aiProcItem) aiProcItem.className = 'proc-item proc-item--done';
    if (aiProcLbl) aiProcLbl.textContent = 'Grok AI Verified';
  } else {
    if (aiBadge) aiBadge.hidden = true;
    if (aiProcItem) aiProcItem.className = 'proc-item proc-item--done';
    if (aiProcLbl) aiProcLbl.textContent = 'Deterministic Scan';
  }

  // Component renders
  renderRiskLevelComponent($('riskBadge'), $('recoText'), scan.riskLevel, scan.riskLabel);

  const hasWebsite = !!(scan.companyData && (scan.companyData.website || scan.companyData.linkedin));
  const isValidCompany = !!(scan.companyData && (scan.companyData.verificationStatus === 'verified' || scan.companyData.verificationStatus === 'partially_verified'));
  const noPhishing = scan.scamProbability < 30;

  updateFactor($('factor-website'), hasWebsite, 'Official website');
  updateFactor($('factor-company'), isValidCompany, 'Valid company');
  updateFactor($('factor-phishing'), noPhishing, 'No phishing detected');

  $('jobTitle').textContent = scan.jobTitle || 'Job Posting';
  $('jobCompany').textContent = scan.company || 'Unknown Company';

  // Breakdown bars with null-guard fix
  const bd = $('breakdown');
  bd.replaceChildren();
  const breakdownData = scan.breakdown || { company: 50, domain: 50, content: 50, recruiter: 50 };
  const labels = { company: 'Company', domain: 'Domain', content: 'Content', recruiter: 'Recruiter' };

  for (const key of ['company', 'domain', 'content', 'recruiter']) {
    const val = breakdownData[key] ?? 50;
    const row = document.createElement('div');
    row.className = 'bd';
    const lbl = document.createElement('span'); lbl.className = 'bd__lbl'; lbl.textContent = labels[key];
    const track = document.createElement('div'); track.className = 'bd__track';
    const fill = document.createElement('div'); fill.className = 'bd__fill';
    const valSpan = document.createElement('span'); valSpan.className = 'bd__val';
    valSpan.textContent = String(val);

    track.appendChild(fill);
    row.append(lbl, track, valSpan);
    bd.appendChild(row);
    requestAnimationFrame(() => { fill.style.width = `${val}%`; });
  }

  renderSignalsComponent($('posList'), $('negList'), scan.positives, scan.negatives);
  renderRecommendationComponent($('reco'), scan.recommendation);

  setState('result');

  renderScoreComponent($('scoreNum'), scan.trustScore);
  renderSidePanels(scan);
}

function renderSidePanels(scan) {
  renderResumePanel(scan);
  renderAtsPanel(scan);
}

function renderResumePanel(scan) {
  const posCount = (scan.positives || []).length;
  const negCount = (scan.negatives || []).length;
  const total = posCount + negCount || 1;
  const rawFit = Math.round((scan.trustScore * 0.6) + ((posCount / total) * 40));
  const fitScore = Math.min(100, Math.max(0, rawFit));

  const ringFill = document.getElementById('resumeRingFill');
  const fitScoreEl = document.getElementById('resumeFitScore');
  if (ringFill) {
    const circ = 163.4;
    const offset = circ - (circ * fitScore / 100);
    requestAnimationFrame(() => { ringFill.style.strokeDashoffset = String(offset); });
  }
  if (fitScoreEl) renderScoreComponent(fitScoreEl, fitScore);

  const skillList = document.getElementById('resumeSkillList');
  if (skillList && scan.breakdown) {
    skillList.replaceChildren();
    const skillMap = {
      company: 'Company Fit',
      domain:  'Platform Trust',
      content: 'Job Clarity',
      recruiter: 'Recruiter Quality',
    };
    for (const [key, label] of Object.entries(skillMap)) {
      const pct = scan.breakdown[key] ?? 0;
      const item = document.createElement('div');
      item.className = 'sp-skill-item';
      const name = document.createElement('span'); name.className = 'sp-skill-name'; name.textContent = label;
      const pctEl = document.createElement('span'); pctEl.className = 'sp-skill-pct'; pctEl.textContent = `${pct}%`;
      const track = document.createElement('div'); track.className = 'sp-skill-bar-track';
      const fill = document.createElement('div'); fill.className = 'sp-skill-bar-fill'; fill.style.width = '0%';
      track.appendChild(fill);

      item.append(name, pctEl, track);
      skillList.appendChild(item);
      requestAnimationFrame(() => { fill.style.width = `${pct}%`; });
    }
  }

  const tipList = document.getElementById('resumeTipList');
  if (tipList) {
    tipList.replaceChildren();
    const tips = [];
    for (const p of (scan.positives || []).slice(0, 3)) {
      tips.push({ text: p, type: 'good' });
    }
    for (const n of (scan.negatives || []).slice(0, 3)) {
      tips.push({ text: n, type: 'warn' });
    }
    if (tips.length === 0) {
      const li = document.createElement('li');
      li.className = 'sp-tip sp-tip--idle';
      li.textContent = 'No specific tips available.';
      tipList.appendChild(li);
    } else {
      for (const tip of tips) {
        const li = document.createElement('li');
        li.className = `sp-tip sp-tip--${tip.type}`;
        li.textContent = tip.text;
        tipList.appendChild(li);
      }
    }
  }
}

function renderAtsPanel(scan) {
  const atsPct = Math.min(100, Math.max(0, scan.trustScore || 0));

  const atsRing = document.getElementById('atsRingFill');
  const atsPctEl = document.getElementById('atsMatchPct');
  if (atsRing) {
    const circ = 163.4;
    const offset = circ - (circ * atsPct / 100);
    requestAnimationFrame(() => { atsRing.style.strokeDashoffset = String(offset); });
  }
  if (atsPctEl) renderScoreComponent(atsPctEl, atsPct);

  const atsLabel = document.getElementById('atsMatchLabel');
  if (atsLabel) {
    const lvl = scan.riskLevel || 'safe';
    const msgs = {
      safe:     'Strong ATS match. Posting looks legitimate.',
      low:      'Good match. Minor signals to review.',
      medium:   'Moderate match. Proceed with caution.',
      high:     'Weak match. Several red flags present.',
      critical: 'Very low match. Likely fraudulent posting.',
    };
    atsLabel.textContent = msgs[lvl] || msgs.safe;
  }

  const bdList = document.getElementById('atsBreakdownList');
  if (bdList && scan.breakdown) {
    bdList.replaceChildren();
    const bdLabels = { company: 'Company', domain: 'Domain', content: 'Content', recruiter: 'Recruiter' };
    for (const [key, label] of Object.entries(bdLabels)) {
      const pct = scan.breakdown[key] ?? 0;
      const item = document.createElement('div');
      item.className = 'sp-bd-item';
      const lbl = document.createElement('span'); lbl.className = 'sp-bd-lbl'; lbl.textContent = label;
      const val = document.createElement('span'); val.className = 'sp-bd-val'; val.textContent = `${pct}%`;
      const track = document.createElement('div'); track.className = 'sp-bd-track';
      const fill = document.createElement('div'); fill.className = 'sp-bd-fill'; fill.style.width = '0%';
      track.appendChild(fill);

      item.append(lbl, val, track);
      bdList.appendChild(item);
      requestAnimationFrame(() => { fill.style.width = `${pct}%`; });
    }
  }

  const icon = document.getElementById('atsVerdictIcon');
  const text = document.getElementById('atsVerdictText');
  if (icon && text) {
    const lvl = scan.riskLevel || 'safe';
    const verdicts = {
      safe:     { icon: '✓', msg: 'Safe to apply. Posting passes all checks.' },
      low:      { icon: '✓', msg: 'Generally safe. Double-check company details.' },
      medium:   { icon: '⚠', msg: 'Be cautious. Review flagged items before applying.' },
      high:     { icon: '✗', msg: 'High risk. Avoid sharing personal details.' },
      critical: { icon: '✗', msg: 'Likely scam. Do not apply or share information.' },
    };
    const v = verdicts[lvl] || verdicts.safe;
    icon.textContent = v.icon;
    text.textContent = v.msg;
  }
}

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
