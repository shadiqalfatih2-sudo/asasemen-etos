import Link from "next/link";
import InternalShell from "@/components/dashboard/InternalShell";
import styles from "@/components/dashboard/InternalShell.module.css";
import { canViewPrivateAssessments, requireInternalUser } from "@/lib/internal/auth";

export const dynamic = "force-dynamic";

type SessionRow = { id: string; awardee_id: string; period_id: string; status: "in_progress" | "completed" | "expired"; started_at: string; completed_at: string | null; last_activity_at: string };
type AwardeeRow = { id: string; full_name: string; campus: string | null; major: string | null; cohort: string | null };
type PeriodRow = { id: string; name: string; academic_year: string; semester: number; is_active: boolean };
type SignalRow = { session_id: string; severity: "info" | "review" | "priority"; is_resolved: boolean };

function formatDate(value: string | null) { if (!value) return "—"; return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }

export default async function AssessmentsPage() {
  const { supabase, profile } = await requireInternalUser();
  const mayViewPrivate = canViewPrivateAssessments(profile);
  const [{ data: sessionData }, { data: awardeeData }, { data: periodData }] = await Promise.all([
    supabase.from("assessment_sessions").select("id,awardee_id,period_id,status,started_at,completed_at,last_activity_at").order("last_activity_at", { ascending: false }).limit(1000),
    supabase.from("awardees").select("id,full_name,campus,major,cohort").order("full_name", { ascending: true }).limit(1000),
    supabase.from("assessment_periods").select("id,name,academic_year,semester,is_active").order("created_at", { ascending: false }),
  ]);
  const sessions = (sessionData ?? []) as SessionRow[];
  const awardees = (awardeeData ?? []) as AwardeeRow[];
  const periods = (periodData ?? []) as PeriodRow[];
  const awardeeMap = new Map(awardees.map((item) => [item.id, item]));
  const periodMap = new Map(periods.map((item) => [item.id, item]));
  const signalCounts = new Map<string, { total: number; priority: number }>();
  if (mayViewPrivate && sessions.length) {
    const { data: signalData } = await supabase.from("assessment_signals").select("session_id,severity,is_resolved").in("session_id", sessions.map((item) => item.id));
    for (const signal of (signalData ?? []) as SignalRow[]) { if (signal.is_resolved) continue; const current = signalCounts.get(signal.session_id) ?? { total: 0, priority: 0 }; current.total += 1; if (signal.severity === "priority") current.priority += 1; signalCounts.set(signal.session_id, current); }
  }
  const completed = sessions.filter((item) => item.status === "completed").length;
  const active = sessions.filter((item) => item.status === "in_progress").length;

  return (
    <InternalShell profile={profile} active="assessments">
      <div className={styles.heading}><div><span className={styles.pill}>ASSESSMENT MONITOR</span><h1>Assessment Awardee</h1><p>Pantau progres, buka hasil, dan lanjutkan pendampingan dari satu tempat.</p></div><Link className={styles.actionLink} href="/assessment">Buka Portal Awardee →</Link></div>
      <div className={styles.metrics}><article className={styles.metric}><span>SESI</span><strong>{sessions.length}</strong><small>seluruh periode terlihat</small></article><article className={styles.metric}><span>SELESAI</span><strong>{completed}</strong><small>siap dianalisis</small></article><article className={styles.metric}><span>BERJALAN</span><strong>{active}</strong><small>belum final</small></article><article className={styles.metric}><span>PERIODE</span><strong>{periods.length}</strong><small>{periods.find((item) => item.is_active)?.name || "belum aktif"}</small></article></div>
      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><h2>Daftar Sesi</h2><p>{sessions.length} sesi dalam cakupan akses akun ini.</p></div></div>
        {sessions.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Awardee</th><th>Periode</th><th>Status</th><th>Terakhir aktif</th>{mayViewPrivate && <th>Signal</th>}<th>Aksi</th></tr></thead><tbody>{sessions.map((session) => { const awardee = awardeeMap.get(session.awardee_id); const period = periodMap.get(session.period_id); const signals = signalCounts.get(session.id); const statusClass = session.status === "completed" ? styles.statusDone : session.status === "in_progress" ? styles.statusProgress : ""; return <tr key={session.id}><td><Link className={styles.tableLink} href={`/dashboard/awardees/${session.awardee_id}`}>{awardee?.full_name || "Awardee"}</Link><div className={styles.muted}>{[awardee?.campus, awardee?.major, awardee?.cohort].filter(Boolean).join(" · ")}</div></td><td>{period ? `${period.academic_year} · S${period.semester}` : "—"}<div className={styles.muted}>{period?.name || ""}</div></td><td><span className={`${styles.status} ${statusClass}`}>{session.status === "completed" ? "Selesai" : session.status === "in_progress" ? "Berjalan" : "Expired"}</span></td><td>{formatDate(session.last_activity_at)}</td>{mayViewPrivate && <td>{signals?.total ? <span className={`${styles.status} ${signals.priority ? styles.statusPriority : styles.statusProgress}`}>{signals.priority ? `${signals.priority} prioritas` : `${signals.total} review`}</span> : <span className={styles.muted}>—</span>}</td>}<td><Link className={styles.tableLink} href={`/dashboard/awardees/${session.awardee_id}?tab=${session.status === "completed" ? "analysis" : "overview"}`}>Detail →</Link></td></tr>; })}</tbody></table></div> : <div className={styles.empty}>Belum ada sesi assessment. Sesi akan muncul setelah awardee berhasil melakukan verifikasi.</div>}
      </section>
    </InternalShell>
  );
}
