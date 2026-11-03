import type { TranscriptSegment } from "./transcript-types";

export interface TranscriptCueIndex {
  /** Half-open intervals [start,end); the latest start wins an overlap. */
  at(seconds: number): number | null;
}

/** Build once per transcript; every clock lookup is O(log n), including gaps. */
export function createTranscriptCueIndex(
  segments: readonly TranscriptSegment[],
): TranscriptCueIndex {
  const ordered = segments
    .map((segment, index) => ({ ...segment, index }))
    .sort((a, b) => a.start - b.start || b.index - a.index);
  let leaves = 1;
  while (leaves < ordered.length) leaves *= 2;
  const maxEnd = new Float64Array(leaves * 2);
  maxEnd.fill(-Infinity);
  for (let index = 0; index < ordered.length; index++)
    maxEnd[leaves + index] = ordered[index].end;
  for (let node = leaves - 1; node > 0; node--)
    maxEnd[node] = Math.max(maxEnd[node * 2], maxEnd[node * 2 + 1]);

  function rightmost(
    node: number,
    left: number,
    right: number,
    limit: number,
    seconds: number,
  ): number {
    if (left > limit || maxEnd[node] <= seconds) return -1;
    if (left === right) return left;
    const middle = (left + right) >>> 1;
    const found = rightmost(node * 2 + 1, middle + 1, right, limit, seconds);
    return found >= 0
      ? found
      : rightmost(node * 2, left, middle, limit, seconds);
  }

  return {
    at(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0 || !ordered.length)
        return null;
      let low = 0;
      let high = ordered.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (ordered[middle].start <= seconds) low = middle + 1;
        else high = middle;
      }
      if (low === 0) return null;
      const found = rightmost(1, 0, leaves - 1, low - 1, seconds);
      return found < 0 ? null : ordered[found].index;
    },
  };
}

export function formatTranscriptTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = String(whole % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`
    : `${minutes}:${remainder}`;
}
