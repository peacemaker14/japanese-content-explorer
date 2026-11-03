import { NextResponse, type NextRequest } from "next/server";
import { CONSENT_COOKIE } from "./lib/consent";
export function proxy(request: NextRequest) {
  if (request.cookies.get(CONSENT_COOKIE)?.value === "1")
    return NextResponse.next();
  const target = new URL("/welcome", request.url);
  target.searchParams.set(
    "next",
    request.nextUrl.pathname + request.nextUrl.search,
  );
  return NextResponse.redirect(target);
}
export const config = {
  matcher: ["/", "/explore/:path*", "/saved/:path*", "/interests/:path*", "/videos/:path*"],
};
