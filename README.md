# Recommended Teacher Directory

A lightweight, zero-build web application for browsing, submitting, and moderating a community-recommended teacher list — backed directly by Google Sheets and hosted on GitHub Pages.

## Pages

1. **Browse & Search (`index.html`)** — Search by teacher name, subject, locality, grade, or comments; filter by Subject, Board, Mode of Teaching, and Locality; toggle between Card and Table views; quick Call / WhatsApp / Copy buttons.
2. **Add Yourself (`submit.html`)** — Form for teachers (or recommenders) to submit a new listing to the `Pending` tab for review.
3. **Moderate (`admin.html`)** — Passcode-protected dashboard to review, edit & approve, or reject pending requests, as well as edit or delete existing entries in the main sheet.

---

## Setup Guide

### Step 1: Deploy the Google Apps Script Backend (3 minutes)

The Browse page works immediately in read-only mode using your public Google Sheet CSV export. To enable **submissions** and **moderation**, deploy the included Apps Script inside your Google Sheet:

1. Open your Google Sheet:  
   https://docs.google.com/spreadsheets/d/1SSLFkMU9C3xZc9meEFdIxYYBIn0JtsbtkOr76dLtdxo/edit
2. In the menu bar, click **Extensions → Apps Script**.
3. Delete any existing code in `Code.gs`, then copy and paste the entire contents of [`apps-script/Code.gs`](apps-script/Code.gs) and click **Save**.
4. Set your moderator passcode:
   - Click **Project Settings** (the gear icon on the left sidebar).
   - Scroll down to **Script Properties** → click **Add script property**.
   - **Property:** `ADMIN_PASSCODE`
   - **Value:** Choose a strong passcode (e.g., `MySecretPass2026!`)
   - Click **Save script properties**.
5. Deploy as a Web App:
   - Click **Deploy → New deployment**.
   - Click the gear icon next to *Select type* and choose **Web app**.
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
   - Click **Deploy** and authorize permissions when prompted.
6. Copy the generated **Web app URL** (it looks like `https://script.google.com/macros/s/.../exec`).

> **Note:** The first time someone submits a teacher (or you open the moderation page), the script will automatically create a `Pending` tab in your spreadsheet.

### Step 2: Connect the Frontend

Open [`js/config.js`](js/config.js) and paste your Web App URL:

```js
APPS_SCRIPT_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
```

### Step 3: Host on GitHub Pages

1. Push this folder to a GitHub repository.
2. Go to your repository **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**, choose `main` (and `/ (root)`), and click **Save**.
4. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.

---

## Local Preview

Because the app uses ES modules (`type="module"`), serve it with any local static server (rather than opening `file://` directly):

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.
