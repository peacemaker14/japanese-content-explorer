import Link from "next/link";
export const metadata = { title: "Terms of use" };
export default function Terms() {
  return (
    <article className="legal opens">
      <h1>Terms of use</h1>
      <p>
        This catalog helps you find authentic Japanese-language YouTube videos
        for immersion learning. It does not own the videos, promise availability
        or assess your proficiency. Difficulty chips reflect curator assessments
        or approximate transcript-based estimates; their basis is explained in
        the video notes. They are not JLPT certification or learner placement.
        Videos without sufficient evidence are labeled Unrated. Text-based
        estimates do not verify listening pace, accents or visual context.
      </p>
      <p>
        Category and subtopic selections may be assistant-reviewed from a
        video’s title and description. Metadata review does not verify the
        spoken language, factual accuracy or learning difficulty. Language
        indicated by creator-provided audio metadata is labeled separately from
        listening verification.
      </p>
      <p>
        Full shared transcripts and summaries require documented permission or
        a suitable reuse license. Follow the attribution and license notices
        shown with shared text; creators do not endorse Yorimichi by granting
        a license. Machine-generated transcripts and summaries can be
        inaccurate and are not verified against the recording.
      </p>
      <p>
        Personal transcript imports remain in your browser and are never
        automatically published. Only import material you are entitled to use.
        Making or possessing a transcript does not grant permission to
        redistribute the underlying work.
      </p>
      <h2>Reading aids and dictionary data</h2>
      <p>
        Furigana and romaji are automatic reading aids, not verified
        transcriptions. Names, unusual words and recognition errors may be
        misread. Dictionary entries give possible meanings, not a translation
        of the entire sentence.
      </p>
      <p>
        Japanese dictionary data is derived from{" "}
        <a href="https://www.edrdg.org/jmdict/j_jmdict.html">JMdict</a>, copyright
        the Electronic Dictionary Research and Development Group, and is
        distributed under{" "}
        <a href="https://www.edrdg.org/edrdg/licence.html">CC BY-SA 4.0</a>.
        Dictionary data and its required notices accompany the language assets.
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
        You can withdraw the site acknowledgment using the footer. This does
        not delete saved videos, interests, reading preferences or personal
        transcripts; remove those through their controls or clear this site’s
        browser storage.
      </p>
    </article>
  );
}
