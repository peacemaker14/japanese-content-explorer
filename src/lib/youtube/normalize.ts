import { z } from "zod";
import { youtubeIdPattern } from "../taxonomy";

export interface NormalizedVideo {
  youtubeId: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  durationSeconds: number;
  viewCount: string | null;
  defaultAudioLanguage: string | null;
  embeddable: true;
  madeForKids: boolean | null;
  languageStatus: "unverified" | "likely_ja";
}

const nonempty = z.string().refine((value) => value.trim().length > 0);
const videoSchema = z.object({
  id: z.string().regex(youtubeIdPattern),
  snippet: z.object({
    title: nonempty,
    description: z.string(),
    channelId: nonempty,
    channelTitle: nonempty,
    publishedAt: z.iso.datetime({ offset: true }),
    defaultAudioLanguage: nonempty.optional(),
    thumbnails: z.record(z.string(), z.unknown()).optional(),
  }),
  contentDetails: z.object({ duration: z.string() }),
  statistics: z
    .object({ viewCount: z.string().regex(/^\d+$/).optional() })
    .optional(),
  status: z.object({
    privacyStatus: z.literal("public"),
    embeddable: z.literal(true),
    madeForKids: z.boolean().optional(),
  }),
});

/** ISO 8601's fixed-length day/hour/minute/second subset; no calendar months. */
export function parseDuration(value: string): number | null {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    value,
  );
  if (
    !match ||
    !match.slice(1).some((part) => part !== undefined) ||
    value.endsWith("T")
  )
    return null;
  const seconds =
    Number(match[1] ?? 0) * 86400 +
    Number(match[2] ?? 0) * 3600 +
    Number(match[3] ?? 0) * 60 +
    Number(match[4] ?? 0);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

function thumbnail(
  thumbnails: Record<string, unknown> | undefined,
): string | null {
  for (const size of ["maxres", "standard", "high", "medium", "default"]) {
    const image = z.object({ url: z.string() }).safeParse(thumbnails?.[size]);
    if (!image.success) continue;
    try {
      const url = new URL(image.data.url);
      if (
        url.protocol === "https:" &&
        url.hostname === "i.ytimg.com" &&
        !url.username &&
        !url.password &&
        !url.port
      )
        return image.data.url;
    } catch {
      /* An invalid optional thumbnail does not invalidate a video. */
    }
  }
  return null;
}

export function normalizeVideo(raw: unknown): NormalizedVideo | null {
  const parsed = videoSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { id, snippet, contentDetails, statistics, status } = parsed.data;
  const durationSeconds = parseDuration(contentDetails.duration);
  if (
    durationSeconds === null ||
    durationSeconds < 240 ||
    durationSeconds > 1200
  )
    return null;
  const viewCount =
    statistics?.viewCount === undefined
      ? null
      : BigInt(statistics.viewCount).toString();
  if (viewCount !== null && BigInt(viewCount) > BigInt("9223372036854775807"))
    return null;
  const defaultAudioLanguage = snippet.defaultAudioLanguage ?? null;
  return {
    youtubeId: id,
    title: snippet.title,
    description: snippet.description,
    channelId: snippet.channelId,
    channelTitle: snippet.channelTitle,
    thumbnailUrl: thumbnail(snippet.thumbnails),
    publishedAt: new Date(snippet.publishedAt).toISOString(),
    durationSeconds,
    viewCount,
    defaultAudioLanguage,
    embeddable: true,
    madeForKids: status.madeForKids ?? null,
    languageStatus:
      defaultAudioLanguage && /^ja(?:-|$)/i.test(defaultAudioLanguage)
        ? "likely_ja"
        : "unverified",
  };
}
