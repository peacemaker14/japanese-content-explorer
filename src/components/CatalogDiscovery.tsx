"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { CatalogFeed } from "@/components/CatalogFeed";
import { CatalogFilterForm } from "@/components/CatalogFilterForm";
import { CatalogNavigationContext, type CatalogFilterChange } from "@/components/CatalogNavigation";
import { catalogFeedUrl } from "@/lib/catalog-feed";
import { catalogUrl, parseCatalogFilters } from "@/lib/catalog-filters";
import type { CatalogFilters, CatalogPage, InterestWithSubtopics } from "@/lib/catalog-types";

type NavigationIntent = {
  filters: CatalogFilters;
  from: CatalogFilters;
  source: "push" | "history";
  height: number;
};

export function CatalogDiscovery({ filters, interests, initialPage, filterUrl }: {
  filters: CatalogFilters;
  interests: InterestWithSubtopics[];
  initialPage: CatalogPage;
  filterUrl: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [intent, setIntent] = useState<NavigationIntent | null>(null);
  const latestIntent = useRef(filters);
  const latestServer = useRef(filters);
  const resultsElement = useRef<HTMLDivElement>(null);
  // History traversal is owned by Next, outside this hook's transition. Keep its
  // immediate feedback until the server props change; never cache result data.
  const optimisticFilters = intent && (isPending || (intent.source === "history" && intent.from === filters))
    ? intent.filters : filters;
  const serverUrl = catalogFeedUrl(filters);
  const intendedUrl = catalogFeedUrl(optimisticFilters);
  const pending = isPending || intendedUrl !== serverUrl;

  useLayoutEffect(() => {
    latestIntent.current = optimisticFilters;
    latestServer.current = filters;
  }, [filters, optimisticFilters]);

  useEffect(() => {
    const restoreHistory = () => {
      if (window.location.pathname !== "/" && window.location.pathname !== "/explore") return;
      const query = new URLSearchParams(window.location.search);
      const raw: Record<string, string | string[]> = {};
      for (const key of new Set(query.keys())) {
        const values = query.getAll(key);
        raw[key] = values.length === 1 ? values[0] : values;
      }
      try {
        const restored = parseCatalogFilters(raw);
        latestIntent.current = restored;
        setIntent({ filters: restored, from: latestServer.current, source: "history",
          height: resultsElement.current?.getBoundingClientRect().height ?? 0 });
      } catch {
        // The server retains ownership of the existing Invalid filters surface.
      }
    };
    window.addEventListener("popstate", restoreHistory);
    return () => window.removeEventListener("popstate", restoreHistory);
  }, []);

  const navigate = (change: CatalogFilterChange) => {
    const current = latestIntent.current;
    const next = { ...change(current), page: 1 };
    if (catalogFeedUrl(next) === catalogFeedUrl(current)) return;
    latestIntent.current = next;
    // Keep feedback urgent; only RSC navigation belongs to the transition.
    setIntent({ filters: next, from: filters, source: "push",
      height: resultsElement.current?.getBoundingClientRect().height ?? 0 });
    startTransition(() => router.push(catalogUrl(next), { scroll: false }));
  };

  const follow = (event: MouseEvent<HTMLAnchorElement>, change: CatalogFilterChange) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
      event.shiftKey || event.altKey || event.currentTarget.hasAttribute("download") ||
      (event.currentTarget.target && event.currentTarget.target !== "_self")) return;
    event.preventDefault();
    navigate(change);
  };

  return (
    <CatalogNavigationContext.Provider value={{ navigate, follow }}>
      <CatalogFilterForm filters={optimisticFilters} interests={interests} clearHref="/" />
      <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {pending ? "Loading videos…" : `${initialPage.total.toLocaleString("en-US")} ${initialPage.total === 1 ? "video" : "videos"} matched`}
      </p>
      <div className="catalog-results" ref={resultsElement} aria-busy={pending}
        style={pending && intent ? { minHeight: intent.height } : undefined}>
        <CatalogFeed initialPage={initialPage} filterUrl={filterUrl} pending={pending}
          scrollOnFilterChange={intent?.source === "push"} />
      </div>
    </CatalogNavigationContext.Provider>
  );
}
