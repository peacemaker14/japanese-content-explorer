import "./env";
import { parseArgs } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { closePool } from "../src/db/client";
import { applyTranscripts } from "../src/lib/transcripts-core";

async function main() {
  const { values } = parseArgs({ options: { file: { type: "string" } }, strict: true });
  if (!values.file) throw new Error("Missing --file.");
  const info = await stat(values.file);
  if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error("Transcript file exceeds 20 MiB or is not a file.");
  const input: unknown = JSON.parse(await readFile(values.file, "utf8"));
  console.log(JSON.stringify(await applyTranscripts(input)));
}
main().catch(() => {
  // Validation errors may contain private text/evidence; never print the input or underlying error.
  console.error("Transcript apply failed; no records applied. Check the JSON array, unique videoId values, source, ordered finite segments, explicit permission evidence and public attribution. Missing rights flags default to private/unknown.");
  process.exitCode = 1;
}).finally(closePool);
