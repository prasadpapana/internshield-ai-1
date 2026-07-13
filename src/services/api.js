// src/services/api.js
// Thin client for an OPTIONAL Google Apps Script backend. The extension is
// fully functional with no backend: every method degrades gracefully and the
// caller falls back to the local engine. A backend is only useful for
// cross-device history sync, a shared scam database, and authoritative company
// enrichment (real registration age, etc.).
//
// Security: requests time out, responses are size-bounded and JSON-validated,
// and the backend URL is user-configured in Settings (never hardcoded). The
// CSP connect-src in manifest.json restricts where the extension may connect.

const TIMEOUT_MS = 8000;
const MAX_BYTES = 256 * 1024;

async function request(baseUrl, action, payload) {
  if (!baseUrl) throw new Error('No backend configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`Backend responded ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('Response too large');
    const json = JSON.parse(text);
    if (!json || typeof json !== 'object' || json.ok !== true) {
      throw new Error(json && json.error ? String(json.error) : 'Bad response');
    }
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

/** Enrich a local scan with backend company data. Returns the scan unchanged on failure. */
export async function enrichScan(baseUrl, scan) {
  try {
    const data = await request(baseUrl, 'company', {
      companyName: scan.company,
      domain: scan.domainData?.pageHost || '',
    });
    if (data && typeof data === 'object') {
      return {
        ...scan,
        companyData: { ...scan.companyData, ...data },
        source: 'backend-enriched',
      };
    }
  } catch {
    // swallow; local result stands
  }
  return scan;
}

/** Push a scan to the backend for cross-device history. Best-effort. */
export async function syncScan(baseUrl, scan) {
  try {
    await request(baseUrl, 'scan', scan);
    return true;
  } catch {
    return false;
  }
}

/** Submit a scam report to the shared database. Best-effort. */
export async function submitReport(baseUrl, report) {
  try {
    await request(baseUrl, 'report', report);
    return true;
  } catch {
    return false;
  }
}
