import { catalogUrl } from "./catalog-filters";
import type { CatalogFilters, CatalogPage, VideoCardData } from "./catalog-types";

export type CatalogFeedState = {
  items: VideoCardData[];
  total: number;
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  end: "complete" | "changed" | null;
};

/** Selection order and the old public page parameter must not create a new feed. */
export function catalogFeedUrl(filters: CatalogFilters): string {
  return catalogUrl({
    ...filters,
    interests: [...filters.interests].sort(),
    subtopics: [...filters.subtopics].sort(),
  }, 1);
}

export function catalogFeedRequestUrl(filterUrl: string, page: number): string {
  const query = new URL(filterUrl, "https://catalog.invalid").searchParams;
  query.set("page", String(page));
  return `/api/catalog?${query}`;
}

export function initialCatalogFeed(page: CatalogPage): CatalogFeedState {
  const items = uniqueVideos([], page.items);
  const hasMore = items.length > 0 && page.page < page.totalPages && items.length < page.total;
  return {
    items,
    total: page.total,
    page: page.page,
    hasMore,
    loading: false,
    error: null,
    end: hasMore ? null : "complete",
  };
}

function uniqueVideos(existing: VideoCardData[], incoming: VideoCardData[]): VideoCardData[] {
  const ids = new Set(existing.map((video) => video.youtubeId));
  const additions = incoming.filter((video) => {
    if (ids.has(video.youtubeId)) return false;
    ids.add(video.youtubeId);
    return true;
  });
  return [...existing, ...additions];
}

export function appendCatalogPage(
  state: CatalogFeedState,
  incoming: CatalogPage,
  requestedPage: number,
): CatalogFeedState {
  // A clamped response is an older batch, not a new batch to append or retry.
  const clamped = incoming.page !== requestedPage;
  const items = clamped ? state.items : uniqueVideos(state.items, incoming.items);
  const changed = clamped || incoming.total < state.total ||
    (items.length === state.items.length && requestedPage < incoming.totalPages);
  const hasMore = !changed && items.length > state.items.length &&
    incoming.page < incoming.totalPages && items.length < incoming.total;
  return {
    items,
    total: incoming.total,
    page: clamped ? state.page : incoming.page,
    hasMore,
    loading: false,
    error: null,
    end: hasMore ? null : changed ? "changed" : "complete",
  };
}

/** Computed grid tracks are resolved pixels; do not duplicate CSS breakpoints. */
export function resolvedGridColumns(template: string): number {
  const tracks = template.trim().split(/\s+/).filter(Boolean);
  return tracks.length > 0 && tracks.every((track) => /^\d+(?:\.\d+)?px$/.test(track))
    ? tracks.length
    : 1;
}

export function includeFocusedRow(indices: number[], focusedRow: number | null, rowCount: number): number[] {
  if (focusedRow === null || focusedRow < 0 || focusedRow >= rowCount || indices.includes(focusedRow))
    return indices;
  return [...indices, focusedRow].sort((a, b) => a - b);
}

export function catalogRows(items: VideoCardData[], columns: number): VideoCardData[][] {
  columns = Number.isSafeInteger(columns) && columns > 0 ? columns : 1;
  const rows: VideoCardData[][] = [];
  for (let index = 0; index < items.length; index += columns)
    rows.push(items.slice(index, index + columns));
  return rows;
}

/** One controller per normalized filter key. Cancel invalidates even non-cooperative fetches. */
export function createCatalogFeed(
  initialPage: CatalogPage,
  requestPage: (page: number, signal: AbortSignal) => Promise<CatalogPage>,
) {
  let state = initialCatalogFeed(initialPage);
  let generation = 0;
  let active: { abort: AbortController; promise: Promise<void> } | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: CatalogFeedState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    cancel() {
      generation++;
      active?.abort.abort();
      active = null;
      if (state.loading) publish({ ...state, loading: false });
    },
    loadNext(): Promise<void> {
      if (active) return active.promise;
      if (!state.hasMore) return Promise.resolve();
      const requestedPage = state.page + 1;
      const requestGeneration = ++generation;
      const abort = new AbortController();
      publish({ ...state, loading: true, error: null });
      const promise = Promise.resolve().then(async () => {
        if (abort.signal.aborted) return;
        try {
          const page = await requestPage(requestedPage, abort.signal);
          if (generation === requestGeneration && !abort.signal.aborted)
            publish(appendCatalogPage(state, page, requestedPage));
        } catch {
          if (generation === requestGeneration && !abort.signal.aborted)
            publish({ ...state, loading: false, error: "Couldn’t load more videos. Try again." });
        } finally {
          if (generation === requestGeneration) active = null;
        }
      });
      active = { abort, promise };
      return promise;
    },
  };
}

export async function requestCatalogPage(filterUrl: string, page: number, signal: AbortSignal): Promise<CatalogPage> {
  const response = await fetch(catalogFeedRequestUrl(filterUrl, page), {
    signal,
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Catalog request failed");
  const result: CatalogPage = await response.json();
  if (!result || !Array.isArray(result.items) || result.items.length > 20 || result.pageSize !== 20 ||
      !Number.isSafeInteger(result.page) || result.page < 1 ||
      !Number.isSafeInteger(result.total) || result.total < 0 ||
      !Number.isSafeInteger(result.totalPages) || result.totalPages < 0 ||
      result.items.some((video) => !video || typeof video.youtubeId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(video.youtubeId)))
    throw new Error("Invalid catalog response");
  return result;
}
