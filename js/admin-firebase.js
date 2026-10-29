// All Firebase calls for the admin page (login + reading/saving the menu).
// Uses the full Firebase SDK, pinned to the same version everywhere.
//
// Saving rule (see docs/PROJECT_SPEC.md 4.3): we NEVER overwrite the menu.
// Every change runs inside a transaction: read the latest menu, change one
// thing in it, and update only that part (items or settings) + updatedAt.
// If another phone saved in the meantime, Firestore re-runs our change on the
// newer menu, so two phones can't wipe each other's changes.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, onSnapshot, runTransaction, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { FIREBASE_CONFIG, MENU_COLLECTION, MENU_DOC_ID } from './config.js';

const SAVE_TIMEOUT_MS = 15000;

const app = initializeApp(FIREBASE_CONFIG);
// getAuth keeps the owner signed in on this phone (saved in the browser)
// until they press "Log out".
const auth = getAuth(app);
const db = getFirestore(app);
const menuRef = doc(db, MENU_COLLECTION, MENU_DOC_ID);

// ---------- Login ----------

export function watchLogin(callback) {
  return onAuthStateChanged(auth, callback);
}

export function logIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function logOut() {
  return signOut(auth);
}

export function sendResetEmail(email) {
  return sendPasswordResetEmail(auth, email);
}

// True if this account is on the owner allow-list (admins/{uid}).
// The rules let an account check only its own entry.
export async function isAdmin(user) {
  const snapshot = await getDoc(doc(db, 'admins', user.uid));
  return snapshot.exists();
}

// ---------- Reading the menu ----------

// Calls onMenu(menu) now and whenever the menu changes (also when another
// phone saves). menu is { settings, categories, items } or null if missing.
export function watchMenu(onMenu, onError) {
  return onSnapshot(menuRef, (snapshot) => {
    if (!snapshot.exists()) { onMenu(null); return; }
    const { settings, categories, items } = snapshot.data();
    onMenu({ settings, categories, items });
  }, onError);
}

// ---------- Saving ----------

// Thrown by change functions when what they need is no longer there
// (e.g. the dish was deleted on another phone).
export class GoneError extends Error {}

// Thrown when a change isn't allowed by the current menu (e.g. deleting a
// section that still has dishes). `messageKey` + `values` describe why.
export class BlockedError extends Error {
  constructor(messageKey, values = {}) {
    super(messageKey);
    this.messageKey = messageKey;
    this.values = values;
  }
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const copy = (value) => JSON.parse(JSON.stringify(value));

// Runs `change(items, sections)` on the LATEST menu and saves only `items`.
// `change` gets copies and returns the new dish list (or throws an error,
// e.g. GoneError). `sections` is the sections map, for checks only.
export function saveItems(change) {
  return withTimeout(runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(menuRef);
    const { items, categories } = snapshot.data();
    transaction.update(menuRef, { items: change(copy(items), copy(categories)), updatedAt: serverTimestamp() });
  }), SAVE_TIMEOUT_MS);
}

// Runs `change(sections, items)` on the LATEST menu and saves BOTH, in one
// transaction (all or nothing). Used to delete a section together with its
// dishes: the rules allow removing any number of dishes in a section save,
// because only new or changed dishes need checking.
export function saveSectionsAndItems(change) {
  return withTimeout(runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(menuRef);
    const { items, categories } = snapshot.data();
    const result = change(copy(categories), copy(items));
    transaction.update(menuRef, { categories: result.categories, items: result.items, updatedAt: serverTimestamp() });
  }), SAVE_TIMEOUT_MS);
}

// Runs `change(sections, items)` on the LATEST menu and saves only the
// sections map. `items` is passed so a change can check, at the very moment
// of saving, e.g. that a section being restored still exists.
export function saveSections(change) {
  return withTimeout(runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(menuRef);
    const { items, categories } = snapshot.data();
    transaction.update(menuRef, { categories: change(copy(categories), copy(items)), updatedAt: serverTimestamp() });
  }), SAVE_TIMEOUT_MS);
}

// Same for the restaurant details: `change(settings)` returns new settings.
export function saveSettings(change) {
  return withTimeout(runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(menuRef);
    const settings = { ...snapshot.data().settings };
    transaction.update(menuRef, { settings: change(settings), updatedAt: serverTimestamp() });
  }), SAVE_TIMEOUT_MS);
}
