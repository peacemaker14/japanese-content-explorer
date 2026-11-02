import Link from "next/link";

export default function NotFound() {
  return (
    <section className="state-panel">
      <h1>This page isn’t available</h1>
      <p>
        The video may no longer be in the public catalog, or this link may be
        incorrect.
      </p>
      <Link className="button" href="/explore">
        Explore videos
      </Link>
    </section>
  );
}
