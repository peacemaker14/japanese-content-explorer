"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { taxonomy } from "@/lib/taxonomy";

const storageKey = "jce.interests.v1";
const allowed = new Set<string>(taxonomy.map((interest) => interest.slug));
const emptySelection: string[] = [];
let selection = emptySelection;
let serialized: string | null | undefined;
const listeners = new Set<() => void>();
function readSelection() {
  let raw: string | null;
  try {
    raw = localStorage.getItem(storageKey);
  } catch {
    return selection;
  }
  if (raw !== serialized) {
    serialized = raw;
    try {
      const value: unknown = JSON.parse(raw ?? "[]");
      selection = Array.isArray(value)
        ? [
            ...new Set(
              value.filter(
                (slug): slug is string =>
                  typeof slug === "string" && allowed.has(slug),
              ),
            ),
          ]
        : emptySelection;
    } catch {
      selection = emptySelection;
    }
  }
  return selection;
}
function subscribeSelection(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function serverSelection() {
  return emptySelection;
}
function toggle(slug: string) {
  const selected = readSelection();
  const next = selected.includes(slug)
    ? selected.filter((item) => item !== slug)
    : [...selected, slug];
  selection = next;
  try {
    const encoded = JSON.stringify(next);
    localStorage.setItem(storageKey, encoded);
    serialized = encoded;
  } catch {
    try {
      serialized = localStorage.getItem(storageKey);
    } catch {
      /* Keep in-memory choices when storage cannot be read or written. */
    }
  }
  for (const listener of listeners) listener();
}

function InterestIcon({ slug }: { slug: string }) {
  const paths: Record<string, React.ReactNode> = {
    "cars-driving": (
      <>
        <path d="m4 11 2-6h12l2 6v7H4zM4 11h16M7 8h10M7 18v2m10-2v2" />
        <path d="M7 14h2m6 0h2" />
      </>
    ),
    "fitness-movement": (
      <>
        <path d="M3 9v6m3-8v10m12-10v10m3-8v6M6 12h12" />
      </>
    ),
    gaming: (
      <>
        <path d="M7 7h10c3 0 5 10 3 11-2 1-4-3-5-3H9c-1 0-3 4-5 3C2 17 4 7 7 7Z" />
        <path d="M8 10v4m-2-2h4m5-1h.01m3 2h.01" />
      </>
    ),
    "food-cooking": (
      <>
        <path d="M5 3v6c0 2 4 2 4 0V3M7 3v18m10-18c-3 4-3 9 1 9V3Zm1 9v9" />
      </>
    ),
    "travel-culture": (
      <>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[slug]}
    </svg>
  );
}

export function InterestPicker() {
  const selected = useSyncExternalStore(
    subscribeSelection,
    readSelection,
    serverSelection,
  );

  return (
    <form action="/explore" method="get" className="interest-picker">
      <fieldset>
        <legend>Choose what you’re into</legend>
        <div className="interest-options">
          {taxonomy.map((interest) => (
            <label className="interest-option" key={interest.slug}>
              <input
                type="checkbox"
                name="interest"
                value={interest.slug}
                checked={selected.includes(interest.slug)}
                onChange={() => toggle(interest.slug)}
              />
              <InterestIcon slug={interest.slug} />
              <span className="interest-option-copy">
                <span className="interest-option-name">{interest.name}</span>
                <span className="interest-option-examples">
                  {interest.subtopics.map(([, name]) => name).join(", ")}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="picker-actions">
        <button
          className="button"
          type="submit"
          disabled={selected.length === 0}
          aria-describedby="selection-help"
        >
          Explore
        </button>
        <Link className="button button-secondary" href="/explore">
          Explore Everything
        </Link>
      </div>
      <p className="helper" id="selection-help" aria-live="polite">
        {selected.length === 0
          ? "Choose at least one interest, or explore everything."
          : "Your choices are saved on this browser when storage is available."}
      </p>
      <noscript>
        <p className="helper">
          Enable JavaScript to choose interests, or use Explore Everything.
        </p>
      </noscript>
    </form>
  );
}
