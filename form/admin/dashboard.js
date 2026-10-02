/* UniVybe admin dashboard: polls the submissions API and renders stats + table */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const REFRESH_MS = 10000;
  let all = [];
  let lastCount = -1;

  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const fmtDate = iso => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  function renderStats() {
    const dayAgo = Date.now() - 864e5;
    const by = r => all.filter(s => s.role === r).length;
    $('sTotal').textContent = all.length;
    $('sToday').textContent = all.filter(s => new Date(s.joined_at) > dayAgo).length;
    $('sStudents').textContent = by('student');
    $('sEducators').textContent = by('educator');
    $('sInstitutions').textContent = by('institution');
    $('sRefs').textContent = all.filter(s => s.referred_by).length;

    // by campus
    const schools = {};
    all.forEach(s => { schools[s.school] = (schools[s.school] || 0) + 1; });
    const sorted = Object.entries(schools).sort((a, b) => b[1] - a[1]);
    const max = sorted[0]?.[1] || 1;
    const list = $('bySchool');
    list.replaceChildren();
    if (!sorted.length) list.append(el('li', 'No data yet', 'muted'));
    sorted.forEach(([name, n]) => {
      const li = el('li');
      const top = el('div', null, 'bar-top');
      top.append(el('span', name), el('b', String(n)));
      const bar = el('div', null, 'bar');
      const fill = el('i');
      fill.style.width = (n / max) * 100 + '%';
      bar.append(fill);
      li.append(top, bar);
      list.append(li);
    });

    // top referrers: count sign-ups whose referred_by matches someone's ref_code
    const counts = {};
    all.forEach(s => { if (s.referred_by) counts[s.referred_by] = (counts[s.referred_by] || 0) + 1; });
    const byCode = Object.fromEntries(all.map(s => [s.ref_code, s]));
    const refs = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const rl = $('topRefs');
    rl.replaceChildren();
    if (!refs.length) rl.append(el('li', 'No referrals yet', 'muted'));
    refs.forEach(([code, n]) => {
      const who = byCode[code];
      const li = el('li');
      li.append(el('span', who ? `${who.name} · ${who.school}` : `Code ${code}`), el('b', `${n} invited`));
      rl.append(li);
    });
  }

  function renderTable() {
    const q = $('q').value.trim().toLowerCase();
    const role = $('role').value;
    const rows = all
      .map((s, i) => ({ ...s, n: i + 1 }))
      .filter(s => !role || s.role === role)
      .filter(s => !q || [s.name, s.email, s.phone, s.school, s.ref_code, s.referred_by].some(v => (v || '').toLowerCase().includes(q)))
      .reverse();
    const tb = $('rows');
    tb.replaceChildren();
    rows.forEach(s => {
      const tr = el('tr');
      if (s.n > lastCount && lastCount !== -1) tr.className = 'new';
      const email = el('td');
      const a = el('a', s.email);
      a.href = 'mailto:' + s.email;
      email.append(a);
      const phone = el('td');
      if (s.phone) {
        const w = el('a', s.phone);
        w.href = 'https://wa.me/' + s.phone.replace(/[^\d]/g, '');
        w.target = '_blank';
        w.rel = 'noopener';
        phone.append(w);
      }
      tr.append(
        el('td', String(s.n), 'num'), el('td', fmtDate(s.joined_at), 'nowrap'), el('td', s.name, 'strong'),
        email, phone, el('td', s.school), el('td', s.role, `role role-${s.role}`),
        el('td', s.ref_code, 'mono'), el('td', s.referred_by || '—', 'mono'), el('td', String(s.warmup_xp || 0), 'num'),
      );
      tb.append(tr);
    });
    $('shown').textContent = rows.length === all.length ? `(${all.length})` : `(${rows.length} of ${all.length})`;
    $('empty').hidden = all.length > 0;
  }

  async function load() {
    try {
      const res = await fetch('/admin/api/submissions', { cache: 'no-store', credentials: 'same-origin' });
      if (res.status === 401) { location.href = '/admin'; return; }
      const data = await res.json();
      all = data.submissions || [];
      renderStats();
      renderTable();
      if (lastCount !== -1 && all.length > lastCount) document.title = `(${all.length - lastCount} new) UniVybe Admin`;
      lastCount = all.length;
      $('updated').textContent = 'updated ' + new Date().toLocaleTimeString();
      $('live').classList.remove('off');
    } catch {
      $('updated').textContent = 'offline, retrying…';
      $('live').classList.add('off');
    }
  }

  $('q').addEventListener('input', renderTable);
  $('role').addEventListener('change', renderTable);
  addEventListener('focus', () => { document.title = 'UniVybe Admin — Waitlist'; });
  load();
  setInterval(load, REFRESH_MS);
})();
