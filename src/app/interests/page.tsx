import type { Metadata } from "next";
import { InterestPicker } from "@/components/InterestPicker";

export const metadata: Metadata = { title: "Your interests" };

export default function InterestsPage() {
  return (
    <section className="interests-screen">
      <header className="screen-heading">
        <h1>Make room for what you love.</h1>
        <p>Choose your interests for a quick way back to your favorite topics.</p>
      </header>
      <InterestPicker />
      <p className="preference-explanation">Your choices stay in this browser. Discover starts with all videos unless you explicitly choose Use my interests. Shared links always keep their own filters.</p>
    </section>
  );
}
