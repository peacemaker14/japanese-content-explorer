import type { Pool } from "pg";
import { z } from "zod";
import { getPool } from "../db/client";
import { taxonomy, youtubeIdPattern } from "./taxonomy";
import { difficultyValues } from "./difficulty";

const decisionSchema = z.object({
  youtubeId: z.string().regex(youtubeIdPattern),
  status: z.enum(["candidate", "published", "hidden"]),
  interests: z
    .array(z.string())
    .refine(
      (items) => new Set(items).size === items.length,
      "Duplicate interests",
    ),
  subtopics: z
    .array(z.string())
    .refine(
      (items) => new Set(items).size === items.length,
      "Duplicate subtopics",
    ),
  format: z
    .enum(["review", "tutorial", "vlog", "interview", "other"])
    .nullable(),
  languageStatus: z.enum(["unverified", "likely_ja", "verified_ja"]),
  difficulty: z.enum(difficultyValues),
  reviewNote: z
    .string()
    .trim()
    .min(
      1,
      "Document your review, including observed Japanese speech/text when verifying Japanese.",
    ),
});
export type CurationDecision = z.infer<typeof decisionSchema>;
export type CurationStatus = CurationDecision["status"];
const interests = new Set<string>(taxonomy.map((t) => t.slug));
const parents = new Map<string, string>(
  taxonomy.flatMap((t) =>
    t.subtopics.map(([slug]) => [`${t.slug}/${slug}`, t.slug] as const),
  ),
);
export function validateCuration(input: unknown): CurationDecision[] {
  const decisions = z.array(decisionSchema).parse(input);
  const ids = new Set<string>();
  for (const decision of decisions) {
    if (ids.has(decision.youtubeId))
      throw new Error(`Duplicate video ID: ${decision.youtubeId}`);
    ids.add(decision.youtubeId);
    for (const slug of decision.interests)
      if (!interests.has(slug)) throw new Error(`Unknown interest: ${slug}`);
    for (const slug of decision.subtopics) {
      const parent = parents.get(slug);
      if (!parent) throw new Error(`Unknown subtopic: ${slug}`);
      if (!decision.interests.includes(parent))
        throw new Error(`Subtopic ${slug} requires interest ${parent}`);
    }
    if (
      decision.status === "published" &&
      (!decision.interests.length || decision.languageStatus === "unverified")
    ) {
      throw new Error(
        `Publication requires reviewed interests and Japanese language evidence: ${decision.youtubeId}`,
      );
    }
  }
  return decisions;
}
type LockedVideo = {
  id: number;
  youtube_id: string;
  embeddable: boolean;
  fresh: boolean;
  default_audio_language: string | null;
};
export async function applyCuration(
  input: unknown,
  pool: Pool = getPool(),
): Promise<{ applied: number }> {
  const decisions = validateCuration(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<LockedVideo>(
      `SELECT id, youtube_id, embeddable, default_audio_language,
      metadata_updated_at > now() - interval '29 days' AS fresh
      FROM videos WHERE youtube_id = ANY($1::text[]) ORDER BY youtube_id FOR UPDATE`,
      [decisions.map((d) => d.youtubeId)],
    );
    const byId = new Map(locked.rows.map((row) => [row.youtube_id, row]));
    // Validate every current row before the first write; locks preserve these observations until commit.
    for (const decision of decisions) {
      const row = byId.get(decision.youtubeId);
      if (!row) throw new Error(`Unknown video ID: ${decision.youtubeId}`);
      if (
        decision.languageStatus === "likely_ja" &&
        !/^ja(?:-|$)/i.test(row.default_audio_language ?? "")
      ) {
        throw new Error(
          `Likely Japanese requires creator-provided Japanese audio metadata: ${decision.youtubeId}`,
        );
      }
      // Nonpublic API results are never retained by ingestion/maintenance.
      if (decision.status === "published" && (!row.embeddable || !row.fresh))
        throw new Error(
          `Video is stale or not embeddable: ${decision.youtubeId}`,
        );
    }
    const interestRows = await client.query<{ id: number; slug: string }>(
      "SELECT id, slug FROM interests",
    );
    const subtopicRows = await client.query<{ id: number; slug: string }>(
      `SELECT s.id, i.slug || '/' || s.slug AS slug FROM subtopics s JOIN interests i ON i.id = s.interest_id`,
    );
    const interestIds = new Map(
      interestRows.rows.map((row) => [row.slug, row.id]),
    );
    const subtopicIds = new Map(
      subtopicRows.rows.map((row) => [row.slug, row.id]),
    );
    for (const decision of decisions) {
      if (
        decision.interests.some((slug) => !interestIds.has(slug)) ||
        decision.subtopics.some((slug) => !subtopicIds.has(slug))
      )
        throw new Error(
          "Taxonomy is not seeded. Run db:seed before applying curation.",
        );
    }
    for (const decision of decisions) {
      const video = byId.get(decision.youtubeId)!;
      await client.query("DELETE FROM video_subtopics WHERE video_id = $1", [
        video.id,
      ]);
      await client.query("DELETE FROM video_interests WHERE video_id = $1", [
        video.id,
      ]);
      if (decision.interests.length)
        await client.query(
          `INSERT INTO video_interests (video_id, interest_id, source, reviewed)
        SELECT $1, unnest($2::integer[]), 'manual', true`,
          [video.id, decision.interests.map((slug) => interestIds.get(slug)!)],
        );
      if (decision.subtopics.length)
        await client.query(
          `INSERT INTO video_subtopics (video_id, subtopic_id)
        SELECT $1, unnest($2::integer[])`,
          [video.id, decision.subtopics.map((slug) => subtopicIds.get(slug)!)],
        );
      await client.query(
        `UPDATE videos SET status=$2, format=$3, language_status=$4, review_note=$5, difficulty=$6, reviewed_at=now() WHERE id=$1`,
        [
          video.id,
          decision.status,
          decision.format,
          decision.languageStatus,
          decision.reviewNote,
          decision.difficulty,
        ],
      );
    }
    await client.query("COMMIT");
    return { applied: decisions.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function exportCuration(
  status: CurationStatus,
  pool: Pool = getPool(),
): Promise<unknown[]> {
  if (!["candidate", "published", "hidden"].includes(status))
    throw new Error("Invalid export status.");
  const result = await pool.query(
    `SELECT v.youtube_id AS "youtubeId", v.status,
    COALESCE((SELECT json_agg(i.slug ORDER BY i.slug) FROM video_interests vi JOIN interests i ON i.id=vi.interest_id WHERE vi.video_id=v.id AND vi.reviewed=true AND vi.source='manual'), '[]'::json) AS interests,
    COALESCE((SELECT json_agg(i.slug || '/' || s.slug ORDER BY i.slug,s.slug) FROM video_subtopics vs JOIN subtopics s ON s.id=vs.subtopic_id JOIN interests i ON i.id=s.interest_id WHERE vs.video_id=v.id), '[]'::json) AS subtopics,
    v.format, v.difficulty, v.language_status AS "languageStatus", COALESCE(v.review_note,'') AS "reviewNote",
    json_build_object('title',v.title,'channel',v.channel_title,'watchUrl','https://www.youtube.com/watch?v=' || v.youtube_id,
      'durationSeconds',v.duration_seconds,'defaultAudioLanguage',v.default_audio_language,
      'madeForKids',v.made_for_kids,'embeddable',v.embeddable,'metadataUpdatedAt',v.metadata_updated_at,
      'querySuggestions',COALESCE((SELECT json_agg(i.slug ORDER BY i.slug) FROM video_interests vi JOIN interests i ON i.id=vi.interest_id WHERE vi.video_id=v.id AND vi.reviewed=false AND vi.source='query'),'[]'::json)) AS context
    FROM videos v WHERE v.status=$1 ORDER BY v.collected_at, v.youtube_id`,
    [status],
  );
  return result.rows;
}
export async function catalogReport(pool: Pool = getPool()) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const statuses = await client.query(
      `SELECT status, count(*)::integer AS count FROM videos GROUP BY status ORDER BY status`,
    );
    const byInterest =
      await client.query(`SELECT i.slug, i.name, count(DISTINCT v.id)::integer AS "publishedVideos"
      FROM interests i LEFT JOIN video_interests vi ON vi.interest_id=i.id AND vi.reviewed=true AND vi.source='manual'
      LEFT JOIN videos v ON v.id=vi.video_id AND v.status='published' GROUP BY i.id ORDER BY i.id`);
    const channels =
      await client.query(`SELECT i.slug AS interest, v.channel_id AS "channelId", min(v.channel_title) AS "channelTitle", count(DISTINCT v.id)::integer AS "publishedVideos"
      FROM videos v JOIN video_interests vi ON vi.video_id=v.id AND vi.reviewed=true AND vi.source='manual'
      JOIN interests i ON i.id=vi.interest_id WHERE v.status='published' GROUP BY i.slug,v.channel_id HAVING count(DISTINCT v.id)>1 ORDER BY count(DISTINCT v.id) DESC,i.slug,v.channel_id`);
    const outcomes =
      await client.query(`SELECT id, kind, started_at AS "startedAt", completed_at AS "completedAt", status,
      query_count AS "queryCount",request_count AS "requestCount",candidates_count AS "candidatesCount",inserted_count AS "insertedCount",
      updated_count AS "updatedCount",duplicate_count AS "duplicateCount",rejected_count AS "rejectedCount",deleted_count AS "deletedCount",error_message AS "errorMessage"
      FROM ingestion_runs ORDER BY started_at DESC, id`);
    await client.query("COMMIT");
    const counts = { candidate: 0, published: 0, hidden: 0 };
    for (const row of statuses.rows)
      counts[row.status as CurationStatus] = row.count;
    return {
      distinctVideos: counts,
      publishedByInterest: byInterest.rows,
      channelRepetition: channels.rows,
      ingestionRuns: outcomes.rows,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
