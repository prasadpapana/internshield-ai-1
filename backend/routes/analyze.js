// backend/routes/analyze.js
import express from 'express';
import { validateAnalyzeRequest } from '../middleware/validation.js';
import { analyzeRateLimiter } from '../middleware/rate-limit.js';
import { detectDeterministicSignals } from '../services/scam-detector.js';
import { analyzeJobWithGrokAI } from '../services/grok.js';
import { blendScamScores } from '../services/scoring.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.post('/analyze', analyzeRateLimiter, validateAnalyzeRequest, async (req, res) => {
  const startTime = Date.now();
  try {
    const { page, mock } = req.body;
    logger.info(`[DraftJobs] Backend request started for: "${page.jobTitle || 'Unknown'}" at "${page.company || 'Unknown'}"`);

    // Mock Mode for local testing without calling live Grok API
    if (mock || req.query.mock === 'true' || process.env.MOCK_GROK === 'true') {
      logger.info('[DraftJobs] Returning Mock Response for testing...');
      const mockDeterministic = detectDeterministicSignals(page);
      const mockResult = blendScamScores(page, mockDeterministic, {
        trustScore: 72,
        riskLevel: 'MODERATE',
        signals: [{ type: 'MOCK_TEST', severity: 'MEDIUM', description: 'Mock response for testing' }],
        reasoning: 'Mock test analysis completed successfully.',
        recommendation: 'Verify the employer before applying.',
        confidence: 80,
        valid: true,
      });
      return res.json({
        success: true,
        data: mockResult,
        meta: { analyzedAt: new Date().toISOString(), mock: true, durationMs: Date.now() - startTime },
      });
    }

    // 1. Run deterministic scam signal detection
    const deterministic = detectDeterministicSignals(page);

    // 2. Run Grok AI analysis
    logger.info('[DraftJobs] Grok request started');
    const grokResult = await analyzeJobWithGrokAI(page, deterministic.signals);
    logger.info('[DraftJobs] Grok response received');

    // 3. Blend scores and signals into final structured verdict
    const finalVerdict = blendScamScores(page, deterministic, grokResult);
    logger.info(`[DraftJobs] Analysis completed in ${Date.now() - startTime}ms`);

    return res.json({
      success: true,
      data: finalVerdict,
      meta: {
        analyzedAt: new Date().toISOString(),
        version: '1.0.0',
        durationMs: Date.now() - startTime,
      },
    });
  } catch (err) {
    logger.error('[DraftJobs] Backend error during job analysis:', err);
    return res.status(500).json({
      success: false,
      error: 'An internal backend error occurred during scam analysis.',
    });
  }
});

router.post('/report', (req, res) => {
  const { report } = req.body || {};
  logger.info(`[DraftJobs] Scam report logged for scan ${report?.scanId || 'unknown'}`);
  return res.json({ success: true, message: 'Scam report logged successfully.' });
});

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'DraftJobs Backend API',
    grokConfigured: !!(process.env.GROK_API_KEY && process.env.GROK_API_KEY !== 'your_grok_api_key_here'),
    timestamp: new Date().toISOString(),
  });
});

export default router;
