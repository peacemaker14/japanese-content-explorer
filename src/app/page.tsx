import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listCategories, listVideos } from "@/lib/catalog";
import { CatalogFilterError, catalogUrl, parseCatalogFilters } from "@/lib/catalog-filters";
import { CatalogFilterForm } from "@/components/CatalogFilterForm";
import { CatalogPagination } from "@/components/CatalogPagination";
import { VideoCard } from "@/components/VideoCard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  title: { absolute: "Yorimichi — Discover Japanese videos" },
  alternates: { canonical: "/" },
};

export default async function DiscoverPage({ searchParams }: {
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
        <p>This link contains a filter we can’t use. Reset the filters to discover videos.</p>
        <Link className="button" href="/">Reset filters</Link>
      </section>
    );
  }
  const [result, interests] = await Promise.all([listVideos(filters), listCategories()]);
  if (result.page !== filters.page) redirect(catalogUrl(filters, result.page));
  const returnTo = catalogUrl(filters);
  return (
    <section className="discover-screen">
      <header className="discover-hero">
        <h1>Follow your curiosity.</h1>
        <p>Discover Japanese videos about things you already love.</p>
      </header>
      <CatalogFilterForm key={returnTo} filters={filters} interests={interests} clearHref="/" />
      <div className="feed-heading">
        <h2 id="explore-videos">Explore videos</h2>
        <p className="result-count">{result.total.toLocaleString("en-US")} {result.total === 1 ? "video" : "videos"} matched</p>
      </div>
      {result.items.length ? (
        <div className="video-grid" aria-labelledby="explore-videos">
          {result.items.map((video) => <VideoCard key={video.youtubeId} video={video} returnTo={returnTo} />)}
        </div>
      ) : (
        <div className="state-panel empty-state">
          <h2>No videos match these filters</h2>
          <p>Try a different topic or keyword. Only currently published videos appear here.</p>
          <Link className="button button-secondary" href="/">Clear filters</Link>
        </div>
      )}
      <CatalogPagination filters={filters} page={result.page} totalPages={result.totalPages} />
    </section>
  );
}
