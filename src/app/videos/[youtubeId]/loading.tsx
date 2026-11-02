export default function Loading() {
  return (
    <section
      className="detail-skeleton"
      aria-busy="true"
      aria-label="Loading video"
    >
      <span className="visually-hidden" role="status">
        Loading video…
      </span>
      <div className="skeleton skeleton-line" aria-hidden="true" />
      <div className="skeleton skeleton-heading" aria-hidden="true" />
      <div className="skeleton skeleton-player" aria-hidden="true" />
      <div className="skeleton skeleton-title" aria-hidden="true" />
    </section>
  );
}
