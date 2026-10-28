# CLAUDE.md — Hot Wok Restaurant QR Digital Menu

Standing instructions for Claude Code. Read this file and `docs/PROJECT_SPEC.md` before doing any work.

## What this project is

A free QR-code digital menu for **Hot Wok Restaurant**, a small Chinese restaurant in Sri Lanka (fried rice, kottu, noodles, devilled dishes, soups, beverages).

- **Customers** scan a QR code on the table → the menu opens in their phone browser. No app, no login, no payments, no ordering.
- **The owner** manages the menu from a PIN-protected admin page on their phone (they do NOT use computers).
- **Everything must cost Rs. 0** to build and run — for the restaurant and for the developer.

## About the developer

The developer (Janana) is a **beginner** building this for free as a real client project and portfolio piece.

- Explain what you are doing in simple language, briefly, after each meaningful change.
- When you introduce a new concept (fetch, async/await, CORS, Apps Script deployment, etc.), give a 2–3 sentence plain explanation.
- Prefer clear, readable code over clever code. Add short comments where logic is not obvious.
- Work **one phase at a time** (see `docs/PROJECT_SPEC.md`). At the end of each phase: summarise what was built, list how to test it on a phone, suggest a git commit message, and **wait for confirmation** before starting the next phase.

## Tech stack (do not change without asking)

| Layer | Technology |
|---|---|
| Frontend | Plain HTML, CSS, vanilla JavaScript (ES modules). **No frameworks, no build step, no npm runtime dependencies.** |
| Font | **Montserrat** from Google Fonts (free) — weights 500, 600, 800 only, `display=swap`, system-font fallback. This is the ONLY web font allowed. |
| Database | Google Sheets |
| Backend API | Google Apps Script deployed as a Web App |
| Hosting | GitHub Pages |
| Tooling only (not shipped) | Node.js scripts allowed for dev tasks, e.g. QR code generation |

## Hard rules

1. **No paid services, no free trials, no "dynamic QR" services, no services that may start charging later.**
2. **Never put secrets in the repo.** The repo is public (GitHub Pages). The admin PIN lives ONLY in Apps Script **Script Properties** (`ADMIN_PIN`). The frontend never contains or validates the PIN itself.
3. **All validation happens server-side** in Apps Script, even if the frontend also validates.
4. **Never insert user/sheet data with `innerHTML`.** Use `textContent` / `createElement` to prevent XSS.
5. **Mobile-first.** Design for ~360px wide Android phones on slow mobile data first. Touch targets ≥ 44px. Base font ≥ 16px.
6. **Fast and light.** Customer page should be usable quickly on 3G. Images in `.webp`, ideally under 100 KB each. No heavy libraries. The only external request allowed is the Montserrat Google Font (see Tech stack).7. **Graceful failure.** If the API fails, show the last cached menu (localStorage) with a small "showing saved menu" note; if nothing is cached, show a friendly error with the restaurant phone number.
8. **Prices** are stored as plain numbers (LKR) and displayed as `Rs. 1,250`.
9. **Wrap all `localStorage` access in try/catch** — it can be unavailable.
10. Do not delete or rename sheet columns or change the API contract without updating `docs/PROJECT_SPEC.md` and telling the developer.
11. **Brand look (customer menu):** dark theme only, black/white plus the logo red as the single accent colour. See "Visual style" in `docs/PROJECT_SPEC.md`.
12. **No `Co-Authored-By` lines** (or any other AI attribution) in suggested commit messages.

## Project structure

```
hot-wok-menu/
├── CLAUDE.md
├── README.md                ← setup + owner guide
├── index.html               ← customer menu
├── admin.html               ← owner menu manager (PIN)
├── manifest.json            ← "Add to Home screen" for admin
├── css/style.css            ← shared styles (CSS variables)
├── css/admin.css            ← admin-only styles
├── js/config.js             ← API_URL and restaurant constants (no secrets)
├── js/api.js                ← all fetch calls to Apps Script
├── js/menu.js               ← customer menu rendering
├── js/admin.js              ← admin logic
├── js/utils.js              ← formatPrice, escaping helpers, storage helpers
├── images/                  ← dish photos (.webp), icons, logo
├── apps-script/Code.gs      ← backend source (copied into the Apps Script editor manually)
├── apps-script/README.md    ← deployment steps
├── tools/generate-qr.js     ← Node script to create the printable QR
└── docs/PROJECT_SPEC.md     ← full specification
```

## Code style

- 2-space indentation, `const`/`let` (never `var`), semicolons, single quotes in JS.
- Small functions with clear names (`renderCategoryTabs`, `toggleAvailability`).
- CSS: custom properties on `:root` for colours/spacing; no inline styles in HTML.
- Accessible HTML: semantic elements, `alt` text on images, labels on inputs, visible focus states.

## Testing checklist (use at the end of each phase)

- Chrome DevTools device mode: 360px Android and iPhone sizes.
- Network throttling "Slow 4G" / "3G".
- Open on a real phone via GitHub Pages (or local network) when possible.
- Admin: wrong PIN rejected, correct PIN works, changes appear on the customer menu after refresh.
