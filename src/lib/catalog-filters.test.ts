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
  it("round-trips repeated topics, literal search and pagination", () => {
    const filters = parseCatalogFilters({
      interest: ["gaming", "food-cooking", "gaming"],
      subtopic: "food-cooking/coffee",
      q: "  100% _ \\  ",
      sort: "popular",
      duration: "10-plus",
      difficulty: "intermediate",
      page: "3",
    });
    const url = new URL(catalogUrl(filters), "https://example.test");
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
        page: raw.page[0],
      }),
    ).toEqual(filters);
    expect(catalogUrl(filters, 1)).not.toContain("page=");
  });
  it("validates return links with the same parser", () => {
    expect(validateReturnTo("/explore?interest=gaming&page=2")).toBe(
      "/explore?interest=gaming&page=2",
    );
    for (const path of [
      "//evil.test/explore",
      "/explore?interest=unknown",
      "/explore?difficulty=fluent",
      "/explore?page=0",
      "/explore?q=a&q=b",
      "/explore#x",
      "/videos/abcdefghijk",
      "/\\evil.test",
      "https://evil.test/explore",
    ])
      expect(validateReturnTo(path)).toBe("/explore");
  });
});
