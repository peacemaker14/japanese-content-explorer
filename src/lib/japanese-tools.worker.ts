import kuromoji from "kuromoji/build/kuromoji.js";
import type { IpadicFeatures, Tokenizer } from "kuromoji";
import source from "./japanese-language-source.json";
import { buildJapaneseTokens, japaneseLookupForms } from "./japanese-reading";
import { indexJapaneseDictionaryWord, projectJapaneseDictionary } from "./japanese-dictionary";
import type { JapaneseDictionaryAsset, JapaneseDictionaryIndex } from "./japanese-dictionary";
import type { JapaneseWorkerRequest, JapaneseWorkerResponse, JapaneseLookupResult, JapaneseToken } from "./japanese-tools-types";

// Built as a classic, self-contained browser worker by language:prepare, never imported by React.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<JapaneseWorkerRequest>) => void) | null;
  postMessage: (message: JapaneseWorkerResponse) => void;
};
const root = `/language/${source.assetVersion}`;
let tokenizerPromise: Promise<Tokenizer<IpadicFeatures>> | null = null;
let dictionaryPromise: Promise<{ data: JapaneseDictionaryAsset; index: JapaneseDictionaryIndex }> | null = null;
const cancelled = new Set<number>();
const active = new Set<number>();

function getTokenizer(): Promise<Tokenizer<IpadicFeatures>> {
  if (tokenizerPromise) return tokenizerPromise;
  // Constructor form keeps the worker compatible with browsers without Promise.withResolvers.
  tokenizerPromise = new Promise<Tokenizer<IpadicFeatures>>((resolve, reject) => {
    kuromoji.builder({ dicPath: `${root}/ipadic/` }).build((error, tokenizer) => {
      if (error) reject(new Error("Japanese readings could not load. Check your connection and retry."));
      else resolve(tokenizer);
    });
  }).catch((error: unknown) => { tokenizerPromise = null; throw error; });
  return tokenizerPromise;
}

async function getDictionary(): Promise<{ data: JapaneseDictionaryAsset; index: JapaneseDictionaryIndex }> {
  if (dictionaryPromise) return dictionaryPromise;
  dictionaryPromise = (async () => {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("The local dictionary requires a browser with gzip decompression support.");
    }
    const manifestResponse = await fetch(`${root}/manifest.json`, { credentials: "omit", referrerPolicy: "no-referrer" });
    if (!manifestResponse.ok) throw new Error("The local dictionary manifest could not load. Please retry.");
    const manifest = await manifestResponse.json() as {
      assetVersion: string; dictionary: { sha256: string; entries: number };
    };
    if (manifest.assetVersion !== source.assetVersion || !/^[a-f0-9]{64}$/u.test(manifest.dictionary?.sha256)) {
      throw new Error("The local dictionary version is invalid. Please retry after reloading.");
    }
    // Always the same full asset. No word, prefix, hash, cue or text-derived selector goes on the network.
    const response = await fetch(`${root}/dictionary.json.gz`, { credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error("The full local dictionary could not load. Check your connection and retry.");
    const compressed = await response.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", compressed);
    const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (actual !== manifest.dictionary.sha256) throw new Error("The local dictionary failed its integrity check. Please retry.");
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    const data = await new Response(stream).json() as JapaneseDictionaryAsset;
    if (data.schemaVersion !== source.schemaVersion || data.release !== source.jmdict.release
      || !Array.isArray(data.words) || data.words.length !== manifest.dictionary.entries) {
      throw new Error("The local dictionary data is incomplete or incompatible.");
    }
    const index: JapaneseDictionaryIndex = new Map();
    for (let offset = 0; offset < data.words.length; offset++) {
      indexJapaneseDictionaryWord(index, data.words[offset], offset);
      if (offset % 2048 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return { data, index };
  })().catch((error: unknown) => { dictionaryPromise = null; throw error; });
  return dictionaryPromise;
}

async function run(message: Exclude<JapaneseWorkerRequest, { kind: "cancel" }>): Promise<void> {
  active.add(message.id);
  try {
    const tokenizer = await getTokenizer();
    if (cancelled.has(message.id)) return;
    if (message.kind === "analyze") {
      const result: JapaneseToken[][] = [];
      for (const text of message.texts) {
        if (cancelled.has(message.id)) return;
        result.push(buildJapaneseTokens(text, tokenizer.tokenize(text)));
        // Let cancellation/other jobs run between cues; playback never runs on this thread.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      if (!cancelled.has(message.id)) scope.postMessage({ id: message.id, kind: "analyze", result });
    } else {
      const forms = japaneseLookupForms(message.query, tokenizer.tokenize(message.query.text));
      const { data, index } = await getDictionary();
      if (cancelled.has(message.id)) return;
      let lookup = forms.surface;
      let entries: JapaneseLookupResult["entries"] = [];
      for (const candidate of [forms.surface, ...forms.lemmas]) {
        const offsets = index.get(candidate);
        const words = offsets === undefined ? [] : (typeof offsets === "number" ? [offsets] : offsets).map((offset) => data.words[offset]);
        // The inflected surface's reading is not a reading hint for its dictionary form.
        entries = projectJapaneseDictionary(words, candidate, candidate === forms.surface ? forms.reading : null);
        if (entries.length) { lookup = candidate; break; }
      }
      const result: JapaneseLookupResult = {
        surface: forms.surface, lookup, reading: forms.reading, romaji: forms.romaji, entries, source: "JMdict",
      };
      if (!cancelled.has(message.id)) scope.postMessage({ id: message.id, kind: "lookup", result });
    }
  } catch (error) {
    if (!cancelled.has(message.id)) scope.postMessage({
      id: message.id, kind: "error",
      message: error instanceof Error ? error.message : "Japanese tools could not load. Please retry.",
    });
  } finally {
    active.delete(message.id);
    cancelled.delete(message.id);
  }
}

scope.onmessage = (event) => {
  const message = event.data;
  if (message.kind === "cancel") {
    if (active.has(message.id)) cancelled.add(message.id);
    return;
  }
  void run(message);
};
