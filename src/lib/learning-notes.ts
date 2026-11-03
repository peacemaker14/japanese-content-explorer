import type { Pool } from "pg";
import { z } from "zod";
import { getPool } from "../db/client";
import { youtubeIdPattern } from "./taxonomy";

const evidence = z.string().trim().min(1);
const learningNoteSchema = z.object({
  youtubeId: z.string().regex(youtubeIdPattern),
  estimatedDifficulty: z.enum(["beginner", "intermediate", "advanced"]).nullable(),
  estimateNote: evidence.nullable(),
  estimateMethod: evidence.nullable(),
  summary: evidence.nullable().optional(),
  summaryBasis: z.enum(["metadata", "transcript"]).nullable().optional(),
  summarySharingPermission: z.enum(["unknown", "granted"]).optional(),
  summaryPermissionNote: evidence.nullable().optional(),
}).strict().superRefine((entry, context) => {
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  if (entry.estimatedDifficulty !== null) {
    if (!entry.estimateNote || !entry.estimateMethod) {
      issue("A difficulty estimate requires its actual review rationale and method.");
    }
  } else if (entry.estimateNote !== null || entry.estimateMethod !== null) {
    issue("Clearing an estimate requires null rationale and method.");
  }
  if (entry.summary === undefined) {
    if (entry.summaryBasis !== undefined || entry.summarySharingPermission !== undefined || entry.summaryPermissionNote !== undefined) {
      issue("Summary rights and basis changes require an explicit summary value.");
    }
    return;
  }
  if (entry.summary === null) {
    if (entry.summaryBasis != null || entry.summarySharingPermission === "granted" || entry.summaryPermissionNote != null) {
      issue("Clearing a summary must also clear its basis and permission evidence.");
    }
    return;
  }
  if (!entry.summaryBasis) issue("A summary requires its actual metadata or transcript basis.");
  if (entry.summarySharingPermission === "granted" && !entry.summaryPermissionNote) {
    issue("Public summaries require documented redistribution permission, not implied source access.");
  }
});

export type LearningNote = z.infer<typeof learningNoteSchema>;

export function validateLearningNotes(input: unknown): LearningNote[] {
  const notes = z.array(learningNoteSchema).min(1).parse(input);
  const ids = new Set<string>();
  for (const note of notes) {
    if (ids.has(note.youtubeId)) throw new Error(`Duplicate video ID: ${note.youtubeId}`);
    ids.add(note.youtubeId);
  }
  return notes;
}

/** Operator-only: a declared grant must document real rights, never merely API/transcript access. */
export async function applyLearningNotes(
  input: unknown,
  pool?: Pool,
): Promise<{ applied: number }> {
  // Validate the entire input before even obtaining a database connection.
  const notes = validateLearningNotes(input);
  const client = await (pool ?? getPool()).connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ id: number; youtube_id: string }>(
      "SELECT id, youtube_id FROM videos WHERE youtube_id = ANY($1::text[]) ORDER BY youtube_id FOR UPDATE",
      [notes.map((note) => note.youtubeId)],
    );
    const byId = new Map(locked.rows.map((row) => [row.youtube_id, row.id]));
    for (const note of notes) {
      if (!byId.has(note.youtubeId)) throw new Error(`Unknown video ID: ${note.youtubeId}`);
    }
    for (const note of notes) {
      // Manual difficulty, editorial state and source metadata are never written here.
      await client.query(
        `UPDATE videos SET estimated_difficulty=$2, difficulty_estimate_note=$3,
         difficulty_estimate_method=$4 WHERE id=$1`,
        [byId.get(note.youtubeId), note.estimatedDifficulty, note.estimateNote, note.estimateMethod],
      );
      if (note.summary !== undefined) {
        // Every replacement resets rights unless this exact input explicitly grants them.
        await client.query(
          `UPDATE videos SET summary=$2, summary_basis=$3,
           summary_sharing_permission=$4, summary_permission_note=$5 WHERE id=$1`,
          [
            byId.get(note.youtubeId), note.summary, note.summaryBasis ?? null,
            note.summarySharingPermission ?? "unknown", note.summaryPermissionNote ?? null,
          ],
        );
      }
    }
    await client.query("COMMIT");
    return { applied: notes.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
