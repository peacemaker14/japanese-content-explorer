import type { Pool } from "pg";
import { getPool } from "../db/client";
import { youtubeIdPattern } from "./taxonomy";
import type {
  CatalogFilters,
  CatalogPage,
  CategorySummary,
  VideoCardData,
  VideoDetailData,
} from "./catalog-types";
export type * from "./catalog-types";

// Only public API responses are persisted; unavailable/nonpublic responses are removed by maintenance.
export const publicVideoPredicate = `v.status = 'published' AND v.embeddable = true
  AND v.language_status IN ('likely_ja', 'verified_ja')
  AND v.metadata_updated_at > now() - interval '29 days'
  AND EXISTS (SELECT 1 FROM video_interests pvi WHERE pvi.video_id = v.id AND pvi.reviewed = true AND pvi.source = 'manual')`;
export const sharedTranscriptPredicate = `EXISTS (SELECT 1 FROM transcripts t WHERE t.video_id = v.id AND t.visibility = 'public' AND t.sharing_permission = 'granted')`;
const cardColumns = `v.youtube_id AS "youtubeId", v.title, v.channel_title AS "channelTitle",
 v.thumbnail_url AS "thumbnailUrl", v.published_at AS "publishedAt", v.duration_seconds AS "durationSeconds",
 v.view_count::text AS "viewCount", v.difficulty, v.estimated_difficulty AS "estimatedDifficulty",
 COALESCE((SELECT json_agg(json_build_object('slug', i.slug, 'name', i.name) ORDER BY i.slug)
 FROM video_interests vi JOIN interests i ON i.id = vi.interest_id
 WHERE vi.video_id = v.id AND vi.reviewed = true AND vi.source = 'manual'), '[]'::json) AS interests`;
type CardRow = Omit<VideoCardData, "publishedAt"> & { publishedAt: Date };
function card(row: CardRow): VideoCardData {
  return { ...row, publishedAt: row.publishedAt.toISOString() };
}
function predicate(filters: CatalogFilters): {
  sql: string;
  values: unknown[];
} {
  const clauses = [publicVideoPredicate];
  const values: unknown[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.interests.length)
    clauses.push(
      `EXISTS (SELECT 1 FROM video_interests vi JOIN interests i ON i.id = vi.interest_id WHERE vi.video_id = v.id AND vi.reviewed = true AND vi.source = 'manual' AND i.slug = ANY(${bind(filters.interests)}::text[]))`,
    );
  if (filters.subtopics.length)
    clauses.push(
      `EXISTS (SELECT 1 FROM video_subtopics vs JOIN subtopics s ON s.id = vs.subtopic_id JOIN interests i ON i.id = s.interest_id JOIN video_interests vi ON vi.video_id = vs.video_id AND vi.interest_id = i.id WHERE vs.video_id = v.id AND vi.reviewed = true AND vi.source = 'manual' AND (i.slug || '/' || s.slug) = ANY(${bind(filters.subtopics)}::text[]))`,
    );
  if (filters.q) {
    const match = bind(`%${filters.q.replace(/[\\%_]/g, "\\$&")}%`);
    clauses.push(
      `(v.title ILIKE ${match} ESCAPE E'\\\\' OR v.channel_title ILIKE ${match} ESCAPE E'\\\\'
       OR EXISTS (SELECT 1 FROM video_interests vi JOIN interests i ON i.id = vi.interest_id
         WHERE vi.video_id = v.id AND vi.reviewed = true AND vi.source = 'manual'
         AND (i.name ILIKE ${match} ESCAPE E'\\\\' OR i.slug ILIKE ${match} ESCAPE E'\\\\'))
       OR EXISTS (SELECT 1 FROM video_subtopics vs JOIN subtopics s ON s.id = vs.subtopic_id
         JOIN interests i ON i.id = s.interest_id
         JOIN video_interests vi ON vi.video_id = vs.video_id AND vi.interest_id = i.id
         WHERE vs.video_id = v.id AND vi.reviewed = true AND vi.source = 'manual'
         AND (s.name ILIKE ${match} ESCAPE E'\\\\' OR (i.slug || '/' || s.slug) ILIKE ${match} ESCAPE E'\\\\')))`,
    );
  }
  if (filters.duration === "under-10") clauses.push("v.duration_seconds < 600");
  if (filters.duration === "10-plus") clauses.push("v.duration_seconds >= 600");
  if (filters.difficulty !== "all")
    clauses.push(`COALESCE(NULLIF(v.difficulty, 'unassessed'::difficulty), v.estimated_difficulty, 'unassessed'::difficulty) = ${bind(filters.difficulty)}::difficulty`);
  if (filters.transcript === "available") clauses.push(sharedTranscriptPredicate);
  if (filters.transcript === "unavailable") clauses.push(`NOT (${sharedTranscriptPredicate})`);
  return { sql: clauses.join(" AND "), values };
}
export async function listVideos(
  filters: CatalogFilters,
  pool: Pool = getPool(),
): Promise<CatalogPage> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const where = predicate(filters);
    const count = await client.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM videos v WHERE ${where.sql}`,
      where.values,
    );
    const total = Number(count.rows[0].total);
    const totalPages = Math.ceil(total / 20);
    const page = Math.min(filters.page, Math.max(1, totalPages));
    const order =
      filters.sort === "popular"
        ? "v.view_count DESC NULLS LAST, v.published_at DESC, v.youtube_id ASC"
        : "v.published_at DESC, v.youtube_id ASC";
    const result = await client.query<CardRow>(
      `SELECT ${cardColumns} FROM videos v WHERE ${where.sql} ORDER BY ${order} LIMIT 20 OFFSET $${where.values.length + 1}`,
      [...where.values, (page - 1) * 20],
    );
    await client.query("COMMIT");
    return {
      items: result.rows.map(card),
      total,
      page,
      pageSize: 20,
      totalPages,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function getVideo(
  youtubeId: string,
  pool: Pool = getPool(),
): Promise<VideoDetailData | null> {
  if (!youtubeIdPattern.test(youtubeId)) return null;
  const result = await pool.query<
    CardRow & Omit<VideoDetailData, keyof VideoCardData>
  >(
    `SELECT ${cardColumns},
    v.description, v.language_status AS "languageStatus", v.default_audio_language AS "defaultAudioLanguage",
    v.made_for_kids AS "madeForKids", v.format,
    v.difficulty_estimate_note AS "difficultyEstimateNote", v.difficulty_estimate_method AS "difficultyEstimateMethod",
    CASE WHEN v.summary_sharing_permission = 'granted' THEN v.summary ELSE NULL END AS summary,
    CASE WHEN v.summary_sharing_permission = 'granted' THEN v.summary_basis ELSE NULL END AS "summaryBasis",
    COALESCE((SELECT json_agg(json_build_object('slug', i.slug || '/' || s.slug, 'name', s.name) ORDER BY i.slug, s.slug)
      FROM video_subtopics vs JOIN subtopics s ON s.id = vs.subtopic_id JOIN interests i ON i.id = s.interest_id
      JOIN video_interests vi ON vi.video_id = vs.video_id AND vi.interest_id = i.id AND vi.reviewed = true AND vi.source = 'manual'
      WHERE vs.video_id = v.id), '[]'::json) AS subtopics
    FROM videos v WHERE ${publicVideoPredicate} AND v.youtube_id = $1`,
    [youtubeId],
  );
  const row = result.rows[0];
  return row ? { ...row, publishedAt: row.publishedAt.toISOString() } : null;
}
export async function getSavedVideos(
  youtubeIds: string[],
  pool?: Pool,
): Promise<VideoCardData[]> {
  if (!Array.isArray(youtubeIds) || youtubeIds.length > 50 ||
      youtubeIds.some((id) => typeof id !== "string" || !youtubeIdPattern.test(id)) ||
      new Set(youtubeIds).size !== youtubeIds.length)
    throw new Error("Saved videos require at most 50 unique valid YouTube IDs.");
  if (!youtubeIds.length) return [];
  const result = await (pool ?? getPool()).query<CardRow>(
    `SELECT ${cardColumns} FROM videos v
     WHERE ${publicVideoPredicate} AND v.youtube_id = ANY($1::text[])
     ORDER BY array_position($1::text[], v.youtube_id)`,
    [youtubeIds],
  );
  return result.rows.map(card);
}
export async function listCategories(
  pool: Pool = getPool(),
): Promise<CategorySummary[]> {
  const result = await pool.query<CategorySummary>(`
    WITH visible AS MATERIALIZED (
      SELECT v.id, vi.interest_id
      FROM videos v
      JOIN video_interests vi ON vi.video_id = v.id AND vi.reviewed = true AND vi.source = 'manual'
      WHERE ${publicVideoPredicate}
    ), category_counts AS (
      SELECT interest_id, count(*)::integer AS total FROM visible GROUP BY interest_id
    ), subtopic_counts AS (
      SELECT vs.subtopic_id, count(*)::integer AS total
      FROM visible pv
      JOIN video_subtopics vs ON vs.video_id = pv.id
      JOIN subtopics s ON s.id = vs.subtopic_id AND s.interest_id = pv.interest_id
      GROUP BY vs.subtopic_id
    )
    SELECT i.slug, i.name, i.description, COALESCE(cc.total, 0) AS "videoCount",
      COALESCE((SELECT json_agg(json_build_object(
        'slug', i.slug || '/' || s.slug, 'name', s.name, 'videoCount', COALESCE(sc.total, 0)
      ) ORDER BY s.id)
        FROM subtopics s LEFT JOIN subtopic_counts sc ON sc.subtopic_id = s.id
        WHERE s.interest_id = i.id), '[]'::json) AS subtopics
    FROM interests i
    LEFT JOIN category_counts cc ON cc.interest_id = i.id
    ORDER BY i.id
  `);
  return result.rows;
}
