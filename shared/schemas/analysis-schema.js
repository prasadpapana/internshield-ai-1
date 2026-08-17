// shared/schemas/analysis-schema.js

/**
 * Validates and normalizes structured analysis JSON returned by backend / Grok AI.
 * Ensures the app never crashes due to missing or invalid fields.
 */
export function validateAnalysisResult(data) {
  if (!data || typeof data !== 'object') {
    return createFallbackResult('Invalid response payload');
  }

  const trustScore = typeof data.trustScore === 'number'
    ? Math.max(0, Math.min(100, Math.round(data.trustScore)))
    : 50;

  const validRiskLevels = ['LOW', 'MODERATE', 'HIGH', 'VERY HIGH', 'CRITICAL'];
  const rawRisk = String(data.riskLevel || '').toUpperCase();
  const riskLevel = validRiskLevels.includes(rawRisk) ? rawRisk : deriveRiskLevel(trustScore);

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

export function deriveRiskLevel(trustScore) {
  if (trustScore >= 80) return 'LOW';
  if (trustScore >= 60) return 'MODERATE';
  if (trustScore >= 40) return 'HIGH';
  return 'VERY HIGH';
}

export function createFallbackResult(reason = 'Analysis unavailable') {
  return {
    trustScore: 50,
    riskLevel: 'MODERATE',
    signals: ['Unable to complete full AI verification.'],
    reasoning: `Analysis could not be fully completed: ${reason}`,
    recommendation: 'Proceed with caution and manually verify company contact details.',
    confidence: 0,
    valid: false,
  };
}
