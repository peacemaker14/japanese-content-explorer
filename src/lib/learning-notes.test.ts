import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { hasTestDatabase, withTestDatabase } from "../../tests/database";
import { getVideo } from "./catalog-core";
import { applyLearningNotes, validateLearningNotes, type LearningNote } from "./learning-notes";

function note(overrides: Partial<LearningNote> = {}): LearningNote {
  return {
    youtubeId: "abcdefghijk",
    estimatedDifficulty: "intermediate",
    estimateNote: "Test fixture rationale; not an actual catalog assessment.",
    estimateMethod: "Test-only transcript sample review fixture.",
    ...overrides,
  };
}

async function video(pool: Pool, youtubeId = "abcdefghijk") {
  await pool.query(
    `INSERT INTO videos(youtube_id,title,description,channel_id,channel_title,published_at,duration_seconds,embeddable,status,difficulty,language_status)
     VALUES($1,'Fixture title','Fixture description','channel','Fixture channel',now(),600,true,'published','beginner','likely_ja')`,
    [youtubeId],
  );
  await pool.query(
    `INSERT INTO video_interests(video_id,interest_id,source,reviewed)
     SELECT v.id,i.id,'manual',true FROM videos v CROSS JOIN interests i WHERE v.youtube_id=$1 AND i.slug='gaming'`,
    [youtubeId],
  );
}

describe("strict learning note validation", () => {
  it.each([
    null,
    {},
    [],
    [note({ youtubeId: "invalid" })],
    [note(), note()],
    [note({ estimatedDifficulty: "unassessed" as never })],
    [note({ estimateMethod: null })],
    [note({ estimateNote: "  " })],
    [note({ estimatedDifficulty: null })],
    [note({ summary: "Fixture summary without a basis." })],
    [note({ summary: "Fixture summary.", summaryBasis: "transcript", summarySharingPermission: "granted" })],
    [note({ summary: "Fixture summary.", summaryBasis: "metadata", summarySharingPermission: "granted", summaryPermissionNote: "  " })],
    [note({ summary: null, summaryBasis: "transcript" })],
    [note({ summary: null, summarySharingPermission: "granted", summaryPermissionNote: "Fixture grant" })],
    [note({ summarySharingPermission: "unknown" })],
    [{ ...note(), difficulty: "advanced" }],
    [{ ...note(), privateTranscript: "Must not be accepted" }],
  ])("rejects invalid complete input %j", (input) => {
    expect(() => validateLearningNotes(input)).toThrow();
  });
  it("validates every input before connecting", async () => {
    const connect = vi.fn();
    await expect(applyLearningNotes([note(), note({ youtubeId: "bad" })], { connect } as unknown as Pool)).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
  });
});

describe.skipIf(!hasTestDatabase)("atomic learning application and publication", () => {
  it("does not change any record if an ID is missing", async () => {
    await withTestDatabase(async (pool) => {
      await video(pool);
      await expect(applyLearningNotes([note(), note({ youtubeId: "zzzzzzzzzzz" })], pool)).rejects.toThrow("Unknown video ID");
      expect((await pool.query("SELECT estimated_difficulty,difficulty FROM videos")).rows[0]).toEqual({ estimated_difficulty: null, difficulty: "beginner" });
      await expect(applyLearningNotes([note(), note({ youtubeId: "zzzzzzzzzzz", estimateMethod: null })], pool)).rejects.toThrow();
      expect((await pool.query("SELECT estimated_difficulty FROM videos")).rows[0].estimated_difficulty).toBeNull();
    });
  });
  it("rolls back earlier writes on a later database failure", async () => {
    await withTestDatabase(async (pool) => {
      await video(pool);
      await video(pool, "zzzzzzzzzzz");
      await pool.query(`ALTER TABLE videos ADD CONSTRAINT fixture_reject_estimate CHECK (youtube_id <> 'zzzzzzzzzzz' OR estimated_difficulty IS NULL)`);
      await expect(applyLearningNotes([note(), note({ youtubeId: "zzzzzzzzzzz" })], pool)).rejects.toThrow();
      expect((await pool.query("SELECT estimated_difficulty FROM videos")).rows.every((row) => row.estimated_difficulty === null)).toBe(true);
    });
  });
  it("preserves manual ratings, supports repeat apply, and clears estimates without clearing manual ratings", async () => {
    await withTestDatabase(async (pool) => {
      await video(pool);
      expect(await applyLearningNotes([note()], pool)).toEqual({ applied: 1 });
      expect(await applyLearningNotes([note()], pool)).toEqual({ applied: 1 });
      expect(await getVideo("abcdefghijk", pool)).toMatchObject({ difficulty: "beginner", estimatedDifficulty: "intermediate", difficultyEstimateMethod: note().estimateMethod });
      await applyLearningNotes([note({ estimatedDifficulty: null, estimateMethod: null, estimateNote: null })], pool);
      expect((await pool.query("SELECT difficulty,estimated_difficulty,difficulty_estimate_note,difficulty_estimate_method FROM videos")).rows[0]).toEqual({ difficulty: "beginner", estimated_difficulty: null, difficulty_estimate_note: null, difficulty_estimate_method: null });
    });
  });
  it("never infers summary permission from source basis, resets replacement grants, and supports revocation", async () => {
    await withTestDatabase(async (pool) => {
      await video(pool);
      for (const basis of ["metadata", "transcript"] as const) {
        await applyLearningNotes([note({ summary: "Private fixture summary.", summaryBasis: basis })], pool);
        const detail = await getVideo("abcdefghijk", pool);
        expect(detail?.summary ?? null).toBeNull();
        expect(detail?.summaryBasis ?? null).toBeNull();
      }
      const granted = note({ summary: "Permitted fixture summary.", summaryBasis: "transcript", summarySharingPermission: "granted", summaryPermissionNote: "Test-only explicit grant evidence. Never a real source grant." });
      await applyLearningNotes([granted], pool);
      const detail = await getVideo("abcdefghijk", pool);
      expect(detail).toMatchObject({ summary: granted.summary, summaryBasis: "transcript" });
      expect(detail).not.toHaveProperty("summaryPermissionNote");
      expect(JSON.stringify(detail)).not.toContain(granted.summaryPermissionNote!);
      await applyLearningNotes([note()], pool);
      expect(await getVideo("abcdefghijk", pool)).toMatchObject({ summary: granted.summary });
      await applyLearningNotes([note({ summary: "Replacement without a grant.", summaryBasis: "metadata" })], pool);
      expect((await getVideo("abcdefghijk", pool))?.summary ?? null).toBeNull();
      expect((await pool.query("SELECT summary_sharing_permission,summary_permission_note FROM videos")).rows[0]).toEqual({ summary_sharing_permission: "unknown", summary_permission_note: null });
      await applyLearningNotes([granted], pool);
      await applyLearningNotes([{ ...granted, summarySharingPermission: "unknown", summaryPermissionNote: null }], pool);
      expect((await getVideo("abcdefghijk", pool))?.summary ?? null).toBeNull();
      await applyLearningNotes([note({ summary: null })], pool);
      expect((await pool.query("SELECT summary,summary_basis,summary_sharing_permission,summary_permission_note FROM videos")).rows[0]).toEqual({ summary: null, summary_basis: null, summary_sharing_permission: "unknown", summary_permission_note: null });
      await applyLearningNotes([granted], pool);
      await pool.query("UPDATE videos SET status='hidden'");
      expect(await getVideo("abcdefghijk", pool)).toBeNull();
    });
  });
});
