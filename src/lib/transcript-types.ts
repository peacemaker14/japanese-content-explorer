export type TranscriptSegment = { start: number; end: number; text: string };
export type Transcript = {
  videoId: string;
  source: "whisper" | "creator_provided";
  visibility: "private" | "public";
  sharingPermission: "unknown" | "granted";
  segments: TranscriptSegment[];
};
export type PublicTranscript = Transcript & {
  visibility: "public";
  sharingPermission: "granted";
  attribution: string;
  licenseUrl: string | null;
};
