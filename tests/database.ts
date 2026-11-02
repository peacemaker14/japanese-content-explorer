import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { taxonomy } from "../src/lib/taxonomy";

export const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL);
export async function withTestDatabase<T>(
  work: (pool: Pool) => Promise<T>,
): Promise<T> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || url === process.env.DATABASE_URL)
    throw new Error(
      "TEST_DATABASE_URL must be explicit and different from DATABASE_URL.",
    );
  const target = new URL(url);
  if (
    target.hostname.endsWith(".neon.tech") &&
    target.hostname.includes("-pooler.")
  )
    throw new Error(
      "TEST_DATABASE_URL must use the direct Neon connection; isolated schemas require search_path.",
    );
  if (process.env.DATABASE_URL) {
    const runtime = new URL(process.env.DATABASE_URL);
    if (
      target.hostname.replace("-pooler.", ".") ===
        runtime.hostname.replace("-pooler.", ".") &&
      target.pathname === runtime.pathname
    )
      throw new Error(
        "Test and application database branches must be different.",
      );
  }
  const namespace = "jce_test_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString: url, max: 1 });
  const pool = new Pool({
    connectionString: url,
    max: 4,
    options: `-c search_path=${namespace},public`,
  });
  try {
    await admin.query(`CREATE SCHEMA "${namespace}"`);
    const migrations = (await readdir(new URL("../drizzle/", import.meta.url)))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const file of migrations) {
      const sql = await readFile(
        new URL("../drizzle/" + file, import.meta.url),
        "utf8",
      );
      await pool.query(sql.replaceAll('"public".', `"${namespace}".`));
    }
    for (const item of taxonomy) {
      const {
        rows: [interest],
      } = await pool.query(
        "INSERT INTO interests(slug,name,description) VALUES($1,$2,$3) RETURNING id",
        [item.slug, item.name, item.description],
      );
      for (const [slug, name] of item.subtopics)
        await pool.query(
          "INSERT INTO subtopics(interest_id,slug,name) VALUES($1,$2,$3)",
          [interest.id, slug, name],
        );
    }
    return await work(pool);
  } finally {
    await pool.end();
    try {
      await admin.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
    } finally {
      await admin.end();
    }
  }
}
