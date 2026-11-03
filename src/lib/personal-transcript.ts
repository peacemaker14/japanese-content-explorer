import type { TranscriptSegment } from "./transcript-types";

export const MAX_PERSONAL_TRANSCRIPT_BYTES = 5 * 1024 * 1024;
export const MAX_PERSONAL_TRANSCRIPT_SEGMENTS = 20_000;
const MAX_CUE_SECONDS = 24 * 60 * 60;
const MAX_CUE_TEXT = 10_000;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export interface PersonalTranscript {
  videoId: string;
  source: "whisper" | "unknown";
  visibility: "private";
  sharingPermission: "unknown";
  segments: TranscriptSegment[];
}

export class PersonalTranscriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersonalTranscriptError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSegment(
  start: unknown,
  end: unknown,
  text: unknown,
  index: number,
): TranscriptSegment {
  if (
    typeof start !== "number" ||
    typeof end !== "number" ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start ||
    end > MAX_CUE_SECONDS
  )
    throw new PersonalTranscriptError(
      `Cue ${index + 1} needs finite timestamps with 0 ≤ start < end, within 24 hours.`,
    );
  if (
    typeof text !== "string" ||
    !text.trim() ||
    text.length > MAX_CUE_TEXT
  )
    throw new PersonalTranscriptError(
      `Cue ${index + 1} needs nonempty text of at most ${MAX_CUE_TEXT.toLocaleString("en-US")} characters.`,
    );
  return { start, end, text: text.trim() };
}

function validateVideoIdentity(value: Record<string, unknown>, videoId: string) {
  for (const key of ["videoId", "youtubeId", "video_id", "youtube_id"]) {
    if (key in value && value[key] !== videoId)
      throw new PersonalTranscriptError(
        "This file identifies a different video. Open that video before importing it.",
      );
  }
}

function jsonSegments(raw: unknown, videoId: string) {
  if (record(raw)) validateVideoIdentity(raw, videoId);
  const values = Array.isArray(raw) ? raw : record(raw) ? raw.segments : null;
  if (!Array.isArray(values) || !values.length)
    throw new PersonalTranscriptError(
      "JSON must contain a nonempty segments array, or be an array of timed cues.",
    );
  if (values.length > MAX_PERSONAL_TRANSCRIPT_SEGMENTS)
    throw new PersonalTranscriptError("The file contains too many cues (maximum 20,000).");
  const isWhisper =
    (record(raw) &&
      (raw.source === "whisper" || raw.transcript_source === "whisper" ||
        raw.task === "transcribe" || raw.task === "translate")) ||
    values.some((value) =>
      record(value) && (Array.isArray(value.tokens) || "avg_logprob" in value),
    );
  const segments = values.map((value: unknown, index: number) => {
    if (!record(value))
      throw new PersonalTranscriptError(`Cue ${index + 1} must be an object.`);
    validateVideoIdentity(value, videoId);
    if ("start_ms" in value || "end_ms" in value) {
      const start = typeof value.start_ms === "number" ? value.start_ms / 1000 : null;
      const end = typeof value.end_ms === "number" ? value.end_ms / 1000 : null;
      return validateSegment(start, end, value.text, index);
    }
    const end = "end" in value
      ? value.end
      : typeof value.start === "number" && typeof value.duration === "number"
        ? value.start + value.duration
        : null;
    return validateSegment(value.start, end, value.text, index);
  });
  return { segments, source: isWhisper ? "whisper" as const : "unknown" as const };
}

function subtitleTime(value: string, format: "vtt" | "srt"): number {
  const pattern = format === "vtt"
    ? /^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$/
    : /^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/;
  const match = pattern.exec(value);
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59)
    throw new PersonalTranscriptError(`Invalid ${format.toUpperCase()} timestamp: use hours:minutes:seconds with milliseconds.`);
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 +
    Number(match[3]) + Number(match[4]) / 1000;
}

function subtitleText(lines: string[]): string {
  return lines.join("\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|apos|nbsp|lrm|rlm|#\d+|#x[\da-f]+);/gi, (entity, code: string) => {
      const named: Record<string, string> = {
        amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
        lrm: "\u200e", rlm: "\u200f",
      };
      const lower = code.toLowerCase();
      if (lower in named) return named[lower];
      const point = lower.startsWith("#x")
        ? Number.parseInt(lower.slice(2), 16)
        : Number.parseInt(lower.slice(1), 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : entity;
    });
}

function subtitleSegments(content: string, format: "vtt" | "srt") {
  const blocks = content.split(/\n[\t ]*\n+/);
  if (format === "vtt") {
    if (!/^WEBVTT(?:[\t ].*)?(?:\n|$)/.test(blocks[0]))
      throw new PersonalTranscriptError("A WebVTT file must begin with WEBVTT.");
    blocks.shift();
  }
  const segments: TranscriptSegment[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    if (!block.trim()) continue;
    if (format === "vtt" && /^(?:NOTE(?:[\t ]|$)|STYLE$|REGION$)/.test(lines[0]))
      continue;
    const timingIndex = lines[0].includes("-->") ? 0 : 1;
    const timing = /^\s*(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(lines[timingIndex] ?? "");
    if (!timing)
      throw new PersonalTranscriptError(`Cue ${segments.length + 1} has no valid timing line.`);
    const textLines = lines.slice(timingIndex + 1);
    if (textLines.some((line) => /\S+\s+-->\s+\S+/.test(line)))
      throw new PersonalTranscriptError("Separate subtitle cues with a blank line.");
    segments.push(validateSegment(
      subtitleTime(timing[1], format),
      subtitleTime(timing[2], format),
      subtitleText(textLines),
      segments.length,
    ));
    if (segments.length > MAX_PERSONAL_TRANSCRIPT_SEGMENTS)
      throw new PersonalTranscriptError("The file contains too many cues (maximum 20,000).");
  }
  if (!segments.length)
    throw new PersonalTranscriptError("The subtitle file contains no timed text.");
  return segments;
}

/** Pure, local parsing. All imported sharing claims are deliberately discarded. */
export function parsePersonalTranscript(
  content: string,
  options: { videoId: string; fileName?: string },
): PersonalTranscript {
  if (!VIDEO_ID.test(options.videoId))
    throw new PersonalTranscriptError("A valid current video is required for import.");
  if (new TextEncoder().encode(content).byteLength > MAX_PERSONAL_TRANSCRIPT_BYTES)
    throw new PersonalTranscriptError("Choose a transcript smaller than 5 MiB.");
  const text = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!text) throw new PersonalTranscriptError("The selected file is empty.");
  const extension = options.fileName?.split(".").pop()?.toLowerCase();
  let segments: TranscriptSegment[];
  let source: PersonalTranscript["source"] = "unknown";
  if (text.startsWith("{") || text.startsWith("[")) {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new PersonalTranscriptError("This JSON file is malformed. Choose a timed transcript JSON, VTT or SRT file.");
    }
    ({ segments, source } = jsonSegments(raw, options.videoId));
  } else if (/^WEBVTT(?:[\t ]|\n|$)/.test(text) || extension === "vtt") {
    segments = subtitleSegments(text, "vtt");
  } else if (extension === "srt" || /^\s*(?:\d+\n)?\d{2,}:\d{2}:\d{2}[,.]\d{3}\s+-->/.test(text)) {
    segments = subtitleSegments(text, "srt");
  } else {
    throw new PersonalTranscriptError("Choose a timed JSON/Whisper JSON, WebVTT (.vtt) or SubRip (.srt) file.");
  }
  segments.sort((a, b) => a.start - b.start);
  return {
    videoId: options.videoId,
    source,
    visibility: "private",
    sharingPermission: "unknown",
    segments,
  };
}

export async function readPersonalTranscriptFile(
  file: File,
  videoId: string,
): Promise<PersonalTranscript> {
  if (file.size > MAX_PERSONAL_TRANSCRIPT_BYTES)
    throw new PersonalTranscriptError("Choose a transcript smaller than 5 MiB.");
  let content: string;
  try {
    content = await file.text();
  } catch {
    throw new PersonalTranscriptError("The browser could not read this file. Select it again or choose another file.");
  }
  return parsePersonalTranscript(content, { videoId, fileName: file.name });
}
