// backend/services/grok.js
import { validateAnalysisResult, createFallbackResult } from '../../shared/schemas/analysis-schema.js';
import { logger } from '../utils/logger.js';

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';
const TIMEOUT_MS = 15000;

export async function analyzeJobWithGrokAI(pageData, deterministicSignals) {
  const apiKey = process.env.GROK_API_KEY;

  if (!apiKey || apiKey === 'your_grok_api_key_here' || apiKey.trim() === '') {
    logger.warn('Grok AI API key is not configured in backend .env file.');
    return createFallbackResult('Backend GROK_API_KEY is not configured');
  }

  const model = process.env.GROK_MODEL || 'grok-3-mini';

  const systemPrompt = `You are an expert cybersecurity and job scam detection specialist for DraftJobs.
Analyze the provided job/internship posting data for potential scam signals.

Target Signals to Watch:
- Asking for money, application fees, training fees, security deposits, device charges
- Requests for sensitive details (Bank details, OTP, passwords, SSN/Aadhaar)
- Communication funneled solely to Telegram/WhatsApp/personal Gmail
- Unrealistic salary claims, "easy work-from-home", "guaranteed job/placement"
- Urgent pressure tactics, missing company info, poorly written descriptions

You MUST respond ONLY with valid JSON in this EXACT structure (no markdown formatting, no code block backticks):
{
  "trustScore": 75,
  "riskLevel": "LOW",
  "signals": ["Signal description 1", "Signal description 2"],
  "reasoning": "Clear explanation of why this risk level was assigned.",
  "recommendation": "Actionable recommendation for the user.",
  "confidence": 85
}

Risk level values MUST be one of: "LOW", "MODERATE", "HIGH", "VERY HIGH".
Trust score MUST be an integer between 0 and 100 (100 = completely trustworthy, 0 = definite scam).
Confidence MUST be an integer between 0 and 100.`;

  const userPrompt = `Job Title: ${pageData.jobTitle || 'Unknown'}
Company: ${pageData.company || 'Unknown'}
URL: ${pageData.url || 'Unknown'}
Extracted Contact Emails: ${JSON.stringify(pageData.emails || [])}
Deterministic Signals Already Detected: ${JSON.stringify(deterministicSignals.map((s) => s.label))}

Job Description Text:
"""
${(pageData.text || '').slice(0, 4000)}
"""`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
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
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.error(`Grok API HTTP error (${res.status}): ${errText.slice(0, 200)}`);

      if (res.status === 401 || res.status === 403) {
        return createFallbackResult('Grok API authentication failed (Invalid API key)');
      }
      if (res.status === 429) {
        return createFallbackResult('Grok API rate limit reached. Please try again shortly');
      }
      return createFallbackResult(`Grok API responded with status ${res.status}`);
    }

    const json = await res.parseJson ? await res.parseJson() : await res.json();
    const rawContent = json?.choices?.[0]?.message?.content;

    if (!rawContent) {
      logger.warn('Empty message content returned by Grok API');
      return createFallbackResult('Empty response from AI model');
    }

    let parsedContent;
    try {
      const cleanJson = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedContent = JSON.parse(cleanJson);
    } catch (parseErr) {
      logger.error('Failed to parse Grok JSON output:', parseErr.message, rawContent.slice(0, 200));
      return createFallbackResult('Invalid JSON response format from AI model');
    }

    const validated = validateAnalysisResult(parsedContent);
    return validated;
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.error('Grok API call timed out after 15s');
      return createFallbackResult('AI model request timed out');
    }
    logger.error('Grok API fetch network error:', err.message);
    return createFallbackResult(`Network failure calling AI service: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}
