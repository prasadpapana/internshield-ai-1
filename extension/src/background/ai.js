// extension/src/background/ai.js
// Browser-side deterministic scoring engine — 100-base deduction model.
// NO platform-specific bonuses or penalties. Score is based purely on
// job posting content, recruiter signals, URL safety, and detected scam patterns.

import { RECOMMENDATION } from './constants.js';
import { clamp, uid } from './helpers.js';

export const SCAM_DEDUCTIONS = [
  {
    type: 'OTP_PASSWORD_REQUEST',
    deduction: 40,
    label: 'Requests candidate for OTP, password, or account credentials',
    // Only matches explicit credential requests, not normal verification/confirmation wording
    re: /\b(enter|provide|share|send|submit)\b[^.]{0,20}\b(otp|one[\s-]time\s+password|login\s+password|account\s+password)\b|\b(otp|one[\s-]time\s+password)\s+(to|for|and)\b/i,
  },
  {
    type: 'BANK_DETAILS_REQUEST',
    deduction: 35,
    label: 'Requests bank account, routing number, IFSC, or card details',
    // Requires explicit request verb to avoid matching informational mentions
    re: /\b(provide|share|send|submit|enter)\b[^.]{0,25}\b(bank\s+account|routing\s+number|ifsc|credit\s+card|debit\s+card|cvv|bank\s+details)\b|\b(bank\s+account|ifsc|routing\s+number)\s+(number|details|info)\s+(required|needed|for\s+payout)\b/i,
  },
  {
    type: 'PAYMENT_FEE_REQUEST',
    deduction: 30,
    label: 'Requires upfront payment: registration fee, training fee, or security deposit',
    // TIGHTENED to avoid false positives on:
    //   - Normal salary/pay text: 'Pay: INR 15,000/month', 'Pay scale: Rs 8,000'
    //   - Disclaimer/negative: 'No registration fee required', 'We do not charge any fee'
    //   - Application context: 'application process is simple'
    // Only matches when a fee is clearly CHARGED to the applicant.
    re: /\b(?<!no\s)(?<!not\s)(?<!without\s)(?<!free\s*-\s*)(registration|processing|training|onboarding|security|refundable)\s+(fee|cost|charge|deposit)\s+(?!is\s+not|are\s+not|not\s+required|not\s+charged)\b|\b(candidates?|applicants?|students?|you)\b[^.!?]{0,50}\b(pay|deposit|transfer|wire)\b[^.!?]{0,30}\b(fee|registration|deposit|charges?)\b/i,
  },
  {
    type: 'IDENTITY_DOC_REQUEST',
    deduction: 25,
    label: 'Requests sensitive identity details (Aadhaar, SSN, Passport) upfront',
    // Requires an explicit request/submission context
    re: /\b(submit|provide|send|share|upload)\b[^.]{0,30}\b(aadhaar|ssn|social\s+security\s+number|passport\s+number|national\s+id)\b|\b(aadhaar|ssn|passport\s+number)\b[^.]{0,20}\b(required|mandatory|needed\s+to\s+apply)\b/i,
  },
  {
    type: 'SUSPICIOUS_SOFTWARE',
    deduction: 25,
    label: 'Instructs candidate to download and install unknown software or APKs',
    re: /\b(download|install|run)\b[^.]{0,35}\b(software|apk|installer|exe|anydesk|teamviewer|remote\s+access)\b/i,
  },
  {
    type: 'CRYPTO_PAYMENT',
    deduction: 25,
    label: 'Mentions crypto, USDT, gift cards, or Western Union for payments',
    re: /\b(bitcoin|crypto(?:currency)?|usdt|ethereum|gift\s+card|western\s+union|moneygram)\b/i,
  },
  {
    type: 'MESSAGING_ONLY',
    deduction: 15,
    label: 'Recruiter pushes all contact to Telegram, WhatsApp, or Signal only',
    // Tightened: only flags when messaging app is the ONLY or PRIMARY contact channel
    re: /\b(contact|reach|message|communicate|apply)\b[^.]{0,50}\b(only|exclusively|strictly)\b[^.]{0,30}\b(telegram|whatsapp|signal)\b|\b(telegram|whatsapp|signal)\b[^.]{0,30}\b(only|exclusively|contact\s+us)\b/i,
  },
  {
    type: 'UNREALISTIC_SALARY',
    deduction: 15,
    label: 'Advertises unrealistic fast earnings per day or per hour',
    // Requires 'earn/make/get paid' verb + specific amount + short timeframe
    // Avoids matching normal monthly stipend amounts
    re: /\b(earn|make|get\s+paid)\b[^.]{0,30}\b(\$?(?:[5-9]\d{2}|[1-9]\d{3,}))\b[^.]{0,20}\b(per\s+day|per\s+hour|daily|hourly)\b/i,
  },
  {
    type: 'UNREALISTIC_WFH',
    deduction: 15,
    label: 'Promises 100% guaranteed income or selection without any interview',
    re: /\b(guaranteed|100%)\s+(income|placement|salary|selection|hiring)\b|\b(no\s+interview\s+(required|needed))\b/i,
  },
  {
    type: 'URGENT_PRESSURE',
    deduction: 10,
    label: 'Uses high-pressure urgency language (ASAP, act now, limited seats)',
    re: /\b(act\s+now|limited\s+(slots|seats|positions)|hurry\s+up)\b/i,
  },
];

export function scoreJob(page, opts = {}) {
  const text = page.text || '';
  const positives = [];
  const negatives = [];
  const detectedSignals = [];
  let totalDeduction = 0;
  const triggeredTypes = new Set();

  // === STEP 1: Evaluate deterministic scam text patterns ===
  for (const rule of SCAM_DEDUCTIONS) {
    if (triggeredTypes.has(rule.type)) continue;
    if (rule.re.test(text)) {
      triggeredTypes.add(rule.type);
      totalDeduction += rule.deduction;
      negatives.push(rule.label);
      detectedSignals.push({ type: rule.type, deduction: rule.deduction });
    }
  }

  // === STEP 2: URL safety check (platform-neutral: HTTP = insecure) ===
  const url = page.url || '';
  if (url.startsWith('http://')) {
    if (!triggeredTypes.has('SUSPICIOUS_DOMAIN')) {
      triggeredTypes.add('SUSPICIOUS_DOMAIN');
      totalDeduction += 20;
      negatives.push('Posting is served over insecure HTTP (no SSL)');
      detectedSignals.push({ type: 'SUSPICIOUS_DOMAIN', deduction: 20 });
    }
  } else {
    positives.push('Posting is served over HTTPS (secure connection)');
  }

  // === STEP 3: Recruiter email check (platform-neutral) ===
  const emails = page.emails || [];
  const freeDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'ymail.com', 'rediffmail.com'];
  if (emails.some((e) => freeDomains.some((d) => e.toLowerCase().endsWith(d)))) {
    if (!triggeredTypes.has('SUSPICIOUS_EMAIL')) {
      triggeredTypes.add('SUSPICIOUS_EMAIL');
      totalDeduction += 20;
      negatives.push('Recruiter contact uses a personal email (Gmail/Yahoo) instead of a company address');
      detectedSignals.push({ type: 'SUSPICIOUS_EMAIL', deduction: 20 });
    }
  } else if (emails.length > 0) {
    positives.push('Recruiter contact uses a professional email domain');
  }

  // === STEP 4: Missing company check (platform-neutral) ===
  if (!page.company || page.company.trim().length < 2 || page.company.toLowerCase() === 'unknown company') {
    if (!triggeredTypes.has('MISSING_COMPANY_INFO')) {
      triggeredTypes.add('MISSING_COMPANY_INFO');
      totalDeduction += 10;
      negatives.push('No identifiable hiring company name');
      detectedSignals.push({ type: 'MISSING_COMPANY_INFO', deduction: 10 });
    }
  } else {
    positives.push(`Named hiring company identified: "${page.company}"`);
  }

  // === STEP 5: Positive trust signals in content ===
  if (/\b(responsibilities|what\s+you'?ll\s+do|key\s+duties|role\s+overview)\b/i.test(text)) {
    positives.push('Job has a structured responsibilities section');
  }
  if (/\b(qualifications|requirements|what\s+we'?re\s+looking\s+for|skills\s+required)\b/i.test(text)) {
    positives.push('Job lists clear qualifications and requirements');
  }
  if (/\b(apply\s+(via|through|on)|application\s+portal|official\s+careers\s+page)\b/i.test(text)) {
    positives.push('Application routes through an official portal');
  }

  // === STEP 6: Calculate dynamic trust score (100-base deduction) ===
  const trustScore = clamp(100 - totalDeduction, 0, 100);

  let riskLevel = 'LOW';
  let riskLabel = 'Low Risk';
  if (trustScore >= 80) {
    riskLevel = 'LOW';
    riskLabel = 'Low Risk';
  } else if (trustScore >= 60) {
    riskLevel = 'MODERATE';
    riskLabel = 'Moderate Risk';
  } else if (trustScore >= 40) {
    riskLevel = 'HIGH';
    riskLabel = 'High Risk';
  } else {
    riskLevel = 'VERY_HIGH';
    riskLabel = 'Very High Risk';
  }

  const confidence = clamp(60 + (text.length > 500 ? 20 : 0) + (page.company ? 10 : 0), 0, 100);

  // === Dev debug logging ===
  console.log('[DraftJobs] ====== SCORING DEBUG ======');
  console.log(`[DraftJobs] Posting: "${page.jobTitle || '?'}" | Company: "${page.company || '?'}"`);
  console.log(`[DraftJobs] URL: ${url}`);
  console.log(`[DraftJobs] Detected signals: ${detectedSignals.length}`);
  detectedSignals.forEach((s) => console.log(`[DraftJobs]   - ${s.type}: -${s.deduction} pts`));
  console.log(`[DraftJobs] Total deduction: ${totalDeduction}`);
  console.log(`[DraftJobs] Final trustScore: ${trustScore}/100 | Risk: ${riskLevel}`);
  console.log('[DraftJobs] ================================');

  // Breakdown values derived from actual signal detection (not hardcoded)
  const hasCorpEmail = emails.some((e) => !freeDomains.some((d) => e.toLowerCase().endsWith(d)));
  const companyBreakdown = page.company ? (triggeredTypes.has('MISSING_COMPANY_INFO') ? 40 : 90) : 40;
  const domainBreakdown = url.startsWith('https://') ? clamp(95 - (triggeredTypes.has('SUSPICIOUS_DOMAIN') ? 45 : 0), 0, 100) : 50;
  const contentBreakdown = clamp(100 - totalDeduction, 10, 100);
  const recruiterBreakdown = emails.length > 0
    ? (hasCorpEmail ? 90 : 55)
    : 60;

  return {
    id: uid(),
    date: new Date().toISOString(),
    url,
    company: page.company || 'Unknown company',
    jobTitle: page.jobTitle || page.title || 'Job posting',
    trustScore,
    scamProbability: Math.max(0, 100 - trustScore),
    riskLevel,
    riskLabel,
    confidence,
    summary: buildSummary(trustScore, riskLevel, detectedSignals, positives),
    positives,
    negatives,
    signals: detectedSignals,
    recommendation: RECOMMENDATION[riskLevel.toLowerCase().replace('_', '')] || RECOMMENDATION.medium,
    breakdown: {
      company: companyBreakdown,
      domain: domainBreakdown,
      content: contentBreakdown,
      recruiter: recruiterBreakdown,
    },
    rawText: opts.privacyMode ? undefined : text.slice(0, 4000),
    source: 'local',
  };
}

function buildSummary(trustScore, riskLevel, signals, positives) {
  if (signals.length === 0) {
    return `No scam signals detected. Trust score: ${trustScore}/100. ${
      positives.length > 0
        ? 'Posting shows positive markers: ' + positives.slice(0, 2).join('; ') + '.'
        : 'Appears to be a standard posting.'
    }`;
  }
  const topSignal = signals[0];
  return `${signals.length} risk signal(s) detected. Trust score: ${trustScore}/100. Top concern: ${topSignal.type.replace(/_/g, ' ')} (-${topSignal.deduction} pts).`;
}
