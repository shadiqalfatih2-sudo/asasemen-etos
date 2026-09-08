import "server-only";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ASSESSMENT_SESSION_COOKIE, readAssessmentSessionToken } from "@/lib/assessment/security";

export async function requireAwardeeSession(request: NextRequest) {
  const token = request.cookies.get(ASSESSMENT_SESSION_COOKIE)?.value;
  const sessionId = readAssessmentSessionToken(token);
  if (!sessionId) return { ok: false as const, reason: "missing" as const };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("assessment_sessions")
    .select("id,awardee_id,period_id,status,verification_expires_at,completed_at,last_activity_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !data) return { ok: false as const, reason: "missing" as const };
  if (!data.verification_expires_at || new Date(data.verification_expires_at).getTime() <= Date.now()) {
    return { ok: false as const, reason: "expired" as const };
  }

  return { ok: true as const, admin, session: data };
}
