"use client";

import { useEffect, useSyncExternalStore } from "react";
import { READING_PREFERENCES_KEY, readingPreferenceStore } from "./reading-preferences";

export function useReadingPreferences() {
  const snapshot = useSyncExternalStore(
    readingPreferenceStore.subscribe,
    readingPreferenceStore.getSnapshot,
    readingPreferenceStore.getServerSnapshot,
  );
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === READING_PREFERENCES_KEY || event.key === null)
        readingPreferenceStore.refresh();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return { ...snapshot, set: readingPreferenceStore.set };
}
