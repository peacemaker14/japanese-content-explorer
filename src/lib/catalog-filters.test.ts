import { describe, expect, it } from "vitest";
import {
  catalogUrl,
  CatalogFilterError,
  parseCatalogFilters,
  validateReturnTo,
} from "./catalog-filters";
describe("catalog filters", () => {
  it.each([
    { interest: "unknown" },
    { subtopic: "coffee" },
    { sort: "oldest" },
    { duration: "long" },
    { difficulty: "fluent" },
    { difficulty: ["beginner", "advanced"] },
    { difficulty: ["beginner"] },
    { transcript: "private" },
    { transcript: ["available"] },
    { transcript: ["available", "unavailable"] },
    { q: ["one", "two"] },
    { sort: ["newest"] },
    { page: "0" },
    { page: "-1" },
    { page: "1.2" },
    { page: "9007199254740992" },
    { page: " 1" },
    { q: "x".repeat(101) },
  ])("rejects malformed filters %j", (raw) => {
    expect(() => parseCatalogFilters(raw)).toThrow(CatalogFilterError);
  });
  it("defaults to featured while retaining explicit newest and popular in shared URLs", () => {
    expect(parseCatalogFilters({}).sort).toBe("featured");
    expect(catalogUrl(parseCatalogFilters({}))).toBe("/");
    expect(catalogUrl(parseCatalogFilters({ sort: "featured" }))).toBe("/");
    for (const sort of ["newest", "popular"] as const) {
      const filters = parseCatalogFilters({ sort });
      expect(filters.sort).toBe(sort);
      expect(catalogUrl(filters)).toBe(`/?sort=${sort}`);
      expect(validateReturnTo(`/?sort=${sort}&page=4`)).toBe(`/?sort=${sort}`);
    }
  });
  it("round-trips repeated topics, literal search and pagination", () => {
    const filters = parseCatalogFilters({
      interest: ["gaming", "food-cooking", "gaming"],
      subtopic: "food-cooking/coffee",
      q: "  100% _ \\  ",
      sort: "popular",
      duration: "10-plus",
      difficulty: "intermediate",
      transcript: "available",
      page: "3",
    });
    const url = new URL(catalogUrl(filters), "https://example.test");
    expect(url.pathname).toBe("/");
    const raw: Record<string, string[]> = {};
    for (const key of new Set(url.searchParams.keys()))
      raw[key] = url.searchParams.getAll(key);
    expect(url.searchParams.getAll("interest")).toEqual([
      "gaming",
      "food-cooking",
    ]);
    expect(
      parseCatalogFilters({
        interest: raw.interest,
        subtopic: raw.subtopic,
        q: raw.q[0],
        sort: raw.sort[0],
        duration: raw.duration[0],
        difficulty: raw.difficulty[0],
        transcript: raw.transcript[0],
        page: raw.page[0],
      }),
    ).toEqual(filters);
    expect(catalogUrl(filters, 1)).not.toContain("page=");
  });
  it("validates return links with the same parser", () => {
    expect(validateReturnTo("/explore?interest=gaming&page=2")).toBe(
      "/?interest=gaming",
    );
    expect(validateReturnTo("/?transcript=available&difficulty=beginner")).toBe(
      "/?difficulty=beginner&transcript=available",
    );
    expect(validateReturnTo("/saved")).toBe("/saved");
    expect(parseCatalogFilters({}).transcript).toBe("all");
    expect(catalogUrl(parseCatalogFilters({ transcript: "unavailable" }))).toBe("/?transcript=unavailable");
    for (const path of [
      "//evil.test/explore",
      "/explore?interest=unknown",
      "/explore?difficulty=fluent",
      "/explore?page=0",
      "/explore?q=a&q=b",
      "/?transcript=private",
      "/?transcript=available&transcript=unavailable",
      "/explore#x",
      "/saved?next=https://evil.test",
      "/saved?interest=gaming",
      "/saved#section",
      "/saved/",
      "/videos/../saved",
      "//evil.test/saved",
      "/videos/abcdefghijk",
      "/\\evil.test",
      "https://evil.test/explore",
    ])
      expect(validateReturnTo(path)).toBe("/");
  });
});
