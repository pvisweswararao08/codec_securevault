/**
 * auth.js — Shared authentication utilities
 *
 * Security notes:
 * - Tokens are stored in sessionStorage (not localStorage) to limit XSS exposure.
 *   sessionStorage is cleared when the tab closes.
 * - All API calls go through the `api()` helper which attaches Bearer tokens
 *   and handles 401 (expired token) with automatic refresh.
 * - Passwords and sensitive fields are NEVER logged to the console.
 */

// Auto-detect API base: if served by Flask (port 5000) use same origin,
// otherwise fall back to the Flask backend URL.
const API = (window.location.port === '5000' || window.location.protocol === 'file:')
  ? `${window.location.protocol}//${window.location.hostname}:5000/api`
  : 'http://127.0.0.1:5000/api';

/* ── Token management ──────────────────────────────────────────────────── */
const Auth = {
  getAccess()  { return sessionStorage.getItem('access_token'); },
  getRefresh() { return sessionStorage.getItem('refresh_token'); },
  getUser()    { return JSON.parse(sessionStorage.getItem('user') || 'null'); },

  save(data) {
    sessionStorage.setItem('access_token',  data.access_token);
    sessionStorage.setItem('refresh_token', data.refresh_token);
    sessionStorage.setItem('user',          JSON.stringify(data.user));
  },

  clear() {
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('user');
  },

  isLoggedIn() { return !!this.getAccess(); },
  isAdmin()    { return this.getUser()?.role === 'admin'; },
};

/* ── API helper ────────────────────────────────────────────────────────── */
let _refreshing = false;

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = Auth.getAccess();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let resp = await fetch(`${API}${path}`, { ...options, headers });

  // Auto-refresh on 401 TOKEN_EXPIRED
  if (resp.status === 401 && !_refreshing) {
    const body = await resp.json().catch(() => ({}));
    if (body.code === 'TOKEN_EXPIRED' && Auth.getRefresh()) {
      _refreshing = true;
      try {
        const rr = await fetch(`${API}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Auth.getRefresh()}`,
          },
        });
        if (rr.ok) {
          const tokens = await rr.json();
          // Preserve existing user data during refresh
          Auth.save({ ...tokens, user: Auth.getUser() });
          headers['Authorization'] = `Bearer ${tokens.access_token}`;
          resp = await fetch(`${API}${path}`, { ...options, headers });
        } else {
          Auth.clear();
          window.location.href = 'index.html';
          return null;
        }
      } finally {
        _refreshing = false;
      }
    } else {
      Auth.clear();
      window.location.href = 'index.html';
      return null;
    }
  }

  return resp;
}

/* ── Route guard ───────────────────────────────────────────────────────── */
function requireAuth() {
  if (!Auth.isLoggedIn()) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

function requireAdmin() {
  if (!requireAuth()) return false;
  if (!Auth.isAdmin()) {
    window.location.href = 'dashboard.html';
    return false;
  }
  return true;
}

/* ── Toast notifications ───────────────────────────────────────────────── */
const TOAST_EMOJIS = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

function showToast(type, title, msg, duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.setAttribute('role', 'alert');
  t.innerHTML = `
    <span class="toast-emoji">${TOAST_EMOJIS[type] || '💬'}</span>
    <div class="toast-body">
      <div class="toast-title">${escHtml(title)}</div>
      ${msg ? `<div class="toast-msg">${escHtml(msg)}</div>` : ''}
    </div>
  `;

  const dismiss = () => {
    t.classList.add('closing');
    t.addEventListener('animationend', () => t.remove(), { once: true });
  };

  t.addEventListener('click', dismiss);
  container.appendChild(t);
  setTimeout(dismiss, duration);
}

/* ── XSS escape ────────────────────────────────────────────────────────── */
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Date helpers ──────────────────────────────────────────────────────── */
function relativeTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return 'just now';
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  if (s < 604800) return `${Math.floor(s/86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function shortDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

/* ── Loading state helpers ─────────────────────────────────────────────── */
function setLoading(btnId, loading, originalText = null) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn.dataset.original = btn.innerHTML;
    btn.innerHTML = `<div class="spinner"></div> Working…`;
    btn.disabled = true;
  } else {
    btn.innerHTML = originalText || btn.dataset.original || btn.innerHTML;
    btn.disabled = false;
  }
}

/* ── Navbar population ─────────────────────────────────────────────────── */
function populateNav() {
  const user = Auth.getUser();
  if (!user) return;

  const avatarEl   = document.getElementById('navAvatar');
  const usernameEl = document.getElementById('navUsername');
  const roleEl     = document.getElementById('navRole');
  const adminLink  = document.getElementById('navAdmin');

  if (avatarEl)   avatarEl.textContent   = (user.username?.[0] || 'U').toUpperCase();
  if (usernameEl) usernameEl.textContent = user.username || '';
  if (roleEl)     roleEl.textContent     = user.role === 'admin' ? '🛡️ Admin' : '👤 User';
  if (adminLink && user.role === 'admin') adminLink.style.display = '';
}

/* ── Sidebar greeting ──────────────────────────────────────────────────── */
function setGreeting() {
  const hour = new Date().getHours();
  const user = Auth.getUser();
  const greetTextEl = document.getElementById('greetText');
  const greetSubEl  = document.getElementById('greetSub');
  const greetEmoji  = document.querySelector('.greet-emoji');

  let emoji, greeting;
  if (hour < 5)       { emoji = '🌙'; greeting = 'Good night'; }
  else if (hour < 12) { emoji = '☀️'; greeting = 'Good morning'; }
  else if (hour < 17) { emoji = '👋'; greeting = 'Good afternoon'; }
  else if (hour < 21) { emoji = '🌆'; greeting = 'Good evening'; }
  else                { emoji = '🌙'; greeting = 'Good night'; }

  if (greetEmoji)  greetEmoji.textContent = emoji;
  if (greetTextEl) greetTextEl.textContent = `${greeting}, ${user?.username || 'there'}!`;
  if (greetSubEl) {
    const subs = [
      'What are you working on today?',
      'Ready to capture some ideas?',
      'Your notes are safe and sound.',
      'Everything here belongs to you.',
    ];
    greetSubEl.textContent = subs[Math.floor(Math.random() * subs.length)];
  }
}

/* ── Logout ────────────────────────────────────────────────────────────── */
async function handleLogout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch (_) { /* best effort */ }
  Auth.clear();
  window.location.href = 'index.html';
}

/* ═══════════════════════════════════════════════════════════
   Login / Register logic (index.html only)
   ═══════════════════════════════════════════════════════════ */

/* ── Tab switcher ──────────────────────────────────────────────────────── */
function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabRegister').classList.toggle('active', !isLogin);
  document.getElementById('panelLogin').classList.toggle('active', isLogin);
  document.getElementById('panelRegister').classList.toggle('active', !isLogin);

  const welcomeEl = document.getElementById('welcomeMsg');
  const greetEl   = welcomeEl?.querySelector('.greeting');
  const subEl     = welcomeEl?.querySelector('.sub');

  if (isLogin) {
    if (greetEl) greetEl.textContent = 'Welcome back 👋';
    if (subEl)   subEl.textContent   = 'Sign in to your secure space';
  } else {
    if (greetEl) greetEl.textContent = 'Join SecureVault 🚀';
    if (subEl)   subEl.textContent   = 'Create your private, secure account';
  }
  hideError();
}

function showError(msg) {
  const banner = document.getElementById('errorBanner');
  const msgEl  = document.getElementById('errorMsg');
  if (!banner || !msgEl) return;
  msgEl.textContent = msg;
  banner.classList.remove('hidden');
}

function hideError() {
  document.getElementById('errorBanner')?.classList.add('hidden');
}

/* ── Password visibility toggle ────────────────────────────────────────── */
function togglePw(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  if (btn) btn.textContent = isHidden ? '🙈' : '👁️';
}

/* ── Password strength checker ─────────────────────────────────────────── */
const STRENGTH_LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong!'];
const STRENGTH_COLORS = ['filled-weak', 'filled-weak', 'filled-fair', 'filled-good', 'filled-strong'];

function checkStrength(pw) {
  const checks = {
    len:     pw.length >= 8,
    upper:   /[A-Z]/.test(pw),
    lower:   /[a-z]/.test(pw),
    num:     /\d/.test(pw),
    special: /[@$!%*?&#^(){}\[\]_\-+=<>|\\/.,:;"'`~]/.test(pw),
  };

  // Update rule indicators
  Object.entries(checks).forEach(([key, ok]) => {
    const el = document.getElementById(`rule-${key}`);
    if (el) el.classList.toggle('ok', ok);
  });

  const score = Object.values(checks).filter(Boolean).length;

  // Update strength bar segments
  for (let i = 1; i <= 4; i++) {
    const seg = document.getElementById(`seg${i}`);
    if (!seg) continue;
    seg.className = 'strength-seg';
    if (i <= score) seg.classList.add(STRENGTH_COLORS[score]);
  }

  const textEl = document.getElementById('strengthText');
  if (textEl) {
    textEl.textContent = pw.length === 0 ? 'Enter a password' : STRENGTH_LABELS[score] || 'Strong!';
    textEl.style.color = score < 2 ? 'var(--error)' : score < 4 ? 'var(--warning)' : 'var(--success)';
  }
}

/* ── Login form ────────────────────────────────────────────────────────── */
async function handleLogin(e) {
  e.preventDefault();
  hideError();

  const username = document.getElementById('loginUsername')?.value.trim();
  const password = document.getElementById('loginPassword')?.value;

  if (!username || !password) {
    showError('Please fill in both fields.');
    return;
  }

  setLoading('loginBtn', true);

  try {
    const resp = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      const msg = data.error || (data.errors?.join(', ')) || 'Login failed.';
      showError(msg);
      if (resp.status === 423) showError('Account locked. Try again in a few minutes. ⏳');
      return;
    }

    Auth.save(data);
    showToast('success', `Welcome back, ${data.user.username}! 👋`, 'Redirecting you…', 2000);
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);

  } catch (err) {
    showError('Cannot reach the server. Is the backend running?');
  } finally {
    setLoading('loginBtn', false);
  }
}

/* ── Register form ─────────────────────────────────────────────────────── */
async function handleRegister(e) {
  e.preventDefault();
  hideError();

  const username = document.getElementById('regUsername')?.value.trim();
  const email    = document.getElementById('regEmail')?.value.trim();
  const password = document.getElementById('regPassword')?.value;

  if (!username || !email || !password) {
    showError('Please fill in all fields.');
    return;
  }

  setLoading('registerBtn', true);

  try {
    const resp = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      showError(data.error || data.errors?.join(' · ') || 'Registration failed.');
      return;
    }

    showToast('success', 'Account created! 🎉', 'Signing you in…', 2000);

    // Auto login after register
    const lr = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (lr.ok) {
      const ld = await lr.json();
      Auth.save(ld);
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
    } else {
      switchTab('login');
    }

  } catch (err) {
    showError('Cannot reach the server. Is the backend running?');
  } finally {
    setLoading('registerBtn', false);
  }
}

/* ── Redirect if already logged in (on auth page) ─────────────────────── */
(function initAuthPage() {
  // Only run on index.html
  if (!document.getElementById('loginForm')) return;
  if (Auth.isLoggedIn()) {
    window.location.href = 'dashboard.html';
  }
})();
