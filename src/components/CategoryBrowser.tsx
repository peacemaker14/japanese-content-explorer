import Link from "next/link";
import { VideoThumbnail } from "@/components/VideoThumbnail";
import { catalogUrl, parseCatalogFilters } from "@/lib/catalog-filters";
import type { CatalogFilters, CategorySummary } from "@/lib/catalog-types";

const defaultFilters = parseCatalogFilters({});

function categoryUrl(slug: string, filters = defaultFilters) {
  return catalogUrl({ ...filters, interests: [slug], subtopics: [], page: 1 });
}

export function CategoryBrowser({
  categories,
  filters = defaultFilters,
}: {
  categories: CategorySummary[];
  filters?: CatalogFilters;
}) {
  return (
    <section
      className="category-browser"
      id="categories"
      aria-labelledby="categories-heading"
    >
      <div className="category-section-heading">
        <h2 id="categories-heading">Browse by category</h2>
        <p>Choose something you already enjoy.</p>
      </div>
      <div className="category-grid">
        {categories.map((category) => (
          <Link
            className="category-card"
            href={categoryUrl(category.slug, filters)}
            key={category.slug}
          >
            {category.cover ? (
              <VideoThumbnail src={category.cover.thumbnailUrl} />
            ) : (
              <div className="category-cover-empty">
                No published videos yet
              </div>
            )}
            <div className="category-card-copy">
              <h3>{category.name}</h3>
              <p className="category-video-count">
                {category.videoCount.toLocaleString("en-US")} YouTube{" "}
                {category.videoCount === 1 ? "video" : "videos"}
              </p>
              <p className="category-description">{category.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function CategoryNavigation({
  categories,
  filters,
}: {
  categories: CategorySummary[];
  filters: CatalogFilters;
}) {
  return (
    <nav className="category-navigation" aria-label="Video categories">
      <Link
        href={catalogUrl({ ...filters, interests: [], subtopics: [], page: 1 })}
        aria-current={filters.interests.length === 0 ? "page" : undefined}
      >
        All categories
      </Link>
      {categories.map((category) => (
        <Link
          key={category.slug}
          href={categoryUrl(category.slug, filters)}
          aria-current={
            filters.interests.length === 1 &&
            filters.interests[0] === category.slug
              ? "page"
              : undefined
          }
          data-selected={filters.interests.includes(category.slug)}
        >
          {category.name}
          <span className="category-navigation-count">
            <span className="visually-hidden">: </span>
            {category.videoCount.toLocaleString("en-US")}
            <span className="visually-hidden"> published videos</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}

export function CategorySubtopics({
  category,
  filters,
}: {
  category: CategorySummary;
  filters: CatalogFilters;
}) {
  return (
    <nav
      className="category-subtopics"
      aria-label={`${category.name} subtopics`}
    >
      <Link
        href={catalogUrl({ ...filters, subtopics: [], page: 1 })}
        aria-current={filters.subtopics.length === 0 ? "page" : undefined}
      >
        All subtopics
      </Link>
      {category.subtopics.map((topic) => {
        const selected = filters.subtopics.includes(topic.slug);
        return (
          <Link
            key={topic.slug}
            href={catalogUrl({
              ...filters,
              subtopics: selected
                ? filters.subtopics.filter((slug) => slug !== topic.slug)
                : [...filters.subtopics, topic.slug],
              page: 1,
            })}
            data-selected={selected}
            aria-label={`${selected ? "Remove" : "Filter by"} ${topic.name}; ${topic.videoCount} published videos`}
          >
            {topic.name}
            <span className="category-navigation-count">
              {topic.videoCount.toLocaleString("en-US")}
            </span>
            {selected && <span className="visually-hidden"> selected</span>}
          </Link>
        );
      })}
    </nav>
  );
}
