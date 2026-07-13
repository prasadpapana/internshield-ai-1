// src/utils/helpers.js
// Small, dependency-free helpers shared across the extension.

/** Cryptographically-random short id (collision-safe for our volumes). */
export function uid() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Clamp a number into [min, max]. */
export function clamp(n, min, max) {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Round to a whole number, clamped to 0..100. */
export function pct(n) {
  return clamp(Math.round(n), 0, 100);
}

/**
 * Escape a string for safe insertion as text. We never use innerHTML with
 * untrusted content, but this is a defense-in-depth helper for any place a
 * value might reach the DOM.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Collapse whitespace and trim. */
export function normalizeSpace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Human-readable relative-ish date. */
export function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '\u2014';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Extract a registrable-ish host from a URL or email. Returns '' on failure. */
export function hostFromUrl(input) {
  if (!input) return '';
  try {
    const u = new URL(input.includes('://') ? input : `https://${input}`);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Get the TLD (last label) of a hostname. */
export function tldOf(host) {
  const parts = String(host || '').split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/** Trailing-edge debounce. */
export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Promisified chrome.tabs.query for the active tab. */
export function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs[0] ? tabs[0] : null);
    });
  });
}
