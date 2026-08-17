// backend/services/scam-detector.js
// Server-side deterministic scam signal detector.
// NO platform-specific scoring — all rules are based purely on posting content,
// recruiter signals, URL safety, and verifiable scam patterns.

export const DETECTABLE_SCAM_RULES = [
  {
    type: 'OTP_PASSWORD_REQUEST',
    severity: 'CRITICAL',
    deduction: 40,
    description: 'Requests candidate for OTP, password, or account login credentials.',
    // Requires explicit request/submission verb — avoids matching normal security mentions
    re: /\b(enter|provide|share|send|submit)\b[^.]{0,20}\b(otp|one[\s-]time\s+password|login\s+password|account\s+password)\b|\b(otp|one[\s-]time\s+password)\s+(to|for|and)\b/i,
  },
  {
    type: 'BANK_DETAILS_REQUEST',
    severity: 'CRITICAL',
    deduction: 35,
    description: 'Requests bank account number, routing number, IFSC, or card details.',
    // Requires explicit request verb to avoid matching salary/pay-slip context
    re: /\b(provide|share|send|submit|enter)\b[^.]{0,25}\b(bank\s+account|routing\s+number|ifsc|credit\s+card|debit\s+card|cvv|bank\s+details)\b|\b(bank\s+account|ifsc|routing\s+number)\s+(number|details|info)\s+(required|needed|for\s+payout)\b/i,
  },
  {
    type: 'PAYMENT_FEE_REQUEST',
    severity: 'HIGH',
    deduction: 30,
    description: 'Requires upfront payment: registration fee, training fee, or security deposit.',
    // TIGHTENED to avoid false positives on:
    //   - Normal salary/pay text: 'Pay: INR 15,000/month', 'Pay scale: Rs 8,000'
    //   - Disclaimer/negative: 'No registration fee required', 'We do not charge any fee'
    // Only matches when a fee is clearly CHARGED to the applicant.
    re: /\b(?<!no\s)(?<!not\s)(?<!without\s)(registration|processing|training|onboarding|security|refundable)\s+(fee|cost|charge|deposit)\s+(?!is\s+not|are\s+not|not\s+required|not\s+charged)\b|\b(candidates?|applicants?|students?|you)\b[^.!?]{0,50}\b(pay|deposit|transfer|wire)\b[^.!?]{0,30}\b(fee|registration|deposit|charges?)\b/i,
  },
  {
    type: 'IDENTITY_DOC_REQUEST',
    severity: 'HIGH',
    deduction: 25,
    description: 'Requests sensitive personal identity documents (Aadhaar, SSN, Passport) prior to hiring.',
    // Requires explicit request/submission context
    re: /\b(submit|provide|send|share|upload)\b[^.]{0,30}\b(aadhaar|ssn|social\s+security\s+number|passport\s+number|national\s+id)\b|\b(aadhaar|ssn|passport\s+number)\b[^.]{0,20}\b(required|mandatory|needed\s+to\s+apply)\b/i,
  },
  {
    type: 'SUSPICIOUS_SOFTWARE',
    severity: 'HIGH',
    deduction: 25,
    description: 'Instructs applicant to download or install external software, APKs, or remote access tools.',
    re: /\b(download|install|run)\b[^.]{0,35}\b(software|apk|installer|exe|anydesk|teamviewer|remote\s+access)\b/i,
  },
  {
    type: 'CRYPTO_PAYMENT',
    severity: 'HIGH',
    deduction: 25,
    description: 'Mentions payments via Cryptocurrency, USDT, gift cards, or Western Union.',
    re: /\b(bitcoin|crypto(?:currency)?|usdt|ethereum|gift\s+card|western\s+union|moneygram)\b/i,
  },
  {
    type: 'SUSPICIOUS_DOMAIN',
    severity: 'MEDIUM',
    deduction: 20,
    description: 'Job posting is on insecure HTTP or a high-risk domain extension.',
    check: (page) => {
      const url = page.url || '';
      if (url.startsWith('http://')) return true;
      const badTlds = ['xyz', 'top', 'club', 'online', 'site', 'website', 'click', 'link', 'work', 'gq', 'cf', 'ml', 'ga', 'tk', 'buzz', 'icu'];
      try {
        const host = new URL(url.includes('://') ? url : `https://${url}`).hostname.toLowerCase();
        const parts = host.split('.');
        const tld = parts.length > 1 ? parts[parts.length - 1] : '';
        return badTlds.includes(tld);
      } catch {
        return false;
      }
    },
  },
  {
    type: 'SUSPICIOUS_EMAIL',
    severity: 'MEDIUM',
    deduction: 20,
    description: 'Recruiter relies on a free personal email domain (Gmail, Yahoo, Outlook) instead of a corporate email.',
    check: (page) => {
      const emails = page.emails || [];
      const freeDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'ymail.com', 'aol.com', 'rediffmail.com'];
      return emails.some((e) => freeDomains.some((d) => e.toLowerCase().endsWith(d)));
    },
  },
  {
    type: 'MESSAGING_ONLY',
    severity: 'MEDIUM',
    deduction: 15,
    description: 'Recruiter directs all applicant contact exclusively to Telegram, WhatsApp, or Signal.',
    // Tightened: only flags "only/exclusively" contact via messaging apps
    re: /\b(contact|reach|message|communicate|apply)\b[^.]{0,50}\b(only|exclusively|strictly)\b[^.]{0,30}\b(telegram|whatsapp|signal)\b|\b(telegram|whatsapp|signal)\b[^.]{0,30}\b(only|exclusively|contact\s+us)\b/i,
  },
  {
    type: 'UNREALISTIC_SALARY',
    severity: 'MEDIUM',
    deduction: 15,
    description: 'Advertises unrealistic fast earnings (e.g. earn $500/day).',
    // Only triggers on verb + specific high amount + per-day/hour — NOT on normal monthly stipend text
    re: /\b(earn|make|get\s+paid)\b[^.]{0,30}\b(\$?(?:[5-9]\d{2}|[1-9]\d{3,}))\b[^.]{0,20}\b(per\s+day|per\s+hour|daily|hourly)\b/i,
  },
  {
    type: 'UNREALISTIC_WFH',
    severity: 'MEDIUM',
    deduction: 15,
    description: 'Promises 100% guaranteed income or selection without any interview process.',
    re: /\b(guaranteed|100%)\s+(income|placement|salary|selection|hiring)\b|\b(no\s+interview\s+(required|needed))\b/i,
  },
  {
    type: 'URGENT_PRESSURE',
    severity: 'LOW',
    deduction: 10,
    description: 'Employs high-pressure urgency tactics (act now, limited slots, hurry up).',
    re: /\b(act\s+now|limited\s+(slots|seats|positions)|hurry\s+up)\b/i,
  },
  {
    type: 'MISSING_COMPANY_INFO',
    severity: 'LOW',
    deduction: 10,
    description: 'No identifiable hiring company name in the posting.',
    check: (page) => !page.company || page.company.trim().length < 2 || page.company.toLowerCase() === 'unknown company',
  },
];

export function detectDeterministicSignals(pageData) {
  const text = pageData.text || '';
  const detectedSignals = [];
  const triggeredTypes = new Set();
  let totalDeductions = 0;

  for (const rule of DETECTABLE_SCAM_RULES) {
    if (triggeredTypes.has(rule.type)) continue;

    let isTriggered = false;
    if (rule.re && rule.re.test(text)) {
      isTriggered = true;
    } else if (typeof rule.check === 'function' && rule.check(pageData)) {
      isTriggered = true;
    }

    if (isTriggered) {
      triggeredTypes.add(rule.type);
      detectedSignals.push({
        type: rule.type,
        severity: rule.severity,
        deduction: rule.deduction,
        description: rule.description,
      });
      totalDeductions += rule.deduction;
    }
  }

  return {
    signals: detectedSignals,
    totalDeductions,
  };
}
