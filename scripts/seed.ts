import "./env";
import { getPool, closePool } from "../src/db/client";
import { taxonomy } from "../src/lib/taxonomy";
async function main() {
  const c = await getPool().connect();
  try {
    await c.query("BEGIN");
    for (const t of taxonomy) {
      const {
        rows: [i],
      } = await c.query(
        "INSERT INTO interests(slug,name,description) VALUES($1,$2,$3) ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description RETURNING id",
        [t.slug, t.name, t.description],
      );
      for (const [slug, name] of t.subtopics)
        await c.query(
          "INSERT INTO subtopics(interest_id,slug,name) VALUES($1,$2,$3) ON CONFLICT(interest_id,slug) DO UPDATE SET name=EXCLUDED.name",
          [i.id, slug, name],
        );
    }
    await c.query("COMMIT");
    console.log("Seeded 5 interests and 20 subtopics.");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
main()
  .catch(() => {
    console.error("Taxonomy seed failed; check database configuration.");
    process.exitCode = 1;
  })
  .finally(closePool);
