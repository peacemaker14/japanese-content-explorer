"use client";

import {
  parsePersonalTranscript,
  type PersonalTranscript,
} from "./personal-transcript";

const DATABASE = "yorimichi.personal-transcripts.v1";
const STORE = "transcripts";
const STORAGE_TIMEOUT_MS = 10_000;

export class PersonalTranscriptStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersonalTranscriptStorageError";
  }
}

function storageError(error?: unknown): PersonalTranscriptStorageError {
  if (error instanceof PersonalTranscriptStorageError) return error;
  if (error instanceof DOMException && error.name === "QuotaExceededError")
    return new PersonalTranscriptStorageError(
      "Browser storage is full. This personal transcript has not been saved.",
    );
  return new PersonalTranscriptStorageError(
    "Browser storage is unavailable or blocked. Personal transcripts cannot be saved or restored here.",
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(storageError());
    }, STORAGE_TIMEOUT_MS);
    function fail(error?: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(storageError(error));
    }
    try {
      if (typeof window === "undefined" || !window.indexedDB) {
        fail();
        return;
      }
      request = window.indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE))
          db.createObjectStore(STORE, { keyPath: "videoId" });
      };
      request.onblocked = () => fail(new PersonalTranscriptStorageError(
        "Personal transcript storage is blocked by another tab. Close other Yorimichi tabs, then try again.",
      ));
      request.onerror = () => fail(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (settled) {
          db.close();
          return;
        }
        settled = true;
        clearTimeout(timer);
        db.onversionchange = () => db.close();
        resolve(db);
      };
    } catch (error) {
      fail(error);
    }
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      let result: T;
      const timer = setTimeout(() => {
        try {
          transaction.abort();
        } catch {
          reject(storageError());
        }
      }, STORAGE_TIMEOUT_MS);
      transaction.oncomplete = () => {
        clearTimeout(timer);
        resolve(result);
      };
      transaction.onabort = transaction.onerror = () => {
        clearTimeout(timer);
        reject(storageError(transaction.error));
      };
      try {
        const request = operation(transaction.objectStore(STORE));
        request.onsuccess = () => { result = request.result; };
      } catch (error) {
        clearTimeout(timer);
        transaction.abort();
        reject(storageError(error));
      }
    });
  } catch (error) {
    throw storageError(error);
  } finally {
    db.close();
  }
}

export async function loadPersonalTranscript(
  videoId: string,
): Promise<PersonalTranscript | null> {
  const value: unknown = await transact("readonly", (store) => store.get(videoId));
  if (value === undefined) return null;
  try {
    // Revalidate browser records too. Old/corrupted data cannot grant rights.
    return parsePersonalTranscript(JSON.stringify(value), { videoId });
  } catch {
    throw new PersonalTranscriptStorageError(
      "The saved personal transcript is unreadable. Remove its saved copy and import the original file again.",
    );
  }
}

export async function savePersonalTranscript(
  transcript: PersonalTranscript,
): Promise<void> {
  const privateCopy = parsePersonalTranscript(JSON.stringify(transcript), {
    videoId: transcript.videoId,
  });
  await transact("readwrite", (store) => store.put(privateCopy));
}

export async function removePersonalTranscript(videoId: string): Promise<void> {
  await transact("readwrite", (store) => store.delete(videoId));
}
