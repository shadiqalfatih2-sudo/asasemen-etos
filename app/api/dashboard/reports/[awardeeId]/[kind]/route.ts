import { NextRequest } from "next/server";
import { authorizeAssessmentExporter } from "@/lib/internal/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildTextPdf } from "@/lib/pdf/simple-pdf";

export const dynamic = "force-dynamic";

type Params = { awardeeId: string; kind: string };
type Awardee = { id: string; full_name: string; external_id: string | null; campus: string | null; major: string | null; cohort: string | null; region: string | null; phone_last4: string | null };
type Session = { id: string; period_id: string; status: string; started_at: string; completed_at: string | null };
type Period = { name: string; academic_year: string; semester: number };
type Question = { id: string; code: string; statement: string; sensitivity: "standard" | "private" | "signal"; module_id: string; sort_order: number };
type Answer = { question_id: string; selected: boolean };
type Module = { id: string; title: string; sort_order: number };
type Result = { summary: Record<string, unknown>; dimensions: Record<string, unknown>; career_orientation: Record<string, unknown>; scoring_version: string; generated_at: string };
type Signal = { signal_code: string; title: string; severity: string; is_resolved: boolean };
type Followup = { category: string; signal: string | null; notes: string | null; action_plan: string | null; deadline: string | null; status: string; created_at: string };

type ScoreItem = { code?: string; label?: string; score?: number; level?: string; sensitivity?: string };

function safeName(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "awardee";
}

function date(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function scoreLines(items: ScoreItem[] | undefined, limit = 8) {
  return (items ?? []).slice(0, limit).map((item) => `${item.label || item.code || "Dimensi"}: ${item.score ?? 0}%${item.level ? ` (${item.level})` : ""}`);
}

function objectScoreLines(value: Record<string, unknown>, includePrivate: boolean) {
  return Object.values(value ?? {})
    .filter((item): item is ScoreItem => Boolean(item) && typeof item === "object")
    .filter((item) => includePrivate || item.sensitivity !== "private")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((item) => `${item.label || item.code || "Dimensi"}: ${item.score ?? 0}%${item.level ? ` (${item.level})` : ""}`);
}

export async function GET(request: NextRequest, context: { params: Promise<Params> }) {
  const auth = await authorizeAssessmentExporter();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { awardeeId, kind } = await context.params;
  if (!awardeeId || !["raw", "comprehensive"].includes(kind)) {
    return Response.json({ error: "Jenis dokumen tidak valid." }, { status: 400 });
  }

  const { data: accessibleAwardee, error: accessError } = await auth.supabase
    .from("awardees")
    .select("id,full_name,external_id,campus,major,cohort,region,phone_last4")
    .eq("id", awardeeId)
    .maybeSingle();
  if (accessError || !accessibleAwardee) return Response.json({ error: "Awardee tidak tersedia dalam cakupan akses akun ini." }, { status: 403 });

  const awardee = accessibleAwardee as Awardee;
  const admin = createAdminClient();
  const { data: sessionData, error: sessionError } = await admin
    .from("assessment_sessions")
    .select("id,period_id,status,started_at,completed_at")
    .eq("awardee_id", awardeeId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sessionError) return Response.json({ error: "Sesi assessment belum dapat dibaca." }, { status: 500 });
  if (!sessionData) return Response.json({ error: "Awardee belum memiliki assessment yang selesai." }, { status: 409 });
  const session = sessionData as Session;

  const [periodQuery, resultQuery, answerQuery, questionQuery, moduleQuery, followupQuery] = await Promise.all([
    admin.from("assessment_periods").select("name,academic_year,semester").eq("id", session.period_id).maybeSingle(),
    admin.from("assessment_results").select("summary,dimensions,career_orientation,scoring_version,generated_at").eq("session_id", session.id).maybeSingle(),
    admin.from("assessment_answers").select("question_id,selected").eq("session_id", session.id),
    admin.from("assessment_questions").select("id,code,statement,sensitivity,module_id,sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.from("assessment_modules").select("id,title,sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.from("followups").select("category,signal,notes,action_plan,deadline,status,created_at").eq("awardee_id", awardeeId).order("created_at", { ascending: false }).limit(10),
  ]);

  if (periodQuery.error || resultQuery.error || answerQuery.error || questionQuery.error || moduleQuery.error || followupQuery.error) {
    console.error("report data error", periodQuery.error || resultQuery.error || answerQuery.error || questionQuery.error || moduleQuery.error || followupQuery.error);
    return Response.json({ error: "Data laporan belum dapat disiapkan." }, { status: 500 });
  }

  const period = periodQuery.data as Period | null;
  const result = resultQuery.data as Result | null;
  const answers = (answerQuery.data ?? []) as Answer[];
  const questions = (questionQuery.data ?? []) as Question[];
  const modules = (moduleQuery.data ?? []) as Module[];
  const followups = (followupQuery.data ?? []) as Followup[];
  const answerMap = new Map(answers.map((item) => [item.question_id, item.selected]));
  const moduleMap = new Map(modules.map((item) => [item.id, item]));

  let signals: Signal[] = [];
  if (auth.mayViewPrivate) {
    const { data, error } = await admin.from("assessment_signals").select("signal_code,title,severity,is_resolved").eq("session_id", session.id).order("created_at", { ascending: true });
    if (error) return Response.json({ error: "Signal assessment belum dapat dibaca." }, { status: 500 });
    signals = (data ?? []) as Signal[];
  }

  const identityLines = [
    `Nama: ${awardee.full_name}`,
    `ID: ${awardee.external_id || "-"}`,
    `Kampus: ${awardee.campus || "-"}`,
    `Jurusan: ${awardee.major || "-"}`,
    `Angkatan: ${awardee.cohort || "-"}`,
    `Wilayah: ${awardee.region || "-"}`,
    `WhatsApp: ${awardee.phone_last4 ? `****${awardee.phone_last4}` : "-"}`,
    `Periode: ${period ? `${period.name} | ${period.academic_year} | Semester ${period.semester}` : "-"}`,
    `Selesai: ${date(session.completed_at)}`,
  ];

  const generatedAt = new Date().toISOString();
  let pdf: Buffer;
  let documentType: "raw_answers" | "comprehensive_report";
  let classification: string;
  let fileLabel: string;

  if (kind === "raw") {
    const visibleQuestions = questions.filter((question) => auth.mayViewPrivate || question.sensitivity === "standard");
    const answerSections = modules.map((module) => ({
      title: module.title,
      lines: visibleQuestions
        .filter((question) => question.module_id === module.id)
        .map((question) => `${answerMap.get(question.id) ? "[X]" : "[ ]"} ${question.code} - ${question.statement}${question.sensitivity !== "standard" ? ` [${question.sensitivity.toUpperCase()}]` : ""}`),
    })).filter((section) => section.lines.length);

    pdf = buildTextPdf({
      title: "ETOS - Raw Assessment Answers",
      subtitle: `Generated ${date(generatedAt)} | ${answers.length} stored answers`,
      classification: auth.mayViewPrivate ? "RESTRICTED - PRIVATE ASSESSMENT DATA" : "INTERNAL - STANDARD ITEMS ONLY",
      footer: "ETOS Assessment Center",
      sections: [{ title: "Identitas Awardee", lines: identityLines }, ...answerSections],
    });
    documentType = "raw_answers";
    classification = auth.mayViewPrivate ? "restricted" : "internal";
    fileLabel = "raw-answers";
  } else {
    const summary = (result?.summary ?? {}) as { character_top?: ScoreItem[]; emotional_resources?: ScoreItem[]; note?: string };
    const career = (result?.career_orientation ?? {}) as { top_three?: ScoreItem[]; career_tracks?: ScoreItem[]; values?: ScoreItem[]; clarity?: ScoreItem | null; exploration?: ScoreItem | null };
    const sections = [
      { title: "Identitas & Assessment", lines: identityLines },
      { title: "Kekuatan Menonjol", lines: scoreLines(summary.character_top, 6).length ? scoreLines(summary.character_top, 6) : ["Belum tersedia."] },
      { title: "Peta Dimensi", lines: result ? objectScoreLines(result.dimensions, auth.mayViewPrivate) : ["Belum tersedia."] },
      { title: "Orientasi Karier - Top 3 RIASEC", lines: scoreLines(career.top_three, 3).length ? scoreLines(career.top_three, 3) : ["Belum tersedia."] },
      { title: "Jalur Karier", lines: scoreLines(career.career_tracks, 6).length ? scoreLines(career.career_tracks, 6) : ["Belum tersedia."] },
      { title: "Nilai Karier", lines: scoreLines(career.values, 6).length ? scoreLines(career.values, 6) : ["Belum tersedia."] },
      { title: "Pendampingan", lines: followups.length ? followups.map((item) => `${date(item.created_at)} | ${item.category} | ${item.status}${item.signal ? ` | Fokus: ${item.signal}` : ""}${item.action_plan ? ` | Aksi: ${item.action_plan}` : ""}${item.deadline ? ` | Target: ${item.deadline}` : ""}`) : ["Belum ada catatan pendampingan."] },
    ];

    if (auth.mayViewPrivate) {
      sections.push({ title: "Private Coaching Signals", lines: signals.length ? signals.map((item) => `${item.signal_code} | ${item.severity.toUpperCase()} | ${item.title} | ${item.is_resolved ? "resolved" : "active"}`) : ["Tidak ada coaching signal pada assessment terbaru."] });
    }
    sections.push({ title: "Catatan Interpretasi", lines: [summary.note || "Hasil assessment merupakan bahan refleksi dan pendampingan, bukan diagnosis atau label psikologis.", `Scoring version: ${result?.scoring_version || "-"}`] });

    pdf = buildTextPdf({
      title: "ETOS - Comprehensive Assessment Report",
      subtitle: `Laporan perkembangan awardee | Generated ${date(generatedAt)}`,
      classification: auth.mayViewPrivate ? "CONFIDENTIAL - INTERNAL ETOS" : "INTERNAL ETOS",
      footer: "ETOS Assessment Center - Confidential",
      sections,
    });
    documentType = "comprehensive_report";
    classification = auth.mayViewPrivate ? "confidential" : "internal";
    fileLabel = "assessment-report";
  }

  const storagePath = `/api/dashboard/reports/${awardeeId}/${kind}`;
  const { data: documentRow } = await admin.from("generated_documents").insert({
    awardee_id: awardeeId,
    session_id: session.id,
    document_type: documentType,
    storage_path: storagePath,
    classification,
    generated_by: auth.actorId,
  }).select("id").maybeSingle();

  await admin.from("audit_logs").insert({
    actor_id: auth.actorId,
    action: "assessment.document_exported",
    resource_type: "generated_document",
    resource_id: documentRow?.id ?? null,
    metadata: { awardee_id: awardeeId, session_id: session.id, document_type: documentType, classification },
  });

  const filename = `etos-${fileLabel}-${safeName(awardee.full_name)}.pdf`;
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
