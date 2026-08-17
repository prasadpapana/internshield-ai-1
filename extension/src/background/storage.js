// extension/src/background/storage.js
// Storage module for extension settings, history, and scam reports with AES-GCM encryption.

const STORAGE_KEYS = Object.freeze({
  SETTINGS: 'is_settings',
  HISTORY: 'is_history',
  REPORTS: 'is_reports',
});

const LIMITS = Object.freeze({
  HISTORY_MAX: 200,
  REPORTS_MAX: 100,
});

const KEY_NAME = 'is_crypto_key_v1';
let cachedKey = null;

async function getKey() {
  if (cachedKey) return cachedKey;
  const stored = await chrome.storage.local.get(KEY_NAME);
  if (stored[KEY_NAME]) {
    cachedKey = await crypto.subtle.importKey(
      'jwk', stored[KEY_NAME], { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'],
    );
    return cachedKey;
  }
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', key);
  await chrome.storage.local.set({ [KEY_NAME]: jwk });
  cachedKey = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'],
  );
  return cachedKey;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

async function encryptJson(obj) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = enc.encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return {
    iv: Array.from(iv),
    ct: Array.from(new Uint8Array(cipher)),
  };
}

async function decryptJson(blob, fallback) {
  try {
    if (!blob || !Array.isArray(blob.iv) || !Array.isArray(blob.ct)) return fallback;
    const key = await getKey();
    const iv = new Uint8Array(blob.iv);
    const ct = new Uint8Array(blob.ct);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return JSON.parse(dec.decode(plain));
  } catch {
    return fallback;
  }
}

export function sanitizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  let backendUrl = typeof s.backendUrl === 'string' ? s.backendUrl.slice(0, 2048).trim() : '';
  if (backendUrl && !/^https?:\/\//i.test(backendUrl)) {
    backendUrl = '';
  }

  return {
    theme: ['system', 'light', 'dark'].includes(s.theme) ? s.theme : 'system',
    language: 'en',
    autoScan: typeof s.autoScan === 'boolean' ? s.autoScan : false,
    notifications: typeof s.notifications === 'boolean' ? s.notifications : true,
    privacyMode: typeof s.privacyMode === 'boolean' ? s.privacyMode : true,
    backendUrl,
  };
}

export async function getSettings() {
  const out = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return sanitizeSettings(out[STORAGE_KEYS.SETTINGS]);
}

export async function saveSettings(settings) {
  const clean = sanitizeSettings(settings);
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: clean });
  return clean;
}

export async function getHistory() {
  const out = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
  const list = await decryptJson(out[STORAGE_KEYS.HISTORY], []);
  return Array.isArray(list) ? list : [];
}

export async function addScan(scan) {
  const list = await getHistory();
  list.unshift(scan);
  const trimmed = list.slice(0, LIMITS.HISTORY_MAX);
  await chrome.storage.local.set({
    [STORAGE_KEYS.HISTORY]: await encryptJson(trimmed),
  });
  return scan;
}

export async function deleteScan(id) {
  const list = (await getHistory()).filter((s) => s.id !== id);
  await chrome.storage.local.set({
    [STORAGE_KEYS.HISTORY]: await encryptJson(list),
  });
  return list;
}

export async function clearHistory() {
  await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: await encryptJson([]) });
}

export async function saveHistory(list) {
  const trimmed = list.slice(0, LIMITS.HISTORY_MAX);
  await chrome.storage.local.set({
    [STORAGE_KEYS.HISTORY]: await encryptJson(trimmed),
  });
  return trimmed;
}

export async function getReports() {
  const out = await chrome.storage.local.get(STORAGE_KEYS.REPORTS);
  const list = await decryptJson(out[STORAGE_KEYS.REPORTS], []);
  return Array.isArray(list) ? list : [];
}

export async function addReport(report) {
  const list = await getReports();
  list.unshift(report);
  const trimmed = list.slice(0, LIMITS.REPORTS_MAX);
  await chrome.storage.local.set({
    [STORAGE_KEYS.REPORTS]: await encryptJson(trimmed),
  });
  return report;
}

export async function deleteReport(id) {
  const list = (await getReports()).filter((r) => r.id !== id);
  await chrome.storage.local.set({
    [STORAGE_KEYS.REPORTS]: await encryptJson(list),
  });
  return list;
}

export async function clearReports() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.REPORTS]: await encryptJson([]),
  });
}

export async function saveReports(list) {
  const trimmed = list.slice(0, LIMITS.REPORTS_MAX);
  await chrome.storage.local.set({
    [STORAGE_KEYS.REPORTS]: await encryptJson(trimmed),
  });
  return trimmed;
}
