import { z } from "zod";
import type { JapaneseDictionaryAsset } from "./japanese-dictionary";

const restrictions = z.array(z.string());
const sourceSchema = z.object({
  version: z.string(), languages: z.array(z.string()), dictDate: z.string(), commonOnly: z.boolean(),
  tags: z.record(z.string(), z.string()),
  words: z.array(z.object({
    id: z.string(),
    kanji: z.array(z.object({ text: z.string().min(1) })),
    kana: z.array(z.object({ text: z.string().min(1), appliesToKanji: restrictions })),
    sense: z.array(z.object({
      appliesToKanji: restrictions, appliesToKana: restrictions,
      field: z.array(z.string()), dialect: z.array(z.string()), misc: z.array(z.string()), info: z.array(z.string()),
      gloss: z.array(z.object({ lang: z.string(), text: z.string(), type: z.string().nullable(), gender: z.string().nullable() })),
    })),
  })),
});

/** Remove unrelated source metadata, not entries, forms, restrictions or English meanings. */
export function prepareJapaneseDictionary(input: unknown, release: string, schemaVersion: number): JapaneseDictionaryAsset {
  const data = sourceSchema.parse(input);
  if (data.commonOnly || !data.languages.includes("eng")) {
    throw new Error("Preparation requires the complete English JMdict, never the common-only subset.");
  }
  const ids = new Set<string>();
  return {
    release, schemaVersion, dictDate: data.dictDate,
    words: data.words.map((word) => {
      if (ids.has(word.id)) throw new Error("JMdict contains duplicate entry IDs.");
      ids.add(word.id);
      return {
        id: word.id,
        kanji: word.kanji.map((form) => form.text),
        kana: word.kana,
        sense: word.sense.map((sense) => {
          const glosses = sense.gloss.filter((gloss) => gloss.lang === "eng").map((gloss) => {
            const qualifiers = [gloss.type, gloss.gender].filter(Boolean);
            return qualifiers.length ? `${gloss.text} [${qualifiers.join(", ")}]` : gloss.text;
          });
          const notes = [...sense.field, ...sense.dialect, ...sense.misc].map((tag) => data.tags[tag] ?? tag);
          notes.push(...sense.info);
          const meaning = glosses.join("; ");
          return {
            appliesToKanji: sense.appliesToKanji,
            appliesToKana: sense.appliesToKana,
            meanings: meaning ? [meaning + (notes.length ? ` (${notes.join("; ")})` : "")] : [],
          };
        }),
      };
    }),
  };
}
