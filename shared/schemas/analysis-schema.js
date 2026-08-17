// shared/schemas/analysis-schema.js

export function validateAnalysisResult(data) {
  if (!data || typeof data !== 'object') {
    return createFallbackResult('Invalid response payload');
  }

  const trustScore = typeof data.trustScore === 'number'
    ? Math.max(0, Math.min(100, Math.round(data.trustScore)))
    : null;

  const validRiskLevels = ['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH', 'CRITICAL'];
  let rawRisk = String(data.riskLevel || '').toUpperCase().replace(/\s+/g, '_');
  if (rawRisk === 'VERYHIGH') rawRisk = 'VERY_HIGH';

  const riskLevel = validRiskLevels.includes(rawRisk)
    ? rawRisk
    : (trustScore !== null ? deriveRiskLevel(trustScore) : 'MODERATE');

  const signals = Array.isArray(data.signals)
    ? data.signals.map((s) => {
        if (typeof s === 'string') {
          return { type: 'GENERAL_SIGNAL', severity: 'MEDIUM', description: s.trim() };
        }
        if (s && typeof s === 'object') {
          return {
            type: String(s.type || 'GENERAL_SIGNAL').toUpperCase(),
            severity: String(s.severity || 'MEDIUM').toUpperCase(),
            description: String(s.description || s.label || s.text || '').trim(),
          };
        }
        return null;
      }).filter((s) => s && s.description.length > 0)
    : [];

  const reasoning = typeof data.reasoning === 'string' ? data.reasoning.trim() : '';
  const recommendation = typeof data.recommendation === 'string' ? data.recommendation.trim() : '';
  const confidence = typeof data.confidence === 'number'
    ? Math.max(0, Math.min(100, Math.round(data.confidence)))
    : 75;

  return {
    trustScore,
    riskLevel,
    signals,
    reasoning,
    recommendation,
    confidence,
    valid: trustScore !== null,
  };
}

export function deriveRiskLevel(trustScore) {
  if (trustScore >= 80) return 'LOW';
  if (trustScore >= 60) return 'MODERATE';
  if (trustScore >= 40) return 'HIGH';
  return 'VERY_HIGH';
}

export function createFallbackResult(reason = 'Analysis unavailable') {
  return {
    trustScore: null,
    riskLevel: 'MODERATE',
    signals: [{
      type: 'VERIFICATION_WARNING',
      severity: 'MEDIUM',
      description: `Unable to complete full AI verification: ${reason}`,
    }],
    reasoning: `Analysis could not be fully completed: ${reason}`,
    recommendation: 'Proceed with caution and manually verify company contact details.',
    confidence: 0,
    valid: false,
  };
}
