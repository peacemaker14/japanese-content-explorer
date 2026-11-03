"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PublicTranscript } from "@/lib/transcript-types";
import type { PersonalTranscript } from "@/lib/personal-transcript";
import type { PersonalTranscriptNotice } from "@/lib/use-personal-transcript";
import { formatTranscriptTime } from "@/lib/transcript-cues";

interface TranscriptReaderProps {
  transcript: PublicTranscript | PersonalTranscript | null;
  shared: PublicTranscript | null;
  personal: PersonalTranscript | null;
  preferPersonal: boolean;
  activeIndex: number | null;
  canSeek: boolean;
  embedAllowed: boolean;
  restoring: boolean;
  busy: boolean;
  canClearSaved: boolean;
  notice: PersonalTranscriptNotice | null;
  onPreferPersonal: (personal: boolean) => void;
  onSeek: (seconds: number) => void;
  onImport: (file: File) => void;
  onRemove: () => void;
}

function safeLicenseUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function TranscriptReader({
  transcript,
  shared,
  personal,
  preferPersonal,
  activeIndex,
  canSeek,
  embedAllowed,
  restoring,
  busy,
  canClearSaved,
  notice,
  onPreferPersonal,
  onSeek,
  onImport,
  onRemove,
}: TranscriptReaderProps) {
  const id = useId();
  const list = useRef<HTMLOListElement>(null);
  const lines = useRef(new Map<number, HTMLButtonElement>());
  const expectedScrollTop = useRef<number | null>(null);
  const [following, setFollowing] = useState<PublicTranscript | PersonalTranscript | null>(null);
  const autoFollow = transcript !== null && following === transcript;
  const licenseUrl = transcript?.visibility === "public"
    ? safeLicenseUrl(transcript.licenseUrl) : null;

  function pauseFollow() {
    expectedScrollTop.current = null;
    setFollowing(null);
  }

  useEffect(() => {
    if (!autoFollow || activeIndex === null) return;
    const panel = list.current;
    const line = lines.current.get(activeIndex);
    if (!panel || !line || panel.contains(document.activeElement)) return;
    const viewport = panel.getBoundingClientRect();
    const bounds = line.getBoundingClientRect();
    const top = viewport.top + panel.clientTop;
    const bottom = top + panel.clientHeight;
    let delta = 0;
    if (bounds.top < top) delta = bounds.top - top - 12;
    else if (bounds.bottom > bottom) delta = bounds.bottom - bottom + 12;
    if (delta === 0) return;
    // Intentionally instant, including under reduced motion. Never use
    // scrollIntoView: it can scroll the entire page and steal reading position.
    panel.scrollTop += delta;
    expectedScrollTop.current = panel.scrollTop;
  }, [activeIndex, autoFollow, transcript]);

  return (
    <section className="transcript-panel" aria-labelledby={`${id}-heading`}>
      <div className="transcript-toolbar">
        <h2 id={`${id}-heading`}>Transcript</h2>
        {transcript && (
          <button
            type="button"
            className="btn btn--quiet"
            aria-pressed={autoFollow}
            aria-controls={`${id}-sentences`}
            onClick={() => setFollowing(autoFollow ? null : transcript)}
          >
            Auto-follow: {autoFollow ? "On" : "Off"}
          </button>
        )}
      </div>

      {!shared && (
        <p className="transcript-empty">
          No authorized shared transcript is available for this video. You can
          import your own timed file privately below.
        </p>
      )}

      {shared && personal && (
        <fieldset className="transcript-source">
          <legend>Read transcript</legend>
          <label>
            <input
              type="radio"
              name={`${id}-source`}
              checked={!preferPersonal}
              onChange={() => { pauseFollow(); onPreferPersonal(false); }}
            />
            Shared transcript
          </label>
          <label>
            <input
              type="radio"
              name={`${id}-source`}
              checked={preferPersonal}
              onChange={() => { pauseFollow(); onPreferPersonal(true); }}
            />
            Personal file
          </label>
        </fieldset>
      )}

      {transcript && (
        <>
          <p className="transcript-status">
            {transcript.source === "whisper"
              ? "Whisper machine-generated transcript, unreviewed. It may contain errors."
              : transcript.visibility === "public"
                ? "Creator-provided transcript."
                : "Personal file. Source and accuracy are unverified."}
          </p>
          <p className="transcript-status" id={`${id}-help`}>
            {canSeek
              ? "Select a sentence to seek without starting paused playback."
              : embedAllowed
                ? "Sentence seeking is available when the YouTube player is ready."
                : "Read here; playback and seeking are available only on YouTube for this video."}
            {" "}Auto-follow starts off. Scrolling or focusing the reader turns it off.
          </p>
          <ol
            ref={list}
            id={`${id}-sentences`}
            className="transcript-list"
            tabIndex={0}
            aria-label="Transcript sentences"
            aria-describedby={`${id}-help`}
            onWheel={pauseFollow}
            onTouchStart={pauseFollow}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) pauseFollow();
            }}
            onFocusCapture={pauseFollow}
            onKeyDown={(event) => {
              if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key))
                pauseFollow();
            }}
            onScroll={() => {
              const panel = list.current;
              if (!panel) return;
              if (expectedScrollTop.current !== null &&
                Math.abs(panel.scrollTop - expectedScrollTop.current) < 2) {
                expectedScrollTop.current = null;
                return;
              }
              pauseFollow();
            }}
          >
            {transcript.segments.map((segment, index) => {
              const active = activeIndex === index;
              const time = formatTranscriptTime(segment.start);
              return (
                <li key={index}>
                  <button
                    ref={(node) => {
                      if (node) lines.current.set(index, node);
                      else lines.current.delete(index);
                    }}
                    className={`transcript-line${active ? " is-active" : ""}`}
                    type="button"
                    disabled={!canSeek}
                    aria-current={active ? "true" : undefined}
                    aria-label={`Seek to ${time}. ${segment.text}`}
                    onClick={() => onSeek(segment.start)}
                  >
                    <span className="transcript-timestamp">{time}</span>
                    <span lang={transcript.visibility === "public" ? "ja" : undefined}>
                      {segment.text}
                      {active && <span className="transcript-current" lang="en">Current sentence</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {transcript.visibility === "public" ? (
            <details className="transcript-attribution">
              <summary>Attribution and license</summary>
              <p>{transcript.attribution}</p>
              {licenseUrl && (
                <a href={licenseUrl} target="_blank" rel="noreferrer">
                  Creator’s reuse license
                </a>
              )}
            </details>
          ) : (
            <p className="transcript-attribution">
              Private to this browser. Importing does not grant permission to share it.
            </p>
          )}
        </>
      )}

      {restoring && <p className="transcript-status" role="status">Checking for a personal transcript in this browser…</p>}
      {notice && (
        <p className="transcript-status" role={notice.error ? "alert" : "status"}>
          {notice.message}
        </p>
      )}
      <details className="transcript-upload">
        <summary>Import a personal transcript</summary>
        <p>
          JSON, Whisper JSON, VTT or SRT, up to 5 MiB. The file is read on your
          device, never uploaded or shared. Files with no video ID are associated
          with this video; check that they match before importing.
        </p>
        <label htmlFor={`${id}-file`}>Choose a timed transcript file</label>
        <input
          id={`${id}-file`}
          type="file"
          accept=".json,.vtt,.srt,application/json,text/vtt,application/x-subrip"
          disabled={restoring || busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) { pauseFollow(); onImport(file); }
          }}
        />
        <p>Saved only in this browser when storage is available. No account or cross-device sync.</p>
      </details>
      {(personal || canClearSaved) && (
        <button
          type="button"
          className="btn btn--quiet"
          disabled={restoring || busy}
          onClick={() => { pauseFollow(); onRemove(); }}
        >
          Remove personal transcript
        </button>
      )}
    </section>
  );
}
