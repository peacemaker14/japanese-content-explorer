import { InterestPicker } from "@/components/InterestPicker";
import { CategoryBrowser } from "@/components/CategoryBrowser";
import { listCategories } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const categories = await listCategories();
  return (
    <section className="home-screen">
      <div className="screen-heading">
        <h1>Learn Japanese through videos you love.</h1>
        <p className="standfirst">
          Find immersion material by interest and learning difficulty.
        </p>
      </div>
      <CategoryBrowser categories={categories} />
      <section
        className="interest-mix"
        id="mix-interests"
        aria-labelledby="mix-heading"
      >
        <h2 id="mix-heading">Mix your interests</h2>
        <p className="category-context">
          Prefer a little of everything? Build your own mix.
        </p>
        <InterestPicker />
      </section>
    </section>
  );
}
