import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPersonalTranscript,
  removePersonalTranscript,
  savePersonalTranscript,
} from "./personal-transcript-store";
import type { PersonalTranscript } from "./personal-transcript";

const videoId = "abcdefghijk";
const transcript: PersonalTranscript = {
  videoId, source: "whisper", visibility: "private", sharingPermission: "unknown",
  segments: [{ start: 0, end: 2, text: "日本語" }],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Event-shaped IDB test double; production operations still wait for commit. */
function memoryBrowser() {
  const records = new Map<string, unknown>();
  const close = vi.fn();
  const transactions: string[] = [];
  let writeError: DOMException | null = null;
  const db = {
    close,
    transaction: (_store: string, mode: string) => {
      transactions.push(mode);
      const transaction = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        error: null as DOMException | null,
        abort: () => queueMicrotask(() => transaction.onabort?.()),
        objectStore: () => {
          function request(operation: () => unknown) {
            const result = { result: undefined as unknown, onsuccess: null as (() => void) | null };
            queueMicrotask(() => {
              if (mode === "readwrite" && writeError) {
                transaction.error = writeError;
                transaction.onerror?.();
                return;
              }
              result.result = operation();
              result.onsuccess?.();
              transaction.oncomplete?.();
            });
            return result;
          }
          return {
            get: (id: string) => request(() => records.get(id)),
            put: (value: PersonalTranscript) => request(() => {
              records.set(value.videoId, structuredClone(value));
              return value.videoId;
            }),
            delete: (id: string) => request(() => { records.delete(id); }),
          };
        },
      };
      return transaction;
    },
  };
  vi.stubGlobal("window", { indexedDB: {
    open: () => {
      const request = { result: db, onsuccess: null as (() => void) | null };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  } });
  return { records, close, transactions, failWrites: () => { writeError = new DOMException("full", "QuotaExceededError"); } };
}

describe("private browser transcript persistence", () => {
  it("saves/restores per video, never uploads, and deletes only the requested copy", async () => {
    const { records, close, transactions } = memoryBrowser();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await loadPersonalTranscript(videoId)).toBeNull();
    await savePersonalTranscript(transcript);
    await savePersonalTranscript({ ...transcript, videoId: "zzzzzzzzzzz" });
    expect(await loadPersonalTranscript(videoId)).toEqual(transcript);
    await removePersonalTranscript(videoId);
    expect(await loadPersonalTranscript(videoId)).toBeNull();
    expect(records.has("zzzzzzzzzzz")).toBe(true);
    expect(close).toHaveBeenCalledTimes(6);
    expect(transactions).toEqual(["readonly", "readwrite", "readwrite", "readonly", "readwrite", "readonly"]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("revalidates stored identity/rights instead of trusting browser records", async () => {
    const { records } = memoryBrowser();
    records.set(videoId, { ...transcript, visibility: "public", sharingPermission: "granted", permissionNote: "ignored" });
    expect(await loadPersonalTranscript(videoId)).toEqual(transcript);
    records.set(videoId, { ...transcript, videoId: "zzzzzzzzzzz" });
    await expect(loadPersonalTranscript(videoId)).rejects.toThrow(/unreadable/);
    await removePersonalTranscript(videoId);
    expect(await loadPersonalTranscript(videoId)).toBeNull();
  });

  it("does not claim success when browser storage is full", async () => {
    const { failWrites, records, close } = memoryBrowser();
    failWrites();
    await expect(savePersonalTranscript(transcript)).rejects.toThrow(/storage is full/);
    expect(records.size).toBe(0);
    expect(close).toHaveBeenCalledOnce();
  });

  it("reports unavailable/denied browser storage honestly", async () => {
    vi.stubGlobal("window", {});
    await expect(loadPersonalTranscript(videoId)).rejects.toThrow(/unavailable or blocked/);
    vi.stubGlobal("window", { indexedDB: { open: () => { throw new DOMException("denied", "SecurityError"); } } });
    await expect(savePersonalTranscript(transcript)).rejects.toThrow(/unavailable or blocked/);
  });

  it("rejects a blocked open and closes any late connection", async () => {
    const close = vi.fn();
    const request = {
      result: { close },
      onblocked: null as (() => void) | null,
      onsuccess: null as (() => void) | null,
    };
    vi.stubGlobal("window", { indexedDB: { open: () => request } });
    const pending = loadPersonalTranscript(videoId);
    const rejection = expect(pending).rejects.toThrow(/another tab/);
    request.onblocked?.();
    await rejection;
    request.onsuccess?.();
    expect(close).toHaveBeenCalledOnce();
  });
});
