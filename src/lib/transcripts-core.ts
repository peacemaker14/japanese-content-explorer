import type { Pool } from "pg";
import { z } from "zod";
import { getPool } from "../db/client";
import { publicVideoPredicate } from "./catalog-core";
import { youtubeIdPattern } from "./taxonomy";
import type { PublicTranscript } from "./transcript-types";

const segmentSchema = z.object({
  start: z.number().finite().min(0).max(86400),
  end: z.number().finite().positive().max(86400),
  text: z.string().trim().min(1).max(10000),
}).strict().refine((segment) => segment.end > segment.start, "Segment end must follow start.");
const licenseSchema = z.string().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch { return false; }
}, "License URL must be an HTTP(S) URL without credentials.");
const decisionSchema = z.object({
  videoId: z.string().regex(youtubeIdPattern),
  source: z.enum(["whisper", "creator_provided"]),
  visibility: z.enum(["private", "public"]).default("private"),
  sharingPermission: z.enum(["unknown", "granted"]).default("unknown"),
  segments: z.array(segmentSchema).min(1).max(20000),
  permissionNote: z.string().trim().min(1).max(20000).nullable().optional(),
  attribution: z.string().trim().min(1).max(2000).nullable().optional(),
  licenseUrl: licenseSchema.nullable().optional(),
}).strict().superRefine((decision, ctx) => {
  if (decision.sharingPermission === "granted" && !decision.permissionNote)
    ctx.addIssue({ code: "custom", message: "Granted permission requires actual rights evidence.", path: ["permissionNote"] });
  if (decision.visibility === "public" && !decision.attribution)
    ctx.addIssue({ code: "custom", message: "Public transcripts require attribution.", path: ["attribution"] });
  for (let n = 1; n < decision.segments.length; n++) {
    if (decision.segments[n].start < decision.segments[n - 1].start) {
      ctx.addIssue({ code: "custom", message: "Segments must be ordered by start time.", path: ["segments", n] });
      break;
    }
  }
});
export type TranscriptDecision = z.infer<typeof decisionSchema>;
export function validateTranscripts(input: unknown): TranscriptDecision[] {
  const decisions = z.array(decisionSchema).max(1000).parse(input);
  if (new Set(decisions.map((decision) => decision.videoId)).size !== decisions.length)
    throw new Error("Duplicate transcript video IDs.");
  return decisions;
}

export async function getPublicTranscript(youtubeId: string, pool?: Pool): Promise<PublicTranscript | null> {
  if (!youtubeIdPattern.test(youtubeId)) return null;
  // Explicit columns are the serialization boundary: never select permission_note or private text.
  const result = await (pool ?? getPool()).query<PublicTranscript>(
    `SELECT v.youtube_id AS "videoId", t.source, t.visibility,
       t.sharing_permission AS "sharingPermission", t.segments, t.attribution, t.license_url AS "licenseUrl"
     FROM transcripts t JOIN videos v ON v.id = t.video_id
     WHERE ${publicVideoPredicate} AND v.youtube_id = $1
       AND t.visibility = 'public' AND t.sharing_permission = 'granted'`,
    [youtubeId],
  );
  return result.rows[0] ?? null;
}

export async function applyTranscripts(input: unknown, pool?: Pool): Promise<{ applied: number }> {
  const decisions = validateTranscripts(input);
  if (!decisions.length) return { applied: 0 };
  const client = await (pool ?? getPool()).connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ id: number; youtube_id: string }>(
      "SELECT id, youtube_id FROM videos WHERE youtube_id = ANY($1::text[]) ORDER BY youtube_id FOR UPDATE",
      [decisions.map((decision) => decision.videoId)],
    );
    const ids = new Map(locked.rows.map((row) => [row.youtube_id, row.id]));
    if (decisions.some((decision) => !ids.has(decision.videoId)))
      throw new Error("Unknown transcript video ID; nothing applied.");
    for (const decision of decisions) {
      // Full replacement, including rights fields: a new body or source can never inherit an old grant.
      await client.query(
        `INSERT INTO transcripts (video_id, source, visibility, sharing_permission, segments, permission_note, attribution, license_url)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
         ON CONFLICT (video_id) DO UPDATE SET source=EXCLUDED.source, visibility=EXCLUDED.visibility,
           sharing_permission=EXCLUDED.sharing_permission, segments=EXCLUDED.segments,
           permission_note=EXCLUDED.permission_note, attribution=EXCLUDED.attribution,
           license_url=EXCLUDED.license_url, updated_at=now()`,
        [ids.get(decision.videoId), decision.source, decision.visibility, decision.sharingPermission,
          JSON.stringify(decision.segments), decision.permissionNote ?? null, decision.attribution ?? null, decision.licenseUrl ?? null],
      );
    }
    await client.query("COMMIT");
    return { applied: decisions.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
