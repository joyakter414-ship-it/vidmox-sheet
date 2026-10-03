/**
 * VidMox Sheet - Cloudflare Worker API
 *
 * Roles
 *   admin  : logs in with email + password. Adds / edits / removes project managers, sees every client.
 *   pm     : logs in with phone + password. Adds clients and edits their video sheets.
 *   client : logs in with email OR phone + password. Can only view his own sheet.
 *
 * Storage
 *   D1 (DB)     : users + sessions (passwords hashed with PBKDF2-SHA256)
 *   R2 (BUCKET) : one JSON sheet per client -> sheets/client-<id>.json
 */

const STATUSES = ['Approved', 'On Correction', 'On Pending', 'Not Assigned'];
const DEFAULT_STATUS = 'Not Assigned';
const DEFAULT_VIDEOS = 30;
const MAX_VIDEOS = 500;
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;

// ---------- helpers ----------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (bytes) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256 = async (text) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return toHex(bits);
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function makePassword(password) {
  if (typeof password !== 'string' || password.length < 4) {
    throw new HttpError(400, 'Password must be at least 4 characters');
  }
  const salt = randomHex(16);
  return { pass_hash: await hashPassword(password, salt), pass_salt: salt };
}

/** Normalise Bangladeshi / generic phone numbers to digits, e.g. +8801812345678 -> 01812345678 */
function normPhone(v) {
  if (v == null) return null;
  let d = String(v).replace(/\D/g, '');
  if (d.startsWith('880') && d.length === 13) d = '0' + d.slice(3);
  return d || null;
}

function normEmail(v) {
  if (v == null) return null;
  const e = String(v).trim().toLowerCase();
  if (!e) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'Invalid email address');
  return e;
}

const cleanText = (v, max = 200) => String(v ?? '').trim().slice(0, max);

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone, pm_id: u.pm_id ?? null };
}

async function uniqueCheck(env, { email, phone }, exceptId = 0) {
  if (email) {
    const r = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(email, exceptId).first();
    if (r) throw new HttpError(409, 'This email is already used by another account');
  }
  if (phone) {
    const r = await env.DB.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').bind(phone, exceptId).first();
    if (r) throw new HttpError(409, 'This phone number is already used by another account');
  }
}

// ---------- admin bootstrap ----------

let adminChecked = false;
async function ensureAdmin(env) {
  if (adminChecked) return;
  const existing = await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first();
  if (!existing && env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    const { pass_hash, pass_salt } = await makePassword(env.ADMIN_PASSWORD);
    await env.DB.prepare(
      "INSERT INTO users (role, name, email, pass_hash, pass_salt) VALUES ('admin', 'Admin', ?, ?, ?)",
    )
      .bind(normEmail(env.ADMIN_EMAIL), pass_hash, pass_salt)
      .run();
  }
  const existingPm = await env.DB.prepare("SELECT id FROM users WHERE role = 'pm' LIMIT 1").first();
  if (!existingPm) {
    const { pass_hash, pass_salt } = await makePassword('123456');
    await env.DB.prepare(
      "INSERT INTO users (role, name, phone, pass_hash, pass_salt) VALUES ('pm', 'Project Manager', '01812345678', ?, ?)",
    )
      .bind(pass_hash, pass_salt)
      .run();
  }
  adminChecked = true;
}

// ---------- sessions ----------

async function createSession(env, userId) {
  const token = randomHex(32);
  const expires = Date.now() + SESSION_DAYS * 86400 * 1000;
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, expires)
    .run();
  // opportunistic cleanup of expired sessions
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run();
  return token;
}

async function getAuthUser(request, env) {
  const h = request.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Please log in');
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), Date.now())
    .first();
  if (!row) throw new HttpError(401, 'Session expired, please log in again');
  return row;
}

const requireRole = (user, ...roles) => {
  if (!roles.includes(user.role)) throw new HttpError(403, 'You do not have permission for this');
};

// ---------- sheets (R2) ----------

const sheetKey = (clientId) => `sheets/client-${clientId}.json`;

function defaultSheet() {
  return {
    videos: Array.from({ length: DEFAULT_VIDEOS }, (_, i) => ({
      no: i + 1,
      title: '',
      status: DEFAULT_STATUS,
      link: '',
    })),
    updatedAt: new Date().toISOString(),
  };
}

async function loadSheet(env, clientId) {
  const obj = await env.BUCKET.get(sheetKey(clientId));
  if (!obj) return defaultSheet();
  try {
    return await obj.json();
  } catch {
    return defaultSheet();
  }
}

function sanitizeVideos(videos) {
  if (!Array.isArray(videos)) throw new HttpError(400, 'videos must be a list');
  if (videos.length > MAX_VIDEOS) throw new HttpError(400, `Maximum ${MAX_VIDEOS} videos`);
  return videos.map((v, i) => {
    let link = cleanText(v?.link, 1000);
    if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
    return {
      no: i + 1,
      title: cleanText(v?.title, 300),
      status: STATUSES.includes(v?.status) ? v.status : DEFAULT_STATUS,
      link,
    };
  });
}

function countStatuses(sheet) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const v of sheet.videos || []) if (counts[v.status] !== undefined) counts[v.status]++;
  return counts;
}

async function saveSheet(env, clientId, sheet) {
  const body = { videos: sheet.videos, updatedAt: new Date().toISOString() };
  await env.BUCKET.put(sheetKey(clientId), JSON.stringify(body), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { counts: JSON.stringify(countStatuses(body)) },
  });
  return body;
}

/** Fetch a client the current user is allowed to see (admin: any, pm: own, client: self). */
async function getClientFor(env, user, clientId, allowDeleted = false) {
  const client = await env.DB.prepare("SELECT * FROM users WHERE id = ? AND role = 'client'").bind(clientId).first();
  if (!client) throw new HttpError(404, 'Client not found');
  if (client.deleted_at && !allowDeleted) throw new HttpError(404, 'This client has been removed');
  if (user.role === 'admin') return client;
  if (user.role === 'pm' && client.pm_id === user.id) return client;
  if (user.role === 'client' && client.id === user.id) return client;
  throw new HttpError(403, 'You do not have access to this client');
}

// ---------- route handlers ----------

async function login(request, env) {
  await ensureAdmin(env);
  const body = await readBody(request);
  const id = String(body.id || '').trim();
  const password = String(body.password || '');
  if (!id || !password) throw new HttpError(400, 'Enter email/phone and password');

  let user;
  if (id.includes('@')) {
    user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(id.toLowerCase()).first();
  } else {
    user = await env.DB.prepare('SELECT * FROM users WHERE phone = ?').bind(normPhone(id)).first();
  }
  // Always hash once so response time does not reveal whether the account exists.
  const salt = user?.pass_salt || '00'.repeat(16);
  const hash = await hashPassword(password, salt);
  if (!user || !safeEqual(hash, user.pass_hash)) throw new HttpError(401, 'Wrong email/phone or password');
  if (user.deleted_at) throw new HttpError(403, 'This account has been removed. Please contact your manager or admin.');

  const token = await createSession(env, user.id);
  return json({ token, user: publicUser(user) });
}

async function logout(request, env) {
  const h = request.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ ok: true });
}

// ----- project managers (admin only) -----

async function listPMs(env) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.phone, p.email, p.created_at,
            (SELECT COUNT(*) FROM users c WHERE c.role = 'client' AND c.pm_id = p.id AND c.deleted_at IS NULL) AS client_count
     FROM users p WHERE p.role = 'pm' ORDER BY p.name COLLATE NOCASE`,
  ).all();
  return json({ pms: results });
}

async function createPM(request, env) {
  const b = await readBody(request);
  const name = cleanText(b.name, 100);
  const phone = normPhone(b.phone);
  if (!name) throw new HttpError(400, 'Name is required');
  if (!phone || phone.length < 6) throw new HttpError(400, 'A valid phone number is required');
  await uniqueCheck(env, { phone });
  const { pass_hash, pass_salt } = await makePassword(b.password);
  const r = await env.DB.prepare(
    "INSERT INTO users (role, name, phone, pass_hash, pass_salt) VALUES ('pm', ?, ?, ?, ?) RETURNING *",
  )
    .bind(name, phone, pass_hash, pass_salt)
    .first();
  return json({ pm: publicUser(r) }, 201);
}

async function updatePM(request, env, id) {
  const pm = await env.DB.prepare("SELECT * FROM users WHERE id = ? AND role = 'pm'").bind(id).first();
  if (!pm) throw new HttpError(404, 'Project manager not found');
  const b = await readBody(request);
  const name = b.name !== undefined ? cleanText(b.name, 100) : pm.name;
  const phone = b.phone !== undefined ? normPhone(b.phone) : pm.phone;
  if (!name) throw new HttpError(400, 'Name is required');
  if (!phone) throw new HttpError(400, 'Phone is required');
  await uniqueCheck(env, { phone }, pm.id);
  let { pass_hash, pass_salt } = pm;
  if (b.password) ({ pass_hash, pass_salt } = await makePassword(b.password));
  await env.DB.prepare('UPDATE users SET name = ?, phone = ?, pass_hash = ?, pass_salt = ? WHERE id = ?')
    .bind(name, phone, pass_hash, pass_salt, pm.id)
    .run();
  if (b.password) await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(pm.id).run();
  return json({ ok: true });
}

async function deletePM(env, id) {
  const pm = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'pm'").bind(id).first();
  if (!pm) throw new HttpError(404, 'Project manager not found');
  // Clients are kept (unassigned) so their sheets are never lost; admin can reassign them.
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pm_id = NULL WHERE pm_id = ?').bind(id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

// ----- clients (admin + pm) -----

async function listClients(env, user) {
  const base = `SELECT c.id, c.name, c.email, c.phone, c.pm_id, c.created_at, p.name AS pm_name
                FROM users c LEFT JOIN users p ON p.id = c.pm_id
                WHERE c.role = 'client' AND c.deleted_at IS NULL`;
  const stmt =
    user.role === 'admin'
      ? env.DB.prepare(`${base} ORDER BY c.name COLLATE NOCASE`)
      : env.DB.prepare(`${base} AND c.pm_id = ? ORDER BY c.name COLLATE NOCASE`).bind(user.id);
  const { results } = await stmt.all();

  // Status counts are stored as R2 object metadata, so a HEAD request is enough.
  const clients = await Promise.all(
    results.map(async (c) => {
      const head = await env.BUCKET.head(sheetKey(c.id));
      let counts = { ...Object.fromEntries(STATUSES.map((s) => [s, 0])), [DEFAULT_STATUS]: DEFAULT_VIDEOS };
      if (head?.customMetadata?.counts) {
        try {
          counts = JSON.parse(head.customMetadata.counts);
        } catch {}
      }
      return { ...c, counts };
    }),
  );
  return json({ clients });
}

async function listDeletedClients(env, user) {
  requireRole(user, 'admin');
  const base = `SELECT c.id, c.name, c.email, c.phone, c.pm_id, c.created_at, c.deleted_at, c.deleted_by,
                       p.name AS pm_name, d.name AS deleted_by_name
                FROM users c
                LEFT JOIN users p ON p.id = c.pm_id
                LEFT JOIN users d ON d.id = c.deleted_by
                WHERE c.role = 'client' AND c.deleted_at IS NOT NULL
                ORDER BY c.deleted_at DESC`;
  const { results } = await env.DB.prepare(base).all();

  const clients = await Promise.all(
    results.map(async (c) => {
      const head = await env.BUCKET.head(sheetKey(c.id));
      let counts = { ...Object.fromEntries(STATUSES.map((s) => [s, 0])), [DEFAULT_STATUS]: DEFAULT_VIDEOS };
      if (head?.customMetadata?.counts) {
        try {
          counts = JSON.parse(head.customMetadata.counts);
        } catch {}
      }
      return { ...c, counts };
    }),
  );
  return json({ clients });
}

async function restoreClient(env, user, id) {
  requireRole(user, 'admin');
  const client = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'client' AND deleted_at IS NOT NULL").bind(id).first();
  if (!client) throw new HttpError(404, 'Deleted client not found');
  await env.DB.prepare('UPDATE users SET deleted_at = NULL, deleted_by = NULL WHERE id = ?').bind(client.id).run();
  return json({ ok: true });
}

async function resolvePmId(env, user, requested) {
  if (user.role === 'pm') return user.id;
  if (requested === null || requested === '' || requested === undefined) return null;
  const pm = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND role = 'pm'").bind(Number(requested)).first();
  if (!pm) throw new HttpError(400, 'Selected project manager does not exist');
  return pm.id;
}

async function createClient(request, env, user) {
  const b = await readBody(request);
  const name = cleanText(b.name, 100);
  const email = normEmail(b.email);
  const phone = normPhone(b.phone);
  if (!name) throw new HttpError(400, 'Client name is required');
  if (!email && !phone) throw new HttpError(400, 'Give the client an email or phone number to log in');
  await uniqueCheck(env, { email, phone });
  const pmId = await resolvePmId(env, user, b.pm_id);
  const { pass_hash, pass_salt } = await makePassword(b.password);
  const client = await env.DB.prepare(
    "INSERT INTO users (role, name, email, phone, pass_hash, pass_salt, pm_id) VALUES ('client', ?, ?, ?, ?, ?, ?) RETURNING *",
  )
    .bind(name, email, phone, pass_hash, pass_salt, pmId)
    .first();
  await saveSheet(env, client.id, defaultSheet());
  return json({ client: publicUser(client) }, 201);
}

async function updateClient(request, env, user, id) {
  const client = await getClientFor(env, user, id);
  requireRole(user, 'admin', 'pm');
  const b = await readBody(request);
  const name = b.name !== undefined ? cleanText(b.name, 100) : client.name;
  const email = b.email !== undefined ? normEmail(b.email) : client.email;
  const phone = b.phone !== undefined ? normPhone(b.phone) : client.phone;
  if (!name) throw new HttpError(400, 'Client name is required');
  if (!email && !phone) throw new HttpError(400, 'Client needs an email or phone number');
  await uniqueCheck(env, { email, phone }, client.id);
  const pmId = user.role === 'admin' && b.pm_id !== undefined ? await resolvePmId(env, user, b.pm_id) : client.pm_id;
  let { pass_hash, pass_salt } = client;
  if (b.password) ({ pass_hash, pass_salt } = await makePassword(b.password));
  await env.DB.prepare(
    'UPDATE users SET name = ?, email = ?, phone = ?, pm_id = ?, pass_hash = ?, pass_salt = ? WHERE id = ?',
  )
    .bind(name, email, phone, pmId, pass_hash, pass_salt, client.id)
    .run();
  if (b.password) await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(client.id).run();
  return json({ ok: true });
}

async function deleteClient(env, user, id, url) {
  requireRole(user, 'admin', 'pm');
  const permanent = url?.searchParams?.get('permanent') === 'true' && user.role === 'admin';
  const client = await getClientFor(env, user, id, true); // allow finding even if soft-deleted when admin permanent

  if (permanent) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(client.id),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(client.id),
    ]);
    await env.BUCKET.delete(sheetKey(client.id));
    return json({ ok: true, permanent: true });
  } else {
    // Soft delete: marks as deleted by user (PM or Admin), preserves sheet, moves to Admin Deleted List
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET deleted_at = datetime("now"), deleted_by = ? WHERE id = ?').bind(user.id, client.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(client.id),
    ]);
    return json({ ok: true, soft: true });
  }
}

async function getSheet(env, user, id) {
  // Admin can view even if soft-deleted
  const client = await getClientFor(env, user, id, user.role === 'admin');
  const sheet = await loadSheet(env, client.id);
  let pm_name = null;
  if (client.pm_id) {
    const pm = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(client.pm_id).first();
    pm_name = pm?.name ?? null;
  }
  return json({
    client: { ...publicUser(client), pm_name, deleted_at: client.deleted_at },
    sheet,
    statuses: STATUSES,
    canEdit: (user.role === 'admin' || user.role === 'pm') && !client.deleted_at,
  });
}

async function putSheet(request, env, user, id) {
  requireRole(user, 'admin', 'pm');
  const client = await getClientFor(env, user, id);
  if (client.deleted_at) throw new HttpError(400, 'Cannot edit a deleted client sheet');
  const b = await readBody(request);
  const saved = await saveSheet(env, client.id, { videos: sanitizeVideos(b.videos) });
  return json({ sheet: saved });
}

// ---------- router ----------

async function handleApi(request, env, url) {
  const { pathname } = url;
  const method = request.method;
  const parts = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);

  if (pathname === '/api/login' && method === 'POST') return login(request, env);
  if (pathname === '/api/logout' && method === 'POST') return logout(request, env);

  const user = await getAuthUser(request, env);

  if (pathname === '/api/me' && method === 'GET') return json({ user: publicUser(user) });

  if (parts[0] === 'pms') {
    requireRole(user, 'admin');
    if (parts.length === 1 && method === 'GET') return listPMs(env);
    if (parts.length === 1 && method === 'POST') return createPM(request, env);
    const id = Number(parts[1]);
    if (parts.length === 2 && method === 'PATCH') return updatePM(request, env, id);
    if (parts.length === 2 && method === 'DELETE') return deletePM(env, id);
  }

  if (parts[0] === 'clients') {
    if (parts.length === 1 && method === 'GET') {
      requireRole(user, 'admin', 'pm');
      return listClients(env, user);
    }
    if (parts.length === 1 && method === 'POST') {
      requireRole(user, 'admin', 'pm');
      return createClient(request, env, user);
    }
    const id = Number(parts[1]);
    if (parts.length === 2 && method === 'PATCH') return updateClient(request, env, user, id);
    if (parts.length === 2 && method === 'DELETE') return deleteClient(env, user, id, url);
    if (parts.length === 3 && parts[2] === 'sheet' && method === 'GET') return getSheet(env, user, id);
    if (parts.length === 3 && parts[2] === 'sheet' && method === 'PUT') return putSheet(request, env, user, id);
  }

  if (parts[0] === 'deleted-clients') {
    requireRole(user, 'admin');
    if (parts.length === 1 && method === 'GET') return listDeletedClients(env, user);
    const id = Number(parts[1]);
    if (parts.length === 3 && parts[2] === 'restore' && method === 'POST') return restoreClient(env, user, id);
    if (parts.length === 2 && method === 'DELETE') return deleteClient(env, user, id, url);
  }

  if (pathname === '/api/my-sheet' && method === 'GET') {
    requireRole(user, 'client');
    return getSheet(env, user, user.id);
  }

  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        if (err instanceof HttpError) return json({ error: err.message }, err.status);
        console.error(err);
        return json({ error: 'Server error, please try again' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
