export const READING_PREFERENCES_KEY = "yorimichi.reader.v1";

export interface ReadingPreferences {
  furigana: boolean;
  romaji: boolean;
}

export interface ReadingPreferenceSnapshot extends ReadingPreferences {
  storageWarning: boolean;
}

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
const defaults: ReadingPreferenceSnapshot = {
  furigana: false,
  romaji: false,
  storageWarning: false,
};

export function parseReadingPreferences(raw: string | null): ReadingPreferences {
  if (raw) {
    try {
      const value: unknown = JSON.parse(raw);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const preferences = value as Record<string, unknown>;
        return {
          furigana: preferences.furigana === true,
          romaji: preferences.romaji === true,
        };
      }
    } catch { /* Corrupt preferences are not transcript data; start with both off. */ }
  }
  return { furigana: false, romaji: false };
}

export function createReadingPreferenceStore(storage: () => PreferenceStorage | null) {
  let snapshot = defaults;
  let loaded = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  function refresh() {
    try {
      const target = storage();
      snapshot = {
        ...parseReadingPreferences(target?.getItem(READING_PREFERENCES_KEY) ?? null),
        storageWarning: target === null,
      };
    } catch {
      snapshot = { ...snapshot, storageWarning: true };
    }
    loaded = true;
    emit();
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => defaults,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!loaded) refresh();
      return () => { listeners.delete(listener); };
    },
    refresh,
    set(name: keyof ReadingPreferences, enabled: boolean) {
      if (!loaded) refresh();
      const next = { ...snapshot, [name]: enabled };
      try {
        const target = storage();
        if (!target) throw new Error("Storage unavailable");
        target.setItem(READING_PREFERENCES_KEY, JSON.stringify({
          furigana: next.furigana,
          romaji: next.romaji,
        }));
        next.storageWarning = false;
      } catch {
        next.storageWarning = true;
      }
      snapshot = next;
      emit();
    },
  };
}

export const readingPreferenceStore = createReadingPreferenceStore(
  () => typeof window === "undefined" ? null : window.localStorage,
);
