// Vidmox Sheet - Frontend App (Vanilla JS, PWA-ready, Vidmox Theme)

const STATUS_CLASS = {
  'Approved': 's-approved',
  'On Correction': 's-correction',
  'On Pending': 's-pending',
  'Not Assigned': 's-na',
};
const STATUS_COLOR = {
  'Approved': '#4ADE80',
  'On Correction': '#F87171',
  'On Pending': '#FBBF24',
  'Not Assigned': '#475569',
};
const STATUSES = Object.keys(STATUS_CLASS);

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');

const ICONS = {
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  users: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/><circle cx="9" cy="7" r="4"/></svg>',
  restore: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M10.85 12.15L19 4M18 5l2 2M15 8l2 2"/></svg>',
  copy: '<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
};

// ---------- state ----------

const state = {
  token: localStorage.getItem('vm_token'),
  user: JSON.parse(localStorage.getItem('vm_user') || 'null'),
  adminTab: sessionStorage.getItem('vm_admin_tab') || 'pms',
};

function setSession(token, user) {
  state.token = token;
  state.user = user;
  if (token) {
    localStorage.setItem('vm_token', token);
    localStorage.setItem('vm_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('vm_token');
    localStorage.removeItem('vm_user');
  }
}

// ---------- utils ----------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

const COLORS = ['#FF6B00', '#3B82F6', '#8B5CF6', '#EC4899', '#10B981', '#F59E0B', '#6366F1', '#14B8A6'];
const colorFor = (id) => COLORS[Number(id) % COLORS.length];

function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' err' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2800);
}

function loading() {
  app.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';
}

async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(state.token ? { authorization: 'Bearer ' + state.token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (res.status === 401 && path !== '/login') {
    setSession(null, null);
    location.hash = '#/login';
    throw new Error(data.error || 'Please log in again');
  }
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

// ---------- top bar ----------

function setTopbar({ title = 'Vidmox Sheet', sub = '', back = null } = {}) {
  $('#topbar').hidden = false;
  $('#topTitle').textContent = title;
  $('#topSub').textContent = sub;
  const b = $('#backBtn');
  b.hidden = !back;
  b.onclick = back ? () => (location.hash = back) : null;
  const cp = $('#changePassBtn');
  if (cp) {
    cp.hidden = !state.user;
    cp.onclick = openChangePasswordModal;
  }
}

$('#logoutBtn').onclick = async () => {
  if (!(await confirmBox('Log out of Vidmox Sheet?', 'Log out'))) return;
  try {
    await api('POST', '/logout');
  } catch {}
  setSession(null, null);
  location.hash = '#/login';
};

function setFab(label, onClick) {
  document.querySelectorAll('.fab').forEach((f) => f.remove());
  if (!label) return;
  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.innerHTML = ICONS.plus + esc(label);
  fab.onclick = onClick;
  document.body.appendChild(fab);
}

// ---------- modal ----------

function closeModal() {
  $('#modal').hidden = true;
  $('#modalForm').innerHTML = '';
}
$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});

function openForm({ title, fields, submitText = 'Save', onSubmit, extraButton }) {
  $('#modalTitle').textContent = title;
  const form = $('#modalForm');
  form.innerHTML =
    fields
      .map((f) => {
        const common = `name="${f.name}" ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}"`;
        const input =
          f.type === 'select'
            ? `<select name="${f.name}">${f.options
                .map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`)
                .join('')}</select>`
            : `<input type="${f.type || 'text'}" ${common} value="${esc(f.value ?? '')}" ${
                f.type === 'tel' ? 'inputmode="tel"' : ''
              } ${f.type === 'password' ? 'autocomplete="new-password"' : ''} />`;
        return `<label class="field"><span>${esc(f.label)}</span>${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
      })
      .join('') +
    `<div class="error-text" id="formError"></div>
     <div class="form-actions">
       <button type="button" class="btn btn-light" id="formCancel">Cancel</button>
       <button type="submit" class="btn btn-primary" id="formSubmit">${esc(submitText)}</button>
     </div>
     ${extraButton ? `<button type="button" class="btn btn-danger btn-block" id="formExtra" style="margin-top:12px">${esc(extraButton.label)}</button>` : ''}`;

  $('#formCancel').onclick = closeModal;
  if (extraButton) $('#formExtra').onclick = extraButton.onClick;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    const btn = $('#formSubmit');
    btn.disabled = true;
    $('#formError').textContent = '';
    try {
      await onSubmit(values);
      closeModal();
    } catch (err) {
      $('#formError').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  };
  $('#modal').hidden = false;
  setTimeout(() => form.querySelector('input')?.focus(), 120);
}

function confirmBox(message, okText = 'Yes', danger = false, details = '') {
  return new Promise((resolve) => {
    $('#modalTitle').textContent = message;
    const form = $('#modalForm');
    form.innerHTML = `
      ${details ? `<p style="color:var(--muted);font-size:13px;line-height:1.5;margin:0 0 16px;">${esc(details)}</p>` : ''}
      <div class="form-actions">
        <button type="button" class="btn btn-light" id="cNo">Cancel</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cYes">${esc(okText)}</button>
      </div>`;
    form.onsubmit = (e) => e.preventDefault();
    $('#cNo').onclick = () => (closeModal(), resolve(false));
    $('#cYes').onclick = () => (closeModal(), resolve(true));
    $('#modal').hidden = false;
  });
}

function openChangePasswordModal() {
  openForm({
    title: 'Change Password',
    submitText: 'Update Password',
    fields: [
      {
        name: 'current_password',
        label: 'Current Password',
        type: 'password',
        required: true,
        placeholder: 'Enter current password',
      },
      {
        name: 'new_password',
        label: 'New Password',
        type: 'password',
        required: true,
        placeholder: 'At least 4 characters',
      },
      {
        name: 'confirm_password',
        label: 'Confirm New Password',
        type: 'password',
        required: true,
        placeholder: 'Re-enter new password',
      },
    ],
    onSubmit: async (v) => {
      const cur = (v.current_password || '').trim();
      const n1 = (v.new_password || '').trim();
      const n2 = (v.confirm_password || '').trim();
      if (!cur) throw new Error('Please enter your current password');
      if (!n1) throw new Error('Please enter a new password');
      if (n1.length < 4) throw new Error('New password must be at least 4 characters');
      if (n1 !== n2) throw new Error('New passwords do not match');
      if (n1 === cur) throw new Error('New password must be different from current password');

      const res = await api('POST', '/change-password', {
        current_password: cur,
        new_password: n1,
      });

      if (res.token) {
        setSession(res.token, res.user || state.user);
      }
      toast('Password updated successfully! ✓');
    },
  });
}

// ---------- login (vidmox.online theme) ----------

function renderLogin() {
  $('#topbar').hidden = true;
  setFab(null);
  app.innerHTML = `
    <div class="login-wrap">
      <form class="login-card" id="loginForm">
        <div class="login-logo-wrap">
          <img src="/vidmox-logo.png" class="login-logo" alt="Vidmox" />
        </div>
        <h1>Vidmox Sheet</h1>
        <div style="text-align:center;">
          <span class="login-badge"><span class="login-badge-dot"></span> Dedicated Video Team · Client Portal</span>
        </div>
        <p class="hint">Sign in with your email or phone number to manage your video projects</p>
        <label class="field"><span>Email or Phone Number</span>
          <input name="id" autocomplete="username" placeholder="Enter email or phone number" required /></label>
        <label class="field"><span>Password</span>
          <input name="password" type="password" autocomplete="current-password" placeholder="Enter password" required /></label>
        <div class="error-text" id="loginError"></div>
        <button class="btn btn-primary btn-block" id="loginBtn">Sign in →</button>
        <div style="margin-top:20px;text-align:center;font-size:12px;color:var(--muted);">
          Powered by <a href="https://vidmox.online" target="_blank" rel="noopener" style="color:var(--brand);text-decoration:none;font-weight:600;">Vidmox.online</a>
        </div>
      </form>
    </div>`;
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target).entries());
    const btn = $('#loginBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    $('#loginError').textContent = '';
    try {
      const { token, user } = await api('POST', '/login', v);
      setSession(token, user);
      if (location.hash === '#/') route();
      else location.hash = '#/';
    } catch (err) {
      $('#loginError').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in →';
    }
  };
}

// ---------- progress bar ----------

function progressHtml(counts) {
  const total = STATUSES.reduce((a, s) => a + (counts?.[s] || 0), 0) || 1;
  const bar = STATUSES.map((s) => `<i style="width:${((counts?.[s] || 0) / total) * 100}%;background:${STATUS_COLOR[s]}"></i>`).join('');
  const badges = STATUSES.filter((s) => s !== 'Not Assigned' && counts?.[s])
    .map((s) => `<span class="badge ${STATUS_CLASS[s]}">${counts[s]} ${esc(s)}</span>`)
    .join('');
  return `<div class="progress">${bar}</div>${badges ? `<div class="badges">${badges}</div>` : ''}`;
}

function searchBox(placeholder, onInput) {
  const wrap = document.createElement('div');
  wrap.className = 'search';
  wrap.innerHTML = `${ICONS.search}<input type="search" placeholder="${esc(placeholder)}" />`;
  wrap.querySelector('input').addEventListener('input', (e) => onInput(e.target.value.trim().toLowerCase()));
  return wrap;
}

// ---------- admin view ----------

async function renderAdmin() {
  setTopbar({ title: 'Vidmox Admin', sub: state.user.email || '' });
  
  // Count deleted clients for badge
  let deletedCount = 0;
  try {
    const { clients } = await api('GET', '/deleted-clients');
    deletedCount = clients.length;
  } catch {}

  app.innerHTML = `
    <div class="tabs">
      <button data-tab="pms" class="${state.adminTab === 'pms' ? 'active' : ''}">Project Managers</button>
      <button data-tab="clients" class="${state.adminTab === 'clients' ? 'active' : ''}">Active Clients</button>
      <button data-tab="deleted" class="${state.adminTab === 'deleted' ? 'active' : ''}">
        Deleted Clients ${deletedCount > 0 ? `<span class="tab-badge">${deletedCount}</span>` : ''}
      </button>
    </div>
    <div id="tabBody"></div>`;

  app.querySelectorAll('.tabs button').forEach((b) => {
    b.onclick = () => {
      state.adminTab = b.dataset.tab;
      sessionStorage.setItem('vm_admin_tab', state.adminTab);
      renderAdmin();
    };
  });

  if (state.adminTab === 'pms') await renderPMList($('#tabBody'));
  else if (state.adminTab === 'clients') await renderClientList($('#tabBody'), true);
  else await renderDeletedClientsList($('#tabBody'));
}

async function renderPMList(root) {
  root.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  setFab('Add PM', () => pmForm());
  let pms;
  try {
    ({ pms } = await api('GET', '/pms'));
  } catch (err) {
    root.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    return;
  }
  root.innerHTML = `<div class="section-head"><h2>Project Managers</h2><span class="count">${pms.length} total</span></div>`;
  if (!pms.length) {
    root.insertAdjacentHTML('beforeend', `<div class="empty">${ICONS.users}<div>No project managers yet.<br/>Tap <b>Add PM</b> to create one.</div></div>`);
    return;
  }
  const list = document.createElement('div');
  list.className = 'list';
  list.innerHTML = pms
    .map(
      (p) => `
      <div class="card item" data-id="${p.id}">
        <div class="avatar" style="background:${colorFor(p.id)}">${esc(initials(p.name))}</div>
        <div class="item-main">
          <div class="item-title">${esc(p.name)}</div>
          <div class="item-sub">📞 ${esc(p.phone)} · ${p.client_count} client${p.client_count == 1 ? '' : 's'}</div>
          <div class="pm-pass-box" style="margin-top:6px;display:inline-flex;align-items:center;gap:6px;background:rgba(255,107,0,0.08);border:1px solid rgba(255,107,0,0.22);border-radius:8px;padding:3px 8px;">
            <span style="font-size:11px;font-weight:700;color:var(--brand);text-transform:uppercase;letter-spacing:0.03em;">Password:</span>
            <code style="font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;font-weight:700;color:#FBBF24;">${esc(p.pass_plain || '******')}</code>
            <button type="button" class="copy-pass-btn" data-act="copy-pass" data-pass="${esc(p.pass_plain || '')}" title="Copy password" style="background:transparent;border:0;cursor:pointer;color:var(--muted);padding:0 2px;display:flex;align-items:center;">
              ${ICONS.copy}
            </button>
          </div>
        </div>
        <div class="item-actions">
          <button class="mini-btn" data-act="edit" aria-label="Edit">${ICONS.edit}</button>
          <button class="mini-btn danger" data-act="del" aria-label="Remove">${ICONS.trash}</button>
        </div>
      </div>`,
    )
    .join('');
  root.appendChild(list);
  list.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('[data-act="copy-pass"]');
    if (copyBtn) {
      e.stopPropagation();
      const pass = copyBtn.dataset.pass;
      if (pass) {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(pass);
        }
        toast('Password copied: ' + pass);
      }
      return;
    }

    const card = e.target.closest('.item');
    if (!card) return;
    const pm = pms.find((p) => p.id == card.dataset.id);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'del') {
      const ok = await confirmBox(`Remove ${pm.name}?`, 'Remove PM', true, 'Their clients will remain safe as "Unassigned" and can be assigned to another PM.');
      if (!ok) return;
      try {
        await api('DELETE', '/pms/' + pm.id);
        toast('Project manager removed');
        renderAdmin();
      } catch (err) {
        toast(err.message, true);
      }
    } else {
      pmForm(pm);
    }
  });
}

function pmForm(pm) {
  openForm({
    title: pm ? 'Edit Project Manager' : 'Add Project Manager',
    submitText: pm ? 'Save Changes' : 'Add PM',
    fields: [
      { name: 'name', label: 'PM Name', value: pm?.name, required: true, placeholder: 'e.g. Rakib Hossain' },
      { name: 'phone', label: 'Phone Number (Login ID)', type: 'tel', value: pm?.phone, required: true, placeholder: '018XXXXXXXX' },
      {
        name: 'password',
        label: pm ? 'New Password' : 'Password',
        type: 'password',
        required: !pm,
        placeholder: pm ? 'Leave blank to keep existing' : 'At least 4 characters',
      },
    ],
    onSubmit: async (v) => {
      if (pm) {
        if (!v.password) delete v.password;
        await api('PATCH', '/pms/' + pm.id, v);
        toast('PM updated');
      } else {
        await api('POST', '/pms', v);
        toast('Project manager added');
      }
      renderAdmin();
    },
  });
}

// ---------- admin: deleted clients list ----------

async function renderDeletedClientsList(root) {
  setFab(null);
  root.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  let clients;
  try {
    ({ clients } = await api('GET', '/deleted-clients'));
  } catch (err) {
    root.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    return;
  }

  root.innerHTML = `<div class="section-head"><h2>Deleted Clients Archive</h2><span class="count">${clients.length} in trash</span></div>`;
  if (!clients.length) {
    root.insertAdjacentHTML('beforeend', `<div class="empty">${ICONS.users}<div>No deleted clients.<br/>When a PM removes a client, they appear here safely.</div></div>`);
    return;
  }

  const list = document.createElement('div');
  list.className = 'list';

  const draw = (q = '') => {
    const shown = clients.filter((c) => !q || [c.name, c.email, c.phone, c.pm_name, c.deleted_by_name].some((x) => String(x || '').toLowerCase().includes(q)));
    list.innerHTML =
      shown
        .map((c) => {
          const done = c.counts?.Approved || 0;
          const total = STATUSES.reduce((a, s) => a + (c.counts?.[s] || 0), 0);
          const delDate = c.deleted_at ? new Date(c.deleted_at).toLocaleString() : 'Recently';
          return `
          <div class="card" style="border-left: 3px solid var(--danger);">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
              <div class="avatar" style="background:#475569;">${esc(initials(c.name))}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:700;color:#fff;font-size:15px;">${esc(c.name)} <span style="font-size:11px;color:var(--danger);font-weight:700;">(Deleted)</span></div>
                <div style="color:var(--muted);font-size:12px;">📞 ${esc(c.phone || 'No phone')} · ✉️ ${esc(c.email || 'No email')}</div>
                <div style="color:#CBD5E1;font-size:11px;margin-top:2px;">Removed by: <b>${esc(c.deleted_by_name || 'PM')}</b> · ${esc(delDate)}</div>
              </div>
            </div>
            ${progressHtml(c.counts)}
            <div style="display:flex;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line);">
              <button class="btn btn-light btn-sm" data-act="view" data-id="${c.id}" style="flex:1;">${ICONS.eye} View Sheet</button>
              <button class="btn btn-primary btn-sm" data-act="restore" data-id="${c.id}" style="flex:1;background:var(--success);box-shadow:none;">${ICONS.restore} Restore</button>
              <button class="mini-btn danger" data-act="purge" data-id="${c.id}" title="Permanently Delete">${ICONS.trash}</button>
            </div>
          </div>`;
        })
        .join('') || '<div class="empty">No matching deleted clients</div>';
  };

  root.appendChild(searchBox('Search deleted archive…', draw));
  root.appendChild(list);
  draw();

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const cid = btn.dataset.id;
    const act = btn.dataset.act;
    const client = clients.find((c) => c.id == cid);

    if (act === 'view') {
      location.hash = '#/client/' + cid;
    } else if (act === 'restore') {
      const ok = await confirmBox(`Restore ${client.name}?`, 'Restore Client', false, 'The client will be returned to their active PM list and can log in again.');
      if (!ok) return;
      try {
        await api('POST', `/deleted-clients/${cid}/restore`);
        toast('Client restored successfully');
        renderAdmin();
      } catch (err) {
        toast(err.message, true);
      }
    } else if (act === 'purge') {
      const ok = await confirmBox(`PERMANENTLY delete ${client.name}?`, 'Delete Forever', true, '⚠️ This will permanently erase their video project sheet from Cloudflare R2 and D1. This cannot be undone.');
      if (!ok) return;
      try {
        await api('DELETE', `/deleted-clients/${cid}?permanent=true`);
        toast('Client permanently deleted');
        renderAdmin();
      } catch (err) {
        toast(err.message, true);
      }
    }
  });
}

// ---------- clients list (admin & pm) ----------

async function renderClientList(root, isAdmin = false) {
  root.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  let clients, pms = [];
  try {
    ({ clients } = await api('GET', '/clients'));
    if (isAdmin) ({ pms } = await api('GET', '/pms'));
  } catch (err) {
    root.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    return;
  }
  setFab('New Client', () => clientForm(null, pms, () => route()));

  let pmHeaderHtml = '';
  if (!isAdmin && state.user) {
    pmHeaderHtml = `
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding:12px 16px;background:linear-gradient(135deg, rgba(255,107,0,0.12) 0%, var(--card) 100%);border:1px solid rgba(255,107,0,0.25);">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <div class="avatar" style="width:38px;height:38px;font-size:14px;border-radius:12px;background:var(--brand);flex:none;">${esc(initials(state.user.name || 'PM'))}</div>
          <div style="min-width:0;">
            <div style="font-weight:700;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(state.user.name || 'Project Manager')}</div>
            <div style="font-size:12px;color:var(--muted);">📞 ${esc(state.user.phone || '')}</div>
          </div>
        </div>
        <button class="btn btn-light btn-sm" id="pmChangePassBtn" style="flex:none;gap:6px;font-weight:600;">
          ${ICONS.key} Change Password
        </button>
      </div>`;
  }

  root.innerHTML = `${pmHeaderHtml}<div class="section-head"><h2>Active Clients</h2><span class="count">${clients.length} total</span></div>`;
  const pmChangeBtn = $('#pmChangePassBtn');
  if (pmChangeBtn) pmChangeBtn.onclick = openChangePasswordModal;

  if (!clients.length) {
    root.insertAdjacentHTML('beforeend', `<div class="empty">${ICONS.users}<div>No active clients yet.<br/>Tap <b>New Client</b> to create one.</div></div>`);
    return;
  }
  const list = document.createElement('div');
  list.className = 'list';
  const draw = (q = '') => {
    const shown = clients.filter((c) => !q || [c.name, c.email, c.phone, c.pm_name].some((x) => String(x || '').toLowerCase().includes(q)));
    list.innerHTML =
      shown
        .map((c) => {
          const done = c.counts?.Approved || 0;
          const total = STATUSES.reduce((a, s) => a + (c.counts?.[s] || 0), 0);
          const contact = [c.phone && '📞 ' + c.phone, c.email && '✉️ ' + c.email].filter(Boolean).join(' · ');
          return `
          <div class="card item" data-id="${c.id}">
            <div class="avatar" style="background:${colorFor(c.id)}">${esc(initials(c.name))}</div>
            <div class="item-main">
              <div class="item-title">${esc(c.name)} <span style="color:var(--muted);font-weight:500;font-size:12px">· ${done}/${total} approved</span></div>
              <div class="item-sub">${esc(contact)}</div>
              ${isAdmin ? `<div class="item-sub" style="color:var(--brand);">PM: ${esc(c.pm_name || 'Unassigned')}</div>` : ''}
              ${progressHtml(c.counts)}
            </div>
            <div class="item-actions">
              <button class="mini-btn danger" data-act="del" data-id="${c.id}" title="Remove Client">${ICONS.trash}</button>
            </div>
          </div>`;
        })
        .join('') || '<div class="empty">No matching clients</div>';
  };
  root.appendChild(searchBox('Search clients…', draw));
  root.appendChild(list);
  draw();

  list.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-act="del"]');
    if (delBtn) {
      e.stopPropagation();
      const cid = delBtn.dataset.id;
      const client = clients.find((c) => c.id == cid);
      const ok = await confirmBox(
        `Remove client "${client.name}"?`,
        'Remove Client',
        true,
        'This client will be safely moved to the Admin Deleted Clients list. Their video sheet data is preserved and can be restored anytime by an Admin.'
      );
      if (!ok) return;
      try {
        await api('DELETE', '/clients/' + cid);
        toast('Client moved to Admin Deleted Archive');
        route();
      } catch (err) {
        toast(err.message, true);
      }
      return;
    }

    const card = e.target.closest('.item');
    if (card) location.hash = '#/client/' + card.dataset.id;
  });
}

function clientForm(client, pms, after) {
  const isAdmin = state.user.role === 'admin';
  const fields = [
    { name: 'name', label: 'Client Name', value: client?.name, required: true, placeholder: 'e.g. Momota' },
    { name: 'email', label: 'Client Email (Login)', type: 'email', value: client?.email, placeholder: 'client@email.com' },
    { name: 'phone', label: 'Phone Number (Login)', type: 'tel', value: client?.phone, placeholder: '018XXXXXXXX', hint: 'Client can log in using either email or phone' },
    {
      name: 'password',
      label: client ? 'New Password' : 'Password',
      type: 'password',
      required: !client,
      placeholder: client ? 'Leave empty to keep existing' : 'At least 4 characters',
    },
  ];
  if (isAdmin) {
    fields.push({
      name: 'pm_id',
      label: 'Assign Project Manager',
      type: 'select',
      value: client?.pm_id ?? '',
      options: [{ value: '', label: '— Unassigned —' }, ...pms.map((p) => ({ value: p.id, label: `${p.name} (${p.phone})` }))],
    });
  }
  openForm({
    title: client ? 'Edit Client Details' : 'Add New Client',
    submitText: client ? 'Save Client' : 'Create Client (30 Projects)',
    fields,
    extraButton: client
      ? {
          label: 'Remove Client (Move to Trash)',
          onClick: async () => {
            const ok = await confirmBox(
              `Remove client "${client.name}"?`,
              'Remove Client',
              true,
              'This client will be moved to the Admin Deleted Clients list. Their data is preserved in R2 and can be restored anytime by an Admin.'
            );
            if (!ok) return;
            try {
              await api('DELETE', '/clients/' + client.id);
              toast('Client moved to Admin Deleted archive');
              location.hash = '#/';
            } catch (err) {
              toast(err.message, true);
            }
          },
        }
      : null,
    onSubmit: async (v) => {
      if (client && !v.password) delete v.password;
      if (client) {
        await api('PATCH', '/clients/' + client.id, v);
        toast('Client saved');
      } else {
        await api('POST', '/clients', v);
        toast('Client created with 30 video slots');
      }
      after?.();
    },
  });
}

// ---------- sheet view ----------

async function renderSheet(clientId) {
  setFab(null);
  loading();
  const isClient = state.user.role === 'client';
  let data;
  try {
    data = await api('GET', isClient ? '/my-sheet' : `/clients/${clientId}/sheet`);
  } catch (err) {
    setTopbar({ title: 'Video Sheet', back: isClient ? null : '#/' });
    app.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    return;
  }
  const { client, canEdit } = data;
  let videos = data.sheet.videos;
  let filter = null;

  setTopbar({
    title: client.name,
    sub: isClient ? 'Your Video Projects' : client.deleted_at ? '⚠️ DELETED CLIENT (View Only)' : client.pm_name ? 'PM: ' + client.pm_name : 'Unassigned',
    back: isClient ? null : '#/',
  });

  app.innerHTML = `
    <div class="card">
      <div class="details-head">
        <h3>CLIENT DETAILS ${client.deleted_at ? '<span style="color:var(--danger);font-size:12px;">(DELETED ARCHIVE)</span>' : ''}</h3>
        ${canEdit ? `
          <div style="display:flex;gap:6px;">
            <button class="btn btn-light btn-sm" id="editClient">${ICONS.edit} Edit Details</button>
            <button class="btn btn-danger btn-sm" id="removeClient">${ICONS.trash} Remove</button>
          </div>` : ''}
      </div>
      <div class="details">
        <div class="row"><div class="label">Client Name</div><div class="value">${esc(client.name)}</div></div>
        <div class="row"><div class="label">Email</div><div class="value">${esc(client.email || '—')}</div></div>
        <div class="row"><div class="label">Number</div><div class="value">${esc(client.phone || '—')}</div></div>
      </div>
    </div>
    <div class="stat-grid" id="stats"></div>
    <div class="save-state" id="saveState">${canEdit ? 'Changes save automatically to Cloudflare R2' : 'View-only mode'}</div>
    <div class="sheet-head"><div>Video Number</div><div>Video Title</div><div>Status</div><div>Video Link</div></div>
    <div class="videos" id="videos"></div>
    ${canEdit ? `<button class="btn btn-light add-row" id="addRow">${ICONS.plus} Add Video Project Slot</button>` : ''}
  `;

  if (canEdit) {
    $('#editClient').onclick = async () => {
      let pms = [];
      if (state.user.role === 'admin') {
        try {
          ({ pms } = await api('GET', '/pms'));
        } catch {}
      }
      clientForm(client, pms, () => renderSheet(clientId));
    };

    $('#removeClient').onclick = async () => {
      const ok = await confirmBox(
        `Remove client "${client.name}"?`,
        'Remove Client',
        true,
        'This client will be moved to the Admin Deleted Clients list. All project links and titles remain safe and can be restored anytime.'
      );
      if (!ok) return;
      try {
        await api('DELETE', '/clients/' + client.id);
        toast('Client moved to Admin Deleted archive');
        location.hash = '#/';
      } catch (err) {
        toast(err.message, true);
      }
    };

    $('#addRow').onclick = () => {
      videos.push({ no: videos.length + 1, title: '', status: 'Not Assigned', link: '' });
      drawVideos();
      scheduleSave(0);
      const last = $('#videos').lastElementChild;
      last?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      last?.querySelector('input')?.focus();
    };
  }

  function drawStats() {
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    videos.forEach((v) => counts[v.status]++);
    $('#stats').innerHTML = STATUSES.map(
      (s) => `<button class="stat ${STATUS_CLASS[s]} ${filter === s ? 'active' : ''}" data-s="${esc(s)}"><b>${counts[s]}</b><span>${esc(s)}</span></button>`,
    ).join('');
  }
  $('#stats').addEventListener('click', (e) => {
    const b = e.target.closest('.stat');
    if (!b) return;
    filter = filter === b.dataset.s ? null : b.dataset.s;
    drawStats();
    applyFilter();
  });

  function applyFilter() {
    $('#videos').querySelectorAll('.video').forEach((el) => {
      el.hidden = filter && videos[el.dataset.i].status !== filter;
    });
  }

  function videoRow(v, i) {
    const url = safeUrl(v.link);
    const linkBtn = `<a class="open-link ${url ? '' : 'disabled'}" href="${esc(url || '#')}" target="_blank" rel="noopener">Open ↗</a>`;
    if (!canEdit) {
      return `<div class="video" data-i="${i}">
        <div class="vno">${v.no}</div>
        <div class="vtitle"><div class="ro ${v.title ? '' : 'none'}">${esc(v.title || 'Untitled video')}</div></div>
        <div class="vmeta">
          <span class="status-pill ${STATUS_CLASS[v.status]}">${esc(v.status)}</span>
          <div class="vlink">${linkBtn}</div>
        </div>
      </div>`;
    }
    return `<div class="video" data-i="${i}">
      <div class="vno">${v.no}</div>
      <div class="vtitle"><input data-f="title" value="${esc(v.title)}" placeholder="Video project title" /></div>
      <div class="vmeta">
        <select class="status-select ${STATUS_CLASS[v.status]}" data-f="status">
          ${STATUSES.map((s) => `<option ${s === v.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}
        </select>
        <div class="vlink"><input data-f="link" value="${esc(v.link)}" placeholder="Paste video link" inputmode="url" />${linkBtn}</div>
      </div>
    </div>`;
  }

  function drawVideos() {
    $('#videos').innerHTML = videos.map(videoRow).join('');
    drawStats();
    applyFilter();
  }

  // ----- autosave -----
  let saveTimer = null;
  let saving = false;
  let pending = false;
  const saveState = (t) => ($('#saveState') && ($('#saveState').textContent = t));

  async function doSave() {
    if (saving) {
      pending = true;
      return;
    }
    saving = true;
    saveState('Saving to R2…');
    try {
      await api('PUT', `/clients/${client.id}/sheet`, { videos });
      saveState('All changes saved to R2 ✓');
    } catch (err) {
      saveState('Not saved – ' + err.message);
      toast('Save failed: ' + err.message, true);
    } finally {
      saving = false;
      if (pending) {
        pending = false;
        doSave();
      }
    }
  }

  function scheduleSave(delay = 700) {
    clearTimeout(saveTimer);
    saveState('Editing…');
    saveTimer = setTimeout(() => {
      saveTimer = null;
      doSave();
    }, delay);
  }

  flushSave = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      doSave();
    }
  };

  window.onbeforeunload = (e) => {
    if (saveTimer || saving) {
      e.preventDefault();
      return '';
    }
  };

  if (canEdit) {
    const box = $('#videos');
    box.addEventListener('input', (e) => {
      const f = e.target.dataset.f;
      if (!f || f === 'status') return;
      const i = e.target.closest('.video').dataset.i;
      videos[i][f] = e.target.value;
      if (f === 'link') {
        const a = e.target.parentElement.querySelector('.open-link');
        const url = safeUrl(e.target.value) || safeUrl('https://' + e.target.value);
        a.href = url || '#';
        a.classList.toggle('disabled', !e.target.value.trim());
      }
      scheduleSave();
    });
    box.addEventListener('change', (e) => {
      if (e.target.dataset.f !== 'status') return;
      const i = e.target.closest('.video').dataset.i;
      videos[i].status = e.target.value;
      e.target.className = 'status-select ' + STATUS_CLASS[e.target.value];
      drawStats();
      applyFilter();
      scheduleSave(0);
    });
  }

  drawVideos();
}

// ---------- router ----------

let flushSave = null;

async function route() {
  flushSave?.();
  flushSave = null;
  window.onbeforeunload = null;
  closeModal();
  if (!state.token || !state.user) return renderLogin();
  const hash = location.hash || '#/';
  if (hash === '#/login') {
    location.hash = '#/';
    return;
  }
  const m = hash.match(/^#\/client\/(\d+)/);
  if (state.user.role === 'client') return renderSheet(state.user.id);
  if (m) return renderSheet(m[1]);
  if (state.user.role === 'admin') return renderAdmin();
  setTopbar({ title: 'My Clients', sub: 'PM · ' + (state.user.name || state.user.phone) });
  return renderClientList(app, false);
}

window.addEventListener('hashchange', route);
route();
