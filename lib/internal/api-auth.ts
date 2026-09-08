import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function authorizeAssessmentManager() {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  const subject = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;

  if (error || !subject) {
    return { ok: false as const, status: 401, error: "Login diperlukan." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,role,permissions,is_active")
    .eq("id", subject)
    .maybeSingle();

  if (profileError || !profile?.is_active) {
    return { ok: false as const, status: 403, error: "Akun internal tidak aktif." };
  }

  const permissions = Array.isArray(profile.permissions) ? profile.permissions : [];
  const allowed =
    profile.role === "superadmin" ||
    profile.role === "coordinator" ||
    permissions.includes("assessment.manage");

  if (!allowed) {
    return { ok: false as const, status: 403, error: "Akun tidak memiliki izin mengelola awardee." };
  }

  return { ok: true as const, actorId: subject };
}
