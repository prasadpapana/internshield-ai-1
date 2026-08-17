// extension/src/background/background.js
// MV3 Service Worker for DraftJobs.

import { scoreJob } from './ai.js';
import * as store from './storage.js';
import * as api from './api.js';
import { isValidMessage, sanitizePageData, sanitizeReportReason } from './validators.js';
import { uid, getActiveTab } from './helpers.js';
import { LIMITS } from './constants.js';

chrome.runtime.onInstalled.addListener(async () => {
  const current = await store.getSettings();
  await store.saveSettings(current);
});

let lastScanAt = 0;

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

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/content.js'],
    });
    data = await askPageData(tabId);
  } catch (err) {
    console.warn('[DraftJobs] Script injection failed:', err);
    data = null;
  }
  return data;
}

async function runScan(tab) {
  if (!tab || !tab.id || !/^https?:/i.test(tab.url || '')) {
    return { error: 'Open a job posting in a supported web page (LinkedIn, Indeed, Glassdoor, Naukri, or Internshala), then scan.' };
  }

  const now = Date.now();
  if (now - lastScanAt < LIMITS.SCAN_MIN_INTERVAL_MS) {
    return { error: 'Slow down a moment, then scan again.' };
  }
  lastScanAt = now;

  const settings = await store.getSettings();
  const raw = await ensureContentAndExtract(tab.id);
  if (!raw) {
    return { error: 'Couldn’t read this page. Reload the page and try again.' };
  }

  const page = sanitizePageData({ ...raw, url: raw.url || tab.url });
  let scan = scoreJob(page, { privacyMode: settings.privacyMode });

  // Optional Grok AI analysis via backend
  if (settings.backendUrl) {
    scan = await api.analyzeJobWithGrok(settings.backendUrl, page, scan);
  }

  await store.addScan(scan);
  maybeNotify(scan, settings);
  return { scan };
}

function maybeNotify(scan, settings) {
  if (!settings.notifications) return;
  const level = String(scan.riskLevel || '').toUpperCase();
  if (!['MODERATE', 'HIGH', 'VERY_HIGH', 'CRITICAL'].includes(level)) return;

  try {
    chrome.notifications.create(`is_${scan.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icons/icon-48.png'),
      title: `DraftJobs: ${scan.riskLabel || 'Risk Alert'}`,
      message: `${scan.jobTitle || 'Job'} \u2014 Trust score ${scan.trustScore}/100.`,
      priority: 1,
    });
  } catch {
    /* notifications permission missing or ignored */
  }
}

// Auto-scan on navigation if enabled
const recentlyAutoScanned = new Set();
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete') return;
  if (!tab || !/^https?:/i.test(tab.url || '')) return;

  const settings = await store.getSettings();
  if (!settings.autoScan) return;
  if (recentlyAutoScanned.has(tab.url)) return;

  recentlyAutoScanned.add(tab.url);
  if (recentlyAutoScanned.size > 50) recentlyAutoScanned.clear();

  if (!/job|career|intern|hiring|vacancy|recruit|apply/i.test(tab.url)) return;
  await runScan(tab);
});

// Message listener with guaranteed response resolution
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidMessage(msg)) {
    sendResponse({ error: 'Bad request: invalid message format' });
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
          const result = await runScan(tab);
          sendResponse(result);
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

        case 'DELETE_REPORT':
          sendResponse({ reports: await store.deleteReport(String(msg.id || '')) });
          break;

        case 'CLEAR_REPORTS':
          await store.clearReports();
          sendResponse({ reports: [] });
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
      console.error('[DraftJobs] Background message error:', err);
      sendResponse({ error: String((err && err.message) || err) });
    }
  })();

  return true;
});
