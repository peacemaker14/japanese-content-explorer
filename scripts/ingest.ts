import "./env";
import { parseArgs } from "node:util";
import { closePool } from "../src/db/client";
import { collectVideos, IngestionInputError } from "../src/lib/ingestion";
import { sanitizeError } from "../src/lib/youtube/client";

try {
  let values: { interest?: string; "pages-per-query"?: string };
  try {
    ({ values } = parseArgs({
      options: {
        interest: { type: "string", default: "all" },
        "pages-per-query": { type: "string", default: "1" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    throw new IngestionInputError(
      "Usage: npm run ingest -- --interest all --pages-per-query 1",
    );
  }
  if (!/^[1-3]$/.test(values["pages-per-query"] ?? ""))
    throw new IngestionInputError(
      "pages-per-query must be an integer from 1 to 3.",
    );
  const summary = await collectVideos({
    interest: values.interest,
    pagesPerQuery: Number(values["pages-per-query"]),
  });
  console.log(JSON.stringify(summary));
  if (summary.status !== "succeeded") process.exitCode = 1;
} catch (error) {
  console.error(
    error instanceof IngestionInputError ? error.message : sanitizeError(error),
  );
  process.exitCode = 1;
} finally {
  await closePool();
}
