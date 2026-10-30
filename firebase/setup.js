// Developer-only setup page: tests the security rules and loads the starting
// menu into Firestore. See firebase/README.md (steps G and "How to test").
//
// Firebase SDK pinned to 12.19.0 from Google's official CDN (gstatic).

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, runTransaction, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  FIREBASE_CONFIG, FIREBASE_NOT_CONFIGURED, MENU_COLLECTION, MENU_DOC_ID
} from '../js/config.js';

// The security rules allow at most 3 new/changed dishes and 10 new/changed
// sections per save, and sections can't change in the same save as dishes.
const DISHES_PER_SAVE = 3;
const SECTIONS_PER_SAVE = 10;

// ---------- Menu formats ----------
// Current format: categories = { cat_kottu: { name, sort_order, visible }, … },
//                 dishes have category_id: 'cat_kottu'.
// Old format (before the sections upgrade): categories = [{ name, sort_order,
// visible }], dishes have category: 'Kottu'.

// Permanent id for a section, made from its name: "Fried Rice" → "cat_friedrice".
// (Same ids as firebase/menu-seed.json.) Falls back to random letters if the
// name gives too few letters or the id is already taken.
function sectionIdFor(name, taken) {
  let id = `cat_${String(name).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)}`;
  while (id.length < 8 || taken.has(id)) {
    id = `${id.slice(0, 20)}${Math.random().toString(36).slice(2, 4)}`.replace(/[^a-z0-9_]/g, '');
  }
  taken.add(id);
  return id;
}

function isOldFormat(menu) {
  return Array.isArray(menu.categories) || menu.items.some((item) => !item.category_id);
}

// Returns { sections, idByName } for an old-format section list.
function sectionsFromList(list) {
  const taken = new Set();
  const sections = {};
  const idByName = {};
  list.forEach((section) => {
    const id = sectionIdFor(section.name, taken);
    sections[id] = { name: section.name, sort_order: section.sort_order, visible: section.visible };
    idByName[section.name] = id;
  });
  return { sections, idByName };
}

// One old-format dish → current format (category name → category_id).
function upgradeDish(dish, idByName) {
  const { category, ...rest } = dish;
  return { ...rest, category_id: idByName[category] };
}

// Any menu (old or current format) → current format.
function toCurrentFormat(data) {
  if (!Array.isArray(data.categories)) return { settings: data.settings, categories: data.categories, items: data.items };
  const { sections, idByName } = sectionsFromList(data.categories);
  return { settings: data.settings, categories: sections, items: data.items.map((dish) => (dish.category_id ? dish : upgradeDish(dish, idByName))) };
}

// ---------- Log ----------

function log(message, result) {
  const item = document.createElement('li');
  item.textContent = message;
  if (result === 'pass') item.className = 'is-pass';
  if (result === 'fail') item.className = 'is-fail';
  document.getElementById('log').append(item);
  item.scrollIntoView({ block: 'nearest' });
}

// Firebase errors have a "code" like "permission-denied" or "auth/invalid-credential".
function describeError(error) {
  return `${error.code || 'error'}: ${error.message}`;
}

// ---------- Start ----------

if (FIREBASE_NOT_CONFIGURED) {
  document.getElementById('project').textContent =
    'js/config.js still has the PASTE_… placeholders. Paste your Firebase config first (README step B).';
  document.querySelectorAll('button').forEach((button) => { button.disabled = true; });
  throw new Error('Firebase config missing');
}

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const auth = getAuth(app);
const menuRef = doc(db, MENU_COLLECTION, MENU_DOC_ID);

document.getElementById('project').textContent = `Project: ${FIREBASE_CONFIG.projectId}`;

onAuthStateChanged(auth, (user) => {
  document.getElementById('who').textContent = user
    ? `Signed in as ${user.email} (UID ${user.uid})`
    : 'Signed out.';
});

// Runs a step, and turns its button off while it works (no double clicks).
function onClick(id, task) {
  const button = document.getElementById(id);
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await task();
    } catch (error) {
      log(`Unexpected error — ${describeError(error)}`, 'fail');
    } finally {
      button.disabled = false;
    }
  });
}

// ---------- 1. Signed-out tests ----------

onClick('test-read', async () => {
  try {
    const snapshot = await getDoc(menuRef);
    if (snapshot.exists()) {
      const count = (snapshot.data().items || []).length;
      log(`PASS — read the menu: ${count} dishes.`, 'pass');
    } else {
      log('PASS — reading is allowed, but the menu is empty (load it in step 3).', 'pass');
    }
  } catch (error) {
    log(`FAIL — could not read the menu. ${describeError(error)}`, 'fail');
  }
});

onClick('test-guest-write', async () => {
  if (auth.currentUser) {
    log('Sign out first (step 2) — this test must run while signed out.');
    return;
  }
  try {
    await setDoc(menuRef, { hacked: true });
    log('FAIL — a signed-out visitor was able to write! Check that the rules are published.', 'fail');
  } catch (error) {
    if (error.code === 'permission-denied') log('PASS — signed-out write was blocked.', 'pass');
    else log(`FAIL — unexpected error: ${describeError(error)}`, 'fail');
  }
});

// ---------- 2. Sign in / out ----------

document.getElementById('sign-in').addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    document.getElementById('password').value = '';
    log(`Signed in as ${email}.`, 'pass');
  } catch (error) {
    log(`Sign-in failed — ${describeError(error)}`, 'fail');
  }
});

onClick('sign-out', async () => {
  await signOut(auth);
  log('Signed out.');
});

// ---------- 3. Load the starting menu (or 5. a backup file) ----------

// Copies a whole menu ({ settings, categories, items }, old or current format)
// into Firestore, in steps the rules accept:
//   1. settings + up to 10 sections, NO dishes;
//   2. the remaining sections, 10 per save;
//   3. the dishes, 3 per save.
async function loadMenuData(data, label) {
  if (!auth.currentUser) {
    log('Sign in as the owner first (step 2).');
    return;
  }
  if (!data || typeof data.settings !== 'object' || typeof data.categories !== 'object' || !Array.isArray(data.items)) {
    log('FAIL — this file is not a menu (it needs settings, categories and items).', 'fail');
    return;
  }
  const menu = toCurrentFormat(data);
  const missing = menu.items.filter((dish) => !menu.categories[dish.category_id]);
  if (missing.length) {
    log(`FAIL — ${missing.length} dish(es) belong to a section that isn't in the file, e.g. "${missing[0].name}". Nothing was changed.`, 'fail');
    return;
  }

  const existing = await getDoc(menuRef);
  const replacing = existing.exists() && (existing.data().items || []).length > 0;
  if (replacing && !document.getElementById('allow-replace').checked) {
    log('A menu already exists. Nothing was changed. Tick "Replace the menu…" only if you really want to overwrite it.');
    return;
  }

  const sectionIds = Object.keys(menu.categories);
  const sectionsUpTo = (count) => Object.fromEntries(sectionIds.slice(0, count).map((id) => [id, menu.categories[id]]));
  try {
    for (let count = SECTIONS_PER_SAVE; count < sectionIds.length + SECTIONS_PER_SAVE; count += SECTIONS_PER_SAVE) {
      await setDoc(menuRef, { settings: menu.settings, categories: sectionsUpTo(count), items: [], updatedAt: serverTimestamp() });
      log(`Saved ${Math.min(count, sectionIds.length)} of ${sectionIds.length} sections…`);
    }
    for (let count = DISHES_PER_SAVE; count < menu.items.length + DISHES_PER_SAVE; count += DISHES_PER_SAVE) {
      await setDoc(menuRef, { ...menu, items: menu.items.slice(0, count), updatedAt: serverTimestamp() });
      log(`Saved ${Math.min(count, menu.items.length)} of ${menu.items.length} dishes…`);
    }
    log(`PASS — ${label} loaded: ${menu.items.length} dishes, ${sectionIds.length} sections.`, 'pass');
  } catch (error) {
    log(`FAIL — loading stopped. ${describeError(error)}`, 'fail');
  }
}

onClick('seed', async () => {
  const response = await fetch('menu-seed.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load menu-seed.json (${response.status})`);
  await loadMenuData(await response.json(), 'starting menu');
});

onClick('restore', async () => {
  const file = document.getElementById('backup-file').files[0];
  if (!file) {
    log('Choose a backup file first (hot-wok-menu-backup-….json).');
    return;
  }
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (error) {
    log('FAIL — that file could not be read as a backup.', 'fail');
    return;
  }
  await loadMenuData(data, `backup "${file.name}"`);
});

// ---------- 4. Owner tests ----------

// Reads the saved menu and returns it ready to save again (fresh updatedAt).
async function loadMenuForSaving() {
  const snapshot = await getDoc(menuRef);
  if (!snapshot.exists()) throw new Error('No menu yet — run step 3 first.');
  const { settings, categories, items } = snapshot.data();
  return { settings, categories, items, updatedAt: serverTimestamp() };
}

onClick('test-owner-write', async () => {
  if (!auth.currentUser) {
    log('Sign in as the owner first (step 2).');
    return;
  }
  try {
    await setDoc(menuRef, await loadMenuForSaving());
    log('PASS — the owner can save the menu.', 'pass');
  } catch (error) {
    log(`FAIL — owner save was rejected. ${describeError(error)} (Is this UID in the "admins" collection?)`, 'fail');
  }
});

onClick('test-invalid', async () => {
  if (!auth.currentUser) {
    log('Sign in as the owner first (step 2).');
    return;
  }
  const menu = await loadMenuForSaving();
  if (menu.items.length === 0) {
    log('No dishes yet — run step 3 first.');
    return;
  }
  menu.items[0] = { ...menu.items[0], name: 'x'.repeat(61) };
  try {
    await setDoc(menuRef, menu);
    log('FAIL — a 61-character name was accepted! Check that the rules are published.', 'fail');
  } catch (error) {
    if (error.code === 'permission-denied') log('PASS — the invalid dish was rejected (the menu is unchanged).', 'pass');
    else log(`FAIL — unexpected error: ${describeError(error)}`, 'fail');
  }
});

// ---------- 7. Real restaurant details → live menu ----------
// One transaction that changes ONLY these settings (and clears the old sample
// notice); dishes, sections and the other settings stay exactly as they are.

const CONTACT_KEYS = ['phone', 'whatsapp', 'email', 'address', 'opening_hours', 'map_url', 'facebook_url'];
const SAMPLE_NOTICE = 'Sample menu – prices are placeholders';

onClick('apply-details', async () => {
  if (!auth.currentUser) { log('Sign in as the owner first (step 2).'); return; }
  const response = await fetch('menu-seed.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load menu-seed.json (${response.status})`);
  const seedSettings = (await response.json()).settings;
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(menuRef);
      if (!snapshot.exists()) throw new Error('there is no menu yet (step 3)');
      const settings = { ...snapshot.data().settings };
      CONTACT_KEYS.forEach((key) => { settings[key] = seedSettings[key]; });
      if (settings.notice === SAMPLE_NOTICE) settings.notice = '';
      transaction.update(menuRef, { settings, updatedAt: serverTimestamp() });
    });
    log(`PASS — restaurant details updated: ${CONTACT_KEYS.map((key) => `${key}: ${JSON.stringify(seedSettings[key])}`).join(' · ')}`, 'pass');
  } catch (error) {
    log(`FAIL — details not changed. ${describeError(error)} (Are the latest rules published?)`, 'fail');
  }
});

// ---------- 8. Default dish tag names → live menu ----------
// Adds settings.tag_labels only if it's missing, so names the owner has
// already chosen are never overwritten. Everything else stays as it is.

onClick('add-tag-labels', async () => {
  if (!auth.currentUser) { log('Sign in as the owner first (step 2).'); return; }
  const response = await fetch('menu-seed.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load menu-seed.json (${response.status})`);
  const defaults = (await response.json()).settings.tag_labels;
  try {
    const added = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(menuRef);
      if (!snapshot.exists()) throw new Error('there is no menu yet (step 3)');
      const settings = snapshot.data().settings;
      if (settings.tag_labels) return false;
      transaction.update(menuRef, { settings: { ...settings, tag_labels: defaults }, updatedAt: serverTimestamp() });
      return true;
    });
    if (added) log(`PASS — tag names added: ${JSON.stringify(defaults)}`, 'pass');
    else log('PASS — the menu already has tag names; nothing changed.', 'pass');
  } catch (error) {
    log(`FAIL — tag names not added. ${describeError(error)} (Are the latest rules published?)`, 'fail');
  }
});

// ---------- 6. One-time upgrade: menu sections with ids ----------
// Old format → current format, in steps the new rules accept. Each step is a
// transaction on the LATEST menu, so it's safe even if the owner edits at the
// same time, and running it again simply continues where it stopped.

let backupDownloaded = false;

function saveBackupFile(data, name) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

onClick('upgrade-backup', async () => {
  const snapshot = await getDoc(menuRef);
  if (!snapshot.exists()) { log('There is no menu to back up yet.'); return; }
  const { settings, categories, items } = snapshot.data();
  const date = new Date().toISOString().slice(0, 10);
  saveBackupFile({ settings, categories, items }, `hot-wok-menu-backup-before-sections-upgrade-${date}.json`);
  backupDownloaded = true;
  document.getElementById('upgrade').disabled = false;
  log(`Backup downloaded (${items.length} dishes). Keep this file until the upgrade is checked.`, 'pass');
});

onClick('upgrade', async () => {
  if (!auth.currentUser) { log('Sign in as the owner first (step 2).'); return; }
  if (!backupDownloaded) { log('Download the backup first (button above).'); return; }

  const first = await getDoc(menuRef);
  if (!first.exists()) { log('There is no menu to upgrade.'); return; }
  if (!isOldFormat(first.data())) { log('PASS — the menu is already up to date. Nothing to do.', 'pass'); return; }

  try {
    // Step A: sections list → sections map with permanent ids (dishes unchanged).
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(menuRef);
      const { categories } = snapshot.data();
      if (!Array.isArray(categories)) return; // already done earlier
      if (categories.length > SECTIONS_PER_SAVE) throw new Error(`more than ${SECTIONS_PER_SAVE} sections — upgrade needs a developer`);
      transaction.update(menuRef, { categories: sectionsFromList(categories).sections, updatedAt: serverTimestamp() });
    });
    log('Sections now have permanent ids.');

    // Step B: dishes, 3 per save: category name → category_id.
    for (;;) {
      const result = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(menuRef);
        const { categories, items } = snapshot.data();
        const idByName = {};
        Object.keys(categories).forEach((id) => { idByName[categories[id].name] = id; });
        const todo = items.filter((dish) => !dish.category_id).slice(0, DISHES_PER_SAVE);
        if (todo.length === 0) return { left: 0 };
        const unknown = todo.find((dish) => !idByName[dish.category]);
        if (unknown) throw new Error(`dish "${unknown.name}" is in section "${unknown.category}", which doesn't exist`);
        const upgraded = items.map((dish) => (todo.includes(dish) ? upgradeDish(dish, idByName) : dish));
        transaction.update(menuRef, { items: upgraded, updatedAt: serverTimestamp() });
        return { left: items.filter((dish) => !dish.category_id).length - todo.length, total: items.length };
      });
      if (result.left === 0) break;
      log(`Dishes upgraded: ${result.total - result.left} of ${result.total}…`);
    }

    const done = (await getDoc(menuRef)).data();
    log(`PASS — upgrade finished: ${Object.keys(done.categories).length} sections, ${done.items.length} dishes, all linked by id.`, 'pass');
  } catch (error) {
    log(`FAIL — upgrade stopped (${describeError(error)}). The menu still works; run the upgrade again, or restore the backup in step 5.`, 'fail');
  }
});
