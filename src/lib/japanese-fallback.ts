import type { JapaneseToken } from "./japanese-tools-types";

const lexical = /[\p{L}\p{N}]/u;
let segmenter: Intl.Segmenter | null | undefined;

/** Cheap, SSR-safe boundaries only. No dictionary, guessed readings, or retained text. */
export function fallbackJapaneseTokens(text: string): JapaneseToken[] {
  const token = (surface: string, start: number): JapaneseToken => ({
    surface, start, end: start + surface.length,
    reading: null, romaji: null, lemma: null, lexical: lexical.test(surface),
  });
  if (segmenter === undefined) {
    segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("ja", { granularity: "word" }) : null;
  }
  if (segmenter) {
    return Array.from(segmenter.segment(text), (part) => token(part.segment, part.index));
  }
  return Array.from(text.matchAll(/[\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+/gu),
    (match) => token(match[0], match.index));
}

/** Reject surrogate-splitting offsets rather than silently changing the selected word. */
export function validateJapaneseSpan(text: string, start: number, end: number): void {
  const splitsPair = (offset: number) => offset > 0 && offset < text.length
    && /[\uD800-\uDBFF]/u.test(text[offset - 1]) && /[\uDC00-\uDFFF]/u.test(text[offset]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < 0 || end > text.length || start >= end || splitsPair(start) || splitsPair(end)) {
    throw new Error("Select an exact word span within the original sentence.");
  }
}
