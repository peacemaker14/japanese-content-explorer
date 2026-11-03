import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CONSENT_COOKIE } from "@/lib/consent";
import { SavedVideos } from "./SavedVideos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Saved videos" };

export default async function SavedPage() {
  if ((await cookies()).get(CONSENT_COOKIE)?.value !== "1") {
    redirect("/welcome?next=%2Fsaved");
  }
  return (
    <main className="catalog-screen saved-screen">
      <header className="catalog-heading">
        <h1>Saved videos</h1>
        <p>Only saved in this browser. No sign-in or cross-device sync.</p>
      </header>
      <SavedVideos />
    </main>
  );
}
