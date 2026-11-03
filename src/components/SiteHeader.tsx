"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header container">
      <Link className="wordmark" href="/" aria-label="Yorimichi Discover">
        Yorimichi<span className="wordmark-japanese" lang="ja" aria-hidden="true">よりみち</span>
      </Link>
      <nav className="primary-navigation" aria-label="Main navigation">
        {[
          ["/", "Discover"],
          ["/saved", "Saved"],
          ["/interests", "Interests"],
        ].map(([href, label]) => (
          <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
