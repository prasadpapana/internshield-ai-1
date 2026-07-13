// src/content/content.js
// Runs in the page context. Its only job is to extract a structured snapshot
// of the current page when the background worker asks. It is intentionally
// self-contained (no imports/bundler) and read-only: it never modifies the
// page and never sends data anywhere on its own. Extraction happens on demand.

(function () {
  'use strict';

  const MAX_TEXT = 60000;
  const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  function text(el) {
    return (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
  }

  function firstMatch(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        const t = text(el);
        if (t) return t;
      } catch {
        /* invalid selector, skip */
      }
    }
    return '';
  }

  function metaContent(names) {
    for (const name of names) {
      const el = document.querySelector(
        `meta[property="${name}"], meta[name="${name}"]`,
      );
      if (el && el.content && el.content.trim()) return el.content.trim();
    }
    return '';
  }

  // Try JSON-LD JobPosting structured data first (most reliable).
  function fromJsonLd() {
    const out = { company: '', jobTitle: '' };
    const blocks = document.querySelectorAll('script[type="application/ld+json"]');
    for (const block of blocks) {
      try {
        const parsed = JSON.parse(block.textContent);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          const type = item['@type'];
          const isJob = type === 'JobPosting'
            || (Array.isArray(type) && type.includes('JobPosting'));
          if (isJob) {
            if (!out.jobTitle && item.title) out.jobTitle = String(item.title);
            const org = item.hiringOrganization;
            if (!out.company && org) {
              out.company = String(typeof org === 'object' ? org.name || '' : org);
            }
          }
        }
      } catch {
        /* malformed JSON-LD, ignore */
      }
    }
    return out;
  }

  function extract() {
    const ld = fromJsonLd();

    const jobTitle = ld.jobTitle || firstMatch([
      '[data-testid="jobsearch-JobInfoHeader-title"]',
      '.profile', '[class*="profile"]',
      'h1.job-title', 'h1.jobtitle', 'h1[class*="title"]',
      'h1',
    ]) || metaContent(['og:title']) || document.title;

    const company = ld.company || firstMatch([
      '[data-testid="inlineHeader-companyName"]',
      '.company_name', '[class*="company_name"]',
      '[class*="company-name"]', '[class*="companyName"]',
      '[itemprop="hiringOrganization"]', 'a[href*="/company/"]',
    ]) || metaContent(['og:site_name']);

    const bodyText = (document.body ? document.body.innerText || '' : '').slice(0, MAX_TEXT);

    const emails = Array.from(new Set((bodyText.match(EMAIL_RE) || []))).slice(0, 10);

    const links = Array.from(document.querySelectorAll('a[href]'))
      .map((a) => a.href)
      .filter((h) => /^https?:/i.test(h))
      .slice(0, 60);

    return {
      url: location.href,
      title: document.title || '',
      company: company || '',
      jobTitle: jobTitle || '',
      emails,
      links,
      text: bodyText,
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'EXTRACT_PAGE') {
      try {
        sendResponse({ type: 'PAGE_DATA', payload: extract() });
      } catch (err) {
        sendResponse({ type: 'PAGE_DATA', error: String(err && err.message || err) });
      }
    }
    // Synchronous response; no need to return true.
  });
})();
