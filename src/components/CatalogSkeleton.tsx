export function VideoCardSkeleton() {
  return (
    <div className="skeleton-video">
      <div className="skeleton skeleton-thumbnail" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line skeleton-meta" />
    </div>
  );
}

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
          <VideoCardSkeleton key={index} />
        ))}
      </div>
    </section>
  );
}
