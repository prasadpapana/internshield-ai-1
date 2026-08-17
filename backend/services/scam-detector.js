// backend/services/scam-detector.js
// Server-side deterministic scam signal detector with accurate, non-duplicating signal deductions.

export const DETECTABLE_SCAM_RULES = [
  {
    type: 'OTP_PASSWORD_REQUEST',
    severity: 'CRITICAL',
    deduction: 40,
    description: 'Requests candidate for OTP, password, or account login credentials.',
    re: /\b(otp|one\s*time\s*password|login\s*password|account\s*password|verification\s*code)\b/i,
  },
  {
    type: 'BANK_DETAILS_REQUEST',
    severity: 'CRITICAL',
    deduction: 35,
    description: 'Requests bank account number, routing number, IFSC, or card details.',
    re: /\b(bank\s+account|routing\s+number|ifsc|credit\s+card|debit\s+card|cvv|bank\s+details)\b/i,
  },
  {
    type: 'PAYMENT_FEE_REQUEST',
    severity: 'HIGH',
    deduction: 30,
    description: 'Asks applicant to pay a registration fee, processing charge, training cost, or security deposit.',
    re: /\b(registration|processing|training|application|onboarding|security|refundable)\s+(fee|cost|charge|amount|deposit)\b|\b(pay|send|deposit|transfer|wire)\b[^.]{0,35}\b(fee|money|amount|\$|usd|inr|rs)\b/i,
  },
  {
    type: 'IDENTITY_DOC_REQUEST',
    severity: 'HIGH',
    deduction: 25,
    description: 'Requests sensitive personal identity documents (Aadhaar, SSN, Passport) prior to hiring.',
    re: /\b(ssn|social\s+security\s+number|aadhaar|passport\s+number|national\s+id)\b/i,
  },
  {
    type: 'SUSPICIOUS_SOFTWARE',
    severity: 'HIGH',
    deduction: 25,
    description: 'Instructs applicant to download or install external files, unknown software, or APKs.',
    re: /\b(download|install|run)\b[^.]{0,35}\b(software|app|apk|file|installer|exe|anydesk|teamviewer)\b/i,
  },
  {
    type: 'CRYPTO_PAYMENT',
    severity: 'HIGH',
    deduction: 25,
    description: 'Mentions payments or fees via Cryptocurrency, USDT, gift cards, or Western Union.',
    re: /\b(bitcoin|crypto|usdt|ethereum|gift\s+card|western\s+union|moneygram)\b/i,
  },
  {
    type: 'SUSPICIOUS_DOMAIN',
    severity: 'MEDIUM',
    deduction: 20,
    description: 'Job posting is served over insecure HTTP or hosted on a high-risk domain extension.',
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
    description: 'Recruiter relies on a free email domain (Gmail, Yahoo, Outlook) instead of an official company email.',
    check: (page) => {
      const emails = page.emails || [];
      const freeDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'ymail.com', 'aol.com'];
      return emails.some((e) => freeDomains.some((d) => e.toLowerCase().endsWith(d)));
    },
  },
  {
    type: 'MESSAGING_ONLY',
    severity: 'MEDIUM',
    deduction: 15,
    description: 'Recruiter restricts communication to messaging apps (Telegram, WhatsApp, Signal).',
    re: /\b(whatsapp|telegram|signal)\b|\b(contact|reach|message|text|chat)\b[^.]{0,40}\b(whatsapp|telegram|signal)\b/i,
  },
  {
    type: 'UNREALISTIC_SALARY',
    severity: 'MEDIUM',
    deduction: 15,
    description: 'Advertises unrealistic fast earnings claims (e.g. $500/day, fast daily cash).',
    re: /\b(earn|make|get\s+paid)\b[^.]{0,25}\b(\$?\d{3,5})\b[^.]{0,15}\b(per\s+)?(day|daily|hour)\b/i,
  },
  {
    type: 'UNREALISTIC_WFH',
    severity: 'MEDIUM',
    deduction: 15,
    description: 'Promises 100% guaranteed income, no interview needed, or easy work-from-home money.',
    re: /\b(guaranteed|100%)\s+(income|job|placement|salary|selection)|\b(no\s+(interview|experience|skills?)\s+(required|needed|necessary))\b/i,
  },
  {
    type: 'URGENT_PRESSURE',
    severity: 'LOW',
    deduction: 10,
    description: 'Employs urgent high-pressure tactics (ASAP, act now, limited slots, immediate hiring).',
    re: /\b(urgent|immediate(ly)?|act\s+now|limited\s+(slots|seats|positions)|hurry|asap)\b/i,
  },
  {
    type: 'MISSING_COMPANY_INFO',
    severity: 'LOW',
    deduction: 10,
    description: 'Hiring company name is missing, hidden, or unverified.',
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
