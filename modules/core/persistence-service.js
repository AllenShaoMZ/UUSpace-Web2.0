export const STORAGE_PREFIX = "uuspace.web2.v1.";

function cloneValue(value) {
  if (value == null) return value;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function getDefaultStorage() {
  if (typeof localStorage !== "undefined") return localStorage;
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/**
 * @param {Storage | { getItem: Function, setItem: Function }} [storage]
 */
export function createPersistenceService(storage = getDefaultStorage()) {
  const debounceTimers = new Map();
  const debouncePending = new Map();

  function storageKey(namespace) {
    return `${STORAGE_PREFIX}${namespace}`;
  }

  function load(namespace, fallback = null) {
    try {
      const raw = storage.getItem(storageKey(namespace));
      if (raw == null || raw === "") return cloneValue(fallback);
      return JSON.parse(raw);
    } catch {
      return cloneValue(fallback);
    }
  }

  function save(namespace, data) {
    storage.setItem(storageKey(namespace), JSON.stringify(data));
  }

  function debounceSave(namespace, dataOrFn, delayMs = 300) {
    const timerKey = storageKey(namespace);
    debouncePending.set(timerKey, dataOrFn);
    if (debounceTimers.has(timerKey)) {
      clearTimeout(debounceTimers.get(timerKey));
    }
    debounceTimers.set(
      timerKey,
      setTimeout(() => {
        debounceTimers.delete(timerKey);
        const pending = debouncePending.get(timerKey);
        debouncePending.delete(timerKey);
        const data = typeof pending === "function" ? pending() : pending;
        save(namespace, data);
      }, delayMs),
    );
  }

  function flushDebounce(namespace) {
    const timerKey = storageKey(namespace);
    const pending = debouncePending.get(timerKey);
    if (!pending && !debounceTimers.has(timerKey)) return;
    if (debounceTimers.has(timerKey)) {
      clearTimeout(debounceTimers.get(timerKey));
      debounceTimers.delete(timerKey);
    }
    debouncePending.delete(timerKey);
    if (pending == null) return;
    const data = typeof pending === "function" ? pending() : pending;
    save(namespace, data);
  }

  return { storageKey, load, save, debounceSave, flushDebounce };
}
