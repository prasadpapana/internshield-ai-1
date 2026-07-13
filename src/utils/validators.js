// src/utils/validators.js
// Input validation / sanitization. Everything crossing a trust boundary
// (content script -> background, storage -> UI, backend -> client) is run
// through these so malformed or hostile data can't reach the engine or DOM.

import { LIMITS } from './constants.js';
import { normalizeSpace } from './helpers.js';

const MESSAGE_TYPES = new Set([
  'SCAN_PAGE', 'EXTRACT_PAGE', 'PAGE_DATA', 'GET_HISTORY', 'CLEAR_HISTORY',
  'DELETE_SCAN', 'GET_SETTINGS', 'SAVE_SETTINGS', 'REPORT_SCAM', 'GET_REPORTS',
  'PING',
]);

/** True if a runtime message has a known, well-formed type. */
export function isValidMessage(msg) {
  return !!msg && typeof msg === 'object' && MESSAGE_TYPES.has(msg.type);
}

/** Coerce arbitrary scraped page data into a known, bounded shape. */
export function sanitizePageData(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const str = (v, max = 300) => normalizeSpace(typeof v === 'string' ? v : '').slice(0, max);
  return {
    url: str(data.url, 2048),
    title: str(data.title, 300),
    company: str(data.company, 200),
    jobTitle: str(data.jobTitle, 200),
    emails: Array.isArray(data.emails)
      ? data.emails.filter((e) => typeof e === 'string').slice(0, 10).map((e) => str(e, 254))
      : [],
    links: Array.isArray(data.links)
      ? data.links.filter((e) => typeof e === 'string').slice(0, 40).map((e) => str(e, 2048))
      : [],
    text: (typeof data.text === 'string' ? data.text : '').slice(0, LIMITS.PAGE_TEXT_MAX),
  };
}

const ALLOWED_THEMES = new Set(['system', 'light', 'dark']);
const ALLOWED_LANGS = new Set(['en']); // expand as locales are added

/** Validate + fill defaults for user settings. */
export function sanitizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    theme: ALLOWED_THEMES.has(s.theme) ? s.theme : 'system',
    language: ALLOWED_LANGS.has(s.language) ? s.language : 'en',
    autoScan: typeof s.autoScan === 'boolean' ? s.autoScan : false,
    notifications: typeof s.notifications === 'boolean' ? s.notifications : true,
    privacyMode: typeof s.privacyMode === 'boolean' ? s.privacyMode : true,
    backendUrl: typeof s.backendUrl === 'string' ? s.backendUrl.slice(0, 2048).trim() : '',
  };
}

/** Validate a scam report reason string. */
export function sanitizeReportReason(reason) {
  const r = normalizeSpace(typeof reason === 'string' ? reason : '').slice(0, 500);
  return r;
}
