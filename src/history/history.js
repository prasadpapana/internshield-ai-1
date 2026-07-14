// src/history/history.js
import { getSettings } from '../services/storage.js';
import { formatDate } from '../utils/helpers.js';

const RISK = {
  safe: { color: 'var(--safe)', label: 'Safe' },
  low: { color: 'var(--low)', label: 'Low risk' },
  medium: { color: 'var(--medium)', label: 'Caution' },
  high: { color: 'var(--high)', label: 'High risk' },
  critical: { color: 'var(--critical)', label: 'Scam' },
};

const $ = (id) => document.getElementById(id);
let all = [];
let reports = [];
let activeTab = 'scans';
let filterRisk = 'all';
let query = '';

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (resp) => {
      resolve(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : (resp || {}));
    });
  });
}

async function applyTheme() {
  const s = await getSettings();
  let theme = s.theme;
  if (theme === 'system') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

async function load() {
  const scanResp = await send({ type: 'GET_HISTORY' });
  all = Array.isArray(scanResp.history) ? scanResp.history : [];
  const reportResp = await send({ type: 'GET_REPORTS' });
  reports = Array.isArray(reportResp.reports) ? reportResp.reports : [];
  updateStats();
  render();
}

function updateStats() {
  const total = all.length;
  $('statTotalScans').textContent = String(total);
  
  // Average score
  const avg = total > 0 ? Math.round(all.reduce((acc, s) => acc + s.trustScore, 0) / total) : 0;
  $('statAvgScore').textContent = String(avg);
  $('statAvgProgressBar').style.width = `${avg}%`;

  // Risky postings (medium, high, critical)
  const risky = all.filter(s => ['medium', 'high', 'critical'].includes(s.riskLevel)).length;
  $('statRiskyCount').textContent = String(risky);

  // Reported scams
  $('statReportedCount').textContent = String(reports.length);

  // Risk Distribution Bar percentages
  const counts = { safe: 0, low: 0, medium: 0, high: 0, critical: 0 };
  for (const s of all) {
    if (counts[s.riskLevel] !== undefined) counts[s.riskLevel]++;
  }

  for (const level of ['safe', 'low', 'medium', 'high', 'critical']) {
    const pct = total > 0 ? Math.round((counts[level] / total) * 100) : 0;
    const segment = document.querySelector(`.dist-segment[data-level="${level}"]`);
    if (segment) {
      segment.style.width = `${pct}%`;
      segment.title = `${level.charAt(0).toUpperCase() + level.slice(1)}: ${pct}%`;
    }
    const labelId = 'pct' + level.charAt(0).toUpperCase() + level.slice(1);
    const lblEl = $(labelId);
    if (lblEl) lblEl.textContent = `${pct}%`;
  }
}

function visibleScans() {
  return all.filter((s) => {
    if (filterRisk !== 'all' && s.riskLevel !== filterRisk) return false;
    if (query) {
      const hay = `${s.company} ${s.jobTitle}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

function visibleReports() {
  return reports.filter((r) => {
    const scan = all.find(s => s.id === r.scanId);
    const company = scan ? scan.company : 'Unknown Company';
    const title = scan ? scan.jobTitle : 'Reported Posting';
    if (query) {
      const hay = `${company} ${title} ${r.reason}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

function render() {
  const list = $('list');
  list.replaceChildren();

  if (activeTab === 'scans') {
    $('clearAll').style.display = all.length === 0 ? 'none' : '';
    $('filters').style.display = 'flex';
    $('countSub').textContent = all.length === 0
      ? 'No scans stored yet'
      : `${all.length} scan${all.length === 1 ? '' : 's'} stored on this device`;
    
    const items = visibleScans();
    if (items.length === 0) {
      $('empty').hidden = false;
      $('emptyTitle').textContent = all.length > 0 ? 'No matches' : 'No scans yet';
      $('emptySub').textContent = all.length > 0 
        ? 'Try a different search or filter.' 
        : 'Open a job posting and run a scan from the toolbar to see it here.';
      return;
    }
    $('empty').hidden = true;
    for (const scan of items) list.appendChild(card(scan));

  } else {
    // Reports tab
    $('clearAll').style.display = reports.length === 0 ? 'none' : '';
    $('filters').style.display = 'none';
    $('countSub').textContent = reports.length === 0
      ? 'No scams manually reported yet'
      : `${reports.length} scam report${reports.length === 1 ? '' : 's'} stored`;

    const items = visibleReports();
    if (items.length === 0) {
      $('empty').hidden = false;
      $('emptyTitle').textContent = reports.length > 0 ? 'No matches' : 'No reports yet';
      $('emptySub').textContent = reports.length > 0
        ? 'Try a different search query.'
        : 'When you scan a job and click "Report scam", it will show up here.';
      return;
    }
    $('empty').hidden = true;
    for (const report of items) list.appendChild(reportCard(report));
  }
}

function makeList(parent, items, cls) {
  const ul = document.createElement('ul');
  ul.className = cls;
  if (!items || items.length === 0) {
    const li = document.createElement('li');
    li.textContent = '—';
    ul.appendChild(li);
  } else {
    for (const it of items.slice(0, 8)) {
      const li = document.createElement('li');
      li.textContent = it;
      ul.appendChild(li);
    }
  }
  parent.appendChild(ul);
}

function card(scan) {
  const risk = RISK[scan.riskLevel] || RISK.medium;
  const li = document.createElement('li');
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.open = 'false';

  // top row
  const top = document.createElement('div');
  top.className = 'card__top';
  top.setAttribute('role', 'button');
  top.tabIndex = 0;

  const score = document.createElement('div');
  score.className = 'card__score';
  score.style.background = risk.color;
  score.textContent = String(scan.trustScore);

  const main = document.createElement('div');
  main.className = 'card__main';
  const title = document.createElement('div'); title.className = 'card__title'; title.textContent = scan.jobTitle;
  const company = document.createElement('div'); company.className = 'card__company'; company.textContent = scan.company;
  main.append(title, company);

  const right = document.createElement('div');
  right.className = 'card__right';
  const pill = document.createElement('span');
  pill.className = 'card__pill';
  pill.style.color = risk.color;
  pill.style.background = `color-mix(in srgb, ${risk.color} 14%, var(--bg))`;
  pill.textContent = risk.label;
  const date = document.createElement('span'); date.className = 'card__date'; date.textContent = formatDate(scan.date);
  right.append(pill, date);

  const caret = document.createElement('span');
  caret.className = 'card__caret';
  caret.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

  top.append(score, main, right, caret);

  // body
  const body = document.createElement('div');
  body.className = 'card__body';
  const summary = document.createElement('p'); summary.className = 'card__summary'; summary.textContent = scan.summary;

  const cols = document.createElement('div'); cols.className = 'cols';
  const posCol = document.createElement('div');
  const posH = document.createElement('h3'); posH.textContent = 'In its favor'; posCol.appendChild(posH);
  makeList(posCol, scan.positives, 'cols--pos');
  const negCol = document.createElement('div');
  const negH = document.createElement('h3'); negH.textContent = 'Watch out for'; negCol.appendChild(negH);
  makeList(negCol, scan.negatives, 'cols--neg');
  cols.append(posCol, negCol);

  const reco = document.createElement('div'); reco.className = 'card__reco'; reco.textContent = scan.recommendation;

  const foot = document.createElement('div'); foot.className = 'card__foot';
  const link = document.createElement('a');
  link.className = 'card__link'; link.href = scan.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.textContent = scan.url;
  const del = document.createElement('button');
  del.className = 'btn btn--sm btn--del'; del.textContent = 'Delete';
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    const resp = await send({ type: 'DELETE_SCAN', id: scan.id });
    all = Array.isArray(resp.history) ? resp.history : all.filter((s) => s.id !== scan.id);
    updateStats();
    render();
  });
  foot.append(link, del);

  body.append(summary, cols, reco, foot);
  card.append(top, body);
  li.appendChild(card);

  const toggle = () => { card.dataset.open = card.dataset.open === 'true' ? 'false' : 'true'; };
  top.addEventListener('click', toggle);
  top.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });
  return li;
}

function reportCard(report) {
  const scan = all.find(s => s.id === report.scanId);
  const companyName = scan ? scan.company : 'Unknown Company';
  const jobTitle = scan ? scan.jobTitle : 'Reported Posting';
  const riskLevel = scan ? scan.riskLevel : 'critical';
  const trustScore = scan ? scan.trustScore : 0;
  const risk = RISK[riskLevel] || RISK.medium;

  const li = document.createElement('li');
  const cardEl = document.createElement('div');
  cardEl.className = 'card';

  const top = document.createElement('div');
  top.className = 'card__top';
  top.style.cursor = 'default';

  const score = document.createElement('div');
  score.className = 'card__score';
  score.style.background = risk.color;
  score.textContent = String(trustScore);

  const main = document.createElement('div');
  main.className = 'card__main';
  const title = document.createElement('div'); title.className = 'card__title'; title.textContent = jobTitle;
  const company = document.createElement('div'); company.className = 'card__company'; company.textContent = companyName;
  main.append(title, company);

  const right = document.createElement('div');
  right.className = 'card__right';
  const pill = document.createElement('span');
  pill.className = 'card__pill';
  pill.style.color = risk.color;
  pill.style.background = `color-mix(in srgb, ${risk.color} 14%, var(--bg))`;
  pill.textContent = risk.label;
  const date = document.createElement('span'); date.className = 'card__date'; date.textContent = formatDate(report.reportedAt);
  right.append(pill, date);

  top.append(score, main, right);

  const body = document.createElement('div');
  body.className = 'card__body';
  body.style.display = 'block';
  body.style.padding = '12px 16px 16px';

  const reasonEl = document.createElement('div');
  reasonEl.className = 'report-reason';
  const strong = document.createElement('strong');
  strong.textContent = 'Feedback:';
  reasonEl.append(strong, document.createTextNode(` ${report.reason || 'No specific explanation provided.'}`));

  const foot = document.createElement('div');
  foot.className = 'card__foot';
  foot.style.marginTop = '12px';

  const link = document.createElement('span');
  link.className = 'card__link';
  link.style.color = 'var(--muted)';
  if (scan && scan.url) {
    const a = document.createElement('a');
    a.href = scan.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = scan.url;
    a.className = 'card__link';
    link.replaceChildren(a);
  } else {
    link.textContent = 'Original URL unavailable';
  }

  const del = document.createElement('button');
  del.className = 'btn btn--sm btn--del'; del.textContent = 'Delete Report';
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('Delete this scam report?')) return;
    const resp = await send({ type: 'DELETE_REPORT', id: report.id });
    reports = Array.isArray(resp.reports) ? resp.reports : reports.filter((r) => r.id !== report.id);
    updateStats();
    render();
  });
  foot.append(link, del);

  body.append(reasonEl, foot);
  cardEl.append(top, body);
  li.appendChild(cardEl);
  return li;
}

function init() {
  applyTheme();
  $('search').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); render(); });
  
  $('openSettings').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else chrome.tabs.create({ url: chrome.runtime.getURL('src/settings/settings.html') });
  });
  
  $('filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    filterRisk = btn.dataset.risk;
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('chip--active', c === btn));
    render();
  });

  // Tab switching
  $('tabScans').addEventListener('click', () => {
    activeTab = 'scans';
    $('tabScans').classList.add('tab-btn--active');
    $('tabReports').classList.remove('tab-btn--active');
    render();
  });

  $('tabReports').addEventListener('click', () => {
    activeTab = 'reports';
    $('tabReports').classList.add('tab-btn--active');
    $('tabScans').classList.remove('tab-btn--active');
    render();
  });

  $('clearAll').addEventListener('click', async () => {
    if (activeTab === 'scans') {
      if (!all.length) return;
      if (!confirm('Delete all stored scans? This cannot be undone.')) return;
      await send({ type: 'CLEAR_HISTORY' });
      all = [];
    } else {
      if (!reports.length) return;
      if (!confirm('Delete all scam reports? This cannot be undone.')) return;
      await send({ type: 'CLEAR_REPORTS' });
      reports = [];
    }
    updateStats();
    render();
  });
  load();
}

init();
