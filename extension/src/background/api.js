// extension/src/background/api.js
// Client API for communicating with the DraftJobs Backend & Grok AI.

import { validateAnalysisResult } from './validators.js';

const TIMEOUT_MS = 12000;
const MAX_BYTES = 512 * 1024;

async function request(baseUrl, endpoint, payload) {
  if (!baseUrl) throw new Error('No backend URL configured in settings');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const cleanBase = baseUrl.replace(/\/+$/, '');
  const targetUrl = endpoint.startsWith('http') ? endpoint : `${cleanBase}${endpoint}`;

  try {
    console.log(`[DraftJobs] Backend request started: POST ${targetUrl}`);
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
      console.error(`[DraftJobs] Backend error: ${errMsg}`);
      throw new Error(errMsg);
    }

    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('Response body exceeded size limit');

    console.log('[DraftJobs] Backend response received');
    return JSON.parse(text);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[DraftJobs] Timeout: Backend request timed out after 12s');
      throw new Error('Backend request timed out after 12 seconds');
    }
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      console.error(`[DraftJobs] Backend error: Connection refused to ${cleanBase}`);
      throw new Error(`Backend server unreachable at ${cleanBase}. Please start the Node server (npm start).`);
    }
    throw err;
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
    console.log('[DraftJobs] Sending job data for Grok AI verification');
    const response = await request(baseUrl, '/api/analyze', { page, scan: localScan });

    if (!response || !response.success || !response.data) {
      console.warn('[DraftJobs] Backend Grok analysis unsuccessful response:', response?.error);
      return {
        ...localScan,
        backendError: response?.error || 'Unsuccessful AI analysis response',
      };
    }

    const grokData = validateAnalysisResult(response.data);
    if (!grokData.valid) {
      console.warn('[DraftJobs] Grok response failed schema validation:', response.data);
      return localScan;
    }

    const blendedTrustScore = typeof grokData.trustScore === 'number'
      ? Math.round(localScan.trustScore * 0.5 + grokData.trustScore * 0.5)
      : localScan.trustScore;

    const mergedNegatives = Array.from(new Set([
      ...(localScan.negatives || []),
      ...(grokData.signals || []).map((s) => (typeof s === 'string' ? s : s.description || s.label)),
    ])).filter(Boolean);

    let riskLabel = localScan.riskLabel;
    let riskLevel = localScan.riskLevel;

    if (grokData.riskLevel === 'VERY_HIGH' || grokData.riskLevel === 'CRITICAL') {
      riskLevel = 'VERY_HIGH';
      riskLabel = 'Very High Risk (AI Verified)';
    } else if (grokData.riskLevel === 'HIGH') {
      riskLevel = 'HIGH';
      riskLabel = 'High Risk (AI Verified)';
    } else if (grokData.riskLevel === 'MODERATE') {
      riskLevel = 'MODERATE';
      riskLabel = 'Moderate Risk';
    } else if (grokData.riskLevel === 'LOW') {
      riskLevel = blendedTrustScore >= 80 ? 'LOW' : 'MODERATE';
      riskLabel = blendedTrustScore >= 80 ? 'Low Risk' : 'Moderate Risk';
    }

    console.log('[DraftJobs] Analysis completed successfully with Grok AI');
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
    console.error('[DraftJobs] Backend error:', err.message);
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
