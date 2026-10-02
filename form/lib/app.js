/* Waitlist + admin request handling, shared by the local server (form/server.js) and Vercel functions (api/). */
'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');
const { getStore, newId } = require('./store');
const { toCSV, toXLSX } = require('./exporters');

if (!config.ADMIN_PASSWORD) console.warn('[admin] ADMIN_PASSWORD is not set. /admin login is disabled until you set it.');

/* ---------- http helpers ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', ...headers });
  res.end(body);
}
const sendJSON = (res, status, obj, headers = {}) =>
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });

/* Reads the raw body. Works with plain Node and with Vercel (which may have parsed it already). */
async function readBody(req, limit = 16 * 1024) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return req.body;
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
    return req.body; // already-parsed object
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function clientIP(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.socket?.remoteAddress || 'unknown';
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) {
      try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch { /* skip malformed cookie */ }
    }
  });
  return out;
}

/* best-effort per-instance limiter for sign-ups (duplicate emails are also blocked by the store) */
const signupHits = new Map();
function signupAllowed(ip, max = 20, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  let h = signupHits.get(ip);
  if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; signupHits.set(ip, h); }
  if (signupHits.size > 5000) for (const [k, v] of signupHits) if (v.reset < now) signupHits.delete(k);
  h.n++;
  return { ok: h.n <= max, retryAfter: Math.ceil((h.reset - now) / 1000) };
}

/* ---------- stateless signed sessions (work across serverless instances) ---------- */
const SESSION_COOKIE = 'uv_admin';
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MIN = 15;

// Derived from the password unless SESSION_SECRET is set, so changing the password logs everyone out.
const sessionKey = () => crypto.createHash('sha256').update('univybe-admin:' + (config.SESSION_SECRET || config.ADMIN_PASSWORD)).digest();
const sign = payload => crypto.createHmac('sha256', sessionKey()).update(payload).digest('base64url');

function makeToken() {
  const payload = `${Date.now() + config.SESSION_HOURS * 3600 * 1000}.${crypto.randomBytes(8).toString('hex')}`;
  return `${payload}.${sign(payload)}`;
}
function isAuthed(req) {
  if (!config.ADMIN_PASSWORD) return false;
  const t = parseCookies(req)[SESSION_COOKIE];
  if (!t) return false;
  const i = t.lastIndexOf('.');
  if (i < 0) return false;
  const payload = t.slice(0, i);
  const a = Buffer.from(t.slice(i + 1));
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(payload.split('.')[0]) > Date.now();
}
function passwordMatches(input) {
  if (!config.ADMIN_PASSWORD || typeof input !== 'string') return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(config.ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
const cookie = (value, maxAgeSec) =>
  `${SESSION_COOKIE}=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${config.SECURE_COOKIES ? '; Secure' : ''}`;

const ADMIN_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
};

async function serveAdminFile(res, file) {
  const body = await fsp.readFile(path.join(config.ADMIN_DIR, file));
  send(res, 200, body, { 'Content-Type': MIME[path.extname(file)], ...ADMIN_HEADERS });
}

const LOGIN_ERRORS = {
  '1': 'Wrong password. Try again.',
  locked: 'Too many attempts. Wait 15 minutes and try again.',
  disabled: 'Admin login is disabled: set ADMIN_PASSWORD and restart / redeploy.',
  db: 'Could not reach the database. Check DATABASE_URL.',
};
async function serveLogin(res, errorKey) {
  const key = !config.ADMIN_PASSWORD ? 'disabled' : errorKey;
  const msg = LOGIN_ERRORS[key] ? `<p class="login-error" role="alert">${LOGIN_ERRORS[key]}</p>` : '';
  const html = (await fsp.readFile(path.join(config.ADMIN_DIR, 'login.html'), 'utf8')).replace('<!--ERROR-->', msg);
  send(res, 200, html, { 'Content-Type': MIME['.html'], ...ADMIN_HEADERS });
}

/* ---------- validation ---------- */
const emailRe = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const ROLES = new Set(['student', 'educator', 'institution']);
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max) : '');

function validateSignup(d) {
  const errors = {};
  const out = {
    name: clean(d.name, 80),
    email: clean(d.email, 254).toLowerCase(),
    phone: clean(d.phone, 24),
    school: clean(d.school, 120),
    role: ROLES.has(d.role) ? d.role : 'student',
    ref_code: clean(d.ref_code, 16).replace(/[^a-z0-9]/gi, ''),
    referred_by: clean(d.referred_by, 16).replace(/[^a-z0-9]/gi, ''),
    warmup_xp: Math.max(0, Math.min(100000, parseInt(d.warmup_xp, 10) || 0)),
    source: clean(d.source, 300),
  };
  if (out.name.length < 2) errors.name = 'Name is required.';
  if (!emailRe.test(out.email)) errors.email = 'A valid email is required.';
  if (out.phone && !/^\+?[\d\s()-]{7,18}$/.test(out.phone)) errors.phone = 'Invalid phone number.';
  if (!out.school) errors.school = 'School is required.';
  return { out, errors };
}

/* ---------- handlers ---------- */
async function handleSignup(req, res) {
  const rl = signupAllowed(clientIP(req));
  if (!rl.ok) return sendJSON(res, 429, { ok: false, error: 'Too many requests. Try again shortly.' }, { 'Retry-After': rl.retryAfter });

  let data;
  try {
    const body = await readBody(req);
    data = typeof body === 'string' ? JSON.parse(body) : body;
  } catch (e) { return sendJSON(res, e.status || 400, { ok: false, error: 'Invalid request body.' }); }
  if (!data || typeof data !== 'object') return sendJSON(res, 400, { ok: false, error: 'Invalid request body.' });
  if (data.company) return sendJSON(res, 200, { ok: true }); // honeypot: pretend success

  const { out, errors } = validateSignup(data);
  if (Object.keys(errors).length) return sendJSON(res, 422, { ok: false, errors });

  const entry = { id: newId(), joined_at: new Date().toISOString(), ...out };
  const result = await getStore().add(entry);
  if (!result.created) return sendJSON(res, 200, { ok: true, already: true, ref_code: result.ref_code });
  console.log(`[waitlist] +1 ${entry.email} (${entry.school}) total=${result.position}`);
  sendJSON(res, 201, { ok: true, ref_code: result.ref_code, position: result.position });
}

async function handleLogin(req, res) {
  const ip = clientIP(req);
  const store = getStore();
  try {
    if (await store.countLoginAttempts(ip, LOGIN_WINDOW_MIN) >= LOGIN_MAX_ATTEMPTS) {
      return send(res, 303, '', { Location: '/admin?error=locked', ...ADMIN_HEADERS });
    }
    await store.recordLoginAttempt(ip);
  } catch (err) {
    console.error('[admin] rate-limit store failed:', err);
    return send(res, 303, '', { Location: '/admin?error=db', ...ADMIN_HEADERS });
  }

  let password = '';
  try {
    const body = await readBody(req, 4096);
    password = typeof body === 'string' ? new URLSearchParams(body).get('password') || '' : String(body.password || '');
  } catch { /* treat as empty */ }

  if (!passwordMatches(password)) {
    console.warn(`[admin] failed login from ${ip}`);
    return send(res, 303, '', { Location: '/admin?error=1', ...ADMIN_HEADERS });
  }
  send(res, 303, '', { Location: '/admin', 'Set-Cookie': cookie(makeToken(), config.SESSION_HOURS * 3600), ...ADMIN_HEADERS });
}

const stamp = () => new Date().toISOString().slice(0, 10);

/**
 * Routes /api/waitlist and /admin/*. Returns true if the request was handled.
 * @param {string} pathname  the public path (e.g. "/admin/export.xlsx")
 */
async function handle(req, res, pathname, searchParams) {
  const method = req.method;
  try {
    if (pathname === '/api/waitlist') {
      if (method === 'POST') await handleSignup(req, res);
      else sendJSON(res, 405, { ok: false, error: 'Method not allowed' }, { Allow: 'POST' });
      return true;
    }
    if (pathname !== '/admin' && !pathname.startsWith('/admin/')) return false;

    if (pathname === '/admin' || pathname === '/admin/') {
      if (method !== 'GET' && method !== 'HEAD') send(res, 405, 'Method not allowed');
      else if (isAuthed(req)) await serveAdminFile(res, 'dashboard.html');
      else await serveLogin(res, searchParams.get('error'));
      return true;
    }
    if (pathname === '/admin/login' && method === 'POST') { await handleLogin(req, res); return true; }
    if (pathname === '/admin/logout' && method === 'POST') {
      send(res, 303, '', { Location: '/admin', 'Set-Cookie': cookie('', 0), ...ADMIN_HEADERS });
      return true;
    }
    if (pathname === '/admin/admin.css') { await serveAdminFile(res, 'admin.css'); return true; }

    // everything below requires a valid session
    const authed = isAuthed(req);
    if (pathname === '/admin/dashboard.js') {
      if (!authed) send(res, 401, 'Unauthorized', ADMIN_HEADERS); else await serveAdminFile(res, 'dashboard.js');
      return true;
    }
    if (pathname === '/admin/api/submissions') {
      if (!authed) { sendJSON(res, 401, { ok: false, error: 'Unauthorized' }, ADMIN_HEADERS); return true; }
      const submissions = await getStore().list();
      sendJSON(res, 200, { ok: true, total: submissions.length, storage: getStore().kind, submissions }, ADMIN_HEADERS);
      return true;
    }
    if (pathname === '/admin/export.csv') {
      if (!authed) { send(res, 401, 'Unauthorized', ADMIN_HEADERS); return true; }
      send(res, 200, toCSV(await getStore().list()), {
        ...ADMIN_HEADERS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="univybe-waitlist-${stamp()}.csv"`,
      });
      return true;
    }
    if (pathname === '/admin/export.xlsx') {
      if (!authed) { send(res, 401, 'Unauthorized', ADMIN_HEADERS); return true; }
      send(res, 200, toXLSX(await getStore().list()), {
        ...ADMIN_HEADERS,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="univybe-waitlist-${stamp()}.xlsx"`,
      });
      return true;
    }
    send(res, 404, 'Not found', ADMIN_HEADERS);
    return true;
  } catch (err) {
    console.error('[app]', err);
    if (!res.headersSent) sendJSON(res, 500, { ok: false, error: 'Server error' });
    else res.end();
    return true;
  }
}

module.exports = { handle };
