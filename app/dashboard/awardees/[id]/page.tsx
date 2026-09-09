import Link from "next/link";
import { notFound } from "next/navigation";
import InternalShell from "@/components/dashboard/InternalShell";
import FollowupManager from "@/components/dashboard/FollowupManager";
import styles from "@/components/dashboard/AwardeeDetail.module.css";
import { canManageAssessments, canViewPrivateAssessments, requireInternalUser } from "@/lib/internal/auth";

export const dynamic = "force-dynamic";

const TABS = ["overview", "answers", "analysis", "followup", "history"] as const;
type Tab = (typeof TABS)[number];
type SessionRow = { id: string; period_id: string; status: "in_progress" | "completed" | "expired"; started_at: string; completed_at: string | null; last_activity_at: string };
type PeriodRow = { id: string; name: string; academic_year: string; semester: number };
type QuestionRow = { id: string; code: string; statement: string; dimension: string; sensitivity: "standard" | "private" | "signal"; module_id: string };
type AnswerRow = { question_id: string; selected: boolean; updated_at: string };
type SignalRow = { id: string; signal_code: string; title: string; severity: "info" | "review" | "priority"; is_resolved: boolean; created_at: string };
type FollowupRow = { id: string; category: string; signal: string | null; notes: string | null; action_plan: string | null; deadline: string | null; status: "open" | "in_progress" | "done" | "cancelled"; created_at: string };
type ScoreItem = { code?: string; label?: string; score?: number; level?: string; sensitivity?: string };
type ResultRow = { session_id: string; summary: { character_top?: ScoreItem[]; note?: string } | null; dimensions: Record<string, ScoreItem> | null; career_orientation: { top_three?: ScoreItem[]; career_tracks?: ScoreItem[]; values?: ScoreItem[]; clarity?: ScoreItem | null; exploration?: ScoreItem | null } | null; scoring_version: string; generated_at: string };

function date(value: string | null) { if (!value) return "—"; return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "ET"; }
function validTab(value: string | undefined): Tab { return TABS.includes(value as Tab) ? value as Tab : "overview"; }

export default async function AwardeeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: requestedTab } = await searchParams;
  const tab = validTab(requestedTab);
  const { supabase, profile } = await requireInternalUser();
  const mayViewPrivate = canViewPrivateAssessments(profile);
  const mayManage = canManageAssessments(profile);

  const { data: awardee } = await supabase.from("awardees").select("id,external_id,full_name,campus,major,cohort,region,status,phone_last4,created_at").eq("id", id).maybeSingle();
  if (!awardee) notFound();

  const [{ data: sessionData }, { data: followupData }] = await Promise.all([
    supabase.from("assessment_sessions").select("id,period_id,status,started_at,completed_at,last_activity_at").eq("awardee_id", id).order("started_at", { ascending: false }),
    supabase.from("followups").select("id,category,signal,notes,action_plan,deadline,status,created_at").eq("awardee_id", id).order("created_at", { ascending: false }),
  ]);
  const sessions = (sessionData ?? []) as SessionRow[];
  const followups = (followupData ?? []) as FollowupRow[];
  const latestSession = sessions[0] ?? null;
  const periodIds = [...new Set(sessions.map((item) => item.period_id))];
  const { data: periodData } = periodIds.length ? await supabase.from("assessment_periods").select("id,name,academic_year,semester").in("id", periodIds) : { data: [] };
  const periods = (periodData ?? []) as PeriodRow[];
  const periodMap = new Map(periods.map((item) => [item.id, item]));

  let result: ResultRow | null = null;
  let signals: SignalRow[] = [];
  if (latestSession?.status === "completed") {
    const { data } = await supabase.from("assessment_results").select("session_id,summary,dimensions,career_orientation,scoring_version,generated_at").eq("session_id", latestSession.id).maybeSingle();
    result = data as ResultRow | null;
    if (mayViewPrivate) {
      const { data: signalData } = await supabase.from("assessment_signals").select("id,signal_code,title,severity,is_resolved,created_at").eq("session_id", latestSession.id).order("created_at", { ascending: true });
      signals = (signalData ?? []) as SignalRow[];
    }
  }

  let answers: AnswerRow[] = [];
  let questions: QuestionRow[] = [];
  let moduleMap = new Map<string, string>();
  if (tab === "answers" && latestSession) {
    const { data: answerData } = await supabase.from("assessment_answers").select("question_id,selected,updated_at").eq("session_id", latestSession.id);
    answers = (answerData ?? []) as AnswerRow[];
    const questionIds = answers.map((item) => item.question_id);
    if (questionIds.length) {
      const { data: questionData } = await supabase.from("assessment_questions").select("id,code,statement,dimension,sensitivity,module_id").in("id", questionIds).order("sort_order", { ascending: true });
      questions = (questionData ?? []) as QuestionRow[];
      const moduleIds = [...new Set(questions.map((item) => item.module_id))];
      if (moduleIds.length) {
        const { data: moduleData } = await supabase.from("assessment_modules").select("id,title").in("id", moduleIds);
        moduleMap = new Map((moduleData ?? []).map((item) => [item.id, item.title]));
      }
    }
  }

  const answerMap = new Map(answers.map((item) => [item.question_id, item]));
  const publicDimensions = Object.values(result?.dimensions ?? {}).filter((item) => item && item.sensitivity !== "private");
  const characterTop = result?.summary?.character_top ?? [];
  const careerTop = result?.career_orientation?.top_three ?? [];
  const careerTracks = result?.career_orientation?.career_tracks ?? [];
  const activeFollowups = followups.filter((item) => item.status === "open" || item.status === "in_progress").length;
  const latestPeriod = latestSession ? periodMap.get(latestSession.period_id) : null;

  return (
    <InternalShell profile={profile} active="awardees">
      <div className={styles.hero}>
        <div><Link className={styles.back} href="/dashboard/awardees">← Kembali ke Awardee</Link><div className={styles.heroMain}><div className={styles.avatar}>{initials(awardee.full_name)}</div><div><h1>{awardee.full_name}</h1><p>{[awardee.campus, awardee.major, awardee.cohort].filter(Boolean).join(" · ") || "Profil awardee"}</p><div className={styles.heroMeta}>{awardee.region && <span>{awardee.region}</span>}{awardee.external_id && <span>ID {awardee.external_id}</span>}{awardee.phone_last4 && <span>WA •••• {awardee.phone_last4}</span>}</div></div></div></div>
        <div className={styles.heroMeta}><span>{latestSession?.status === "completed" ? "Assessment selesai" : latestSession?.status === "in_progress" ? "Assessment berjalan" : "Belum assessment"}</span></div>
      </div>

      <nav className={styles.tabs}>
        <Link data-active={tab === "overview" ? "true" : "false"} href={`/dashboard/awardees/${id}?tab=overview`}>Overview</Link>
        <Link data-active={tab === "answers" ? "true" : "false"} href={`/dashboard/awardees/${id}?tab=answers`}>Jawaban Detail</Link>
        <Link data-active={tab === "analysis" ? "true" : "false"} href={`/dashboard/awardees/${id}?tab=analysis`}>Analisis</Link>
        <Link data-active={tab === "followup" ? "true" : "false"} href={`/dashboard/awardees/${id}?tab=followup`}>Pendampingan</Link>
        <Link data-active={tab === "history" ? "true" : "false"} href={`/dashboard/awardees/${id}?tab=history`}>Histori</Link>
      </nav>

      {tab === "overview" && <>
        <div className={styles.grid3}><article className={styles.statCard}><span>STATUS</span><strong>{latestSession?.status === "completed" ? "Selesai" : latestSession?.status === "in_progress" ? "Berjalan" : "—"}</strong><small>{latestPeriod?.name || "Belum ada sesi"}</small></article><article className={styles.statCard}><span>PENDAMPINGAN</span><strong>{activeFollowups}</strong><small>tindak lanjut aktif</small></article><article className={styles.statCard}><span>TERAKHIR AKTIF</span><strong>{latestSession ? date(latestSession.last_activity_at) : "—"}</strong><small>{sessions.length} histori sesi</small></article></div>
        {latestSession?.status === "completed" && result ? <div className={styles.analysisLead}><section className={styles.sectionCard}><div className={styles.sectionTitle}><div><span>KEKUATAN MENONJOL</span><h2>Profil reflektif</h2></div></div><div className={styles.topList}>{characterTop.slice(0, 4).map((item) => <div className={styles.topItem} key={item.code}><strong>{item.label || item.code}</strong><span>{item.score ?? 0}%</span></div>)}</div></section><section className={styles.sectionCard}><div className={styles.sectionTitle}><div><span>ARAH MINAT</span><h2>Top orientasi</h2></div></div><div className={styles.topList}>{careerTop.slice(0, 3).map((item) => <div className={styles.topItem} key={item.code}><strong>{item.label || item.code}</strong><span>{item.score ?? 0}%</span></div>)}</div></section></div> : <div className={styles.sectionCard}><div className={styles.emptyState}>Analisis akan tersedia setelah assessment 92 item selesai.</div></div>}
      </>}

      {tab === "answers" && <section className={styles.sectionCard}>
        <div className={styles.sectionTitle}><div><span>RAW ANSWERS</span><h2>Jawaban Detail</h2></div><b>{answers.length} terlihat</b></div>
        {!mayViewPrivate && <div className={styles.noticePrivate}><strong>AKSES PRIVAT DIBATASI</strong>Item sensitif dari modul Memahami Diri otomatis disembunyikan oleh Row Level Security. Hanya permission assessment.view_private yang dapat membukanya.</div>}
        {latestSession ? ["Mengenal Diri", "Memahami Diri", "Menentukan Arah"].map((moduleTitle) => { const moduleQuestions = questions.filter((question) => moduleMap.get(question.module_id) === moduleTitle); if (!moduleQuestions.length) return null; return <div className={styles.answerGroup} key={moduleTitle}><h3>{moduleTitle}</h3><div className={styles.answerList}>{moduleQuestions.map((question) => { const answer = answerMap.get(question.id); return <div className={styles.answer} key={question.id}><span className={styles.answerCode}>{question.code}</span><span className={styles.answerText}>{question.statement}</span><span className={styles.answerState} data-selected={answer?.selected ? "true" : "false"}>{answer?.selected ? "Dipilih" : "Tidak dipilih"}</span></div>; })}</div></div>; }) : <div className={styles.emptyState}>Awardee belum memiliki sesi assessment.</div>}
      </section>}

      {tab === "analysis" && <>{result ? <>
        <section className={styles.sectionCard}><div className={styles.sectionTitle}><div><span>DIMENSION MAP</span><h2>Analisis Profil & Arah</h2></div><b>Scoring {result.scoring_version}</b></div><div className={styles.scoreGrid}>{publicDimensions.map((item) => <div className={styles.scoreCard} key={item.code}><div className={styles.scoreTop}><strong>{item.label || item.code}</strong><span>{item.score ?? 0}%</span></div><div className={styles.bar}><i style={{ width: `${Math.max(0, Math.min(100, item.score ?? 0))}%` }} /></div><small>{item.level || "refleksi"}</small></div>)}</div><p className={styles.disclaimer}>Hasil ini merupakan bahan refleksi dan pendampingan. Skor tidak dimaksudkan sebagai diagnosis klinis, tes kepribadian baku, atau label tetap terhadap awardee.</p></section>
        <div className={styles.analysisLead}><section className={styles.sectionCard}><div className={styles.sectionTitle}><div><span>RIASEC</span><h2>Top 3 orientasi</h2></div></div><div className={styles.topList}>{careerTop.map((item) => <div className={styles.topItem} key={item.code}><strong>{item.label || item.code}</strong><span>{item.score ?? 0}%</span></div>)}</div></section><section className={styles.sectionCard}><div className={styles.sectionTitle}><div><span>CAREER TRACK</span><h2>Jalur yang menarik</h2></div></div><div className={styles.topList}>{careerTracks.slice(0, 6).map((item) => <div className={styles.topItem} key={item.code}><strong>{item.label || item.code}</strong><span>{item.score ?? 0}%</span></div>)}</div></section></div>
        {mayViewPrivate && <section className={styles.sectionCard}><div className={styles.sectionTitle}><div><span>PRIVATE COACHING SIGNAL</span><h2>Signal untuk ditinjau</h2></div><b>{signals.filter((item) => !item.is_resolved).length} aktif</b></div>{signals.length ? <div className={styles.signalList}>{signals.map((signal) => <div className={styles.signal} data-severity={signal.severity} key={signal.id}><div><strong>{signal.title}</strong><small>{signal.signal_code} · bahan percakapan pendampingan</small></div><span>{signal.severity}</span></div>)}</div> : <div className={styles.emptyState}>Tidak ada coaching signal aktif dari assessment terbaru.</div>}<p className={styles.disclaimer}>Coaching signal bukan indikator diagnosis, krisis, atau kesimpulan psikologis. Signal hanya membantu fasilitator menentukan topik yang layak ditanyakan secara empatik.</p></section>}
        {!mayViewPrivate && <div className={styles.noticePrivate}><strong>ANALISIS PRIVAT TIDAK DITAMPILKAN</strong>Coaching signal dan jawaban sensitif membutuhkan permission assessment.view_private.</div>}
      </> : <div className={styles.sectionCard}><div className={styles.emptyState}>Belum ada hasil scoring. Hasil dibuat otomatis setelah assessment selesai.</div></div>}</>}

      {tab === "followup" && <FollowupManager awardeeId={id} followups={followups} sessions={sessions.map((session) => ({ id: session.id, label: `${periodMap.get(session.period_id)?.name || "Assessment"} · ${date(session.started_at)}` }))} mayManage={mayManage} />}
      {tab === "history" && <section className={styles.sectionCard}><div className={styles.sectionTitle}><div><span>ASSESSMENT HISTORY</span><h2>Histori Assessment</h2></div><b>{sessions.length} sesi</b></div>{sessions.length ? <div className={styles.history}>{sessions.map((session) => { const period = periodMap.get(session.period_id); return <article className={styles.historyItem} key={session.id}><div><strong>{period?.name || "Assessment ETOS"}</strong><p>{period ? `${period.academic_year} · Semester ${period.semester}` : ""} · mulai {date(session.started_at)}{session.completed_at ? ` · selesai ${date(session.completed_at)}` : ""}</p></div><span data-status={session.status}>{session.status === "completed" ? "Selesai" : session.status === "in_progress" ? "Berjalan" : "Expired"}</span></article>; })}</div> : <div className={styles.emptyState}>Belum ada histori assessment.</div>}</section>}
    </InternalShell>
  );
}
