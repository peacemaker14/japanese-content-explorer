import { beforeEach, describe, expect, it, vi } from "vitest";

const { listVideosMock, listCategoriesMock, redirectMock } = vi.hoisted(() => ({
  listVideosMock: vi.fn(), listCategoriesMock: vi.fn(), redirectMock: vi.fn(),
}));
vi.mock("@/lib/catalog", () => ({ listVideos: listVideosMock, listCategories: listCategoriesMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import DiscoverPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  redirectMock.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
});

describe("discovery infinite-feed entry", () => {
  it.each(["1", "9"])("canonicalizes legacy page=%s before loading any batch", async (page) => {
    await expect(DiscoverPage({ searchParams: Promise.resolve({
      interest: "gaming", sort: "popular", transcript: "available", page,
    }) })).rejects.toThrow("REDIRECT:/?interest=gaming&sort=popular&transcript=available");
    expect(listVideosMock).not.toHaveBeenCalled();
    expect(listCategoriesMock).not.toHaveBeenCalled();
  });
});
