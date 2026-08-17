// backend/services/scoring.js
import { deriveRiskLevel } from '../../shared/schemas/analysis-schema.js';

/**
 * Combines deterministic signal deductions and Grok AI output into a single consistent verdict.
 */
export function blendScamScores(pageData, deterministicAnalysis, grokAnalysis) {
  let baseScore = 85;

  // Apply deterministic signal deductions
  if (deterministicAnalysis && deterministicAnalysis.scoreDeduction) {
    baseScore -= deterministicAnalysis.scoreDeduction;
  }

  // Combine with Grok AI score if valid AI analysis exists
  let finalTrustScore = baseScore;
  if (grokAnalysis && grokAnalysis.valid) {
    finalTrustScore = Math.round(baseScore * 0.4 + grokAnalysis.trustScore * 0.6);
  }

  finalTrustScore = Math.max(0, Math.min(100, finalTrustScore));
  const riskLevel = deriveRiskLevel(finalTrustScore);

  // Combine deterministic labels with Grok detected signals
  const allSignals = Array.from(new Set([
    ...(deterministicAnalysis?.signals?.map((s) => s.label) || []),
    ...(grokAnalysis?.signals || []),
  ]));

  let recommendation = grokAnalysis?.recommendation;
  if (!recommendation) {
    if (finalTrustScore >= 80) {
      recommendation = 'Posting appears safe. Standard verification is recommended before sharing personal documents.';
    } else if (finalTrustScore >= 60) {
      recommendation = 'Proceed with moderate caution. Independently confirm recruiter credentials on LinkedIn.';
    } else if (finalTrustScore >= 40) {
      recommendation = 'High risk detected. Do NOT pay any registration or training fees to apply for this job.';
    } else {
      recommendation = 'Very high risk of fraud. Avoid applying, sharing IDs, or communicating over WhatsApp/Telegram.';
    }
  }

  return {
    trustScore: finalTrustScore,
    riskLevel,
    signals: allSignals,
    reasoning: grokAnalysis?.reasoning || `Scam risk evaluated at ${finalTrustScore}/100 trust score with ${allSignals.length} flagged item(s).`,
    recommendation,
    confidence: grokAnalysis?.valid ? grokAnalysis.confidence : 75,
  };
}
