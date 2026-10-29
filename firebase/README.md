# Firebase setup — Hot Wok Menu

This guide sets up the free backend for the menu: **Cloud Firestore** (the database) and **Firebase Authentication** (the owner's login). Follow the steps in order, on a computer. It takes about 45 minutes.

**Cost: Rs. 0.** Everything here runs on Firebase's free **Spark plan**. Never click **Upgrade** or **Blaze**, and never add a billing account. On the Spark plan, Firebase can't charge anything. If a free limit is ever reached, it just pauses until the next day (see [Free limits](#free-limits)).

## What gets created

| Thing | What it's for |
|---|---|
| Firestore document `menu/published` | The whole menu in **one** document: `settings`, `categories`, `items`, `updatedAt`. Same shape as `firebase/menu-seed.json`. Each customer visit reads it once. |
| Firestore collection `admins` | The allow-list. One document per owner account, named after that account's **UID**. Only these accounts can change the menu. |
| One Authentication user | The owner's email + password, created by you in the console. There's no sign-up page. |
| `firebase/firestore.rules` | The security rules: anyone can read the menu; only allow-listed accounts can save it, and only valid data. |

---

## A. Create the Firebase project

Use the **restaurant's own Google account**, not your personal one, so the restaurant owns its data.

1. In Chrome, open a **separate Chrome profile** for the restaurant account (profile icon at the top right → **Add**). This stops your personal account getting mixed in.
2. Go to **https://console.firebase.google.com** and sign in with the restaurant's Google account.
3. Click **Create a Firebase project** (on some screens it says **Get started** or **Add project**).
4. **Project name:** type `Hot Wok Menu`.
   - Under the name, Firebase shows a **project ID** (e.g. `hot-wok-menu-a1b2c`). Click the small pencil to pick a cleaner one if you like. **It can't be changed later.**
5. Tick the terms box → **Continue**.
6. If you're asked about **AI assistance / Gemini in Firebase**, turn it **off** → **Continue**. The menu doesn't need it.
7. **Google Analytics:** turn the switch **off**. I recommend off because:
   - A menu doesn't need visitor tracking.
   - Analytics adds cookies and privacy obligations.
   - It adds an extra script to download on customers' phones.
   - It can be switched on later if ever wanted.
8. Click **Create project**. Wait for "Your new project is ready", then **Continue**.
9. **Check the plan:** the bottom of the left menu should say **Spark** (no-cost). Leave it that way forever.

## B. Register the web app and get the config

1. On the project's home page (**Project Overview**), click the **Web** icon: **`</>`**. If you don't see it, click **+ Add app** → **Web**.
2. **App nickname:** `Hot Wok Menu`.
3. Leave **"Also set up Firebase Hosting"** **unticked**. The site is hosted on GitHub Pages.
4. Click **Register app**.
5. Firebase shows some code containing `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`. Keep this screen open.
6. In VS Code, open **`js/config.js`**. Replace each `PASTE_…` value with the matching value from Firebase. Keep the quotes:
   ```js
   export const FIREBASE_CONFIG = {
     apiKey: 'AIzaSy…',
     authDomain: 'hot-wok-menu-a1b2c.firebaseapp.com',
     projectId: 'hot-wok-menu-a1b2c',
     storageBucket: 'hot-wok-menu-a1b2c.firebasestorage.app',
     messagingSenderId: '1234567890',
     appId: '1:1234567890:web:abc123…'
   };
   ```
   Save the file. (`storageBucket` is part of the standard config, but the project never uses Cloud Storage.)
7. Back in Firebase, click **Continue to console**.

**Finding the config again later:** ⚙ (gear, top left) → **Project settings** → **General** → scroll to **Your apps** → **SDK setup and configuration** → **Config**.

> **Is it safe to put this in a public repo?** Yes. This config only tells the browser *which* Firebase project to talk to. Every website that uses Firebase sends it to visitors. The protection is the security rules (step F) plus the owner's password. Never commit the owner's password or anything from the Google account itself.

## C. Enable Cloud Firestore (production mode, Mumbai region)

1. In the left menu, open **Build → Firestore Database**. Newer console layouts may show it under **Databases & Storage → Firestore**.
2. Click **Create database**.
3. If asked for an **edition**, choose **Standard edition**. Other editions need billing.
4. **Database ID:** leave it as **`(default)`**. The free quota only applies to the `(default)` database.
5. **Location:** choose **`asia-south1` (Mumbai)**.
   - **Why Mumbai:** it's Google's closest data centre to Sri Lanka, so the menu loads fastest for customers. (`asia-southeast1`, Singapore, would also work, just a bit further away.)
   - ⚠️ **The location can never be changed.** Picking a different one later means creating a whole new project, so double-check before continuing.
6. **Security rules:** choose **Start in production mode**. Everything stays locked until you publish the real rules in step F.
7. Click **Create** and wait until the empty database appears.

## D. Enable Email/Password sign-in

1. In the left menu, open **Build → Authentication** → **Get started**.
2. Open the **Sign-in method** tab → click **Email/Password**.
3. Turn on the **first** switch, **Email/Password**. Leave **Email link (passwordless sign-in)** **off**. Click **Save**.
4. **Turn off public sign-ups:**
   1. Open the **Settings** tab → **User actions**.
   2. **Untick "Enable create (sign-up)"** → **Save**.

   **Why:** the Firebase config is public, so anyone could call Firebase's sign-up service directly and create an account in your project, even though the menu has no sign-up page. With this unticked, only accounts **you** add in the console (step E) can exist; the console still works normally.

   **If you don't see this setting** (Firebase sometimes moves or renames it), you're still safe. A stranger's account can't do anything:
   - Only UIDs in `admins` can change the menu.
   - **No app can add itself to `admins`**: the rules deny every write to it, including from signed-in strangers and from the owner's own account (tested).
5. On the same **Settings** tab, leave **Email enumeration protection** **on** (the default). It hides whether an email address has an account.

## E. Create the owner's account and find its UID

1. **Authentication → Users** tab → **Add user**.
2. **Email:** the owner's real email address (so a password reset is possible later). **Password:** a strong one, at least 12 characters.
   - Write the password down safely and give it to the owner **in person**.
   - Never put it in the repo, a commit message, or a chat.
3. Click **Add user**. A row appears in the list.
4. Find the **User UID** column, a long code like `Xy7Pq…`. Hover over it and click the **copy** icon. Paste it into a note for the next step.
5. **Add the UID to the allow-list:**
   1. Open **Firestore Database** → **Data** tab → **+ Start collection**.
   2. **Collection ID:** `admins` → **Next**.
   3. **Document ID:** delete the auto-ID and **paste the UID**. It must match exactly.
   4. Add one field: **Field** `name`, **Type** `string`, **Value** `Owner`.
   5. Click **Save**. You should now see `admins` → `<the UID>`.

> A typo in the UID is the most common reason the owner later "can't save". If the owner ever gets a new account, add its UID here in the same way, and delete the old document.

## F. Publish the security rules

1. **Firestore Database → Rules** tab.
2. Select everything in the editor and delete it.
3. In VS Code, open **`firebase/firestore.rules`**, select all (Ctrl+A), copy, and paste into the Firebase editor.
4. Click **Publish**. If the editor shows a red error marker instead, don't publish; re-copy the whole file.
5. Wait about **1 minute** before testing. New rules take a moment to apply everywhere.

**What the rules do**, in plain words:
- **Anyone** can read the menu document `menu/published`. The only other thing that can be read: a logged-in account can check whether *its own* UID is in `admins`. Nothing else can be read.
- **Only** signed-in accounts listed in `admins` can save it, and only if the data is valid:
  - Dish names 1–60 characters, descriptions up to 150.
  - Prices are positive whole rupees.
  - A dish's category must be one of the 8 known ones.
  - Photo names must be simple file names.
  - The map link must start with `https://`.
  - No unknown fields.
- The rules have no loops, so each save checks the dishes that are **new or changed**. Settings and categories are checked whenever they change.
- Firestore also stops a rule after 1,000 steps, so two limits apply:
  - **A save may add or change at most 3 dishes.**
  - **A save that changes the categories can't also change dishes.**

  The admin page saves one change at a time, and the setup page adds dishes 3 at a time, so the owner never hits either limit.
- The menu document can't be deleted. Everything not mentioned is denied.

**Adding a new category later:** add the name to `categoryNamePattern()` in `firebase/firestore.rules` (names are separated by `|`), publish the rules again (this step), and then add the category to the menu data.

## G. Load the starting menu

The starting menu is in **`firebase/menu-seed.json`**. It has placeholder prices. A small setup page loads it for you. **The setup page only works from your own computer, through a local web server**, because browsers block ES modules from pages opened as plain files (`file://`).

1. Make sure `js/config.js` has your real config (step B) and is saved.
2. In VS Code, open a terminal (**Terminal → New Terminal**) in the project folder and run:
   ```
   python -m http.server 8000
   ```
   Leave it running. If Python isn't available, `npx http-server -p 8000` works too.
3. In Chrome, open **http://localhost:8000/firebase/setup.html**. Type `localhost` exactly; `127.0.0.1` won't work for sign-in.
4. **Step 1:**
   - Click **Test: read the menu**. You should see "PASS — reading is allowed, but the menu is empty".
   - Click **Test: write while signed out**. You should see "PASS — signed-out write was blocked".
5. **Step 2:** enter the owner's email and password → **Sign in**. You'll see "Signed in as …" with the UID.
6. **Step 3:** click **Load starting menu**. The log counts up ("Saved 3 of 18 dishes…") and ends with "**PASS — starting menu loaded: 18 dishes, 8 categories**".
   - It refuses to overwrite an existing menu unless you tick the **Replace** box. That protects the owner's changes later.
7. **Check in the console:** **Firestore Database → Data → `menu` → `published`**. You should see `settings`, `categories`, `items` (18 entries) and `updatedAt`.
8. **Step 4:** run both owner tests (see [How to test](#how-to-test)).
9. Click **Sign out**. Stop the local server with **Ctrl+C** in the terminal.

**Is the setup page on the public website?** No. The repo's **`_config.yml`** tells GitHub Pages not to publish these folders and files:
- the whole `firebase/` folder
- `docs/` and `tools/`
- `CLAUDE.md` and `README.md`

So the setup page stays in the repo, where you can reuse it in later phases and to restore a backup, but it's never served on `hotwokrestaurant.github.io`. It only ever runs from your own computer at `localhost`.

It would be harmless even if it were published, because it can't do anything without the owner's password and the rules check every save. Keeping developer tools off the live site is simply cleaner. **After every deploy, check it** (see the [checklist](#before-going-live-checklist)).

## H. Authorized domains (where sign-in is allowed)

1. **Authentication → Settings** tab → **Authorized domains**.
2. `localhost` should already be in the list. If not, click **Add domain**, enter `localhost`, then **Add**.
3. Click **Add domain**, enter **`hotwokrestaurant.github.io`**, then **Add**.
   - Type just the domain: no `https://` and no `/` at the end.
4. Leave the default `…firebaseapp.com` and `…web.app` entries as they are.

Customers never sign in, so this only matters for the admin page (Phase 4) and the setup page.

---

## How to test

Run these on the setup page (step G). Each one should say **PASS**:

| Test | How | Expected |
|---|---|---|
| Reading works signed out | Signed out → **Test: read the menu** | `PASS — read the menu: 18 dishes.` |
| Signed-out write is rejected | Signed out → **Test: write while signed out** | `PASS — signed-out write was blocked.` |
| The owner can write | Sign in as owner → **Test: owner can save** | `PASS — the owner can save the menu.` (re-saves the same menu, so nothing changes except `updatedAt`) |
| Bad data is rejected | Signed in → **Test: a 61-character dish name is rejected** | `PASS — the invalid dish was rejected` |

**Optional second check in the console (Rules Playground):**
1. **Firestore Database → Rules** tab → click **Rules Playground** (or **Develop & Test**).
2. **Signed-out read:**
   - Simulation type: **get**. Location: `menu/published`. Authenticated: **off**.
   - Click **Run**. Expected: green, **allowed**.
3. **Signed-out write:**
   - Change the simulation type to **create** and add any document data.
   - Click **Run**. Expected: red, **denied**.

**Already tested before you got this file:** the rules passed **64 checks** in the official Firestore emulator. Each rejection was confirmed to come from a real rule, not from Firestore's 1,000-step limit. The checks covered:
- **Reads:** signed-out reads (allowed); listing the collection and reading other documents (denied).
- **Who can write:** signed-out visitors and signed-in non-owners (denied); creating the menu with dishes in the same save (denied).
- **Loading the menu:** creating it without dishes, then loading the 18 dishes 3 at a time (allowed); a 4-dish save (denied).
- **Allowed owner edits:**
  - Price changes, swapping dish order, adding a dish.
  - Deleting 1 or 10 dishes.
  - 60-character names and 150-character descriptions.
  - Dishes without optional fields.
  - Changing settings + 3 dishes; hiding a category on its own.
- **Every validation limit:**
  - 61-character or empty names, 151-character descriptions.
  - Text, zero, decimal and negative prices.
  - Unknown or partly-matching categories.
  - Extra or missing fields, and photo names with folders or web addresses.
  - Bad dish ids, 4 changed dishes, 201 dishes, 9 categories.
  - A category change together with a dish change.
  - A non-server `updatedAt`, a `javascript:` map link, and deleting the menu.
- **Allowed saves stay under the 1,000-step limit** with both 18 and 150 dishes.
- **The `admins` allow-list can't be changed from any app.** A stranger can't add, change or delete an `admins` document (not even one for themselves), and neither can a signed-out visitor or the owner's own account. A signed-in account can only *check its own* entry (the admin page uses this to show "This account can't edit the menu"); it can't read anyone else's or list them.
- **Two phones editing at the same time:** two transactions that each change a different dish at the same moment both keep their change. A transaction that changes only `settings` leaves dishes and categories untouched. (This is the pattern the admin page will use; see the spec, section 4.3.)

---

## Before going live (checklist)

Tick each one before printing the QR codes:

- [ ] Plan shows **Spark**, and no billing account is attached (step A).
- [ ] Firestore is in **asia-south1**, database **`(default)`**, production mode (step C).
- [ ] Email/Password is on, and **"Enable create (sign-up)" is unticked** if your console shows it (step D).
- [ ] The owner's UID is in **`admins`**, and it's the only document there (step E).
- [ ] The rules from `firebase/firestore.rules` are **published** (step F).
- [ ] All tests on the setup page say **PASS** (step G and [How to test](#how-to-test)).
- [ ] **Authorized domains** include `hotwokrestaurant.github.io` (step H).
- [ ] After deploying, **https://hotwokrestaurant.github.io/firebase/setup.html shows "404"** (developer files aren't published; see `_config.yml`). The same goes for `/docs/PROJECT_SPEC.md` and `/CLAUDE.md`.
- [ ] A **backup** of the menu is saved somewhere safe (see [Backups](#backups)).
- [ ] The owner's password was handed over in person and isn't written in the repo or any chat.

---

## Backups

The free Spark plan has **no automatic Firestore backups**; Firebase's managed exports need the paid plan. Because the whole menu is a single small document, backing it up is easy:

| When | How | Restore |
|---|---|---|
| **Now (Phases 2–3)** | Keep `firebase/menu-seed.json` as the starting point. After the owner enters the real menu, copy the document from the console: **Firestore → Data → `menu/published`**. Or ask the developer to export it (below). | Load it with the setup page (step G, tick **Replace…**). |
| **Admin page (Phase 4)** | **Download backup** (admin page → More). It saves the menu as `hot-wok-menu-backup-YYYY-MM-DD.json`, in the same shape as `menu-seed.json`. Suggest the owner taps it after big changes and once a month, and keeps the file in Google Drive or email. | Setup page **step 5, "Restore from a backup file"**: sign in, tick **Replace…**, choose the file. It loads 3 dishes per save, so the rules still check everything. |
| **Optional later** | A free scheduled **GitHub Action** that reads the public menu once a day (1 read) and saves it to a separate `backups` branch of the repo. It needs no password, because the menu is publicly readable. | Same restore as above. |

> The customer page also keeps the last menu it saw in each phone's storage, but that isn't a backup. It can't be restored into Firestore, and it disappears when the browser clears data.

---

## Should we turn on App Check?

**App Check** makes Firebase accept requests only from *your* website, not from other people's scripts. On the web it uses Google's **reCAPTCHA**, which quietly scores each visitor.

**Recommendation: not now.** Revisit only if you ever see abuse.

| | |
|---|---|
| **What it would protect against** | Someone copying the public config and hammering the database with reads. On Spark that can't cost money, but it could use up the day's free reads and pause the menu until the next day. |
| **Why not yet** | <ul><li>**Speed:** every customer's phone would have to download and run reCAPTCHA (a sizeable script) before the menu loads, which hurts the "fast on 3G" goal.</li><li>**Real customers blocked:** reCAPTCHA sometimes scores real people as bots, especially on old phones, slow networks or privacy browsers, and they'd see no menu.</li><li>**All or nothing:** App Check is switched on for the whole database, so it can't protect just the admin page.</li><li>**Cache already helps:** each phone reads the menu once per visit and keeps a saved copy, so normal use is far below the limits.</li></ul> |
| **What already protects the menu** | The security rules: nobody but the owner can change anything. App Check wouldn't change that. |

If the **Usage** tab ever shows strange spikes in reads, App Check can be added later without changing the data.

---

## Free limits

Spark plan, Cloud Firestore, per day:

| | Free each day | This project uses |
|---|---|---|
| Document reads | 50,000 | 1 per customer visit, so roughly 50,000 visits a day |
| Document writes | 20,000 | 1 per owner change (the setup page uses 5) |
| Stored data | 1 GiB total | About 10 KB |

The daily counters reset at midnight US Pacific time, around **12:30–1:30 pm Sri Lanka time**. If a limit is reached, Firestore stops answering until the reset: no bill, and customers see the saved copy of the menu. Check usage at **Firestore Database → Usage**.

**To stay on Spark forever:**
- Never click **Upgrade**.
- Don't open **Storage** (new Cloud Storage buckets need the paid plan).
- Don't use **Functions** or **Extensions**.
- Dish photos go in the repo's `images/` folder instead.

---

## Common errors and fixes

| Error (in the setup page log or browser console) | What it means | Fix |
|---|---|---|
| `js/config.js still has the PASTE_… placeholders` | Config not filled in | Step B: paste the config and save the file. |
| Blank page; console says *"Failed to load module script"* or mentions CORS / `file://` | Page opened as a file | Use the local server: `python -m http.server 8000`, then `http://localhost:8000/firebase/setup.html`. |
| `auth/invalid-api-key` or `auth/api-key-not-valid` | Typo in `apiKey` | Re-copy the config (step B). |
| `auth/unauthorized-domain` | The site's domain isn't allowed to sign in | Step H. Use `localhost`, not `127.0.0.1`. On the live site, check `hotwokrestaurant.github.io` is listed. |
| `auth/operation-not-allowed` | Email/Password sign-in is switched off | Step D. |
| `auth/invalid-credential` | Wrong email or password (Firebase doesn't say which, on purpose) | Check both. Reset the password in **Authentication → Users → ⋮ → Reset password**. |
| `auth/too-many-requests` | Too many wrong passwords; Firebase paused sign-in | Wait 15–30 minutes, or reset the password. |
| `permission-denied` / *"Missing or insufficient permissions"* when the **owner** saves | The rules said no | Check four things:<ol><li>The rules are published (step F) and a minute has passed.</li><li>The owner's UID is in `admins` with no typo (step E).</li><li>You're signed in.</li><li>The data is valid: name ≤ 60 characters, whole-number price, known category, at most 3 dishes changed in one save, and no dish changes in the same save as a category change.</li></ol> |
| `permission-denied` when **reading** the menu | Rules not published, or wrong document | Publish the rules (step F). The menu must be at `menu/published` exactly. |
| *"Failed to get document because the client is offline"* or `unavailable` | No internet, wrong `projectId`, or the database wasn't created | Check the connection and `projectId` in `js/config.js`. Make sure step C was completed. |
| `not-found` mentioning `database (default)` | Firestore was never created, or was given a different ID | Step C, with database ID `(default)`. |
| `resource-exhausted` / quota exceeded | A free daily limit was reached | Wait for the daily reset (see [Free limits](#free-limits)). Check **Usage** for anything strange. |
| Setup page: *"A menu already exists. Nothing was changed."* | Safety check | Tick **Replace the menu…** only if you really want to overwrite the menu. |
