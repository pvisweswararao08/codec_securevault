/**
 * dashboard.js — Notes CRUD
 *
 * Security: all display uses textContent or escHtml() — never innerHTML
 * with raw user data. This prevents stored XSS even if the backend
 * somehow returns unescaped content.
 */

let allNotes    = [];
let currentFilter = 'all';
let currentPage   = 1;
let totalPages    = 1;
let editingNoteId = null;
let deleteNoteId  = null;
let pinned        = false;
let viewMode      = 'grid'; // 'grid' | 'list'

const NOTE_COLORS = [
  'linear-gradient(180deg,#8b5cf6,#7c3aed)',
  'linear-gradient(180deg,#ec4899,#db2777)',
  'linear-gradient(180deg,#06b6d4,#0ea5e9)',
  'linear-gradient(180deg,#f59e0b,#f97316)',
  'linear-gradient(180deg,#10b981,#14b8a6)',
];

/* ── Init ──────────────────────────────────────────────────────────────── */
(async function init() {
  if (!requireAuth()) return;
  populateNav();
  setGreeting();
  await loadNotes();
})();

/* ── Load notes ────────────────────────────────────────────────────────── */
async function loadNotes(page = 1) {
  currentPage = page;
  const grid = document.getElementById('notesGrid');
  if (!grid) return;

  // Skeleton loading
  grid.innerHTML = Array.from({length: 6}, (_, i) => `
    <div class="note-card" style="animation-delay:${i*0.05}s;">
      <div class="skeleton" style="height:18px; width:70%; margin-bottom:10px;"></div>
      <div class="skeleton" style="height:13px; width:100%; margin-bottom:6px;"></div>
      <div class="skeleton" style="height:13px; width:85%; margin-bottom:6px;"></div>
      <div class="skeleton" style="height:13px; width:60%;"></div>
    </div>
  `).join('');

  try {
    const resp = await api(`/notes?page=${page}&per_page=12`);
    if (!resp) return;
    if (!resp.ok) { showToast('error', 'Could not load notes', ''); return; }

    const data = await resp.json();
    allNotes   = data.notes || [];
    totalPages = data.pages || 1;

    updateStats(data);
    renderNotes(allNotes);
    renderPagination(data.total, data.pages, page);

  } catch (err) {
    showToast('error', 'Connection error', 'Is the Flask backend running on port 5000?');
    grid.innerHTML = '';
    document.getElementById('emptyState').classList.remove('hidden');
  }
}

/* ── Stats ─────────────────────────────────────────────────────────────── */
function updateStats(data) {
  const notes  = data.notes || [];
  const total  = data.total || 0;
  const pinCnt = notes.filter(n => n.is_pinned).length;
  const today  = notes.filter(n => {
    const d = new Date(n.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  setText('sTotalNotes', total);
  setText('sPinned', pinCnt);
  setText('sToday', today);
  setText('countAll', total);
  setText('countPinned', pinCnt);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ── Render notes ──────────────────────────────────────────────────────── */
function renderNotes(notes) {
  const grid      = document.getElementById('notesGrid');
  const emptyEl   = document.getElementById('emptyState');
  const countText = document.getElementById('noteCountText');

  if (!grid) return;

  if (!notes.length) {
    grid.innerHTML = '';
    emptyEl?.classList.remove('hidden');
    if (countText) countText.textContent = '';
    return;
  }

  emptyEl?.classList.add('hidden');
  if (countText) countText.textContent = `${notes.length} note${notes.length !== 1 ? 's' : ''}`;

  grid.innerHTML = notes.map((note, idx) => {
    const color = NOTE_COLORS[idx % NOTE_COLORS.length];
    return `
      <article
        class="note-card${note.is_pinned ? ' is-pinned' : ''}"
        role="listitem"
        style="animation-delay:${idx * 0.05}s; --note-color:${color};"
        onclick="openModal(${note.id})"
        tabindex="0"
        aria-label="Note: ${escHtml(note.title)}"
        onkeydown="if(event.key==='Enter')openModal(${note.id})"
      >
        <div class="note-title">${escHtml(note.title)}</div>
        <div class="note-body">${escHtml(note.content)}</div>
        <div class="note-meta">
          <span class="note-date">${relativeTime(note.updated_at)}</span>
          <div class="note-actions" onclick="event.stopPropagation()">
            ${note.is_pinned
              ? `<button class="btn btn-ghost btn-xs" onclick="quickPin(${note.id},false)" title="Unpin" data-tooltip="Unpin">📍</button>`
              : `<button class="btn btn-ghost btn-xs" onclick="quickPin(${note.id},true)" title="Pin" data-tooltip="Pin">📌</button>`
            }
            <button class="btn btn-danger btn-xs" onclick="openDeleteModal(${note.id},'${escHtml(note.title).replace(/'/g,"\\'")}' )" title="Delete" data-tooltip="Delete">🗑️</button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

/* ── Filter ────────────────────────────────────────────────────────────── */
function filterNotes(type) {
  currentFilter = type;
  ['all','pinned','recent'].forEach(f => {
    document.getElementById(`filter${f.charAt(0).toUpperCase()+f.slice(1)}`)
      ?.classList.toggle('active', f === type);
  });

  let filtered = [...allNotes];
  if (type === 'pinned') filtered = allNotes.filter(n => n.is_pinned);
  if (type === 'recent') filtered = [...allNotes].sort(
    (a,b) => new Date(b.updated_at) - new Date(a.updated_at)
  ).slice(0, 6);

  renderNotes(filtered);
}

/* ── Search ────────────────────────────────────────────────────────────── */
function searchNotes(q) {
  const query = q.toLowerCase().trim();
  if (!query) { renderNotes(allNotes); return; }
  const filtered = allNotes.filter(n =>
    n.title.toLowerCase().includes(query) ||
    n.content.toLowerCase().includes(query)
  );
  renderNotes(filtered);
}

/* ── View toggle ───────────────────────────────────────────────────────── */
function setView(mode) {
  viewMode = mode;
  const grid = document.getElementById('notesGrid');
  if (!grid) return;
  grid.classList.toggle('list-view', mode === 'list');
  document.getElementById('viewGrid')?.classList.toggle('active', mode === 'grid');
  document.getElementById('viewList')?.classList.toggle('active', mode === 'list');
}

/* ── Pagination ────────────────────────────────────────────────────────── */
function renderPagination(total, pages, page) {
  const el = document.getElementById('pagination');
  if (!el) return;
  if (pages <= 1) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');

  let html = '';
  if (page > 1) html += `<button class="pg-btn" onclick="loadNotes(${page-1})">‹</button>`;
  for (let i = 1; i <= pages; i++) {
    html += `<button class="pg-btn${i===page?' active':''}" onclick="loadNotes(${i})">${i}</button>`;
  }
  if (page < pages) html += `<button class="pg-btn" onclick="loadNotes(${page+1})">›</button>`;
  el.innerHTML = html;
}

/* ── Modal ─────────────────────────────────────────────────────────────── */
function openModal(noteId = null) {
  editingNoteId = noteId;
  pinned = false;

  const overlay  = document.getElementById('noteOverlay');
  const titleEl  = document.getElementById('modalTitle');
  const titleInp = document.getElementById('noteTitle');
  const contentInp = document.getElementById('noteContent');
  const pinSwitch = document.getElementById('pinSwitch');

  if (noteId) {
    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;
    if (titleEl)    titleEl.textContent    = '✏️ Edit Note';
    if (titleInp)   titleInp.value         = note.title;
    if (contentInp) contentInp.value       = note.content;
    pinned = note.is_pinned;
    updateCharCount(contentInp);
  } else {
    if (titleEl)    titleEl.textContent    = '✏️ New Note';
    if (titleInp)   titleInp.value         = '';
    if (contentInp) contentInp.value       = '';
    updateCharCount(contentInp);
  }

  if (pinSwitch) pinSwitch.classList.toggle('on', pinned);
  overlay?.classList.add('open');
  titleInp?.focus();
}

function closeModal() {
  document.getElementById('noteOverlay')?.classList.remove('open');
  editingNoteId = null;
}

function togglePin() {
  pinned = !pinned;
  document.getElementById('pinSwitch')?.classList.toggle('on', pinned);
}

function updateCharCount(textarea) {
  const el = document.getElementById('charCount');
  if (!el || !textarea) return;
  const len = textarea.value.length;
  el.textContent = `${len.toLocaleString()} / 10,000`;
  el.className = 'char-count' + (len > 9500 ? ' over' : len > 8000 ? ' warn' : '');
}

/* ── Save note ─────────────────────────────────────────────────────────── */
async function saveNote() {
  const title   = document.getElementById('noteTitle')?.value.trim();
  const content = document.getElementById('noteContent')?.value.trim();

  if (!title)   { showToast('warning', 'Title required', 'Give your note a title first.'); return; }
  if (!content) { showToast('warning', 'Content required', "Can't save an empty note!"); return; }

  setLoading('saveBtn', true);

  try {
    const body = { title, content, is_pinned: pinned };
    const resp = editingNoteId
      ? await api(`/notes/${editingNoteId}`, { method: 'PUT', body: JSON.stringify(body) })
      : await api('/notes', { method: 'POST', body: JSON.stringify(body) });

    if (!resp || !resp.ok) {
      const d = await resp?.json();
      showToast('error', 'Save failed', d?.error || d?.errors?.join(' · ') || '');
      return;
    }

    showToast('success',
      editingNoteId ? 'Note updated ✅' : 'Note created 🎉',
      editingNoteId ? 'Your changes are saved.' : 'Your new note is ready.'
    );
    closeModal();
    await loadNotes(currentPage);

  } catch (err) {
    showToast('error', 'Connection error', 'Check the backend is running.');
  } finally {
    setLoading('saveBtn', false);
  }
}

/* ── Quick pin toggle ──────────────────────────────────────────────────── */
async function quickPin(id, shouldPin) {
  try {
    const resp = await api(`/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ is_pinned: shouldPin }),
    });
    if (resp?.ok) {
      showToast('info', shouldPin ? '📌 Pinned!' : '📍 Unpinned', '');
      await loadNotes(currentPage);
    }
  } catch (_) {
    showToast('error', 'Could not update pin status', '');
  }
}

/* ── Delete modal ──────────────────────────────────────────────────────── */
function openDeleteModal(id, title) {
  deleteNoteId = id;
  const titleEl = document.getElementById('deleteNoteTitle');
  if (titleEl) titleEl.textContent = title;
  document.getElementById('deleteOverlay')?.classList.add('open');
}

function closeDeleteModal() {
  document.getElementById('deleteOverlay')?.classList.remove('open');
  deleteNoteId = null;
}

async function confirmDelete() {
  if (!deleteNoteId) return;
  setLoading('confirmDeleteBtn', true);

  try {
    const resp = await api(`/notes/${deleteNoteId}`, { method: 'DELETE' });
    if (resp?.ok) {
      showToast('success', 'Note deleted 🗑️', 'Gone forever.');
      closeDeleteModal();
      await loadNotes(currentPage);
    } else {
      showToast('error', 'Delete failed', '');
    }
  } catch (_) {
    showToast('error', 'Connection error', '');
  } finally {
    setLoading('confirmDeleteBtn', false);
  }
}

/* ── Close modals on overlay click ────────────────────────────────────── */
document.getElementById('noteOverlay')?.addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
document.getElementById('deleteOverlay')?.addEventListener('click', function(e) {
  if (e.target === this) closeDeleteModal();
});

/* ── Keyboard shortcut: N = new note ───────────────────────────────────── */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); closeDeleteModal(); }
  if (e.key === 'n' && document.activeElement.tagName !== 'INPUT'
      && document.activeElement.tagName !== 'TEXTAREA') {
    openModal();
  }
});
