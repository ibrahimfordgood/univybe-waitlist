/* CSV and Excel exports of the sign-up list */
'use strict';

const { buildXlsx } = require('../xlsx');

const CSV_COLUMNS = ['id', 'joined_at', 'name', 'email', 'phone', 'school', 'role', 'ref_code', 'referred_by', 'warmup_xp', 'source'];
const csvCell = v => {
  let s = v == null ? '' : String(v);
  // block spreadsheet formula injection, but leave phone numbers like +232 76 123 456 intact
  if (/^[=@\t\r]/.test(s) || (/^[+\-]/.test(s) && !/^[+\-][\d\s()-]+$/.test(s))) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCSV = rows => '﻿' + [CSV_COLUMNS.join(','), ...rows.map(r => CSV_COLUMNS.map(c => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';

const fmtDate = iso => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
};
const XLSX_COLUMNS = [
  { header: '#', key: 'n', width: 6 },
  { header: 'Joined (UTC)', key: 'joined_at', width: 20, value: r => fmtDate(r.joined_at) },
  { header: 'Name', key: 'name', width: 22 },
  { header: 'Email', key: 'email', width: 32 },
  { header: 'WhatsApp', key: 'phone', width: 18 },
  { header: 'School', key: 'school', width: 40 },
  { header: 'Role', key: 'role', width: 13 },
  { header: 'Ref code', key: 'ref_code', width: 12 },
  { header: 'Referred by', key: 'referred_by', width: 13 },
  { header: 'Warm-up XP', key: 'warmup_xp', width: 12 },
  { header: 'Source', key: 'source', width: 36 },
  { header: 'ID', key: 'id', width: 38 },
];
const toXLSX = rows => buildXlsx(XLSX_COLUMNS, rows.map((r, i) => ({ ...r, n: i + 1 })), 'Waitlist');

module.exports = { toCSV, toXLSX };
