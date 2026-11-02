import Link from "next/link";
export const metadata = { title: "Terms of use" };
export default function Terms() {
  return (
    <article className="legal opens">
      <h1>Terms of use</h1>
      <p>
        This catalog helps you discover authentic Japanese-language videos
        hosted on YouTube. It does not own the videos, promise availability or
        assess your proficiency. Difficulty is not assessed.
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
