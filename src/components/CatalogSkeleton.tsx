export function CatalogSkeleton() {
  return (
    <section
      className="catalog-skeleton"
      aria-busy="true"
      aria-label="Loading videos"
    >
      <span className="visually-hidden" role="status">
        Loading videos…
      </span>
      <div className="skeleton skeleton-heading" aria-hidden="true" />
      <div className="skeleton skeleton-filters" aria-hidden="true" />
      <div className="video-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="skeleton-video" key={index}>
            <div className="skeleton skeleton-thumbnail" />
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-line" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function CategorySkeleton() {
  return (
    <section
      className="category-skeleton"
      aria-busy="true"
      aria-label="Loading categories"
    >
      <span className="visually-hidden" role="status">
        Loading categories…
      </span>
      <div className="skeleton skeleton-heading" aria-hidden="true" />
      <div className="category-grid" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index}>
            <div className="skeleton skeleton-thumbnail" />
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-line" />
          </div>
        ))}
      </div>
    </section>
  );
}
