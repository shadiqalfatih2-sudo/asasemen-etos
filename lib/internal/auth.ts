import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

export async function getInternalUser() {
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
    profile: profile as InternalProfile,
  };
}

export async function requireInternalUser() {
  const auth = await getInternalUser();
  if (!auth) redirect("/dashboard/login");
  return auth;
}
