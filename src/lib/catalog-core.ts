import type { Pool } from "pg";
import { getPool } from "../db/client";
import { youtubeIdPattern } from "./taxonomy";
import type {
  CatalogFilters,
  CatalogPage,
  InterestWithSubtopics,
  VideoCardData,
  VideoDetailData,
} from "./catalog-types";
export type * from "./catalog-types";

// Only public API responses are persisted; unavailable/nonpublic responses are removed by maintenance.
export const publicVideoPredicate = `v.status = 'published' AND v.embeddable = true
  AND v.language_status IN ('likely_ja', 'verified_ja')
  AND v.metadata_updated_at > now() - interval '29 days'
  AND EXISTS (SELECT 1 FROM video_interests pvi WHERE pvi.video_id = v.id AND pvi.reviewed = true AND pvi.source = 'manual')`;
const cardColumns = `v.youtube_id AS "youtubeId", v.title, v.channel_title AS "channelTitle",
 v.thumbnail_url AS "thumbnailUrl", v.published_at AS "publishedAt", v.duration_seconds AS "durationSeconds",
 v.view_count::text AS "viewCount", v.difficulty,
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
      `(v.title ILIKE ${match} ESCAPE E'\\\\' OR v.channel_title ILIKE ${match} ESCAPE E'\\\\')`,
    );
  }
  if (filters.duration === "under-10") clauses.push("v.duration_seconds < 600");
  if (filters.duration === "10-plus") clauses.push("v.duration_seconds >= 600");
  if (filters.difficulty !== "all")
    clauses.push(`v.difficulty = ${bind(filters.difficulty)}::difficulty`);
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
export async function listInterests(
  pool: Pool = getPool(),
): Promise<InterestWithSubtopics[]> {
  const result =
    await pool.query<InterestWithSubtopics>(`SELECT i.slug, i.name, i.description,
    COALESCE((SELECT json_agg(json_build_object('slug', i.slug || '/' || s.slug, 'name', s.name) ORDER BY s.id)
    FROM subtopics s WHERE s.interest_id = i.id), '[]'::json) AS subtopics FROM interests i ORDER BY i.id`);
  return result.rows;
}
