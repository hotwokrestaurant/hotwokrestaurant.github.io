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

// Google Sheets can give us true / "TRUE" / "true" — treat them all the same.
export function toBool(value) {
  return value === true || String(value).trim().toUpperCase() === 'TRUE';
}

// Returns a positive number, or null if the value is blank/invalid.
export function toPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

// Lower-case and trim text so searches ignore capitals and extra spaces.
export function normalizeText(text) {
  return String(text || '').toLowerCase().trim();
}

// Safe way to build HTML elements.
// We ALWAYS use textContent (never innerHTML) so text from the sheet is shown
// as plain text — a dish called "<script>" can never run as code (prevents XSS).
export function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
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
