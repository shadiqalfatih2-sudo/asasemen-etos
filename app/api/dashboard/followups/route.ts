import { NextRequest, NextResponse } from "next/server";
import { authorizeAssessmentManager } from "@/lib/internal/api-auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUSES = new Set(["open", "in_progress", "done", "cancelled"]);
function text(value: unknown, max = 2000) { const normalized = String(value ?? "").trim(); return normalized ? normalized.slice(0, max) : null; }
async function canAccessAwardee(awardeeId: string) { const supabase = await createClient(); const { data, error } = await supabase.from("awardees").select("id").eq("id", awardeeId).maybeSingle(); return !error && Boolean(data?.id); }

export async function POST(request: NextRequest) {
  const auth = await authorizeAssessmentManager();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json().catch(() => null);
    const awardeeId = text(body?.awardeeId, 80); const category = text(body?.category, 120);
    if (!awardeeId || !category) return NextResponse.json({ error: "Awardee dan kategori wajib diisi." }, { status: 400 });
    if (!(await canAccessAwardee(awardeeId))) return NextResponse.json({ error: "Awardee tidak tersedia dalam cakupan akses akun ini." }, { status: 403 });
    const sessionId = text(body?.sessionId, 80); const admin = createAdminClient();
    const { data, error } = await admin.from("followups").insert({ awardee_id: awardeeId, session_id: sessionId, category, signal: text(body?.signal, 500), notes: text(body?.notes, 4000), action_plan: text(body?.actionPlan, 4000), pic: auth.actorId, deadline: text(body?.deadline, 20), status: "open", created_by: auth.actorId }).select("id").single();
    if (error) throw error;
    await admin.from("audit_logs").insert({ actor_id: auth.actorId, action: "followup.created", resource_type: "followup", resource_id: data.id, metadata: { awardee_id: awardeeId, session_id: sessionId, category } });
    return NextResponse.json({ ok: true, id: data.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("followup create error", error); return NextResponse.json({ error: "Pendampingan belum dapat disimpan." }, { status: 500 }); }
}

export async function PATCH(request: NextRequest) {
  const auth = await authorizeAssessmentManager();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json().catch(() => null); const id = text(body?.id, 80); const status = text(body?.status, 30);
    if (!id || !status || !STATUSES.has(status)) return NextResponse.json({ error: "Status tindak lanjut tidak valid." }, { status: 400 });
    const supabase = await createClient(); const { data: existing, error: existingError } = await supabase.from("followups").select("id,awardee_id").eq("id", id).maybeSingle();
    if (existingError || !existing) return NextResponse.json({ error: "Tindak lanjut tidak tersedia dalam cakupan akses akun ini." }, { status: 403 });
    const admin = createAdminClient(); const { error } = await admin.from("followups").update({ status }).eq("id", id); if (error) throw error;
    await admin.from("audit_logs").insert({ actor_id: auth.actorId, action: "followup.status_updated", resource_type: "followup", resource_id: id, metadata: { awardee_id: existing.awardee_id, status } });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("followup update error", error); return NextResponse.json({ error: "Status tindak lanjut belum dapat diperbarui." }, { status: 500 }); }
}
