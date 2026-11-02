import { z } from "zod";
export type EnvName =
  | "DATABASE_URL"
  | "DATABASE_URL_UNPOOLED"
  | "YOUTUBE_API_KEY"
  | "CRON_SECRET"
  | "SITE_URL";
export function env(name: EnvName): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error("Missing configuration: " + name);
  if (name.includes("DATABASE_URL") || name === "SITE_URL") {
    if (!z.url().safeParse(value).success)
      throw new Error("Invalid configuration: " + name);
  }
  return value;
}
