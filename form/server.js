/* UniVybe waitlist server
   - Serves the static site (parent folder)
   - POST /api/waitlist        -> saves a sign-up to form/data/submissions.json (+ submissions.csv)
   - GET  /admin               -> login page, or the dashboard once authenticated
   - POST /admin/login|logout  -> session handling
   - GET  /admin/api/submissions, /admin/export.csv (auth required)
   Zero dependencies. Run: node form/server.js  (Node 20.12+)
*/
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

/* ---------- config ---------- */
const FORM_DIR = __dirname;
const SITE_DIR = path.resolve(FORM_DIR, '..');
const DATA_DIR = path.join(FORM_DIR, 'data');
const JSON_FILE = path.join(DATA_DIR, 'submissions.json');
const CSV_FILE = path.join(DATA_DIR, 'submissions.csv');
const ADMIN_DIR = path.join(FORM_DIR, 'admin');

try { process.loadEnvFile(path.join(FORM_DIR, '.env')); } catch { /* no .env file: rely on real env vars */ }

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_HOURS = Number(process.env.SESSION_HOURS) || 12;
const SECURE_COOKIES = process.env.SECURE_COOKIES === 'true';

if (!ADMIN_PASSWORD) {
  console.warn('[admin] ADMIN_PASSWORD is not set. /admin login is disabled until you add it to form/.env');
}

/* ---------- storage (serialised writes, atomic rename) ---------- */
fs.mkdirSync(DATA_DIR, { recursive: true });
let submissions = [];
try { submissions = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')); } catch { submissions = []; }

const CSV_COLUMNS = ['id', 'joined_at', 'name', 'email', 'phone', 'school', 'role', 'ref_code', 'referred_by', 'warmup_xp', 'source'];
const csvCell = v => {
  let s = v == null ? '' : String(v);
  // block spreadsheet formula injection, but leave phone numbers like +232 76 123 456 intact
  if (/^[=@\t\r]/.test(s) || (/^[+\-]/.test(s) && !/^[+\-][\d\s()-]+$/.test(s))) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCSV = rows => [CSV_COLUMNS.join(','), ...rows.map(r => CSV_COLUMNS.map(c => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';

let writeChain = Promise.resolve();
function persist() {
  writeChain = writeChain.then(async () => {
    const tmp = JSON_FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(submissions, null, 2));
    await fsp.rename(tmp, JSON_FILE);
    const tmpCsv = CSV_FILE + '.tmp';
    await fsp.writeFile(tmpCsv, '﻿' + toCSV(submissions));
    await fsp.rename(tmpCsv, CSV_FILE);
  }).catch(err => console.error('[storage] write failed:', err));
  return writeChain;
}

/* ---------- helpers ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', ...headers });
  res.end(body);
}
const sendJSON = (res, status, obj, headers = {}) =>
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });

function readBody(req, limit = 16 * 1024) {
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
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

/* simple fixed-window rate limiter */
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return key => {
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); }
    h.n++;
    return { ok: h.n <= max, retryAfter: Math.ceil((h.reset - now) / 1000) };
  };
}
const signupLimit = limiter(20, 10 * 60 * 1000);
const loginLimit = limiter(5, 15 * 60 * 1000);

/* ---------- sessions ---------- */
const sessions = new Map(); // token -> expiry ms
const SESSION_COOKIE = 'uv_admin';

function isAuthed(req) {
  const t = parseCookies(req)[SESSION_COOKIE];
  if (!t) return false;
  const exp = sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}
function passwordMatches(input) {
  if (!ADMIN_PASSWORD || typeof input !== 'string') return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
function cookie(value, maxAgeSec) {
  return `${SESSION_COOKIE}=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${SECURE_COOKIES ? '; Secure' : ''}`;
}

const ADMIN_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
};

async function serveAdminFile(res, file, extra = {}) {
  const body = await fsp.readFile(path.join(ADMIN_DIR, file));
  send(res, 200, body, { 'Content-Type': MIME[path.extname(file)], ...ADMIN_HEADERS, ...extra });
}

const LOGIN_ERRORS = {
  '1': 'Wrong password. Try again.',
  locked: 'Too many attempts. Wait 15 minutes and try again.',
  disabled: 'Admin login is disabled: set ADMIN_PASSWORD in form/.env and restart the server.',
};
async function serveLogin(res, errorKey) {
  const key = !ADMIN_PASSWORD ? 'disabled' : errorKey;
  const msg = LOGIN_ERRORS[key] ? `<p class="login-error" role="alert">${LOGIN_ERRORS[key]}</p>` : '';
  const html = (await fsp.readFile(path.join(ADMIN_DIR, 'login.html'), 'utf8')).replace('<!--ERROR-->', msg);
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

/* ---------- routes ---------- */
async function handleSignup(req, res) {
  const rl = signupLimit(clientIP(req));
  if (!rl.ok) return sendJSON(res, 429, { ok: false, error: 'Too many requests. Try again shortly.' }, { 'Retry-After': rl.retryAfter });

  let data;
  try { data = JSON.parse(await readBody(req)); } catch (e) { return sendJSON(res, e.status || 400, { ok: false, error: 'Invalid request body.' }); }
  if (!data || typeof data !== 'object') return sendJSON(res, 400, { ok: false, error: 'Invalid request body.' });
  if (data.company) return sendJSON(res, 200, { ok: true }); // honeypot: pretend success

  const { out, errors } = validateSignup(data);
  if (Object.keys(errors).length) return sendJSON(res, 422, { ok: false, errors });

  const existing = submissions.find(s => s.email === out.email);
  if (existing) return sendJSON(res, 200, { ok: true, already: true, ref_code: existing.ref_code });

  const entry = { id: crypto.randomUUID(), joined_at: new Date().toISOString(), ...out };
  submissions.push(entry);
  await persist();
  console.log(`[waitlist] +1 ${entry.email} (${entry.school}) total=${submissions.length}`);
  sendJSON(res, 201, { ok: true, ref_code: entry.ref_code, position: submissions.length });
}

async function handleLogin(req, res) {
  const ip = clientIP(req);
  const rl = loginLimit(ip);
  if (!rl.ok) return send(res, 303, '', { Location: '/admin?error=locked', ...ADMIN_HEADERS });

  let password = '';
  try { password = new URLSearchParams(await readBody(req, 4096)).get('password') || ''; } catch { /* treat as empty */ }

  if (!passwordMatches(password)) {
    console.warn(`[admin] failed login from ${ip}`);
    return send(res, 303, '', { Location: '/admin?error=1', ...ADMIN_HEADERS });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_HOURS * 3600 * 1000);
  send(res, 303, '', { Location: '/admin', 'Set-Cookie': cookie(token, SESSION_HOURS * 3600), ...ADMIN_HEADERS });
}

function handleLogout(req, res) {
  const t = parseCookies(req)[SESSION_COOKIE];
  if (t) sessions.delete(t);
  send(res, 303, '', { Location: '/admin', 'Set-Cookie': cookie('', 0), ...ADMIN_HEADERS });
}

async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, 'Bad request'); }
  if (rel.endsWith('/')) rel += 'index.html';
  const segments = rel.split('/').filter(Boolean);
  // never expose the backend folder, dotfiles (.env, .git) or package files
  if (segments[0] === 'form' || segments.some(s => s.startsWith('.')) || /^package(-lock)?\.json$/.test(segments[0] || '')) {
    return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  }
  const file = path.resolve(SITE_DIR, ...segments);
  if (!file.startsWith(SITE_DIR + path.sep)) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
    const ext = path.extname(file).toLowerCase();
    const cache = ext === '.html' ? 'no-cache' : 'public, max-age=86400';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch {
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname, searchParams } = new URL(req.url, 'http://localhost');
    const method = req.method;

    if (pathname === '/api/waitlist') {
      if (method === 'POST') return await handleSignup(req, res);
      return sendJSON(res, 405, { ok: false, error: 'Method not allowed' }, { Allow: 'POST' });
    }

    if (pathname === '/admin' || pathname === '/admin/') {
      if (method !== 'GET') return send(res, 405, 'Method not allowed');
      return isAuthed(req) ? await serveAdminFile(res, 'dashboard.html') : await serveLogin(res, searchParams.get('error'));
    }
    if (pathname === '/admin/login' && method === 'POST') return await handleLogin(req, res);
    if (pathname === '/admin/logout' && method === 'POST') return handleLogout(req, res);
    if (pathname === '/admin/admin.css') return await serveAdminFile(res, 'admin.css');
    if (pathname === '/admin/dashboard.js') {
      if (!isAuthed(req)) return send(res, 401, 'Unauthorized', ADMIN_HEADERS);
      return await serveAdminFile(res, 'dashboard.js');
    }
    if (pathname === '/admin/api/submissions') {
      if (!isAuthed(req)) return sendJSON(res, 401, { ok: false, error: 'Unauthorized' }, ADMIN_HEADERS);
      return sendJSON(res, 200, { ok: true, total: submissions.length, submissions }, ADMIN_HEADERS);
    }
    if (pathname === '/admin/export.csv') {
      if (!isAuthed(req)) return send(res, 401, 'Unauthorized', ADMIN_HEADERS);
      const stamp = new Date().toISOString().slice(0, 10);
      return send(res, 200, '﻿' + toCSV(submissions), {
        ...ADMIN_HEADERS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="univybe-waitlist-${stamp}.csv"`,
      });
    }
    if (pathname.startsWith('/admin/')) return send(res, 404, 'Not found', ADMIN_HEADERS);

    if (method === 'GET' || method === 'HEAD') return await serveStatic(req, res, pathname);
    send(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) sendJSON(res, 500, { ok: false, error: 'Server error' });
    else res.end();
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set a different PORT in form/.env and try again.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`UniVybe waitlist running at http://localhost:${PORT}`);
  console.log(`Admin dashboard:           http://localhost:${PORT}/admin`);
  console.log(`Submissions so far:        ${submissions.length} (form/data/submissions.json)`);
});
