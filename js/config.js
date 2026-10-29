// Project settings shared by the pages. NO SECRETS here — this file is public.
//
// The Firebase web config below is NOT a secret: every website that uses
// Firebase ships it to the browser. What protects the data is
// firebase/firestore.rules (only the owner's account may change the menu).
//
// Paste the values from: Firebase console → ⚙ Project settings → General →
// "Your apps" → Hot Wok Menu → SDK setup and configuration → Config.
// (Step-by-step: firebase/README.md, step B.)

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBC4zRs_M5BeP5fKTsVp5rpT5y8EqjRn1g',
  authDomain: 'hot-wok-menu-c0ab6.firebaseapp.com',
  projectId: 'hot-wok-menu-c0ab6',
  storageBucket: 'hot-wok-menu-c0ab6.firebasestorage.app',
  messagingSenderId: '59860581923',
  appId: '1:59860581923:web:c37a953c04fa359ca7fb96'
  // measurementId (Google Analytics) left out on purpose: the menu doesn't use Analytics.
};

// Where the published menu lives in Firestore: collection "menu", document "published".
export const MENU_COLLECTION = 'menu';
export const MENU_DOC_ID = 'published';

// True until the placeholders above are replaced with the real config.
export const FIREBASE_NOT_CONFIGURED = FIREBASE_CONFIG.apiKey.startsWith('PASTE_');

// The Firebase SDK version is pinned in the gstatic import URLs
// (https://www.gstatic.com/firebasejs/12.19.0/...). To upgrade, change the
// version in EVERY import URL at once and re-test.
