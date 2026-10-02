/* UniVybe waitlist: interactions, VYBE voice, XP, form */
(() => {
  'use strict';

  /* ---------------------------------------------------------
     CONFIG: where sign-ups are sent.
     - "/api/waitlist" is handled by form/server.js (saves to form/data, visible at /admin)
     - format "json":        POST application/json (this server, Formspree, your API)
     - format "apps-script": POST text/plain JSON (Google Apps Script web app)
     Set endpoint to '' for demo mode (saved to this browser only).
     --------------------------------------------------------- */
  const CONFIG = {
    endpoint: '/api/waitlist',
    format: 'json',
    siteUrl: 'https://univybesl.com',
  };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
  };

  $('#year').textContent = new Date().getFullYear();

  /* ---------- toast ---------- */
  const toastEl = $('#toast');
  let toastT;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  /* ---------- nav ---------- */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', scrollY > 30);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- XP system (shared with scene.js) ---------- */
  const hud = $('#xpHud');
  const xpCount = $('#xpCount');
  let xp = store.get('uv_xp') || 0;
  const renderXP = () => {
    if (xp > 0) hud.hidden = false;
    xpCount.textContent = xp;
  };
  renderXP();
  const xpMilestones = { 50: 'VYBE: "Okay, I see you 👀"', 100: 'VYBE: "100 XP before launch? You don cook!"', 200: 'VYBE: "Save some for the real lessons 😭"' };
  window.univybeXP = {
    add(n, x, y) {
      const before = xp;
      xp += n;
      store.set('uv_xp', xp);
      renderXP();
      hud.classList.remove('bump'); void hud.offsetWidth; hud.classList.add('bump');
      if (x != null) {
        const p = document.createElement('div');
        p.className = 'xp-pop';
        p.textContent = `+${n} XP`;
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1000);
      }
      for (const m of Object.keys(xpMilestones)) {
        if (before < m && xp >= m) toast(xpMilestones[m]);
      }
      $('#popTip')?.classList.remove('show');
    },
    get value() { return xp; },
  };
  setTimeout(() => { if (xp === 0) $('#popTip')?.classList.add('show'); }, 3500);

  /* ---------- manifesto word-by-word reveal ---------- */
  const mText = $('#manifestoText');
  const accentWords = new Set(['fun.', 'learning']);
  mText.innerHTML = mText.textContent.trim().split(/\s+/)
    .map(w => `<span class="w${accentWords.has(w.toLowerCase()) ? ' accent' : ''}">${w}</span>`).join(' ');
  const words = $$('.w', mText);
  function paintManifesto() {
    const r = mText.getBoundingClientRect();
    const vh = innerHeight;
    const progress = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
    const lit = Math.round(progress * words.length);
    words.forEach((w, i) => w.classList.toggle('on', i < lit));
  }
  if (reduceMotion) words.forEach(w => w.classList.add('on'));
  else { addEventListener('scroll', paintManifesto, { passive: true }); paintManifesto(); }

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.18 });
  $$('.reveal').forEach(el => io.observe(el));

  /* ---------- hero sticker parallax ---------- */
  const stickers = $$('.sticker');
  if (!reduceMotion && matchMedia('(pointer: fine)').matches) {
    let mx = 0, my = 0, cx = 0, cy = 0;
    addEventListener('pointermove', e => {
      mx = (e.clientX / innerWidth - 0.5) * 2;
      my = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
    (function loop() {
      cx += (mx - cx) * 0.08; cy += (my - cy) * 0.08;
      stickers.forEach(s => {
        const d = parseFloat(s.dataset.depth) || 1;
        s.style.transform = `translate3d(${cx * 14 * d}px, ${cy * 12 * d}px, 0)`;
      });
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- VYBE voice ---------- */
  const LINES = {
    hype: [
      '+30 XP. Nice work! Keep the Vybe alive.',
      'Small steps. Big wins. You\'re on a roll!',
      'Streak looking healthy. I\'m proud of you fr.',
      'Top of the leaderboard looks good on you 😎',
      'Study smart. Chill after. You earned it.',
    ],
    tough: [
      'You don\'t need motivation. You need to start.',
      'You\'ve checked the feed three times. Now go check your notes.',
      'Your streak is looking nervous. 😬',
      'You said you\'d study five minutes ago. VYBE remembers. 👀',
      'You have watched enough TikToks today. 😭 One lesson. Then chill.',
      'That lesson isn\'t going to complete itself.',
    ],
    krio: [
      'A de see you. Go do your lesson. 😭',
      'No lef am for tomorrow.',
      'You don cook this quiz! 🔥',
      'Small small, we go reach.',
      'Na one more lesson.',
      'You wan make your department beat you? 😭',
    ],
    comfort: [
      'Bad quiz? No stress. Learn from it and run it back.',
      'Progress over perfection. Always.',
      'One lesson today is still a win. I mean it.',
      'Rest is part of the plan. Come back stronger.',
      'No stress. Just progress.',
    ],
  };
  const HALO = {
    hype: 'rgba(255,190,11,.65)',
    tough: 'rgba(255,0,110,.55)',
    krio: 'rgba(0,245,212,.5)',
    comfort: 'rgba(131,56,236,.6)',
  };
  let mode = 'hype';
  const idx = { hype: 0, tough: 0, krio: 0, comfort: 0 };
  const bubble = $('#bubble');
  const bubbleText = $('#bubbleText');
  const halo = $('#vybeHalo');
  const vybeBtn = $('#vybeBtn');

  function say(next = true) {
    if (next) idx[mode] = (idx[mode] + 1) % LINES[mode].length;
    bubbleText.textContent = LINES[mode][idx[mode]];
    bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
    halo.style.setProperty('--halo', HALO[mode]);
  }
  $$('.mode').forEach(btn => btn.addEventListener('click', () => {
    $$('.mode').forEach(b => { b.classList.toggle('is-active', b === btn); b.setAttribute('aria-pressed', b === btn); });
    mode = btn.dataset.mode;
    idx[mode] = -1;
    say();
  }));
  let vybeTaps = 0;
  vybeBtn.addEventListener('click', e => {
    say();
    vybeBtn.classList.remove('boing'); void vybeBtn.offsetWidth; vybeBtn.classList.add('boing');
    if (++vybeTaps % 5 === 0) {
      const r = vybeBtn.getBoundingClientRect();
      window.univybeXP.add(10, r.left + r.width / 2, r.top + 40);
    }
  });

  /* ---------- quick join (hero) ---------- */
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const quick = $('#quickJoin');
  const quickEmail = $('#quickEmail');
  const quickHint = $('#quickHint');
  const quickHintText = quickHint.textContent;
  quick.addEventListener('submit', e => {
    e.preventDefault();
    const v = quickEmail.value.trim();
    if (!emailRe.test(v)) {
      quickHint.textContent = 'That email looks off. Try again? 👀';
      quickHint.classList.add('is-error');
      quick.classList.remove('shake'); void quick.offsetWidth; quick.classList.add('shake');
      quickEmail.focus();
      return;
    }
    quickHint.textContent = quickHintText;
    quickHint.classList.remove('is-error');
    $('#email').value = v;
    $('#join').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    setTimeout(() => $('#name').focus({ preventScroll: true }), reduceMotion ? 0 : 700);
  });

  /* ---------- full form ---------- */
  const form = $('#joinForm');
  const submitBtn = $('#submitBtn');
  const formMsg = $('#formMsg');
  const success = $('#success');
  const params = new URLSearchParams(location.search);
  const referredBy = params.get('ref') || store.get('uv_ref_in') || '';
  if (params.get('ref')) store.set('uv_ref_in', params.get('ref'));

  const refCode = s => {
    let h = 5381;
    for (const ch of s.toLowerCase()) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
    return h.toString(36).slice(0, 7);
  };

  function setErr(name, msg) {
    const field = form.elements[name].closest('.field');
    field.classList.toggle('invalid', !!msg);
    $(`.err[data-for="${name}"]`, form).textContent = msg || '';
  }
  function validate() {
    const d = Object.fromEntries(new FormData(form));
    let ok = true;
    const check = (name, cond, msg) => { setErr(name, cond ? '' : msg); if (!cond) ok = false; };
    check('name', d.name.trim().length >= 2, 'What should VYBE call you?');
    check('email', emailRe.test(d.email.trim()), 'Enter a valid email address.');
    check('phone', !d.phone.trim() || /^\+?[\d\s()-]{7,18}$/.test(d.phone.trim()), 'That number looks off. Include your country code, like +232.');
    check('school', !!d.school, 'Pick your campus (or "Other").');
    return ok ? d : null;
  }
  ['name', 'email', 'phone', 'school'].forEach(n =>
    form.elements[n].addEventListener('input', () => form.elements[n].closest('.field').classList.contains('invalid') && validate()));

  async function send(payload) {
    if (!CONFIG.endpoint) {
      // Demo mode: keep a local copy so nothing is lost while the backend is wired up.
      const list = store.get('uv_waitlist_demo') || [];
      list.push(payload);
      store.set('uv_waitlist_demo', list);
      console.info('[UniVybe] Demo mode: set CONFIG.endpoint in main.js to collect sign-ups.', payload);
      await new Promise(r => setTimeout(r, 700));
      return {};
    }
    const asText = CONFIG.format === 'apps-script';
    const res = await fetch(CONFIG.endpoint, {
      method: 'POST',
      headers: asText ? { 'Content-Type': 'text/plain;charset=utf-8' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    let body = {};
    try { body = await res.json(); } catch { /* non-JSON response */ }
    if (res.status === 422 && body.errors) {
      Object.entries(body.errors).forEach(([field, msg]) => form.elements[field] && setErr(field, msg));
      throw Object.assign(new Error('Validation failed'), { shown: true });
    }
    if (res.status === 429) throw Object.assign(new Error('Rate limited'), { userMsg: 'Too many sign-ups from this network. Try again in a few minutes.' });
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    return body;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    formMsg.textContent = '';
    const d = validate();
    if (!d) { $('.field.invalid input, .field.invalid select', form)?.focus(); return; }
    if (d.company) return; // honeypot

    const payload = {
      name: d.name.trim(),
      email: d.email.trim().toLowerCase(),
      phone: d.phone.trim(),
      school: d.school,
      role: d.role,
      ref_code: refCode(d.email.trim()),
      referred_by: referredBy,
      warmup_xp: window.univybeXP.value,
      joined_at: new Date().toISOString(),
      source: location.href,
    };

    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    try {
      const resp = await send(payload);
      const ref = resp.ref_code || payload.ref_code;
      store.set('uv_joined', { name: payload.name, ref, school: payload.school });
      showSuccess(payload.name, ref, payload.school);
      window.univybeXP.add(50);
      confetti();
    } catch (err) {
      console.error(err);
      if (!err.shown) formMsg.textContent = err.userMsg || 'Something went wrong on our side. Check your connection and try again.';
    } finally {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
    }
  });

  function showSuccess(name, ref, school) {
    const link = `${CONFIG.siteUrl}/?ref=${ref}`;
    $('#successName').textContent = name.split(' ')[0];
    if (school && !/other|secondary/i.test(school)) {
      $('#successText').textContent = `We'll let you know the moment UniVybe opens at ${school}. Rep your campus.`;
    }
    const msg = `I just joined the UniVybe waitlist 😎 Learning that plays like a game: XP, streaks, campus leaderboards. Join the Vybe: ${link}`;
    $('#shareWa').href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    $('#copyLink').onclick = async () => {
      try { await navigator.clipboard.writeText(link); toast('Link copied. Go recruit your squad 🔥'); }
      catch { prompt('Copy your link:', link); }
    };
    form.hidden = true;
    success.hidden = false;
    success.focus({ preventScroll: true });
  }

  const joined = store.get('uv_joined');
  if (joined) showSuccess(joined.name, joined.ref, joined.school);

  /* ---------- confetti (2D canvas, brand colours) ---------- */
  function confetti() {
    if (reduceMotion) return;
    const c = document.createElement('canvas');
    c.className = 'confetti';
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = ['#FFBE0B', '#3A86FF', '#FF006E', '#00F5D4', '#8338EC', '#FFF7E6'];
    const r = $('#formCard').getBoundingClientRect();
    const ox = r.left + r.width / 2, oy = r.top + 80;
    const parts = Array.from({ length: 160 }, () => ({
      x: ox, y: oy,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 15 - 4,
      w: 6 + Math.random() * 8, h: 8 + Math.random() * 10,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      color: colors[(Math.random() * colors.length) | 0],
      shape: Math.random() < 0.3 ? 'circle' : 'rect',
    }));
    const start = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(p => {
        p.vy += 0.42; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
        if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 2);
        ctx.restore();
      });
      if (t - start < 3200) requestAnimationFrame(frame); else c.remove();
    })(start);
  }
})();
