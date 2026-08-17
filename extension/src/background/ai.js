// extension/src/background/ai.js
// Browser-side deterministic scoring engine with dynamic 100-base score deduction model.

import { RECOMMENDATION } from './constants.js';
import { pct, clamp, uid } from './helpers.js';

export const SCAM_DEDUCTIONS = [
  {
    type: 'OTP_PASSWORD_REQUEST',
    deduction: 40,
    label: 'Requests candidate for OTP, password, or account credentials',
    re: /\b(otp|one\s*time\s*password|login\s*password|account\s*password|verification\s*code)\b/i,
  },
  {
    type: 'BANK_DETAILS_REQUEST',
    deduction: 35,
    label: 'Requests bank account, routing number, IFSC, or card details',
    re: /\b(bank\s+account|routing\s+number|ifsc|credit\s+card|debit\s+card|cvv|bank\s+details)\b/i,
  },
  {
    type: 'PAYMENT_FEE_REQUEST',
    deduction: 30,
    label: 'Mentions an upfront fee (registration, processing, training, security deposit)',
    re: /\b(registration|processing|training|application|onboarding|security|refundable)\s+(fee|cost|charge|amount|deposit)\b|\b(pay|send|deposit|transfer|wire)\b[^.]{0,35}\b(fee|money|amount|\$|usd|inr|rs)\b/i,
  },
  {
    type: 'IDENTITY_DOC_REQUEST',
    deduction: 25,
    label: 'Requests sensitive identity details (Aadhaar, SSN, Passport)',
    re: /\b(ssn|social\s+security\s+number|aadhaar|passport\s+number|national\s+id)\b/i,
  },
  {
    type: 'SUSPICIOUS_SOFTWARE',
    deduction: 25,
    label: 'Instructs candidate to download files, unknown software, or APKs',
    re: /\b(download|install|run)\b[^.]{0,35}\b(software|app|apk|file|installer|exe|anydesk|teamviewer)\b/i,
  },
  {
    type: 'CRYPTO_PAYMENT',
    deduction: 25,
    label: 'Mentions crypto, USDT, gift cards, or Western Union',
    re: /\b(bitcoin|crypto|usdt|ethereum|gift\s+card|western\s+union|moneygram)\b/i,
  },
  {
    type: 'MESSAGING_ONLY',
    deduction: 15,
    label: 'Pushes contact onto Telegram, WhatsApp, or Signal',
    re: /\b(whatsapp|telegram|signal)\b|\b(contact|reach|message|text|chat)\b[^.]{0,40}\b(whatsapp|telegram|signal)\b/i,
  },
  {
    type: 'UNREALISTIC_SALARY',
    deduction: 15,
    label: 'Advertises unrealistic fast pay claims',
    re: /\b(earn|make|get\s+paid)\b[^.]{0,25}\b(\$?\d{3,5})\b[^.]{0,15}\b(per\s+)?(day|daily|hour)\b/i,
  },
  {
    type: 'UNREALISTIC_WFH',
    deduction: 15,
    label: 'Promises 100% guaranteed income or selection without interview',
    re: /\b(guaranteed|100%)\s+(income|job|placement|salary|selection)|\b(no\s+(interview|experience|skills?)\s+(required|needed|necessary))\b/i,
  },
  {
    type: 'URGENT_PRESSURE',
    deduction: 10,
    label: 'Uses urgency or pressure language (ASAP, act now)',
    re: /\b(urgent|immediate(ly)?|act\s+now|limited\s+(slots|seats|positions)|hurry|asap)\b/i,
  },
];

export function scoreJob(page, opts = {}) {
  const text = page.text || '';
  const positives = [];
  const negatives = [];
  let totalDeduction = 0;
  const triggeredTypes = new Set();

  // Evaluate deterministic scam patterns
  for (const rule of SCAM_DEDUCTIONS) {
    if (triggeredTypes.has(rule.type)) continue;
    if (rule.re.test(text)) {
      triggeredTypes.add(rule.type);
      totalDeduction += rule.deduction;
      negatives.push(rule.label);
    }
  }

  // Domain & URL checks
  if (page.url && page.url.startsWith('http://')) {
    if (!triggeredTypes.has('SUSPICIOUS_DOMAIN')) {
      triggeredTypes.add('SUSPICIOUS_DOMAIN');
      totalDeduction += 20;
      negatives.push('Posting is served over insecure HTTP');
    }
  }

  // Email check
  const emails = page.emails || [];
  const freeDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'ymail.com'];
  if (emails.some((e) => freeDomains.some((d) => e.toLowerCase().endsWith(d)))) {
    if (!triggeredTypes.has('SUSPICIOUS_EMAIL')) {
      triggeredTypes.add('SUSPICIOUS_EMAIL');
      totalDeduction += 20;
      negatives.push('Recruiter contact relies on personal/free email (Gmail/Yahoo)');
    }
  }

  // Missing company name check
  if (!page.company || page.company.trim().length < 2 || page.company.toLowerCase() === 'unknown company') {
    if (!triggeredTypes.has('MISSING_COMPANY_INFO')) {
      triggeredTypes.add('MISSING_COMPANY_INFO');
      totalDeduction += 10;
      negatives.push('Missing or unverified company name');
    }
  }

  // Calculate dynamic trust score starting from 100
  const trustScore = clamp(100 - totalDeduction, 0, 100);

  // Derive risk level
  let riskLevel = 'LOW';
  let riskLabel = 'Low Risk';

  if (trustScore >= 80) {
    riskLevel = 'LOW';
    riskLabel = 'Low Risk';
    positives.push('Posting appears legitimate with no major scam flags.');
  } else if (trustScore >= 60) {
    riskLevel = 'MODERATE';
    riskLabel = 'Moderate Risk';
    positives.push('Posting looks fine overall but has minor caution items.');
  } else if (trustScore >= 40) {
    riskLevel = 'HIGH';
    riskLabel = 'High Risk';
  } else {
    riskLevel = 'VERY_HIGH';
    riskLabel = 'Very High Risk';
  }

  const confidence = clamp(60 + (text.length > 500 ? 20 : 0) + (page.company ? 10 : 0), 0, 100);

  return {
    id: uid(),
    date: new Date().toISOString(),
    url: page.url,
    company: page.company || 'Unknown company',
    jobTitle: page.jobTitle || page.title || 'Job posting',
    trustScore,
    scamProbability: Math.max(0, 100 - trustScore),
    riskLevel,
    riskLabel,
    confidence,
    summary: `Trust score evaluated at ${trustScore}/100 with ${negatives.length} risk signal(s) detected.`,
    positives,
    negatives,
    recommendation: RECOMMENDATION[riskLevel.toLowerCase().replace('_', '')] || RECOMMENDATION.medium,
    breakdown: {
      company: page.company ? 90 : 40,
      domain: page.url.startsWith('https://') ? 95 : 50,
      content: clamp(100 - totalDeduction, 10, 100),
      recruiter: emails.length > 0 ? 80 : 50,
    },
    rawText: opts.privacyMode ? undefined : text.slice(0, 4000),
    source: 'local',
  };
}
