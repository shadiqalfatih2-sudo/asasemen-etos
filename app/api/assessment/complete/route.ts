import { NextRequest, NextResponse } from "next/server";
import { requireAwardeeSession } from "@/lib/assessment/server-session";

export async function POST(request: NextRequest) {
  const auth = await requireAwardeeSession(request);
  if (!auth.ok) return NextResponse.json({ error: "Sesi verifikasi tidak aktif." }, { status: 401 });
  if (auth.session.status === "completed") return NextResponse.json({ ok: true, alreadyCompleted: true });

  try {
    const [{ count: totalQuestions, error: questionsError }, { count: totalAnswers, error: answersError }] = await Promise.all([
      auth.admin.from("assessment_questions").select("id", { count: "exact", head: true }).eq("is_active", true),
      auth.admin.from("assessment_answers").select("id", { count: "exact", head: true }).eq("session_id", auth.session.id),
    ]);
    if (questionsError || answersError) throw questionsError || answersError;

    const required = totalQuestions ?? 0;
    const answered = totalAnswers ?? 0;
    if (!required || answered < required) {
      return NextResponse.json({ error: `Masih ada ${Math.max(required - answered, 0)} pernyataan yang belum dikonfirmasi.`, answered, required }, { status: 409 });
    }

    const completedAt = new Date().toISOString();
    const { error: updateError } = await auth.admin
      .from("assessment_sessions")
      .update({ status: "completed", completed_at: completedAt, last_activity_at: completedAt })
      .eq("id", auth.session.id);
    if (updateError) throw updateError;

    await auth.admin.from("audit_logs").insert({
      action: "assessment.completed",
      resource_type: "assessment_session",
      resource_id: auth.session.id,
      metadata: { awardee_id: auth.session.awardee_id, period_id: auth.session.period_id },
    });

    return NextResponse.json({ ok: true, completedAt });
  } catch (error) {
    console.error("assessment complete error", error);
    return NextResponse.json({ error: "Assessment belum dapat diselesaikan." }, { status: 500 });
  }
}
