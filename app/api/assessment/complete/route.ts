import { NextRequest, NextResponse } from "next/server";
import { requireAwardeeSession } from "@/lib/assessment/server-session";
import { buildAssessmentResult, type ScoringQuestion } from "@/lib/scoring/engine";

export async function POST(request: NextRequest) {
  const auth = await requireAwardeeSession(request);
  if (!auth.ok) return NextResponse.json({ error: "Sesi verifikasi tidak aktif." }, { status: 401 });

  try {
    const [{ data: questionData, error: questionsError }, { data: answerData, error: answersError }, { data: moduleData, error: modulesError }] = await Promise.all([
      auth.admin.from("assessment_questions").select("id,code,module_id,dimension,direction,weight,sensitivity").eq("is_active", true),
      auth.admin.from("assessment_answers").select("question_id,selected").eq("session_id", auth.session.id),
      auth.admin.from("assessment_modules").select("id,code").eq("is_active", true),
    ]);
    if (questionsError || answersError || modulesError) throw questionsError || answersError || modulesError;

    const required = questionData?.length ?? 0;
    const answered = answerData?.length ?? 0;
    if (!required || answered < required) return NextResponse.json({ error: `Masih ada ${Math.max(required - answered, 0)} pernyataan yang belum dikonfirmasi.`, answered, required }, { status: 409 });

    const moduleMap = new Map((moduleData ?? []).map((item) => [item.id, item.code]));
    const questions: ScoringQuestion[] = (questionData ?? []).map((item) => ({ id: item.id, code: item.code, moduleCode: moduleMap.get(item.module_id) ?? "UNKNOWN", dimension: item.dimension, direction: Number(item.direction ?? 1), weight: Number(item.weight ?? 1), sensitivity: item.sensitivity as ScoringQuestion["sensitivity"] }));
    const computed = buildAssessmentResult(questions, answerData ?? []);
    const generatedAt = new Date().toISOString();

    const publicDimensions = Object.fromEntries(Object.entries(computed.dimensions).filter(([, item]) => item.sensitivity === "standard"));
    const publicSummary = { character_top: computed.summary.character_top, note: computed.summary.note };
    const { error: resultError } = await auth.admin.from("assessment_results").upsert({ session_id: auth.session.id, summary: publicSummary, dimensions: publicDimensions, career_orientation: computed.careerOrientation, generated_at: generatedAt, scoring_version: "v1" }, { onConflict: "session_id" });
    if (resultError) throw resultError;

    const { error: deleteSignalsError } = await auth.admin.from("assessment_signals").delete().eq("session_id", auth.session.id);
    if (deleteSignalsError) throw deleteSignalsError;
    if (computed.signals.length) {
      const { error: signalError } = await auth.admin.from("assessment_signals").insert(computed.signals.map((signal) => ({ session_id: auth.session.id, question_id: signal.questionId, signal_code: signal.code, title: signal.title, severity: signal.severity })));
      if (signalError) throw signalError;
    }

    let completedAt = auth.session.completed_at ?? generatedAt;
    if (auth.session.status !== "completed") {
      completedAt = generatedAt;
      const { error: updateError } = await auth.admin.from("assessment_sessions").update({ status: "completed", completed_at: completedAt, last_activity_at: completedAt }).eq("id", auth.session.id);
      if (updateError) throw updateError;
    }

    await auth.admin.from("audit_logs").insert({ action: "assessment.completed", resource_type: "assessment_session", resource_id: auth.session.id, metadata: { awardee_id: auth.session.awardee_id, period_id: auth.session.period_id, scoring_version: "v1", signal_count: computed.signals.length } });
    return NextResponse.json({ ok: true, completedAt, scoringVersion: "v1" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("assessment complete error", error);
    return NextResponse.json({ error: "Assessment belum dapat diselesaikan." }, { status: 500 });
  }
}
