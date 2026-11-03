import { describe, expect, it } from "vitest";
import { fallbackJapaneseTokens, validateJapaneseSpan } from "./japanese-fallback";
import { buildJapaneseTokens, japaneseLookupForms, normalizeJapaneseReading, romanizeJapaneseReading } from "./japanese-reading";
import type { JapaneseMorphFeature } from "./japanese-reading";

const known = (surface_form: string, reading: string, basic_form = surface_form, pos = "名詞", pos_detail_1 = "一般"): JapaneseMorphFeature => ({
  surface_form, reading, basic_form, pos, pos_detail_1, word_type: "KNOWN",
});

describe("exact Japanese reading spans", () => {
  it("preserves original spaces, newlines, punctuation and supplementary characters with UTF16 offsets", () => {
    const text = "😀 日本語、\n 日本語!𠮷";
    const tokens = buildJapaneseTokens(text, [
      { surface_form: "😀", word_type: "UNKNOWN" },
      known("日本語", "ニホンゴ"), known("、", "*"), known("日本語", "ニホンゴ"),
      { surface_form: "!", word_type: "UNKNOWN" }, { surface_form: "𠮷", word_type: "UNKNOWN" },
    ]);
    expect(tokens.map((token) => token.surface).join("")).toBe(text);
    for (const token of tokens) expect(text.slice(token.start, token.end)).toBe(token.surface);
    expect(tokens.filter((token) => token.surface === "日本語").map((token) => token.start)).toEqual([3, 9]);
    expect(tokens.find((token) => token.surface === "日本語")).toMatchObject({ reading: "にほんご", romaji: "nihongo" });
    expect(tokens.at(-1)).toMatchObject({ surface: "𠮷", reading: null, romaji: null, lemma: null });
  });

  it("never invents unknown kanji readings, even if an unknown feature contains one", () => {
    const tokens = buildJapaneseTokens("謎𠮷 カナ", [
      { surface_form: "謎𠮷", word_type: "UNKNOWN", reading: "ナゾキチ", basic_form: "謎吉" },
      { surface_form: "カナ", word_type: "UNKNOWN" },
    ]);
    expect(tokens[0]).toMatchObject({ reading: null, romaji: null, lemma: null, lexical: true });
    expect(tokens.at(-1)).toMatchObject({ reading: "かな", romaji: "kana", lemma: null });
    expect(normalizeJapaneseReading("kanji?")).toBeNull();
    expect(normalizeJapaneseReading("ﾆﾎﾝｺﾞ")).toBe("にほんご");
  });

  it("keeps fallback surfaces exact without pretending segmentation is a reading service", () => {
    const text = "日本語  😀\nfoo/bar。";
    const tokens = fallbackJapaneseTokens(text);
    expect(tokens.map((token) => token.surface).join("")).toBe(text);
    for (const token of tokens) {
      expect(text.slice(token.start, token.end)).toBe(token.surface);
      expect([token.reading, token.romaji, token.lemma]).toEqual([null, null, null]);
    }
    expect(tokens.find((token) => token.surface === "😀")?.lexical).toBe(false);
  });

  it("rejects spans splitting surrogate pairs and never realigns a click silently", () => {
    expect(() => validateJapaneseSpan("😀猫", 1, 2)).toThrow();
    expect(() => validateJapaneseSpan("😀猫", 0, 1)).toThrow();
    expect(() => validateJapaneseSpan("😀猫", 2, 3)).not.toThrow();
    for (const [start, end] of [[-1, 2], [0, 4], [2, 2], [0.5, 2]]) {
      expect(() => validateJapaneseSpan("😀猫", start, end)).toThrow();
    }
  });

  it("uses kana romanization including prolonged katakana and split small tsu", () => {
    expect(romanizeJapaneseReading("こーひー")).toBe("koohii");
    expect(romanizeJapaneseReading("てぃー")).toBe("tii");
    expect(romanizeJapaneseReading("がっ", "こう")).toBe("gak");
  });
});

describe("real morphological dictionary forms", () => {
  const text = "昨日食べました。";
  const features = [known("昨日", "キノウ"), known("食べ", "タベ", "食べる", "動詞"),
    known("まし", "マシ", "ます", "助動詞"), known("た", "タ", "た", "助動詞"), known("。", "*")];

  it("derives an inflected lemma from a known morph plus grammatical endings", () => {
    expect(japaneseLookupForms({ text, start: 2, end: 7 }, features)).toEqual({
      surface: "食べました", reading: "たべました", romaji: "tabemashita", lemmas: ["食べる"],
    });
    expect(japaneseLookupForms({ text, start: 2, end: 4 }, features).lemmas).toEqual(["食べる"]);
  });

  it("does not give a multiword phrase the first word's lemma or a partial morph reading", () => {
    expect(japaneseLookupForms({ text, start: 0, end: 7 }, features).lemmas).toEqual([]);
    expect(japaneseLookupForms({ text, start: 3, end: 4 }, features)).toMatchObject({
      surface: "べ", reading: "べ", lemmas: [],
    });
    const unknown = [{ surface_form: "謎食べた", word_type: "UNKNOWN", basic_form: "食べる" }];
    expect(japaneseLookupForms({ text: "謎食べた", start: 0, end: 4 }, unknown)).toMatchObject({ reading: null, lemmas: [] });
  });

  it("refuses inconsistent tokenizer surfaces instead of dropping source characters", () => {
    expect(() => buildJapaneseTokens("猫", [known("犬", "イヌ")])).toThrow(/preserve/u);
  });
});
