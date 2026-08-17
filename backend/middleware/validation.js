// backend/middleware/validation.js

export function validateAnalyzeRequest(req, res, next) {
  const { page } = req.body || {};

  if (!page || typeof page !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'Missing required `page` object in request body.',
    });
  }

  if (typeof page.text === 'string' && page.text.length > 100000) {
    return res.status(400).json({
      success: false,
      error: 'Page text payload exceeds maximum permitted length (100,000 chars).',
    });
  }

  next();
}
