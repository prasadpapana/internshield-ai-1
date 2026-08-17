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
  try {
    const { page } = req.body;
    logger.info(`Analyzing posting: "${page.jobTitle || 'Unknown'}" at "${page.company || 'Unknown'}"`);

    // 1. Run deterministic scam signal detection
    const deterministic = detectDeterministicSignals(page);

    // 2. Run Grok AI analysis
    const grokResult = await analyzeJobWithGrokAI(page, deterministic.signals);

    // 3. Blend scores and signals into final structured verdict
    const finalVerdict = blendScamScores(page, deterministic, grokResult);

    return res.json({
      success: true,
      data: finalVerdict,
      meta: {
        analyzedAt: new Date().toISOString(),
        version: '1.0.0',
      },
    });
  } catch (err) {
    logger.error('Error during job analysis route execution:', err);
    return res.status(500).json({
      success: false,
      error: 'An internal error occurred during scam analysis.',
    });
  }
});

router.post('/report', (req, res) => {
  const { report } = req.body || {};
  logger.info(`Scam report received for scan ${report?.scanId || 'unknown'}: ${report?.reason || 'no reason'}`);
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
