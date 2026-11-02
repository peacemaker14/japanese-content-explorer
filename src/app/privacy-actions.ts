"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CONSENT_COOKIE, safeNext } from "@/lib/consent";
export async function acceptPrivacy(formData: FormData): Promise<never> {
  (await cookies()).set(CONSENT_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 31536000,
  });
  redirect(safeNext(formData.get("next")));
}
export async function resetPrivacy(): Promise<never> {
  (await cookies()).delete(CONSENT_COOKIE);
  redirect("/welcome");
}
