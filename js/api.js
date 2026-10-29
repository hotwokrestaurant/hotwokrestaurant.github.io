// Loading the menu: a saved copy from this phone (localStorage) and the latest
// version from Firestore (the single document menu/published = one read).
//
// The Firebase SDK is loaded with import() ONLY when we fetch. That way the
// page can show the saved menu (or the skeleton) straight away, without first
// waiting for ~60 KB of Firebase code on a slow connection.

import { FIREBASE_CONFIG, MENU_COLLECTION, MENU_DOC_ID } from './config.js';
import { storageGet, storageSet } from './utils.js';

// Pinned Firebase version (must match every other Firebase URL in the project).
const SDK_URL = 'https://www.gstatic.com/firebasejs/12.19.0';

// localStorage key. Change the "v1" if the saved format ever changes,
// so old saved copies are simply ignored.
const CACHE_KEY = 'hotwok.menu.v1';

// A menu has settings (object), categories (list) and items (list).
// Anything else (old, damaged or edited data) is treated as "no menu".
export function isValidMenu(data) {
  return Boolean(data)
    && typeof data.settings === 'object' && data.settings !== null
    && Array.isArray(data.categories)
    && Array.isArray(data.items);
}

// ---------- Saved copy (this phone only) ----------

// Returns { menu, updatedAt } or null. storageGet already uses try/catch.
export function getSavedMenu() {
  const saved = storageGet(CACHE_KEY);
  if (!saved || !isValidMenu(saved.menu) || typeof saved.updatedAt !== 'number') return null;
  return saved;
}

export function saveMenu(result) {
  storageSet(CACHE_KEY, result); // fails quietly if storage is full or blocked
}

// ---------- Latest copy (Firestore) ----------

let firestorePromise = null;

// Loads the Firebase code once and connects to the project.
function getFirestoreLite() {
  if (!firestorePromise) {
    firestorePromise = Promise.all([
      import(`${SDK_URL}/firebase-app.js`),
      import(`${SDK_URL}/firebase-firestore-lite.js`)
    ]).then(([appModule, firestoreModule]) => {
      const app = appModule.initializeApp(FIREBASE_CONFIG);
      return { db: firestoreModule.getFirestore(app), firestoreModule };
    });
    // If loading failed (e.g. offline), allow a fresh try next time.
    firestorePromise.catch(() => { firestorePromise = null; });
  }
  return firestorePromise;
}

// Rejects if the promise takes longer than `ms` milliseconds.
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Fetches menu/published. Resolves to { menu, updatedAt } where updatedAt is
// a number (milliseconds), so it can be saved and compared easily.
// Rejects on: offline, slow connection (timeout), missing or invalid menu.
export function fetchLatestMenu(timeoutMs) {
  const request = getFirestoreLite().then(async ({ db, firestoreModule }) => {
    const { doc, getDoc } = firestoreModule;
    const snapshot = await getDoc(doc(db, MENU_COLLECTION, MENU_DOC_ID));
    if (!snapshot.exists()) throw new Error('menu-missing');

    const { settings, categories, items, updatedAt } = snapshot.data();
    const menu = { settings, categories, items };
    if (!isValidMenu(menu)) throw new Error('menu-invalid');

    // updatedAt is a Firestore Timestamp; keep it as plain milliseconds.
    const millis = updatedAt && typeof updatedAt.toMillis === 'function' ? updatedAt.toMillis() : 0;
    return { menu, updatedAt: millis };
  });
  return withTimeout(request, timeoutMs);
}
