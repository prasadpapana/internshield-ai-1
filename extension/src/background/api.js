// extension/src/background/api.js
// Client API for communicating with the DraftJobs Backend & Grok AI.

import { validateAnalysisResult } from './validators.js';

const TIMEOUT_MS = 15000;
const MAX_BYTES = 512 * 1024;

async function request(baseUrl, endpoint, payload) {
  if (!baseUrl) throw new Error('No backend URL configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const cleanBase = baseUrl.replace(/\/+$/, '');
  const targetUrl = endpoint.startsWith('http') ? endpoint : `${cleanBase}${endpoint}`;

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMsg = `Backend HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson && errJson.error) errMsg = errJson.error;
      } catch {
        if (errText) errMsg = errText.slice(0, 150);
      }
      throw new Error(errMsg);
    }

    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('Response body exceeded size limit');

    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call Grok AI analysis on backend to enrich local scam scan.
 * Falls back safely to local scan if backend is unreachable or errors out.
 */
export async function analyzeJobWithGrok(baseUrl, page, localScan) {
  if (!baseUrl) return localScan;

  try {
    const response = await request(baseUrl, '/api/analyze', { page, scan: localScan });

    if (!response || !response.success || !response.data) {
      console.warn('Backend Grok analysis returned unsuccessful response:', response?.error);
      return localScan;
    }

    const grokData = validateAnalysisResult(response.data);
    if (!grokData.valid) {
      console.warn('Grok response failed schema validation:', response.data);
      return localScan;
    }

    const blendedTrustScore = Math.round(localScan.trustScore * 0.5 + grokData.trustScore * 0.5);
    const mergedNegatives = Array.from(new Set([
      ...(localScan.negatives || []),
      ...(grokData.signals || []),
    ]));

    let riskLabel = localScan.riskLabel;
    let riskLevel = localScan.riskLevel;

    if (grokData.riskLevel === 'VERY HIGH' || grokData.riskLevel === 'CRITICAL') {
      riskLevel = 'critical';
      riskLabel = 'Likely scam (AI Verified)';
    } else if (grokData.riskLevel === 'HIGH') {
      riskLevel = 'high';
      riskLabel = 'High risk (AI Verified)';
    } else if (grokData.riskLevel === 'MODERATE') {
      riskLevel = 'medium';
      riskLabel = 'Be cautious';
    } else if (grokData.riskLevel === 'LOW') {
      riskLevel = blendedTrustScore >= 80 ? 'safe' : 'low';
      riskLabel = blendedTrustScore >= 80 ? 'Looks legitimate' : 'Probably fine';
    }

    return {
      ...localScan,
      trustScore: blendedTrustScore,
      scamProbability: Math.max(0, 100 - blendedTrustScore),
      riskLevel,
      riskLabel,
      confidence: Math.round((localScan.confidence + grokData.confidence) / 2),
      summary: grokData.reasoning || localScan.summary,
      recommendation: grokData.recommendation || localScan.recommendation,
      negatives: mergedNegatives,
      grokAnalysis: grokData,
      source: 'grok-enriched',
    };
  } catch (err) {
    console.error('Grok AI analysis failed, falling back to local engine:', err.message);
    return {
      ...localScan,
      backendError: err.message,
    };
  }
}

export async function submitReport(baseUrl, report) {
  try {
    await request(baseUrl, '/api/report', report);
    return true;
  } catch {
    return false;
  }
}
