// Admin page: lets the owner change the menu from their phone.
// Screens: loading → log in → (not allowed | menu manager) + two full-screen
// forms (dish, restaurant details). All text comes from js/admin-strings.js.
//
// Every change is saved with a transaction (js/admin-firebase.js), and the
// security rules check every save, so hiding a button is never the only
// protection.

import { t, LANGUAGE_CODE } from './admin-strings.js';
import {
  watchLogin, logIn, logOut, sendResetEmail, isAdmin, watchMenu, saveItems, saveSettings, GoneError
} from './admin-firebase.js';
import { formatPrice, toBool, normalizeText, createElement, clearElement } from './utils.js';

// Same limits as firebase/firestore.rules (the rules are the real check).
const LIMITS = {
  name: 60,
  description: 150,
  notice: 120,
  hours: 150,
  phone: 30,
  address: 150,
  mapUrl: 300,
  maxPrice: 100000
};
const TOAST_MS = 4000;

const state = {
  menu: null,          // { settings, categories, items } — always the latest
  user: null,
  stopWatchingMenu: null,
  query: '',
  orderMode: false,
  busyDishes: new Set(), // dish ids being saved (their buttons are disabled)
  editingId: null,     // dish being edited, or null when adding
  returnFocusTo: null  // button to focus again when a form closes
};

const $ = (id) => document.getElementById(id);

// ---------- Text, screens, toasts, offline ----------

function applyStrings() {
  document.documentElement.lang = LANGUAGE_CODE;
  document.title = t('pageTitle');
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
}

const SCREENS = ['screen-loading', 'screen-login', 'screen-problem', 'screen-manager'];

function showScreen(id) {
  SCREENS.forEach((screenId) => { $(screenId).hidden = screenId !== id; });
}

function showProblem(title, text, { retry = false } = {}) {
  $('problem-title').textContent = title;
  $('problem-text').textContent = text;
  $('problem-retry').hidden = !retry;
  showScreen('screen-problem');
}

const MAX_TOASTS = 2;

function showToast(message, kind = 'ok') {
  const region = $('toasts');
  // Keep at most 2 messages on screen, so they never cover the page.
  while (region.children.length >= MAX_TOASTS) region.firstElementChild.remove();
  const toast = createElement('p', `toast toast--${kind}`, message);
  region.append(toast);
  setTimeout(() => toast.remove(), TOAST_MS);
}

function updateOfflineBanner() {
  $('offline-banner').hidden = navigator.onLine;
}

// Turns a button into a disabled "Saving…" button with a spinner, and back.
function setBusy(button, busy, busyText) {
  if (busy) {
    button.dataset.label = button.textContent;
    button.disabled = true;
    button.classList.add('is-busy');
    clearElement(button);
    const spinner = createElement('span', 'spinner');
    spinner.setAttribute('aria-hidden', 'true');
    button.append(spinner, busyText || t('saving'));
  } else {
    button.disabled = false;
    button.classList.remove('is-busy');
    if (button.dataset.label) button.textContent = button.dataset.label;
  }
}

// Plain-English message for a failed save.
function saveErrorMessage(error) {
  if (error instanceof GoneError) return t('dishGone');
  if (!navigator.onLine) return t('saveOffline');
  if (error && error.code === 'permission-denied') return t('saveRejected');
  return t('saveFailed');
}

// ---------- Log in ----------

function loginErrorMessage(error) {
  switch (error && error.code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/missing-password':
      return t('errorWrongLogin');
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return t('errorEmailFormat');
    case 'auth/too-many-requests':
      return t('errorTooMany');
    case 'auth/network-request-failed':
      return t('errorNoInternet');
    case 'auth/user-disabled':
      return t('errorAccountOff');
    default:
      return t('errorLoginOther');
  }
}

function showLoginError(message) {
  $('login-error').textContent = message;
  $('login-error').hidden = !message;
}

function setupLogin() {
  $('show-password').addEventListener('change', (event) => {
    $('login-password').type = event.target.checked ? 'text' : 'password';
  });

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    showLoginError('');
    $('login-message').hidden = true;
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    if (!email || !password) { showLoginError(t('errorWrongLogin')); return; }
    if (!navigator.onLine) { showLoginError(t('errorNoInternet')); return; }

    const button = $('login-button');
    setBusy(button, true, t('loggingIn'));
    try {
      await logIn(email, password);
      $('login-password').value = '';
      // watchLogin (below) takes over from here.
    } catch (error) {
      showLoginError(loginErrorMessage(error));
    } finally {
      setBusy(button, false);
    }
  });

  $('forgot-password').addEventListener('click', async () => {
    const email = $('login-email').value.trim();
    const message = $('login-message');
    showLoginError('');
    if (!email) {
      message.textContent = t('resetNeedsEmail');
    } else {
      try {
        await sendResetEmail(email);
        message.textContent = t('resetSent');
      } catch (error) {
        // For privacy, Firebase doesn't say whether the email exists, so only
        // connection and format problems are reported.
        message.textContent = error && error.code === 'auth/invalid-email'
          ? t('errorEmailFormat')
          : (error && error.code === 'auth/network-request-failed' ? t('errorNoInternet') : t('resetSent'));
      }
    }
    message.hidden = false;
  });

  const doLogOut = async () => { closeAnySheet(); await logOut(); };
  $('logout-button').addEventListener('click', doLogOut);
  $('problem-logout').addEventListener('click', doLogOut);
  $('problem-retry').addEventListener('click', () => { if (state.user) openManagerFor(state.user); });
}

// Runs whenever someone logs in or out (also on page load if still logged in).
function onLoginChange(user) {
  if (state.stopWatchingMenu) { state.stopWatchingMenu(); state.stopWatchingMenu = null; }
  state.user = user;
  state.menu = null;
  if (!user) {
    showScreen('screen-login');
    return;
  }
  openManagerFor(user);
}

async function openManagerFor(user) {
  showScreen('screen-loading');
  try {
    if (!(await isAdmin(user))) {
      showProblem(t('notAllowedTitle'), t('notAllowedText', { email: user.email || '' }));
      return;
    }
  } catch (error) {
    showProblem(t('checkFailedTitle'), t('checkFailedText'), { retry: true });
    return;
  }

  $('logged-in-as').textContent = t('loggedInAs', { email: user.email || '' });
  state.stopWatchingMenu = watchMenu((menu) => {
    if (!menu) {
      showProblem(t('checkFailedTitle'), t('noMenuText'));
      return;
    }
    state.menu = menu;
    renderDishList();
    showScreen('screen-manager'); // the forms are separate layers, so they stay open
  }, () => {
    showProblem(t('checkFailedTitle'), t('checkFailedText'), { retry: true });
  });
}

// ---------- The dish list ----------

const bySortOrder = (a, b) => (a.sort_order - b.sort_order) || String(a.name).localeCompare(String(b.name));

function sortedCategories() {
  return [...state.menu.categories].sort(bySortOrder);
}

function dishesIn(categoryName, items = state.menu.items) {
  return items.filter((item) => item.category === categoryName).sort(bySortOrder);
}

function describePrice(item) {
  const price = formatPrice(item.price);
  return item.price_large ? `${price} · ${t('priceLarge', { price: formatPrice(item.price_large) })}` : price;
}

function renderDishList() {
  if (!state.menu) return;
  const list = $('dish-list');
  clearElement(list);
  const query = state.orderMode ? '' : normalizeText(state.query);
  let shown = 0;

  sortedCategories().forEach((category) => {
    const dishes = dishesIn(category.name)
      .filter((item) => !query || normalizeText(`${item.name} ${item.description || ''}`).includes(query));
    if (query && dishes.length === 0) return;

    const group = createElement('section', 'dish-group');
    const heading = createElement('h2', 'dish-group__title', category.name);
    if (!toBool(category.visible)) heading.append(createElement('span', 'dish-group__note', ` ${t('hiddenCategory')}`));
    group.append(heading);

    if (dishes.length === 0) group.append(createElement('p', 'dish-group__empty', t('emptyCategory')));
    const rows = createElement('ul', 'dish-rows');
    dishes.forEach((item, index) => {
      rows.append(createDishRow(item, index === 0, index === dishes.length - 1));
      shown += 1;
    });
    group.append(rows);
    list.append(group);
  });

  $('no-matches').hidden = !(query && shown === 0);
}

function createDishRow(item, isFirst, isLast) {
  const available = toBool(item.available);
  const busy = state.busyDishes.has(item.id);
  const row = createElement('li', `dish-row${available ? '' : ' dish-row--off'}${busy ? ' is-busy' : ''}`);

  const info = createElement('div', 'dish-row__info');
  info.append(createElement('p', 'dish-row__name', item.name), createElement('p', 'dish-row__price', describePrice(item)));
  row.append(info);

  const controls = createElement('div', `dish-row__controls${state.orderMode ? ' dish-row__controls--order' : ''}`);
  if (state.orderMode) {
    controls.append(
      createActionButton('↑', 'up', item, t('moveUp', { name: item.name }), isFirst || busy),
      createActionButton('↓', 'down', item, t('moveDown', { name: item.name }), isLast || busy)
    );
  } else {
    // Big ON/OFF switch with a visible label.
    const switchLabel = createElement('span', 'switch-label', t('availableToday'));
    const toggle = createElement('button', `switch${available ? ' is-on' : ''}`);
    toggle.type = 'button';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(available));
    toggle.setAttribute('aria-label', t('switchLabel', { name: item.name }));
    toggle.dataset.action = 'toggle';
    toggle.dataset.id = item.id;
    toggle.disabled = busy;
    const knob = createElement('span', 'switch__knob');
    knob.setAttribute('aria-hidden', 'true');
    toggle.append(createElement('span', 'switch__text', available ? t('on') : t('off')), knob);

    const switchWrap = createElement('div', 'switch-wrap');
    switchWrap.append(switchLabel, toggle);
    controls.append(switchWrap, createActionButton(t('edit'), 'edit', item, t('editDishLabel', { name: item.name }), busy));
  }
  row.append(controls);
  return row;
}

function createActionButton(text, action, item, label, disabled) {
  const button = createElement('button', `btn btn--small btn--${action}`, text);
  button.type = 'button';
  button.dataset.action = action;
  button.dataset.id = item.id;
  button.setAttribute('aria-label', label);
  button.disabled = disabled;
  return button;
}

function findDish(items, id) {
  const item = items.find((dish) => dish.id === id);
  if (!item) throw new GoneError();
  return item;
}

// ---------- Quick actions (switch, reorder) ----------

async function runDishSave(id, change, successMessage) {
  if (!navigator.onLine) { showToast(t('saveOffline'), 'error'); return; }
  state.busyDishes.add(id);
  renderDishList();
  try {
    await saveItems(change);
    showToast(successMessage);
  } catch (error) {
    showToast(saveErrorMessage(error), 'error');
  } finally {
    state.busyDishes.delete(id);
    renderDishList();
  }
}

function toggleAvailable(id) {
  const item = findDish(state.menu.items, id);
  const makeAvailable = !toBool(item.available);
  runDishSave(id, (items) => {
    findDish(items, id).available = makeAvailable;
    return items;
  }, t(makeAvailable ? 'nowAvailable' : 'nowHidden', { name: item.name }));
}

// Swaps a dish with its neighbour in the same category (2 dishes change).
function moveDish(id, direction) {
  runDishSave(id, (items) => {
    const item = findDish(items, id);
    const siblings = dishesIn(item.category, items);
    const neighbour = siblings[siblings.indexOf(item) + direction];
    if (!neighbour) return items;
    const mine = item.sort_order;
    const theirs = neighbour.sort_order;
    if (mine === theirs) {
      // Same number: push the one that should end up lower down by 1.
      if (direction < 0) neighbour.sort_order = mine + 1; else item.sort_order = mine + 1;
    } else {
      item.sort_order = theirs;
      neighbour.sort_order = mine;
    }
    return items;
  }, t('orderSaved'));
}

function setupDishList() {
  $('dish-list').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const { action, id } = button.dataset;
    try {
      if (action === 'toggle') toggleAvailable(id);
      if (action === 'edit') openDishForm(id, button);
      if (action === 'up') moveDish(id, -1);
      if (action === 'down') moveDish(id, 1);
    } catch (error) {
      showToast(saveErrorMessage(error), 'error');
    }
  });

  $('dish-search').addEventListener('input', (event) => {
    state.query = event.target.value;
    renderDishList();
  });

  $('order-mode').addEventListener('click', () => {
    state.orderMode = !state.orderMode;
    const button = $('order-mode');
    button.setAttribute('aria-pressed', String(state.orderMode));
    button.textContent = state.orderMode ? t('doneOrdering') : t('changeOrder');
    $('order-hint').hidden = !state.orderMode;
    $('dish-search').disabled = state.orderMode;
    $('add-dish').disabled = state.orderMode;
    renderDishList();
  });

  $('add-dish').addEventListener('click', (event) => openDishForm(null, event.currentTarget));
}

// ---------- Full-screen forms ----------

function openSheet(id, focusTarget, returnFocusTo) {
  state.returnFocusTo = returnFocusTo || null;
  $(id).hidden = false;
  document.body.classList.add('has-sheet');
  // So the phone's Back button closes the form instead of leaving the page.
  history.pushState({ sheet: id }, '');
  $(id).scrollTop = 0;
  focusTarget.focus();
}

function hideSheets() {
  ['screen-dish', 'screen-details'].forEach((id) => { $(id).hidden = true; });
  document.body.classList.remove('has-sheet');
  if (state.returnFocusTo && document.body.contains(state.returnFocusTo)) state.returnFocusTo.focus();
  state.returnFocusTo = null;
}

// Closes the open form (going "back" in history if we added an entry).
function closeAnySheet() {
  if (history.state && history.state.sheet) history.back();
  else hideSheets();
}

function showFormError(id, message) {
  $(id).textContent = message || '';
  $(id).hidden = !message;
  if (message) $(id).scrollIntoView({ block: 'center' });
}

// "1,250" or " 1250 " → 1250. Returns null if it isn't a whole number in range.
function parsePrice(text) {
  const cleaned = String(text).replace(/[\s,]/g, '').replace(/^rs\.?/i, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 && value <= LIMITS.maxPrice ? value : null;
}

function updateDescriptionCount() {
  const left = LIMITS.description - $('dish-description').value.length;
  $('dish-description-count').textContent = t('charactersLeft', { count: left });
}

function openDishForm(id, returnFocusTo) {
  state.editingId = id;
  const item = id ? findDish(state.menu.items, id) : null;
  const select = $('dish-category');
  clearElement(select);
  sortedCategories().forEach((category) => {
    const option = createElement('option', '', category.name);
    option.value = category.name;
    select.append(option);
  });

  $('dish-form-title').textContent = item ? t('editDishTitle') : t('addDishTitle');
  $('dish-name').value = item ? item.name : '';
  select.value = item ? item.category : (sortedCategories()[0] || {}).name;
  $('dish-price').value = item ? String(item.price) : '';
  $('dish-price-large').value = item && item.price_large ? String(item.price_large) : '';
  $('dish-description').value = item ? item.description || '' : '';
  $('dish-spicy').checked = item ? toBool(item.spicy) : false;
  $('dish-veg').checked = item ? toBool(item.veg) : false;
  $('dish-featured').checked = item ? toBool(item.featured) : false;
  $('dish-delete').hidden = !item;
  updateDescriptionCount();
  showFormError('dish-error', '');
  openSheet('screen-dish', $('dish-name'), returnFocusTo);
}

// Reads and checks the form. Returns the values, or null (and shows a message).
function readDishForm() {
  const name = $('dish-name').value.trim();
  const description = $('dish-description').value.trim();
  const price = parsePrice($('dish-price').value);
  const largeText = $('dish-price-large').value.trim();
  const priceLarge = largeText ? parsePrice(largeText) : null;

  let error = '';
  if (!name) error = t('errorNameEmpty');
  else if (name.length > LIMITS.name) error = t('errorNameLong', { max: LIMITS.name });
  else if (price === null) error = t('errorPrice');
  else if (largeText && priceLarge === null) error = t('errorPriceLarge');
  else if (description.length > LIMITS.description) error = t('errorDescriptionLong', { max: LIMITS.description });
  showFormError('dish-error', error);
  if (error) return null;

  return {
    name,
    category: $('dish-category').value,
    price,
    price_large: priceLarge,
    description,
    spicy: $('dish-spicy').checked,
    veg: $('dish-veg').checked,
    featured: $('dish-featured').checked
  };
}

// Random id like "itm_k3x9q2mf" (lower-case letters and digits, as the rules require).
function newDishId() {
  const letters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `itm_${Array.from(bytes, (byte) => letters[byte % letters.length]).join('')}`;
}

function nextSortOrder(items, categoryName) {
  return items.filter((item) => item.category === categoryName)
    .reduce((highest, item) => Math.max(highest, Number(item.sort_order) || 0), 0) + 1;
}

async function saveDishForm(event) {
  event.preventDefault();
  const values = readDishForm();
  if (!values) return;
  if (!navigator.onLine) { showFormError('dish-error', t('saveOffline')); return; }

  const id = state.editingId;
  const button = $('dish-save');
  setBusy(button, true);
  try {
    await saveItems((items) => {
      if (id) {
        const item = findDish(items, id);
        if (item.category !== values.category) item.sort_order = nextSortOrder(items, values.category);
        Object.assign(item, values);
      } else {
        items.push({
          id: newDishId(),
          ...values,
          available: true,
          image: '',
          sort_order: nextSortOrder(items, values.category)
        });
      }
      return items;
    });
    closeAnySheet();
    showToast(t(id ? 'dishSaved' : 'dishAdded', { name: values.name }));
  } catch (error) {
    showFormError('dish-error', saveErrorMessage(error));
  } finally {
    setBusy(button, false);
  }
}

async function deleteDish() {
  const id = state.editingId;
  const item = state.menu.items.find((dish) => dish.id === id);
  if (!item) { closeAnySheet(); return; }
  if (!window.confirm(t('confirmDelete', { name: item.name }))) return;
  if (!navigator.onLine) { showFormError('dish-error', t('saveOffline')); return; }

  const button = $('dish-delete');
  setBusy(button, true);
  try {
    await saveItems((items) => items.filter((dish) => dish.id !== id));
    closeAnySheet();
    showToast(t('dishDeleted', { name: item.name }));
  } catch (error) {
    showFormError('dish-error', saveErrorMessage(error));
  } finally {
    setBusy(button, false);
  }
}

// ---------- Restaurant details ----------

function openDetailsForm(returnFocusTo) {
  const settings = state.menu.settings || {};
  $('set-notice').value = settings.notice || '';
  $('set-hours').value = settings.opening_hours || '';
  $('set-phone').value = settings.phone || '';
  $('set-address').value = settings.address || '';
  $('set-map').value = settings.map_url || '';
  showFormError('details-error', '');
  openSheet('screen-details', $('set-notice'), returnFocusTo);
}

async function saveDetailsForm(event) {
  event.preventDefault();
  const values = {
    notice: $('set-notice').value.trim(),
    opening_hours: $('set-hours').value.trim(),
    phone: $('set-phone').value.trim(),
    address: $('set-address').value.trim(),
    map_url: $('set-map').value.trim()
  };
  const limits = { notice: LIMITS.notice, opening_hours: LIMITS.hours, phone: LIMITS.phone, address: LIMITS.address, map_url: LIMITS.mapUrl };
  const tooLong = Object.keys(limits).find((key) => values[key].length > limits[key]);
  let error = '';
  if (tooLong) error = t('errorTooLong', { max: limits[tooLong] });
  else if (values.map_url && !/^https:\/\/\S+$/.test(values.map_url)) error = t('errorMap');
  showFormError('details-error', error);
  if (error) return;
  if (!navigator.onLine) { showFormError('details-error', t('saveOffline')); return; }

  const button = $('details-save');
  setBusy(button, true);
  try {
    // Only these five details change; name, tagline etc. are kept as they are.
    await saveSettings((settings) => ({ ...settings, ...values }));
    closeAnySheet();
    showToast(t('detailsSaved'));
  } catch (saveError) {
    showFormError('details-error', saveErrorMessage(saveError));
  } finally {
    setBusy(button, false);
  }
}

// ---------- Backup ----------

function downloadBackup() {
  if (!state.menu) return;
  const { settings, categories, items } = state.menu;
  const json = `${JSON.stringify({ settings, categories, items }, null, 2)}\n`;
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const fileName = `hot-wok-menu-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;

  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  showToast(t('backupSaved'));
}

// ---------- Start ----------

function setupForms() {
  $('dish-form').addEventListener('submit', saveDishForm);
  $('dish-cancel').addEventListener('click', closeAnySheet);
  $('dish-delete').addEventListener('click', deleteDish);
  $('dish-description').addEventListener('input', updateDescriptionCount);

  $('details-form').addEventListener('submit', saveDetailsForm);
  $('details-cancel').addEventListener('click', closeAnySheet);
  $('open-details').addEventListener('click', (event) => openDetailsForm(event.currentTarget));
  $('download-backup').addEventListener('click', downloadBackup);

  // Phone's Back button (or Cancel) closes an open form.
  window.addEventListener('popstate', hideSheets);
}

function init() {
  applyStrings();
  updateOfflineBanner();
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
  setupLogin();
  setupDishList();
  setupForms();
  watchLogin(onLoginChange);
}

init();
