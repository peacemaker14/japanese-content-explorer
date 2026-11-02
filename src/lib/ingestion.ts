import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { getPool } from "../db/client";
import { taxonomy, youtubeIdPattern } from "./taxonomy";
import {
  YouTubeClient,
  sanitizeError,
  type SearchOptions,
  type SearchResult,
  type RequestOptions,
} from "./youtube/client";
import { normalizeVideo, type NormalizedVideo } from "./youtube/normalize";

export interface IngestionClient {
  requestCount: number;
  search(options: SearchOptions): Promise<SearchResult>;
  videos(ids: string[], options?: RequestOptions): Promise<unknown[]>;
}
export interface IngestionOptions {
  pool?: Pool;
  client?: IngestionClient;
  deadline?: number;
}
export interface CollectionOptions extends IngestionOptions {
  interest?: string;
  pagesPerQuery?: number;
}
export interface IngestionSummary {
  runId: string;
  status: "succeeded" | "partial" | "failed";
  queryCount: number;
  requestCount: number;
  candidatesCount: number;
  insertedCount: number;
  updatedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  deletedCount: number;
  errorMessage: string | null;
}
export class IngestionInputError extends Error {}
interface Source {
  kind: "youtube_query" | "tombo_manifest";
  key: string;
  query: string | null;
  interestId: number | null;
}
type Candidates = Map<string, Map<string, Source>>;

/** Validate before creating a run or making any API calls. */
export function validateCollectionOptions(
  interest: string,
  pagesPerQuery: number,
) {
  if (interest !== "all" && !taxonomy.some((item) => item.slug === interest))
    throw new IngestionInputError(
      "Unknown interest; use a seeded interest slug or all.",
    );
  if (
    !Number.isInteger(pagesPerQuery) ||
    pagesPerQuery < 1 ||
    pagesPerQuery > 3
  )
    throw new IngestionInputError(
      "pages-per-query must be an integer from 1 to 3.",
    );
}

export async function collectVideos(
  options: CollectionOptions = {},
): Promise<IngestionSummary> {
  const interest = options.interest ?? "all";
  const pages = options.pagesPerQuery ?? 1;
  validateCollectionOptions(interest, pages);
  return runIngestion(
    "collect",
    options,
    async (pool, client, summary, candidates) => {
      const selected = taxonomy.filter(
        (item) => interest === "all" || item.slug === interest,
      );
      const { rows } = await pool.query<{ id: number; slug: string }>(
        "SELECT id, slug FROM interests WHERE slug = ANY($1::text[])",
        [selected.map((item) => item.slug)],
      );
      const interestIds = new Map(rows.map((row) => [row.slug, row.id]));
      if (selected.some((item) => !interestIds.has(item.slug)))
        throw new IngestionInputError("Seed the taxonomy before collecting.");
      for (const item of selected) {
        for (const query of item.queries) {
          let pageToken: string | undefined;
          for (let page = 0; page < pages; page++) {
            summary.queryCount++;
            const result = await client.search({
              query,
              pageToken,
              deadline: options.deadline,
            });
            for (const id of result.ids) {
              if (!youtubeIdPattern.test(id))
                throw new IngestionInputError(
                  "Search returned an invalid video ID.",
                );
              addCandidate(candidates, summary, id, {
                kind: "youtube_query",
                key: `${item.slug}:${query}`,
                query,
                interestId: interestIds.get(item.slug)!,
              });
            }
            pageToken = result.nextPageToken;
            if (!pageToken) break;
          }
        }
      }
    },
  );
}

/** Deliberately read only language and youtube_id, never Tombo editorial fields. */
export function tomboJapaneseIds(manifest: unknown): string[] {
  const entries = z
    .array(
      z.object({ language: z.string(), youtube_id: z.unknown().optional() }),
    )
    .safeParse(manifest);
  if (!entries.success)
    throw new IngestionInputError(
      "Manifest must be an array of entries with a language.",
    );
  return entries.data
    .filter((entry) => entry.language === "ja")
    .map((entry) => {
      if (
        typeof entry.youtube_id !== "string" ||
        !youtubeIdPattern.test(entry.youtube_id)
      )
        throw new IngestionInputError(
          "Japanese manifest entry has an invalid youtube_id.",
        );
      return entry.youtube_id;
    });
}

export async function importTomboManifest(
  manifest: unknown,
  options: IngestionOptions = {},
): Promise<IngestionSummary> {
  const ids = tomboJapaneseIds(manifest);
  return runIngestion(
    "import_tombo",
    options,
    async (_pool, _client, summary, candidates) => {
      for (const id of ids)
        addCandidate(candidates, summary, id, {
          kind: "tombo_manifest",
          key: "tombo:catalog.json",
          query: null,
          interestId: null,
        });
    },
  );
}

function addCandidate(
  candidates: Candidates,
  summary: IngestionSummary,
  id: string,
  source: Source,
) {
  summary.candidatesCount++;
  let sources = candidates.get(id);
  if (sources) summary.duplicateCount++;
  else {
    sources = new Map();
    candidates.set(id, sources);
  }
  sources.set(source.key, source);
}

async function runIngestion(
  kind: "collect" | "import_tombo",
  options: IngestionOptions,
  discover: (
    pool: Pool,
    client: IngestionClient,
    summary: IngestionSummary,
    candidates: Candidates,
  ) => Promise<void>,
): Promise<IngestionSummary> {
  const pool = options.pool ?? getPool();
  const client = options.client ?? new YouTubeClient();
  const initialRequests = client.requestCount;
  const summary: IngestionSummary = {
    runId: randomUUID(),
    status: "succeeded",
    queryCount: 0,
    requestCount: 0,
    candidatesCount: 0,
    insertedCount: 0,
    updatedCount: 0,
    duplicateCount: 0,
    rejectedCount: 0,
    deletedCount: 0,
    errorMessage: null,
  };
  await pool.query("INSERT INTO ingestion_runs(id, kind) VALUES($1, $2)", [
    summary.runId,
    kind,
  ]);
  const candidates: Candidates = new Map();
  try {
    await discover(pool, client, summary, candidates);
    const ids = [...candidates.keys()];
    for (let offset = 0; offset < ids.length; offset += 50) {
      const batch = ids.slice(offset, offset + 50);
      const raw = await client.videos(batch, { deadline: options.deadline });
      const requested = new Set(batch);
      const normalized = new Map<string, NormalizedVideo>();
      for (const item of raw) {
        const video = normalizeVideo(item);
        if (video && requested.has(video.youtubeId))
          normalized.set(video.youtubeId, video);
      }
      const counts = await commitBatch(
        pool,
        summary.runId,
        normalized,
        candidates,
      );
      summary.insertedCount += counts.inserted;
      summary.updatedCount += counts.updated;
      summary.rejectedCount += batch.length - normalized.size;
    }
  } catch (error) {
    summary.status =
      summary.insertedCount + summary.updatedCount + summary.rejectedCount > 0
        ? "partial"
        : "failed";
    summary.errorMessage =
      error instanceof IngestionInputError
        ? error.message
        : sanitizeError(error);
  }
  summary.requestCount = client.requestCount - initialRequests;
  await pool.query(
    `UPDATE ingestion_runs SET completed_at=now(), status=$2, query_count=$3,
    request_count=$4, candidates_count=$5, inserted_count=$6, updated_count=$7,
    duplicate_count=$8, rejected_count=$9, deleted_count=$10, error_message=$11 WHERE id=$1`,
    [
      summary.runId,
      summary.status,
      summary.queryCount,
      summary.requestCount,
      summary.candidatesCount,
      summary.insertedCount,
      summary.updatedCount,
      summary.duplicateCount,
      summary.rejectedCount,
      summary.deletedCount,
      summary.errorMessage,
    ],
  );
  return summary;
}

async function commitBatch(
  pool: Pool,
  runId: string,
  normalized: Map<string, NormalizedVideo>,
  candidates: Candidates,
) {
  const connection = await pool.connect();
  let inserted = 0;
  let updated = 0;
  try {
    await connection.query("BEGIN");
    for (const video of normalized.values()) {
      const {
        rows: [row],
      } = await connection.query<{
        id: number;
        inserted: boolean;
        reviewed_at: Date | null;
      }>(
        `
        INSERT INTO videos(youtube_id,title,description,channel_id,channel_title,thumbnail_url,published_at,
          duration_seconds,view_count,default_audio_language,embeddable,made_for_kids,language_status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT(youtube_id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description,
          channel_id=EXCLUDED.channel_id, channel_title=EXCLUDED.channel_title, thumbnail_url=EXCLUDED.thumbnail_url,
          published_at=EXCLUDED.published_at, duration_seconds=EXCLUDED.duration_seconds, view_count=EXCLUDED.view_count,
          default_audio_language=EXCLUDED.default_audio_language, embeddable=EXCLUDED.embeddable,
          made_for_kids=EXCLUDED.made_for_kids, metadata_updated_at=now(),
          language_status=CASE WHEN videos.language_status='verified_ja' THEN videos.language_status ELSE EXCLUDED.language_status END
        RETURNING id, (xmax=0) AS inserted, reviewed_at`,
        [
          video.youtubeId,
          video.title,
          video.description,
          video.channelId,
          video.channelTitle,
          video.thumbnailUrl,
          video.publishedAt,
          video.durationSeconds,
          video.viewCount,
          video.defaultAudioLanguage,
          video.embeddable,
          video.madeForKids,
          video.languageStatus,
        ],
      );
      if (row.inserted) inserted++;
      else updated++;
      for (const source of candidates.get(video.youtubeId)!.values()) {
        await connection.query(
          `INSERT INTO video_sources(video_id,ingestion_run_id,source_kind,source_key,query_text,interest_id)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
          [
            row.id,
            runId,
            source.kind,
            source.key,
            source.query,
            source.interestId,
          ],
        );
        if (source.interestId !== null && row.reviewed_at === null) {
          await connection.query(
            `INSERT INTO video_interests(video_id,interest_id,source,reviewed)
            SELECT $1,$2,'query',false WHERE NOT EXISTS (
              SELECT 1 FROM video_interests WHERE video_id=$1 AND (reviewed=true OR source='manual')
            ) ON CONFLICT DO NOTHING`,
            [row.id, source.interestId],
          );
        }
      }
    }
    await connection.query("COMMIT");
    return { inserted, updated };
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}
