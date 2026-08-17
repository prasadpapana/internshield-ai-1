// backend/services/scoring.js
import { deriveRiskLevel } from '../../shared/schemas/analysis-schema.js';
import { logger } from '../utils/logger.js';

export function blendScamScores(pageData, deterministicAnalysis, grokAnalysis) {
  const STARTING_SCORE = 100;
  const deterministicDeductions = deterministicAnalysis?.totalDeductions || 0;
  const deterministicScore = Math.max(0, Math.min(100, STARTING_SCORE - deterministicDeductions));

  let finalTrustScore = deterministicScore;

  // Integrate Grok AI if valid analysis returned
  if (grokAnalysis && grokAnalysis.valid && typeof grokAnalysis.trustScore === 'number') {
    // 50% weight to deterministic signals, 50% to Grok AI evidence
    finalTrustScore = Math.round((deterministicScore * 0.5) + (grokAnalysis.trustScore * 0.5));
  }

  finalTrustScore = Math.max(0, Math.min(100, finalTrustScore));
  const riskLevel = deriveRiskLevel(finalTrustScore);

  // Merge signals without duplicate descriptions
  const signalMap = new Map();

  for (const s of (deterministicAnalysis?.signals || [])) {
    signalMap.set(s.type, {
      type: s.type,
      severity: s.severity,
      deduction: s.deduction,
      description: s.description,
    });
  }

  if (grokAnalysis && Array.isArray(grokAnalysis.signals)) {
    for (const aiSig of grokAnalysis.signals) {
      const type = aiSig.type || 'AI_DETECTED_SIGNAL';
      if (!signalMap.has(type)) {
        signalMap.set(type, {
          type,
          severity: aiSig.severity || 'MEDIUM',
          deduction: 15,
          description: aiSig.description || String(aiSig),
        });
      }
    }
  }

  const mergedSignals = Array.from(signalMap.values());

  // Debug Console Output
  logger.info('=================================================');
  logger.info(`[SCORING DEBUG] Posting: "${pageData.jobTitle || 'Unknown'}" at "${pageData.company || 'Unknown'}"`);
  logger.info(`[SCORING DEBUG] Detected Signals Count: ${mergedSignals.length}`);
  mergedSignals.forEach((s) => {
    logger.info(`  - ${s.type} (${s.severity}): -${s.deduction || 15} pts | ${s.description}`);
  });
  logger.info(`[SCORING DEBUG] Deterministic Score: ${deterministicScore}`);
  logger.info(`[SCORING DEBUG] Grok AI Score: ${grokAnalysis?.valid ? grokAnalysis.trustScore : 'N/A'}`);
  logger.info(`[SCORING DEBUG] Final Calculated Score: ${finalTrustScore}`);
  logger.info(`[SCORING DEBUG] Risk Level: ${riskLevel}`);
  logger.info('=================================================');

  let recommendation = grokAnalysis?.recommendation;
  if (!recommendation) {
    if (finalTrustScore >= 80) {
      recommendation = 'Posting appears legitimate. Standard verification is recommended before sharing personal documents.';
    } else if (finalTrustScore >= 60) {
      recommendation = 'Proceed with moderate caution. Verify company details and recruiter identity on LinkedIn.';
    } else if (finalTrustScore >= 40) {
      recommendation = 'High risk detected. Do NOT pay any registration fees or share sensitive account info.';
    } else {
      recommendation = 'Very high risk of fraud! Do NOT apply, pay money, share OTPs, or contact over Telegram/WhatsApp.';
    }
  }

  let reasoning = grokAnalysis?.reasoning;
  if (!reasoning) {
    if (mergedSignals.length === 0) {
      reasoning = `No scam signals detected. Trust score evaluated at ${finalTrustScore}/100 based on verified posting criteria.`;
    } else {
      reasoning = `Scam risk evaluated at ${finalTrustScore}/100 trust score with ${mergedSignals.length} flagged risk signal(s).`;
    }
  }

  return {
    trustScore: finalTrustScore,
    riskLevel,
    signals: mergedSignals,
    reasoning,
    recommendation,
    confidence: grokAnalysis?.valid ? grokAnalysis.confidence : 80,
  };
}
