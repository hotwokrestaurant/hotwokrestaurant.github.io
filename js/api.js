// Loading the menu: a saved copy from this phone (localStorage) and the latest
// version from Firestore (the single document menu/published = one read).
//
// The customer page reads the menu with ONE plain fetch() to Firestore's REST
// API: no Firebase SDK to download. Reading is allowed for everyone by the
// security rules, so no login is needed. (The admin page uses the full SDK.)

import { FIREBASE_CONFIG, MENU_COLLECTION, MENU_DOC_ID } from './config.js';
import { storageGet, storageSet } from './utils.js';

// localStorage key. Change the "v1" if the saved format ever changes,
// so old saved copies are simply ignored.
const CACHE_KEY = 'hotwok.menu.v1';

const MENU_URL = 'https://firestore.googleapis.com/v1/projects/'
  + `${encodeURIComponent(FIREBASE_CONFIG.projectId)}/databases/(default)/documents/`
  + `${MENU_COLLECTION}/${MENU_DOC_ID}?key=${encodeURIComponent(FIREBASE_CONFIG.apiKey)}`;

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

// ---------- Converting Firestore's REST format ----------

// The REST API wraps every value with its type, e.g. { "integerValue": "950" }
// (integers arrive as text) or { "mapValue": { "fields": { … } } }.
// This turns them back into plain JavaScript values.
function fromFirestoreValue(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return Date.parse(value.timestampValue);
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields || {});
  return null; // types the menu never uses (bytes, references, geo points)
}

// Converts a "fields" object. Keys are sorted so the result is always in the
// same order (the saved copy is compared as text to spot changes).
function fromFirestoreFields(fields) {
  const result = {};
  Object.keys(fields).sort().forEach((key) => {
    result[key] = fromFirestoreValue(fields[key]);
  });
  return result;
}

// ---------- Latest copy (Firestore) ----------

// Downloads the menu document as JSON. Rejects on network errors and on
// HTTP errors (404 = no menu yet, 403 = blocked by the security rules).
async function downloadMenuJson(signal) {
  const response = await fetch(MENU_URL, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`http-${response.status}`);
  return response.json();
}

// Fetches menu/published. Resolves to { menu, updatedAt } where updatedAt is
// a number (milliseconds), so it can be saved and compared easily.
// Rejects on: offline, slow connection (timeout), missing or invalid menu.
// The timeout covers the whole download, and cancels it when it fires.
export function fetchLatestMenu(timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      if (controller) controller.abort();
      reject(new Error('timeout'));
    }, timeoutMs);
  });

  const request = downloadMenuJson(controller ? controller.signal : undefined).then((documentJson) => {
    const data = fromFirestoreFields(documentJson.fields || {});
    const menu = { settings: data.settings, categories: data.categories, items: data.items };
    if (!isValidMenu(menu)) throw new Error('menu-invalid');
    return { menu, updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0 };
  });

  return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
}
