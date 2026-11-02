import type { Metadata } from "next";
import { Bricolage_Grotesque, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { resetPrivacy } from "@/app/privacy-actions";
import { env } from "@/lib/env";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
  axes: ["wdth", "opsz"],
});
const prose = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
});

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(env("SITE_URL")),
    title: {
      default: "Japanese Content Explorer",
      template: "%s | Japanese Content Explorer",
    },
    description:
      "Discover Japanese videos about your interests, selected by human reviewers and sourced from YouTube.",
    referrer: "strict-origin-when-cross-origin",
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${prose.variable}`}>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
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
            <Link href="/explore">Explore</Link>
            <Link href="/">Choose interests</Link>
          </nav>
        </header>
        <main id="main-content" className="container main-content">
          {children}
        </main>
        <footer className="site-footer container">
          <p>Japanese videos. Your interests.</p>
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
