/* UniVybe waitlist: local / Node-host server
   - Serves the static site (parent folder)
   - POST /api/waitlist and /admin/* are handled by form/lib/app.js (shared with the Vercel functions in api/)
   - Storage: Neon if DATABASE_URL is set, otherwise form/data/submissions.json (+ .csv and .xlsx)
   Run: npm start   (Node 20.12+)
*/
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const config = require('./lib/config');
const { handle } = require('./lib/app');
const { getStore } = require('./lib/store');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};
const notFound = res => { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); };

async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (rel.endsWith('/')) rel += 'index.html';
  const segments = rel.split('/').filter(Boolean);
  // never expose backend code, API sources, dotfiles (.env, .git) or package files
  if (['form', 'api', 'node_modules'].includes(segments[0]) || segments.some(s => s.startsWith('.'))
      || /^((package(-lock)?|vercel)\.json|neon\.ts)$/.test(segments[0] || '')) return notFound(res);
  const file = path.resolve(config.SITE_DIR, ...segments);
  if (!file.startsWith(config.SITE_DIR + path.sep)) return notFound(res);
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch {
    notFound(res);
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  if (await handle(req, res, pathname, searchParams)) return;
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname);
  res.writeHead(405);
  res.end('Method not allowed');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.PORT} is already in use. Set a different PORT in form/.env and try again.`);
    process.exit(1);
  }
  throw err;
});

server.listen(config.PORT, async () => {
  const store = getStore();
  console.log(`UniVybe waitlist running at http://localhost:${config.PORT}`);
  console.log(`Admin dashboard:           http://localhost:${config.PORT}/admin`);
  try {
    const n = (await store.list()).length;
    console.log(`Storage:                   ${store.kind === 'neon' ? 'Neon database' : 'form/data (json, csv, xlsx)'} · ${n} sign-ups`);
  } catch (err) {
    console.error('Storage error:', err.message);
  }
});
