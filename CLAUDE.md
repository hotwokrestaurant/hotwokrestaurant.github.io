# CLAUDE.md — Hot Wok Restaurant QR Digital Menu

Standing instructions for Claude Code. Read this file and `docs/PROJECT_SPEC.md` before doing any work.

## What this project is

A free QR-code digital menu for **Hot Wok Restaurant**, a small Chinese restaurant in Sri Lanka (fried rice, kottu, noodles, devilled dishes, soups, beverages).

- **Customers** scan a QR code on the table → the menu opens in their phone browser. No app, no login, no payments, no ordering.
- **The owner** manages the menu from a password-protected admin page on their phone (Firebase Authentication, email + password). They do NOT use computers.
- **Everything must cost Rs. 0** to build and run — for the restaurant and for the developer.

**Live URLs**
- Customer menu (encoded in the printed QR code): https://hotwokrestaurant.github.io/
- Admin page: https://hotwokrestaurant.github.io/admin.html
- GitHub repo: `hotwokrestaurant/hotwokrestaurant.github.io` (an organization Pages site — the repo must keep this exact name to be served at the root URL).

## About the developer

The developer (Janana) is a **beginner** building this for free as a real client project and portfolio piece.

- Explain what you are doing in simple language, briefly, after each meaningful change.
- When you introduce a new concept (fetch, async/await, Firestore documents, security rules, auth persistence, etc.), give a 2–3 sentence plain explanation.
- Prefer clear, readable code over clever code. Add short comments where logic is not obvious.
- Work **one phase at a time** (see `docs/PROJECT_SPEC.md`). At the end of each phase: summarise what was built, list how to test it on a phone, suggest a git commit message, and **wait for confirmation** before starting the next phase.

## Tech stack (do not change without asking)

| Layer | Technology |
|---|---|
| Frontend | Plain HTML, CSS, vanilla JavaScript (ES modules). **No frameworks, no build step, no npm runtime dependencies.** |
| Font | **Montserrat** from Google Fonts (free) — weights 500, 600, 800 only, `display=swap`, system-font fallback. This is the ONLY web font allowed. |
| Database | **Cloud Firestore** (Firebase **Spark free plan**, region `asia-south1`). The whole published menu is ONE document, `menu/published`. |
| Owner login | **Firebase Authentication**, email/password. Owner account created manually in the console; no sign-up flow. Allow-list: `admins/{uid}` documents. |
| Backend logic | None — no server code. Security and validation live in `firebase/firestore.rules`. |
| Firebase SDK | Modular SDK as ES modules from the official CDN, **pinned**: `https://www.gstatic.com/firebasejs/12.19.0/…`. Customer page: **Firestore Lite** (read-only, small). Admin page: full Firestore + Auth. |
| Hosting | GitHub Pages (organization site), served at https://hotwokrestaurant.github.io/ |
| Tooling only (not shipped) | Node.js scripts allowed for dev tasks, e.g. QR code generation |

## Hard rules

1. **No paid services, no free trials, no "dynamic QR" services, no services that may start charging later.** Firebase stays on the **Spark plan** forever: never anything that needs billing (no Blaze upgrade, no Cloud Storage, no Cloud Functions, no paid extensions).
2. **Never put secrets in the repo.** The repo is public (GitHub Pages). The Firebase web config in `js/config.js` is *not* a secret (it only identifies the project). The owner's password, Google account details and any service-account keys must never be committed.
3. **All validation happens in `firebase/firestore.rules`** (types, sizes, allowed fields, known categories), even if the frontend also validates. Limits that come from how rules work (no loops, max 1,000 steps per request): a save may add/change **at most 3 dishes**, and a save that changes the **categories** can't also change dishes. Rules are tested in the Firestore emulator before every change.
4. **Never insert user/database data with `innerHTML`.** Use `textContent` / `createElement` to prevent XSS.
5. **Mobile-first.** Design for ~360px wide Android phones on slow mobile data first. Touch targets ≥ 44px. Base font ≥ 16px.
6. **Fast and light.** Customer page should be usable quickly on 3G. Images in `.webp`, ideally under 100 KB each. No heavy libraries. The only external requests allowed are the Montserrat Google Font, the pinned Firebase SDK from gstatic, and Firebase itself (see Tech stack).
7. **Graceful failure.** If Firestore can't be reached, show the last cached menu (localStorage) with a small "showing saved menu" note; if nothing is cached, show a friendly error with the restaurant phone number.
8. **Prices** are stored as whole-rupee integers (LKR) and displayed as `Rs. 1,250`.
9. **Wrap all `localStorage` access in try/catch** — it can be unavailable.
10. Do not change the menu data shape (`menu/published`: `settings`, `categories`, `items`, `updatedAt`; same shape as `js/sample-data.js`) or the security rules without updating `docs/PROJECT_SPEC.md` and telling the developer.
11. **Brand look (customer menu):** dark theme only, black/white plus the logo red as the single accent colour. See "Visual style" in `docs/PROJECT_SPEC.md`.
12. **No `Co-Authored-By` lines** (or any other AI attribution) in suggested commit messages.
13. **No photo uploads.** The admin page never handles images. Dish photos, if ever added, are put in `images/` by the developer; the `image` field stays optional.
14. **Customer page = Firestore Lite only** (one `getDoc` per visit, no Auth SDK). Keep the Firebase SDK version identical in every import URL.
15. **Admin writes never overwrite the menu document.** Every change is a `runTransaction` that reads the latest menu and `tx.update`s only the changed field (`items`, `settings` or `categories`) plus `updatedAt`. Never `setDoc` from the admin page (see spec 4.3).
16. **Developer-only files are not published.** `_config.yml` excludes `firebase/`, `docs/`, `tools/`, `CLAUDE.md`, `README.md` from GitHub Pages. Never add `.nojekyll`. New developer-only folders must be added to that list.

## Project structure

```
hotwokrestaurant.github.io/  ← repo root (the local folder may still be called hot-wok-menu)
├── CLAUDE.md
├── _config.yml              ← GitHub Pages: keeps developer-only files off the website
├── README.md                ← setup + owner guide
├── index.html               ← customer menu
├── admin.html               ← owner menu manager (email/password login)
├── manifest.json            ← "Add to Home screen" for admin
├── css/style.css            ← shared styles (CSS variables)
├── css/admin.css            ← admin-only styles
├── js/config.js             ← Firebase web config + menu document path (no secrets)
├── js/api.js                ← customer menu loading (Firestore Lite) + localStorage cache
├── js/menu.js               ← customer menu rendering
├── js/admin.js              ← admin logic (Firestore + Auth)
├── js/utils.js              ← formatPrice, escaping helpers, storage helpers
├── js/sample-data.js        ← offline sample menu (same shape as menu/published)
├── images/                  ← dish photos (.webp), icons, logo
├── firebase/firestore.rules ← security rules (pasted into the console)
├── firebase/menu-seed.json  ← starting menu data
├── firebase/setup.html/.js/.css ← developer-only page: rule tests + loads the seed
├── firebase/README.md       ← click-by-click Firebase setup
├── tools/generate-qr.js     ← Node script to create the printable QR
└── docs/PROJECT_SPEC.md     ← full specification
```

## Code style

- 2-space indentation, `const`/`let` (never `var`), semicolons, single quotes in JS.
- Small functions with clear names (`renderCategoryTabs`, `toggleAvailability`).
- CSS: custom properties on `:root` for colours/spacing; no inline styles in HTML.
- Accessible HTML: semantic elements, `alt` text on images, labels on inputs, visible focus states.

## Testing checklist (use at the end of each phase)

- Chrome DevTools device mode: 320–430px phones, 768px tablet, 1280px+ desktop, and phones in landscape.
- Phone text size at 200% (and iPhone "aA" page zoom): nothing overlaps, is cut off, or scrolls sideways.
- Older phones: avoid newer JS/CSS without a fallback (e.g. `replaceChildren()`, flex `gap`, `min()`); see the comments in `css/style.css`.
- Network throttling "Slow 4G" / "3G".
- Open on a real phone via https://hotwokrestaurant.github.io/ (or local network) when possible.
- Admin: wrong password rejected, owner can sign in and stays signed in, changes appear on the customer menu after refresh.
- Firebase: signed-out read works, signed-out write is rejected, owner write works (`firebase/setup.html`). Watch Firestore → Usage stays far below the free limits.
