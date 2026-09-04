type BrowserStorageName = "localStorage" | "sessionStorage";

const volatileValues = new Map<string, string>();
const removedKeys = new Set<string>();

function browserStorage(name: BrowserStorageName): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window[name];
  } catch {
    return null;
  }
}

function readFrom(storage: Storage | null, key: string): string | null {
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function readStoredValue(key: string): string {
  if (removedKeys.has(key)) {
    return volatileValues.get(key) ?? "";
  }
  for (const name of ["localStorage", "sessionStorage"] as const) {
    const value = readFrom(browserStorage(name), key);
    if (value !== null) {
      volatileValues.set(key, value);
      return value;
    }
  }
  return volatileValues.get(key) ?? "";
}

export function writeStoredValue(key: string, value: string): boolean {
  volatileValues.set(key, value);
  removedKeys.delete(key);
  let persistentWriteSucceeded = false;
  for (const name of ["localStorage", "sessionStorage"] as const) {
    const storage = browserStorage(name);
    if (!storage) {
      continue;
    }
    try {
      storage.setItem(key, value);
      if (name === "localStorage") {
        persistentWriteSucceeded = true;
      }
    } catch {
      // The in-memory value keeps the current page usable.
    }
  }
  return persistentWriteSucceeded;
}

export function removeStoredValue(key: string): void {
  volatileValues.delete(key);
  removedKeys.add(key);
  for (const name of ["localStorage", "sessionStorage"] as const) {
    const storage = browserStorage(name);
    if (!storage) {
      continue;
    }
    try {
      storage.removeItem(key);
    } catch {
      // A blocked store must not prevent credentials being cleared elsewhere.
    }
  }
}

export function hasPersistentBrowserStorage(): boolean {
  const storage = browserStorage("localStorage");
  if (!storage) {
    return false;
  }
  const probeKey = `__sise_storage_probe_${Math.random().toString(36).slice(2)}`;
  try {
    storage.setItem(probeKey, "1");
    return storage.getItem(probeKey) === "1";
  } catch {
    return false;
  } finally {
    try {
      storage.removeItem(probeKey);
    } catch {
      // The probe is unique and contains no player data.
    }
  }
}

/**
 * Some browser SDK constructors synchronously probe Web Storage without
 * catching method-level SecurityError. Guard only that synchronous boundary,
 * then restore the browser methods immediately.
 */
export function withSafeBrowserStorage<T>(operation: () => T): T {
  if (typeof Storage === "undefined") {
    return operation();
  }
  const prototype = Storage.prototype;
  const installed = new Map<string, PropertyDescriptor>();
  for (const methodName of ["getItem", "setItem", "removeItem"] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
    const original = prototype[methodName] as (...args: unknown[]) => unknown;
    if (!descriptor || typeof original !== "function") {
      continue;
    }
    try {
      Object.defineProperty(prototype, methodName, {
        ...descriptor,
        value(this: Storage, ...args: unknown[]) {
          try {
            return Reflect.apply(original, this, args);
          } catch {
            return methodName === "getItem" ? null : undefined;
          }
        },
      });
      installed.set(methodName, descriptor);
    } catch {
      // Some embedded browsers expose non-configurable Storage methods.
    }
  }

  try {
    return operation();
  } finally {
    for (const [methodName, descriptor] of installed) {
      try {
        Object.defineProperty(prototype, methodName, descriptor);
      } catch {
        // Leaving the guarded method is safer than breaking the active page.
      }
    }
  }
}
