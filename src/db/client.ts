import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../lib/env";
import * as schema from "./schema";
const globalDb = globalThis as unknown as { jcePool?: Pool };
export function getPool(): Pool {
  return (globalDb.jcePool ??= new Pool({
    connectionString: env("DATABASE_URL"),
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  }));
}
export function getDb() {
  return drizzle(getPool(), { schema });
}
export async function closePool() {
  const pool = globalDb.jcePool;
  globalDb.jcePool = undefined;
  await pool?.end();
}
