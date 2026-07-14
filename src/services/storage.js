// src/services/storage.js
// All persistence goes through this module so the rest of the app never
// touches chrome.storage directly. History and reports are encrypted at rest
// with AES-GCM (WebCrypto).
//
// Honest threat model: the AES key is generated per install and kept in
// chrome.storage.local alongside the data. This protects stored scans from
// casual disk inspection and from other extensions that cannot run our code,
// but it is NOT protection against an attacker who already controls this
// extension's context. We keep it because "encrypted at rest" is the correct
// default for a security tool, and we never persist raw page text when
// privacyMode is on (see ai/background), which is the stronger guarantee.

import { STORAGE_KEYS, LIMITS } from '../utils/constants.js';
import { sanitizeSettings } from '../utils/validators.js';

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

// ---- Settings (not encrypted; non-sensitive, read on every page) ----------

export async function getSettings() {
  const out = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return sanitizeSettings(out[STORAGE_KEYS.SETTINGS]);
}

export async function saveSettings(settings) {
  const clean = sanitizeSettings(settings);
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: clean });
  return clean;
}

// ---- History (encrypted) --------------------------------------------------

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

// ---- Scam reports (encrypted) --------------------------------------------

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


