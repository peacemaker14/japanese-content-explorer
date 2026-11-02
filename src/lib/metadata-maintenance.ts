import type { Pool } from "pg";
import { getPool } from "../db/client";
import { YouTubeClient, sanitizeError } from "./youtube/client";
import { normalizeVideo } from "./youtube/normalize";

export type MaintenanceSummary =
  | { skipped: true }
  | {
      skipped: false;
      status: "succeeded" | "partial";
      requestCount: number;
      candidatesCount: number;
      updatedCount: number;
      deletedCount: number;
      rejectedCount: number;
    };
export async function refreshMetadata(
  options: {
    pool?: Pool;
    client?: Pick<YouTubeClient, "videos" | "requestCount">;
    deadline?: number;
  } = {},
): Promise<MaintenanceSummary> {
  const pool = options.pool ?? getPool();
  const deadline = options.deadline ?? Date.now() + 40000;
  const lock = await pool.connect();
  let runId: string | undefined;
  const summary: Exclude<MaintenanceSummary, { skipped: true }> = {
    skipped: false,
    status: "succeeded",
    requestCount: 0,
    candidatesCount: 0,
    updatedCount: 0,
    deletedCount: 0,
    rejectedCount: 0,
  };
  let failure: string | null = null;
  try {
    await lock.query("BEGIN");
    const {
      rows: [held],
    } = await lock.query(
      "SELECT pg_try_advisory_xact_lock(72654321) AS acquired",
    );
    if (!held.acquired) return { skipped: true };
    const {
      rows: [run],
    } = await pool.query(
      "INSERT INTO ingestion_runs(kind) VALUES('refresh') RETURNING id",
    );
    runId = run.id;
    let client: Pick<YouTubeClient, "videos" | "requestCount"> | undefined;
    let initialRequests = 0;
    let apiFailed = false;
    try {
      const { rows } = await pool.query<{
        id: number;
        youtube_id: string;
        metadata_updated_at: string;
      }>(
        "SELECT id,youtube_id,metadata_updated_at::text FROM videos WHERE metadata_updated_at <= now()-interval '7 days' ORDER BY metadata_updated_at,id LIMIT 500",
      );
      summary.candidatesCount = rows.length;
      if (rows.length) {
        try {
          client = options.client ?? new YouTubeClient();
          initialRequests = client.requestCount;
        } catch (error) {
          apiFailed = true;
          throw error;
        }
      }
      for (let offset = 0; offset < rows.length; offset += 50) {
        if (Date.now() >= deadline) {
          apiFailed = true;
          throw new Error("External work deadline exceeded");
        }
        const batch = rows.slice(offset, offset + 50);
        let response: unknown[];
        try {
          response = await client!.videos(
            batch.map((v) => v.youtube_id),
            { deadline },
          );
        } catch (error) {
          apiFailed = true;
          throw error;
        }
        const byId = new Map<string, unknown>();
        for (const raw of response)
          if (
            raw &&
            typeof raw === "object" &&
            "id" in raw &&
            typeof raw.id === "string"
          )
            byId.set(raw.id, raw);
        const c = await pool.connect();
        const committed = { updated: 0, deleted: 0, rejected: 0 };
        try {
          await c.query("BEGIN");
          for (const observed of batch) {
            const normalized = normalizeVideo(byId.get(observed.youtube_id));
            if (!normalized) {
              const deletion = await c.query(
                "DELETE FROM videos WHERE id=$1 AND metadata_updated_at=$2",
                [observed.id, observed.metadata_updated_at],
              );
              committed.deleted += deletion.rowCount ?? 0;
              committed.rejected++;
              continue;
            }
            const n = normalized;
            const update = await c.query(
              `UPDATE videos SET title=$3,description=$4,channel_id=$5,channel_title=$6,thumbnail_url=$7,published_at=$8,duration_seconds=$9,view_count=$10,default_audio_language=$11,embeddable=$12,made_for_kids=$13,language_status=CASE WHEN language_status='verified_ja' THEN language_status ELSE $14::language_status END,metadata_updated_at=clock_timestamp() WHERE id=$1 AND metadata_updated_at=$2`,
              [
                observed.id,
                observed.metadata_updated_at,
                n.title,
                n.description,
                n.channelId,
                n.channelTitle,
                n.thumbnailUrl,
                n.publishedAt,
                n.durationSeconds,
                n.viewCount,
                n.defaultAudioLanguage,
                n.embeddable,
                n.madeForKids,
                n.languageStatus,
              ],
            );
            committed.updated += update.rowCount ?? 0;
          }
          await c.query("COMMIT");
          summary.updatedCount += committed.updated;
          summary.deletedCount += committed.deleted;
          summary.rejectedCount += committed.rejected;
        } catch (error) {
          await c.query("ROLLBACK");
          throw error;
        } finally {
          c.release();
        }
      }
    } catch (error) {
      if (!apiFailed) throw error;
      failure = sanitizeError(error);
      summary.status = "partial";
    } finally {
      summary.requestCount = client ? client.requestCount - initialRequests : 0;
      const { rowCount } = await pool.query(
        "DELETE FROM videos WHERE metadata_updated_at <= now()-interval '29 days'",
      );
      summary.deletedCount += rowCount ?? 0;
      await pool.query(
        "DELETE FROM video_sources WHERE discovered_at <= now()-interval '29 days'",
      );
      await pool.query(
        "UPDATE ingestion_runs SET completed_at=clock_timestamp(),status=$2,request_count=$3,candidates_count=$4,updated_count=$5,deleted_count=$6,rejected_count=$7,error_message=$8 WHERE id=$1",
        [
          runId,
          summary.status,
          summary.requestCount,
          summary.candidatesCount,
          summary.updatedCount,
          summary.deletedCount,
          summary.rejectedCount,
          failure,
        ],
      );
    }
    return summary;
  } catch (error) {
    if (runId)
      await pool
        .query(
          "UPDATE ingestion_runs SET status='failed',completed_at=clock_timestamp(),error_message='Database maintenance failed' WHERE id=$1",
          [runId],
        )
        .catch(() => {});
    throw error;
  } finally {
    try {
      await lock.query("ROLLBACK");
    } finally {
      lock.release();
    }
  }
}
