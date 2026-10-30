// Small helper functions shared by the customer menu and (later) the admin page.

// Turn a number into a Sri Lankan rupee price, e.g. 1250 -> "Rs. 1,250".
const priceFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatPrice(amount) {
  return `Rs. ${formatAmount(amount)}`;
}

// Just the number part, e.g. 1250 -> "1,250" (for when "Rs." is styled separately).
export function formatAmount(amount) {
  return priceFormatter.format(amount);
}

// Accept true / "TRUE" / "true" alike (Firestore stores real booleans, but
// being lenient keeps older cached data and hand-edited values working).
export function toBool(value) {
  return value === true || String(value).trim().toUpperCase() === 'TRUE';
}

// Returns a positive number, or null if the value is blank/invalid.
export function toPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

// ---------- Menu sections ----------
// Sections are saved as a map keyed by a permanent id:
//   { cat_kottu: { name: 'Kottu', sort_order: 2, visible: true }, … }
// Older saved menus (before the upgrade) used a list without ids:
//   [{ name: 'Kottu', sort_order: 2, visible: true }, …]
// Both are turned into one sorted list: [{ id, name, sort_order, visible }].
export function sectionList(categories) {
  const list = Array.isArray(categories)
    ? categories.map((section) => ({ ...section, id: section.id || null }))
    : Object.keys(categories || {}).map((id) => ({ ...categories[id], id }));
  return list.sort((a, b) => (Number(a.sort_order) - Number(b.sort_order)) || String(a.name).localeCompare(String(b.name)));
}

// Does this dish belong to this section? New dishes point to the section's id
// (category_id); older ones used the section's name (category).
export function dishInSection(item, section) {
  return item.category_id ? item.category_id === section.id : item.category === section.name;
}

// Lower-case and trim text so searches ignore capitals and extra spaces.
export function normalizeText(text) {
  return String(text || '').toLowerCase().trim();
}

// Safe way to build HTML elements.
// We ALWAYS use textContent (never innerHTML) so text from the database is shown
// as plain text — a dish called "<script>" can never run as code (prevents XSS).
export function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

// Names of the three dish tags. The owner can rename them (settings.tag_labels);
// the icons and colours never change. Menus saved before renaming existed have
// no tag_labels, so the default names are used.
export const DEFAULT_TAG_LABELS = { spicy: 'Spicy', veg: 'Vegetarian', special: 'Chef\'s special' };

export function tagLabels(settings) {
  const saved = (settings && settings.tag_labels) || {};
  const labels = {};
  Object.keys(DEFAULT_TAG_LABELS).forEach((key) => {
    const name = typeof saved[key] === 'string' ? saved[key].trim() : '';
    labels[key] = name || DEFAULT_TAG_LABELS[key];
  });
  return labels;
}

// Remove everything inside an element. (Same as element.replaceChildren(),
// which older phones — Chrome before 86, Safari before 14 — don't have.)
export function clearElement(element) {
  element.textContent = '';
}

// localStorage can be unavailable (private mode, full storage, blocked),
// so every read/write is wrapped in try/catch and fails quietly.
export function storageGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
}
