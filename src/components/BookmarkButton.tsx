"use client";

import { useId, useState } from "react";
import { useBookmarks } from "@/lib/use-bookmarks";
import type { BookmarkResult } from "@/lib/bookmarks";

/** title is used only for the accessible name; storage and requests use youtubeId alone. */
export function BookmarkButton({ youtubeId, title }: { youtubeId: string; title: string }) {
  const { ids, hydrated, toggle } = useBookmarks();
  const saved = ids.includes(youtubeId);
  const [result, setResult] = useState<BookmarkResult | null>(null);
  const feedback = result && (!result.ok || result.saved === saved) ? result.message : "";
  const feedbackId = useId();
  const label = saved ? `Remove ${title} from saved videos` : `Save ${title}`;

  return (
    <div className="bookmark-control">
      <button
        type="button"
        className={`bookmark-button${saved ? " is-saved" : ""}`}
        aria-label={label}
        title={hydrated ? label : "Loading saved videos"}
        aria-pressed={saved}
        aria-describedby={feedback ? feedbackId : undefined}
        disabled={!hydrated}
        onClick={() => setResult(toggle(youtubeId))}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M6 3.5h12v17l-6-4-6 4z" />
        </svg>
      </button>
      <span className="bookmark-feedback" id={feedbackId} role="status">{feedback}</span>
    </div>
  );
}
