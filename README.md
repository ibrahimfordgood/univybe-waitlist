# UniVybe Waitlist

Waitlist site for univybesl.com. Plain HTML, CSS and JavaScript, plus Three.js (loaded from jsDelivr), with a small backend that stores sign-ups in a **Neon Postgres** database and serves a password-protected `/admin` dashboard with Excel export. It runs on **Vercel** (serverless functions in `api/`) or locally with `npm start`.

```
waitlist/
├── index.html, styles.css, main.js, scene.js   the site
├── assets/           fonts (+ licences) and VYBE images
├── api/
│   ├── waitlist.js   Vercel function: POST /api/waitlist
│   └── admin.js      Vercel function: /admin/* (login, dashboard, exports)
├── vercel.json       routes /admin to the admin function
├── package.json      npm start; depends on @neondatabase/serverless
└── form/
    ├── server.js     local / Node-host server (site + same handlers)
    ├── lib/          shared code: app (routes), store (Neon or files), config, exporters
    ├── xlsx.js       built-in Excel (.xlsx) writer
    ├── admin/        login page + live dashboard
    ├── .env          your secrets (not committed; copy from .env.example)
    └── data/         local-only storage when no database is set (not committed)
```

## Where sign-ups are stored

| Setup | Storage |
|---|---|
| `DATABASE_URL` set (always on Vercel) | Neon table `waitlist_signups`, created automatically on first use |
| No `DATABASE_URL` (local only) | `form/data/submissions.json`, plus `submissions.csv` and `submissions.xlsx` copies updated on every sign-up |

Either way, `/admin` has **Export Excel** and **CSV** buttons. They download the full list at that moment.

Each record has:
`id, joined_at, name, email, phone, school, role, ref_code, referred_by, warmup_xp, source`

Duplicate emails are stored once. Someone who signs up again gets their original referral code back.

## Environment variables

| Name | Required | Notes |
|---|---|---|
| `ADMIN_PASSWORD` | yes | Password for `/admin`. Use a long one in production. |
| `DATABASE_URL` | on Vercel | Neon connection string. The Vercel ↔ Neon integration sets it automatically. |
| `SESSION_SECRET` | no | Signs admin login cookies. Defaults to a value derived from the password, so changing the password logs everyone out. |
| `SESSION_HOURS` | no | Admin login lifetime (default 12). |
| `PORT` | no | Local server port (default 3000). |

Locally these go in `form/.env`. On Vercel, set them in **Project → Settings → Environment Variables**.

## Deploy on Vercel with Neon

1. Import this GitHub repo in Vercel. Framework preset: **Other**. No build command is needed.
2. Go to **Storage → Create / Connect Database → Neon** and link it to the project. This adds `DATABASE_URL`.
3. Add `ADMIN_PASSWORD` under **Settings → Environment Variables**.
4. Redeploy. The site is at `/` and the dashboard at `/admin`. The tables are created on the first sign-up or login.

Notes:
- Admin logins use signed cookies, and the lockout (5 tries per 15 minutes) is tracked in Neon, so both work across Vercel's serverless instances.
- The files in `form/` and `api/` hold code only, no secrets or data. All data access goes through `/admin` and requires a login.

## Run locally

Requires Node.js 20.12 or newer.

```bash
cd waitlist
npm install                         # first time only (installs the Neon driver)
cp form/.env.example form/.env      # first time only, then fill it in
npm start
```

- Site: http://localhost:3000
- Admin: http://localhost:3000/admin

With `DATABASE_URL` in `form/.env`, local sign-ups go to the same Neon database as production. Leave it empty to use local files. If port 3000 is busy, change `PORT`.

## Admin dashboard (`/admin`)

- Totals by role and for the last 24 hours, sign-ups by campus, top referrers, and a searchable table.
- Refreshes itself every 10 seconds.
- **Export Excel** (`.xlsx`) and **CSV** downloads.
- Security:
  - HttpOnly, SameSite=Strict session cookie (marked Secure on Vercel)
  - lockout after 5 failed attempts in 15 minutes
  - pages are `noindex` with a strict content-security policy

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
