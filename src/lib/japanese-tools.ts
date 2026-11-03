import source from "./japanese-language-source.json";
import { validateJapaneseSpan } from "./japanese-fallback";
import type {
  JapaneseLookupResult, JapaneseToken, JapaneseWordQuery,
  JapaneseWorkerRequest, JapaneseWorkerResponse,
} from "./japanese-tools-types";

export { fallbackJapaneseTokens } from "./japanese-fallback";
export const JAPANESE_DICTIONARY_ATTRIBUTION = {
  name: "JMdict / EDRDG",
  version: source.jmdict.release,
  license: "CC BY-SA 4.0",
  licenseUrl: source.jmdict.licenseUrl,
  attributionUrl: source.jmdict.attributionUrl,
} as const;

let worker: Worker | null = null;
let nextRequestId = 0;
type Pending = {
  resolve: (value: JapaneseToken[][] | JapaneseLookupResult) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};
const pending = new Map<number, Pending>();

function failWorker(error: Error): void {
  worker?.terminate();
  worker = null;
  for (const job of pending.values()) {
    job.cleanup();
    job.reject(error);
  }
  pending.clear();
}

/** Releases tokenizer, dictionary and in-flight private text; the next activation loads anew. */
export function resetJapaneseTools(): void {
  failWorker(new DOMException("Japanese tools were reset.", "AbortError"));
}

function activateWorker(): Worker {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    throw new Error("Japanese reading tools require a browser with Web Worker support.");
  }
  if (worker) return worker;
  const active = new Worker(`/language/${source.assetVersion}/worker.js`, { name: "yorimichi-japanese" });
  active.onmessage = (event: MessageEvent<JapaneseWorkerResponse>) => {
    if (active !== worker) return;
    const message = event.data;
    const job = pending.get(message.id);
    if (!job) return;
    pending.delete(message.id);
    job.cleanup();
    if (message.kind === "error") job.reject(new Error(message.message));
    else job.resolve(message.result);
  };
  active.onerror = (event) => {
    event.preventDefault();
    if (active === worker) failWorker(new Error("Japanese tools could not load. Check your connection and retry."));
  };
  active.onmessageerror = () => {
    if (active === worker) failWorker(new Error("Japanese tools returned an unreadable response. Please retry."));
  };
  worker = active;
  return active;
}

function request(message: JapaneseWorkerRequest, signal?: AbortSignal): Promise<JapaneseToken[][] | JapaneseLookupResult> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  let active: Worker;
  try { active = activateWorker(); }
  catch (error) { return Promise.reject(error); }
  return new Promise((resolve, reject) => {
    const abort = () => {
      const job = pending.get(message.id);
      if (!job) return;
      pending.delete(message.id);
      job.cleanup();
      reject(new DOMException("Aborted", "AbortError"));
      active.postMessage({ id: message.id, kind: "cancel" } satisfies JapaneseWorkerRequest);
      // With no other consumer, termination also cancels downloads/analysis immediately.
      if (!pending.size && worker === active) {
        active.terminate();
        worker = null;
      }
    };
    const timer = setTimeout(() => {
      if (worker === active) failWorker(new Error("Japanese tools took too long to load. Please retry."));
    }, 120_000);
    pending.set(message.id, {
      resolve, reject,
      cleanup: () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); },
    });
    signal?.addEventListener("abort", abort, { once: true });
    try { active.postMessage(message); }
    catch { failWorker(new Error("Japanese tools could not start. Please retry.")); }
  });
}

export async function analyzeJapanese(texts: readonly string[], signal?: AbortSignal): Promise<JapaneseToken[][]> {
  if (!texts.length) return [];
  return await request({ id: ++nextRequestId, kind: "analyze", texts: [...texts] }, signal) as JapaneseToken[][];
}

export async function lookupJapanese(query: JapaneseWordQuery, signal?: AbortSignal): Promise<JapaneseLookupResult> {
  validateJapaneseSpan(query.text, query.start, query.end);
  return await request({ id: ++nextRequestId, kind: "lookup", query }, signal) as JapaneseLookupResult;
}
