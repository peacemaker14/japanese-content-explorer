import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesMock, getSavedVideosMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  getSavedVideosMock: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("@/lib/catalog", () => ({ getSavedVideos: getSavedVideosMock }));

import { resolveSavedVideos } from "./actions";

const first = "abcdefghijk";
const second = "lmnopqrstuv";

beforeEach(() => {
  vi.clearAllMocks();
  cookiesMock.mockResolvedValue({ get: () => ({ value: "1" }) });
  getSavedVideosMock.mockResolvedValue([]);
});

describe("read-only saved video resolution", () => {
  it("checks consent before any catalog query", async () => {
    for (const cookie of [undefined, { value: "0" }, { value: "invalid" }]) {
      cookiesMock.mockResolvedValue({ get: () => cookie });
      expect(await resolveSavedVideos([first])).toMatchObject({ status: "consent-required" });
    }
    expect(getSavedVideosMock).not.toHaveBeenCalled();
  });

  it("rejects oversized, duplicate, malformed, and non-ID payloads before querying", async () => {
    for (const payload of [
      Array.from({ length: 51 }, (_, index) => String(index).padStart(11, "0")),
      [first, first],
      ["invalid"],
      [first, { text: "personal transcript" }],
      null,
    ]) {
      expect(await resolveSavedVideos(payload as string[])).toMatchObject({ status: "error" });
    }
    expect(getSavedVideosMock).not.toHaveBeenCalled();
  });

  it("sends only ordered IDs and does not replace absent public metadata", async () => {
    const publicItem = { youtubeId: second, title: "Public video" };
    getSavedVideosMock.mockResolvedValue([publicItem]);
    expect(await resolveSavedVideos([first, second])).toEqual({ status: "ok", items: [publicItem] });
    expect(getSavedVideosMock).toHaveBeenCalledExactlyOnceWith([first, second]);
  });

  it("accepts a bounded batch of fifty distinct IDs and short-circuits an empty batch", async () => {
    const ids = Array.from({ length: 50 }, (_, index) => String(index).padStart(11, "0"));
    expect(await resolveSavedVideos(ids)).toEqual({ status: "ok", items: [] });
    expect(getSavedVideosMock).toHaveBeenCalledExactlyOnceWith(ids);
    getSavedVideosMock.mockClear();
    expect(await resolveSavedVideos([])).toEqual({ status: "ok", items: [] });
    expect(getSavedVideosMock).not.toHaveBeenCalled();
  });

  it("reports query failure rather than presenting an empty catalog and permits retry", async () => {
    getSavedVideosMock.mockRejectedValueOnce(new Error("private database connection details"));
    const failure = await resolveSavedVideos([first]);
    expect(failure).toMatchObject({ status: "error" });
    expect(JSON.stringify(failure)).not.toContain("private database");
    getSavedVideosMock.mockResolvedValueOnce([]);
    expect(await resolveSavedVideos([first])).toEqual({ status: "ok", items: [] });
  });
});
