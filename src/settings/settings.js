// src/settings/settings.js
import { getSettings, getHistory, getReports, saveSettings, saveHistory, saveReports } from '../services/storage.js';

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

  $('openDashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/history/history.html') });
  });

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

  // Backup & Recovery Handlers
  $('exportBackup').addEventListener('click', async () => {
    try {
      const [hist, reps, currentSettings] = await Promise.all([
        getHistory(),
        getReports(),
        getSettings()
      ]);
      const backup = {
        version: 1,
        generator: 'InternShield AI',
        exportedAt: new Date().toISOString(),
        settings: currentSettings,
        history: hist,
        reports: reps
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `internshield_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to export backup: ' + err.message);
    }
  });

  $('importBackupBtn').addEventListener('click', () => {
    $('importFile').click();
  });

  $('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const backup = JSON.parse(evt.target.result);
        if (!backup || typeof backup !== 'object') {
          throw new Error('Invalid file format. Backup must be a JSON object.');
        }

        // Basic validation
        const hasSettings = backup.settings && typeof backup.settings === 'object';
        const hasHistory = Array.isArray(backup.history);
        const hasReports = Array.isArray(backup.reports);

        if (!hasSettings && !hasHistory && !hasReports) {
          throw new Error('No valid settings, history, or reports data found in the backup file.');
        }

        if (!confirm('Restore settings and data from this backup? Current data will be overwritten/merged.')) {
          // Clear file input
          e.target.value = '';
          return;
        }

        if (hasSettings) {
          await saveSettings(backup.settings);
        }
        if (hasHistory) {
          await saveHistory(backup.history);
        }
        if (hasReports) {
          await saveReports(backup.reports);
        }

        alert('Backup restored successfully!');
        location.reload();
      } catch (err) {
        alert('Failed to import backup: ' + err.message);
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  });

  refreshStats();
}

init();

