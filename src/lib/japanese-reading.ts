import { toHiragana, toKatakana, toRomaji } from "wanakana";
import { fallbackJapaneseTokens, validateJapaneseSpan } from "./japanese-fallback";
import type { JapaneseToken, JapaneseWordQuery } from "./japanese-tools-types";

export type JapaneseMorphFeature = {
  surface_form: string;
  word_type: string;
  reading?: string;
  basic_form?: string;
  pos?: string;
  pos_detail_1?: string;
};
type AlignedMorph = { token: JapaneseToken; feature: JapaneseMorphFeature | null };
const kana = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const lexical = /[\p{L}\p{N}]/u;
const romajiOptions = { customRomajiMapping: { "てぃ": "ti", "でぃ": "di" } };

export function normalizeJapaneseReading(value: string): string | null {
  const normalized = toHiragana(value.normalize("NFKC"));
  return kana.test(normalized) ? normalized : null;
}

export function romanizeJapaneseReading(reading: string, nextReading?: string | null): string {
  const current = toKatakana(reading);
  // Keep a split-off small tsu consistent with the next lexical token (Tombo public helper).
  if (/[っッ]$/u.test(reading) && nextReading) {
    const next = toKatakana(nextReading);
    const suffix = toRomaji(next, romajiOptions);
    if (suffix) return toRomaji(current + next, romajiOptions).slice(0, -suffix.length);
  }
  return toRomaji(current, romajiOptions);
}

function alignMorphs(text: string, features: readonly JapaneseMorphFeature[]): AlignedMorph[] {
  const aligned: AlignedMorph[] = [];
  let position = 0;
  for (const feature of features) {
    const surface = feature.surface_form;
    if (!surface) continue;
    // Kuromoji word_position counts Unicode code points and resets at punctuation.
    // Sequential exact source slices are authoritative, including supplementary characters.
    const start = text.indexOf(surface, position);
    if (start < 0) throw new Error("Japanese tokenizer did not preserve the original text.");
    if (start > position) {
      for (const token of fallbackJapaneseTokens(text.slice(position, start))) {
        aligned.push({ token: { ...token, start: token.start + position, end: token.end + position }, feature: null });
      }
    }
    const known = feature.word_type === "KNOWN";
    const reading = japanese.test(surface)
      ? (known && feature.reading ? normalizeJapaneseReading(feature.reading) : null)
        ?? (kana.test(surface.normalize("NFKC")) ? normalizeJapaneseReading(surface) : null)
      : null;
    const lemma = known && feature.basic_form && feature.basic_form !== "*" ? feature.basic_form : null;
    aligned.push({ token: {
      surface, start, end: start + surface.length, reading, romaji: null, lemma,
      lexical: lexical.test(surface),
    }, feature });
    position = start + surface.length;
  }
  if (position < text.length) {
    for (const token of fallbackJapaneseTokens(text.slice(position))) {
      aligned.push({ token: { ...token, start: token.start + position, end: token.end + position }, feature: null });
    }
  }
  if (aligned.map(({ token }) => token.surface).join("") !== text) {
    throw new Error("Japanese tokenizer did not preserve the original text.");
  }
  return aligned;
}

export function buildJapaneseTokens(text: string, features: readonly JapaneseMorphFeature[]): JapaneseToken[] {
  const aligned = alignMorphs(text, features);
  return aligned.map(({ token }, index) => ({
    ...token,
    romaji: token.reading ? romanizeJapaneseReading(token.reading, aligned[index + 1]?.token.reading) : null,
  }));
}

/** Whole selected span only; grammatical endings may inflect one known lexical head. */
export function japaneseLookupForms(query: JapaneseWordQuery, features: readonly JapaneseMorphFeature[]): {
  surface: string; reading: string | null; romaji: string | null; lemmas: string[];
} {
  validateJapaneseSpan(query.text, query.start, query.end);
  const surface = query.text.slice(query.start, query.end);
  const selected = alignMorphs(query.text, features)
    .filter(({ token }) => token.end > query.start && token.start < query.end);
  const aligned = selected[0]?.token.start === query.start && selected.at(-1)?.token.end === query.end;
  const reading = aligned && selected.every(({ token }) => token.reading)
    ? selected.map(({ token }) => token.reading).join("")
    : kana.test(surface.normalize("NFKC")) ? normalizeJapaneseReading(surface) : null;
  const first = selected[0];
  const oneInflectedWord = aligned && first?.feature?.word_type === "KNOWN"
    && selected.slice(1).every(({ feature }) => feature?.word_type === "KNOWN"
      && (feature.pos === "助動詞" || (feature.pos === "助詞" && feature.pos_detail_1 === "接続助詞")));
  const lemma = oneInflectedWord ? first.token.lemma : null;
  return {
    surface, reading, romaji: reading ? romanizeJapaneseReading(reading) : null,
    lemmas: lemma && lemma !== surface ? [lemma] : [],
  };
}
