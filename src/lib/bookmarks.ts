export const BOOKMARK_STORAGE_KEY = "yorimichi.saved.v1";
const youtubeIdPattern = /^[A-Za-z0-9_-]{11}$/;

export type BookmarkSnapshot = {
  ids: readonly string[];
  hydrated: boolean;
  error: string | null;
};
type BookmarkStorage = Pick<Storage, "getItem" | "setItem">;
export type BookmarkResult =
  | { ok: true; saved: boolean; message: string }
  | { ok: false; message: string };

const initialSnapshot: BookmarkSnapshot = {
  ids: [],
  hydrated: false,
  error: null,
};

function readIds(storage: BookmarkStorage): string[] {
  const raw = storage.getItem(BOOKMARK_STORAGE_KEY);
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string" && youtubeIdPattern.test(id))) {
    throw new Error("Invalid saved video data");
  }
  return [...new Set<string>(value)];
}

/** Only video IDs are persisted. Failed writes never update the saved state. */
export function createBookmarkStore(
  getStorage: () => BookmarkStorage,
  listen?: (refresh: () => void) => () => void,
) {
  let snapshot = initialSnapshot;
  const subscribers = new Set<() => void>();
  let stopListening: (() => void) | undefined;

  function publish(ids: readonly string[], error: string | null) {
    const sameIds = ids.length === snapshot.ids.length && ids.every((id, index) => id === snapshot.ids[index]);
    if (snapshot.hydrated && sameIds && error === snapshot.error) return;
    snapshot = { ids: sameIds ? snapshot.ids : ids, hydrated: true, error };
    subscribers.forEach((subscriber) => subscriber());
  }

  function refresh() {
    try {
      publish(readIds(getStorage()), null);
    } catch {
      publish(snapshot.ids, "Saved videos could not be read from this browser. Check browser storage permissions and retry.");
    }
  }

  function toggle(youtubeId: string): BookmarkResult {
    if (!youtubeIdPattern.test(youtubeId)) {
      return { ok: false, message: "This video could not be saved because its ID is invalid." };
    }
    let storage: BookmarkStorage;
    let ids: string[];
    try {
      storage = getStorage();
      // Read again before every mutation so another tab's saves are retained.
      ids = readIds(storage);
    } catch {
      const message = "Saved videos could not be read. Nothing was changed. Check browser storage permissions and retry.";
      publish(snapshot.ids, message);
      return { ok: false, message };
    }
    const saved = !ids.includes(youtubeId);
    const next = saved ? [youtubeId, ...ids] : ids.filter((id) => id !== youtubeId);
    try {
      storage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(next));
    } catch {
      const message = "Your change could not be stored in this browser. Nothing was changed. Free storage or allow browser storage, then retry.";
      publish(ids, message);
      return { ok: false, message };
    }
    publish(next, null);
    return { ok: true, saved, message: saved ? "Saved in this browser." : "Removed from saved videos." };
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    subscribe(subscriber: () => void) {
      subscribers.add(subscriber);
      if (subscribers.size === 1) {
        stopListening = listen?.(refresh);
        refresh();
      }
      return () => {
        subscribers.delete(subscriber);
        if (subscribers.size === 0) {
          stopListening?.();
          stopListening = undefined;
        }
      };
    },
    refresh,
    toggle,
  };
}

export const bookmarkStore = createBookmarkStore(
  () => window.localStorage,
  (refresh) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === BOOKMARK_STORAGE_KEY || event.key === null) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  },
);
