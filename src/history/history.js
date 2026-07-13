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
  const resp = await send({ type: 'GET_HISTORY' });
  all = Array.isArray(resp.history) ? resp.history : [];
  render();
}

function visible() {
  return all.filter((s) => {
    if (filterRisk !== 'all' && s.riskLevel !== filterRisk) return false;
    if (query) {
      const hay = `${s.company} ${s.jobTitle}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

function render() {
  const list = $('list');
  const items = visible();
  $('countSub').textContent = all.length === 0
    ? 'Nothing scanned yet'
    : `${all.length} scan${all.length === 1 ? '' : 's'} stored on this device`;

  list.replaceChildren();

  if (items.length === 0) {
    $('empty').hidden = false;
    if (all.length > 0) {
      $('emptyTitle').textContent = 'No matches';
      $('emptySub').textContent = 'Try a different search or filter.';
    }
    return;
  }
  $('empty').hidden = true;

  for (const scan of items) list.appendChild(card(scan));
}

function makeList(parent, items, cls) {
  const ul = document.createElement('ul');
  ul.className = cls;
  if (!items || items.length === 0) {
    const li = document.createElement('li');
    li.textContent = '\u2014';
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

function init() {
  applyTheme();
  $('search').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); render(); });
  $('filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    filterRisk = btn.dataset.risk;
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('chip--active', c === btn));
    render();
  });
  $('clearAll').addEventListener('click', async () => {
    if (!all.length) return;
    if (!confirm('Delete all stored scans? This cannot be undone.')) return;
    await send({ type: 'CLEAR_HISTORY' });
    all = [];
    render();
  });
  load();
}

init();
