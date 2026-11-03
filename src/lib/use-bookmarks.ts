"use client";

import { useSyncExternalStore } from "react";
import { bookmarkStore } from "./bookmarks";

export function useBookmarks() {
  const snapshot = useSyncExternalStore(
    bookmarkStore.subscribe,
    bookmarkStore.getSnapshot,
    bookmarkStore.getServerSnapshot,
  );
  return { ...snapshot, toggle: bookmarkStore.toggle, retry: bookmarkStore.refresh };
}
