import { youtubeIdPattern } from "./taxonomy";
export const CONSENT_COOKIE = "jce.consent";
export function safeNext(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return "/";
  try {
    const url = new URL(value, "https://internal.invalid");
    if (url.origin !== "https://internal.invalid") return "/";
    const p = url.pathname;
    if (p === "/explore") return "/" + url.search;
    if (
      p === "/" ||
      p === "/saved" ||
      p === "/interests" ||
      (p.startsWith("/videos/") && youtubeIdPattern.test(p.slice(8)))
    )
      return p + url.search;
  } catch {}
  return "/";
}
