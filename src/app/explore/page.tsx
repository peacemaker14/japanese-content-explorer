import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listInterests, listVideos } from "@/lib/catalog";
import {
  CatalogFilterError,
  catalogUrl,
  parseCatalogFilters,
} from "@/lib/catalog-filters";
import { CatalogFilterForm } from "@/components/CatalogFilterForm";
import { CatalogPagination } from "@/components/CatalogPagination";
import { VideoCard } from "@/components/VideoCard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  title: "Find Japanese immersion material",
  alternates: { canonical: "/explore" },
};

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let filters;
  try {
    filters = parseCatalogFilters(await searchParams);
  } catch (error) {
    if (!(error instanceof CatalogFilterError)) throw error;
    return (
      <section className="state-panel">
        <h1>Invalid filters</h1>
        <p>
          This link contains a filter we can’t use. Reset the filters to browse
          the catalog.
        </p>
        <Link className="button" href="/explore">
          Reset filters
        </Link>
      </section>
    );
  }
  const [result, interests] = await Promise.all([
    listVideos(filters),
    listInterests(),
  ]);
  if (result.page !== filters.page) redirect(catalogUrl(filters, result.page));
  const returnTo = catalogUrl(filters);
  return (
    <section className="explore-screen">
      <div className="explore-heading">
        <h1>Japanese immersion</h1>
        <p className="result-count">
          {result.total.toLocaleString("en-US")}{" "}
          {result.total === 1 ? "video" : "videos"} matched
        </p>
      </div>
      <CatalogFilterForm
        key={returnTo}
        filters={filters}
        interests={interests}
      />
      {result.items.length > 0 ? (
        <div className="video-grid">
          {result.items.map((video) => (
            <VideoCard
              key={video.youtubeId}
              video={video}
              returnTo={returnTo}
            />
          ))}
        </div>
      ) : (
        <div className="state-panel empty-state">
          <h2>No videos match these filters</h2>
          <p>
            Try another interest or learning difficulty, or clear your filters.
          </p>
          <Link className="button button-secondary" href="/explore">
            Clear filters
          </Link>
        </div>
      )}
      <CatalogPagination
        filters={filters}
        page={result.page}
        totalPages={result.totalPages}
      />
    </section>
  );
}
