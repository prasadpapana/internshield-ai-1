// extension/src/background/company.js
import { hostFromUrl } from './helpers.js';
import { FREE_EMAIL_DOMAINS } from './constants.js';

export function analyzeCompany(page, domainResult) {
  const positives = [];
  const negatives = [];
  let score = 50;

  const linkHosts = (page.links || []).map(hostFromUrl).filter(Boolean);
  const hasLinkedIn = linkHosts.some((h) => h.endsWith('linkedin.com'));
  const named = !!page.company && page.company.length >= 2;

  if (named) {
    score += 15;
    positives.push(`Names a hiring company (\u201C${page.company}\u201D)`);
  } else {
    score -= 18;
    negatives.push('No clearly named hiring company');
  }

  if (hasLinkedIn) {
    score += 14;
    positives.push('Links to a LinkedIn company / recruiter profile');
  }

  const corpEmails = (domainResult?.domainData?.emailDomains || [])
    .filter((d) => !FREE_EMAIL_DOMAINS.includes(d));
  if (corpEmails.length > 0) {
    score += 12;
    positives.push('Has a corporate contact domain to verify against');
  }

  if (domainResult?.domainData?.hasAts) {
    score += 9;
    positives.push('Application flows through an official hiring system');
  }

  let verificationStatus = 'unverified';
  if (named && (hasLinkedIn || corpEmails.length > 0)) verificationStatus = 'partially_verified';
  if (named && hasLinkedIn && corpEmails.length > 0) verificationStatus = 'verified';

  const clamped = Math.min(100, Math.max(0, score));
  return {
    score: clamped,
    positives,
    negatives,
    company: {
      companyName: page.company || '',
      website: corpEmails[0] ? `https://${corpEmails[0]}` : '',
      linkedin: hasLinkedIn,
      foundedYear: null,
      companyAge: null,
      verificationStatus,
    },
  };
}
