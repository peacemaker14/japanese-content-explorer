import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listCategories, listVideos } from "@/lib/catalog";
import {
  CatalogFilterError,
  catalogUrl,
  parseCatalogFilters,
} from "@/lib/catalog-filters";
import { CatalogFilterForm } from "@/components/CatalogFilterForm";
import { CatalogPagination } from "@/components/CatalogPagination";
import { VideoCard } from "@/components/VideoCard";
import {
  CategoryBrowser,
  CategoryNavigation,
  CategorySubtopics,
} from "@/components/CategoryBrowser";

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
  const [result, categories] = await Promise.all([
    listVideos(filters),
    listCategories(),
  ]);
  if (result.page !== filters.page) redirect(catalogUrl(filters, result.page));
  const returnTo = catalogUrl(filters);
  const activeCategory =
    filters.interests.length === 1
      ? categories.find((category) => category.slug === filters.interests[0])
      : undefined;
  const browsingCategories =
    filters.interests.length === 0 &&
    filters.subtopics.length === 0 &&
    filters.page === 1 &&
    !filters.q &&
    filters.difficulty === "all" &&
    filters.duration === "all";
  const clearHref = catalogUrl(
    parseCatalogFilters({ interest: filters.interests }),
  );
  const emptyInventory =
    result.total === 0 &&
    categories.every((category) => category.videoCount === 0);
  const emptyCategory = activeCategory?.videoCount === 0;
  const filterForm = (
    <CatalogFilterForm
      key={returnTo}
      filters={filters}
      interests={categories}
      clearHref={clearHref}
    />
  );
  return (
    <section className="explore-screen">
      {!browsingCategories && (
        <CategoryNavigation categories={categories} filters={filters} />
      )}
      <div className="explore-heading">
        <h1>
          {activeCategory?.name ??
            (filters.interests.length > 1
              ? "Your immersion mix"
              : "Japanese immersion")}
        </h1>
        <p className="result-count">
          {result.total.toLocaleString("en-US")}{" "}
          {result.total === 1 ? "video" : "videos"} matched
        </p>
      </div>
      {activeCategory && (
        <p className="category-context">{activeCategory.description}</p>
      )}
      {browsingCategories && (
        <CategoryBrowser categories={categories} filters={filters} />
      )}
      {activeCategory && (
        <CategorySubtopics category={activeCategory} filters={filters} />
      )}
      {activeCategory ? (
        <details
          className="category-refinements"
          open={
            Boolean(filters.q) ||
            filters.difficulty !== "all" ||
            filters.duration !== "all" ||
            filters.sort !== "newest"
          }
        >
          <summary>Filter videos</summary>
          {filterForm}
        </details>
      ) : (
        filterForm
      )}
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
          <h2>
            {emptyInventory
              ? "No published videos yet"
              : emptyCategory
                ? "No published videos in this category yet"
                : "No videos match these filters"}
          </h2>
          <p>
            {emptyInventory
              ? "Published immersion material will appear here. You can save your interests for a later visit."
              : emptyCategory
                ? "Choose another category to find immersion material."
                : "Try another subtopic or learning difficulty, or reset the filters for this category."}
          </p>
          <Link
            className="button button-secondary"
            href={
              emptyInventory
                ? "/#mix-interests"
                : emptyCategory
                  ? "/explore"
                  : clearHref
            }
          >
            {emptyInventory
              ? "Choose interests"
              : emptyCategory
                ? "Browse categories"
                : "Clear filters"}
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
