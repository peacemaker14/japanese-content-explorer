import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesMock, listVideosMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(), listVideosMock: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("@/lib/catalog", () => ({ listVideos: listVideosMock }));

import { GET } from "./route";

const publicCard = {
  youtubeId: "abcdefghijk", title: "日本語の動画", channelTitle: "Public channel",
  thumbnailUrl: null, publishedAt: "2026-01-01T00:00:00.000Z", durationSeconds: 600,
  viewCount: "9007199254740993", difficulty: "unassessed", estimatedDifficulty: "beginner",
  hasSharedTranscript: true, interests: [{ slug: "gaming", name: "Gaming" }],
};
beforeEach(() => {
  vi.clearAllMocks();
  cookiesMock.mockResolvedValue({ get: () => ({ value: "1" }) });
  listVideosMock.mockResolvedValue({ items: [publicCard], total: 25, page: 2, pageSize: 20, totalPages: 2 });
});

describe("public catalog batches", () => {
  it("checks acknowledgment before querying and never caches failures", async () => {
    for (const cookie of [undefined, { value: "0" }, { value: "invalid" }]) {
      cookiesMock.mockResolvedValue({ get: () => cookie });
      const response = await GET(new Request("https://example.test/api/catalog?page=2"));
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(listVideosMock).not.toHaveBeenCalled();
  });
  it.each([
    "interest=unknown", "sort=private", "q=one&q=two", "page=1&page=2", "page=0", "transcript=private",
  ])("rejects malformed public filters without accessing metadata: %s", async (query) => {
    const response = await GET(new Request(`https://example.test/api/catalog?${query}`));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid filters" });
    expect(listVideosMock).not.toHaveBeenCalled();
  });
  it("reuses parser semantics for repeated interests and explicit sort, and returns clamped pages honestly", async () => {
    const response = await GET(new Request("https://example.test/api/catalog?interest=gaming&interest=food-cooking&sort=newest&transcript=available&page=99"));
    expect(listVideosMock).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      interests: ["gaming", "food-cooking"], sort: "newest", transcript: "available", page: 99,
    }));
    expect(await response.json()).toEqual({ items: [publicCard], total: 25, page: 2, pageSize: 20, totalPages: 2 });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
  });
  it("uses featured by default and only serializes card allowlist fields, not private/detail context", async () => {
    listVideosMock.mockResolvedValue({
      items: [{ ...publicCard, privateTranscript: "PRIVATE_SENTINEL", reviewNote: "PRIVATE_SENTINEL",
        description: "PRIVATE_SENTINEL", transcript: { body: "PRIVATE_SENTINEL" },
        interests: [{ ...publicCard.interests[0], privateEvidence: "PRIVATE_SENTINEL" }] }],
      total: 1, page: 1, pageSize: 20, totalPages: 1, privateRun: "PRIVATE_SENTINEL",
    });
    const response = await GET(new Request("https://example.test/api/catalog?ignored=unrelated"));
    expect(listVideosMock).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ sort: "featured", page: 1 }));
    const text = await response.text();
    expect(text).not.toContain("PRIVATE_SENTINEL");
    expect(JSON.parse(text).items).toEqual([publicCard]);
  });
  it("distinguishes an empty success from sanitized database failure and supports another attempt", async () => {
    listVideosMock.mockRejectedValueOnce(new Error("postgres://SECRET_DATABASE_CONNECTION"));
    const failure = await GET(new Request("https://example.test/api/catalog?page=2"));
    expect(failure.status).toBe(503);
    expect(await failure.text()).not.toContain("SECRET_DATABASE_CONNECTION");
    listVideosMock.mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
    const empty = await GET(new Request("https://example.test/api/catalog?page=2"));
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
  });
});
