"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { PublicTranscript } from "@/lib/transcript-types";
import { createTranscriptCueIndex, type TranscriptCueIndex } from "@/lib/transcript-cues";
import { usePersonalTranscript } from "@/lib/use-personal-transcript";
import { TranscriptReader } from "./TranscriptReader";
import { VideoPlayer, type VideoPlayerHandle } from "./VideoPlayer";

export interface VideoWorkspaceProps {
  youtubeId: string;
  madeForKids: boolean | null;
  transcript: PublicTranscript | null;
  children?: ReactNode;
}

/** The server must obtain transcript through the guarded public lookup only. */
export function VideoWorkspace(props: VideoWorkspaceProps) {
  // A client navigation must not briefly expose the previous video's local text
  // or retain an old player's clock while the new browser record is loading.
  return <WorkspaceContent key={props.youtubeId} {...props} />;
}

function WorkspaceContent({
  youtubeId,
  madeForKids,
  transcript,
  children,
}: VideoWorkspaceProps) {
  const player = useRef<VideoPlayerHandle>(null);
  const [canSeek, setCanSeek] = useState(false);
  const [preferPersonal, setPreferPersonal] = useState(true);
  const [seekError, setSeekError] = useState<string | null>(null);
  const local = usePersonalTranscript(youtubeId);
  const shared = transcript?.videoId === youtubeId &&
    transcript.visibility === "public" && transcript.sharingPermission === "granted"
    ? transcript : null;
  const currentTranscript = local.personal && (preferPersonal || !shared)
    ? local.personal : shared;
  const cueIndex = useMemo(
    () => createTranscriptCueIndex(currentTranscript?.segments ?? []),
    [currentTranscript],
  );
  const [position, setPosition] = useState<{ cues: TranscriptCueIndex; index: number | null }>(
    () => ({ cues: cueIndex, index: null }),
  );
  const activeIndex = position.cues === cueIndex ? position.index : null;

  const timeChanged = useCallback((seconds: number | null) => {
    const index = seconds === null ? null : cueIndex.at(seconds);
    // Most clock ticks do not cross a cue boundary; retain the same state
    // object instead of rerendering the reader or replacing the native iframe.
    setPosition((previous) => previous.cues === cueIndex && previous.index === index
      ? previous : { cues: cueIndex, index });
  }, [cueIndex]);

  const readyChanged = useCallback((ready: boolean) => {
    setCanSeek(ready);
    if (!ready)
      setPosition((previous) => previous.index === null
        ? previous : { ...previous, index: null });
  }, []);


  function seek(seconds: number) {
    if (!player.current?.seekTo(seconds)) {
      setSeekError("The player is not ready to seek. Retry the player or use the original YouTube video.");
    } else {
      setSeekError(null);
    }
  }

  async function importFile(file: File) {
    setSeekError(null);
    if (await local.importFile(file)) setPreferPersonal(true);
  }

  return (
    <div className="detail-workspace">
      <div className="player-region">
        <VideoPlayer
          ref={player}
          youtubeId={youtubeId}
          madeForKids={madeForKids}
          onTimeChange={timeChanged}
          onReadyChange={readyChanged}
        />
      </div>
      <TranscriptReader
        transcript={currentTranscript}
        shared={shared}
        personal={local.personal}
        preferPersonal={preferPersonal}
        activeIndex={activeIndex}
        canSeek={canSeek}
        embedAllowed={madeForKids === false}
        restoring={local.restoring}
        busy={local.busy}
        canClearSaved={local.canClearSaved}
        notice={seekError ? { message: seekError, error: true } : local.notice}
        onPreferPersonal={setPreferPersonal}
        onSeek={seek}
        onImport={(file) => { void importFile(file); }}
        onRemove={() => { setSeekError(null); void local.remove(); }}
      />
      {children}
    </div>
  );
}
