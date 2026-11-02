import type { Metadata } from "next";
import Link from "next/link";
import { resetPrivacy } from "@/app/privacy-actions";
import { env } from "@/lib/env";
import "./globals.css";

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(env("SITE_URL")),
    title: {
      default: "Japanese Content Explorer",
      template: "%s | Japanese Content Explorer",
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
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="site-header-shell">
          <header className="site-header container">
            <Link
              className="wordmark"
              href="/"
              aria-label="Japanese Content Explorer home"
            >
              <span aria-hidden="true">JCE</span>
              <span className="wordmark-name">Japanese Content Explorer</span>
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
      </body>
    </html>
  );
}
