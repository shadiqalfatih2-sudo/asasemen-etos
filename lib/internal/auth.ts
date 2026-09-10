import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { INTERNAL_PIN_COOKIE, readInternalPinSession } from "@/lib/internal/pin-session";

export type InternalProfile = {
  id: string;
  full_name: string;
  role: "superadmin" | "coordinator" | "facilitator";
  permissions: string[];
  region: string | null;
  is_active: boolean;
};

export function canManageAssessments(profile: InternalProfile) {
  return profile.role === "superadmin" || profile.role === "coordinator" || profile.permissions.includes("assessment.manage");
}

export function canViewPrivateAssessments(profile: InternalProfile) {
  return profile.role === "superadmin" || profile.permissions.includes("assessment.view_private");
}

export function canExportAssessments(profile: InternalProfile) {
  return profile.role === "superadmin" || profile.permissions.includes("assessment.export");
}

export function canManageUsers(profile: InternalProfile) {
  return profile.role === "superadmin";
}

async function getPinInternalUser() {
  const store = await cookies();
  const profileId = readInternalPinSession(store.get(INTERNAL_PIN_COOKIE)?.value);
  if (!profileId) return null;

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id,full_name,role,permissions,region,is_active")
    .eq("id", profileId)
    .eq("role", "superadmin")
    .maybeSingle();

  if (error || !profile?.is_active) return null;

  return {
    supabase: admin,
    claims: { sub: profile.id, auth_mode: "pin" },
    profile: { ...profile, permissions: Array.isArray(profile.permissions) ? profile.permissions : [] } as InternalProfile,
  };
}

export async function getInternalUser() {
  const pinAuth = await getPinInternalUser();
  if (pinAuth) return pinAuth;

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;
  const subject = typeof claims?.sub === "string" ? claims.sub : null;

  if (claimsError || !subject || !claims) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,full_name,role,permissions,region,is_active")
    .eq("id", subject)
    .maybeSingle();

  if (profileError || !profile?.is_active) return null;

  return {
    supabase,
    claims,
    profile: { ...profile, permissions: Array.isArray(profile.permissions) ? profile.permissions : [] } as InternalProfile,
  };
}

export async function requireInternalUser() {
  const auth = await getInternalUser();
  if (!auth) redirect("/dashboard/login");
  return auth;
}
