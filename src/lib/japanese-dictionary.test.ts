import { describe, expect, it } from "vitest";
import { indexJapaneseDictionaryWord, projectJapaneseDictionary } from "./japanese-dictionary";
import type { JapaneseDictionaryIndex, JapaneseDictionaryWord } from "./japanese-dictionary";
import { prepareJapaneseDictionary } from "./japanese-dictionary-source";

const restricted: JapaneseDictionaryWord = {
  id: "fixture-restrictions",
  kanji: ["開く", "空く", "明く"],
  kana: [
    { text: "あく", appliesToKanji: ["開く", "空く"] },
    { text: "ひらく", appliesToKanji: ["開く"] },
    { text: "あくる", appliesToKanji: ["明く"] },
    { text: "かなだけ", appliesToKanji: [] },
  ],
  sense: [
    { appliesToKanji: ["開く"], appliesToKana: ["あく"], meanings: ["to open (intransitive)"] },
    { appliesToKanji: ["開く"], appliesToKana: ["ひらく"], meanings: ["to open; to unfold"] },
    { appliesToKanji: ["空く"], appliesToKana: ["あく"], meanings: ["to become vacant"] },
    { appliesToKanji: ["明く"], appliesToKana: ["あくる"], meanings: ["following"] },
    { appliesToKanji: ["*"], appliesToKana: ["かなだけ"], meanings: ["kana-only fixture"] },
  ],
};

describe("complete English JMdict exact lookup projection", () => {
  it("honors kana-to-kanji and both sense restrictions without leaking another form's gloss", () => {
    expect(projectJapaneseDictionary([restricted], "空く", null)).toEqual([
      { headword: "空く", reading: "あく", meanings: ["to become vacant"] },
    ]);
    expect(projectJapaneseDictionary([restricted], "開く", "ひらく")).toEqual([
      { headword: "開く", reading: "ひらく", meanings: ["to open; to unfold"] },
    ]);
    expect(projectJapaneseDictionary([restricted], "開く", "みつからない")).toHaveLength(2);
  });

  it("preserves every applicable alternative spelling and does not treat kana-only as unrestricted", () => {
    expect(projectJapaneseDictionary([restricted], "あく", null)).toEqual([
      { headword: "開く", reading: "あく", meanings: ["to open (intransitive)"] },
      { headword: "空く", reading: "あく", meanings: ["to become vacant"] },
    ]);
    expect(projectJapaneseDictionary([restricted], "かなだけ", null)).toEqual([
      { headword: "かなだけ", reading: "かなだけ", meanings: ["kana-only fixture"] },
    ]);
    expect(projectJapaneseDictionary([restricted], "明く", null)).toEqual([
      { headword: "明く", reading: "あくる", meanings: ["following"] },
    ]);
  });

  it("indexes exact literal forms and all homograph entries without substring/English search", () => {
    const index: JapaneseDictionaryIndex = new Map();
    indexJapaneseDictionaryWord(index, restricted, 0);
    indexJapaneseDictionaryWord(index, { ...restricted, id: "second" }, 1);
    expect(index.get("開く")).toEqual([0, 1]);
    expect(index.get("かなだけ")).toEqual([0, 1]);
    expect(index.get("開")).toBeUndefined();
    expect(index.get("to open")).toBeUndefined();
    expect(index.get("%")).toBeUndefined();
    expect(projectJapaneseDictionary([restricted, restricted], "空く", null)).toHaveLength(1);
  });
});

const sourceWord = {
  id: "fixture-source",
  kanji: [{ text: "試験", common: false, tags: [] }, { text: "別形", common: false, tags: [] }],
  kana: [{ text: "しけん", appliesToKanji: ["試験"], common: false, tags: [] }],
  sense: [{
    appliesToKanji: ["試験"], appliesToKana: ["しけん"],
    field: ["test-field"], dialect: [], misc: [], info: ["a source note"],
    gloss: [
      { lang: "eng", text: "test", type: null, gender: null },
      { lang: "eng", text: "examination", type: "literal", gender: null },
      { lang: "ger", text: "Prüfung", type: null, gender: null },
    ],
  }],
};
const source = { version: "3.6.2", languages: ["eng"], dictDate: "2026-11-02", commonOnly: false,
  tags: { "test-field": "testing" }, words: [sourceWord] };

describe("licensed full-English source preparation", () => {
  it("keeps uncommon entries, alternative forms, restrictions and every English gloss/qualifier", () => {
    const result = prepareJapaneseDictionary(source, "locked-release", 1);
    expect(result).toMatchObject({ release: "locked-release", schemaVersion: 1, dictDate: "2026-11-02" });
    expect(result.words[0].kanji).toEqual(["試験", "別形"]);
    expect(result.words[0].kana[0].appliesToKanji).toEqual(["試験"]);
    expect(result.words[0].sense[0]).toEqual({
      appliesToKanji: ["試験"], appliesToKana: ["しけん"],
      meanings: ["test; examination [literal] (testing; a source note)"],
    });
  });

  it("fails closed for common-only/non-English sources, duplicates and missing restriction data", () => {
    expect(() => prepareJapaneseDictionary({ ...source, commonOnly: true }, "x", 1)).toThrow(/complete/u);
    expect(() => prepareJapaneseDictionary({ ...source, languages: ["ger"] }, "x", 1)).toThrow(/complete/u);
    expect(() => prepareJapaneseDictionary({ ...source, words: [sourceWord, sourceWord] }, "x", 1)).toThrow(/duplicate/u);
    expect(() => prepareJapaneseDictionary({ ...source, words: [{ ...sourceWord, kana: [{ text: "しけん" }] }] }, "x", 1)).toThrow();
  });
});
