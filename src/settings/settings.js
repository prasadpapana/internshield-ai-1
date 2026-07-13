// src/settings/settings.js
import { getSettings, getHistory, getReports } from '../services/storage.js';

const $ = (id) => document.getElementById(id);
let settings = null;
let savedTimer = null;

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (resp) => {
      resolve(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : (resp || {}));
    });
  });
}

function applyTheme(theme) {
  let t = theme;
  if (t === 'system') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
}

function flashSaved() {
  $('saved').hidden = false;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { $('saved').hidden = true; }, 1200);
}

async function persist(patch) {
  settings = { ...settings, ...patch };
  const resp = await send({ type: 'SAVE_SETTINGS', settings });
  if (resp.settings) settings = resp.settings;
  applyTheme(settings.theme);
  flashSaved();
}

function paintTheme() {
  document.querySelectorAll('.seg__btn').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.themeVal === settings.theme));
  });
}

async function refreshStats() {
  const [hist, reps] = await Promise.all([getHistory(), getReports()]);
  $('dataStats').textContent = `${hist.length} scan${hist.length === 1 ? '' : 's'}, `
    + `${reps.length} report${reps.length === 1 ? '' : 's'}`;
}

async function init() {
  settings = await getSettings();
  applyTheme(settings.theme);
  paintTheme();

  $('language').value = settings.language;
  $('autoScan').checked = settings.autoScan;
  $('notifications').checked = settings.notifications;
  $('privacyMode').checked = settings.privacyMode;
  $('backendUrl').value = settings.backendUrl;

  $('theme').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg__btn');
    if (!btn) return;
    persist({ theme: btn.dataset.themeVal }).then(paintTheme);
  });
  $('language').addEventListener('change', (e) => persist({ language: e.target.value }));
  $('autoScan').addEventListener('change', (e) => persist({ autoScan: e.target.checked }));
  $('notifications').addEventListener('change', (e) => persist({ notifications: e.target.checked }));
  $('privacyMode').addEventListener('change', (e) => persist({ privacyMode: e.target.checked }));

  let urlTimer = null;
  $('backendUrl').addEventListener('input', (e) => {
    clearTimeout(urlTimer);
    const val = e.target.value;
    urlTimer = setTimeout(() => persist({ backendUrl: val }), 500);
  });

  $('clearData').addEventListener('click', async () => {
    if (!confirm('Delete all scans, reports, and settings from this device? This cannot be undone.')) return;
    await send({ type: 'CLEAR_HISTORY' });
    // Clear everything we own.
    await chrome.storage.local.clear();
    settings = await getSettings();
    location.reload();
  });

  refreshStats();
}

init();
