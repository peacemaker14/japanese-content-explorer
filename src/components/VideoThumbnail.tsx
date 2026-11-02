"use client";

import Image from "next/image";
import { useState } from "react";

export function VideoThumbnail({ src }: { src: string | null }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  let safeSource: string | null = null;
  if (src) {
    try {
      const url = new URL(src);
      if (
        url.protocol === "https:" &&
        url.hostname === "i.ytimg.com" &&
        !url.port &&
        !url.username &&
        !url.password
      )
        safeSource = src;
    } catch {
      /* Invalid sources use the same labeled fallback. */
    }
  }
  return (
    <div className="video-thumbnail">
      {safeSource && failedSource !== safeSource ? (
        <Image
          src={safeSource}
          alt=""
          fill
          sizes="(max-width: 559px) calc(100vw - 32px), (max-width: 959px) calc((100vw - 72px) / 2), 360px"
          unoptimized
          onError={() => setFailedSource(safeSource)}
        />
      ) : (
        <span className="thumbnail-fallback">
          YouTube thumbnail unavailable
        </span>
      )}
    </div>
  );
}
