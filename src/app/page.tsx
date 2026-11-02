import { InterestPicker } from "@/components/InterestPicker";

export default function HomePage() {
  return (
    <section className="home-screen">
      <div className="screen-heading">
        <h1>Learn Japanese through videos you love.</h1>
        <p className="standfirst">
          Find immersion material by interest and learning difficulty.
        </p>
      </div>
      <InterestPicker />
    </section>
  );
}
