// extension/src/background/helpers.js

export function uid() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function clamp(n, min, max) {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function pct(n) {
  return clamp(Math.round(n), 0, 100);
}

export function normalizeSpace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function hostFromUrl(input) {
  if (!input) return '';
  try {
    const u = new URL(input.includes('://') ? input : `https://${input}`);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function tldOf(host) {
  const parts = String(host || '').split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs[0] ? tabs[0] : null);
    });
  });
}
