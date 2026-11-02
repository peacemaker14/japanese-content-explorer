"use client";

import Link from "next/link";

export default function ErrorPage({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <section className="state-panel" role="alert">
      <h1>The catalog couldn’t load</h1>
      <p>
        We couldn’t retrieve the latest videos. Your filters are still in the
        address bar. Try again in a moment.
      </p>
      <div className="state-actions">
        <button className="button" type="button" onClick={() => retry()}>
          Try again
        </button>
        <Link className="button button-secondary" href="/">
          Choose interests
        </Link>
      </div>
    </section>
  );
}
