"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { taxonomy } from "@/lib/taxonomy";
import { InterestIcon } from "@/components/InterestIcon";

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
