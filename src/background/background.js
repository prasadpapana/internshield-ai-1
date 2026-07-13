// src/background/background.js
// MV3 service worker. This is the only place that orchestrates a scan, so the
// UI never has to know how analysis works. Responsibilities:
//   - install defaults
//   - receive UI messages and route them
//   - drive the content script, run the engine, persist results
//   - optional backend enrich/sync, optional auto-scan + notifications
//   - rate-limit scans

import { scoreJob } from '../services/ai.js';
import * as store from '../services/storage.js';
import * as api from '../services/api.js';
import { sanitizePageData, isValidMessage, sanitizeReportReason } from '../utils/validators.js';
import { uid, getActiveTab } from '../utils/helpers.js';
import { LIMITS, RISK_BANDS } from '../utils/constants.js';

// ---- Lifecycle ------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  // Persist sanitized defaults on first run.
  const current = await store.getSettings();
  await store.saveSettings(current);
});

let lastScanAt = 0;

// ---- Content-script driver ------------------------------------------------

function askPageData(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_PAGE' }, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        resolve(null);
        return;
      }
      resolve(resp.payload || null);
    });
  });
}

async function ensureContentAndExtract(tabId) {
  let data = await askPageData(tabId);
  if (data) return data;
  // Tab predates install or content script not present: inject on demand.
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/content.js'],
    });
    data = await askPageData(tabId);
  } catch {
    data = null;
  }
  return data;
}

// ---- Core scan ------------------------------------------------------------

async function runScan(tab) {
  if (!tab || !tab.id || !/^https?:/i.test(tab.url || '')) {
    return { error: 'Open a job posting in a normal web page, then scan.' };
  }
  const now = Date.now();
  if (now - lastScanAt < LIMITS.SCAN_MIN_INTERVAL_MS) {
    return { error: 'Slow down a moment, then scan again.' };
  }
  lastScanAt = now;

  const settings = await store.getSettings();
  const raw = await ensureContentAndExtract(tab.id);
  if (!raw) {
    return { error: 'Couldn\u2019t read this page. Reload it and try again.' };
  }

  const page = sanitizePageData({ ...raw, url: raw.url || tab.url });
  let scan = scoreJob(page, { privacyMode: settings.privacyMode });

  // Optional backend enrichment / sync.
  if (settings.backendUrl) {
    scan = await api.enrichScan(settings.backendUrl, scan);
    api.syncScan(settings.backendUrl, scan); // fire-and-forget
  }

  await store.addScan(scan);
  maybeNotify(scan, settings);
  return { scan };
}

function maybeNotify(scan, settings) {
  if (!settings.notifications) return;
  if (!['medium', 'high', 'critical'].includes(scan.riskLevel)) return;
  try {
    chrome.notifications.create(`is_${scan.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL("assets/icons/icon-48.png"),
      title: `InternShield: ${scan.riskLabel}`,
      message: `${scan.jobTitle} \u2014 trust ${scan.trustScore}/100, scam risk ${scan.scamProbability}%.`,
      priority: 1,
    });
  } catch {
    /* notifications may be unavailable; ignore */
  }
}

// ---- Auto-scan on navigation ---------------------------------------------

const recentlyAutoScanned = new Set();

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete') return;
  if (!tab || !/^https?:/i.test(tab.url || '')) return;
  const settings = await store.getSettings();
  if (!settings.autoScan) return;
  if (recentlyAutoScanned.has(tab.url)) return;
  recentlyAutoScanned.add(tab.url);
  if (recentlyAutoScanned.size > 50) {
    recentlyAutoScanned.clear();
  }
  // Only auto-scan pages that look job-related to avoid noise.
  if (!/job|career|intern|hiring|vacancy|recruit|apply/i.test(tab.url)) return;
  await runScan(tab);
});

// ---- Message router -------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!isValidMessage(msg)) {
    sendResponse({ error: 'Bad request' });
    return false;
  }

  (async () => {
    try {
      switch (msg.type) {
        case 'PING':
          sendResponse({ ok: true });
          break;

        case 'SCAN_PAGE': {
          const tab = await getActiveTab();
          sendResponse(await runScan(tab));
          break;
        }

        case 'GET_HISTORY':
          sendResponse({ history: await store.getHistory() });
          break;

        case 'DELETE_SCAN':
          sendResponse({ history: await store.deleteScan(String(msg.id || '')) });
          break;

        case 'CLEAR_HISTORY':
          await store.clearHistory();
          sendResponse({ history: [] });
          break;

        case 'GET_SETTINGS':
          sendResponse({ settings: await store.getSettings() });
          break;

        case 'SAVE_SETTINGS':
          sendResponse({ settings: await store.saveSettings(msg.settings) });
          break;

        case 'GET_REPORTS':
          sendResponse({ reports: await store.getReports() });
          break;

        case 'REPORT_SCAM': {
          const report = {
            id: uid(),
            scanId: String(msg.scanId || ''),
            reason: sanitizeReportReason(msg.reason),
            reportedAt: new Date().toISOString(),
          };
          await store.addReport(report);
          const settings = await store.getSettings();
          if (settings.backendUrl) api.submitReport(settings.backendUrl, report);
          sendResponse({ report });
          break;
        }

        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (err) {
      sendResponse({ error: String((err && err.message) || err) });
    }
  })();

  return true; // keep the channel open for the async response
});

// Surface risk band labels to anything that imports the worker (tests).
export { RISK_BANDS };
