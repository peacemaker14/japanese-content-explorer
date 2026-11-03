import { normalizeJapaneseReading } from "./japanese-reading";
import type { JapaneseDictionaryEntry } from "./japanese-tools-types";

/** Lossless Japanese forms/restrictions and complete English senses from the pinned source. */
export type JapaneseDictionaryWord = {
  id: string;
  kanji: string[];
  kana: { text: string; appliesToKanji: string[] }[];
  sense: { appliesToKanji: string[]; appliesToKana: string[]; meanings: string[] }[];
};
export type JapaneseDictionaryAsset = {
  schemaVersion: number;
  release: string;
  dictDate: string;
  words: JapaneseDictionaryWord[];
};
export type JapaneseDictionaryIndex = Map<string, number | number[]>;

/** Index exact Japanese forms, never English glosses, regexes or sentence prefixes. */
export function indexJapaneseDictionaryWord(index: JapaneseDictionaryIndex, word: JapaneseDictionaryWord, offset: number): void {
  for (const form of new Set([...word.kanji, ...word.kana.map((reading) => reading.text)])) {
    const previous = index.get(form);
    if (previous === undefined) index.set(form, offset);
    else if (typeof previous === "number") index.set(form, [previous, offset]);
    else previous.push(offset);
  }
}

export function projectJapaneseDictionary(
  words: readonly JapaneseDictionaryWord[], lookup: string, readingHint: string | null,
): JapaneseDictionaryEntry[] {
  const entries: JapaneseDictionaryEntry[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    const spellingMatch = word.kanji.includes(lookup);
    for (const kana of word.kana) {
      if (spellingMatch) {
        // An empty appliesToKanji array means kana-only, NOT unrestricted.
        if (!kana.appliesToKanji.includes("*") && !kana.appliesToKanji.includes(lookup)) continue;
      } else if (kana.text !== lookup) continue;
      const headwords = spellingMatch ? [lookup]
        : word.kanji.filter((form) => kana.appliesToKanji.includes("*") || kana.appliesToKanji.includes(form));
      if (!headwords.length) headwords.push(kana.text);
      for (const headword of headwords) {
        const meanings: string[] = [];
        for (const sense of word.sense) {
          if (!sense.appliesToKanji.includes("*") && !sense.appliesToKanji.includes(headword)) continue;
          if (!sense.appliesToKana.includes("*") && !sense.appliesToKana.includes(kana.text)) continue;
          for (const meaning of sense.meanings) if (!meanings.includes(meaning)) meanings.push(meaning);
        }
        if (!meanings.length) continue;
        const identity = JSON.stringify([headword, kana.text, meanings]);
        if (!seen.has(identity)) {
          seen.add(identity);
          entries.push({ headword, reading: kana.text, meanings });
        }
      }
    }
  }
  // A trustworthy surface reading disambiguates homographs, but never invents a match.
  const matching = readingHint ? entries.filter((entry) => normalizeJapaneseReading(entry.reading) === readingHint) : [];
  return matching.length ? matching : entries;
}
