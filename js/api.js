import { CONFIG } from './config.js';

/**
 * Returns true if the Apps Script Web App URL has been configured.
 */
export function isBackendConfigured() {
  return Boolean(
    CONFIG.APPS_SCRIPT_URL &&
    CONFIG.APPS_SCRIPT_URL.trim().startsWith('https://script.google.com/')
  );
}

/**
 * Normalize inconsistent "Mode of Teaching" values from the sheet.
 */
export function normalizeMode(raw) {
  const val = (raw || '').trim().toLowerCase();
  if (!val || val === 'n.a' || val === 'na' || val === 'n/a') return 'Not Specified';
  if (val.includes('hybrid') || val.includes('both')) return 'Hybrid';
  if (val.includes('offine') || val.includes('offline')) return 'Offline';
  if (val.includes('online')) return 'Online';
  return raw.trim();
}

/**
 * Normalize "Board" values for clean display and filtering.
 */
export function normalizeBoard(raw) {
  const val = (raw || '').trim();
  if (!val || /^n\.?a\.?$/i.test(val)) return 'Not Specified';
  if (/^all\s+boards?$/i.test(val)) return 'All Boards';
  return val;
}

/**
 * Extract canonical board tags for filtering (e.g., "CBSE + ICSE" -> ["CBSE", "ICSE"]).
 */
export function extractBoardTags(raw) {
  const val = (raw || '').trim();
  if (!val || /^n\.?a\.?$/i.test(val)) return [];
  if (/all\s+boards?/i.test(val)) return ['All Boards', 'CBSE', 'ICSE', 'IGCSE', 'IB'];
  const tags = [];
  if (/cbse/i.test(val)) tags.push('CBSE');
  if (/icse|icsc/i.test(val)) tags.push('ICSE');
  if (/igcse/i.test(val)) tags.push('IGCSE');
  if (/\bib\b/i.test(val)) tags.push('IB');
  if (/state/i.test(val)) tags.push('State Board');
  if (/jee/i.test(val)) tags.push('JEE');
  return tags.length ? tags : [val];
}

/**
 * Format optional experience (in years) for display (e.g. "5" -> "5 yrs", "1" -> "1 yr").
 */
export function formatExperience(raw) {
  const val = String(raw ?? '').trim();
  if (!val || /^n\.?a\.?$/i.test(val)) return '';
  const num = Number(val);
  if (!Number.isNaN(num) && Number.isFinite(num)) {
    return `${num} ${num === 1 ? 'yr' : 'yrs'}`;
  }
  return val;
}

/**
 * Clean a phone string into digits for tel: and WhatsApp links.
 */
export function formatPhoneLinks(rawContact) {
  const str = String(rawContact || '').trim();
  const digits = str.replace(/\D/g, '');
  if (digits.length < 7) return null;

  let waNumber = digits;
  if (digits.length === 10 && CONFIG.DEFAULT_COUNTRY_CODE) {
    waNumber = `${CONFIG.DEFAULT_COUNTRY_CODE}${digits}`;
  }
  return {
    display: str,
    tel: `tel:${digits.length === 10 ? '+' + CONFIG.DEFAULT_COUNTRY_CODE + digits : '+' + digits}`,
    whatsapp: `https://wa.me/${waNumber}`,
  };
}

/**
 * Parse RFC-4180 CSV text into an array of row arrays.
 */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Find the header row index in the sheet (the row containing "Name of Teacher").
 */
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const lower = rows[i].map((c) => c.trim().toLowerCase());
    if (lower.some((c) => c.includes('name of teacher')) || lower.some((c) => c === 'sl.')) {
      return i;
    }
  }
  return 0;
}

/**
 * Fetch approved teachers directly from the public Google Sheet CSV export.
 * Used as a fallback when Apps Script URL is not yet configured.
 */
async function fetchTeachersFromCSV() {
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/export?format=csv`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not load Google Sheet CSV (HTTP ${res.status})`);
  }
  const text = await res.text();
  const rows = parseCSV(text);
  const headerIdx = findHeaderRow(rows);
  const headers = rows[headerIdx].map((h) => h.trim().toLowerCase());

  const col = (namePart, fallbackIdx) => {
    const idx = headers.findIndex((h) => h.includes(namePart));
    return idx >= 0 ? idx : fallbackIdx;
  };

  const cSl = col('sl', 1);
  const cSubject = col('subject', 2);
  const cMulti = col('multi', 3);
  const cGrades = col('grade', 4);
  const cBoard = col('board', 5);
  const cMode = col('mode', 6);
  const cName = col('name of teacher', 7);
  const cContact = col('contact', 8);
  const cLocality = col('locality', 9);
  const cComments = col('comment', 10);
  const cExperience = headers.findIndex((h) => h.includes('experience'));

  const teachers = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const name = (r[cName] || '').trim();
    const subject = (r[cSubject] || '').trim();
    const contact = (r[cContact] || '').trim();
    if (!name && !subject && !contact) continue;

    teachers.push({
      rowIndex: i + 1, // 1-based sheet row
      sl: (r[cSl] || '').trim(),
      subject,
      multiSingle: (r[cMulti] || '').trim(),
      grades: (r[cGrades] || '').trim(),
      board: (r[cBoard] || '').trim(),
      mode: (r[cMode] || '').trim(),
      name: name || 'Not Given',
      contact,
      locality: (r[cLocality] || '').trim(),
      comments: (r[cComments] || '').trim(),
      experience: cExperience >= 0 ? (r[cExperience] || '').trim() : '',
      verified: (r[cComments + 1] || '').trim().toUpperCase() === 'OK',
    });
  }
  return teachers;
}

/**
 * Send a POST request to Google Apps Script using text/plain to avoid CORS preflight.
 */
async function postToAppsScript(payload) {
  if (!isBackendConfigured()) {
    throw new Error(
      'Apps Script backend URL is not configured yet. Please follow the setup instructions in README.md and update js/config.js.'
    );
  }

  const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`Server returned HTTP ${res.status}`);
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || 'Request failed');
  }
  return json;
}

/**
 * Public API: Fetch all approved teachers.
 * Uses Apps Script if configured, otherwise falls back to public Google Sheet CSV.
 */
export async function fetchTeachers() {
  if (isBackendConfigured()) {
    try {
      const res = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=teachers`, {
        redirect: 'follow',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.teachers)) {
          return { teachers: json.teachers, source: 'apps-script' };
        }
      }
    } catch (err) {
      console.warn('Apps Script fetch failed, falling back to CSV:', err);
    }
  }
  const teachers = await fetchTeachersFromCSV();
  return { teachers, source: 'csv' };
}

/**
 * Public API: Submit a new teacher request to the Pending tab.
 */
export async function submitTeacherRequest(data) {
  return postToAppsScript({
    action: 'submit',
    data,
  });
}

/**
 * Admin API: Verify moderator passcode.
 */
export async function verifyAdminPasscode(passcode) {
  return postToAppsScript({
    action: 'verifyAdmin',
    passcode,
  });
}

/**
 * Admin API: Get all pending submissions.
 */
export async function fetchPendingRequests(passcode) {
  const res = await postToAppsScript({
    action: 'getPending',
    passcode,
  });
  return res.pending || [];
}

/**
 * Admin API: Approve a pending request (with optional edited fields).
 */
export async function approveRequest(passcode, id, data) {
  return postToAppsScript({
    action: 'approve',
    passcode,
    id,
    data,
  });
}

/**
 * Admin API: Reject (remove) a pending request.
 */
export async function rejectRequest(passcode, id) {
  return postToAppsScript({
    action: 'reject',
    passcode,
    id,
  });
}

/**
 * Admin API: Update an existing approved teacher row.
 */
export async function updateTeacher(passcode, rowIndex, data) {
  return postToAppsScript({
    action: 'updateTeacher',
    passcode,
    rowIndex,
    data,
  });
}

/**
 * Admin API: Delete an existing approved teacher row.
 */
export async function deleteTeacher(passcode, rowIndex) {
  return postToAppsScript({
    action: 'deleteTeacher',
    passcode,
    rowIndex,
  });
}

/**
 * Escape HTML to prevent XSS when rendering user/sheet content.
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
