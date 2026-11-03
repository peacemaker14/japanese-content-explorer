import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { hasTestDatabase, withTestDatabase } from "../../tests/database";
import { applyTranscripts, getPublicTranscript, validateTranscripts } from "./transcripts-core";
import { getSavedVideos, getVideo, listVideos } from "./catalog-core";
import { parseCatalogFilters } from "./catalog-filters";

const privateRecord = (videoId = "abcdefghijk") => ({
  videoId, source: "whisper" as const,
  segments: [{ start: 0, end: 2, text: "日本語の文です。" }],
});
const publicRecord = (videoId = "abcdefghijk") => ({
  ...privateRecord(videoId), visibility: "public" as const, sharingPermission: "granted" as const,
  permissionNote: "Documented creator grant for this exact body.", attribution: "Creator credit",
  licenseUrl: "https://example.test/license",
});
async function fixture(pool: Pool, youtubeId = "abcdefghijk") {
  const { rows: [row] } = await pool.query(`INSERT INTO videos
    (youtube_id,title,description,channel_id,channel_title,published_at,duration_seconds,embeddable,status,language_status)
    VALUES ($1,'Title','Description','channel','Channel',now(),600,true,'published','likely_ja') RETURNING id`, [youtubeId]);
  await pool.query(`INSERT INTO video_interests(video_id,interest_id,source,reviewed)
    SELECT $1,id,'manual',true FROM interests WHERE slug='gaming'`, [row.id]);
  return row.id as number;
}

describe("transcript operator validation", () => {
  it("defaults to private/unknown regardless of provenance", () => {
    for (const source of ["whisper", "creator_provided"]) {
      expect(validateTranscripts([{ ...privateRecord(), source }])[0]).toMatchObject({
        visibility: "private", sharingPermission: "unknown", source,
      });
    }
  });
  it("requires explicit evidence and attribution, never deriving permission from source", () => {
    expect(() => validateTranscripts([{ ...privateRecord(), source: "creator_provided", visibility: "public" }])).toThrow();
    expect(() => validateTranscripts([{ ...publicRecord(), permissionNote: " " }])).toThrow();
    expect(() => validateTranscripts([{ ...publicRecord(), attribution: null }])).toThrow();
    expect(() => validateTranscripts([{ ...publicRecord(), licenseUrl: "javascript:alert(1)" }])).toThrow();
    expect(() => validateTranscripts([{ ...publicRecord(), licenseUrl: "https://secret@example.test" }])).toThrow();
    expect(validateTranscripts([publicRecord()])[0].sharingPermission).toBe("granted");
  });
  it("rejects duplicate IDs, unknown fields, malformed segments and invalid full files", () => {
    expect(() => validateTranscripts([privateRecord(), privateRecord()])).toThrow();
    expect(() => validateTranscripts([{ ...privateRecord(), public: true }])).toThrow();
    expect(() => validateTranscripts([{ ...privateRecord(), videoId: "bad" }])).toThrow();
    for (const segments of [[], [{ start: 0, end: 0, text: "a" }], [{ start: -1, end: 2, text: "a" }],
      [{ start: 0, end: Infinity, text: "a" }], [{ start: 0, end: 1, text: " " }],
      [{ start: 2, end: 3, text: "a" }, { start: 0, end: 1, text: "b" }]])
      expect(() => validateTranscripts([{ ...privateRecord(), segments }])).toThrow();
  });
  it("validates saved batches before any database access", async () => {
    await expect(getSavedVideos([])).resolves.toEqual([]);
    for (const ids of [["bad"], ["abcdefghijk", "abcdefghijk"], Array.from({ length: 51 }, (_, i) => `v${String(i).padStart(10, "0")}`)])
      await expect(getSavedVideos(ids)).rejects.toThrow("50 unique valid");
    await expect(getPublicTranscript("bad")).resolves.toBeNull();
  });
});

describe.skipIf(!hasTestDatabase)("permission-separated transcript database behavior", () => {
  it("imports privately and publishes only the explicit public+granted combination", async () => {
    await withTestDatabase(async (pool) => {
      await fixture(pool);
      await applyTranscripts([privateRecord()], pool);
      expect(await getPublicTranscript("abcdefghijk", pool)).toBeNull();
      for (const rights of [
        { visibility: "private", sharingPermission: "granted", permissionNote: "Actual evidence" },
        { visibility: "public", sharingPermission: "unknown", attribution: "Credit" },
      ]) {
        await applyTranscripts([{ ...privateRecord(), ...rights }], pool);
        expect(await getPublicTranscript("abcdefghijk", pool)).toBeNull();
        expect((await listVideos(parseCatalogFilters({ transcript: "available" }), pool)).total).toBe(0);
        expect((await listVideos(parseCatalogFilters({}), pool)).items[0].hasSharedTranscript).toBe(false);
        expect((await getSavedVideos(["abcdefghijk"], pool))[0].hasSharedTranscript).toBe(false);
        expect((await listVideos(parseCatalogFilters({ transcript: "unavailable" }), pool)).total).toBe(1);
      }
      await applyTranscripts([publicRecord()], pool);
      const transcript = await getPublicTranscript("abcdefghijk", pool);
      expect(transcript).toEqual({ videoId: "abcdefghijk", source: "whisper", visibility: "public", sharingPermission: "granted",
        segments: privateRecord().segments, attribution: "Creator credit", licenseUrl: "https://example.test/license" });
      expect(JSON.stringify(transcript)).not.toContain("Documented creator grant");
      expect((await listVideos(parseCatalogFilters({ transcript: "available" }), pool)).total).toBe(1);
      expect((await listVideos(parseCatalogFilters({ transcript: "unavailable" }), pool)).total).toBe(0);
      const card = (await listVideos(parseCatalogFilters({}), pool)).items[0];
      expect(card.hasSharedTranscript).toBe(true);
      expect((await getSavedVideos(["abcdefghijk"], pool))[0].hasSharedTranscript).toBe(true);
      expect(card).not.toHaveProperty("segments");
      expect(await getVideo("abcdefghijk", pool)).not.toHaveProperty("segments");
    });
  });
  it("revokes immediately and replacement bodies never retain old grants or evidence", async () => {
    await withTestDatabase(async (pool) => {
      await fixture(pool);
      await applyTranscripts([publicRecord()], pool);
      await applyTranscripts([{ ...publicRecord(), sharingPermission: "unknown", permissionNote: null }], pool);
      expect(await getPublicTranscript("abcdefghijk", pool)).toBeNull();
      expect((await listVideos(parseCatalogFilters({}), pool)).items[0].hasSharedTranscript).toBe(false);
      expect((await getSavedVideos(["abcdefghijk"], pool))[0].hasSharedTranscript).toBe(false);
      await applyTranscripts([publicRecord()], pool);
      await applyTranscripts([{ ...privateRecord(), source: "creator_provided", segments: [{ start: 1, end: 3, text: "Replacement private body" }] }], pool);
      expect(await getPublicTranscript("abcdefghijk", pool)).toBeNull();
      const { rows: [stored] } = await pool.query("SELECT visibility,sharing_permission,permission_note,attribution,license_url FROM transcripts");
      expect(stored).toEqual({ visibility: "private", sharing_permission: "unknown", permission_note: null, attribution: null, license_url: null });
      expect((await listVideos(parseCatalogFilters({ transcript: "available" }), pool)).total).toBe(0);
    });
  });
  it("requires the normal video guard even for a rights-cleared transcript", async () => {
    await withTestDatabase(async (pool) => {
      const id = await fixture(pool);
      await applyTranscripts([publicRecord()], pool);
      for (const change of ["status='candidate'", "status='hidden'", "metadata_updated_at=now()-interval '29 days'", "embeddable=false", "language_status='unverified'"]) {
        await pool.query("UPDATE videos SET status='published',metadata_updated_at=now(),embeddable=true,language_status='likely_ja' WHERE id=$1", [id]);
        await pool.query(`UPDATE videos SET ${change} WHERE id=$1`, [id]);
        expect(await getPublicTranscript("abcdefghijk", pool)).toBeNull();
        expect((await listVideos(parseCatalogFilters({ transcript: "available" }), pool)).total).toBe(0);
        expect((await listVideos(parseCatalogFilters({}), pool)).items).toEqual([]);
        expect(await getSavedVideos(["abcdefghijk", "zzzzzzzzzzz"], pool)).toEqual([]);
        expect(await getVideo("abcdefghijk", pool)).toBeNull();
      }
      await pool.query("UPDATE videos SET status='published',metadata_updated_at=now(),embeddable=true,language_status='likely_ja' WHERE id=$1", [id]);
      await pool.query("UPDATE video_interests SET source='query',reviewed=false WHERE video_id=$1", [id]);
      expect(await getPublicTranscript("abcdefghijk", pool)).toBeNull();
      expect((await listVideos(parseCatalogFilters({}), pool)).items).toEqual([]);
      expect(await getSavedVideos(["abcdefghijk"], pool)).toEqual([]);
      await pool.query("DELETE FROM videos WHERE id=$1", [id]);
      expect((await pool.query("SELECT * FROM transcripts")).rows).toEqual([]);
    });
  });
  it("applies the whole file atomically, including missing IDs and malformed records", async () => {
    await withTestDatabase(async (pool) => {
      await fixture(pool);
      await applyTranscripts([publicRecord()], pool);
      await expect(applyTranscripts([privateRecord(), privateRecord("zzzzzzzzzzz")], pool)).rejects.toThrow();
      expect(await getPublicTranscript("abcdefghijk", pool)).not.toBeNull();
      await expect(applyTranscripts([privateRecord(), { ...privateRecord("zzzzzzzzzzz"), segments: [] }], pool)).rejects.toThrow();
      expect(await getPublicTranscript("abcdefghijk", pool)).not.toBeNull();
    });
  });
  it("serializes summary/basis only with a current grant and never permission evidence", async () => {
    await withTestDatabase(async (pool) => {
      const id = await fixture(pool);
      await pool.query("UPDATE videos SET summary='Private analysis',summary_basis='transcript',summary_permission_note='Private evidence' WHERE id=$1", [id]);
      let detail = await getVideo("abcdefghijk", pool);
      expect(detail).toMatchObject({ summary: null, summaryBasis: null });
      expect(JSON.stringify(detail)).not.toContain("Private");
      await pool.query("UPDATE videos SET summary_sharing_permission='granted' WHERE id=$1", [id]);
      detail = await getVideo("abcdefghijk", pool);
      expect(detail).toMatchObject({ summary: "Private analysis", summaryBasis: "transcript" });
      expect(JSON.stringify(detail)).not.toContain("Private evidence");
      await pool.query("UPDATE videos SET summary_sharing_permission='unknown' WHERE id=$1", [id]);
      expect(await getVideo("abcdefghijk", pool)).toMatchObject({ summary: null, summaryBasis: null });
      expect((await getSavedVideos(["abcdefghijk"], pool))[0]).not.toHaveProperty("summary");
    });
  });
});
