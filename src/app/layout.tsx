import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Rethink_Sans } from "next/font/google";
import {
  AppNavigation,
  AppNavigationFallback,
} from "@/components/AppNavigation";
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
    title: {
      default: "Yorimichi",
      template: "%s | Yorimichi",
    },
    description:
      "Learn Japanese through authentic YouTube videos. Find immersion material by interest and curator-rated learning difficulty.",
    referrer: "strict-origin-when-cross-origin",
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={rethinkSans.variable}>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="app-shell">
          <Suspense fallback={<AppNavigationFallback />}>
            <AppNavigation />
          </Suspense>
          <div className="app-main">
            <div className="site-header-shell">
              <header className="site-header container">
                <Link className="wordmark" href="/" aria-label="Yorimichi home">
                  <span aria-hidden="true">Yorimichi</span>
                  <span className="wordmark-name">Japanese immersion</span>
                </Link>
                <nav aria-label="Main navigation">
                  <Link href="/explore">Categories</Link>
                  <Link href="/#mix-interests">Choose interests</Link>
                </nav>
              </header>
            </div>
            <main id="main-content" className="container main-content">
              {children}
            </main>
            <footer className="site-footer container">
              <p>Japanese immersion, one video at a time.</p>
              <nav aria-label="Legal and privacy">
                <Link href="/privacy">Privacy</Link>
                <Link href="/terms">Terms</Link>
                <form action={resetPrivacy}>
                  <button className="text-button" type="submit">
                    Reset privacy acknowledgment
                  </button>
                </form>
              </nav>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
