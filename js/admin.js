// Admin page: lets the owner change the menu from their phone.
// Screens: loading → log in → (not allowed | menu manager), plus full-screen
// layers: dish form, restaurant details, menu sections, section name form.
// All text comes from js/admin-strings.js.
//
// Every change is saved with a transaction (js/admin-firebase.js), and the
// security rules check every save, so hiding a button is never the only
// protection.

import { t, LANGUAGE_CODE } from './admin-strings.js';
import {
  watchLogin, logIn, logOut, sendResetEmail, isAdmin, watchMenu,
  saveItems, saveSettings, saveSections, GoneError, BlockedError
} from './admin-firebase.js';
import { formatPrice, toBool, normalizeText, createElement, clearElement, sectionList } from './utils.js';

// Same limits as firebase/firestore.rules (the rules are the real check).
const LIMITS = {
  name: 60,
  description: 150,
  sectionName: 30,
  sections: 25,
  notice: 120,
  hours: 150,
  phone: 30,
  address: 150,
  mapUrl: 300,
  maxPrice: 100000
};
const TOAST_MS = 4000;
const MAX_TOASTS = 2;

const state = {
  menu: null,            // { settings, categories, items } — always the latest
  user: null,
  stopWatchingMenu: null,
  query: '',
  orderMode: false,
  busyDishes: new Set(),   // dish ids being saved (their buttons are disabled)
  busySections: new Set(), // section ids being saved
  editingId: null,       // dish being edited, or null when adding
  editingSectionId: null, // section being renamed, or null when adding
  sheets: []             // open full-screen layers, top one last: { id, returnFocusTo }
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
  closeAllSheets();
  $('problem-title').textContent = title;
  $('problem-text').textContent = text;
  $('problem-retry').hidden = !retry;
  showScreen('screen-problem');
}

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
  if (error instanceof BlockedError) return t(error.messageKey, error.values);
  if (error instanceof GoneError) return t(error.message === 'section' ? 'sectionGone' : 'dishGone');
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

  const doLogOut = async () => { closeAllSheets(); await logOut(); };
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
    closeAllSheets();
    showScreen('screen-login');
    return;
  }
  openManagerFor(user);
}

// The admin page needs the menu in the current format: sections saved as a
// map with ids, and every dish pointing to its section's id. (Older menus
// are upgraded once with firebase/setup.html, step 6.)
function isUpgradedMenu(menu) {
  return Boolean(menu.categories) && !Array.isArray(menu.categories)
    && menu.items.every((item) => Boolean(item.category_id));
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
    if (!isUpgradedMenu(menu)) {
      showProblem(t('needsUpgradeTitle'), t('needsUpgradeText'));
      return;
    }
    state.menu = menu;
    renderDishList();
    if (isSheetOpen('screen-sections')) renderSectionList();
    showScreen('screen-manager'); // the forms are separate layers, so they stay open
  }, () => {
    showProblem(t('checkFailedTitle'), t('checkFailedText'), { retry: true });
  });
}

// ---------- Menu data helpers ----------

const bySortOrder = (a, b) => (a.sort_order - b.sort_order) || String(a.name).localeCompare(String(b.name));

// Sections in order: [{ id, name, sort_order, visible }].
function sections() {
  return sectionList(state.menu.categories);
}

function dishesIn(sectionId, items = state.menu.items) {
  return items.filter((item) => item.category_id === sectionId).sort(bySortOrder);
}

function dishCountText(count) {
  if (count === 0) return t('dishCountNone');
  return count === 1 ? t('dishCountOne') : t('dishCountMany', { count });
}

function findDish(items, id) {
  const item = items.find((dish) => dish.id === id);
  if (!item) throw new GoneError('dish');
  return item;
}

// Random id like "itm_k3x9q2mf" (lower-case letters and digits, as the rules require).
function newId(prefix) {
  const letters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `${prefix}_${Array.from(bytes, (byte) => letters[byte % letters.length]).join('')}`;
}

// ---------- The dish list ----------

function describePrice(item) {
  const price = formatPrice(item.price);
  return item.price_large ? `${price} · ${t('priceLarge', { price: formatPrice(item.price_large) })}` : price;
}

function renderDishList() {
  if (!state.menu) return;
  const list = $('dish-list');
  clearElement(list);
  const query = state.orderMode ? '' : normalizeText(state.query);
  const matches = (item) => !query || normalizeText(`${item.name} ${item.description || ''}`).includes(query);
  let shown = 0;

  const groups = sections().map((section) => ({
    title: section.name,
    note: toBool(section.visible) ? '' : t('hiddenCategory'),
    dishes: dishesIn(section.id)
  }));
  // Dishes whose section no longer exists (shouldn't happen, but never hide them from the owner).
  const known = new Set(sections().map((section) => section.id));
  const lost = state.menu.items.filter((item) => !known.has(item.category_id)).sort(bySortOrder);
  if (lost.length) groups.push({ title: t('noSection'), note: t('noSectionNote'), dishes: lost });

  groups.forEach((groupInfo) => {
    const dishes = groupInfo.dishes.filter(matches);
    if (query && dishes.length === 0) return;

    const group = createElement('section', 'dish-group');
    const heading = createElement('h2', 'dish-group__title', groupInfo.title);
    if (groupInfo.note) heading.append(createElement('span', 'dish-group__note', ` ${groupInfo.note}`));
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

// Big ON/OFF switch with a visible label (used for dishes and sections).
function createSwitch(on, labelText, ariaLabel, action, id, disabled) {
  const toggle = createElement('button', `switch${on ? ' is-on' : ''}`);
  toggle.type = 'button';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', String(on));
  toggle.setAttribute('aria-label', ariaLabel);
  toggle.dataset.action = action;
  toggle.dataset.id = id;
  toggle.disabled = disabled;
  const knob = createElement('span', 'switch__knob');
  knob.setAttribute('aria-hidden', 'true');
  toggle.append(createElement('span', 'switch__text', on ? t('on') : t('off')), knob);

  const wrap = createElement('div', 'switch-wrap');
  wrap.append(createElement('span', 'switch-label', labelText), toggle);
  return wrap;
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
      createActionButton('↑', 'up', item.id, t('moveUp', { name: item.name }), isFirst || busy),
      createActionButton('↓', 'down', item.id, t('moveDown', { name: item.name }), isLast || busy)
    );
  } else {
    controls.append(
      createSwitch(available, t('availableToday'), t('switchLabel', { name: item.name }), 'toggle', item.id, busy),
      createActionButton(t('edit'), 'edit', item.id, t('editDishLabel', { name: item.name }), busy)
    );
  }
  row.append(controls);
  return row;
}

function createActionButton(text, action, id, label, disabled) {
  const button = createElement('button', `btn btn--small btn--${action}`, text);
  button.type = 'button';
  button.dataset.action = action;
  button.dataset.id = id;
  button.setAttribute('aria-label', label);
  button.disabled = disabled;
  return button;
}

// ---------- Quick dish actions (switch, reorder) ----------

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

// Swaps the sort_order of two neighbours (only these two change).
function swapOrder(item, neighbour, direction) {
  const mine = item.sort_order;
  const theirs = neighbour.sort_order;
  if (mine === theirs) {
    // Same number: push the one that should end up lower down by 1.
    if (direction < 0) neighbour.sort_order = mine + 1; else item.sort_order = mine + 1;
  } else {
    item.sort_order = theirs;
    neighbour.sort_order = mine;
  }
}

function moveDish(id, direction) {
  runDishSave(id, (items) => {
    const item = findDish(items, id);
    const siblings = dishesIn(item.category_id, items);
    const neighbour = siblings[siblings.indexOf(item) + direction];
    if (neighbour) swapOrder(item, neighbour, direction);
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

// ---------- Full-screen layers (forms and the sections list) ----------
// They can sit on top of each other (sections list → section name form).
// Each one adds a browser history entry, so the phone's Back button closes
// only the top layer instead of leaving the page.

function isSheetOpen(id) {
  return state.sheets.some((sheet) => sheet.id === id);
}

function openSheet(id, focusTarget, returnFocusTo) {
  state.sheets.push({ id, returnFocusTo: returnFocusTo || null });
  $(id).hidden = false;
  document.body.classList.add('has-sheet');
  history.pushState({ sheet: id }, '');
  $(id).scrollTop = 0;
  focusTarget.focus();
}

// Hides the top layer (called when the history entry goes away).
function hideTopSheet() {
  const sheet = state.sheets.pop();
  if (!sheet) return;
  $(sheet.id).hidden = true;
  if (state.sheets.length === 0) document.body.classList.remove('has-sheet');
  if (sheet.returnFocusTo && document.body.contains(sheet.returnFocusTo)) sheet.returnFocusTo.focus();
}

// Closes the top layer the same way the Back button does.
function closeTopSheet() {
  if (state.sheets.length) history.back();
}

// Logging out or an error: hide everything at once.
function closeAllSheets() {
  state.sheets.forEach((sheet) => { $(sheet.id).hidden = true; });
  state.sheets = [];
  document.body.classList.remove('has-sheet');
}

function showFormError(id, message) {
  $(id).textContent = message || '';
  $(id).hidden = !message;
  if (message) $(id).scrollIntoView({ block: 'center' });
}

// ---------- Dish form ----------

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
  // Every section, hidden ones marked "(hidden)".
  sections().forEach((section) => {
    const label = toBool(section.visible) ? section.name : t('hiddenSuffix', { name: section.name });
    const option = createElement('option', '', label);
    option.value = section.id;
    select.append(option);
  });

  $('dish-form-title').textContent = item ? t('editDishTitle') : t('addDishTitle');
  $('dish-name').value = item ? item.name : '';
  select.value = item && sections().some((s) => s.id === item.category_id) ? item.category_id : (sections()[0] || {}).id;
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
    category_id: $('dish-category').value,
    price,
    price_large: priceLarge,
    description,
    spicy: $('dish-spicy').checked,
    veg: $('dish-veg').checked,
    featured: $('dish-featured').checked
  };
}

function nextDishOrder(items, sectionId) {
  return items.filter((item) => item.category_id === sectionId)
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
    await saveItems((items, sectionMap) => {
      // The chosen section might have been deleted on another phone.
      if (!sectionMap[values.category_id]) throw new GoneError('section');
      if (id) {
        const item = findDish(items, id);
        if (item.category_id !== values.category_id) item.sort_order = nextDishOrder(items, values.category_id);
        delete item.category; // (old format field, never kept)
        Object.assign(item, values);
      } else {
        items.push({
          id: newId('itm'),
          ...values,
          available: true,
          image: '',
          sort_order: nextDishOrder(items, values.category_id)
        });
      }
      return items;
    });
    closeTopSheet();
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
  if (!item) { closeTopSheet(); return; }
  if (!window.confirm(t('confirmDelete', { name: item.name }))) return;
  if (!navigator.onLine) { showFormError('dish-error', t('saveOffline')); return; }

  const button = $('dish-delete');
  setBusy(button, true);
  try {
    await saveItems((items) => items.filter((dish) => dish.id !== id));
    closeTopSheet();
    showToast(t('dishDeleted', { name: item.name }));
  } catch (error) {
    showFormError('dish-error', saveErrorMessage(error));
  } finally {
    setBusy(button, false);
  }
}

// ---------- Menu sections ----------

function openSectionsScreen(returnFocusTo) {
  renderSectionList();
  openSheet('screen-sections', $('sections-title'), returnFocusTo);
}

function renderSectionList() {
  if (!state.menu) return;
  const list = $('section-list');
  clearElement(list);
  const all = sections();
  all.forEach((section, index) => {
    const busy = state.busySections.has(section.id);
    const shown = toBool(section.visible);
    const row = createElement('li', `dish-row section-row${shown ? '' : ' dish-row--off'}${busy ? ' is-busy' : ''}`);

    const info = createElement('div', 'dish-row__info');
    const count = dishesIn(section.id).length;
    info.append(
      createElement('p', 'dish-row__name', section.name),
      createElement('p', 'dish-row__price', shown ? dishCountText(count) : `${dishCountText(count)} · ${t('sectionHidden')}`)
    );
    row.append(info);

    const switchRow = createElement('div', 'dish-row__controls');
    switchRow.append(createSwitch(shown, t('shownOnMenu'), t('sectionSwitchLabel', { name: section.name }), 'section-toggle', section.id, busy));
    row.append(switchRow);

    const buttons = createElement('div', 'dish-row__controls dish-row__controls--order section-row__buttons');
    buttons.append(
      createActionButton('↑', 'section-up', section.id, t('moveUp', { name: section.name }), index === 0 || busy),
      createActionButton('↓', 'section-down', section.id, t('moveDown', { name: section.name }), index === all.length - 1 || busy),
      createActionButton(t('rename'), 'section-rename', section.id, t('renameSectionLabel', { name: section.name }), busy),
      createActionButton(t('delete'), 'section-delete', section.id, t('deleteSectionLabel', { name: section.name }), busy)
    );
    row.append(buttons);
    list.append(row);
  });
}

async function runSectionSave(id, change, successMessage) {
  if (!navigator.onLine) { showToast(t('saveOffline'), 'error'); return; }
  state.busySections.add(id);
  renderSectionList();
  try {
    await saveSections(change);
    showToast(successMessage);
  } catch (error) {
    if (error instanceof BlockedError) window.alert(saveErrorMessage(error));
    else showToast(saveErrorMessage(error), 'error');
  } finally {
    state.busySections.delete(id);
    renderSectionList();
  }
}

function findSection(sectionMap, id) {
  if (!sectionMap[id]) throw new GoneError('section');
  return sectionMap[id];
}

function toggleSection(id) {
  const section = findSection(state.menu.categories, id);
  const show = !toBool(section.visible);
  runSectionSave(id, (sectionMap) => {
    findSection(sectionMap, id).visible = show;
    return sectionMap;
  }, t(show ? 'sectionShown' : 'sectionHiddenToast', { name: section.name }));
}

function moveSection(id, direction) {
  runSectionSave(id, (sectionMap) => {
    const ordered = sectionList(sectionMap);
    const index = ordered.findIndex((section) => section.id === id);
    if (index < 0) throw new GoneError('section');
    const neighbour = ordered[index + direction];
    if (neighbour) swapOrder(sectionMap[id], sectionMap[neighbour.id], direction);
    return sectionMap;
  }, t('orderSaved'));
}

function blockedDeleteReason(sectionMap, items, id) {
  const count = items.filter((item) => item.category_id === id).length;
  if (count === 1) return new BlockedError('sectionHasDishesOne');
  if (count > 1) return new BlockedError('sectionHasDishesMany', { count });
  if (Object.keys(sectionMap).length <= 1) return new BlockedError('lastSection');
  return null;
}

function deleteSection(id) {
  const section = findSection(state.menu.categories, id);
  // Check first with what's on screen, to explain without asking "Are you sure?".
  const reason = blockedDeleteReason(state.menu.categories, state.menu.items, id);
  if (reason) { window.alert(saveErrorMessage(reason)); return; }
  if (!window.confirm(t('confirmDeleteSection', { name: section.name }))) return;

  runSectionSave(id, (sectionMap, items) => {
    findSection(sectionMap, id);
    // Check again on the LATEST menu: another phone may have added a dish.
    const latestReason = blockedDeleteReason(sectionMap, items, id);
    if (latestReason) throw latestReason;
    delete sectionMap[id];
    return sectionMap;
  }, t('sectionDeleted', { name: section.name }));
}

// ----- Add / rename form -----

function cleanSectionName(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function openSectionForm(id, returnFocusTo) {
  state.editingSectionId = id;
  const section = id ? findSection(state.menu.categories, id) : null;
  $('section-form-title').textContent = section ? t('renameSectionTitle') : t('addSectionTitle');
  $('section-name').value = section ? section.name : '';
  $('section-name-hint').textContent = t('sectionNameHint', { max: LIMITS.sectionName });
  showFormError('section-error', '');
  openSheet('screen-section', $('section-name'), returnFocusTo);
}

// Same name already used by ANOTHER section (ignoring capitals)?
function duplicateSection(sectionMap, name, exceptId) {
  const wanted = name.toLowerCase();
  return Object.keys(sectionMap).find((id) => id !== exceptId && cleanSectionName(sectionMap[id].name).toLowerCase() === wanted);
}

async function saveSectionForm(event) {
  event.preventDefault();
  const id = state.editingSectionId;
  const name = cleanSectionName($('section-name').value);
  let error = '';
  if (!name) error = t('errorSectionEmpty');
  else if (name.length > LIMITS.sectionName) error = t('errorSectionLong', { max: LIMITS.sectionName });
  else if (duplicateSection(state.menu.categories, name, id)) {
    // Show the existing section's name as it's written on the menu.
    error = t('errorSectionDuplicate', { name: state.menu.categories[duplicateSection(state.menu.categories, name, id)].name });
  }
  else if (!id && Object.keys(state.menu.categories).length >= LIMITS.sections) error = t('tooManySections', { max: LIMITS.sections });
  showFormError('section-error', error);
  if (error) return;
  if (!navigator.onLine) { showFormError('section-error', t('saveOffline')); return; }

  const button = $('section-save');
  setBusy(button, true);
  try {
    await saveSections((sectionMap) => {
      // Check again on the latest menu (another phone may have changed it).
      const clash = duplicateSection(sectionMap, name, id);
      if (clash) throw new BlockedError('errorSectionDuplicate', { name: sectionMap[clash].name });
      if (id) {
        findSection(sectionMap, id).name = name;
      } else {
        if (Object.keys(sectionMap).length >= LIMITS.sections) throw new BlockedError('tooManySections', { max: LIMITS.sections });
        const highest = Object.values(sectionMap).reduce((max, s) => Math.max(max, Number(s.sort_order) || 0), 0);
        sectionMap[newId('cat')] = { name, sort_order: highest + 1, visible: true };
      }
      return sectionMap;
    });
    closeTopSheet();
    showToast(t(id ? 'sectionRenamed' : 'sectionAdded', { name }));
  } catch (saveError) {
    showFormError('section-error', saveErrorMessage(saveError));
  } finally {
    setBusy(button, false);
  }
}

function setupSections() {
  $('open-sections').addEventListener('click', (event) => openSectionsScreen(event.currentTarget));
  $('sections-done').addEventListener('click', closeTopSheet);
  $('add-section').addEventListener('click', (event) => openSectionForm(null, event.currentTarget));
  $('section-form').addEventListener('submit', saveSectionForm);
  $('section-cancel').addEventListener('click', closeTopSheet);

  $('section-list').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const { action, id } = button.dataset;
    try {
      if (action === 'section-toggle') toggleSection(id);
      if (action === 'section-up') moveSection(id, -1);
      if (action === 'section-down') moveSection(id, 1);
      if (action === 'section-rename') openSectionForm(id, button);
      if (action === 'section-delete') deleteSection(id);
    } catch (error) {
      showToast(saveErrorMessage(error), 'error');
    }
  });
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
    closeTopSheet();
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
  $('dish-cancel').addEventListener('click', closeTopSheet);
  $('dish-delete').addEventListener('click', deleteDish);
  $('dish-description').addEventListener('input', updateDescriptionCount);

  $('details-form').addEventListener('submit', saveDetailsForm);
  $('details-cancel').addEventListener('click', closeTopSheet);
  $('open-details').addEventListener('click', (event) => openDetailsForm(event.currentTarget));
  $('download-backup').addEventListener('click', downloadBackup);

  // Phone's Back button (or Cancel / Done) closes the top layer only.
  window.addEventListener('popstate', hideTopSheet);
}

function init() {
  applyStrings();
  updateOfflineBanner();
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
  setupLogin();
  setupDishList();
  setupForms();
  setupSections();
  watchLogin(onLoginChange);
}

init();
