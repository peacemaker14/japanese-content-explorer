import Link from "next/link";
import { acceptPrivacy } from "../privacy-actions";
import { safeNext } from "@/lib/consent";
export const metadata = { title: "Before you explore" };
export default async function Welcome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  return (
    <section className="legal opens">
      <h1>Before you explore.</h1>
      <p className="standfirst">Learn Japanese through everyday immersion.</p>
      <p>
        Discovery uses the YouTube API. Continuing loads thumbnails from
        YouTube; opening an eligible video loads its player. Google may receive
        your IP address and use cookies under its own policies.
      </p>
      <p>
        We remember your acknowledgment in a cookie for one year. Optional
        interest preferences stay in this browser. No account, transcript
        collection or playback analytics.
      </p>
      <p>
        Read our <Link href="/privacy">Privacy policy</Link> and{" "}
        <Link href="/terms">Terms</Link>, including{" "}
        <a href="https://policies.google.com/privacy">
          Google’s privacy policy
        </a>{" "}
        and the{" "}
        <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>.
        You can reset your acknowledgment in the footer.
      </p>
      <form action={acceptPrivacy}>
        <input type="hidden" name="next" value={safeNext(raw.next)} />
        <button className="btn btn--primary" type="submit">
          Acknowledge &amp; continue
        </button>
      </form>
    </section>
  );
}
