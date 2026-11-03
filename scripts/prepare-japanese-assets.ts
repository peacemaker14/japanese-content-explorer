/**
 * npm ci && npm run language:prepare
 * Downloads ONLY the pinned public full-English archive; never opens Tombo or user data.
 * Monthly refresh: review latest scriptin/jmdict-simplified release, replace the full eng
 * URL/member/size/SHA256/release in japanese-language-source.json, bump assetVersion,
 * rerun preparation, review manifest counts and publish new assets with the app.
 * Bump assetVersion for worker/reading-engine changes too (immutable browser caching).
 */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { build } from "esbuild";
import source from "../src/lib/japanese-language-source.json";
import { prepareJapaneseDictionary } from "../src/lib/japanese-dictionary-source";

const project = resolve(import.meta.dirname, "..");
const destination = join(project, "public/language", source.assetVersion);
const temporary = await mkdtemp(join(tmpdir(), "yorimichi-language-"));
const output = join(temporary, source.assetVersion);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

try {
  const packageLock = JSON.parse(await readFile(join(project, "package-lock.json"), "utf8")) as {
    packages: Record<string, { version: string; integrity?: string }>;
  };
  for (const [name, version] of [["kuromoji", source.kuromojiVersion], ["wanakana", source.wanakanaVersion]]) {
    const installed = JSON.parse(await readFile(join(project, "node_modules", name, "package.json"), "utf8")) as { version: string };
    if (installed.version !== version || packageLock.packages[`node_modules/${name}`]?.version !== version) {
      throw new Error(`Run npm ci: ${name} must match the pinned ${version} package.`);
    }
  }
  await mkdir(join(output, "ipadic"), { recursive: true });
  const response = await fetch(source.jmdict.url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Pinned JMdict download failed (HTTP ${response.status}).`);
  const archive = Buffer.from(await response.arrayBuffer());
  if (archive.length !== source.jmdict.archiveBytes || sha256(archive) !== source.jmdict.sha256) {
    throw new Error("JMdict archive size/SHA256 differs from the reviewed source lock; nothing published.");
  }
  const tar = gunzipSync(archive);
  let dictionarySource: unknown;
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0[\s\S]*$/u, "").replace(/^\.\//u, "");
    const size = Number.parseInt(header.subarray(124, 136).toString("ascii").replace(/\0[\s\S]*$/u, "").trim(), 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length) throw new Error("Malformed pinned JMdict tar archive.");
    if (name === source.jmdict.member) {
      if (dictionarySource !== undefined) throw new Error("Duplicate dictionary member in archive.");
      dictionarySource = JSON.parse(tar.subarray(offset + 512, offset + 512 + size).toString("utf8"));
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (dictionarySource === undefined) throw new Error("Pinned dictionary archive member is missing.");
  const dictionary = prepareJapaneseDictionary(dictionarySource, source.jmdict.release, source.schemaVersion);
  if (dictionary.words.length < 200_000) throw new Error("Full-English JMdict unexpectedly has fewer than 200,000 entries; review source, do not publish a subset.");
  const dictionaryBytes = gzipSync(Buffer.from(JSON.stringify(dictionary)), { level: 9 });
  await writeFile(join(output, "dictionary.json.gz"), dictionaryBytes);

  const ipadic: Record<string, { bytes: number; sha256: string }> = {};
  const dictionaryFiles = (await readdir(join(project, "node_modules/kuromoji/dict"))).filter((name) => name.endsWith(".dat.gz")).sort();
  if (dictionaryFiles.length !== 12) throw new Error("Pinned Kuromoji IPADIC file set has changed.");
  for (const file of dictionaryFiles) {
    const bytes = await readFile(join(project, "node_modules/kuromoji/dict", file));
    ipadic[file] = { bytes: bytes.length, sha256: sha256(bytes) };
    await writeFile(join(output, "ipadic", file), bytes);
  }
  await build({
    absWorkingDir: project,
    entryPoints: ["src/lib/japanese-tools.worker.ts"], outfile: join(output, "worker.js"),
    bundle: true, platform: "browser", format: "iife", target: "es2020", minify: true,
    legalComments: "inline", sourcemap: false, charset: "utf8", logLevel: "silent",
  });

  const licenses: [string, string][] = [
    ["kuromoji/LICENSE-2.0.txt", "KUROMOJI-APACHE-2.0.txt"],
    ["kuromoji/NOTICE.md", "IPADIC-NOTICE.txt"],
    ["wanakana/LICENSE", "WANAKANA-MIT.txt"],
    ["async/LICENSE", "ASYNC-MIT.txt"],
    ["doublearray/LICENSE.txt", "DOUBLEARRAY-MIT.txt"],
    ["zlibjs/LICENSE", "ZLIBJS-MIT.txt"],
    ["lodash/LICENSE", "LODASH-MIT.txt"],
  ];
  await mkdir(join(output, "licenses"));
  for (const [from, to] of licenses) await copyFile(join(project, "node_modules", from), join(output, "licenses", to));
  await copyFile(join(project, "public/language/NOTICE.txt"), join(output, "NOTICE.txt"));
  const workerBytes = await readFile(join(output, "worker.js"));
  const manifest = {
    assetVersion: source.assetVersion, schemaVersion: source.schemaVersion,
    source,
    dictionary: {
      file: "dictionary.json.gz", bytes: dictionaryBytes.length, sha256: sha256(dictionaryBytes),
      entries: dictionary.words.length, dictDate: dictionary.dictDate,
      senses: dictionary.words.reduce((total, word) => total + word.sense.filter((sense) => sense.meanings.length).length, 0),
      transformation: "All entries and Japanese forms/restrictions retained; English glosses, gloss qualifiers and sense notes projected. Non-English glosses and unused source metadata omitted. Exact-form index built locally in the worker. Derived data CC-BY-SA-4.0.",
    },
    tokenizer: { package: `kuromoji@${source.kuromojiVersion}`, npmIntegrity: packageLock.packages["node_modules/kuromoji"].integrity, files: ipadic },
    romanizer: { package: `wanakana@${source.wanakanaVersion}`, npmIntegrity: packageLock.packages["node_modules/wanakana"].integrity },
    worker: { bytes: workerBytes.length, sha256: sha256(workerBytes) },
    build: { node: process.version, esbuild: packageLock.packages["node_modules/esbuild"].version },
    privacy: "Only fixed first-party asset URLs. No cue, selected word, prefix, hash or text-derived shard request. No text logs or remote analysis.",
  };
  await writeFile(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const checksums: string[] = [];
  async function collect(directory: string, prefix = ""): Promise<void> {
    for (const file of (await readdir(directory)).sort()) {
      const relative = prefix + file;
      if ((await stat(join(directory, file))).isDirectory()) await collect(join(directory, file), `${relative}/`);
      else checksums.push(`${sha256(await readFile(join(directory, file)))}  ${relative}`);
    }
  }
  await collect(output);
  const checksumsText = checksums.join("\n") + "\n";
  await writeFile(join(output, "SHA256SUMS.txt"), checksumsText);
  await mkdir(join(project, "public/language"), { recursive: true });
  let existing: string | null = null;
  try { existing = await readFile(join(destination, "SHA256SUMS.txt"), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (existing !== null) {
    if (existing !== checksumsText) throw new Error("Immutable language version already exists with different content. Bump assetVersion and prepare again.");
  } else {
    await rename(output, destination);
  }
  console.log(JSON.stringify({ command: "language:prepare", destination: `public/language/${source.assetVersion}`, ...manifest.dictionary, ipadicBytes: Object.values(ipadic).reduce((sum, file) => sum + file.bytes, 0), workerBytes: workerBytes.length }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
