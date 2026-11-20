import {
  fetchTeachers,
  submitParentReference,
  normalizeMode,
  normalizeBoard,
  extractSubjectTags,
  matchesGradeFilter,
  extractBoardTags,
  formatExperience,
  formatPhoneLinks,
  escapeHtml,
} from './api.js';

const searchInput = document.getElementById('searchInput');
const subjectMultiSelect = document.getElementById('subjectMultiSelect');
const subjectTrigger = document.getElementById('subjectTrigger');
const subjectSearchInput = document.getElementById('subjectSearchInput');
const clearSubjectsBtn = document.getElementById('clearSubjectsBtn');
const subjectOptions = document.getElementById('subjectOptions');
const selectedSubjectsBar = document.getElementById('selectedSubjectsBar');
const gradeFilter = document.getElementById('gradeFilter');
const boardFilter = document.getElementById('boardFilter');
const modeFilter = document.getElementById('modeFilter');
const localityFilter = document.getElementById('localityFilter');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const resultsCount = document.getElementById('resultsCount');
const resultsContainer = document.getElementById('resultsContainer');
const cardViewBtn = document.getElementById('cardViewBtn');
const tableViewBtn = document.getElementById('tableViewBtn');
const toastEl = document.getElementById('toast');
const statTeachers = document.getElementById('statTeachers');
const statSubjects = document.getElementById('statSubjects');
const statOnline = document.getElementById('statOnline');

const ICONS = {
  phone: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`,
  message: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>`,
  copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
};

function updateStats(teachers) {
  if (!statTeachers) return;
  const uniqueSubjects = new Set(teachers.map((t) => t.subject.trim().toLowerCase()).filter(Boolean));
  const onlineOrHybrid = teachers.filter((t) => {
    const m = normalizeMode(t.mode);
    return m === 'Online' || m === 'Hybrid';
  }).length;
  statTeachers.textContent = String(teachers.length);
  statSubjects.textContent = String(uniqueSubjects.size);
  statOnline.textContent = String(onlineOrHybrid);
}

let allTeachers = [];
let allReferences = [];
let subjectEntries = []; // [{ name, count }]
const selectedSubjects = new Set();
let currentView = 'cards';
let activeRefTeacher = null;

const refModalBackdrop = document.getElementById('refModalBackdrop');
const refModalSubtitle = document.getElementById('refModalSubtitle');
const refModalAlert = document.getElementById('refModalAlert');
const closeRefModalBtn = document.getElementById('closeRefModalBtn');
const cancelRefModalBtn = document.getElementById('cancelRefModalBtn');
const refForm = document.getElementById('refForm');
const submitRefBtn = document.getElementById('submitRefBtn');

function getReferencesForTeacher(teacher) {
  return allReferences.filter((ref) => {
    if (teacher.sl && ref.teacherSl) {
      return String(ref.teacherSl).trim() === String(teacher.sl).trim();
    }
    return (ref.teacherName || '').trim().toLowerCase() === (teacher.name || '').trim().toLowerCase();
  });
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function getModeBadgeClass(normalizedMode) {
  if (normalizedMode === 'Online') return 'badge-online';
  if (normalizedMode === 'Offline') return 'badge-offline';
  if (normalizedMode === 'Hybrid') return 'badge-hybrid';
  return 'badge-neutral';
}

function renderSubjectOptions() {
  const filterText = subjectSearchInput.value.trim().toLowerCase();
  const visible = filterText
    ? subjectEntries.filter((entry) => entry.name.toLowerCase().includes(filterText))
    : subjectEntries;

  if (!visible.length) {
    subjectOptions.innerHTML =
      '<div style="padding:0.75rem;text-align:center;font-size:0.84rem;color:var(--text-light);">No matching subjects</div>';
    return;
  }

  subjectOptions.innerHTML = visible
    .map((entry) => {
      const checked = selectedSubjects.has(entry.name) ? 'checked' : '';
      return `
        <label class="multi-select-option">
          <span class="multi-select-option-left">
            <input type="checkbox" value="${escapeHtml(entry.name)}" ${checked} />
            <span>${escapeHtml(entry.name)}</span>
          </span>
          <span class="multi-select-count">${entry.count}</span>
        </label>
      `;
    })
    .join('');
}

function updateSubjectUI() {
  const picked = [...selectedSubjects];
  if (picked.length === 0) {
    subjectTrigger.textContent = 'All Subjects';
    selectedSubjectsBar.style.display = 'none';
    selectedSubjectsBar.innerHTML = '';
  } else {
    if (picked.length <= 2) {
      subjectTrigger.textContent = picked.join(', ');
    } else {
      subjectTrigger.textContent = `${picked.slice(0, 2).join(', ')} +${picked.length - 2} more`;
    }
    selectedSubjectsBar.style.display = 'flex';
    selectedSubjectsBar.innerHTML = picked
      .map(
        (subj) => `
          <span class="selected-chip">
            ${escapeHtml(subj)}
            <button type="button" class="remove-subject-chip" data-subject="${escapeHtml(subj)}" aria-label="Remove ${escapeHtml(subj)}">×</button>
          </span>
        `
      )
      .join('');
  }
  renderSubjectOptions();
}

function setSubjectDropdownOpen(isOpen) {
  subjectMultiSelect.classList.toggle('open', isOpen);
  subjectTrigger.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) {
    subjectSearchInput.focus();
  }
}

function populateDropdowns(teachers) {
  const counts = new Map();
  teachers.forEach((t) => {
    t.subjectTags = extractSubjectTags(t.subject);
    t.subjectTags.forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });

  subjectEntries = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  updateSubjectUI();

  const localities = [...new Set(teachers.map((t) => t.locality.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  localityFilter.innerHTML =
    '<option value="">All Localities</option>' +
    localities.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
}

function getFilteredTeachers() {
  const q = searchInput.value.trim().toLowerCase();
  const grade = gradeFilter.value;
  const board = boardFilter.value;
  const mode = modeFilter.value;
  const locality = localityFilter.value;

  return allTeachers.filter((t) => {
    if (selectedSubjects.size > 0) {
      const tags = t.subjectTags || [];
      const matchesSubject = tags.some((tag) => selectedSubjects.has(tag));
      if (!matchesSubject) return false;
    }
    if (grade && !matchesGradeFilter(t.grades, grade)) {
      return false;
    }
    if (board) {
      const tags = extractBoardTags(t.board);
      if (!tags.includes(board)) return false;
    }
    if (mode) {
      const norm = normalizeMode(t.mode);
      // If user filters Online or Offline, include Hybrid teachers too?
      // Exact match on Hybrid, or include Hybrid when searching Online/Offline:
      if (mode === 'Hybrid') {
        if (norm !== 'Hybrid') return false;
      } else if (norm !== mode && norm !== 'Hybrid') {
        return false;
      }
    }
    if (locality && t.locality.trim().toLowerCase() !== locality.toLowerCase()) {
      return false;
    }
    if (q) {
      const haystack = [
        t.name,
        t.subject,
        t.grades,
        t.board,
        t.mode,
        t.locality,
        t.comments,
        t.contact,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function renderCards(teachers) {
  if (!teachers.length) {
    resultsContainer.innerHTML = `
      <div class="state-box">
        <strong>No teachers match your search.</strong>
        <p style="margin:0.4rem 0 0;">Try clearing one of the filters or using a broader keyword.</p>
      </div>`;
    return;
  }

  resultsContainer.innerHTML = `
    <div class="teacher-grid">
      ${teachers
        .map((t) => {
          const mode = normalizeMode(t.mode);
          const board = normalizeBoard(t.board);
          const experience = formatExperience(t.experience);
          const phone = formatPhoneLinks(t.contact);
          return `
            <article class="teacher-card">
              <div class="card-top">
                <div class="teacher-heading">
                  <h2 class="teacher-name">${escapeHtml(t.name)}</h2>
                  <span class="subject-tag">${escapeHtml(t.subject || 'General')}</span>
                </div>
                <span class="badge ${getModeBadgeClass(mode)}">${escapeHtml(mode)}</span>
              </div>

              <div class="meta-list">
                <div class="meta-item">
                  <span class="meta-label">Grade(s)</span>
                  <span class="meta-value">${escapeHtml(t.grades || 'Not Specified')}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">Board</span>
                  <span class="meta-value">${escapeHtml(board)}</span>
                </div>
                ${
                  experience
                    ? `<div class="meta-item">
                         <span class="meta-label">Experience</span>
                         <span class="meta-value">${escapeHtml(experience)}</span>
                       </div>`
                    : ''
                }
                ${
                  t.locality
                    ? `<div class="meta-item${experience ? '' : ' full'}">
                         <span class="meta-label">Locality (Offline)</span>
                         <span class="meta-value">${escapeHtml(t.locality)}</span>
                       </div>`
                    : ''
                }
              </div>

              ${
                t.comments
                  ? `<div class="teacher-comments">${escapeHtml(t.comments)}</div>`
                  : ''
              }

              <div class="card-actions">
                <span class="phone-display">${ICONS.phone}${escapeHtml(t.contact || 'No contact listed')}</span>
                ${
                  phone
                    ? `<div class="contact-btns">
                         <a class="btn btn-secondary btn-sm" href="${escapeHtml(phone.tel)}">Call</a>
                         <a class="btn btn-primary btn-sm" href="${escapeHtml(phone.whatsapp)}" target="_blank" rel="noopener">${ICONS.message}WhatsApp</a>
                         <button type="button" class="btn btn-secondary btn-sm btn-icon copy-btn" data-phone="${escapeHtml(phone.display)}" title="Copy phone number" aria-label="Copy phone number">${ICONS.copy}</button>
                       </div>`
                    : ''
                }
              </div>

              ${(() => {
                const refs = getReferencesForTeacher(t);
                const teacherKey = t.sl || t.name;
                return `
                  <details class="refs-dropdown">
                    <summary>Parent References (${refs.length})</summary>
                    <div class="refs-body">
                      ${
                        refs.length
                          ? refs
                              .map(
                                (r) => `
                                  <div class="ref-item">
                                    <div class="ref-author">${escapeHtml(r.parentName)}</div>
                                    <div class="ref-review">${escapeHtml(r.review)}</div>
                                  </div>
                                `
                              )
                              .join('')
                          : '<div class="refs-empty">No parent references yet.</div>'
                      }
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm add-ref-btn"
                        data-sl="${escapeHtml(t.sl || '')}"
                        data-name="${escapeHtml(t.name)}"
                        data-contact="${escapeHtml(t.contact || '')}"
                        data-key="${escapeHtml(teacherKey)}"
                        style="align-self:flex-start;"
                      >+ Add a Parent Reference</button>
                    </div>
                  </details>
                `;
              })()}
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderTable(teachers) {
  if (!teachers.length) {
    resultsContainer.innerHTML = `
      <div class="state-box">
        <strong>No teachers match your search.</strong>
        <p style="margin:0.4rem 0 0;">Try clearing one of the filters or using a broader keyword.</p>
      </div>`;
    return;
  }

  resultsContainer.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Teacher</th>
            <th>Subject</th>
            <th>Grade(s)</th>
            <th>Board</th>
            <th>Mode</th>
            <th>Experience</th>
            <th>Locality</th>
            <th>Contact</th>
            <th>Comments</th>
          </tr>
        </thead>
        <tbody>
          ${teachers
            .map((t) => {
              const mode = normalizeMode(t.mode);
              const board = normalizeBoard(t.board);
              const experience = formatExperience(t.experience);
              const phone = formatPhoneLinks(t.contact);
              return `
                <tr>
                  <td><strong>${escapeHtml(t.name)}</strong></td>
                  <td>${escapeHtml(t.subject)}</td>
                  <td>${escapeHtml(t.grades || '—')}</td>
                  <td>${escapeHtml(board)}</td>
                  <td><span class="badge ${getModeBadgeClass(mode)}">${escapeHtml(mode)}</span></td>
                  <td style="white-space:nowrap;">${escapeHtml(experience || '—')}</td>
                  <td>${escapeHtml(t.locality || '—')}</td>
                  <td style="white-space:nowrap;">
                    ${
                      phone
                        ? `<a href="${escapeHtml(phone.tel)}" class="table-phone-link">${escapeHtml(phone.display)}</a>`
                        : escapeHtml(t.contact || '—')
                    }
                  </td>
                  <td>${escapeHtml(t.comments || '—')}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function render() {
  const filtered = getFilteredTeachers();
  resultsCount.textContent = `Showing ${filtered.length} of ${allTeachers.length} teacher${allTeachers.length === 1 ? '' : 's'}`;
  if (currentView === 'cards') {
    renderCards(filtered);
  } else {
    renderTable(filtered);
  }
}

resultsContainer.addEventListener('click', async (e) => {
  const copyBtn = e.target.closest('.copy-btn');
  if (copyBtn) {
    const phone = copyBtn.dataset.phone;
    try {
      await navigator.clipboard.writeText(phone);
      showToast(`Copied ${phone}`);
    } catch {
      showToast('Could not copy to clipboard');
    }
    return;
  }

  const addRefBtn = e.target.closest('.add-ref-btn');
  if (addRefBtn) {
    openRefModal({
      sl: addRefBtn.dataset.sl,
      name: addRefBtn.dataset.name,
      contact: addRefBtn.dataset.contact,
    });
  }
});

function openRefModal(teacher) {
  activeRefTeacher = teacher;
  refForm.reset();
  refModalAlert.style.display = 'none';
  refModalSubtitle.textContent = `Recommending: ${teacher.name}`;
  refModalBackdrop.classList.add('open');
  document.getElementById('refParentName').focus();
}

function closeRefModal() {
  refModalBackdrop.classList.remove('open');
  activeRefTeacher = null;
}

closeRefModalBtn.addEventListener('click', closeRefModal);
cancelRefModalBtn.addEventListener('click', closeRefModal);
refModalBackdrop.addEventListener('click', (e) => {
  if (e.target === refModalBackdrop) closeRefModal();
});

refForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activeRefTeacher) return;
  refModalAlert.style.display = 'none';

  const parentName = document.getElementById('refParentName').value.trim();
  const review = document.getElementById('refReview').value.trim();
  const parentPhone = document.getElementById('refParentPhone').value.trim();
  const community = document.getElementById('refCommunity').value.trim();

  const showRefError = (msg) => {
    refModalAlert.className = 'alert alert-danger';
    refModalAlert.innerHTML = `<span>❌</span><div>${escapeHtml(msg)}</div>`;
    refModalAlert.style.display = 'flex';
  };

  if (!parentName || !review || !parentPhone || !community) {
    return showRefError('Please fill in all required fields.');
  }
  if (review.length < 10) {
    return showRefError('Please write a brief review (at least 10 characters).');
  }
  if (parentPhone.replace(/\D/g, '').length < 7) {
    return showRefError('Please enter a valid phone number.');
  }

  submitRefBtn.disabled = true;
  submitRefBtn.textContent = 'Submitting...';
  try {
    await submitParentReference({
      teacherSl: activeRefTeacher.sl,
      teacherName: activeRefTeacher.name,
      teacherContact: activeRefTeacher.contact,
      parentName,
      parentPhone,
      community,
      review,
    });
    closeRefModal();
    showToast('Reference submitted! It will appear after moderator approval.');
  } catch (err) {
    showRefError(err.message);
  } finally {
    submitRefBtn.disabled = false;
    submitRefBtn.textContent = 'Submit Reference';
  }
});

// Multi-select Subject dropdown events
subjectTrigger.addEventListener('click', () => {
  const isOpen = subjectMultiSelect.classList.contains('open');
  setSubjectDropdownOpen(!isOpen);
});

subjectSearchInput.addEventListener('input', renderSubjectOptions);

subjectOptions.addEventListener('change', (e) => {
  const cb = e.target.closest('input[type="checkbox"]');
  if (!cb) return;
  if (cb.checked) {
    selectedSubjects.add(cb.value);
  } else {
    selectedSubjects.delete(cb.value);
  }
  updateSubjectUI();
  render();
});

clearSubjectsBtn.addEventListener('click', () => {
  selectedSubjects.clear();
  subjectSearchInput.value = '';
  updateSubjectUI();
  render();
});

selectedSubjectsBar.addEventListener('click', (e) => {
  const btn = e.target.closest('.remove-subject-chip');
  if (!btn) return;
  selectedSubjects.delete(btn.dataset.subject);
  updateSubjectUI();
  render();
});

document.addEventListener('click', (e) => {
  if (!subjectMultiSelect.contains(e.target)) {
    setSubjectDropdownOpen(false);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && subjectMultiSelect.classList.contains('open')) {
    setSubjectDropdownOpen(false);
    subjectTrigger.focus();
  }
});

[searchInput, gradeFilter, boardFilter, modeFilter, localityFilter].forEach((el) => {
  el.addEventListener('input', render);
  el.addEventListener('change', render);
});

resetFiltersBtn.addEventListener('click', () => {
  searchInput.value = '';
  selectedSubjects.clear();
  subjectSearchInput.value = '';
  updateSubjectUI();
  gradeFilter.value = '';
  boardFilter.value = '';
  modeFilter.value = '';
  localityFilter.value = '';
  render();
});

cardViewBtn.addEventListener('click', () => {
  currentView = 'cards';
  cardViewBtn.classList.add('active');
  tableViewBtn.classList.remove('active');
  render();
});

tableViewBtn.addEventListener('click', () => {
  currentView = 'table';
  tableViewBtn.classList.add('active');
  cardViewBtn.classList.remove('active');
  render();
});

async function init() {
  try {
    const { teachers, references } = await fetchTeachers();
    allTeachers = teachers;
    allReferences = references || [];
    updateStats(allTeachers);
    populateDropdowns(allTeachers);
    render();
  } catch (err) {
    resultsCount.textContent = 'Unable to load directory';
    resultsContainer.innerHTML = `
      <div class="state-box">
        <strong>Could not load teachers from Google Sheets.</strong>
        <p style="margin:0.5rem 0 0;">${escapeHtml(err.message)}</p>
      </div>`;
  }
}

init();
