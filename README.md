# DraftJobs — AI-Powered Job & Internship Scam Shield

DraftJobs is a Chrome Extension (Manifest V3) and backend API service that scans internship and job postings for scam signals. It provides a trust score, risk level, specific scam signals, AI explanations via **Grok AI**, and actionable application recommendations.

---

## 🏗️ Architecture

```text
Job Website (LinkedIn / Indeed / Glassdoor / Naukri / Internshala)
     ↓
extension/src/content/content.js
     ↓
extension/src/background/background.js
     ↓
backend/server.js (Node.js + Express)
     ↓
backend/services/grok.js → Grok AI (xAI API)
     ↓
Structured Scam Analysis JSON
     ↓
extension/src/popup/popup.js → User Interface
```

### 🔒 Security Guarantee
**The Grok / xAI API key NEVER enters the extension code or frontend.** It remains securely stored in the backend `.env` file on the server.

---

## 📁 Project Structure

```text
DraftJobs/
├── extension/             # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── assets/icons/      # 16px, 32px, 48px, 128px icons
│   └── src/
│       ├── background/    # Service worker & message handler
│       ├── content/       # Content extraction & site detectors
│       ├── popup/         # UI popup components & CSS
│       ├── settings/      # Extension settings page
│       ├── history/       # History & scam report dashboard
│       ├── services/      # Local scoring engine, storage & API client
│       └── utils/         # Constants, helpers, validators
│
├── backend/               # Node.js API & Grok AI Server
│   ├── server.js          # Express server entry point
│   ├── routes/analyze.js  # /api/analyze endpoint
│   ├── services/          # grok.js, scam-detector.js, scoring.js
│   ├── middleware/        # validation.js, rate-limit.js
│   ├── utils/logger.js
│   ├── .env               # Secrets (GROK_API_KEY)
│   └── package.json
│
├── shared/                # Code shared between backend & extension
│   ├── schemas/           # Standardized response validation
│   └── constants/         # Risk bands & scoring thresholds
│
└── README.md
```

---

## 🚀 Quick Start Guide

### 1. Setup Backend & Grok AI

1. Open terminal in the project root directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your `.env` file:
   ```bash
   cp .env.example .env
   ```
4. Edit `backend/.env` and insert your **Grok AI API key**:
   ```env
   PORT=3001
   GROK_API_KEY=xai-YOUR_ACTUAL_GROK_API_KEY_HERE
   GROK_MODEL=grok-3-mini
   ```
5. Start the backend server:
   ```bash
   npm start
   ```
   The backend will start on `http://localhost:3001`.

---

### 2. Install Extension in Chrome

1. Open Google Chrome and navigate to: `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right corner).
3. Click **Load unpacked**.
4. Select the `extension` directory inside the project folder.
5. Pin **DraftJobs** to your extensions toolbar.

---

### 3. Usage & Testing

1. Open any job posting on a supported website:
   - LinkedIn (`linkedin.com/jobs/...`)
   - Indeed (`indeed.com/viewjob...`)
   - Glassdoor (`glassdoor.com/Job/...`)
   - Naukri (`naukri.com/job-listings...`)
   - Internshala (`internshala.com/internship/detail/...`)
2. Click the **DraftJobs** extension icon in your Chrome toolbar.
3. Click **Scan this page**.
4. View your **Trust Score**, **Risk Level**, **Scam Signals**, **Grok AI Explanation**, and **Recommendation**.

---

## 📊 Trust Score & Risk Bands

- **80 – 100**: Low Risk (Looks legitimate)
- **60 – 79**: Moderate Risk (Probably fine)
- **40 – 59**: High Risk (Be cautious)
- **0 – 39**: Very High Risk (Likely scam)
