"use server";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  INTERNAL_PIN_COOKIE,
  INTERNAL_PIN_SESSION_MAX_AGE_SECONDS,
  configuredSuperadminPin,
  internalPinClientHash,
  signInternalPinSession,
  verifySuperadminPin,
} from "@/lib/internal/pin-session";

export type LoginState = { error: string };

const SUPERADMIN_EMAIL = "superadmin-palu@internal.etos.id";
const FULL_PERMISSIONS = [
  "assessment.view",
  "assessment.view_private",
  "assessment.export",
  "assessment.manage",
  "assessment.analytics",
];
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

async function resolveOrCreateSuperadmin() {
  const admin = createAdminClient();
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;

  let user = listed.users.find((item) => item.email?.toLowerCase() === SUPERADMIN_EMAIL) ?? null;
  if (!user) {
    const password = randomBytes(32).toString("base64url");
    const { data: created, error } = await admin.auth.admin.createUser({
      email: SUPERADMIN_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Super Admin ETOS Palu" },
    });
    if (error || !created.user) throw error || new Error("Superadmin belum dapat dibuat.");
    user = created.user;
  }

  const profile = {
    id: user.id,
    full_name: "Super Admin ETOS Palu",
    role: "superadmin",
    permissions: FULL_PERMISSIONS,
    region: "Palu",
    is_active: true,
  };
  const { error: profileError } = await admin.from("profiles").upsert(profile, { onConflict: "id" });
  if (profileError) throw profileError;

  return { admin, profile };
}

async function registerFailure(clientHash: string, previousAttempts: number, windowStartedAt: number) {
  const admin = createAdminClient();
  const now = Date.now();
  const sameWindow = now - windowStartedAt < ATTEMPT_WINDOW_MS;
  const attempts = sameWindow ? previousAttempts + 1 : 1;
  const lockedUntil = attempts >= 5 ? new Date(now + LOCK_MS).toISOString() : null;
  await admin.from("internal_pin_attempts").upsert({
    client_hash: clientHash,
    attempts,
    window_started_at: new Date(sameWindow ? windowStartedAt : now).toISOString(),
    locked_until: lockedUntil,
    updated_at: new Date(now).toISOString(),
  });
}

export async function login(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const pin = String(formData.get("pin") || "").trim();
  if (!/^\d{6}$/.test(pin)) return { error: "Masukkan PIN Superadmin 6 digit." };
  if (!configuredSuperadminPin()) return { error: "PIN Superadmin belum dikonfigurasi di server." };

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = requestHeaders.get("user-agent") || "unknown";
  const clientHash = internalPinClientHash(ip, userAgent);
  const admin = createAdminClient();
  const now = Date.now();

  const { data: attempt } = await admin
    .from("internal_pin_attempts")
    .select("attempts,window_started_at,locked_until")
    .eq("client_hash", clientHash)
    .maybeSingle();

  if (attempt?.locked_until && new Date(attempt.locked_until).getTime() > now) {
    return { error: "Terlalu banyak percobaan. Coba lagi sekitar 15 menit." };
  }

  if (!verifySuperadminPin(pin)) {
    const windowStartedAt = attempt?.window_started_at ? new Date(attempt.window_started_at).getTime() : now;
    await registerFailure(clientHash, attempt?.attempts ?? 0, windowStartedAt);
    return { error: "PIN tidak sesuai." };
  }

  await admin.from("internal_pin_attempts").delete().eq("client_hash", clientHash);

  try {
    const { profile } = await resolveOrCreateSuperadmin();
    const store = await cookies();
    store.set({
      name: INTERNAL_PIN_COOKIE,
      value: signInternalPinSession(profile.id),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: INTERNAL_PIN_SESSION_MAX_AGE_SECONDS,
    });

    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "internal.pin_login",
      resource_type: "profile",
      resource_id: profile.id,
      metadata: { region: "Palu" },
    });
  } catch (error) {
    console.error("superadmin pin login bootstrap error", error);
    return { error: "Akses Superadmin belum dapat disiapkan. Coba lagi." };
  }

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}
