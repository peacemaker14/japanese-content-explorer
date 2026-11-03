export type JapaneseToken = {
  surface: string;
  /** UTF-16 offsets into the original, unmodified cue. */
  start: number;
  end: number;
  reading: string | null;
  romaji: string | null;
  lemma: string | null;
  lexical: boolean;
};

export type JapaneseWordQuery = { text: string; start: number; end: number };
export type JapaneseDictionaryEntry = { headword: string; reading: string; meanings: string[] };
export type JapaneseLookupResult = {
  surface: string;
  lookup: string;
  reading: string | null;
  romaji: string | null;
  entries: JapaneseDictionaryEntry[];
  source: "JMdict";
};

export type JapaneseWorkerRequest =
  | { id: number; kind: "analyze"; texts: string[] }
  | { id: number; kind: "lookup"; query: JapaneseWordQuery }
  | { id: number; kind: "cancel" };
export type JapaneseWorkerResponse =
  | { id: number; kind: "analyze"; result: JapaneseToken[][] }
  | { id: number; kind: "lookup"; result: JapaneseLookupResult }
  | { id: number; kind: "error"; message: string };
