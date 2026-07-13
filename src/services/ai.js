// src/services/ai.js
// The scoring engine. Combines four weighted sub-analyses into a single
// verdict. It is deterministic and explainable by design: every point of the
// score traces back to a named signal, which matters for a tool people use to
// make a real decision. No black-box model, no data leaves the device.
//
//   Trust Score = 0.30*company + 0.25*domain + 0.25*content + 0.20*recruiter
//
// Scam Probability is computed primarily from matched scam patterns (so a
// posting can have an okay structure yet still flag as a scam when it asks for
// money), then blended with the trust gap. Risk level is banded off the trust
// score. Confidence reflects how much evidence we actually had to work with.

import {
  WEIGHTS, RISK_BANDS, RECOMMENDATION, SCAM_PATTERNS, TRUST_PATTERNS,
  FREE_EMAIL_DOMAINS,
} from '../utils/constants.js';
import { pct, clamp, uid } from '../utils/helpers.js';
import { analyzeDomain } from './domain.js';
import { analyzeCompany } from './company.js';

// ---- Content analysis -----------------------------------------------------

function analyzeContent(page) {
  const text = page.text || '';
  const positives = [];
  const negatives = [];
  let score = 65;
  let scamEvidence = 0; // accumulated scam-pattern weight

  for (const p of SCAM_PATTERNS) {
    if (p.re.test(text)) {
      scamEvidence += p.weight;
      score -= p.weight * 3;
      negatives.push(p.label);
    }
  }
  for (const p of TRUST_PATTERNS) {
    if (p.re.test(text)) {
      score += p.weight * 2.5;
      positives.push(p.label);
    }
  }

  // Writing-quality heuristics.
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length > 50) {
    const upper = (text.match(/[A-Z]/g) || []).length;
    const upperRatio = upper / letters.length;
    if (upperRatio > 0.35) {
      score -= 8;
      scamEvidence += 1;
      negatives.push('Excessive ALL-CAPS text');
    }
  }
  const emojiCount = (text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
  if (emojiCount >= 6) {
    score -= 6;
    scamEvidence += 1;
    negatives.push('Heavy emoji use for a professional listing');
  }
  const exclam = (text.match(/!/g) || []).length;
  if (exclam >= 6) {
    score -= 5;
    negatives.push('Overuse of exclamation marks');
  }

  // Very short postings carry little real detail.
  if (text.length < 280) {
    score -= 6;
    negatives.push('Very little posting detail provided');
  } else if (text.length > 900) {
    score += 5;
    positives.push('Detailed, substantive job description');
  }

  return {
    score: clamp(score, 0, 100),
    scamEvidence,
    positives,
    negatives,
  };
}

// ---- Recruiter verification ----------------------------------------------

function analyzeRecruiter(page) {
  const text = page.text || '';
  const positives = [];
  const negatives = [];
  let score = 55;

  const emails = page.emails || [];
  const emailDomains = emails.map((e) => (e.split('@')[1] || '').toLowerCase()).filter(Boolean);
  const corp = emailDomains.filter((d) => !FREE_EMAIL_DOMAINS.includes(d));

  if (emails.length === 0) {
    score -= 4; // not damning on its own (ATS postings hide email) but lowers confidence
  } else if (corp.length > 0) {
    score += 16;
    positives.push('Recruiter reachable at a corporate address');
  } else {
    score -= 18;
    negatives.push('Recruiter only reachable via a personal email');
  }

  // Contact funneled to messaging apps.
  if (/\b(whatsapp|telegram|signal)\b/i.test(text)) {
    score -= 16;
    negatives.push('Pushes contact onto a messaging app');
  }

  // A named contact person reads more legitimate than "the hiring team".
  if (/\b(contact|reach\s+out\s+to|recruiter|hiring\s+manager)\b[^.]{0,30}\b[A-Z][a-z]+\s+[A-Z][a-z]+/.test(text)) {
    score += 8;
    positives.push('Names a specific contact person');
  }

  // LinkedIn recruiter link.
  if ((page.links || []).some((l) => /linkedin\.com\/(in|company)/i.test(l))) {
    score += 8;
    positives.push('Recruiter / company has a LinkedIn profile');
  }

  return {
    score: clamp(score, 0, 100),
    positives,
    negatives,
  };
}

// ---- Orchestration --------------------------------------------------------

function riskFromTrust(trust) {
  for (const band of RISK_BANDS) {
    if (trust >= band.min) return band;
  }
  return RISK_BANDS[RISK_BANDS.length - 1];
}

function computeConfidence(page) {
  let c = 30;
  if ((page.text || '').length > 400) c += 25;
  if ((page.text || '').length > 1200) c += 10;
  if (page.company) c += 12;
  if (page.jobTitle) c += 8;
  if ((page.emails || []).length > 0) c += 10;
  if ((page.links || []).length > 3) c += 5;
  return pct(c);
}

/**
 * Run the full analysis on sanitized page data.
 * @param {object} page
 * @param {object} [opts] { privacyMode?: boolean }
 * @returns {object} scan result
 */
export function scoreJob(page, opts = {}) {
  const domain = analyzeDomain(page);
  const company = analyzeCompany(page, domain);
  const content = analyzeContent(page);
  const recruiter = analyzeRecruiter(page);

  const trustScore = pct(
    company.score * WEIGHTS.company
    + domain.score * WEIGHTS.domain
    + content.score * WEIGHTS.content
    + recruiter.score * WEIGHTS.recruiter,
  );

  // Scam probability: pattern evidence dominates, blended with trust gap.
  // scamEvidence is unbounded in theory; ~12 points of evidence ≈ saturated.
  const evidenceScore = clamp((content.scamEvidence / 12) * 100, 0, 100);
  const trustGap = 100 - trustScore;
  const scamProbability = pct(evidenceScore * 0.7 + trustGap * 0.3);

  const band = riskFromTrust(trustScore);
  const confidence = computeConfidence(page);

  const positives = [
    ...company.positives, ...domain.positives,
    ...content.positives, ...recruiter.positives,
  ];
  const negatives = [
    ...company.negatives, ...domain.negatives,
    ...content.negatives, ...recruiter.negatives,
  ];

  const summary = buildSummary(band.level, trustScore, scamProbability, negatives.length);

  return {
    id: uid(),
    date: new Date().toISOString(),
    url: page.url,
    company: page.company || 'Unknown company',
    jobTitle: page.jobTitle || page.title || 'Job posting',
    trustScore,
    scamProbability,
    riskLevel: band.level,
    riskLabel: band.label,
    confidence,
    summary,
    positives,
    negatives,
    recommendation: RECOMMENDATION[band.level],
    breakdown: {
      company: Math.round(company.score),
      domain: Math.round(domain.score),
      content: Math.round(content.score),
      recruiter: Math.round(recruiter.score),
    },
    companyData: company.company,
    domainData: domain.domainData,
    // Raw page text is never stored when privacyMode is on.
    rawText: opts.privacyMode ? undefined : (page.text || '').slice(0, 4000),
    source: 'local',
  };
}

function buildSummary(level, trust, scam, flagCount) {
  const flags = flagCount === 0
    ? 'no notable red flags'
    : `${flagCount} flag${flagCount === 1 ? '' : 's'} worth reviewing`;
  switch (level) {
    case 'safe':
      return `Strong trust signals and ${flags}. This reads like a real posting.`;
    case 'low':
      return `Mostly solid with ${flags}. A quick independent check is enough.`;
    case 'medium':
      return `Mixed signals with ${flags}. Verify before sharing anything personal.`;
    case 'high':
      return `Weak trust signals and ${flags}. Several scam patterns are present.`;
    default:
      return `Very low trust (${trust}/100) and a ${scam}% scam probability. Avoid this one.`;
  }
}
