declare module "kuromoji/build/kuromoji.js" {
  import type { builder, dictionaryBuilder } from "kuromoji";
  const kuromoji: { builder: typeof builder; dictionaryBuilder: typeof dictionaryBuilder };
  export default kuromoji;
}
