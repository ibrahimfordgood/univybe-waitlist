/* Vercel function: POST /api/waitlist (saves a sign-up to Neon) */
'use strict';

const { handle } = require('../form/lib/app');

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  await handle(req, res, '/api/waitlist', searchParams);
};
