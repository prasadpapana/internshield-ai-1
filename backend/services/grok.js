// backend/services/grok.js
import { validateAnalysisResult, createFallbackResult } from '../../shared/schemas/analysis-schema.js';
import { logger } from '../utils/logger.js';

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';
const TIMEOUT_MS = 12000;

export async function analyzeJobWithGrokAI(pageData, deterministicSignals) {
  const apiKey = process.env.GROK_API_KEY;

  if (!apiKey || apiKey === 'your_grok_api_key_here' || apiKey.trim() === '') {
    logger.warn('[DraftJobs] Grok error: GROK_API_KEY is not configured in backend .env');
    return createFallbackResult('Backend GROK_API_KEY is missing');
  }

  const model = process.env.GROK_MODEL || 'grok-3-mini';

  const systemPrompt = `You are an expert job scam detection AI for DraftJobs.
Analyze the provided job/internship posting for potential scam signals.

Target Signals to Evaluate:
- Payment requests (registration fees, training fees, security deposits)
- OTP, password, bank account, Aadhaar/SSN requests
- Telegram/WhatsApp-only contact
- Unrealistic salary claims, fast cash, guaranteed job placement
- Urgent pressure tactics, missing company info, suspicious APK/software download

You MUST respond ONLY with valid JSON in this EXACT structure (no markdown formatting, no code block backticks):
{
  "trustScore": 100,
  "riskLevel": "LOW",
  "signals": [
    {
      "type": "SUSPICIOUS_CONTACT",
      "severity": "MEDIUM",
      "description": "The recruiter asks applicants to continue communication through Telegram."
    }
  ],
  "reasoning": "Clear explanation of why this score was assigned.",
  "recommendation": "Actionable recommendation for the candidate.",
  "confidence": 85
}

Risk level values MUST be one of: "LOW", "MODERATE", "HIGH", "VERY_HIGH".
Trust score MUST be a dynamically calculated integer between 0 and 100 based strictly on evidence (100 = completely trustworthy, 0 = definite scam).`;

  const userPrompt = `Job Title: ${pageData.jobTitle || 'Unknown'}
Company: ${pageData.company || 'Unknown'}
URL: ${pageData.url || 'Unknown'}
Extracted Contact Emails: ${JSON.stringify(pageData.emails || [])}
Deterministic Signals Detected: ${JSON.stringify(deterministicSignals.map((s) => ({ type: s.type, description: s.description })))}

Job Description Text:
"""
${(pageData.text || '').slice(0, 4000)}
"""`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    logger.info(`[DraftJobs] Grok request started (model: ${model})`);
    const res = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.error(`[DraftJobs] Grok error: HTTP ${res.status} - ${errText.slice(0, 200)}`);

      if (res.status === 401 || res.status === 403) {
        return createFallbackResult('Grok API authentication failed (401/403 Invalid API key)');
      }
      if (res.status === 408) {
        return createFallbackResult('Grok API request timed out (408)');
      }
      if (res.status === 429) {
        return createFallbackResult('Grok API rate limit exceeded (429)');
      }
      if (res.status >= 500) {
        return createFallbackResult(`Grok AI service temporary error (${res.status})`);
      }
      return createFallbackResult(`Grok API error HTTP ${res.status}`);
    }

    const json = await res.json();
    logger.info('[DraftJobs] Grok response received');
    const rawContent = json?.choices?.[0]?.message?.content;

    if (!rawContent) {
      logger.warn('[DraftJobs] Grok error: Empty message content returned');
      return createFallbackResult('Empty response from AI model');
    }

    let parsedContent;
    try {
      const cleanJson = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedContent = JSON.parse(cleanJson);
    } catch (parseErr) {
      logger.error('[DraftJobs] Grok error: JSON parse failure:', parseErr.message);
      return createFallbackResult('Invalid JSON response format from AI model');
    }

    const validated = validateAnalysisResult(parsedContent);
    return validated;
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.error('[DraftJobs] Timeout: Grok API call timed out after 12s');
      return createFallbackResult('AI service did not respond within 12 seconds');
    }
    logger.error('[DraftJobs] Grok error: Network failure calling xAI API:', err.message);
    return createFallbackResult(`Network failure calling AI service: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}
