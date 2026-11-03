"use client";

import { useId, useState } from "react";
import type { PublicTranscript } from "@/lib/transcript-types";
import type { PersonalTranscript } from "@/lib/personal-transcript";
import type { PersonalTranscriptNotice } from "@/lib/use-personal-transcript";
import { TranscriptWords } from "./TranscriptWords";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

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
  const [following, setFollowing] = useState<PublicTranscript | PersonalTranscript | null>(null);
  const autoFollow = transcript !== null && following === transcript;
  const licenseUrl = transcript?.visibility === "public"
    ? safeLicenseUrl(transcript.licenseUrl) : null;

  function pauseFollow() {
    setFollowing(null);
  }


  return (
    <section className="transcript-panel" aria-labelledby={`${id}-heading`}>
      <div className="transcript-toolbar">
        <h2 id={`${id}-heading`}>Transcript</h2>
        {transcript && (
          <Button
            type="button"
            variant="outline"
            aria-pressed={autoFollow}
            aria-controls={`${id}-sentences`}
            onClick={() => setFollowing(autoFollow ? null : transcript)}
          >
            Auto-follow: {autoFollow ? "On" : "Off"}
          </Button>
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
          <RadioGroup
            name={`${id}-source`}
            value={preferPersonal ? "personal" : "shared"}
            onValueChange={(value) => { pauseFollow(); onPreferPersonal(value === "personal"); }}
            aria-label="Read transcript"
            className="transcript-source-options"
          >
            <label htmlFor={`${id}-shared`}>
              <RadioGroupItem id={`${id}-shared`} value="shared" />
              Shared transcript
            </label>
            <label htmlFor={`${id}-personal`}>
              <RadioGroupItem id={`${id}-personal`} value="personal" />
              Personal file
            </label>
          </RadioGroup>
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
              ? "Select a timestamp to seek without starting paused playback."
              : embedAllowed
                ? "Timestamp seeking is available when the YouTube player is ready."
                : "Read and look up words here; playback and seeking are available only on YouTube for this video."}
            {" "}Auto-follow starts off. Scrolling or focusing the reader turns it off.
          </p>
          <TranscriptWords
            transcript={transcript}
            activeIndex={activeIndex}
            canSeek={canSeek}
            autoFollow={autoFollow}
            id={id}
            onSeek={onSeek}
            onInteract={pauseFollow}
          />
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
        <Input
          id={`${id}-file`}
          type="file"
          accept=".json,.vtt,.srt,application/json,text/vtt,application/x-subrip"
          disabled={restoring || busy}
          aria-busy={restoring || busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) { pauseFollow(); onImport(file); }
          }}
        />
        <p>Saved only in this browser when storage is available. No account or cross-device sync.</p>
      </details>
      {(personal || canClearSaved) && (
        <Button
          type="button"
          variant="outline"
          disabled={restoring || busy}
          onClick={() => { pauseFollow(); onRemove(); }}
        >
          Remove personal transcript
        </Button>
      )}
    </section>
  );
}
