export const TABLE_SEARCH_HISTORY_MAX = 8;

/**
 * @param {string[]} list
 * @param {number} [max]
 */
export function normalizeSearchHistory(list, max = TABLE_SEARCH_HISTORY_MAX) {
  const seen = new Set();
  const next = [];
  for (const item of list || []) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    next.push(value);
    if (next.length >= max) break;
  }
  return next;
}

/**
 * @param {string[]} list
 * @param {string} term
 * @param {number} [max]
 */
export function pushSearchHistory(list, term, max = TABLE_SEARCH_HISTORY_MAX) {
  const value = String(term || "").trim();
  if (!value) return normalizeSearchHistory(list, max);
  const without = (list || []).filter((item) => item !== value);
  return normalizeSearchHistory([value, ...without], max);
}

/**
 * @param {string[]} list
 * @param {string} [query]
 */
export function filterSearchHistory(list, query) {
  const items = normalizeSearchHistory(list);
  const q = String(query || "").trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => item.toLowerCase().includes(q));
}
