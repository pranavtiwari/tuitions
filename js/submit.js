import { isBackendConfigured, submitTeacherRequest, escapeHtml } from './api.js';

const form = document.getElementById('teacherForm');
const setupNotice = document.getElementById('setupNotice');
const statusAlert = document.getElementById('statusAlert');
const submitBtn = document.getElementById('submitBtn');
const modeSelect = document.getElementById('mode');
const localityInput = document.getElementById('locality');
const localityReq = document.getElementById('localityReq');
const boardAll = document.getElementById('boardAll');
const boardCheckboxes = [...document.querySelectorAll('#boardCheckboxes input[type="checkbox"]')];
const boardOther = document.getElementById('boardOther');
const gradesInput = document.getElementById('grades');

if (!isBackendConfigured()) {
  setupNotice.style.display = 'flex';
}

// Quick-pick grade chips
document.querySelectorAll('.quick-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    gradesInput.value = chip.dataset.grade;
    gradesInput.focus();
  });
});

// Toggle "All Boards" vs individual boards
boardAll.addEventListener('change', () => {
  if (boardAll.checked) {
    boardCheckboxes.forEach((cb) => {
      if (cb !== boardAll) cb.checked = false;
    });
  }
});

boardCheckboxes.forEach((cb) => {
  if (cb === boardAll) return;
  cb.addEventListener('change', () => {
    if (cb.checked) boardAll.checked = false;
  });
});

// Highlight locality when Offline or Hybrid is chosen
function syncLocalityRequirement() {
  const needsLocality = modeSelect.value === 'Offline' || modeSelect.value === 'Hybrid';
  localityReq.style.display = needsLocality ? 'inline' : 'none';
}
modeSelect.addEventListener('change', syncLocalityRequirement);
syncLocalityRequirement();

function showAlert(type, html) {
  statusAlert.className = `alert alert-${type}`;
  statusAlert.innerHTML = html;
  statusAlert.style.display = 'flex';
  statusAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function getSelectedBoardString() {
  const picked = boardCheckboxes.filter((cb) => cb.checked).map((cb) => cb.value);
  const custom = boardOther.value.trim();
  if (custom) picked.push(custom);
  return picked.join(' + ');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusAlert.style.display = 'none';

  const name = form.name.value.trim();
  const subject = form.subject.value.trim();
  const multiSingle = form.multiSingle.value;
  const grades = form.grades.value.trim();
  const board = getSelectedBoardString();
  const mode = form.mode.value;
  const contact = form.contact.value.trim();
  const locality = form.locality.value.trim();
  const comments = form.comments.value.trim();
  const submittedBy = form.submittedBy.value.trim();

  // Basic validation
  if (!name) return showAlert('danger', '<span>❌</span><div>Please enter the teacher or academy name.</div>');
  if (!subject) return showAlert('danger', '<span>❌</span><div>Please enter at least one subject.</div>');
  if (!grades) return showAlert('danger', '<span>❌</span><div>Please specify the grade(s) taught.</div>');
  if (!board) return showAlert('danger', '<span>❌</span><div>Please select at least one board (or enter one in the text field).</div>');

  const digits = contact.replace(/\D/g, '');
  if (digits.length < 7) {
    return showAlert('danger', '<span>❌</span><div>Please enter a valid contact phone number (at least 7 digits).</div>');
  }
  if ((mode === 'Offline' || mode === 'Hybrid') && !locality) {
    localityInput.focus();
    return showAlert('danger', '<span>❌</span><div>Please enter a locality for offline/hybrid classes.</div>');
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  try {
    await submitTeacherRequest({
      name,
      subject,
      multiSingle,
      grades,
      board,
      mode,
      contact,
      locality,
      comments,
      submittedBy,
    });

    form.reset();
    syncLocalityRequirement();
    showAlert(
      'success',
      `<span>✅</span><div><strong>Thank you!</strong> Your submission for <strong>${escapeHtml(name)}</strong> has been received and is awaiting moderator approval.</div>`
    );
  } catch (err) {
    showAlert('danger', `<span>❌</span><div><strong>Submission failed:</strong> ${escapeHtml(err.message)}</div>`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit for Review';
  }
});
