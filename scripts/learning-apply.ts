import "./env";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { closePool } from "../src/db/client";
import { applyLearningNotes } from "../src/lib/learning-notes";

async function main() {
  const { values } = parseArgs({
    options: { file: { type: "string" } },
    strict: true,
    allowPositionals: false,
  });
  if (!values.file) throw new Error("Missing --file");
  const input: unknown = JSON.parse(await readFile(values.file, "utf8"));
  console.log(JSON.stringify(await applyLearningNotes(input)));
}

main()
  .catch(() => {
    // Do not print input bodies, private rationale, rights evidence or database errors.
    console.error(
      "Learning apply failed; no changes were applied. Supply --file with a JSON array of existing unique video IDs, an estimatedDifficulty (beginner/intermediate/advanced or null), and matching estimateNote/estimateMethod (nonempty evidence, or both null when clearing). Summary replacements require an explicit metadata/transcript basis; publishing requires summarySharingPermission: granted and actual redistribution evidence in summaryPermissionNote. Omitted summary fields preserve it; replacements never inherit a grant. Manual ratings are unchanged. Check database configuration and availability.",
    );
    process.exitCode = 1;
  })
  .finally(closePool);
