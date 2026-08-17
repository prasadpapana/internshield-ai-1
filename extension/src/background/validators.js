// extension/src/background/validators.js

import { LIMITS } from './constants.js';
import { normalizeSpace } from './helpers.js';

const MESSAGE_TYPES = new Set([
  'SCAN_PAGE', 'EXTRACT_PAGE', 'PAGE_DATA', 'GET_HISTORY', 'CLEAR_HISTORY',
  'DELETE_SCAN', 'GET_SETTINGS', 'SAVE_SETTINGS', 'REPORT_SCAM', 'GET_REPORTS',
  'PING', 'DELETE_REPORT', 'CLEAR_REPORTS',
]);

export function isValidMessage(msg) {
  return !!msg && typeof msg === 'object' && MESSAGE_TYPES.has(msg.type);
}

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

export function sanitizeReportReason(reason) {
  return normalizeSpace(typeof reason === 'string' ? reason : '').slice(0, 500);
}

export function validateAnalysisResult(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, trustScore: 50, riskLevel: 'MODERATE', signals: [], reasoning: '', recommendation: '', confidence: 0 };
  }

  const trustScore = typeof data.trustScore === 'number'
    ? Math.max(0, Math.min(100, Math.round(data.trustScore)))
    : 50;

  const validRiskLevels = ['LOW', 'MODERATE', 'HIGH', 'VERY HIGH', 'CRITICAL'];
  const rawRisk = String(data.riskLevel || '').toUpperCase();
  const riskLevel = validRiskLevels.includes(rawRisk) ? rawRisk : 'MODERATE';

  const signals = Array.isArray(data.signals)
    ? data.signals.filter((s) => typeof s === 'string' && s.trim().length > 0)
    : [];

  const reasoning = typeof data.reasoning === 'string' ? data.reasoning.trim() : '';
  const recommendation = typeof data.recommendation === 'string' ? data.recommendation.trim() : '';
  const confidence = typeof data.confidence === 'number'
    ? Math.max(0, Math.min(100, Math.round(data.confidence)))
    : 70;

  return {
    trustScore,
    riskLevel,
    signals,
    reasoning,
    recommendation,
    confidence,
    valid: true,
  };
}
