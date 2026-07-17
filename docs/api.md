# InternShield AI — Backend API Contract

> **The backend is optional.** InternShield AI runs entirely on-device. Every
> scan, score, and history entry works with zero network access. A backend adds
> three things and nothing else:
>
> 1. **Cross-device history sync** — scans pushed from any browser appear everywhere.
> 2. **Shared scam database** — community reports aggregate into a signal others benefit from.
> 3. **Authoritative company enrichment** — real registration age, verified domains, etc., which the local engine cannot know.
>
> If no backend URL is set in Settings, the client never makes a network call,
> and all of the above silently no-op. Nothing breaks.

---

## 1. Transport

Google Apps Script Web Apps expose exactly one HTTP entry point per deployment
(`doGet` / `doPost` at a single `/exec` URL). They cannot serve REST-style paths
like `/scan` or `/history`. InternShield therefore uses a **single POST endpoint
with an action envelope**. The five logical endpoints in the architecture brief
(`/scan`, `/history`, `/report`, `/company`, `/settings`) are expressed as
`action` values, documented below.

```
POST  https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
Content-Type: application/json
```

### Request envelope

```json
{
  "action": "scan | history | report | company | settings",
  "payload": { /* action-specific, see below */ }
}
```

### Response envelope

Every response — success or failure — is a JSON object with an `ok` boolean.
The client (`src/services/api.js`) rejects any response where `ok !== true`,
where the body exceeds **256 KB**, or where the request exceeds an **8-second**
timeout.

```jsonc
// success
{ "ok": true, "data": { /* action-specific */ } }

// failure
{ "ok": false, "error": "human-readable reason" }
```

### Error schema

| Field   | Type    | Notes                                              |
|---------|---------|----------------------------------------------------|
| `ok`    | boolean | Always `false` for errors.                         |
| `error` | string  | Safe to surface; never echo raw input or stack.    |
| `code`  | string? | Optional machine code (`RATE_LIMIT`, `BAD_INPUT`). |

The client treats **any** thrown error, non-200 status, oversized body, malformed
JSON, or `ok:false` identically: it swallows the failure and the local result
stands. Callers never see a backend error surfaced as a broken scan.

---

## 2. Actions

### 2.1 `action: "company"` — Company enrichment (logical `POST /company`)

Called by `enrichScan()` after a local scan, to upgrade `companyData` with
authoritative facts the device cannot derive.

**Request payload**

```json
{
  "companyName": "Acme Robotics Inc.",
  "domain": "boards.greenhouse.io"
}
```

| Field         | Type   | Required | Validation                                  |
|---------------|--------|----------|---------------------------------------------|
| `companyName` | string | yes      | 1–200 chars, trimmed.                       |
| `domain`      | string | no       | ≤253 chars, hostname shape if present.      |

**Response `data`** — merged into the scan's `companyData`:

```json
{
  "companyName": "Acme Robotics Inc.",
  "website": "https://acme.example",
  "linkedin": "https://www.linkedin.com/company/acme-robotics",
  "foundedYear": 2014,
  "companyAge": 12,
  "verificationStatus": "verified"
}
```

| Field                | Type            | Notes                                                        |
|----------------------|-----------------|--------------------------------------------------------------|
| `foundedYear`        | number \| null  | Four-digit year, or `null` if unknown.                       |
| `companyAge`         | number \| null  | Years; backend may compute from `foundedYear`.               |
| `verificationStatus` | enum            | `unverified` \| `partially_verified` \| `verified`.          |

If the backend cannot identify the company it returns
`{ "ok": true, "data": {} }`. The client keeps its local `companyData` unchanged.

---

### 2.2 `action: "scan"` — Push scan to history (logical `POST /scan`)

Called by `syncScan()` best-effort after every successful local scan when a
backend is configured. The payload is the full **ScanResult** object (see
`docs/architecture.md` §Data Models). When `privacyMode` is on, `rawText` is
already omitted by the engine before this point.

**Request payload** — `ScanResult`:

```json
{
  "id": "k3f9...",
  "date": "2026-06-25T18:30:00.000Z",
  "url": "https://example.com/jobs/intern",
  "company": "Acme Robotics Inc.",
  "jobTitle": "Software Engineering Intern",
  "trustScore": 91,
  "scamProbability": 3,
  "riskLevel": "safe",
  "riskLabel": "Safe",
  "confidence": 0.86,
  "summary": "…",
  "positives": ["…"],
  "negatives": [],
  "recommendation": "…",
  "breakdown": { "company": 27, "domain": 24, "content": 23, "recruiter": 17 },
  "companyData": { "…": "…" },
  "domainData": { "…": "…" },
  "source": "local"
}
```

**Validation rules (server side)**

- `id`: required, string, ≤64 chars. Used as the idempotency key — re-pushing the same `id` updates, never duplicates.
- `trustScore`, `scamProbability`: integers 0–100.
- `confidence`: number 0–1.
- `riskLevel`: enum `safe|low|medium|high|critical`.
- `breakdown.*`: numbers 0–100; reject if missing.
- Reject any payload > 64 KB.

**Response `data`**

```json
{ "stored": true, "id": "k3f9..." }
```

---

### 2.3 `action: "history"` — Fetch synced history (logical `GET /history`)

Returns scans previously pushed via `action:"scan"`, newest first. (Not wired
into the current UI by default — the UI reads local encrypted history — but the
contract is defined so a future "Sync now" button can adopt it without a
protocol change.)

**Request payload**

```json
{ "limit": 100, "before": "2026-06-25T00:00:00.000Z" }
```

| Field    | Type   | Required | Validation                          |
|----------|--------|----------|-------------------------------------|
| `limit`  | number | no       | 1–500, default 100.                 |
| `before` | string | no       | ISO date; cursor for pagination.    |

**Response `data`**

```json
{
  "items": [ /* ScanResult[] */ ],
  "nextCursor": "2026-06-20T11:02:00.000Z"
}
```

`nextCursor` is `null` when no more pages remain.

---

### 2.4 `action: "report"` — Submit scam report (logical `POST /report`)

Called by `submitReport()` when the user reports a posting from the popup modal.
Feeds the shared scam database.

**Request payload** — `ScamReport`:

```json
{
  "id": "r7a2...",
  "scanId": "k3f9...",
  "reason": "Asked for a $200 onboarding fee via gift card.",
  "reportedAt": "2026-06-25T18:45:00.000Z"
}
```

| Field        | Type   | Required | Validation                                       |
|--------------|--------|----------|--------------------------------------------------|
| `id`         | string | yes      | ≤64 chars; idempotency key.                      |
| `scanId`     | string | yes      | ≤64 chars; ties report to a scan.                |
| `reason`     | string | yes      | 1–1000 chars; server must strip HTML/escape.     |
| `reportedAt` | string | yes      | ISO 8601 timestamp.                              |

**Response `data`**

```json
{ "received": true, "id": "r7a2..." }
```

The server must rate-limit reports per deployment/IP and reject `reason` values
containing markup. The client already sanitizes via `sanitizeReportReason()`, but
the backend must not trust the client.

---

### 2.5 `action: "settings"` — Sync settings (logical `POST /settings`)

Optional. Allows a future signed-in experience to persist non-sensitive
preferences server-side. **Never** send `backendUrl` or any secret here.

**Request payload**

```json
{
  "theme": "system",
  "language": "en",
  "autoScan": true,
  "notifications": true,
  "privacyMode": false
}
```

All fields validated against the same enums/booleans as
`sanitizeSettings()` in `src/utils/validators.js`. Unknown keys are dropped.

**Response `data`**

```json
{ "saved": true }
```

---

## 3. Reference server (Google Apps Script)

A minimal, dependency-free `Code.gs` that satisfies the contract. Deploy as a Web
App ("Execute as: Me", "Who has access: Anyone"). Paste the resulting `/exec` URL
into **Settings → Backend URL**.

```javascript
// Code.gs — InternShield AI reference backend (optional)
const SHEET_ID = 'PUT_A_SPREADSHEET_ID_HERE'; // tabs: scans, reports

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = String(body.action || '');
    const payload = body.payload || {};
    const data = route(action, payload);
    return json({ ok: true, data });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return json({ ok: true, data: { service: 'InternShield AI', status: 'up' } });
}

function route(action, p) {
  switch (action) {
    case 'company':  return enrichCompany(p);
    case 'scan':     return storeScan(p);
    case 'history':  return listScans(p);
    case 'report':   return storeReport(p);
    case 'settings': return { saved: true }; // stub: wire to user store if desired
    default: throw new Error('Unknown action: ' + action);
  }
}

function enrichCompany(p) {
  const name = String(p.companyName || '').trim().slice(0, 200);
  if (!name) throw new Error('companyName required');
  // Plug a real data source here. Empty object = "no info", client keeps local.
  return {};
}

function storeScan(s) {
  if (!s || !s.id) throw new Error('scan.id required');
  const sh = sheet('scans');
  upsertById(sh, s.id, [s.id, s.date, s.company, s.trustScore, s.scamProbability, s.riskLevel]);
  return { stored: true, id: s.id };
}

function listScans(p) {
  const limit = Math.min(Math.max(parseInt(p.limit, 10) || 100, 1), 500);
  const rows = sheet('scans').getDataRange().getValues().slice(1).reverse().slice(0, limit);
  return { items: rows, nextCursor: null };
}

function storeReport(r) {
  if (!r || !r.id || !r.scanId) throw new Error('report id/scanId required');
  const reason = String(r.reason || '').replace(/<[^>]*>/g, '').slice(0, 1000);
  upsertById(sheet('reports'), r.id, [r.id, r.scanId, reason, r.reportedAt]);
  return { received: true, id: r.id };
}

// --- helpers ---
function sheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
function upsertById(sh, id, row) {
  const ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues().flat();
  const idx = ids.indexOf(id);
  if (idx > 0) sh.getRange(idx + 1, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}
function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### CSP note

`manifest.json` restricts `connect-src` to `https://script.google.com` and
`https://script.googleusercontent.com` (Apps Script redirects `/exec` calls to
the latter). If you self-host a different backend, you must add its origin to
`connect-src` or the browser will block the request.

---

## 4. Security expectations for any backend

- **Validate everything.** The client sanitizes, but the server must independently enforce types, lengths, and enums. Treat all input as hostile.
- **No secrets in the client.** The extension ships no API keys. If your backend needs auth, use a per-user token entered in Settings, transmitted only to your origin.
- **Rate limit.** Enforce per-deployment limits on `scan` and `report`.
- **Escape on store and on render.** Strip markup from free-text (`reason`) before persisting.
- **Size caps.** Reject oversized bodies; the client already caps responses at 256 KB.
- **No PII beyond what the user submits.** Don't log full `rawText`; honor that `privacyMode` already strips it client-side.
