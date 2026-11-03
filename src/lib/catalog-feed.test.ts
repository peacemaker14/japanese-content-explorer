import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultRangeExtractor } from "@tanstack/react-virtual";
import {
  appendCatalogPage, catalogFeedRequestUrl, catalogFeedUrl, catalogRows, createCatalogFeed,
  includeFocusedRow, initialCatalogFeed, requestCatalogPage, resolvedGridColumns,
} from "./catalog-feed";
import { parseCatalogFilters } from "./catalog-filters";
import type { CatalogPage, VideoCardData } from "./catalog-types";

function video(index: number): VideoCardData {
  return {
    youtubeId: String(index).padStart(11, "0"),
    title: `日本語の動画 ${index}`,
    channelTitle: "Public channel",
    thumbnailUrl: null,
    publishedAt: "2026-01-01T00:00:00.000Z",
    durationSeconds: 600,
    viewCount: null,
    difficulty: "unassessed",
    hasSharedTranscript: index < 3,
    interests: [{ slug: "gaming", name: "Gaming" }],
  };
}
function page(number: number, total = 81): CatalogPage {
  return {
    items: Array.from({ length: Math.max(0, Math.min(20, total - (number - 1) * 20)) },
      (_, index) => video((number - 1) * 20 + index)),
    page: number, total, pageSize: 20, totalPages: Math.ceil(total / 20),
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("normalized infinite feed URLs", () => {
  it("removes old pages, keeps literal search and all facets, and normalizes selection order", () => {
    const filters = parseCatalogFilters({
      interest: ["gaming", "food-cooking"], subtopic: "food-cooking/coffee", q: " 100% _ ",
      sort: "newest", duration: "10-plus", difficulty: "advanced", transcript: "available", page: "9",
    });
    const url = catalogFeedUrl(filters);
    expect(url).toBe(catalogFeedUrl({ ...filters, interests: ["food-cooking", "gaming"] }));
    const query = new URL(catalogFeedRequestUrl(url, 2), "https://example.test").searchParams;
    expect(url).not.toContain("page=");
    expect(query.getAll("interest")).toEqual(["food-cooking", "gaming"]);
    expect(query.get("q")).toBe("100% _");
    expect(query.get("sort")).toBe("newest");
    expect(query.get("duration")).toBe("10-plus");
    expect(query.get("difficulty")).toBe("advanced");
    expect(query.get("transcript")).toBe("available");
    expect(query.get("subtopic")).toBe("food-cooking/coffee");
    expect(query.get("page")).toBe("2");
    expect(filters.page).toBe(9);
  });
  it("keeps featured implicit while retaining an explicit popular sort", () => {
    expect(catalogFeedUrl(parseCatalogFilters({}))).toBe("/");
    expect(catalogFeedRequestUrl(catalogFeedUrl(parseCatalogFilters({ sort: "popular" })), 3))
      .toBe("/api/catalog?sort=popular&page=3");
  });
});

describe("responsive rows and focus retention", () => {
  it.each([1, 2, 3])("groups every card exactly once into %i-column rows", (columns) => {
    const items = page(1).items;
    const rows = catalogRows(items, columns);
    expect(rows.flat()).toEqual(items);
    expect(rows).toHaveLength(Math.ceil(items.length / columns));
    expect(rows.every((row) => row.length > 0 && row.length <= columns)).toBe(true);
  });
  it("uses resolved CSS tracks rather than a second breakpoint convention", () => {
    expect(resolvedGridColumns("342.5px 342.5px 342.5px")).toBe(3);
    expect(resolvedGridColumns(" 280px 280px ")).toBe(2);
    expect(resolvedGridColumns("360px")).toBe(1);
    expect(resolvedGridColumns("none")).toBe(1);
    expect(catalogRows(page(1).items.slice(0, 2), 0)).toHaveLength(2);
  });
  it("pins only the focused row without mounting the intervening offscreen rows", () => {
    const visible = defaultRangeExtractor({ startIndex: 20, endIndex: 22, overscan: 2, count: 100 });
    const retained = includeFocusedRow(visible, 1, 100);
    expect(retained).toEqual([1, 18, 19, 20, 21, 22, 23, 24]);
    expect(includeFocusedRow(visible, 20, 100)).toBe(visible);
    expect(includeFocusedRow(visible, null, 100)).toBe(visible);
    expect(includeFocusedRow(visible, 100, 100)).toBe(visible);
  });
});

describe("infinite feed paging state", () => {
  it("loads beyond three batches without repeating a promoted ID", () => {
    let state = initialCatalogFeed(page(1));
    const second = page(2);
    second.items = [video(0), ...second.items.slice(1)];
    state = appendCatalogPage(state, second, 2);
    state = appendCatalogPage(state, page(3), 3);
    state = appendCatalogPage(state, page(4), 4);
    expect(state.items).toHaveLength(79);
    expect(new Set(state.items.map((item) => item.youtubeId)).size).toBe(79);
    expect(state.items.filter((item) => item.youtubeId === video(0).youtubeId)).toHaveLength(1);
    expect(state.items.slice(0, 3).every((item) => item.hasSharedTranscript)).toBe(true);
    expect(state.hasMore).toBe(true);
    state = appendCatalogPage(state, page(5), 5);
    expect(state.items).toHaveLength(80);
    expect(state).toMatchObject({ hasMore: false, end: "complete", loading: false });
  });
  it("does not append an out-of-range clamped batch and stops when totals shrink", () => {
    const initial = initialCatalogFeed(page(1));
    const clamped = appendCatalogPage(initial, page(1, 10), 2);
    expect(clamped.items).toBe(initial.items);
    expect(clamped).toMatchObject({ total: 10, hasMore: false, end: "changed" });
    expect(appendCatalogPage(initial, page(2, 40), 2)).toMatchObject({ total: 40, hasMore: false, end: "changed" });
  });
  it("terminates no-progress and empty responses rather than requesting indefinitely", () => {
    const initial = initialCatalogFeed(page(1));
    expect(appendCatalogPage(initial, { ...page(2), items: initial.items }, 2))
      .toMatchObject({ hasMore: false, end: "changed" });
    expect(appendCatalogPage(initial, { ...page(2), items: [] }, 2))
      .toMatchObject({ hasMore: false, end: "changed" });
    expect(initialCatalogFeed(page(1, 0))).toMatchObject({ items: [], hasMore: false, end: "complete" });
  });
  it("coalesces simultaneous requests and only advances after a successful result", async () => {
    const pending = Promise.withResolvers<CatalogPage>();
    const request = vi.fn<(page: number, signal: AbortSignal) => Promise<CatalogPage>>(() => pending.promise);
    const feed = createCatalogFeed(page(1), request);
    const first = feed.loadNext();
    expect(feed.loadNext()).toBe(first);
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(2);
    expect(feed.getSnapshot()).toMatchObject({ page: 1, loading: true });
    pending.resolve(page(2));
    await first;
    expect(feed.getSnapshot()).toMatchObject({ page: 2, loading: false });
    expect(feed.getSnapshot().items).toHaveLength(40);
  });
  it("retains cards on failure and retries the same batch only on demand", async () => {
    const request = vi.fn<(page: number, signal: AbortSignal) => Promise<CatalogPage>>()
      .mockRejectedValueOnce(new Error("private server details"))
      .mockResolvedValueOnce(page(2));
    const feed = createCatalogFeed(page(1), request);
    await feed.loadNext();
    expect(feed.getSnapshot()).toMatchObject({ page: 1, loading: false, hasMore: true });
    expect(feed.getSnapshot().error).toContain("Try again");
    expect(feed.getSnapshot().error).not.toContain("private");
    expect(request).toHaveBeenCalledTimes(1);
    await feed.loadNext();
    expect(request.mock.calls.map(([number]) => number)).toEqual([2, 2]);
    expect(feed.getSnapshot()).toMatchObject({ page: 2, error: null });
  });
  it("aborts replaced filters and ignores a late non-cooperative response", async () => {
    const oldResponse = Promise.withResolvers<CatalogPage>();
    const request = vi.fn<(page: number, signal: AbortSignal) => Promise<CatalogPage>>(() => oldResponse.promise);
    const oldFeed = createCatalogFeed(page(1), request);
    const inFlight = oldFeed.loadNext();
    await Promise.resolve();
    const signal = request.mock.calls[0][1];
    oldFeed.cancel();
    expect(signal.aborted).toBe(true);
    const replacement = createCatalogFeed({ ...page(1), items: [video(900)] }, vi.fn());
    oldResponse.resolve(page(2));
    await inFlight;
    expect(oldFeed.getSnapshot().items).toHaveLength(20);
    expect(replacement.getSnapshot().items.map((item) => item.youtubeId)).toEqual([video(900).youtubeId]);
  });
  it("does not request again after a clamped result and can resume after effect cleanup", async () => {
    const request = vi.fn().mockResolvedValue(page(1, 10));
    const feed = createCatalogFeed(page(1), request);
    feed.cancel();
    await feed.loadNext();
    await feed.loadNext();
    expect(request).toHaveBeenCalledTimes(1);
    expect(feed.getSnapshot()).toMatchObject({ hasMore: false, end: "changed" });
  });
});

describe("public batch transport", () => {
  it("requests only normalized filters with no-store and forwards cancellation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(page(2)));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    expect(await requestCatalogPage("/?interest=gaming&transcript=available", 2, signal)).toEqual(page(2));
    expect(fetchMock).toHaveBeenCalledWith("/api/catalog?interest=gaming&transcript=available&page=2", {
      signal, cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" },
    });
  });
  it("rejects HTTP failures and malformed pagination instead of showing an empty success", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ...page(2), page: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    await expect(requestCatalogPage("/", 2, signal)).rejects.toThrow("Catalog request failed");
    await expect(requestCatalogPage("/", 2, signal)).rejects.toThrow("Invalid catalog response");
  });
});
