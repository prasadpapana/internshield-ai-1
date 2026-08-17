// backend/services/scam-detector.js
// Server-side deterministic scam signal detector.

const SCAM_RULES = [
  {
    id: 'FEE_REQUEST',
    label: 'Asking for registration, training, onboarding, or security fee',
    weight: 25,
    re: /\b(registration|processing|training|application|onboarding|security|refundable)\s+fee\b/i,
  },
  {
    id: 'MONEY_REQUEST',
    label: 'Requests candidate to pay, deposit, or wire money',
    weight: 20,
    re: /\b(pay|send|deposit|transfer|wire)\b[^.]{0,40}\b(fee|money|amount|deposit|\$|usd|inr|rs)\b/i,
  },
  {
    id: 'SENSITIVE_INFO',
    label: 'Requests sensitive bank, OTP, password, Aadhaar, or card details',
    weight: 25,
    re: /\b(bank\s+account|routing\s+number|ifsc|otp|password|credit\s+card|debit\s+card|ssn|social\s+security|aadhaar|passport\s+number)\b/i,
  },
  {
    id: 'CRYPTO_PAYMENT',
    label: 'Requests payment via crypto, gift cards, or Western Union',
    weight: 25,
    re: /\b(bitcoin|crypto|usdt|ethereum|gift\s+card|western\s+union|moneygram)\b/i,
  },
  {
    id: 'MESSAGING_ONLY',
    label: 'Restricts communication solely to WhatsApp, Telegram, or Signal',
    weight: 18,
    re: /\b(whatsapp|telegram|signal)\b[^.]{0,30}\b(only|contact|message|text|chat)\b/i,
  },
  {
    id: 'NO_INTERVIEW_PROMISE',
    label: 'Promises guaranteed selection with no skills or interview required',
    weight: 12,
    re: /\b(no\s+(experience|interview|skills?)\s+(required|needed|necessary))\b/i,
  },
  {
    id: 'URGENCY_PRESSURE',
    label: 'Employs high-pressure urgent language (ASAP, act now, immediate placement)',
    weight: 10,
    re: /\b(urgent|immediate(ly)?|act\s+now|limited\s+(slots|seats|positions)|hurry|asap)\b/i,
  },
  {
    id: 'UNREALISTIC_EARNINGS',
    label: 'Claims unrealistic fast daily/weekly high pay',
    weight: 15,
    re: /\b(earn|make|get\s+paid)\b[^.]{0,25}\b(\$?\d{3,5})\b[^.]{0,15}\b(per\s+)?(day|week)\b/i,
  },
  {
    id: 'GUARANTEED_INCOME',
    label: 'Promises 100% guaranteed income or placement',
    weight: 15,
    re: /\b(guaranteed|100%)\s+(income|job|placement|salary|selection)\b/i,
  },
];

export function detectDeterministicSignals(pageData) {
  const text = pageData.text || '';
  const detected = [];
  let scoreDeduction = 0;

  for (const rule of SCAM_RULES) {
    if (rule.re.test(text)) {
      detected.push({
        id: rule.id,
        label: rule.label,
        weight: rule.weight,
      });
      scoreDeduction += rule.weight;
    }
  }

  // Recruiter contact checks
  const emails = pageData.emails || [];
  const freeDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'ymail.com'];
  const hasFreeEmail = emails.some((e) => freeDomains.some((d) => e.toLowerCase().endsWith(d)));
  if (hasFreeEmail) {
    detected.push({
      id: 'FREE_EMAIL_RECRUITER',
      label: 'Recruiter relies on personal/free email domain (Gmail/Yahoo/Outlook)',
      weight: 12,
    });
    scoreDeduction += 12;
  }

  // Missing company name check
  if (!pageData.company || pageData.company.trim().length < 2) {
    detected.push({
      id: 'MISSING_COMPANY_NAME',
      label: 'Hiring company name is missing or hidden',
      weight: 15,
    });
    scoreDeduction += 15;
  }

  return {
    signals: detected,
    scoreDeduction: Math.min(80, scoreDeduction),
  };
}
