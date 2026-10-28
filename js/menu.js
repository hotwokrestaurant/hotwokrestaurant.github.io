// Customer menu: turns menu data into the page.
// Phase 1 uses local sample data. In Phase 3 this will come from the Apps Script API.

import { SAMPLE_MENU } from './sample-data.js';
import { formatPrice, toBool, toPositiveNumber, normalizeText, createElement } from './utils.js';

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

  const categories = (data.categories || [])
    .filter((category) => toBool(category.visible))
    .sort((a, b) => a.sort_order - b.sort_order);

  const items = (data.items || [])
    .filter((item) => showSoldOut || toBool(item.available))
    .sort((a, b) => a.sort_order - b.sort_order);

  const groups = categories
    .map((category) => ({
      name: category.name,
      items: items.filter((item) => item.category === category.name)
    }))
    .filter((group) => group.items.length > 0);

  return { settings, groups };
}

// ---------- Rendering ----------

function renderHeader(settings) {
  if (settings.restaurant_name) {
    document.getElementById('restaurant-name').textContent = settings.restaurant_name;
    document.title = `${settings.restaurant_name} – Menu`;
  }
  document.getElementById('tagline').textContent = settings.tagline || '';

  const notice = document.getElementById('notice');
  notice.textContent = settings.notice || '';
  notice.hidden = !settings.notice;
}

function renderCategoryTabs(groups) {
  const list = document.getElementById('category-tabs');
  list.replaceChildren();

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
  container.replaceChildren();

  groups.forEach((group, index) => {
    const section = createElement('section', 'menu-section');
    section.id = `cat-${index}`;
    section.tabIndex = -1; // lets us move keyboard focus here after a tab click

    const heading = createElement('h2', 'menu-section__title', group.name);
    heading.id = `cat-${index}-title`;
    section.setAttribute('aria-labelledby', heading.id);
    section.append(heading);

    group.items.forEach((item) => section.append(createDishCard(item)));
    container.append(section);
  });
}

function createDishCard(item) {
  const isAvailable = toBool(item.available);
  const card = createElement('article', isAvailable ? 'dish' : 'dish dish--sold-out');
  // Text used by the search box (name + description, lower-case).
  card.dataset.search = normalizeText(`${item.name} ${item.description || ''}`);

  const body = createElement('div', 'dish__body');
  body.append(createElement('h3', 'dish__name', item.name));

  if (item.description) {
    body.append(createElement('p', 'dish__description', item.description));
  }

  const badges = createBadges(item);
  if (badges) body.append(badges);

  body.append(createElement('p', 'dish__price', describePrice(item)));

  if (!isAvailable) {
    body.append(createElement('p', 'dish__sold-out', 'Not available today'));
  }

  card.append(body);

  const photo = createDishPhoto(item);
  if (photo) card.append(photo);

  return card;
}

// "Rs. 1,200" or "Regular Rs. 1,200 · Large Rs. 1,600"
function describePrice(item) {
  const price = toPositiveNumber(item.price);
  const large = toPositiveNumber(item.price_large);
  if (price === null) return '';
  if (large === null) return formatPrice(price);
  return `Regular ${formatPrice(price)} · Large ${formatPrice(large)}`;
}

function createBadges(item) {
  const badgeInfo = [
    { show: toBool(item.featured), className: 'badge--featured', icon: '⭐', label: "Chef's special" },
    { show: toBool(item.spicy), className: 'badge--spicy', icon: '🌶️', label: 'Spicy' },
    { show: toBool(item.veg), className: 'badge--veg', icon: '🥬', label: 'Veg' }
  ].filter((badge) => badge.show);

  if (badgeInfo.length === 0) return null;

  const list = createElement('ul', 'badges');
  list.setAttribute('aria-label', 'Dish details');
  badgeInfo.forEach((badge) => {
    const listItem = createElement('li', `badge ${badge.className}`);
    const icon = createElement('span', '', badge.icon);
    icon.setAttribute('aria-hidden', 'true'); // screen readers read the label only
    listItem.append(icon, ` ${badge.label}`);
    list.append(listItem);
  });
  return list;
}

function createDishPhoto(item) {
  if (!item.image || !IMAGE_NAME_PATTERN.test(item.image)) return null;

  const img = createElement('img', 'dish__photo');
  img.src = `images/${item.image}`;
  img.alt = item.name;
  img.width = 96;   // width/height reserve space so the page doesn't jump
  img.height = 96;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => img.remove()); // missing file → just no photo
  return img;
}

function renderFooter(settings) {
  const hoursBlock = document.getElementById('hours-block');
  document.getElementById('opening-hours').textContent = settings.opening_hours || '';
  hoursBlock.hidden = !settings.opening_hours;

  const address = document.getElementById('address');
  address.textContent = settings.address || '';
  address.hidden = !settings.address;

  const callButton = document.getElementById('call-button');
  if (settings.phone) {
    // "tel:" links open the phone dialler. Keep only digits and a leading +.
    callButton.href = `tel:${String(settings.phone).replace(/[^\d+]/g, '')}`;
    document.getElementById('call-label').textContent = `Call ${settings.phone}`;
    callButton.hidden = false;
  }

  const mapLink = document.getElementById('map-link');
  if (settings.map_url && String(settings.map_url).startsWith('https://')) {
    mapLink.href = settings.map_url;
    mapLink.hidden = false;
  }
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
function setupActiveTabTracking() {
  if (!('IntersectionObserver' in window)) return;

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

// Slide the tab strip sideways so the active tab is centred.
// (We scroll only the strip, not the page, so the user's scrolling isn't interrupted.)
function scrollTabIntoView(tab) {
  const strip = tab.closest('.category-tabs__list');
  const left = tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
  strip.scrollTo({ left, behavior: scrollBehavior });
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

function renderMenu(data) {
  const { settings, groups } = prepareMenu(data);
  renderHeader(settings);
  renderCategoryTabs(groups);
  renderSections(groups);
  renderFooter(settings);
  document.getElementById('menu').setAttribute('aria-busy', 'false');
  setupActiveTabTracking();
}

function init() {
  setupTabClicks();
  setupSearch();
  setupBackToTop();
  renderMenu(SAMPLE_MENU);
}

init();
