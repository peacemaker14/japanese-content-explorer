import "./env";
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { closePool } from "../src/db/client";
import { exportCuration, type CurationStatus } from "../src/lib/curation";
async function main() {
  const { values } = parseArgs({
    options: {
      status: { type: "string", default: "candidate" },
      out: { type: "string" },
    },
    strict: true,
  });
  if (
    !values.out ||
    !["candidate", "published", "hidden"].includes(values.status)
  )
    throw new Error(
      "Usage: curate:export -- --status candidate|published|hidden --out .local/review.json",
    );
  const entries = await exportCuration(values.status as CurationStatus);
  await mkdir(dirname(values.out), { recursive: true, mode: 0o700 });
  await writeFile(values.out, `${JSON.stringify(entries, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(JSON.stringify({ exported: entries.length }));
  console.error(
    "Keep this review export private and delete it before 30 days. verified_ja requires actual observation of Japanese speech or substantive on-video text. Rate difficulty only after reviewing the language; otherwise keep unassessed. Document the assessment in reviewNote; these are not JLPT levels.",
  );
}
main()
  .catch(() => {
    console.error(
      "Curation export failed. Check arguments and database configuration.",
    );
    process.exitCode = 1;
  })
  .finally(closePool);
