import { InterestPicker } from "@/components/InterestPicker";

export default function HomePage() {
  return (
    <section className="home-screen">
      <div className="screen-heading">
        <h1>Find Japanese videos about what you love.</h1>
        <p className="standfirst">
          Start with your interests. Find something worth watching in Japanese.
        </p>
      </div>
      <InterestPicker />
    </section>
  );
}
