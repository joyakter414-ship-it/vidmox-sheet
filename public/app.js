// VidMox Sheet - frontend (vanilla JS, no build step)

const STATUS_CLASS = {
  'Approved': 's-approved',
  'On Correction': 's-correction',
  'On Pending': 's-pending',
  'Not Assigned': 's-na',
};
const STATUS_COLOR = {
  'Approved': '#6AA84F',
  'On Correction': '#E06666',
  'On Pending': '#F1C232',
  'Not Assigned': '#CCCCCC',
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

const COLORS = ['#2B6297', '#7B4FA6', '#C2185B', '#00897B', '#EF6C00', '#5D4037', '#3949AB', '#2E7D32'];
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
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
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

function setTopbar({ title = 'VidMox Sheet', sub = '', back = null } = {}) {
  $('#topbar').hidden = false;
  $('#topTitle').textContent = title;
  $('#topSub').textContent = sub;
  const b = $('#backBtn');
  b.hidden = !back;
  b.onclick = back ? () => (location.hash = back) : null;
}

$('#logoutBtn').onclick = async () => {
  if (!(await confirmBox('Log out of VidMox Sheet?', 'Log out'))) return;
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

/**
 * fields: [{ name, label, type, value, placeholder, hint, options:[{value,label}], required }]
 */
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
     ${extraButton ? `<button type="button" class="btn btn-danger btn-block" id="formExtra" style="margin-top:10px">${esc(extraButton.label)}</button>` : ''}`;

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

function confirmBox(message, okText = 'Yes', danger = false) {
  return new Promise((resolve) => {
    $('#modalTitle').textContent = message;
    const form = $('#modalForm');
    form.innerHTML = `<div class="form-actions">
        <button type="button" class="btn btn-light" id="cNo">Cancel</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cYes">${esc(okText)}</button>
      </div>`;
    form.onsubmit = (e) => e.preventDefault();
    $('#cNo').onclick = () => (closeModal(), resolve(false));
    $('#cYes').onclick = () => (closeModal(), resolve(true));
    $('#modal').hidden = false;
  });
}

// ---------- login ----------

function renderLogin() {
  $('#topbar').hidden = true;
  setFab(null);
  app.innerHTML = `
    <div class="login-wrap">
      <form class="login-card" id="loginForm">
        <img src="/icon.svg" class="login-logo" alt="" />
        <h1>VidMox Sheet</h1>
        <p class="hint">Log in with your email or phone number</p>
        <label class="field"><span>Email or phone</span>
          <input name="id" autocomplete="username" placeholder="you@email.com or 01XXXXXXXXX" required /></label>
        <label class="field"><span>Password</span>
          <input name="password" type="password" autocomplete="current-password" placeholder="••••••" required /></label>
        <div class="error-text" id="loginError"></div>
        <button class="btn btn-primary btn-block" id="loginBtn">Log in</button>
      </form>
    </div>`;
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target).entries());
    const btn = $('#loginBtn');
    btn.disabled = true;
    btn.textContent = 'Logging in…';
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
      btn.textContent = 'Log in';
    }
  };
}

// ---------- shared: progress bar ----------

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

// ---------- admin: project managers ----------

async function renderAdmin() {
  setTopbar({ title: 'VidMox Sheet', sub: 'Admin · ' + (state.user.email || '') });
  app.innerHTML = `
    <div class="tabs">
      <button data-tab="pms" class="${state.adminTab === 'pms' ? 'active' : ''}">Project Managers</button>
      <button data-tab="clients" class="${state.adminTab === 'clients' ? 'active' : ''}">All Clients</button>
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
  else await renderClientList($('#tabBody'));
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
    const card = e.target.closest('.item');
    if (!card) return;
    const pm = pms.find((p) => p.id == card.dataset.id);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'del') {
      const ok = await confirmBox(`Remove ${pm.name}? Their clients will be kept as "Unassigned".`, 'Remove', true);
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
    title: pm ? 'Edit project manager' : 'Add project manager',
    submitText: pm ? 'Save' : 'Add PM',
    fields: [
      { name: 'name', label: 'Name', value: pm?.name, required: true, placeholder: 'e.g. Rakib' },
      { name: 'phone', label: 'Phone number (login)', type: 'tel', value: pm?.phone, required: true, placeholder: '01XXXXXXXXX' },
      {
        name: 'password',
        label: pm ? 'New password' : 'Password',
        type: 'password',
        required: !pm,
        placeholder: pm ? 'Leave empty to keep current' : 'At least 4 characters',
      },
    ],
    onSubmit: async (v) => {
      if (pm) {
        if (!v.password) delete v.password;
        await api('PATCH', '/pms/' + pm.id, v);
        toast('Saved');
      } else {
        await api('POST', '/pms', v);
        toast('Project manager added');
      }
      renderAdmin();
    },
  });
}

// ---------- clients list (admin + pm) ----------

async function renderClientList(root) {
  root.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const isAdmin = state.user.role === 'admin';
  let clients, pms = [];
  try {
    ({ clients } = await api('GET', '/clients'));
    if (isAdmin) ({ pms } = await api('GET', '/pms'));
  } catch (err) {
    root.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    return;
  }
  setFab('New client', () => clientForm(null, pms, () => route()));

  root.innerHTML = `<div class="section-head"><h2>Clients</h2><span class="count">${clients.length} total</span></div>`;
  if (!clients.length) {
    root.insertAdjacentHTML('beforeend', `<div class="empty">${ICONS.users}<div>No clients yet.<br/>Tap <b>New client</b> to add one.</div></div>`);
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
              ${isAdmin ? `<div class="item-sub">PM: ${esc(c.pm_name || 'Unassigned')}</div>` : ''}
              ${progressHtml(c.counts)}
            </div>
          </div>`;
        })
        .join('') || '<div class="empty">No matching clients</div>';
  };
  root.appendChild(searchBox('Search clients…', draw));
  root.appendChild(list);
  draw();
  list.addEventListener('click', (e) => {
    const card = e.target.closest('.item');
    if (card) location.hash = '#/client/' + card.dataset.id;
  });
}

function clientForm(client, pms, after) {
  const isAdmin = state.user.role === 'admin';
  const fields = [
    { name: 'name', label: 'Client name', value: client?.name, required: true, placeholder: 'e.g. Momota' },
    { name: 'email', label: 'Email', type: 'email', value: client?.email, placeholder: 'client@email.com' },
    { name: 'phone', label: 'Phone number', type: 'tel', value: client?.phone, placeholder: '01XXXXXXXXX', hint: 'Client can log in with email or phone' },
    {
      name: 'password',
      label: client ? 'New password' : 'Password',
      type: 'password',
      required: !client,
      placeholder: client ? 'Leave empty to keep current' : 'At least 4 characters',
    },
  ];
  if (isAdmin) {
    fields.push({
      name: 'pm_id',
      label: 'Project manager',
      type: 'select',
      value: client?.pm_id ?? '',
      options: [{ value: '', label: '— Unassigned —' }, ...pms.map((p) => ({ value: p.id, label: `${p.name} (${p.phone})` }))],
    });
  }
  openForm({
    title: client ? 'Edit client' : 'New client',
    submitText: client ? 'Save' : 'Create client',
    fields,
    extraButton: client
      ? {
          label: 'Delete client',
          onClick: async () => {
            const ok = await confirmBox(`Delete ${client.name} and the whole sheet? This cannot be undone.`, 'Delete', true);
            if (!ok) return;
            try {
              await api('DELETE', '/clients/' + client.id);
              toast('Client deleted');
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
        toast('Client created with 30 videos');
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
    setTopbar({ title: 'Sheet', back: isClient ? null : '#/' });
    app.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    return;
  }
  const { client, canEdit } = data;
  let videos = data.sheet.videos;
  let filter = null;

  setTopbar({
    title: client.name,
    sub: isClient ? 'Your video projects' : client.pm_name ? 'PM: ' + client.pm_name : 'Unassigned',
    back: isClient ? null : '#/',
  });

  app.innerHTML = `
    <div class="card">
      <div class="details-head">
        <h3>CLIENT DETAILS</h3>
        ${canEdit ? `<button class="btn btn-light btn-sm" id="editClient">${ICONS.edit.replace('<svg', '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"')} Edit</button>` : ''}
      </div>
      <div class="details">
        <div class="row"><div class="label">Client Name</div><div class="value">${esc(client.name)}</div></div>
        <div class="row"><div class="label">Email</div><div class="value">${esc(client.email || '—')}</div></div>
        <div class="row"><div class="label">Number</div><div class="value">${esc(client.phone || '—')}</div></div>
      </div>
    </div>
    <div class="stat-grid" id="stats"></div>
    <div class="save-state" id="saveState">${canEdit ? 'Changes save automatically' : ''}</div>
    <div class="sheet-head"><div>Video Number</div><div>Video Title</div><div>Status</div><div>Video Link</div></div>
    <div class="videos" id="videos"></div>
    ${canEdit ? `<button class="btn btn-light add-row" id="addRow">${ICONS.plus.replace('<svg', '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"')} Add video row</button>` : ''}
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
        <div class="vtitle"><div class="ro ${v.title ? '' : 'none'}">${esc(v.title || 'No title yet')}</div></div>
        <div class="vmeta">
          <span class="status-pill ${STATUS_CLASS[v.status]}">${esc(v.status)}</span>
          <div class="vlink">${linkBtn}</div>
        </div>
      </div>`;
    }
    return `<div class="video" data-i="${i}">
      <div class="vno">${v.no}</div>
      <div class="vtitle"><input data-f="title" value="${esc(v.title)}" placeholder="Video title" /></div>
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
    saveState('Saving…');
    try {
      await api('PUT', `/clients/${client.id}/sheet`, { videos });
      saveState('All changes saved ✓');
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
  // flush a pending save when navigating away inside the app
  flushSave = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      doSave();
    }
  };
  // warn before closing the tab with unsaved changes
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
  return renderClientList(app);
}

window.addEventListener('hashchange', route);
route();
