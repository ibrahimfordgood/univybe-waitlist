# UniVybe Waitlist

Waitlist site for univybesl.com. Plain HTML, CSS and JavaScript, plus Three.js (loaded from jsDelivr), with a small Node.js backend in `form/` that stores sign-ups and serves a password-protected `/admin` dashboard. No build step and no npm dependencies.

```
waitlist/
├── index.html        page markup
├── styles.css        design system + layout
├── main.js           interactions, VYBE voice, XP, form, confetti
├── scene.js          Three.js hero (clickable 3D XP tokens)
├── package.json      npm start -> node form/server.js
├── assets/
│   ├── fonts/        Peace Sans, Creato Display, Komika Title (woff2 + licences)
│   └── img/          VYBE cut-outs (transparent webp), favicon
└── form/
    ├── server.js     serves the site, saves sign-ups, runs /admin
    ├── .env          ADMIN_PASSWORD etc. (not committed; copy from .env.example)
    ├── .env.example  template for .env
    ├── admin/        login page + live dashboard
    └── data/         submissions.json + submissions.csv (not committed)
```

## Run locally

Requires Node.js 20.12 or newer.

```bash
cd waitlist
cp form/.env.example form/.env    # first time only, then set ADMIN_PASSWORD
npm start
```

- Site: http://localhost:3000
- Admin: http://localhost:3000/admin

If port 3000 is busy, change `PORT` in `form/.env`.

## How sign-ups are stored

The site's form posts to `/api/waitlist`. Every new sign-up is added to:

- `form/data/submissions.json`, the master record
- `form/data/submissions.csv`, which opens directly in Excel or Google Sheets

Duplicate emails are not added twice. If someone signs up again they get their original referral code back.

Each record has:
`id, joined_at, name, email, phone, school, role, ref_code, referred_by, warmup_xp, source`

`ref_code` is the person's share code. `referred_by` is filled when someone arrives via `?ref=CODE`.

The server rate-limits sign-ups (20 per 10 minutes per IP address) and has a hidden honeypot field to catch bots.

## Admin dashboard (`/admin`)

1. Go to `/admin` and enter the password set in `form/.env` (`ADMIN_PASSWORD`).
2. You'll see:
   - totals by role and for the last 24 hours
   - sign-ups by campus
   - top referrers
   - a searchable table of every sign-up
   - an **Export CSV** button
3. The dashboard refreshes itself every 10 seconds, so new sign-ups appear without reloading.

Security:
- **Sessions:** last 12 hours (`SESSION_HOURS`). The cookie is HttpOnly and SameSite=Strict.
- **Lockout:** after 5 login attempts in 15 minutes from the same IP address.
- **Hidden from search engines:** admin pages are `noindex` and have a strict content-security policy.
- **Not publicly reachable:** `form/`, `.env`, the data files and all dotfiles are never served.

Change the password: edit `ADMIN_PASSWORD` in `form/.env` and restart the server. Pick a long, unique password before going live. A numeric password is easy to guess.

## Deploy

The site now needs a host that runs Node.js, for example Render, Railway, Fly.io or a VPS. A purely static host like Netlify or GitHub Pages can't save sign-ups.

1. Push this repo, then create a Node web service with start command `npm start`.
2. Set the environment variables `ADMIN_PASSWORD`, `PORT` (usually provided by the host) and `SECURE_COOKIES=true`, since production runs on HTTPS.
3. Attach a **persistent disk** mounted at `form/data`. Otherwise sign-ups are lost when the host redeploys or restarts.
4. Point univybesl.com at the service.

Back up `form/data/submissions.json` regularly. You can also download a copy any time with **Export CSV** in `/admin`.

### Prefer a static host instead?

Set `CONFIG.endpoint` in `main.js` to a Google Apps Script web app or a Formspree URL. With `format: 'apps-script'`, the Apps Script receives the same JSON fields as above. In that case `/admin` isn't used.

## Brand system used

| Token  | Hex       | Use                                   |
|--------|-----------|---------------------------------------|
| Yellow | `#FFBE0B` | VYBE glow, primary CTA, highlights    |
| Ink    | `#0E0C09` | Dark sections, text on light          |
| Paper  | `#FFF7E6` | Light sections                        |
| Blue   | `#3A86FF` | Learn pillar                          |
| Pink   | `#FF006E` | Compete pillar                        |
| Cyan   | `#00F5D4` | Connect pillar                        |
| Purple | `#8338EC` | Grow pillar                           |

Accent colours come from the "Edu student" palette. Yellow and ink come from the VYBE mascot.

## Fonts (from dafont.com)

- **Peace Sans** (display). SIL Open Font License (dafont lists it as "Public domain / GPL / OFL"). See `assets/fonts/LICENSE-peace-sans.txt`.
- **Creato Display** (body) by Anugrah Pasau. SIL Open Font License.
- **Komika Title** (VYBE's speech bubbles) by Apostrophic Labs. dafont lists it as "100% Free".

## Notes

- The leaderboard, feed post and badge cards are **illustrative app UI previews**, not live data.
- The hero respects `prefers-reduced-motion` (it shows a static scene and no confetti). Rendering pauses when the hero is off-screen or the tab is hidden.
- The XP mini-game (tapping floating tokens, tapping VYBE) is stored per browser. It is sent as `warmup_xp` with the sign-up so you can spot the most engaged early users.
