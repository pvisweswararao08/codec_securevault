/**
 * admin.js — Admin panel: user management, security log, OWASP status
 *
 * Only admins can reach this page — enforced by requireAdmin() which
 * checks the JWT role claim AND redirects if the user is not an admin.
 */

let allUsers   = [];
let filteredUsers = [];
let editUserId = null;
let delUserId  = null;
let userPage   = 1;
const USERS_PER_PAGE = 10;

/* ── Init ──────────────────────────────────────────────────────────────── */
(async function init() {
  if (!requireAdmin()) return;
  populateNav();

  // Populate nav avatar
  const user = Auth.getUser();
  const avatarEl = document.getElementById('navAvatar');
  if (avatarEl) avatarEl.textContent = (user?.username?.[0] || 'A').toUpperCase();

  await Promise.all([loadStats(), loadUsers()]);
  showSection('users');
})();

/* ── Stats ─────────────────────────────────────────────────────────────── */
async function loadStats() {
  try {
    const resp = await api('/users/stats');
    if (!resp?.ok) return;
    const d = await resp.json();

    setText('statTotal',  d.total_users  ?? '–');
    setText('statAdmins', d.admin_users  ?? '–');
    setText('statActive', d.active_users ?? '–');
    setText('statLocked', d.locked_users ?? '–');
    setText('statNotes',  d.total_notes  ?? '–');
    setText('sideUserCount', d.total_users ?? '–');
  } catch (_) { /* stats are non-critical */ }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ── Load users ────────────────────────────────────────────────────────── */
async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="7" style="text-align:center; padding:40px; color:var(--text-muted);">
        <div class="spinner" style="margin:0 auto 12px;"></div>
        Loading users…
      </td>
    </tr>
  `;

  try {
    const resp = await api('/users?per_page=100');
    if (!resp?.ok) { showToast('error', 'Could not load users', ''); return; }
    const data = await resp.json();
    allUsers = data.users || [];
    filteredUsers = [...allUsers];
    renderUsers();
  } catch (err) {
    showToast('error', 'Connection error', 'Check the backend is running.');
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:40px; color:var(--error);">
          ❌ Could not connect to the backend.
        </td>
      </tr>
    `;
  }
}

/* ── Render users table ────────────────────────────────────────────────── */
function renderUsers() {
  const tbody = document.getElementById('usersTableBody');
  const pagination = document.getElementById('userPagination');
  if (!tbody) return;

  const start   = (userPage - 1) * USERS_PER_PAGE;
  const paged   = filteredUsers.slice(start, start + USERS_PER_PAGE);
  const pages   = Math.ceil(filteredUsers.length / USERS_PER_PAGE);
  const me      = Auth.getUser();

  if (!paged.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:40px; color:var(--text-muted);">
          No users found.
        </td>
      </tr>
    `;
    if (pagination) pagination.innerHTML = '';
    return;
  }

  tbody.innerHTML = paged.map(u => {
    const isMe = u.id === me?.id;
    const initials = (u.username?.[0] || 'U').toUpperCase();
    const locked   = u.lockout_until && new Date(u.lockout_until) > new Date();

    return `
      <tr id="row-${u.id}">
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="avatar" style="
              background: ${u.role === 'admin' ? 'var(--grad-brand)' : 'linear-gradient(135deg,#374151,#1f2937)'};
              width:32px; height:32px; font-size:13px;
            ">${escHtml(initials)}</div>
            <div>
              <div style="font-weight:600; color:var(--text-primary); font-size:13px;">
                ${escHtml(u.username)}
                ${isMe ? '<span class="badge badge-new" style="margin-left:6px; font-size:9px;">You</span>' : ''}
              </div>
              <div style="font-size:11px; color:var(--text-muted); font-family:monospace;">
                ID #${u.id}
              </div>
            </div>
          </div>
        </td>
        <td style="color:var(--text-secondary);">${escHtml(u.email)}</td>
        <td>
          <span class="badge ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}">
            ${u.role === 'admin' ? '🛡️ Admin' : '👤 User'}
          </span>
        </td>
        <td>
          ${locked
            ? '<span class="badge badge-locked">🔒 Locked</span>'
            : u.is_active
              ? '<span class="badge badge-active">✅ Active</span>'
              : '<span class="badge badge-locked">🚫 Inactive</span>'
          }
        </td>
        <td style="color:var(--text-muted); font-size:12px; font-family:monospace;">
          ${relativeTime(u.last_login)}
        </td>
        <td>
          <span style="color:${u.failed_login_count >= 3 ? 'var(--error)' : 'var(--text-muted)'}; font-size:13px; font-weight:600;">
            ${u.failed_login_count} / 5
          </span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button
              class="btn btn-ghost btn-xs"
              onclick="openEditModal(${u.id})"
              ${isMe ? 'disabled title="Cannot edit yourself via admin panel"' : ''}
            >✏️ Edit</button>
            <button
              class="btn btn-danger btn-xs"
              onclick="openDeleteUserModal(${u.id},'${escHtml(u.username).replace(/'/g,"\\'")}')"
              ${isMe ? 'disabled title="Cannot delete yourself"' : ''}
            >🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Pagination
  if (pagination) {
    if (pages <= 1) {
      pagination.innerHTML = '';
    } else {
      let html = '';
      if (userPage > 1) html += `<button class="pg-btn" onclick="userPage--;renderUsers()">‹</button>`;
      for (let i = 1; i <= pages; i++) {
        html += `<button class="pg-btn${i===userPage?' active':''}" onclick="userPage=${i};renderUsers()">${i}</button>`;
      }
      if (userPage < pages) html += `<button class="pg-btn" onclick="userPage++;renderUsers()">›</button>`;
      pagination.innerHTML = html;
    }
  }
}

/* ── Filter users ──────────────────────────────────────────────────────── */
function filterUsers(searchVal) {
  const q    = (searchVal ?? document.getElementById('userSearch')?.value ?? '').toLowerCase().trim();
  const role = document.getElementById('roleFilter')?.value ?? '';

  filteredUsers = allUsers.filter(u => {
    const matchQ    = !q || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchRole = !role || u.role === role;
    return matchQ && matchRole;
  });

  userPage = 1;
  renderUsers();
}

/* ── Section switcher ──────────────────────────────────────────────────── */
function showSection(name) {
  ['users','logs','owasp'].forEach(s => {
    document.getElementById(`section-${s}`)?.classList.toggle('active', s === name);
    document.getElementById(`tab-${s}`)?.classList.toggle('active', s === name);
    document.getElementById(`side${s.charAt(0).toUpperCase()+s.slice(1)}`)
      ?.classList.toggle('active', s === name);
  });
}

/* ── Edit modal ────────────────────────────────────────────────────────── */
function openEditModal(id) {
  const user = allUsers.find(u => u.id === id);
  if (!user) return;
  editUserId = id;

  const initials = (user.username?.[0] || 'U').toUpperCase();
  document.getElementById('editAvatar').textContent    = initials;
  document.getElementById('editUsernameLarge').textContent = user.username;
  document.getElementById('editEmailLarge').textContent    = user.email;
  document.getElementById('editRole').value             = user.role;
  document.getElementById('editUserId').value           = id;
  document.getElementById('editOverlay')?.classList.add('open');
}

function closeEditModal() {
  document.getElementById('editOverlay')?.classList.remove('open');
  editUserId = null;
}

async function saveUserEdit() {
  if (!editUserId) return;
  const role = document.getElementById('editRole')?.value;
  setLoading('confirmDeleteBtn', true); // reuse pattern

  try {
    const resp = await api(`/users/${editUserId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });

    if (!resp?.ok) {
      const d = await resp?.json();
      showToast('error', 'Update failed', d?.error || '');
      return;
    }

    showToast('success', 'User updated ✅', `Role set to ${role}.`);
    closeEditModal();
    await loadUsers();
    await loadStats();

  } catch (_) {
    showToast('error', 'Connection error', '');
  } finally {
    setLoading('confirmDeleteBtn', false);
  }
}

async function setUserStatus(active) {
  if (!editUserId) return;
  try {
    const resp = await api(`/users/${editUserId}`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: active }),
    });
    if (resp?.ok) {
      showToast('success', active ? 'User activated ✅' : 'User deactivated 🚫', '');
      closeEditModal();
      await loadUsers();
      await loadStats();
    } else {
      const d = await resp?.json();
      showToast('error', 'Update failed', d?.error || '');
    }
  } catch (_) {
    showToast('error', 'Connection error', '');
  }
}

/* ── Delete user modal ─────────────────────────────────────────────────── */
function openDeleteUserModal(id, username) {
  delUserId = id;
  const nameEl = document.getElementById('deleteUsername');
  if (nameEl) nameEl.textContent = username;
  document.getElementById('deleteUserOverlay')?.classList.add('open');
}

function closeDeleteUserModal() {
  document.getElementById('deleteUserOverlay')?.classList.remove('open');
  delUserId = null;
}

async function confirmDeleteUser() {
  if (!delUserId) return;
  setLoading('confirmDeleteUserBtn', true);
  try {
    const resp = await api(`/users/${delUserId}`, { method: 'DELETE' });
    if (resp?.ok) {
      showToast('success', 'User deleted 🗑️', 'All their data has been removed.');
      closeDeleteUserModal();
      await loadUsers();
      await loadStats();
    } else {
      const d = await resp?.json();
      showToast('error', 'Delete failed', d?.error || '');
    }
  } catch (_) {
    showToast('error', 'Connection error', '');
  } finally {
    setLoading('confirmDeleteUserBtn', false);
  }
}

/* ── Close overlays on backdrop click ──────────────────────────────────── */
['editOverlay','deleteUserOverlay'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', function(e) {
    if (e.target === this) {
      closeEditModal();
      closeDeleteUserModal();
    }
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeEditModal(); closeDeleteUserModal(); }
});
