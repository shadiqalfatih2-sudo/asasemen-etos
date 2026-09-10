import { NextRequest, NextResponse } from "next/server";
import { requireAwardeeSession } from "@/lib/assessment/server-session";
import { ASSESSMENT_SESSION_COOKIE } from "@/lib/assessment/security";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAwardeeSession(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason === "expired" ? "Sesi verifikasi berakhir." : "Belum terverifikasi." }, { status: 401 });
  }

  try {
    const { admin, session } = auth;
    const [awardeeResult, periodResult, modulesResult, questionsResult, answersResult] = await Promise.all([
      admin.from("awardees").select("id,full_name,campus,major,cohort,region,photo_url").eq("id", session.awardee_id).single(),
      admin.from("assessment_periods").select("id,name,academic_year,semester").eq("id", session.period_id).single(),
      admin.from("assessment_modules").select("id,code,title,subtitle,reflection_question,sort_order,is_restricted").eq("is_active", true).order("sort_order"),
      admin.from("assessment_questions").select("id,module_id,code,statement,dimension,sort_order,sensitivity").eq("is_active", true).order("sort_order"),
      admin.from("assessment_answers").select("question_id,selected,updated_at").eq("session_id", session.id),
    ]);

    const firstError = awardeeResult.error || periodResult.error || modulesResult.error || questionsResult.error || answersResult.error;
    if (firstError) throw firstError;

    const questionsByModule = new Map<string, typeof questionsResult.data>();
    for (const question of questionsResult.data ?? []) {
      const existing = questionsByModule.get(question.module_id) ?? [];
      existing.push(question);
      questionsByModule.set(question.module_id, existing);
    }

    const modules = (modulesResult.data ?? []).map((module) => ({
      ...module,
      questions: (questionsByModule.get(module.id) ?? []).sort((a, b) => a.sort_order - b.sort_order),
    }));

    return NextResponse.json(
      {
        session: { id: session.id, status: session.status, completedAt: session.completed_at },
        awardee: awardeeResult.data,
        period: periodResult.data,
        modules,
        answers: (answersResult.data ?? []).map((answer) => ({ questionId: answer.question_id, selected: answer.selected, updatedAt: answer.updated_at })),
        totalQuestions: questionsResult.data?.length ?? 0,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("assessment session load error", error);
    return NextResponse.json({ error: "Workspace assessment belum dapat dimuat." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAwardeeSession(request);
  if (!auth.ok) return NextResponse.json({ error: "Sesi verifikasi tidak aktif." }, { status: 401 });
  if (auth.session.status === "completed") return NextResponse.json({ error: "Assessment yang sudah selesai tidak dapat direset dari portal awardee." }, { status: 409 });

  try {
    const { admin, session } = auth;

    await admin.from("audit_logs").insert({
      action: "assessment.progress_reset",
      resource_type: "assessment_session",
      resource_id: session.id,
      metadata: { awardee_id: session.awardee_id, period_id: session.period_id },
    });

    await admin.from("followups").delete().eq("session_id", session.id);
    const { error } = await admin.from("assessment_sessions").delete().eq("id", session.id);
    if (error) throw error;

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: ASSESSMENT_SESSION_COOKIE,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error("assessment progress reset error", error);
    return NextResponse.json({ error: "Progres belum dapat dihapus." }, { status: 500 });
  }
}
