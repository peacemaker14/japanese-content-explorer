import { describe, expect, it } from "vitest";
import { createTranscriptCueIndex, formatTranscriptTime } from "./transcript-cues";
import type { TranscriptSegment } from "./transcript-types";

const cue = (start: number, end: number, text = "日本語"): TranscriptSegment => ({ start, end, text });

describe("time-driven transcript cue lookup", () => {
  it("uses inclusive starts and exclusive ends, with no stale highlight in gaps or after the end", () => {
    const index = createTranscriptCueIndex([cue(2, 4), cue(6, 8)]);
    for (const time of [-1, 0, 1.999, 4, 5, 8, 100, NaN, Infinity])
      expect(index.at(time)).toBeNull();
    expect(index.at(2)).toBe(0);
    expect(index.at(3.999)).toBe(0);
    expect(index.at(6)).toBe(1);
    expect(index.at(7.999)).toBe(1);
  });

  it("chooses the latest active start in overlaps, returning to an earlier long cue afterward", () => {
    const index = createTranscriptCueIndex([cue(0, 30), cue(5, 8), cue(6, 7), cue(30, 32)]);
    expect(index.at(5)).toBe(1);
    expect(index.at(6)).toBe(2);
    expect(index.at(7)).toBe(1);
    expect(index.at(8)).toBe(0);
    expect(index.at(29.99)).toBe(0);
    expect(index.at(30)).toBe(3);
    expect(index.at(32)).toBeNull();
  });

  it("keeps original indexes for unsorted input and chooses the first original cue for tied starts", () => {
    const segments = [cue(10, 12), cue(2, 4), cue(10, 13)];
    const index = createTranscriptCueIndex(segments);
    expect(index.at(2)).toBe(1);
    expect(index.at(10)).toBe(0);
    expect(index.at(12)).toBe(2);
    expect(segments[0].start).toBe(10);
  });

  it("finds a long active interval behind many already-ended cues", () => {
    const segments = [cue(0, 100_000), ...Array.from({ length: 10_000 }, (_, i) => cue(i + 1, i + 1.5))];
    const index = createTranscriptCueIndex(segments);
    expect(index.at(50_000)).toBe(0);
    expect(index.at(10_000.25)).toBe(10_000);
    expect(index.at(100_000)).toBeNull();
  });

  it("agrees with a direct interval reference through overlapping cue boundaries", () => {
    const segments = Array.from({ length: 150 }, (_, i) => cue((i * 17) % 100, (i * 17) % 100 + (i % 15) + 0.5));
    const index = createTranscriptCueIndex(segments);
    for (let time = 0; time < 120; time += 0.25) {
      const active = segments
        .map((segment, original) => ({ ...segment, original }))
        .filter((segment) => segment.start <= time && time < segment.end)
        .sort((a, b) => b.start - a.start || a.original - b.original)[0];
      expect(index.at(time)).toBe(active?.original ?? null);
    }
  });

  it("handles an empty transcript and formats readable timestamps", () => {
    expect(createTranscriptCueIndex([]).at(0)).toBeNull();
    expect(formatTranscriptTime(65.8)).toBe("1:05");
    expect(formatTranscriptTime(3661)).toBe("1:01:01");
  });
});
