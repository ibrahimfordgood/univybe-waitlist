# UniVybe Waitlist

Static waitlist site for univybesl.com. Plain HTML, CSS and JavaScript, plus Three.js (loaded from jsDelivr). No build step.

```
waitlist/
├── index.html      page markup
├── styles.css      design system + layout
├── main.js         interactions, VYBE voice, XP, form, confetti
├── scene.js        Three.js hero (clickable 3D XP tokens)
└── assets/
    ├── fonts/      Peace Sans, Creato Display, Komika Title (woff2 + licences)
    └── img/        VYBE cut-outs (transparent webp), favicon
```

## Run locally

```bash
cd waitlist
python -m http.server 5173     # then open http://localhost:5173
```

You need a local server (not `file://`) because `scene.js` is an ES module.

## Collect sign-ups (important)

The form runs in **demo mode** until you set an endpoint. In demo mode, sign-ups are only saved in the visitor's own browser (`localStorage`).

Open `main.js` and edit `CONFIG`:

```js
const CONFIG = {
  endpoint: 'https://script.google.com/macros/s/XXXX/exec',
  format: 'apps-script',          // or 'json' for Formspree / your own API
  siteUrl: 'https://univybesl.com',
};
```

Each sign-up sends:
`name, email, phone, school, role, ref_code, referred_by, warmup_xp, joined_at, source`

`ref_code` is the person's share code. `referred_by` is filled when someone arrives via `?ref=CODE`, so you can count referrals per person or per campus.

### Option A: Google Sheets (free, about 5 minutes)

1. Create a Google Sheet, then go to **Extensions → Apps Script** and paste:

```js
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const d = JSON.parse(e.postData.contents);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['joined_at','name','email','phone','school','role','ref_code','referred_by','warmup_xp','source']);
  }
  sheet.appendRow([d.joined_at, d.name, d.email, d.phone, d.school, d.role, d.ref_code, d.referred_by, d.warmup_xp, d.source]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
```

2. **Deploy → New deployment → Web app**. Set "Execute as: Me" and "Who has access: Anyone".
3. Paste the `/exec` URL into `CONFIG.endpoint` and set `format: 'apps-script'`.

### Option B: Formspree / your own API

Set `endpoint` to the form URL and keep `format: 'json'`.

## Deploy

Upload the `waitlist/` folder to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, cPanel). Point univybesl.com at it.

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
