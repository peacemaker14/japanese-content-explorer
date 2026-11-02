import { describe, expect, it } from "vitest";
import { normalizeVideo, parseDuration } from "./normalize";

function raw(duration = "PT4M") {
  return {
    id: "abcdefghijk",
    snippet: {
      title: " 元の日本語 title ",
      description: "Original\nsource text",
      channelId: "UCchannel",
      channelTitle: "Channel",
      publishedAt: "2026-01-01T00:00:00Z",
      defaultAudioLanguage: "ja-JP",
    },
    contentDetails: { duration },
    statistics: { viewCount: "9007199254740993" },
    status: { privacyStatus: "public", embeddable: true, madeForKids: false },
  };
}

describe("normalizeVideo", () => {
  it.each([
    ["PT4M", 240],
    ["PT20M", 1200],
  ])("accepts inclusive duration %s", (duration, seconds) => {
    const video = normalizeVideo(raw(duration));
    expect(video?.durationSeconds).toBe(seconds);
    expect(video?.viewCount).toBe("9007199254740993");
    expect(video?.title).toBe(" 元の日本語 title ");
    expect(video?.description).toBe("Original\nsource text");
    expect(video?.languageStatus).toBe("likely_ja");
  });
  it.each(["PT3M59S", "PT20M1S", "not-a-duration", "P1D", "PT", "P", "PT0S"])(
    "rejects unsuitable duration %s",
    (duration) => {
      expect(normalizeVideo(raw(duration))).toBeNull();
    },
  );
  it("supports days/hours/minutes/seconds without calendar guessing", () => {
    expect(parseDuration("P1DT2H3M4S")).toBe(93784);
    expect(parseDuration("PT1H")).toBe(3600);
    expect(parseDuration("P1M")).toBeNull();
    expect(parseDuration("P1DT")).toBeNull();
  });
  it("keeps absent optional metadata null and does not infer Japanese from a title", () => {
    const input = raw();
    const snippet: Partial<typeof input.snippet> = { ...input.snippet };
    const status: Partial<typeof input.status> = { ...input.status };
    delete snippet.defaultAudioLanguage;
    delete status.madeForKids;
    const video = normalizeVideo({ ...input, snippet, status, statistics: {} });
    expect(video).toMatchObject({
      viewCount: null,
      defaultAudioLanguage: null,
      thumbnailUrl: null,
      madeForKids: null,
      languageStatus: "unverified",
    });
  });
  it("rejects missing essentials, private/nonembeddable videos and overflowing counts", () => {
    const input = raw();
    expect(
      normalizeVideo({ ...input, snippet: { ...input.snippet, title: "" } }),
    ).toBeNull();
    expect(
      normalizeVideo({
        ...input,
        snippet: { ...input.snippet, description: undefined },
      }),
    ).toBeNull();
    expect(
      normalizeVideo({
        ...input,
        status: { ...input.status, embeddable: false },
      }),
    ).toBeNull();
    expect(
      normalizeVideo({
        ...input,
        status: { ...input.status, privacyStatus: "private" },
      }),
    ).toBeNull();
    expect(
      normalizeVideo({
        ...input,
        statistics: { viewCount: "9223372036854775808" },
      }),
    ).toBeNull();
  });
  it("accepts only safe supplied YouTube thumbnails", () => {
    const input = raw();
    expect(
      normalizeVideo({
        ...input,
        snippet: {
          ...input.snippet,
          thumbnails: {
            high: { url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg" },
          },
        },
      })?.thumbnailUrl,
    ).toBe("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg");
    expect(
      normalizeVideo({
        ...input,
        snippet: {
          ...input.snippet,
          thumbnails: { high: { url: "https://evil.example/image.jpg" } },
        },
      })?.thumbnailUrl,
    ).toBeNull();
  });
});
