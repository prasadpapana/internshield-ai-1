// src/services/domain.js
// Domain reputation sub-analysis. Runs fully offline using structural signals:
// whether the posting lives on / links to a real corporate or ATS domain,
// whether recruiter emails use free providers, suspicious TLDs, and http vs
// https. No external WHOIS call is required, which keeps the tool private and
// usable with zero network access. An optional backend (services/api.js) can
// enrich this with real registration age when configured.

import {
  FREE_EMAIL_DOMAINS, SUSPICIOUS_TLDS, ATS_DOMAINS,
} from '../utils/constants.js';
import { hostFromUrl, tldOf } from '../utils/helpers.js';

/**
 * @param {object} page sanitized page data
 * @returns {{score:number, positives:string[], negatives:string[], domainData:object}}
 */
export function analyzeDomain(page) {
  const positives = [];
  const negatives = [];
  let score = 60; // neutral-ish baseline

  const pageHost = hostFromUrl(page.url);
  const pageTld = tldOf(pageHost);

  // HTTPS check on the posting itself.
  if (page.url.startsWith('https://')) {
    score += 5;
  } else if (page.url.startsWith('http://')) {
    score -= 15;
    negatives.push('Posting is served over insecure HTTP');
  }

  // Suspicious TLD on the host.
  if (pageTld && SUSPICIOUS_TLDS.includes(pageTld)) {
    score -= 18;
    negatives.push(`Hosted on a frequently-abused .${pageTld} domain`);
  }

  // Links to a recognized ATS / job platform = real hiring pipeline.
  const linkHosts = (page.links || []).map(hostFromUrl).filter(Boolean);
  const hasAts = linkHosts.some((h) => ATS_DOMAINS.some((a) => h === a || h.endsWith(`.${a}`)))
    || ATS_DOMAINS.some((a) => pageHost === a || pageHost.endsWith(`.${a}`));
  if (hasAts) {
    score += 20;
    positives.push('Uses a recognized applicant tracking system');
  }

  // Recruiter email analysis.
  const emailDomains = (page.emails || [])
    .map((e) => (e.split('@')[1] || '').toLowerCase())
    .filter(Boolean);
  const freeEmails = emailDomains.filter((d) => FREE_EMAIL_DOMAINS.includes(d));
  const corpEmails = emailDomains.filter((d) => !FREE_EMAIL_DOMAINS.includes(d));

  if (emailDomains.length > 0) {
    if (corpEmails.length > 0) {
      score += 12;
      positives.push('Contact uses a company email domain');
    }
    if (freeEmails.length > 0 && corpEmails.length === 0) {
      score -= 16;
      negatives.push('Recruiter contact is a free email account (Gmail/Yahoo/etc.)');
    }
    // Email domain matching the page or a linked company site is a strong sign.
    const matchesSite = corpEmails.some(
      (d) => d === pageHost || linkHosts.includes(d),
    );
    if (matchesSite) {
      score += 8;
      positives.push('Recruiter email matches the company website');
    }
  }

  // Suspicious-TLD email domains.
  const badTldEmail = emailDomains.some((d) => SUSPICIOUS_TLDS.includes(tldOf(d)));
  if (badTldEmail) {
    score -= 10;
    negatives.push('A contact email uses a high-risk domain extension');
  }

  const clamped = Math.min(100, Math.max(0, score));
  return {
    score: clamped,
    positives,
    negatives,
    domainData: {
      pageHost,
      pageTld,
      https: page.url.startsWith('https://'),
      hasAts,
      emailDomains,
      freeEmailCount: freeEmails.length,
      corpEmailCount: corpEmails.length,
    },
  };
}
