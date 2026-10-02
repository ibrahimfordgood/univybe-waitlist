/* Shared configuration. Locally values come from form/.env; on Vercel from Project → Settings → Environment Variables. */
'use strict';

const path = require('node:path');

const FORM_DIR = path.resolve(__dirname, '..');
// form/.env first, then the project-root .env that `neon deploy` writes DATABASE_URL into.
// Values already set (real env vars, or the earlier file) are never overridden.
for (const file of [path.join(FORM_DIR, '.env'), path.join(FORM_DIR, '..', '.env')]) {
  try { process.loadEnvFile(file); } catch { /* file missing: skip */ }
}

const env = process.env;

module.exports = {
  FORM_DIR,
  SITE_DIR: path.resolve(FORM_DIR, '..'),
  DATA_DIR: path.join(FORM_DIR, 'data'),
  ADMIN_DIR: path.join(FORM_DIR, 'admin'),
  PORT: Number(env.PORT) || 3000,
  ADMIN_PASSWORD: env.ADMIN_PASSWORD || '',
  SESSION_HOURS: Number(env.SESSION_HOURS) || 12,
  // Vercel always serves over HTTPS, so mark cookies Secure there automatically
  SECURE_COOKIES: env.SECURE_COOKIES === 'true' || !!env.VERCEL,
  // Neon: the Vercel integration sets DATABASE_URL (or POSTGRES_URL) automatically
  DATABASE_URL: env.DATABASE_URL || env.POSTGRES_URL || '',
  SESSION_SECRET: env.SESSION_SECRET || '',
  IS_VERCEL: !!env.VERCEL,
};
