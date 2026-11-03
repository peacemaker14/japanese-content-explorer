import Link from "next/link";
export const metadata = { title: "Privacy policy" };
export default function Privacy() {
  return (
    <article className="legal opens">
      <h1>Privacy policy</h1>
      <p>
        Yorimichi is a public Japanese immersion catalog with no accounts, media
        downloads or playback analytics. Personal transcript files are opened
        on your device, not uploaded.
      </p>
      <h2>Stored in your browser</h2>
      <p>
        The httpOnly acknowledgment cookie, jce.consent, stores version 1 for up
        to one year. Reset acknowledgment using the footer. Interest choices use
        localStorage key jce.interests.v1 until you change them or clear site
        storage. They are not sent as a personal profile; selected catalog
        filters appear in the URL.
      </p>
      <p>
        Saved video IDs use localStorage key yorimichi.saved.v1. To display your
        saved list, those IDs are sent to our server to resolve current public
        video metadata; the application does not store a personal saved profile.
        Saves do not sync across browsers or devices.
      </p>
      <p>
        Personal JSON, VTT and SRT transcripts are stored in your browser’s
        IndexedDB for the selected video. Their text is not sent to our server,
        YouTube or a transcription service. Importing a file never makes it
        public. Remove it from the video’s transcript panel, or clear site
        storage. Browser storage may be unavailable or cleared by your browser.
      </p>
      <p>
        Resetting acknowledgment only removes the acknowledgment cookie. It
        does not erase saved videos, interests or personal transcripts. Use
        their respective controls or clear this site’s browser storage.
      </p>
      <h2>Shared learning material</h2>
      <p>
        Shared transcripts and summaries require documented permission or a
        suitable reuse license. Attribution and license links accompany shared
        transcripts. Generating a transcript does not grant redistribution
        rights. Machine-generated text may contain recognition errors.
      </p>
      <h2>YouTube and Google</h2>
      <p>
        We use YouTube API Services for public video metadata. After
        acknowledgment, your browser requests thumbnails directly from YouTube.
        Eligible detail pages load the official privacy-enhanced YouTube player,
        which can communicate with Google and store data when you interact. Your
        IP address, referrer and player requests are subject to{" "}
        <a href="https://policies.google.com/privacy">
          Google’s privacy policy
        </a>{" "}
        and <a href="https://www.youtube.com/t/terms">YouTube’s terms</a>. You
        may open the original video instead. Made-for-Kids or
        unknown-designation videos are not embedded here.
      </p>
      <h2>Operational data</h2>
      <p>
        Hosting infrastructure processes ordinary request information for
        delivery and security. Catalog metadata is refreshed or deleted within
        30 days; collection logs contain aggregate counts and sanitized errors,
        not user viewing histories. We do not sell personal data or run
        advertising analytics.
      </p>
      <p>
        <Link href="/terms">Read the terms</Link>
      </p>
    </article>
  );
}
