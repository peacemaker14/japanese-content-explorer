import { cookies } from "next/headers";
import { listVideos } from "@/lib/catalog";
import { CatalogFilterError, parseCatalogFilters } from "@/lib/catalog-filters";
import { CONSENT_COOKIE } from "@/lib/consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  if ((await cookies()).get(CONSENT_COOKIE)?.value !== "1")
    return Response.json({ error: "Privacy acknowledgment required" }, { status: 401, headers });

  const raw: Record<string, string | string[]> = {};
  const query = new URL(request.url).searchParams;
  for (const key of new Set(query.keys())) {
    const values = query.getAll(key);
    raw[key] = values.length === 1 ? values[0] : values;
  }
  let filters;
  try {
    filters = parseCatalogFilters(raw);
  } catch (error) {
    if (!(error instanceof CatalogFilterError)) throw error;
    return Response.json({ error: "Invalid filters" }, { status: 400, headers });
  }
  try {
    const result = await listVideos(filters);
    // This browser boundary is deliberately card-only, including topic labels.
    // Detail/transcript/curation fields must never hitchhike on a future projection.
    return Response.json({
      items: result.items.map((video) => ({
        youtubeId: video.youtubeId,
        title: video.title,
        channelTitle: video.channelTitle,
        thumbnailUrl: video.thumbnailUrl,
        publishedAt: video.publishedAt,
        durationSeconds: video.durationSeconds,
        viewCount: video.viewCount,
        difficulty: video.difficulty,
        estimatedDifficulty: video.estimatedDifficulty,
        hasSharedTranscript: video.hasSharedTranscript,
        interests: video.interests.map(({ slug, name }) => ({ slug, name })),
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    }, { headers });
  } catch {
    return Response.json({ error: "Couldn’t load videos. Try again." }, { status: 503, headers });
  }
}
