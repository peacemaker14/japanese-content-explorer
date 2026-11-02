import { timingSafeEqual } from "node:crypto";
export function authorizedCron(
  header: string | null,
  secret = process.env.CRON_SECRET,
): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from("Bearer " + secret);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
