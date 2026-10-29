// Customer menu: turns menu data into the page.
// The data comes from Firestore (menu/published) via js/api.js, with a saved
// copy on the phone so repeat visits appear instantly and work offline.

import { getSavedMenu, saveMenu, fetchLatestMenu } from './api.js';
import { FALLBACK_PHONE, FIRST_LOAD_TIMEOUT_MS, REFRESH_TIMEOUT_MS } from './config.js';
import {
  formatAmount, toBool, toPositiveNumber, normalizeText, createElement, clearElement, sectionList, dishInSection
} from './utils.js';

// Only simple image file names are allowed, e.g. "chicken-kottu.webp".
const IMAGE_NAME_PATTERN = /^[a-z0-9_-]+\.(webp|jpg|jpeg|png)$/i;
const BACK_TO_TOP_AFTER_PX = 600;

// Use smooth scrolling unless the phone's "reduce motion" setting is on.
const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

// ---------- Preparing the data ----------

// Sort categories and items, hide what customers should not see,
// and group items under their category. Empty categories are dropped.
function prepareMenu(data) {
  const settings = data.settings || {};
  const showSoldOut = toBool(settings.show_sold_out);

  // Sections in their set order (works with both the new map format and the
  // older list format, see sectionList in utils.js). Hidden ones are skipped.
  const sections = sectionList(data.categories).filter((section) => toBool(section.visible));

  const items = (data.items || [])
    .filter((item) => showSoldOut || toBool(item.available))
    .sort((a, b) => a.sort_order - b.sort_order);

  // A dish whose section is hidden or missing simply isn't shown.
  const groups = sections
    .map((section) => ({
      name: section.name,
      items: items.filter((item) => dishInSection(item, section))
    }))
    .filter((group) => group.items.length > 0);

  return { settings, groups };
}

// ---------- Rendering ----------

function renderHeader(settings) {
  if (settings.restaurant_name) {
    // The logo image is the page title, so its alt text carries the name.
    document.getElementById('logo').alt = settings.restaurant_name;
    document.title = `${settings.restaurant_name} – Menu`;
  }

  const tagline = document.getElementById('tagline');
  // Text goes in a <span> so the framing lines can shrink around it (see .line-frame).
  clearElement(tagline);
  tagline.append(createElement('span', '', settings.tagline || ''));
  tagline.hidden = !settings.tagline;
  fitTaglineFrame();

  const notice = document.getElementById('notice');
  notice.textContent = settings.notice || '';
  notice.hidden = !settings.notice;
}

// The tagline gets thin lines on both sides ("—— text ——") only when it
// still fits on ONE line with them. If the lines would squeeze it onto two
// lines, they're dropped and it's shown as plain centred text instead.
// (The tagline comes from the owner's settings, so its length can vary.)
function fitTaglineFrame() {
  const tagline = document.getElementById('tagline');
  if (tagline.hidden) return;
  tagline.classList.add('line-frame');
  const lineHeight = parseFloat(getComputedStyle(tagline).lineHeight);
  if (tagline.clientHeight > lineHeight * 1.5) {
    tagline.classList.remove('line-frame');
  }
}

function renderCategoryTabs(groups) {
  const list = document.getElementById('category-tabs');
  clearElement(list);

  groups.forEach((group, index) => {
    const listItem = createElement('li');
    const link = createElement('a', 'category-tabs__tab', group.name);
    link.href = `#cat-${index}`;
    link.dataset.target = `cat-${index}`;
    listItem.append(link);
    list.append(listItem);
  });
}

function renderSections(groups) {
  const container = document.getElementById('menu-sections');
  clearElement(container);

  groups.forEach((group, index) => {
    const section = createElement('section', 'menu-section');
    // If any dish here has a photo, every row keeps a photo column so names line up.
    const sectionHasPhotos = group.items.some(hasPhoto);
    section.classList.toggle('menu-section--with-photos', sectionHasPhotos);
    section.id = `cat-${index}`;
    section.tabIndex = -1; // lets us move keyboard focus here after a tab click

    // Between categories: hairline + small line-art flame + hairline (decoration only).
    if (index > 0) {
      const divider = createElement('div', 'menu-divider line-frame');
      divider.append(createIcon('flame-line', 'menu-divider__icon'));
      section.append(divider);
    }

    const heading = createElement('h2', 'menu-section__title line-frame');
    heading.append(createElement('span', '', group.name)); // span: see .line-frame
    heading.id = `cat-${index}-title`;
    section.setAttribute('aria-labelledby', heading.id);
    section.append(heading);

    group.items.forEach((item) => section.append(createDishCard(item, sectionHasPhotos)));
    container.append(section);
  });
}

// Row layout:
//   .dish__line   = [ .dish__main (name + dotted leader) ] [ price ]
//   description   = under the whole line, full width
// Two sizes (in a category without photos): the description goes INSIDE
// .dish__main instead, so it sits right under the name, beside the
// Regular/Large block. In categories with photos, the CSS moves a
// Regular/Large block under the name instead (see style.css).
function createDishCard(item, sectionHasPhotos) {
  const isAvailable = toBool(item.available);
  const card = createElement('article', isAvailable ? 'dish' : 'dish dish--sold-out');
  // Text used by the search box (name + description, lower-case).
  card.dataset.search = normalizeText(`${item.name} ${item.description || ''}`);

  const name = createElement('h3', 'dish__name', item.name);
  const icons = createDishIcons(item);
  if (icons) name.append(icons);

  const title = createElement('div', 'dish__title');
  title.append(name);

  const price = createPrice(item);
  if (price) title.append(createLeader());

  const isTwoSizes = Boolean(price) && price.classList.contains('dish__prices');
  if (isTwoSizes) card.classList.add('dish--two-sizes');

  const main = createElement('div', 'dish__main');
  main.append(title);

  const line = createElement('div', 'dish__line');
  line.append(main);
  if (price) line.append(price);

  const body = createElement('div', 'dish__body');
  body.append(line);

  if (item.description) {
    const description = createElement('p', 'dish__description', item.description);
    if (isTwoSizes && !sectionHasPhotos) main.append(description);
    else body.append(description);
  }

  if (!isAvailable) {
    body.append(createElement('p', 'dish__sold-out', 'Sold out today'));
  }

  card.append(body);

  const photo = createDishPhoto(item);
  if (photo) card.append(photo);
  // In a category with photos, a row without one gets an empty photo-sized
  // spacer, so its name lines up with the others (see .dish in style.css).
  else if (sectionHasPhotos) card.append(createPhotoSpacer());

  return card;
}

function createPhotoSpacer() {
  const spacer = createElement('div', 'dish__photo-spacer');
  spacer.setAttribute('aria-hidden', 'true');
  return spacer;
}

// One size:  <p>Rs. 1,200</p>
// Two sizes: a small list — "Regular Rs. 1,200" and "Large Rs. 1,600" on separate lines.
function createPrice(item) {
  const price = toPositiveNumber(item.price);
  const large = toPositiveNumber(item.price_large);
  if (price === null) return null;
  if (large === null) {
    const single = createElement('p', 'dish__price');
    single.append(...createPriceParts(price));
    return single;
  }

  const list = createElement('dl', 'dish__prices');
  [['Regular', price], ['Large', large]].forEach(([label, amount]) => {
    const row = createElement('div');
    const value = createElement('dd');
    value.append(...createPriceParts(amount));
    row.append(createElement('dt', '', label), value);
    list.append(row);
  });
  return list;
}

// The dotted line between name and price, made of small full stops.
// Hidden from screen readers — it is decoration only.
const LEADER_DOTS = '.'.repeat(160);

function createLeader() {
  const leader = createElement('span', 'dish__leader', LEADER_DOTS);
  leader.setAttribute('aria-hidden', 'true');
  return leader;
}

// "Rs. 1,200" as two pieces, so "Rs." can be smaller and grey and the number reads first.
function createPriceParts(amount) {
  return [createElement('span', 'price__currency', 'Rs. '), formatAmount(amount)];
}

// Small SVG icons after the dish name. Each icon has a hidden text label
// so screen readers say "Spicy" etc. (the icon key at the top explains them visually).
function createDishIcons(item) {
  const iconInfo = [
    { show: toBool(item.spicy), icon: 'flame', className: 'icon--spicy', label: 'Spicy' },
    { show: toBool(item.veg), icon: 'leaf', className: 'icon--veg', label: 'Vegetarian' },
    { show: toBool(item.featured), icon: 'star', className: 'icon--featured', label: "Chef's special" }
  ].filter((info) => info.show);

  if (iconInfo.length === 0) return null;

  const wrapper = createElement('span', 'dish__icons');
  iconInfo.forEach((info) => {
    wrapper.append(createIcon(info.icon, info.className));
    wrapper.append(createElement('span', 'visually-hidden', info.label));
  });
  return wrapper;
}

// Builds <svg class="icon"><use href="#icon-NAME"></svg>, pointing at the
// icon set in index.html. SVG elements need createElementNS, not createElement.
function createIcon(name, className) {
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('class', `icon ${className}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(svgNamespace, 'use');
  use.setAttribute('href', `#icon-${name}`);
  svg.append(use);
  return svg;
}

function hasPhoto(item) {
  return Boolean(item.image) && IMAGE_NAME_PATTERN.test(item.image);
}

function createDishPhoto(item) {
  if (!hasPhoto(item)) return null;

  const img = createElement('img', 'dish__photo');
  img.src = `images/${item.image}`;
  img.alt = item.name;
  img.width = 72;   // width/height reserve space so the page doesn't jump
  img.height = 72;
  img.loading = 'lazy';
  img.decoding = 'async';
  // Missing file → no photo, but keep the space so the row stays aligned.
  img.addEventListener('error', () => img.replaceWith(createPhotoSpacer()));
  return img;
}

function renderFooter(settings) {
  const hoursBlock = document.getElementById('hours-block');
  document.getElementById('opening-hours').textContent = settings.opening_hours || '';
  hoursBlock.hidden = !settings.opening_hours;

  const addressBlock = document.getElementById('address-block');
  document.getElementById('address').textContent = settings.address || '';
  addressBlock.hidden = !settings.address;

  setLink('map-link', isHttpsLink(settings.map_url) ? settings.map_url : '');

  // Contact: the number as text, plus Call / WhatsApp / Email / Facebook buttons.
  const phone = String(settings.phone || '').trim();
  const whatsapp = String(settings.whatsapp || '').trim();
  const email = String(settings.email || '').trim();
  const phoneText = document.getElementById('phone-text');
  phoneText.textContent = phone;
  phoneText.hidden = !phone;
  setLink('call-button', phone ? phoneLink(phone) : '');
  setLink('whatsapp-button', whatsapp ? whatsappLink(whatsapp) : '');
  setLink('email-button', isEmail(email) ? `mailto:${email}` : '');
  setLink('facebook-button', isHttpsLink(settings.facebook_url) ? settings.facebook_url : '');

  const anyContact = ['call-button', 'whatsapp-button', 'email-button', 'facebook-button']
    .some((id) => !document.getElementById(id).hidden);
  document.getElementById('contact-block').hidden = !anyContact && !phone;
}

// Shows a link with this address, or hides it when the address is empty.
function setLink(id, href) {
  const link = document.getElementById(id);
  if (href) link.href = href;
  link.hidden = !href;
}

function isHttpsLink(url) {
  return Boolean(url) && /^https:\/\/\S+$/.test(String(url));
}

function isEmail(text) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text);
}

// "tel:" links open the phone dialler. Keep only digits and a leading +.
function phoneLink(phone) {
  return `tel:${String(phone).replace(/[^\d+]/g, '')}`;
}

// WhatsApp chat link: wa.me + the number with country code, digits only
// ("+94 70 270 1009" → https://wa.me/94702701009).
function whatsappLink(number) {
  return `https://wa.me/${String(number).replace(/\D/g, '')}`;
}

// ---------- Interactions ----------

// Tapping a tab scrolls to that category.
function setupTabClicks() {
  document.getElementById('category-tabs').addEventListener('click', (event) => {
    const link = event.target.closest('a[data-target]');
    if (!link) return;
    event.preventDefault();
    const section = document.getElementById(link.dataset.target);
    section.scrollIntoView({ behavior: scrollBehavior, block: 'start' });
    section.focus({ preventScroll: true });
  });
}

// Highlight the tab of the category currently on screen.
// IntersectionObserver tells us when sections enter/leave a band near the top
// of the screen — much cheaper than checking positions on every scroll.
// The menu can be drawn twice (saved copy, then a newer version), so each
// observer is kept here and switched off before a new one is made.
let activeTabObserver = null;
let revealObserver = null;

function setupActiveTabTracking() {
  if (!('IntersectionObserver' in window)) return;
  if (activeTabObserver) activeTabObserver.disconnect();

  const sections = Array.from(document.querySelectorAll('.menu-section'));
  const onScreen = new Set();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) onScreen.add(entry.target);
      else onScreen.delete(entry.target);
    });
    // The first section (in page order) inside the band is the "current" one.
    const current = sections.find((section) => onScreen.has(section));
    if (current) setActiveTab(current.id);
  }, {
    // The band starts just below the sticky tabs and ends 60% down the screen.
    rootMargin: '-80px 0px -60% 0px'
  });

  sections.forEach((section) => observer.observe(section));
  activeTabObserver = observer;
}

function setActiveTab(sectionId) {
  const tabs = document.querySelectorAll('.category-tabs__tab');
  tabs.forEach((tab) => {
    const isActive = tab.dataset.target === sectionId;
    tab.classList.toggle('is-active', isActive);
    if (isActive) {
      tab.setAttribute('aria-current', 'true');
      scrollTabIntoView(tab);
    } else {
      tab.removeAttribute('aria-current');
    }
  });
}

// Gently fade each category in the first time it scrolls onto the screen.
// Skipped entirely when the phone's "reduce motion" setting is on, or when
// the browser lacks IntersectionObserver — then everything is simply visible.
// Also skipped when the menu is redrawn with a newer version (no second fade).
function setupSectionReveal(animate) {
  if (revealObserver) revealObserver.disconnect();
  if (!animate || scrollBehavior === 'auto' || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target); // only fade in once
    });
  });

  document.querySelectorAll('.menu-section').forEach((section) => {
    section.classList.add('reveal');
    observer.observe(section);
  });
  revealObserver = observer;
}

// Slide the tab strip sideways so the active tab is centred.
// (We scroll only the strip, not the page, so the user's scrolling isn't interrupted.)
function scrollTabIntoView(tab) {
  const strip = tab.closest('.category-tabs__list');
  const left = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
  strip.scrollTo({ left, behavior: scrollBehavior });
}

// Fade the right edge of the tab strip only while more tabs are hidden to
// the right — a hint that it scrolls. Re-checked when the strip scrolls,
// the screen size changes, the menu is drawn, or search hides some tabs.
function setupTabStripFade() {
  const strip = document.getElementById('category-tabs');
  strip.addEventListener('scroll', updateTabStripFade, { passive: true });
  window.addEventListener('resize', updateTabStripFade, { passive: true });
}

function updateTabStripFade() {
  const strip = document.getElementById('category-tabs');
  // A couple of pixels of slack, because scroll positions can be fractional.
  const hasMore = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2;
  strip.classList.toggle('has-more', hasMore);
}

// Live search: hide dishes that don't match, and hide empty categories.
function setupSearch() {
  const input = document.getElementById('search-input');
  input.addEventListener('input', () => applySearch(input.value));
}

function applySearch(query) {
  const search = normalizeText(query);
  let totalMatches = 0;

  document.querySelectorAll('.menu-section').forEach((section) => {
    let sectionMatches = 0;
    section.querySelectorAll('.dish').forEach((card) => {
      const matches = search === '' || card.dataset.search.includes(search);
      card.hidden = !matches;
      if (matches) sectionMatches += 1;
    });

    section.hidden = sectionMatches === 0;
    const tab = document.querySelector(`.category-tabs__tab[data-target="${section.id}"]`);
    if (tab) tab.parentElement.hidden = sectionMatches === 0;
    totalMatches += sectionMatches;
  });

  document.getElementById('no-results').hidden = totalMatches > 0;
  updateTabStripFade();
}

// Show the "back to top" button once the user has scrolled down a bit.
function setupBackToTop() {
  const button = document.getElementById('back-to-top');
  let ticking = false;

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    // requestAnimationFrame = run once per screen refresh, not on every scroll event.
    window.requestAnimationFrame(() => {
      button.hidden = window.scrollY < BACK_TO_TOP_AFTER_PX;
      ticking = false;
    });
  }, { passive: true });

  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: scrollBehavior });
  });
}

// ---------- Start ----------

// Draws the whole menu. Can run twice: first from the saved copy, then again
// if Firestore has a newer version. `isFirstDraw` decides the fade-in.
function renderMenu(data, isFirstDraw) {
  const { settings, groups } = prepareMenu(data);
  renderHeader(settings);
  renderCategoryTabs(groups);
  renderSections(groups);
  renderFooter(settings);
  document.getElementById('menu').setAttribute('aria-busy', 'false');
  setupActiveTabTracking();
  setupSectionReveal(isFirstDraw);
  updateTabStripFade();

  // If the customer had already typed in the search box, keep that filter.
  const query = document.getElementById('search-input').value;
  if (query) applySearch(query);
}

// ---------- Loading states ----------

// Small note under the tabs, e.g. "Showing saved menu · updated 29 Oct".
function showSavedMenuNote(updatedAt) {
  const note = document.getElementById('status-note');
  const date = new Date(updatedAt);
  const when = updatedAt > 0
    ? ` · updated ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : '';
  note.textContent = `Showing saved menu${when}`;
  note.hidden = false;
}

function hideSavedMenuNote() {
  document.getElementById('status-note').hidden = true;
}

// No saved menu AND Firestore couldn't be reached: friendly message,
// a "Try again" button, and a call button (number from js/config.js).
function showLoadError() {
  const container = document.getElementById('menu-sections');
  clearElement(container);

  const box = createElement('div', 'load-error');
  box.setAttribute('role', 'alert');
  box.append(
    createElement('p', 'load-error__title', 'Sorry, the menu couldn\'t load.'),
    createElement('p', 'load-error__text', 'Please check your internet connection and try again, or call us and we\'ll help.')
  );

  const retry = createElement('button', 'button', 'Try again');
  retry.type = 'button';
  retry.addEventListener('click', () => {
    retry.disabled = true;
    retry.textContent = 'Loading…';
    loadMenu();
  });

  const call = createElement('a', 'button', `Call us · ${FALLBACK_PHONE}`);
  call.href = phoneLink(FALLBACK_PHONE);

  const actions = createElement('div', 'load-error__actions');
  actions.append(retry, call);
  box.append(actions);
  container.append(box);
  document.getElementById('menu').setAttribute('aria-busy', 'false');
}

// ---------- Start ----------

// What is currently on screen: { menu, updatedAt } or null.
let shownMenu = null;
// True while a fetch is running, so "back online" can't start a second one.
let isLoading = false;

// Has the menu changed? Normally updatedAt tells us (the admin page always
// sets it). Edits made by hand in the Firebase console don't change
// updatedAt, so the contents are compared too (~5 KB, takes no time).
function isDifferentMenu(a, b) {
  return a.updatedAt !== b.updatedAt || JSON.stringify(a.menu) !== JSON.stringify(b.menu);
}

// Cache-first loading:
//   1. A saved copy on this phone? Draw it at once (no waiting for the network).
//   2. Fetch the latest from Firestore (1 read). If it's newer, redraw and save.
//   3. Fetch failed or too slow? Keep the saved copy with a small note,
//      or, with nothing saved, show a friendly error.
async function loadMenu() {
  if (isLoading) return;
  isLoading = true;

  if (!shownMenu) {
    const saved = getSavedMenu();
    if (saved) {
      shownMenu = saved;
      renderMenu(saved.menu, true);
    }
  }

  try {
    const latest = await fetchLatestMenu(shownMenu ? REFRESH_TIMEOUT_MS : FIRST_LOAD_TIMEOUT_MS);
    if (!shownMenu || isDifferentMenu(latest, shownMenu)) {
      renderMenu(latest.menu, !shownMenu);
      shownMenu = latest;
      saveMenu(latest);
    }
    hideSavedMenuNote();
  } catch (error) {
    if (shownMenu) showSavedMenuNote(shownMenu.updatedAt);
    else showLoadError();
  } finally {
    isLoading = false;
  }
}

function init() {
  // Re-check the tagline lines when the screen size changes, and once
  // Montserrat has loaded (it is wider than the fallback font).
  window.addEventListener('resize', fitTaglineFrame, { passive: true });
  if (document.fonts) {
    document.fonts.load('500 1em Montserrat').then(fitTaglineFrame, () => {});
  }

  setupTabClicks();
  setupSearch();
  setupBackToTop();
  setupTabStripFade();

  // When the phone comes back online after a failed load, try again quietly.
  window.addEventListener('online', () => {
    if (!document.getElementById('status-note').hidden || !shownMenu) loadMenu();
  });

  loadMenu();
}

init();
