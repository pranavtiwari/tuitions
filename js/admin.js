import {
  isBackendConfigured,
  verifyAdminPasscode,
  fetchPendingRequests,
  fetchTeachers,
  fetchAdminReferences,
  approveRequest,
  rejectRequest,
  approveParentReference,
  deleteParentReference,
  updateTeacher,
  deleteTeacher,
  normalizeMode,
  formatExperience,
  formatPhoneLinks,
  escapeHtml,
} from './api.js';

const SESSION_KEY = 'teacher_dir_admin_passcode';

const setupNotice = document.getElementById('setupNotice');
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const loginForm = document.getElementById('loginForm');
const passcodeInput = document.getElementById('passcodeInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');

const refreshBtn = document.getElementById('refreshBtn');
const logoutBtn = document.getElementById('logoutBtn');
const tabPending = document.getElementById('tabPending');
const tabReferences = document.getElementById('tabReferences');
const tabApproved = document.getElementById('tabApproved');
const pendingCount = document.getElementById('pendingCount');
const referencesCount = document.getElementById('referencesCount');
const approvedCount = document.getElementById('approvedCount');
const pendingPanel = document.getElementById('pendingPanel');
const referencesPanel = document.getElementById('referencesPanel');
const approvedPanel = document.getElementById('approvedPanel');
const pendingContainer = document.getElementById('pendingContainer');
const referencesContainer = document.getElementById('referencesContainer');
const approvedContainer = document.getElementById('approvedContainer');
const adminSearchInput = document.getElementById('adminSearchInput');

const editModalBackdrop = document.getElementById('editModalBackdrop');
const modalTitle = document.getElementById('modalTitle');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const saveModalBtn = document.getElementById('saveModalBtn');
const editForm = document.getElementById('editForm');
const toastEl = document.getElementById('toast');

let adminPasscode = sessionStorage.getItem(SESSION_KEY) || '';
let pendingList = [];
let referencesList = [];
let approvedList = [];
let modalContext = null; // { type: 'approve', item } | { type: 'editApproved', item }

if (!isBackendConfigured()) {
  setupNotice.style.display = 'flex';
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function showLoginError(msg) {
  loginError.innerHTML = `<svg class="alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg><div>${escapeHtml(msg)}</div>`;
  loginError.style.display = 'flex';
}

function switchTab(tab) {
  const isPending = tab === 'pending';
  const isRefs = tab === 'references';
  const isApproved = tab === 'approved';
  tabPending.classList.toggle('active', isPending);
  tabPending.setAttribute('aria-selected', String(isPending));
  tabReferences.classList.toggle('active', isRefs);
  tabReferences.setAttribute('aria-selected', String(isRefs));
  tabApproved.classList.toggle('active', isApproved);
  tabApproved.setAttribute('aria-selected', String(isApproved));
  pendingPanel.style.display = isPending ? 'block' : 'none';
  referencesPanel.style.display = isRefs ? 'block' : 'none';
  approvedPanel.style.display = isApproved ? 'block' : 'none';
}

tabPending.addEventListener('click', () => switchTab('pending'));
tabReferences.addEventListener('click', () => switchTab('references'));
tabApproved.addEventListener('click', () => switchTab('approved'));

function openModal(context) {
  modalContext = context;
  const item = context.item;
  document.getElementById('editName').value = item.name || '';
  document.getElementById('editSubject').value = item.subject || '';
  document.getElementById('editMulti').value = item.multiSingle || 'Single';
  document.getElementById('editGrades').value = item.grades || '';
  document.getElementById('editBoard').value = item.board || '';
  const normMode = normalizeMode(item.mode);
  document.getElementById('editMode').value = ['Online', 'Offline', 'Hybrid'].includes(normMode) ? normMode : 'N.A';
  document.getElementById('editContact').value = item.contact || '';
  document.getElementById('editExperience').value = item.experience || '';
  document.getElementById('editLocality').value = item.locality || '';
  document.getElementById('editComments').value = item.comments || '';

  if (context.type === 'approve') {
    modalTitle.textContent = 'Review, Edit & Approve Request';
    saveModalBtn.textContent = 'Approve & Publish';
    saveModalBtn.className = 'btn btn-success';
  } else {
    modalTitle.textContent = 'Edit Approved Teacher';
    saveModalBtn.textContent = 'Save Changes';
    saveModalBtn.className = 'btn btn-primary';
  }
  editModalBackdrop.classList.add('open');
}

function closeModal() {
  editModalBackdrop.classList.remove('open');
  modalContext = null;
}

closeModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);
editModalBackdrop.addEventListener('click', (e) => {
  if (e.target === editModalBackdrop) closeModal();
});

function renderPending() {
  pendingCount.textContent = String(pendingList.length);
  if (!pendingList.length) {
    pendingContainer.innerHTML = `
      <div class="state-box">
        <strong>All caught up</strong>
        <p style="margin:0.4rem 0 0;">There are no pending teacher submissions awaiting review.</p>
      </div>`;
    return;
  }

  pendingContainer.innerHTML = `
    <div class="teacher-grid">
      ${pendingList
        .map((item) => {
          const submittedDate = item.submittedAt
            ? new Date(item.submittedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
            : '';
          return `
            <article class="teacher-card" data-id="${escapeHtml(item.id)}">
              <div class="card-top">
                <div>
                  <h2 class="teacher-name">${escapeHtml(item.name)}</h2>
                  <span class="subject-tag">${escapeHtml(item.subject)}</span>
                </div>
                <span class="badge badge-pending">Pending</span>
              </div>

              <div class="meta-list">
                <div class="meta-item">
                  <span class="meta-label">Grade(s)</span>
                  <span class="meta-value">${escapeHtml(item.grades || '—')}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">Board</span>
                  <span class="meta-value">${escapeHtml(item.board || '—')}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">Mode</span>
                  <span class="meta-value">${escapeHtml(item.mode || '—')}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">Contact</span>
                  <span class="meta-value">${escapeHtml(item.contact || '—')}</span>
                </div>
                ${
                  item.experience
                    ? `<div class="meta-item">
                         <span class="meta-label">Experience</span>
                         <span class="meta-value">${escapeHtml(formatExperience(item.experience))}</span>
                       </div>`
                    : ''
                }
                ${
                  item.locality
                    ? `<div class="meta-item${item.experience ? '' : ' full'}">
                         <span class="meta-label">Locality</span>
                         <span class="meta-value">${escapeHtml(item.locality)}</span>
                       </div>`
                    : ''
                }
                ${
                  item.submittedBy || submittedDate
                    ? `<div class="meta-item full">
                         <span class="meta-label">Submitted</span>
                         <span class="meta-value">${escapeHtml(submittedDate)}${item.submittedBy ? ` by ${escapeHtml(item.submittedBy)}` : ''}</span>
                       </div>`
                    : ''
                }
              </div>

              ${
                item.comments
                  ? `<div class="teacher-comments">${escapeHtml(item.comments)}</div>`
                  : ''
              }

              <div class="card-actions" style="justify-content:flex-end;">
                <button type="button" class="btn btn-danger btn-sm reject-btn" data-id="${escapeHtml(item.id)}">Reject</button>
                <button type="button" class="btn btn-secondary btn-sm edit-approve-btn" data-id="${escapeHtml(item.id)}">Edit &amp; Approve</button>
                <button type="button" class="btn btn-success btn-sm approve-btn" data-id="${escapeHtml(item.id)}">Approve</button>
              </div>
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderApproved() {
  approvedCount.textContent = String(approvedList.length);
  const q = adminSearchInput.value.trim().toLowerCase();
  const filtered = q
    ? approvedList.filter((t) =>
        [t.name, t.subject, t.grades, t.board, t.mode, t.locality, t.contact, t.comments]
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
    : approvedList;

  if (!filtered.length) {
    approvedContainer.innerHTML = `
      <div class="state-box">
        <strong>No matching teachers found.</strong>
      </div>`;
    return;
  }

  approvedContainer.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Teacher</th>
            <th>Subject</th>
            <th>Grade(s)</th>
            <th>Board</th>
            <th>Mode</th>
            <th>Experience</th>
            <th>Contact</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered
            .map(
              (t) => `
                <tr>
                  <td>${escapeHtml(t.sl || '')}</td>
                  <td>
                    <strong>${escapeHtml(t.name)}</strong>
                    ${t.locality ? `<div style="font-size:0.78rem;color:var(--text-light);">${escapeHtml(t.locality)}</div>` : ''}
                  </td>
                  <td>${escapeHtml(t.subject)}</td>
                  <td>${escapeHtml(t.grades || '—')}</td>
                  <td>${escapeHtml(t.board || '—')}</td>
                  <td>${escapeHtml(normalizeMode(t.mode))}</td>
                  <td style="white-space:nowrap;">${escapeHtml(formatExperience(t.experience) || '—')}</td>
                  <td style="white-space:nowrap;">${escapeHtml(t.contact || '—')}</td>
                  <td style="white-space:nowrap;">
                    <button type="button" class="btn btn-secondary btn-sm edit-approved-btn" data-row="${t.rowIndex}">Edit</button>
                    <button type="button" class="btn btn-danger btn-sm delete-approved-btn" data-row="${t.rowIndex}">Delete</button>
                  </td>
                </tr>
              `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderReferences() {
  const pendingRefs = referencesList.filter((r) => (r.status || '').toLowerCase() !== 'approved');
  const approvedRefs = referencesList.filter((r) => (r.status || '').toLowerCase() === 'approved');
  referencesCount.textContent = String(pendingRefs.length);

  if (!referencesList.length) {
    referencesContainer.innerHTML = `
      <div class="state-box">
        <strong>No parent references yet.</strong>
        <p style="margin:0.4rem 0 0;">Parent recommendations submitted from the directory will appear here for verification.</p>
      </div>`;
    return;
  }

  const renderRefCard = (r, isPending) => {
    const submittedDate = r.submittedAt
      ? new Date(r.submittedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      : '';
    const phone = formatPhoneLinks(r.parentPhone);
    return `
      <article class="teacher-card">
        <div class="card-top">
          <div>
            <h2 class="teacher-name">${escapeHtml(r.parentName)}</h2>
            <span class="subject-tag">For: ${escapeHtml(r.teacherName)}${r.teacherSl ? ` (#${escapeHtml(r.teacherSl)})` : ''}</span>
          </div>
          <span class="badge ${isPending ? 'badge-pending' : 'badge-online'}">${isPending ? 'Pending' : 'Approved'}</span>
        </div>

        <div class="teacher-comments">${escapeHtml(r.review)}</div>

        ${
          r.subjectGrade || r.duration
            ? `<div class="meta-list">
                 ${r.subjectGrade ? `<div class="meta-item"><span class="meta-label">Subject &amp; Grade</span><span class="meta-value">${escapeHtml(r.subjectGrade)}</span></div>` : ''}
                 ${r.duration ? `<div class="meta-item"><span class="meta-label">Duration</span><span class="meta-value">${escapeHtml(r.duration)}</span></div>` : ''}
               </div>`
            : ''
        }

        <div class="private-box">
          <div class="private-box-title">🔒 Private Moderator Verification</div>
          <div><strong>Community:</strong> ${escapeHtml(r.community || '—')}</div>
          <div>
            <strong>Parent Phone:</strong> ${escapeHtml(r.parentPhone || '—')}
            ${phone ? ` · <a href="${escapeHtml(phone.whatsapp)}" target="_blank" rel="noopener" style="color:var(--primary);font-weight:700;">Verify on WhatsApp ↗</a>` : ''}
          </div>
          ${submittedDate ? `<div style="font-size:0.76rem;color:var(--text-light);margin-top:0.2rem;">Submitted ${escapeHtml(submittedDate)}</div>` : ''}
        </div>

        <div class="card-actions" style="justify-content:flex-end;">
          ${
            isPending
              ? `<button type="button" class="btn btn-danger btn-sm reject-ref-btn" data-id="${escapeHtml(r.id)}">Reject</button>
                 <button type="button" class="btn btn-success btn-sm approve-ref-btn" data-id="${escapeHtml(r.id)}">Approve</button>`
              : `<button type="button" class="btn btn-danger btn-sm reject-ref-btn" data-id="${escapeHtml(r.id)}">Delete</button>`
          }
        </div>
      </article>
    `;
  };

  referencesContainer.innerHTML = `
    ${
      pendingRefs.length
        ? `<h3 style="margin:0 0 0.85rem;font-size:1rem;">Awaiting Verification (${pendingRefs.length})</h3>
           <div class="teacher-grid" style="margin-bottom:2rem;">
             ${pendingRefs.map((r) => renderRefCard(r, true)).join('')}
           </div>`
        : `<div class="state-box" style="margin-bottom:1.5rem;padding:1.75rem;">
             <strong>All parent references reviewed!</strong>
           </div>`
    }
    ${
      approvedRefs.length
        ? `<h3 style="margin:0 0 0.85rem;font-size:1rem;">Published References (${approvedRefs.length})</h3>
           <div class="teacher-grid">
             ${approvedRefs.map((r) => renderRefCard(r, false)).join('')}
           </div>`
        : ''
    }
  `;
}

async function loadDashboardData() {
  pendingContainer.innerHTML = '<div class="state-box"><div class="spinner"></div><div>Loading pending requests...</div></div>';
  referencesContainer.innerHTML = '<div class="state-box"><div class="spinner"></div><div>Loading parent references...</div></div>';
  approvedContainer.innerHTML = '<div class="state-box"><div class="spinner"></div><div>Loading directory...</div></div>';
  refreshBtn.disabled = true;

  try {
    const [pending, references, { teachers }] = await Promise.all([
      fetchPendingRequests(adminPasscode),
      fetchAdminReferences(adminPasscode).catch(() => []),
      fetchTeachers(),
    ]);
    pendingList = pending;
    referencesList = references;
    approvedList = teachers;
    renderPending();
    renderReferences();
    renderApproved();
  } catch (err) {
    showToast(`Error: ${err.message}`);
    if (/passcode|unauthorized/i.test(err.message)) {
      logout();
    }
  } finally {
    refreshBtn.disabled = false;
  }
}

function enterDashboard() {
  loginSection.style.display = 'none';
  dashboardSection.style.display = 'block';
  loadDashboardData();
}

function logout() {
  adminPasscode = '';
  sessionStorage.removeItem(SESSION_KEY);
  dashboardSection.style.display = 'none';
  loginSection.style.display = 'block';
  passcodeInput.value = '';
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.style.display = 'none';
  const code = passcodeInput.value.trim();
  if (!code) return;

  loginBtn.disabled = true;
  loginBtn.textContent = 'Verifying...';
  try {
    await verifyAdminPasscode(code);
    adminPasscode = code;
    sessionStorage.setItem(SESSION_KEY, code);
    enterDashboard();
  } catch (err) {
    showLoginError(err.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Unlock Moderator Dashboard';
  }
});

logoutBtn.addEventListener('click', logout);
refreshBtn.addEventListener('click', loadDashboardData);
adminSearchInput.addEventListener('input', renderApproved);

// Pending actions
pendingContainer.addEventListener('click', async (e) => {
  const approveBtn = e.target.closest('.approve-btn');
  const editApproveBtn = e.target.closest('.edit-approve-btn');
  const rejectBtn = e.target.closest('.reject-btn');

  if (approveBtn) {
    const id = approveBtn.dataset.id;
    const item = pendingList.find((p) => p.id === id);
    if (!item) return;
    approveBtn.disabled = true;
    approveBtn.textContent = 'Approving...';
    try {
      await approveRequest(adminPasscode, id, item);
      showToast(`Approved ${item.name}`);
      await loadDashboardData();
    } catch (err) {
      showToast(`Error: ${err.message}`);
      approveBtn.disabled = false;
      approveBtn.textContent = 'Approve';
    }
  } else if (editApproveBtn) {
    const id = editApproveBtn.dataset.id;
    const item = pendingList.find((p) => p.id === id);
    if (item) openModal({ type: 'approve', item });
  } else if (rejectBtn) {
    const id = rejectBtn.dataset.id;
    const item = pendingList.find((p) => p.id === id);
    if (!item) return;
    if (!confirm(`Reject and remove submission for "${item.name}"?`)) return;
    rejectBtn.disabled = true;
    rejectBtn.textContent = 'Rejecting...';
    try {
      await rejectRequest(adminPasscode, id);
      showToast(`Rejected ${item.name}`);
      await loadDashboardData();
    } catch (err) {
      showToast(`Error: ${err.message}`);
      rejectBtn.disabled = false;
      rejectBtn.textContent = 'Reject';
    }
  }
});

// Approved actions
approvedContainer.addEventListener('click', async (e) => {
  const editBtn = e.target.closest('.edit-approved-btn');
  const deleteBtn = e.target.closest('.delete-approved-btn');

  if (editBtn) {
    const rowIndex = Number(editBtn.dataset.row);
    const item = approvedList.find((t) => t.rowIndex === rowIndex);
    if (item) openModal({ type: 'editApproved', item });
  } else if (deleteBtn) {
    const rowIndex = Number(deleteBtn.dataset.row);
    const item = approvedList.find((t) => t.rowIndex === rowIndex);
    if (!item) return;
    if (!confirm(`Delete "${item.name}" from the published teacher directory?`)) return;
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Deleting...';
    try {
      await deleteTeacher(adminPasscode, rowIndex);
      showToast(`Deleted ${item.name}`);
      await loadDashboardData();
    } catch (err) {
      showToast(`Error: ${err.message}`);
      deleteBtn.disabled = false;
      deleteBtn.textContent = 'Delete';
    }
  }
});

// Modal submit
editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!modalContext) return;

  const updatedData = {
    name: document.getElementById('editName').value.trim(),
    subject: document.getElementById('editSubject').value.trim(),
    multiSingle: document.getElementById('editMulti').value,
    grades: document.getElementById('editGrades').value.trim(),
    board: document.getElementById('editBoard').value.trim(),
    mode: document.getElementById('editMode').value,
    contact: document.getElementById('editContact').value.trim(),
    experience: document.getElementById('editExperience').value.trim(),
    locality: document.getElementById('editLocality').value.trim(),
    comments: document.getElementById('editComments').value.trim(),
  };

  saveModalBtn.disabled = true;
  try {
    if (modalContext.type === 'approve') {
      await approveRequest(adminPasscode, modalContext.item.id, updatedData);
      showToast(`Approved & published ${updatedData.name}`);
    } else {
      await updateTeacher(adminPasscode, modalContext.item.rowIndex, updatedData);
      showToast(`Updated ${updatedData.name}`);
    }
    closeModal();
    await loadDashboardData();
  } catch (err) {
    showToast(`Error: ${err.message}`);
  } finally {
    saveModalBtn.disabled = false;
  }
});

// Reference moderation actions
referencesContainer.addEventListener('click', async (e) => {
  const approveBtn = e.target.closest('.approve-ref-btn');
  const rejectBtn = e.target.closest('.reject-ref-btn');

  if (approveBtn) {
    const id = approveBtn.dataset.id;
    approveBtn.disabled = true;
    approveBtn.textContent = 'Approving...';
    try {
      await approveParentReference(adminPasscode, id);
      showToast('Parent reference approved & published');
      await loadDashboardData();
    } catch (err) {
      showToast(`Error: ${err.message}`);
      approveBtn.disabled = false;
      approveBtn.textContent = 'Approve';
    }
  } else if (rejectBtn) {
    const id = rejectBtn.dataset.id;
    const label = rejectBtn.textContent.trim();
    if (!confirm(`${label} this parent reference?`)) return;
    rejectBtn.disabled = true;
    rejectBtn.textContent = 'Removing...';
    try {
      await deleteParentReference(adminPasscode, id);
      showToast('Parent reference removed');
      await loadDashboardData();
    } catch (err) {
      showToast(`Error: ${err.message}`);
      rejectBtn.disabled = false;
      rejectBtn.textContent = label;
    }
  }
});

// Auto-enter if passcode already in sessionStorage
if (adminPasscode && isBackendConfigured()) {
  enterDashboard();
}
