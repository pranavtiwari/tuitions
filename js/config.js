/**
 * Configuration for the Recommended Teachers Web App.
 *
 * 1. SHEET_ID is pre-filled with your Google Sheet ID so the Browse page
 *    works immediately in read-only mode via public CSV export.
 * 2. After deploying apps-script/Code.gs as a Web App in your Google Sheet,
 *    paste the Web App URL into APPS_SCRIPT_URL below to enable:
 *    - Submitting new teachers (submit.html)
 *    - Moderating & managing teachers (admin.html)
 *    - Live API reads
 */
export const CONFIG = {
  APP_NAME: 'Teacher Directory',
  APP_SUBTITLE: 'Community-recommended tutors & educators',

  // Your Google Sheet ID (from the spreadsheet URL)
  SHEET_ID: '1SSLFkMU9C3xZc9meEFdIxYYBIn0JtsbtkOr76dLtdxo',

  // Paste your deployed Google Apps Script Web App URL here:
  // Example: 'https://script.google.com/macros/s/AKfycb.../exec'
  APPS_SCRIPT_URL: '',

  // Default country code for WhatsApp links when a 10-digit number is stored
  DEFAULT_COUNTRY_CODE: '91',
};
