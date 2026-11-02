import "./env";
import { parseArgs } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { closePool } from "../src/db/client";
import { applyCuration } from "../src/lib/curation";
async function main() {
  const { values } = parseArgs({
    options: { file: { type: "string" } },
    strict: true,
  });
  if (!values.file) throw new Error("Missing --file");
  const info = await stat(values.file);
  if (Date.now() - info.mtimeMs >= 29 * 24 * 60 * 60 * 1000)
    throw new Error("Review export has expired. Delete and export again.");
  const input: unknown = JSON.parse(await readFile(values.file, "utf8"));
  console.log(JSON.stringify(await applyCuration(input)));
}
main()
  .catch(() => {
    console.error(
      "Curation apply failed; no decisions were applied. Check file IDs, taxonomy, evidence notes, current Japanese audio metadata, and publication eligibility. Exports must be younger than 29 days.",
    );
    process.exitCode = 1;
  })
  .finally(closePool);
