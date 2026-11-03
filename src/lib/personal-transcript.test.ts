import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PERSONAL_TRANSCRIPT_BYTES,
  MAX_PERSONAL_TRANSCRIPT_SEGMENTS,
  parsePersonalTranscript,
  PersonalTranscriptError,
  readPersonalTranscriptFile,
} from "./personal-transcript";

const videoId = "abcdefghijk";
const segments = [{ start: 0, end: 2, text: "こんにちは" }];
const parse = (value: unknown) => parsePersonalTranscript(JSON.stringify(value), { videoId });
afterEach(() => vi.unstubAllGlobals());

describe("personal transcript import", () => {
  it("strips imported public rights, evidence, attribution and arbitrary fields", () => {
    const imported = parse({
      videoId, source: "creator_provided", visibility: "public", sharingPermission: "granted",
      permissionNote: "a file cannot grant public rights", attribution: "Do not publish", licenseUrl: "https://example.test",
      segments,
    });
    expect(imported).toEqual({
      videoId, source: "unknown", visibility: "private", sharingPermission: "unknown", segments,
    });
  });

  it("accepts raw Whisper JSON and preserves the machine-generated, unreviewed source", () => {
    const imported = parse({
      language: "ja", task: "transcribe", segments: [
        { id: 1, start: 2, end: 4, text: " 次の文。 ", tokens: [1, 2], avg_logprob: -0.1 },
        { id: 0, start: 0, end: 2, text: "最初の文。", tokens: [] },
      ],
    });
    expect(imported.source).toBe("whisper");
    expect(imported.visibility).toBe("private");
    expect(imported.sharingPermission).toBe("unknown");
    expect(imported.segments).toEqual([
      { start: 0, end: 2, text: "最初の文。" },
      { start: 2, end: 4, text: "次の文。" },
    ]);
  });

  it("accepts generated millisecond cues and duration-based JSON without retaining tokens", () => {
    expect(parse({ youtube_id: videoId, source: "whisper", segments: [
      { start_ms: 500, end_ms: 1800, text: "文", tokens: ["private token metadata"] },
    ] }).segments).toEqual([{ start: 0.5, end: 1.8, text: "文" }]);
    expect(parse([{ start: 1, duration: 2, text: "文" }]).segments).toEqual([
      { start: 1, end: 3, text: "文" },
    ]);
  });

  it.each(["videoId", "youtubeId", "video_id", "youtube_id"])("requires a matching %s when the file identifies its video", (key) => {
    expect(parse({ [key]: videoId, segments }).videoId).toBe(videoId);
    expect(() => parse({ [key]: "zzzzzzzzzzz", segments })).toThrow(/different video/);
    expect(() => parse({ [key]: null, segments })).toThrow(/different video/);
  });

  it("does not ignore conflicting identity aliases", () => {
    expect(() => parse({ videoId, youtubeId: "zzzzzzzzzzz", segments })).toThrow(/different video/);
    expect(() => parse([{ ...segments[0], youtubeId: "zzzzzzzzzzz" }])).toThrow(/different video/);
  });

  it("parses WebVTT identifiers, settings, multiline text, entities and overlaps", () => {
    const content = "\uFEFFWEBVTT\r\nKind: captions\r\n\r\nNOTE local note\r\nnot a cue\r\n\r\nfirst\r\n00:00.500 --> 00:02.000 align:start\r\n<v Speaker><b>猫</b> &amp; 犬\r\n次の行\r\n\r\n00:01.500 --> 00:03.000\r\n重なる文\r\n";
    const imported = parsePersonalTranscript(content, { videoId, fileName: "captions.vtt" });
    expect(imported.segments).toEqual([
      { start: 0.5, end: 2, text: "猫 & 犬\n次の行" },
      { start: 1.5, end: 3, text: "重なる文" },
    ]);
    expect(imported.source).toBe("unknown");
    expect(imported.sharingPermission).toBe("unknown");
  });

  it("parses SRT hours, comma milliseconds and multiline cue text", () => {
    const imported = parsePersonalTranscript("1\n01:02:03,125 --> 01:02:04,250\n日本語\n字幕\n\n2\n01:02:06,000 --> 01:02:07,000\n次\n", { videoId, fileName: "captions.srt" });
    expect(imported.segments).toEqual([
      { start: 3723.125, end: 3724.25, text: "日本語\n字幕" },
      { start: 3726, end: 3727, text: "次" },
    ]);
    expect(imported.visibility).toBe("private");
  });

  it.each([
    { start: -1, end: 2, text: "text" },
    { start: 1, end: 1, text: "text" },
    { start: 2, end: 1, text: "text" },
    { start: "0", end: 1, text: "text" },
    { start: null, end: 1, text: "text" },
    { start: 0, end: Infinity, text: "text" },
    { start: 0, end: 86_401, text: "text" },
    { start: 0, end: 1, text: " " },
    { start: 0, end: 1, text: 12 },
    { start: 0, end: 1, text: "x".repeat(10_001) },
  ])("rejects malformed cue bounds or text: %j", (segment) => {
    expect(() => parse([segment])).toThrow(PersonalTranscriptError);
  });

  it.each([
    "{broken JSON}",
    '{"segments":[{"start":0,"end":1e309,"text":"x"}]}',
    "[]", "{}", "", "un-timed plain text",
    "WEBVTT\n\n00:61.000 --> 01:02.000\nBad minutes",
    "WEBVTT\n\n00:01.000 --> 00:00.000\nReversed",
    "WEBVTT\n\n00:00.000 --> 00:01.000\n",
    "WEBVTT\n\n00:00.000 --> 00:01.000\nOne\n00:01.000 --> 00:02.000\nTwo",
  ])("reports plausible malformed imports without inventing cues", (content) => {
    expect(() => parsePersonalTranscript(content, { videoId })).toThrow(PersonalTranscriptError);
  });

  it("enforces current video, file byte size and segment-count limits", () => {
    expect(() => parsePersonalTranscript("[]", { videoId: "invalid" })).toThrow(/valid current video/);
    expect(() => parsePersonalTranscript("あ".repeat(MAX_PERSONAL_TRANSCRIPT_BYTES / 3 + 1), { videoId })).toThrow(/5 MiB/);
    expect(() => parse(Array(MAX_PERSONAL_TRANSCRIPT_SEGMENTS + 1).fill(segments[0]))).toThrow(/too many cues/);
  });

  it("rejects an oversized File before reading and reports unreadable files", async () => {
    const text = vi.fn().mockResolvedValue("[]");
    await expect(readPersonalTranscriptFile({ size: MAX_PERSONAL_TRANSCRIPT_BYTES + 1, text } as unknown as File, videoId)).rejects.toThrow(/5 MiB/);
    expect(text).not.toHaveBeenCalled();
    await expect(readPersonalTranscriptFile({ size: 1, text: () => Promise.reject(new Error("permission")) } as unknown as File, videoId)).rejects.toThrow(/could not read/);
  });

  it("reads the actual File locally without any fetch or upload", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const file = new File([JSON.stringify({ videoId, visibility: "public", sharingPermission: "granted", segments })], "personal.json", { type: "application/json" });
    const imported = await readPersonalTranscriptFile(file, videoId);
    expect(imported.segments).toEqual(segments);
    expect(imported.visibility).toBe("private");
    expect(imported.sharingPermission).toBe("unknown");
    expect(fetch).not.toHaveBeenCalled();
  });
});
