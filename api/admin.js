/* Vercel function: everything under /admin (login, dashboard, data API, CSV/Excel export).
   vercel.json rewrites /admin and /admin/:path* here, passing the sub-path as ?__path= */
'use strict';

const { handle } = require('../form/lib/app');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname;
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
    pathname = url.pathname; // some runtimes pass the original URL through
  } else {
    const sub = (url.searchParams.get('__path') || '').replace(/^\/+/, '');
    pathname = sub ? `/admin/${sub}` : '/admin';
  }
  url.searchParams.delete('__path');
  await handle(req, res, pathname, url.searchParams);
};
