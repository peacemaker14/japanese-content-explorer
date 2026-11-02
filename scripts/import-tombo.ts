import "./env";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { closePool } from "../src/db/client";
import { importTomboManifest, IngestionInputError } from "../src/lib/ingestion";
import { sanitizeError } from "../src/lib/youtube/client";

try {
  let file: string | undefined;
  try {
    const { values } = parseArgs({
      options: { manifest: { type: "string" } },
      strict: true,
      allowPositionals: false,
    });
    file = values.manifest;
  } catch {
    throw new IngestionInputError(
      "Usage: npm run import:tombo -- --manifest /path/to/catalog.json",
    );
  }
  if (!file)
    throw new IngestionInputError(
      "A public catalog manifest file is required.",
    );
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new IngestionInputError("Cannot read a valid JSON manifest.");
  }
  const summary = await importTomboManifest(manifest);
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
