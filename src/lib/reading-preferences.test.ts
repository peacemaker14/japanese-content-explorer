import { describe, expect, it } from "vitest";
import { createReadingPreferenceStore, parseReadingPreferences, READING_PREFERENCES_KEY } from "./reading-preferences";

describe("local reading preferences", () => {
  it("defaults independently off and ignores corrupt or unknown values", () => {
    for (const value of [null, "broken", "null", "[]", '{"furigana":"yes","romaji":1}'])
      expect(parseReadingPreferences(value)).toEqual({ furigana: false, romaji: false });
    expect(parseReadingPreferences('{"furigana":true,"romaji":false,"text":"private"}'))
      .toEqual({ furigana: true, romaji: false });
  });

  it("restores only after subscribing and persists each toggle without changing the other", () => {
    let saved = '{"furigana":true,"romaji":false}';
    const writes: string[] = [];
    const store = createReadingPreferenceStore(() => ({
      getItem: (key) => key === READING_PREFERENCES_KEY ? saved : null,
      setItem: (key, value) => {
        expect(key).toBe(READING_PREFERENCES_KEY);
        saved = value;
        writes.push(value);
      },
    }));
    expect(store.getServerSnapshot()).toEqual({ furigana: false, romaji: false, storageWarning: false });
    expect(store.getSnapshot().furigana).toBe(false);
    const unsubscribe = store.subscribe(() => {});
    expect(store.getSnapshot().furigana).toBe(true);
    store.set("romaji", true);
    expect(store.getSnapshot()).toEqual({ furigana: true, romaji: true, storageWarning: false });
    store.set("furigana", false);
    expect(store.getSnapshot()).toEqual({ furigana: false, romaji: true, storageWarning: false });
    expect(writes.map((value) => JSON.parse(value))).toEqual([
      { furigana: true, romaji: true },
      { furigana: false, romaji: true },
    ]);
    unsubscribe();
  });

  it("keeps both controls functional when browser storage throws", () => {
    const store = createReadingPreferenceStore(() => { throw new Error("Blocked"); });
    const unsubscribe = store.subscribe(() => {});
    expect(store.getSnapshot().storageWarning).toBe(true);
    store.set("furigana", true);
    store.set("romaji", true);
    expect(store.getSnapshot()).toEqual({ furigana: true, romaji: true, storageWarning: true });
    store.set("romaji", false);
    expect(store.getSnapshot().furigana).toBe(true);
    expect(store.getSnapshot().romaji).toBe(false);
    unsubscribe();
  });
});
