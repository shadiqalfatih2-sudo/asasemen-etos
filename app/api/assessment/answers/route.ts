import { NextRequest, NextResponse } from "next/server";
import { requireAwardeeSession } from "@/lib/assessment/server-session";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type IncomingAnswer = { questionId: string; selected: boolean };

export async function POST(request: NextRequest) {
  const auth = await requireAwardeeSession(request);
  if (!auth.ok) return NextResponse.json({ error: "Sesi verifikasi tidak aktif." }, { status: 401 });
  if (auth.session.status === "completed") return NextResponse.json({ error: "Assessment sudah selesai dan dikunci." }, { status: 409 });

  try {
    const body = await request.json().catch(() => null);
    const incoming: unknown[] = Array.isArray(body?.answers) ? body.answers : [];
    const answers: IncomingAnswer[] = incoming
      .filter((item: unknown): item is IncomingAnswer => {
        if (!item || typeof item !== "object") return false;
        const candidate = item as { questionId?: unknown; selected?: unknown };
        return typeof candidate.questionId === "string" && UUID_PATTERN.test(candidate.questionId) && typeof candidate.selected === "boolean";
      })
      .slice(0, 12);

    if (!answers.length) return NextResponse.json({ error: "Tidak ada jawaban valid untuk disimpan." }, { status: 400 });

    const uniqueIds = [...new Set(answers.map((item: IncomingAnswer) => item.questionId))];
    const { data: validQuestions, error: questionError } = await auth.admin
      .from("assessment_questions")
      .select("id")
      .in("id", uniqueIds)
      .eq("is_active", true);
    if (questionError) throw questionError;
    if ((validQuestions?.length ?? 0) !== uniqueIds.length) return NextResponse.json({ error: "Terdapat item assessment yang tidak valid." }, { status: 400 });

    const now = new Date().toISOString();
    const rows = answers.map((answer: IncomingAnswer) => ({
      session_id: auth.session.id,
      question_id: answer.questionId,
      selected: answer.selected,
      answered_at: now,
      updated_at: now,
    }));

    const { error: saveError } = await auth.admin.from("assessment_answers").upsert(rows, { onConflict: "session_id,question_id" });
    if (saveError) throw saveError;

    await auth.admin.from("assessment_sessions").update({ last_activity_at: now }).eq("id", auth.session.id);
    const { count } = await auth.admin
      .from("assessment_answers")
      .select("id", { count: "exact", head: true })
      .eq("session_id", auth.session.id);

    return NextResponse.json({ ok: true, savedAt: now, answeredCount: count ?? 0 });
  } catch (error) {
    console.error("assessment autosave error", error);
    return NextResponse.json({ error: "Jawaban belum dapat disimpan." }, { status: 500 });
  }
}
