import type { Metadata } from "next";
import Link from "next/link";
import { Rethink_Sans } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { resetPrivacy } from "@/app/privacy-actions";
import { env } from "@/lib/env";
import "./globals.css";

const rethinkSans = Rethink_Sans({
  subsets: ["latin"],
  variable: "--font-yorimichi",
  display: "swap",
});

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(env("SITE_URL")),
    title: { default: "Yorimichi", template: "%s | Yorimichi" },
    description: "Discover Japanese videos about things you already love.",
    referrer: "strict-origin-when-cross-origin",
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={rethinkSans.variable}>
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <SiteHeader />
        <main id="main-content" className="container main-content">{children}</main>
        <footer className="site-footer container">
          <p>A little detour into Japanese.</p>
          <nav aria-label="Legal and privacy">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <form action={resetPrivacy}>
              <button className="text-button" type="submit">Reset privacy acknowledgment</button>
            </form>
          </nav>
        </footer>
      </body>
    </html>
  );
}
