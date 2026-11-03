"use server";

import { cookies } from "next/headers";
import { CONSENT_COOKIE } from "@/lib/consent";
import type { VideoCardData } from "@/lib/catalog-types";
import { getSavedVideos } from "@/lib/catalog";

export type SavedVideosResult =
  | { status: "ok"; items: VideoCardData[] }
  | { status: "consent-required"; message: string }
  | { status: "error"; message: string };

/** Read-only: browser IDs resolve through the same public predicate as Discover. */
export async function resolveSavedVideos(youtubeIds: string[]): Promise<SavedVideosResult> {
  if ((await cookies()).get(CONSENT_COOKIE)?.value !== "1") {
    return { status: "consent-required", message: "Please acknowledge privacy and terms before loading saved videos." };
  }
  if (
    !Array.isArray(youtubeIds) ||
    youtubeIds.length > 50 ||
    !youtubeIds.every((id) => typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id)) ||
    new Set(youtubeIds).size !== youtubeIds.length
  ) {
    return { status: "error", message: "Saved video IDs could not be read. Reload saved videos and retry." };
  }
  if (youtubeIds.length === 0) return { status: "ok", items: [] };
  try {
    return { status: "ok", items: await getSavedVideos(youtubeIds) };
  } catch {
    return { status: "error", message: "Saved video information could not be loaded. Your saved IDs are unchanged. Please retry." };
  }
}
