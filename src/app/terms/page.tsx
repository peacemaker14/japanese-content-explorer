import Link from "next/link";
export const metadata = { title: "Terms of use" };
export default function Terms() {
  return (
    <article className="legal opens">
      <h1>Terms of use</h1>
      <p>
        This catalog helps you find authentic Japanese-language YouTube videos
        for immersion learning. It does not own the videos, promise availability
        or assess your proficiency. Difficulty categories are curator judgments
        about the language in a video, not JLPT certification or learner
        placement. Videos without an assessment are labeled Not assessed.
      </p>
      <p>
        Category and subtopic selections may be assistant-reviewed from a
        video’s title and description. Metadata review does not verify the
        spoken language, factual accuracy or learning difficulty. Language
        indicated by creator-provided audio metadata is labeled separately from
        listening verification.
      </p>
      <p>
        By using this site, you agree to the{" "}
        <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>.
        Playback is provided by YouTube, subject to creator permissions,
        geographic restrictions and YouTube policies. Use original links for
        videos that cannot be embedded.
      </p>
      <p>
        Do not use this service to download media, bypass player restrictions or
        infringe creators’ rights. Public metadata and curator selections can
        change or be removed. No learning outcome or uninterrupted availability
        is guaranteed.
      </p>
      <p>
        Read our <Link href="/privacy">Privacy policy</Link> before continuing.
        You can withdraw the site acknowledgment using the footer and clear
        browser-stored preferences in your browser settings.
      </p>
    </article>
  );
}
