/* Storage for waitlist sign-ups.
   - Neon Postgres when DATABASE_URL is set (required on Vercel)
   - Local files otherwise: form/data/submissions.json (+ .csv and .xlsx copies) */
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');
const { toCSV, toXLSX } = require('./exporters');

/* ---------------- Neon ---------------- */
function neonStore(url) {
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(url);

  let ready;
  const init = () => (ready ||= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS waitlist_signups (
      id          uuid PRIMARY KEY,
      joined_at   timestamptz NOT NULL DEFAULT now(),
      name        text NOT NULL,
      email       text NOT NULL UNIQUE,
      phone       text NOT NULL DEFAULT '',
      school      text NOT NULL,
      role        text NOT NULL DEFAULT 'student',
      ref_code    text NOT NULL DEFAULT '',
      referred_by text NOT NULL DEFAULT '',
      warmup_xp   integer NOT NULL DEFAULT 0,
      source      text NOT NULL DEFAULT ''
    )`;
    await sql`CREATE INDEX IF NOT EXISTS waitlist_signups_joined_at_idx ON waitlist_signups (joined_at)`;
    await sql`CREATE TABLE IF NOT EXISTS admin_login_attempts (
      ip text NOT NULL,
      at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS admin_login_attempts_ip_at_idx ON admin_login_attempts (ip, at)`;
  })().catch(err => { ready = null; throw err; }));

  const toRow = r => ({ ...r, joined_at: new Date(r.joined_at).toISOString(), warmup_xp: Number(r.warmup_xp) || 0 });

  return {
    kind: 'neon',
    async list() {
      await init();
      const rows = await sql`SELECT id, joined_at, name, email, phone, school, role, ref_code, referred_by, warmup_xp, source
                             FROM waitlist_signups ORDER BY joined_at ASC, id ASC`;
      return rows.map(toRow);
    },
    async add(e) {
      await init();
      const inserted = await sql`
        INSERT INTO waitlist_signups (id, joined_at, name, email, phone, school, role, ref_code, referred_by, warmup_xp, source)
        VALUES (${e.id}, ${e.joined_at}, ${e.name}, ${e.email}, ${e.phone}, ${e.school}, ${e.role}, ${e.ref_code}, ${e.referred_by}, ${e.warmup_xp}, ${e.source})
        ON CONFLICT (email) DO NOTHING
        RETURNING id`;
      if (!inserted.length) {
        const [existing] = await sql`SELECT ref_code FROM waitlist_signups WHERE email = ${e.email}`;
        return { created: false, ref_code: existing?.ref_code || '' };
      }
      const [{ count }] = await sql`SELECT count(*)::int AS count FROM waitlist_signups`;
      return { created: true, ref_code: e.ref_code, position: count };
    },
    /* login rate limiting shared across serverless instances */
    async countLoginAttempts(ip, minutes) {
      await init();
      const [{ count }] = await sql`SELECT count(*)::int AS count FROM admin_login_attempts
                                    WHERE ip = ${ip} AND at > now() - make_interval(mins => ${minutes})`;
      return count;
    },
    async recordLoginAttempt(ip) {
      await init();
      await sql`INSERT INTO admin_login_attempts (ip) VALUES (${ip})`;
      if (Math.random() < 0.05) await sql`DELETE FROM admin_login_attempts WHERE at < now() - interval '1 day'`;
    },
  };
}

/* ---------------- Local files ---------------- */
function fileStore() {
  const JSON_FILE = path.join(config.DATA_DIR, 'submissions.json');
  const CSV_FILE = path.join(config.DATA_DIR, 'submissions.csv');
  const XLSX_FILE = path.join(config.DATA_DIR, 'submissions.xlsx');

  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  let rows = [];
  try { rows = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')); } catch { rows = []; }

  async function atomicWrite(file, data) {
    const tmp = file + '.tmp';
    await fsp.writeFile(tmp, data);
    await fsp.rename(tmp, file);
  }
  let chain = Promise.resolve();
  function persist() {
    chain = chain.then(async () => {
      await atomicWrite(JSON_FILE, JSON.stringify(rows, null, 2));
      await atomicWrite(CSV_FILE, toCSV(rows));
      try {
        await atomicWrite(XLSX_FILE, toXLSX(rows));
      } catch (err) {
        // Usually means the sheet is open in Excel (Windows locks it). The JSON copy is safe; the sheet catches up on the next sign-up.
        console.warn(`[storage] could not update submissions.xlsx (${err.code || err.message}). Close it in Excel; it refreshes on the next sign-up.`);
        await fsp.rm(XLSX_FILE + '.tmp', { force: true });
      }
    }).catch(err => console.error('[storage] write failed:', err));
    return chain;
  }
  persist(); // make sure the .csv/.xlsx copies exist and match the JSON on startup

  const attempts = new Map();
  return {
    kind: 'files',
    async list() { return rows; },
    async add(e) {
      const existing = rows.find(r => r.email === e.email);
      if (existing) return { created: false, ref_code: existing.ref_code };
      rows.push(e);
      await persist();
      return { created: true, ref_code: e.ref_code, position: rows.length };
    },
    async countLoginAttempts(ip, minutes) {
      const since = Date.now() - minutes * 60000;
      const list = (attempts.get(ip) || []).filter(t => t > since);
      attempts.set(ip, list);
      return list.length;
    },
    async recordLoginAttempt(ip) {
      attempts.set(ip, [...(attempts.get(ip) || []), Date.now()]);
    },
  };
}

let store;
function getStore() {
  if (store) return store;
  if (config.DATABASE_URL) store = neonStore(config.DATABASE_URL);
  else if (config.IS_VERCEL) throw new Error('DATABASE_URL is not set. Connect a Neon database to this Vercel project.');
  else store = fileStore();
  return store;
}

const newId = () => crypto.randomUUID();

module.exports = { getStore, newId };
