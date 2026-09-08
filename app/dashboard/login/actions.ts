"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string };

export async function login(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
    return { error: "Masukkan email dan password yang valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: "Email atau password tidak sesuai." };

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const subject = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  if (claimsError || !subject) {
    await supabase.auth.signOut();
    return { error: "Sesi login tidak dapat diverifikasi." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,is_active")
    .eq("id", subject)
    .maybeSingle();

  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return { error: "Akun belum memiliki akses internal ETOS. Hubungi administrator." };
  }

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}
