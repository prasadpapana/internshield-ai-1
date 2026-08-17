// backend/middleware/rate-limit.js
import rateLimit from 'express-rate-limit';

export const analyzeRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Rate limit exceeded. Please wait a minute before scanning again.',
  },
});
