# VeriHire AI — Deployment Guide

Covers (1) loading the extension locally for development, (2) optional backend
setup, and (3) publishing to the Chrome Web Store.

---

## 1. Local install (unpacked)

No build step. The source **is** the extension.

1. Open `chrome://extensions` in Chrome (or any Chromium browser: Edge, Brave, Arc).
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Select the `verihire-ai/` folder (the one containing `manifest.json`).
5. The VeriHire AI shield icon appears in the toolbar. Pin it for convenience.

### Try it

- Open any job or internship posting (LinkedIn, Greenhouse, Lever, a company careers page, or a plain page with job text).
- Click the toolbar icon → **Scan this page**.
- You'll get a trust gauge, risk verdict, scam probability, and the positives/negatives that drove the score.
- Open **History** (button in the popup) to see saved scans; open **Settings** (gear) to change theme, toggle auto-scan, or enable privacy mode.

### Reload after edits

After changing any file, return to `chrome://extensions` and click the **reload**
↻ icon on the VeriHire AI card. Changes to the popup/settings/history HTML
take effect on next open; changes to the background worker or content script take
effect after reload.

---

## 2. Optional backend (Google Apps Script)

The extension is fully functional without this. Set it up only if you want
cross-device sync, a shared scam database, or real company enrichment.

1. Create a Google Sheet; note its ID (the long string in its URL). Add two tabs: `scans` and `reports`.
2. Go to <https://script.google.com> → **New project**.
3. Paste the reference `Code.gs` from [`docs/api.md` §3](./api.md) and set `SHEET_ID`.
4. **Deploy → New deployment → type: Web app.**
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
5. Copy the **Web app URL** (ends in `/exec`).
6. In the extension: **Settings → Backend URL** → paste → it autosaves.

The extension will now best-effort sync scans and reports. If the backend is
down or misconfigured, scanning continues to work locally with no visible error.

> The manifest's `connect-src` already allows `script.google.com` and
> `script.googleusercontent.com`. A non-Google backend requires editing
> `manifest.json` to add its origin.

---

## 3. Publishing to the Chrome Web Store

### 3.1 Pre-flight checklist

- [ ] **Icons** present at 16/32/48/128 px (already in `assets/icons/`).
- [ ] **Description & name** finalized in `manifest.json`.
- [ ] **Version** bumped (`manifest.json` → `version`, e.g. `1.0.0`). Each upload needs a higher version.
- [ ] **Permissions justified** — see §3.3. Only `storage`, `activeTab`, `scripting`, `notifications`; no host permissions.
- [ ] **Privacy policy URL** ready (required because the extension handles user content). See §3.4.
- [ ] **Screenshots** (1280×800 or 640×400) of the popup result, history, and settings.
- [ ] Test on a clean Chrome profile via Load unpacked one final time.

### 3.2 Package

Create a ZIP whose **root contains `manifest.json`** (not a parent folder).

```bash
cd verihire-ai
zip -r ../verihire-ai.zip . -x '*.DS_Store' -x '__MACOSX/*'
```

Verify the manifest is at the zip root:

```bash
unzip -l ../verihire-ai.zip | grep manifest.json   # should show "manifest.json", not "verihire-ai/manifest.json"
```

### 3.3 Submit

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) (one-time $5 registration fee).
2. **Add new item** → upload `verihire-ai.zip`.
3. Fill the store listing: description, category (**Productivity**), language, screenshots, small/large promo tiles.
4. **Privacy practices** tab — declare data use honestly:
   - Single purpose: *"Analyze the current job/internship posting for scam signals and show a trust score."*
   - **Permission justifications:**
     - `activeTab` + `scripting` — read the content of the page **only when the user clicks Scan**, to extract the posting text.
     - `storage` — save scan history and settings **locally on the device**.
     - `notifications` — optionally alert the user when an auto-scanned page looks risky.
   - **Data usage:** declare that posting content is processed **on-device**; if no backend is configured, no data leaves the browser. If you ship a default backend, declare that synced fields leave the device.
   - Affirm you are **not** selling data and comply with the Developer Program Policies.
5. **Privacy policy URL** — paste your hosted policy (§3.4).
6. Submit for review. Review typically takes a few days; MV3 + minimal permissions + no remote code speeds approval.

### 3.4 Privacy policy essentials

Because the extension reads page content, the store **requires** a privacy
policy. It must state, truthfully for this codebase:

- Job-posting content is analyzed **locally on the user's device**.
- Scan history and settings are stored **locally** (`chrome.storage.local`), encrypted at rest.
- **No data is transmitted** unless the user voluntarily configures a backend URL, in which case only the listed fields are sent to that user-controlled endpoint.
- No third-party analytics, ad networks, or trackers.
- How users delete data (Settings → danger zone → delete everything; or uninstall).

### 3.5 Compliance notes (why this passes review)

- **Manifest V3** service worker — current standard; MV2 is no longer accepted.
- **No remote code.** All scripts are bundled; nothing is `eval`'d or loaded from a CDN. `script-src 'self'`.
- **Minimal permissions.** No broad `host_permissions`; `activeTab` grants access only on user gesture.
- **Single, clear purpose.** Scam-screening for job postings — no unrelated functionality.
- **Transparent data handling.** On-device by default; backend is opt-in and user-owned.

---

## 4. Versioning & updates

1. Make changes, bump `manifest.json` `version`.
2. Re-zip (§3.2).
3. Upload as a new package in the dashboard → submit.
4. Users receive the update automatically once it passes review.

For staged rollouts, use the dashboard's percentage rollout control.

---

## 5. Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| "Scan this page" does nothing on a page | Some sites block injection (e.g. `chrome://`, the Web Store). Try a normal http(s) job page. |
| Popup shows an error state | Open the page first, then scan; reload the extension after editing the background worker. |
| Backend never syncs | Check the `/exec` URL is the **Web app** deployment, access is **Anyone**, and it's pasted into Settings. Failures are silent by design. |
| Network blocked to backend | Backend origin must be in `connect-src` in `manifest.json`. |
| Service worker "inactive" | Normal — MV3 workers sleep. They wake on message/event automatically. |
