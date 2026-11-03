"use client";

import Link from "next/link";
import {
  useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
  type FocusEvent, type KeyboardEvent,
} from "react";
import { defaultRangeExtractor, useWindowVirtualizer } from "@tanstack/react-virtual";
import { VideoCard } from "@/components/VideoCard";
import { VideoCardSkeleton } from "@/components/CatalogSkeleton";
import {
  catalogRows, createCatalogFeed, includeFocusedRow, requestCatalogPage, resolvedGridColumns,
} from "@/lib/catalog-feed";
import type { CatalogPage, VideoCardData } from "@/lib/catalog-types";

type FeedProps = { initialPage: CatalogPage; filterUrl: string };
type GridLayout = { columns: number; width: number; rowGap: number; columnGap: number; scrollMargin: number };
type FocusedControl = { youtubeId: string; controlIndex: number };
const controls = "a[href],button:not(:disabled),[tabindex]:not([tabindex='-1'])";
const loadAhead = 800;

export function CatalogFeed(props: FeedProps) {
  const previousFilter = useRef(props.filterUrl);
  useEffect(() => {
    if (previousFilter.current !== props.filterUrl) {
      previousFilter.current = props.filterUrl;
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [props.filterUrl]);
  return <CatalogFeedWindow key={props.filterUrl} {...props} />;
}

function CatalogFeedWindow({ initialPage, filterUrl }: FeedProps) {
  const [feed] = useState(() => createCatalogFeed(initialPage,
    (page, signal) => requestCatalogPage(filterUrl, page, signal)));
  const state = useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot);
  const grid = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLDivElement>(null);
  const focusedControl = useRef<FocusedControl | null>(null);
  const pendingFocus = useRef<FocusedControl | null>(null);
  const [focusedVideo, setFocusedVideo] = useState<string | null>(null);
  const [layout, setLayout] = useState<GridLayout | null>(null);
  const [nearEnd, setNearEnd] = useState(false);
  const columns = layout?.columns ?? 1;
  const rows = useMemo(() => catalogRows(state.items, columns), [state.items, columns]);
  const focusedIndex = focusedVideo === null ? -1 : state.items.findIndex((video) => video.youtubeId === focusedVideo);
  const focusedRow = focusedIndex < 0 ? null : Math.floor(focusedIndex / columns);
  const virtualizer = useWindowVirtualizer<HTMLDivElement>({
    count: rows.length,
    enabled: layout !== null,
    estimateSize: () => layout
      ? (layout.width - layout.columnGap * (columns - 1)) / columns * 9 / 16 + 150
      : 400,
    overscan: 2,
    gap: layout?.rowGap ?? 0,
    scrollMargin: layout?.scrollMargin ?? 0,
    getItemKey: (index) => `${columns}:${rows[index][0].youtubeId}`,
    rangeExtractor: (range) => includeFocusedRow(defaultRangeExtractor(range), focusedRow, rows.length),
    useAnimationFrameWithResizeObserver: true,
  });
  const virtualRows = virtualizer.getVirtualItems();

  useLayoutEffect(() => {
    const element = grid.current;
    const measure = probe.current;
    if (!element || !measure) return;
    const updateLayout = () => {
      const style = window.getComputedStyle(measure);
      const next = {
        columns: resolvedGridColumns(style.gridTemplateColumns),
        width: measure.getBoundingClientRect().width,
        rowGap: Number.parseFloat(style.rowGap) || 0,
        columnGap: Number.parseFloat(style.columnGap) || 0,
        scrollMargin: element.getBoundingClientRect().top + window.scrollY,
      };
      setLayout((previous) => previous && Object.keys(next).every((key) =>
        previous[key as keyof GridLayout] === next[key as keyof GridLayout]) ? previous : next);
    };
    updateLayout();
    const observer = new ResizeObserver(updateLayout);
    observer.observe(measure);
    observer.observe(element);
    // A disclosure/font wrapping above the feed changes its document offset.
    if (element.parentElement) observer.observe(element.parentElement);
    observer.observe(document.documentElement);
    window.addEventListener("resize", updateLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateLayout);
    };
  }, []);

  useLayoutEffect(() => {
    virtualizer.measure();
  }, [layout?.width, columns, virtualizer]);

  useEffect(() => () => feed.cancel(), [feed]);

  useEffect(() => {
    if (!trigger.current) return;
    const observer = new IntersectionObserver(([entry]) => setNearEnd(entry.isIntersecting), {
      rootMargin: `${loadAhead}px 0px`,
    });
    observer.observe(trigger.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!layout || !nearEnd || state.loading || state.error || !state.hasMore) return;
    // Recheck geometry after append: the observer may still describe the old end.
    if (trigger.current && trigger.current.getBoundingClientRect().top <= window.innerHeight + loadAhead)
      void feed.loadNext();
  }, [feed, layout, nearEnd, state]);

  const findItem = (youtubeId: string) => grid.current?.querySelector<HTMLElement>(`[data-video-id="${youtubeId}"]`);
  useLayoutEffect(() => {
    const target = pendingFocus.current ?? focusedControl.current;
    if (!target) return;
    if (!pendingFocus.current && document.activeElement !== document.body) return;
    const item = findItem(target.youtubeId);
    const control = item ? Array.from(item.querySelectorAll<HTMLElement>(controls)).at(target.controlIndex) : undefined;
    if (control) {
      control.focus({ preventScroll: true });
      pendingFocus.current = null;
    }
  });

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const item = event.target.closest<HTMLElement>("[data-video-id]");
    if (!item?.dataset.videoId) return;
    focusedControl.current = {
      youtubeId: item.dataset.videoId,
      controlIndex: Array.from(item.querySelectorAll(controls)).indexOf(event.target),
    };
    setFocusedVideo(item.dataset.videoId);
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    focusedControl.current = null;
    setFocusedVideo(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey || !layout) return;
    const item = (event.target as HTMLElement).closest<HTMLElement>("[data-video-id]");
    if (!item?.dataset.videoId) return;
    const localControls = Array.from(item.querySelectorAll<HTMLElement>(controls));
    if (event.target !== localControls[event.shiftKey ? 0 : localControls.length - 1]) return;
    const index = state.items.findIndex((video) => video.youtubeId === item.dataset.videoId);
    const nextVideo = state.items[index + (event.shiftKey ? -1 : 1)];
    if (!nextVideo || findItem(nextVideo.youtubeId)) return;
    event.preventDefault();
    pendingFocus.current = { youtubeId: nextVideo.youtubeId, controlIndex: event.shiftKey ? -1 : 0 };
    focusedControl.current = pendingFocus.current;
    setFocusedVideo(nextVideo.youtubeId);
    virtualizer.scrollToIndex(Math.floor((index + (event.shiftKey ? -1 : 1)) / columns), { align: "auto" });
  };

  const card = (video: VideoCardData) => (
    <div className="catalog-feed-item" data-video-id={video.youtubeId} key={video.youtubeId}>
      <VideoCard video={video} returnTo={filterUrl} />
    </div>
  );

  return (
    <>
      <div className="feed-heading">
        <h2 id="explore-videos">Explore videos</h2>
        <p className="result-count">{state.total.toLocaleString("en-US")} {state.total === 1 ? "video" : "videos"} matched</p>
      </div>
      {state.items.length ? (
        <>
          <div className="catalog-feed" ref={grid} aria-labelledby="explore-videos"
            data-loaded-count={state.items.length} onFocusCapture={onFocus} onBlurCapture={onBlur} onKeyDownCapture={onKeyDown}>
            <div className="video-grid catalog-feed-measure" ref={probe} aria-hidden="true" />
            {layout ? (
              <div className="catalog-feed-window" style={{ height: virtualizer.getTotalSize() }}>
                {virtualRows.map((row) => (
                  <div className="video-grid catalog-feed-row" key={row.key}
                    data-index={row.index} ref={virtualizer.measureElement}
                    style={{ transform: `translateY(${row.start - layout.scrollMargin}px)` }}>
                    {rows[row.index].map(card)}
                  </div>
                ))}
              </div>
            ) : (
              // This same complete first batch is rendered on the server and during hydration.
              <div className="video-grid">{state.items.map(card)}</div>
            )}
          </div>
          <div className="catalog-feed-trigger" ref={trigger} aria-hidden="true" />
          {state.loading && (
            <div className="video-grid catalog-feed-loading" aria-hidden="true">
              {Array.from({ length: columns * 2 }, (_, index) => <VideoCardSkeleton key={index} />)}
            </div>
          )}
          <div className="catalog-feed-status" role="status" aria-live="polite" aria-atomic="true">
            {state.loading ? <span className="visually-hidden">Loading more videos…</span> : state.error ? (
              <><p>{state.error}</p><button className="button button-secondary" type="button" onClick={() => void feed.loadNext()}>Retry loading videos</button></>
            ) : state.end === "changed" ? (
              <><p>The catalog changed while you were browsing.</p><a className="button button-secondary" href={filterUrl}>Refresh results</a></>
            ) : state.end === "complete" ? <p>You’ve reached the end.</p> : <p>Scroll for more videos.</p>}
          </div>
        </>
      ) : (
        <div className="state-panel empty-state">
          <h2>No videos match these filters</h2>
          <p>Try a different topic or keyword. Only currently published videos appear here.</p>
          <Link className="button button-secondary" href="/">Clear filters</Link>
        </div>
      )}
    </>
  );
}
