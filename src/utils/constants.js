// src/utils/constants.js
// Single source of truth for keys, scoring weights, thresholds, and the
// heuristic signal dictionaries used by the AI engine. Keeping these here
// means tuning the model never requires touching engine logic.

export const APP = Object.freeze({
  NAME: 'DraftJobs',
  VERSION: '1.0.0',
});

// chrome.storage.local keys. Namespaced to avoid collisions with other tools.
export const STORAGE_KEYS = Object.freeze({
  SETTINGS: 'is_settings',
  HISTORY: 'is_history',
  REPORTS: 'is_reports',
  RATE: 'is_rate',
});

export const LIMITS = Object.freeze({
  HISTORY_MAX: 200,        // cap stored scans so storage never grows unbounded
  REPORTS_MAX: 100,
  SCAN_MIN_INTERVAL_MS: 1500, // client-side rate limit between scans
  PAGE_TEXT_MAX: 60000,    // truncate scraped page text before analysis
});

// Weighted scoring model. Must sum to 1.0.
export const WEIGHTS = Object.freeze({
  company: 0.30,   // Company verification
  domain: 0.25,    // Domain reputation
  content: 0.25,   // Job content analysis
  recruiter: 0.20, // Recruiter verification
});

// Trust score -> risk band thresholds (inclusive lower bounds).
export const RISK_BANDS = Object.freeze([
  { min: 80, level: 'safe', label: 'Looks legitimate' },
  { min: 60, level: 'low', label: 'Probably fine' },
  { min: 40, level: 'medium', label: 'Be cautious' },
  { min: 20, level: 'high', label: 'High risk' },
  { min: 0, level: 'critical', label: 'Likely scam' },
]);

// Free / personal email providers. A recruiter using these for a "corporate"
// role is a classic scam signal.
export const FREE_EMAIL_DOMAINS = Object.freeze([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com',
  'hotmail.com', 'live.com', 'aol.com', 'icloud.com', 'mail.com',
  'protonmail.com', 'gmx.com', 'yandex.com', 'rediffmail.com', 'zoho.com',
]);

// TLDs disproportionately abused by scam campaigns (cheap / bulk-registered).
export const SUSPICIOUS_TLDS = Object.freeze([
  'xyz', 'top', 'club', 'online', 'site', 'website', 'click', 'link',
  'work', 'gq', 'cf', 'ml', 'ga', 'tk', 'buzz', 'live', 'shop', 'icu',
]);

// Domains belonging to legitimate applicant tracking systems / job boards.
// Their presence is a mild positive signal (real hiring pipelines).
export const ATS_DOMAINS = Object.freeze([
  'greenhouse.io', 'lever.co', 'workday.com', 'myworkdayjobs.com',
  'ashbyhq.com', 'jobvite.com', 'icims.com', 'smartrecruiters.com',
  'taleo.net', 'bamboohr.com', 'breezy.hr', 'workable.com',
  'linkedin.com', 'indeed.com', 'glassdoor.com', 'naukri.com', 'internshala.com',
]);

// Heuristic phrase lists. Each entry: { re: RegExp, weight, label }.
// weight is how many "points" of scam evidence the hit contributes before
// normalization. Higher = stronger signal.
export const SCAM_PATTERNS = Object.freeze([
  { re: /\b(registration|processing|training|application|onboarding|security|refundable)\s+fee\b/i, weight: 5, label: 'Mentions an upfront fee' },
  { re: /\b(pay|send|deposit|transfer|wire)\b[^.]{0,40}\b(fee|money|amount|deposit|\$|usd|inr|rs)\b/i, weight: 4, label: 'Asks you to send money' },
  { re: /\b(bank\s+account|routing\s+number|ifsc|credit\s+card|debit\s+card|ssn|social\s+security|aadhaar|passport\s+number)\b/i, weight: 5, label: 'Requests sensitive financial / ID details' },
  { re: /\b(bitcoin|crypto|usdt|ethereum|gift\s+card|western\s+union|moneygram)\b/i, weight: 5, label: 'Mentions crypto / gift cards / wire services' },
  { re: /\b(whatsapp|telegram|signal)\b[^.]{0,30}\b(only|contact|message|text|chat)\b/i, weight: 4, label: 'Pushes contact to WhatsApp / Telegram only' },
  { re: /\b(no\s+(experience|interview|skills?)\s+(required|needed|necessary))\b/i, weight: 2, label: 'Promises no experience / no interview' },
  { re: /\b(urgent|immediate(ly)?|act\s+now|limited\s+(slots|seats|positions)|hurry|asap)\b/i, weight: 2, label: 'Uses urgency / pressure language' },
  { re: /\b(earn|make|get\s+paid)\b[^.]{0,25}\b(\$?\d{3,5})\b[^.]{0,15}\b(per\s+)?(day|week)\b/i, weight: 3, label: 'Advertises unrealistic fast pay' },
  { re: /\b(work\s+from\s+home|remote)\b[^.]{0,25}\b(earn|easy|guaranteed|flexible\s+hours)\b/i, weight: 2, label: 'Generic "easy work-from-home money" framing' },
  { re: /\b(guaranteed|100%)\s+(income|job|placement|salary|selection)\b/i, weight: 3, label: 'Guarantees income / placement' },
  { re: /\b(google|microsoft|amazon|meta|apple)\b[^.]{0,15}\b(hiring|recruiter|hr)\b/i, weight: 2, label: 'Name-drops a big brand with informal contact' },
]);

// Phrases that indicate a real, structured posting (mild trust signals).
export const TRUST_PATTERNS = Object.freeze([
  { re: /\b(responsibilities|what\s+you'?ll\s+do|key\s+duties)\b/i, weight: 2, label: 'Has a real responsibilities section' },
  { re: /\b(qualifications|requirements|what\s+we'?re\s+looking\s+for)\b/i, weight: 2, label: 'Lists qualifications / requirements' },
  { re: /\b(equal\s+opportunity|eeo|reasonable\s+accommodation)\b/i, weight: 2, label: 'Includes EEO / accommodation statement' },
  { re: /\b(benefits|stipend|compensation\s+range|salary\s+range)\b/i, weight: 1, label: 'States structured compensation / benefits' },
  { re: /\b(apply\s+(via|through|on)|application\s+portal|careers\s+page)\b/i, weight: 1, label: 'Routes you through a formal application' },
]);

export const RECOMMENDATION = Object.freeze({
  safe: 'This posting looks legitimate. Still verify the company on its official website and LinkedIn before sharing personal details.',
  low: 'Mostly fine, but double-check the recruiter\u2019s email domain and the company\u2019s official careers page before applying.',
  medium: 'Treat this with caution. Verify the company independently, and never pay a fee or share bank details to get hired.',
  high: 'High risk. Several scam signals are present. Do not pay anything, share IDs, or move the conversation to WhatsApp/Telegram.',
  critical: 'This looks like a scam. Do not apply, pay, or share any personal or financial information. Consider reporting it.',
});
