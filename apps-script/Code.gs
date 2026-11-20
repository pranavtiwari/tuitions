/**
 * Google Apps Script Backend for the Recommended Teachers Web App
 *
 * Setup:
 * 1. Open your Google Sheet -> Extensions -> Apps Script.
 * 2. Delete any placeholder code and paste this entire file.
 * 3. Go to Project Settings (gear icon) -> Script Properties -> Add script property:
 *      Property: ADMIN_PASSCODE
 *      Value:    <your-secret-moderator-passcode>
 * 4. Click Deploy -> New deployment -> Select type: Web app
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. Copy the Web App URL and paste it into js/config.js (APPS_SCRIPT_URL).
 */

const PENDING_SHEET_NAME = 'Pending';
const REFERENCES_SHEET_NAME = 'References';

const PENDING_HEADERS = [
  'ID',
  'Submitted At',
  'Subject',
  'Multi / Single',
  'Grade(s)',
  'Board',
  'Mode of Teaching',
  'Name of Teacher',
  'Contact Details',
  'Locality for Offline',
  'Comments',
  'Submitted By',
  'Experience (Years)',
];

const REFERENCES_HEADERS = [
  'ID',
  'Submitted At',
  'Teacher Sl.',
  'Teacher Name',
  'Teacher Contact',
  'Parent Name',
  'Parent Phone',
  'Community / Apartment',
  'Review',
  'Status',
];

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * Prevent spreadsheet formula injection on untrusted user input.
 */
function safeCell(val) {
  const s = String(val == null ? '' : val).trim();
  if (/^[=+\-@]/.test(s)) {
    return "'" + s;
  }
  return s;
}

function getMainSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const name = sheets[i].getName();
    if (name !== PENDING_SHEET_NAME && name !== REFERENCES_SHEET_NAME) {
      return sheets[i];
    }
  }
  return sheets[0];
}

function getOrCreatePendingSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PENDING_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PENDING_SHEET_NAME);
    sheet.getRange(1, 1, 1, PENDING_HEADERS.length).setValues([PENDING_HEADERS]);
    sheet.setFrozenRows(1);
  } else {
    const existingCols = sheet.getLastColumn();
    if (existingCols < PENDING_HEADERS.length) {
      const missing = PENDING_HEADERS.slice(existingCols);
      sheet.getRange(1, existingCols + 1, 1, missing.length).setValues([missing]);
    }
  }
  return sheet;
}

function getOrCreateReferencesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(REFERENCES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(REFERENCES_SHEET_NAME);
    sheet.getRange(1, 1, 1, REFERENCES_HEADERS.length).setValues([REFERENCES_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function normalizePhoneDigits(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  // Compare last 10 digits when country code is present
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Locate header row & column indices in the main Teachers sheet.
 * Matches your existing sheet layout (Col B = Sl., Col C = Subject, ..., Col K = Comments, Col L = OK).
 */
function getMainSheetLayout(sheet) {
  const maxRows = Math.min(10, sheet.getLastRow() || 1);
  const maxCols = Math.max(12, sheet.getLastColumn() || 12);
  const preview = sheet.getRange(1, 1, maxRows, maxCols).getValues();

  let headerRowIdx = 0;
  for (let r = 0; r < preview.length; r++) {
    const lower = preview[r].map((c) => String(c || '').trim().toLowerCase());
    if (lower.some((c) => c.includes('name of teacher')) || lower.some((c) => c === 'sl.')) {
      headerRowIdx = r;
      break;
    }
  }

  const headers = preview[headerRowIdx].map((c) => String(c || '').trim().toLowerCase());
  const findCol = (part, fallback) => {
    const idx = headers.findIndex((h) => h.includes(part));
    return idx >= 0 ? idx : fallback;
  };

  return {
    headerRow: headerRowIdx + 1, // 1-based
    cols: {
      sl: findCol('sl', 1),
      subject: findCol('subject', 2),
      multiSingle: findCol('multi', 3),
      grades: findCol('grade', 4),
      board: findCol('board', 5),
      mode: findCol('mode', 6),
      name: findCol('name of teacher', 7),
      contact: findCol('contact', 8),
      locality: findCol('locality', 9),
      comments: findCol('comment', 10),
      status: findCol('comment', 10) + 1,
      experience: findCol('experience', -1),
    },
  };
}

function ensureExperienceColumn(sheet, layout) {
  if (layout.cols.experience >= 0) return layout.cols.experience;
  const colIdx = Math.max(layout.cols.status + 1, sheet.getLastColumn());
  sheet.getRange(layout.headerRow, colIdx + 1).setValue('Experience (Years)');
  layout.cols.experience = colIdx;
  return colIdx;
}

function verifyPasscode(passcode) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSCODE');
  if (!expected) {
    throw new Error(
      'ADMIN_PASSCODE is not configured in Apps Script Project Settings -> Script Properties.'
    );
  }
  if (!passcode || String(passcode).trim() !== String(expected).trim()) {
    throw new Error('Invalid moderator passcode.');
  }
}

function getAllTeachers() {
  const sheet = getMainSheet();
  const lastRow = sheet.getLastRow();
  const layout = getMainSheetLayout(sheet);
  if (lastRow <= layout.headerRow) return [];

  const numCols = Math.max(12, sheet.getLastColumn());
  const values = sheet
    .getRange(layout.headerRow + 1, 1, lastRow - layout.headerRow, numCols)
    .getDisplayValues();

  const c = layout.cols;
  const teachers = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    const name = (r[c.name] || '').trim();
    const subject = (r[c.subject] || '').trim();
    const contact = (r[c.contact] || '').trim();
    if (!name && !subject && !contact) continue;

    teachers.push({
      rowIndex: layout.headerRow + 1 + i,
      sl: (r[c.sl] || '').trim(),
      subject,
      multiSingle: (r[c.multiSingle] || '').trim(),
      grades: (r[c.grades] || '').trim(),
      board: (r[c.board] || '').trim(),
      mode: (r[c.mode] || '').trim(),
      name: name || 'Not Given',
      contact,
      locality: (r[c.locality] || '').trim(),
      comments: (r[c.comments] || '').trim(),
      experience: c.experience >= 0 ? (r[c.experience] || '').trim() : '',
      verified: (r[c.status] || '').trim().toUpperCase() === 'OK',
    });
  }
  return teachers;
}

function getPendingList() {
  const sheet = getOrCreatePendingSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, PENDING_HEADERS.length).getDisplayValues();
  const pending = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (!r[0] && !r[7]) continue;
    pending.push({
      id: r[0],
      submittedAt: r[1],
      subject: r[2],
      multiSingle: r[3],
      grades: r[4],
      board: r[5],
      mode: r[6],
      name: r[7],
      contact: r[8],
      locality: r[9],
      comments: r[10],
      submittedBy: r[11],
      experience: r[12] || '',
    });
  }
  return pending;
}

function handleSubmit(data) {
  if (!data || !data.name || !data.subject || !data.contact) {
    throw new Error('Name, subject, and contact details are required.');
  }
  const sheet = getOrCreatePendingSheet();
  const id = Utilities.getUuid();
  const submittedAt = new Date().toISOString();

  sheet.appendRow([
    id,
    submittedAt,
    safeCell(data.subject),
    safeCell(data.multiSingle || 'Single'),
    safeCell(data.grades || 'All Grades'),
    safeCell(data.board || 'ALL Boards'),
    safeCell(data.mode || 'Online'),
    safeCell(data.name),
    safeCell(data.contact),
    safeCell(data.locality || ''),
    safeCell(data.comments || ''),
    safeCell(data.submittedBy || ''),
    safeCell(data.experience || ''),
  ]);

  return { ok: true, id };
}

function findPendingRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2; // 1-based row index
  }
  return -1;
}

function handleApprove(id, editedData) {
  const pendingSheet = getOrCreatePendingSheet();
  const pendingRow = findPendingRowById(pendingSheet, id);
  if (pendingRow < 0) {
    throw new Error('Pending request not found (it may have already been processed).');
  }

  const rawRow = pendingSheet.getRange(pendingRow, 1, 1, PENDING_HEADERS.length).getDisplayValues()[0];
  const d = editedData || {
    subject: rawRow[2],
    multiSingle: rawRow[3],
    grades: rawRow[4],
    board: rawRow[5],
    mode: rawRow[6],
    name: rawRow[7],
    contact: rawRow[8],
    locality: rawRow[9],
    comments: rawRow[10],
    experience: rawRow[12] || '',
  };

  const mainSheet = getMainSheet();
  const layout = getMainSheetLayout(mainSheet);
  const c = layout.cols;

  if (d.experience && String(d.experience).trim() !== '' && c.experience < 0) {
    ensureExperienceColumn(mainSheet, layout);
  }

  // Compute next Sl. number
  let maxSl = 0;
  const lastRow = mainSheet.getLastRow();
  if (lastRow > layout.headerRow) {
    const slVals = mainSheet
      .getRange(layout.headerRow + 1, c.sl + 1, lastRow - layout.headerRow, 1)
      .getValues();
    for (let i = 0; i < slVals.length; i++) {
      const n = Number(slVals[i][0]);
      if (!isNaN(n) && n > maxSl) maxSl = n;
    }
  }

  const rowWidth = Math.max(12, c.status + 1, c.experience >= 0 ? c.experience + 1 : 0);
  const newRow = new Array(rowWidth).fill('');
  newRow[c.sl] = maxSl + 1;
  newRow[c.subject] = safeCell(d.subject);
  newRow[c.multiSingle] = safeCell(d.multiSingle || 'Single');
  newRow[c.grades] = safeCell(d.grades);
  newRow[c.board] = safeCell(d.board);
  newRow[c.mode] = safeCell(d.mode);
  newRow[c.name] = safeCell(d.name);
  newRow[c.contact] = safeCell(d.contact);
  newRow[c.locality] = safeCell(d.locality);
  newRow[c.comments] = safeCell(d.comments);
  newRow[c.status] = 'OK';
  if (c.experience >= 0) {
    newRow[c.experience] = safeCell(d.experience || '');
  }

  mainSheet.getRange(lastRow + 1, 1, 1, rowWidth).setValues([newRow]);
  pendingSheet.deleteRow(pendingRow);

  return { ok: true, sl: maxSl + 1 };
}

function handleReject(id) {
  const pendingSheet = getOrCreatePendingSheet();
  const pendingRow = findPendingRowById(pendingSheet, id);
  if (pendingRow < 0) {
    throw new Error('Pending request not found.');
  }
  pendingSheet.deleteRow(pendingRow);
  return { ok: true };
}

function handleUpdateTeacher(rowIndex, d) {
  const mainSheet = getMainSheet();
  const layout = getMainSheetLayout(mainSheet);
  const idx = Number(rowIndex);
  if (isNaN(idx) || idx <= layout.headerRow || idx > mainSheet.getLastRow()) {
    throw new Error('Invalid teacher row index.');
  }

  const c = layout.cols;
  if (d.experience && String(d.experience).trim() !== '' && c.experience < 0) {
    ensureExperienceColumn(mainSheet, layout);
  }

  const rowWidth = Math.max(12, c.status + 1, c.experience >= 0 ? c.experience + 1 : 0);
  const existing = mainSheet.getRange(idx, 1, 1, rowWidth).getValues()[0];

  existing[c.subject] = safeCell(d.subject);
  existing[c.multiSingle] = safeCell(d.multiSingle);
  existing[c.grades] = safeCell(d.grades);
  existing[c.board] = safeCell(d.board);
  existing[c.mode] = safeCell(d.mode);
  existing[c.name] = safeCell(d.name);
  existing[c.contact] = safeCell(d.contact);
  existing[c.locality] = safeCell(d.locality);
  existing[c.comments] = safeCell(d.comments);
  if (c.experience >= 0) {
    existing[c.experience] = safeCell(d.experience || '');
  }

  mainSheet.getRange(idx, 1, 1, rowWidth).setValues([existing]);
  return { ok: true };
}

function handleDeleteTeacher(rowIndex) {
  const mainSheet = getMainSheet();
  const layout = getMainSheetLayout(mainSheet);
  const idx = Number(rowIndex);
  if (isNaN(idx) || idx <= layout.headerRow || idx > mainSheet.getLastRow()) {
    throw new Error('Invalid teacher row index.');
  }
  mainSheet.deleteRow(idx);
  return { ok: true };
}

function getPublicApprovedReferences() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(REFERENCES_SHEET_NAME);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, REFERENCES_HEADERS.length).getDisplayValues();
  const approved = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if ((r[9] || '').trim().toLowerCase() !== 'approved') continue;
    // Privacy: NEVER expose Parent Phone (r[6]) or Community/Apartment (r[7]) publicly
    approved.push({
      id: r[0],
      submittedAt: r[1],
      teacherSl: r[2],
      teacherName: r[3],
      parentName: r[5],
      review: r[8],
    });
  }
  return approved;
}

function getAllReferencesAdmin() {
  const sheet = getOrCreateReferencesSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, REFERENCES_HEADERS.length).getDisplayValues();
  const list = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (!r[0] && !r[5]) continue;
    list.push({
      id: r[0],
      submittedAt: r[1],
      teacherSl: r[2],
      teacherName: r[3],
      teacherContact: r[4],
      parentName: r[5],
      parentPhone: r[6],
      community: r[7],
      review: r[8],
      status: (r[9] || 'Pending').trim(),
    });
  }
  return list;
}

function findReferenceRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return -1;
}

function handleSubmitReference(data) {
  if (!data || !data.teacherName || !data.parentName || !data.parentPhone || !data.community || !data.review) {
    throw new Error('Parent name, phone number, community/apartment, and review are all required.');
  }

  const parentDigits = normalizePhoneDigits(data.parentPhone);
  if (parentDigits.length < 7) {
    throw new Error('Please enter a valid parent phone number.');
  }
  if (String(data.review).trim().length < 10) {
    throw new Error('Please write a brief review (at least 10 characters).');
  }

  // Anti-fake check 1: Block self-recommendation using the teacher's own phone number
  const teacherDigits = normalizePhoneDigits(data.teacherContact);
  if (teacherDigits && parentDigits === teacherDigits) {
    throw new Error("A parent reference cannot use the teacher's own contact number.");
  }

  const sheet = getOrCreateReferencesSheet();
  const teacherSl = String(data.teacherSl || '').trim();
  const teacherName = String(data.teacherName || '').trim();

  // Anti-fake check 2: Block duplicate reference from the same phone number for the same teacher
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const existing = sheet.getRange(2, 1, lastRow - 1, REFERENCES_HEADERS.length).getDisplayValues();
    for (let i = 0; i < existing.length; i++) {
      const r = existing[i];
      const sameTeacher =
        (teacherSl && String(r[2]).trim() === teacherSl) ||
        String(r[3]).trim().toLowerCase() === teacherName.toLowerCase();
      const samePhone = normalizePhoneDigits(r[6]) === parentDigits;
      if (sameTeacher && samePhone) {
        throw new Error('A reference from this phone number has already been submitted for this teacher.');
      }
    }
  }

  const id = Utilities.getUuid();
  const submittedAt = new Date().toISOString();

  sheet.appendRow([
    id,
    submittedAt,
    safeCell(teacherSl),
    safeCell(teacherName),
    safeCell(data.teacherContact || ''),
    safeCell(data.parentName),
    safeCell(data.parentPhone),
    safeCell(data.community),
    safeCell(data.review),
    'Pending',
  ]);

  return { ok: true, id };
}

function handleApproveReference(id) {
  const sheet = getOrCreateReferencesSheet();
  const row = findReferenceRowById(sheet, id);
  if (row < 0) throw new Error('Reference not found.');
  sheet.getRange(row, 10).setValue('Approved');
  return { ok: true };
}

function handleDeleteReference(id) {
  const sheet = getOrCreateReferencesSheet();
  const row = findReferenceRowById(sheet, id);
  if (row < 0) throw new Error('Reference not found.');
  sheet.deleteRow(row);
  return { ok: true };
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'teachers';
    if (action === 'teachers') {
      return jsonResponse({
        ok: true,
        teachers: getAllTeachers(),
        references: getPublicApprovedReferences(),
      });
    }
    return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = body.action;

    if (action === 'submit') {
      lock.waitLock(10000);
      return jsonResponse(handleSubmit(body.data));
    }

    if (action === 'submitReference') {
      lock.waitLock(10000);
      return jsonResponse(handleSubmitReference(body.data));
    }

    if (action === 'verifyAdmin') {
      verifyPasscode(body.passcode);
      return jsonResponse({ ok: true });
    }

    if (action === 'getPending') {
      verifyPasscode(body.passcode);
      return jsonResponse({ ok: true, pending: getPendingList() });
    }

    if (action === 'getReferences') {
      verifyPasscode(body.passcode);
      return jsonResponse({ ok: true, references: getAllReferencesAdmin() });
    }

    if (action === 'approveReference') {
      verifyPasscode(body.passcode);
      lock.waitLock(10000);
      return jsonResponse(handleApproveReference(body.id));
    }

    if (action === 'rejectReference' || action === 'deleteReference') {
      verifyPasscode(body.passcode);
      lock.waitLock(10000);
      return jsonResponse(handleDeleteReference(body.id));
    }

    if (action === 'approve') {
      verifyPasscode(body.passcode);
      lock.waitLock(10000);
      return jsonResponse(handleApprove(body.id, body.data));
    }

    if (action === 'reject') {
      verifyPasscode(body.passcode);
      lock.waitLock(10000);
      return jsonResponse(handleReject(body.id));
    }

    if (action === 'updateTeacher') {
      verifyPasscode(body.passcode);
      lock.waitLock(10000);
      return jsonResponse(handleUpdateTeacher(body.rowIndex, body.data));
    }

    if (action === 'deleteTeacher') {
      verifyPasscode(body.passcode);
      lock.waitLock(10000);
      return jsonResponse(handleDeleteTeacher(body.rowIndex));
    }

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}
