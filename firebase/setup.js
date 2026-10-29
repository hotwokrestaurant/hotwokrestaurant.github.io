// Developer-only setup page: tests the security rules and loads the starting
// menu into Firestore. See firebase/README.md (steps G and "How to test").
//
// Firebase SDK pinned to 12.19.0 from Google's official CDN (gstatic).

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  FIREBASE_CONFIG, FIREBASE_NOT_CONFIGURED, MENU_COLLECTION, MENU_DOC_ID
} from '../js/config.js';

// The security rules allow at most 3 new/changed dishes per save.
const DISHES_PER_SAVE = 3;

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

// Copies a whole menu ({ settings, categories, items }) into Firestore.
// Save 1: settings + categories with NO dishes (the rules require this when
// categories change; removing dishes is always allowed).
// Then add the dishes 3 at a time, so each save passes the rules' checks.
async function loadMenuData(data, label) {
  if (!auth.currentUser) {
    log('Sign in as the owner first (step 2).');
    return;
  }
  if (!data || typeof data.settings !== 'object' || !Array.isArray(data.categories) || !Array.isArray(data.items)) {
    log('FAIL — this file is not a menu (it needs settings, categories and items).', 'fail');
    return;
  }
  const menu = { settings: data.settings, categories: data.categories, items: data.items };

  const existing = await getDoc(menuRef);
  const replacing = existing.exists() && (existing.data().items || []).length > 0;
  if (replacing && !document.getElementById('allow-replace').checked) {
    log('A menu already exists. Nothing was changed. Tick "Replace the menu…" only if you really want to overwrite it.');
    return;
  }

  try {
    for (let count = 0; count <= menu.items.length; count += DISHES_PER_SAVE) {
      await setDoc(menuRef, { ...menu, items: menu.items.slice(0, count), updatedAt: serverTimestamp() });
      log(`Saved ${Math.min(count, menu.items.length)} of ${menu.items.length} dishes…`);
    }
    // The loop stops at a multiple of 3; make sure the last few are included.
    if (menu.items.length % DISHES_PER_SAVE !== 0) {
      await setDoc(menuRef, { ...menu, updatedAt: serverTimestamp() });
    }
    log(`PASS — ${label} loaded: ${menu.items.length} dishes, ${menu.categories.length} categories.`, 'pass');
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
