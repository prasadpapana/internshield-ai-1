# VeriHire AI — Architecture

This document covers the planning and design phases behind the extension:
product analysis, system architecture, the scoring model, data models, the
security model, and the build roadmap. The code in `src/` implements it.

---

## 1. Product analysis

**Core problem.** Students and early-career job seekers are the prime targets
of "internship" and entry-job scams: fake recruiters, fee-for-hire schemes,
data-harvesting "applications," and pressure to move onto WhatsApp/Telegram.
The warning signs are knowable, but inexperienced applicants don't recognize
them in the moment.

**Target users.** Students, new grads, and career-switchers browsing job
boards, LinkedIn posts, company pages, and links shared on messaging apps.

**Pain points.** Can't tell a real posting from a fake one; don't know which
red flags matter; feel time pressure; embarrassed to ask; no easy second
opinion at the moment of decision.

**User journey.** Find posting → uncertain → open VeriHire → one click scan
→ get a trust score, the specific reasons, and a plain recommendation → decide
→ optionally save/report it.

**MVP features.** One-click on-device scan; explainable trust score + risk
level; positive/negative signal lists; recommendation; encrypted local history;
local scam reporting; settings (theme, auto-scan, notifications, privacy mode).

**Future features.** Resume analyzer, AI career coach, shared scam database,
user accounts, premium plans, multi-language, in-popup AI chat assistant. The
folder layout (feature folders + a `services/` layer) is built so each of these
slots in without reworking existing modules.

**Technical risks.** Page structures vary wildly (mitigated: JSON-LD first,
then selector and meta fallbacks, then raw text). MV3 service-worker lifecycle
(mitigated: stateless handlers, storage as source of truth). False
positives/negatives (mitigated: explainable weighted model that users can
sanity-check; tunable in `constants.js`).

**Legal & privacy risks.** Scanning page content is sensitive. Mitigations:
analysis is on-device by default, no network calls unless a backend is
explicitly configured; `activeTab`/on-demand injection instead of broad data
collection; privacy mode drops raw text from storage; history encrypted at
rest. We label, never accuse — "looks like a scam," with reasons.

**AI limitations.** This is a transparent heuristic engine, not a classifier
that "knows" a company is real. It can be fooled by a polished scam or
mis-flag an unusual-but-legit posting. The UI states a confidence score and the
recommendation always tells users to verify independently.

**Monetization.** Free core. Premium tier could add backend sync, the shared
scam database, resume analysis, and the AI coach.

---

## 2. System architecture

```
┌──────────────┐      ┌───────────────────────────┐      ┌─────────────┐
│   Popup UI   │◀────▶│   Background service       │◀────▶│  Content    │
│ history/     │ msg  │   worker (router +         │ msg  │  script     │
│ settings UI  │      │   orchestration)           │      │ (page read) │
└──────────────┘      └───────────┬───────────────┘      └─────────────┘
                                  │ imports
              ┌───────────────────┼─────────────────────────┐
              ▼                   ▼                          ▼
        services/ai.js      services/storage.js        services/api.js
        (engine)            (encrypted chrome.storage)  (optional backend)
              │                                              │
   domain.js / company.js                          Google Apps Script
                                                   (scan/history/report/company)
```

**Communication.** UI surfaces never run analysis or touch storage directly.
They send typed runtime messages to the background worker, which validates the
message, orchestrates the work via the `services/` layer, and replies. The
content script is read-only and only responds to an explicit `EXTRACT_PAGE`
request.

**Data flow (a scan).** Popup `SCAN_PAGE` → background gets active tab →
`EXTRACT_PAGE` to content script → raw page data → `sanitizePageData` →
`scoreJob` (company + domain + content + recruiter) → optional backend enrich →
`storage.addScan` (encrypted) → optional notification → reply to popup → render.

**Extension lifecycle.** `onInstalled` writes sanitized default settings. The
worker is event-driven and may sleep; every handler reads what it needs from
storage, so no in-memory state is required to be correct (the only in-memory
values — last-scan time, auto-scan dedupe — are best-effort).

---

## 3. Tech stack & rationale

Manifest V3 (required by the Chrome Web Store), vanilla JS with ES modules, and
plain HTML/CSS. No framework or build step: the surface area is small, the
review story is simpler, the bundle is tiny, and there's nothing to keep
patched. WebCrypto (AES-GCM) is built in, so encryption needs no dependency.
Chrome APIs used: `storage`, `activeTab`, `scripting`, `notifications`. The
content script is dependency-free so it never needs bundling to run in-page.

---

## 4. Folder structure

Feature folders (`popup`, `history`, `settings`) own their own HTML/CSS/JS; a
shared `services/` layer holds engine, storage, and backend logic; `utils/`
holds pure helpers, validators, and the tunable `constants.js`. New features
(resume analyzer, AI coach, chat) become new feature folders that reuse the
same services, so the core never has to change to grow.

---

## 5. Data models

```
Settings   { theme, language, autoScan, notifications, privacyMode, backendUrl }
ScanResult { id, date, url, company, jobTitle, trustScore, scamProbability,
             riskLevel, riskLabel, confidence, summary, positives[], negatives[],
             recommendation, breakdown{company,domain,content,recruiter},
             companyData, domainData, rawText?, source }
Company    { companyName, website, linkedin, foundedYear, companyAge,
             verificationStatus }
ScamReport { id, scanId, reason, reportedAt }
```

`rawText` is present only when privacy mode is off. `foundedYear`/`companyAge`
stay null unless a backend enriches them.

---

## 6. Security model

- **CSP.** `script-src 'self'` only; no inline or remote scripts. `connect-src`
  limited to the Apps Script domains, so the extension can't be repurposed to
  exfiltrate to an arbitrary host.
- **Permission minimization.** No broad host permissions. `activeTab` +
  on-demand `scripting` injection means the extension reads a page only when the
  user acts on the tab they're already viewing.
- **Input sanitization.** Everything crossing a trust boundary
  (page→worker, storage→UI, backend→client) runs through `validators.js`:
  bounded lengths, allow-listed enums, typed shapes.
- **XSS prevention.** The UI builds DOM with `textContent`/`createElement`.
  No `innerHTML` is ever used with page-derived or stored data.
- **Storage encryption.** History and reports are AES-GCM encrypted at rest
  (see the honest threat-model note in `storage.js`). Privacy mode additionally
  keeps raw page text out of storage entirely.
- **Safe messaging.** Only known message types are accepted; unknown ones are
  rejected before any work happens.
- **Rate limiting.** A minimum interval between scans guards against runaway
  loops and accidental backend hammering.
- **Error handling.** Backend calls time out and bound response size; failures
  degrade to the local result rather than breaking the scan.

---

## 7. AI scoring engine

Four sub-scores (0–100), each fully explainable, combined by weight:

```
TrustScore = 0.30·company + 0.25·domain + 0.25·content + 0.20·recruiter
```

- **Company (30%)** — named employer, LinkedIn presence, corporate contact
  domain, official application system → `verificationStatus`.
- **Domain (25%)** — HTTPS, TLD reputation, free vs corporate email, ATS
  domains, email-matches-site.
- **Content (25%)** — scam-pattern matches (fees, money requests, sensitive-data
  asks, crypto/gift cards, urgency, unrealistic pay) vs structure signals
  (responsibilities, qualifications, EEO, real apply flow), plus writing-quality
  heuristics.
- **Recruiter (20%)** — corporate vs personal email, messaging-app funneling,
  named contact, LinkedIn profile.

**Scam probability** is driven mainly by matched scam-pattern weight (so a
money request flags even when structure looks fine), blended 70/30 with the
trust gap. **Risk level** is banded off the trust score
(safe ≥80, low ≥60, medium ≥40, high ≥20, else critical). **Confidence**
reflects how much evidence was available. All weights, thresholds, and signal
dictionaries live in `constants.js` for tuning without touching engine logic.

---

## 8. UI/UX

Theme: trustworthy, AI-powered, student-focused. Signature element: a circular
trust gauge that sweeps to the score on reveal, tinted by the risk color
(emerald → red). States are explicit — idle, loading (stepped status), result,
error, plus empty states in history. Light/dark/system themes, visible keyboard
focus, and reduced-motion support throughout.

---

## 9. API architecture

See `api.md` for the optional Google Apps Script contract
(`/scan`, `/history`, `/report`, `/company`, `/settings`).

---

## 10. Roadmap

1. Core extension shell → 2. Page extraction → 3. Scoring engine →
4. Backend integration (optional) → 5. History → 6. Reporting →
7. Settings → 8. Polish → 9. Testing → 10. Web Store deployment
(see `deployment.md`).
