import { describe, expect, it, vi } from "vitest";
import { BOOKMARK_STORAGE_KEY, createBookmarkStore } from "./bookmarks";

const first = "abcdefghijk";
const second = "lmnopqrstuv";

function storageFixture(initial: string | null = null) {
  let value = initial;
  const storage = {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => { value = next; }),
  };
  return { storage, read: () => value, externalWrite: (next: string | null) => { value = next; } };
}

describe("browser-local bookmarks", () => {
  it("has stable empty server and initial snapshots before hydration", () => {
    const { storage } = storageFixture(JSON.stringify([first]));
    const store = createBookmarkStore(() => storage);
    expect(store.getSnapshot()).toBe(store.getServerSnapshot());
    expect(store.getSnapshot()).toEqual({ ids: [], hydrated: false, error: null });
    expect(storage.getItem).not.toHaveBeenCalled();
    store.subscribe(() => {});
    expect(store.getSnapshot()).toEqual({ ids: [first], hydrated: true, error: null });
    expect(store.getServerSnapshot()).toEqual({ ids: [], hydrated: false, error: null });
  });

  it("persists only IDs, restores on reload, and removes a saved ID", () => {
    const fixture = storageFixture();
    const store = createBookmarkStore(() => fixture.storage);
    const changes = vi.fn();
    store.subscribe(changes);
    expect(store.toggle(first)).toMatchObject({ ok: true, saved: true });
    expect(fixture.read()).toBe(JSON.stringify([first]));
    expect(fixture.storage.setItem).toHaveBeenCalledWith(BOOKMARK_STORAGE_KEY, JSON.stringify([first]));
    const reloaded = createBookmarkStore(() => fixture.storage);
    reloaded.refresh();
    expect(reloaded.getSnapshot().ids).toEqual([first]);
    expect(reloaded.toggle(first)).toMatchObject({ ok: true, saved: false });
    expect(fixture.read()).toBe("[]");
    expect(reloaded.getSnapshot().ids).toEqual([]);
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it("notifies same-page subscribers and refreshes across tabs including storage clear", () => {
    const fixture = storageFixture();
    let onExternalChange = () => {};
    const stop = vi.fn();
    const store = createBookmarkStore(() => fixture.storage, (refresh) => {
      onExternalChange = refresh;
      return stop;
    });
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const unsubscribeFirst = store.subscribe(firstListener);
    const unsubscribeSecond = store.subscribe(secondListener);
    store.toggle(first);
    expect(firstListener).toHaveBeenCalledTimes(2);
    expect(secondListener).toHaveBeenCalledTimes(1);
    fixture.externalWrite(JSON.stringify([second]));
    onExternalChange();
    expect(store.getSnapshot().ids).toEqual([second]);
    expect(secondListener).toHaveBeenCalledTimes(2);
    fixture.externalWrite(null);
    onExternalChange();
    expect(store.getSnapshot().ids).toEqual([]);
    unsubscribeFirst();
    expect(stop).not.toHaveBeenCalled();
    unsubscribeSecond();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("reads the latest persisted IDs before a mutation and catches changes while unsubscribed", () => {
    const fixture = storageFixture();
    const store = createBookmarkStore(() => fixture.storage);
    const unsubscribe = store.subscribe(() => {});
    fixture.externalWrite(JSON.stringify([second]));
    store.toggle(first);
    expect(store.getSnapshot().ids).toEqual([first, second]);
    unsubscribe();
    fixture.externalWrite(JSON.stringify([second]));
    store.subscribe(() => {});
    expect(store.getSnapshot().ids).toEqual([second]);
  });

  it("does not report success or change persisted state when writes fail", () => {
    const fixture = storageFixture(JSON.stringify([first]));
    fixture.storage.setItem.mockImplementation(() => { throw new Error("QuotaExceededError"); });
    const store = createBookmarkStore(() => fixture.storage);
    store.refresh();
    expect(store.toggle(first)).toMatchObject({ ok: false });
    expect(store.getSnapshot().ids).toEqual([first]);
    expect(store.getSnapshot().error).toContain("Nothing was changed");
    expect(fixture.read()).toBe(JSON.stringify([first]));
    fixture.storage.setItem.mockImplementation((_key, next) => fixture.externalWrite(next));
    expect(store.toggle(second)).toMatchObject({ ok: true, saved: true });
    expect(store.getSnapshot().ids).toEqual([second, first]);
    expect(store.getSnapshot().error).toBeNull();
  });

  it("handles blocked reads without claiming there are no saved videos and can retry", () => {
    const fixture = storageFixture(JSON.stringify([first]));
    let blocked = true;
    const store = createBookmarkStore(() => {
      if (blocked) throw new Error("SecurityError");
      return fixture.storage;
    });
    store.refresh();
    expect(store.getSnapshot().hydrated).toBe(true);
    expect(store.getSnapshot().error).toContain("could not be read");
    expect(store.toggle(second).ok).toBe(false);
    expect(fixture.storage.setItem).not.toHaveBeenCalled();
    blocked = false;
    store.refresh();
    expect(store.getSnapshot()).toEqual({ ids: [first], hydrated: true, error: null });
  });

  it("does not overwrite corrupt or non-ID stored data", () => {
    for (const raw of ["{bad json", JSON.stringify({ ids: [first] }), JSON.stringify([first, { text: "private transcript" }]), JSON.stringify(["invalid-id"])]) {
      const fixture = storageFixture(raw);
      const store = createBookmarkStore(() => fixture.storage);
      store.refresh();
      expect(store.getSnapshot().error).not.toBeNull();
      expect(store.toggle(second).ok).toBe(false);
      expect(fixture.storage.setItem).not.toHaveBeenCalled();
      expect(fixture.read()).toBe(raw);
    }
  });

  it("deduplicates valid stored IDs and rejects invalid mutation IDs", () => {
    const fixture = storageFixture(JSON.stringify([first, first, second]));
    const store = createBookmarkStore(() => fixture.storage);
    store.refresh();
    expect(store.getSnapshot().ids).toEqual([first, second]);
    expect(store.toggle("bad").ok).toBe(false);
    expect(fixture.storage.setItem).not.toHaveBeenCalled();
  });
});
