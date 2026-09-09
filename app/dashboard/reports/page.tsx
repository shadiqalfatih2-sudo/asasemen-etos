import Link from "next/link";
import InternalShell from "@/components/dashboard/InternalShell";
import styles from "@/components/dashboard/Reports.module.css";
import shell from "@/components/dashboard/InternalShell.module.css";
import { canExportAssessments, canViewPrivateAssessments, requireInternalUser } from "@/lib/internal/auth";

export const dynamic = "force-dynamic";

type Period = { id: string; name: string; academic_year: string; semester: number; is_active: boolean };
type Awardee = { id: string; full_name: string; campus: string | null; major: string | null; cohort: string | null; region: string | null };
type Session = { id: string; awardee_id: string; period_id: string; status: "in_progress" | "completed" | "expired"; started_at: string; completed_at: string | null; last_activity_at: string };
type Followup = { awardee_id: string; status: "open" | "in_progress" | "done" | "cancelled" };
type Signal = { session_id: string; severity: "info" | "review" | "priority"; is_resolved: boolean };

function percent(value: number, total: number) { return total ? Math.round((value / total) * 100) : 0; }
function topCounts(values: Array<string | null>, limit = 6) {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value as string, (counts.get(value as string) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: requestedPeriod } = await searchParams;
  const { supabase, profile } = await requireInternalUser();
  const mayExport = canExportAssessments(profile);
  const mayViewPrivate = canViewPrivateAssessments(profile);

  const [{ data: periodData }, { data: awardeeData }] = await Promise.all([
    supabase.from("assessment_periods").select("id,name,academic_year,semester,is_active").order("created_at", { ascending: false }),
    supabase.from("awardees").select("id,full_name,campus,major,cohort,region").eq("status", "active").order("full_name", { ascending: true }).limit(2000),
  ]);
  const periods = (periodData ?? []) as Period[];
  const awardees = (awardeeData ?? []) as Awardee[];
  const awardeeIds = new Set(awardees.map((item) => item.id));
  const selectedPeriod = periods.find((item) => item.id === requestedPeriod) ?? periods.find((item) => item.is_active) ?? periods[0] ?? null;

  let sessions: Session[] = [];
  if (selectedPeriod) {
    const { data } = await supabase.from("assessment_sessions").select("id,awardee_id,period_id,status,started_at,completed_at,last_activity_at").eq("period_id", selectedPeriod.id).order("last_activity_at", { ascending: false }).limit(4000);
    sessions = (data ?? []) as Session[];
  }

  const [{ data: followupData }, { data: signalData }] = await Promise.all([
    supabase.from("followups").select("awardee_id,status").limit(10000),
    mayViewPrivate ? supabase.from("assessment_signals").select("session_id,severity,is_resolved").limit(10000) : Promise.resolve({ data: [] }),
  ]);
  const followups = ((followupData ?? []) as Followup[]).filter((item) => awardeeIds.has(item.awardee_id));
  const sessionIds = new Set(sessions.map((item) => item.id));
  const signals = ((signalData ?? []) as Signal[]).filter((item) => sessionIds.has(item.session_id));

  const sessionMap = new Map(sessions.map((item) => [item.awardee_id, item]));
  const completed = sessions.filter((item) => item.status === "completed").length;
  const inProgress = sessions.filter((item) => item.status === "in_progress").length;
  const notStarted = Math.max(awardees.length - completed - inProgress, 0);
  const activeFollowups = followups.filter((item) => item.status === "open" || item.status === "in_progress").length;
  const prioritySignals = signals.filter((item) => !item.is_resolved && item.severity === "priority").length;
  const regionCounts = topCounts(awardees.map((item) => item.region));
  const majorCounts = topCounts(awardees.map((item) => item.major));
  const completion = percent(completed, awardees.length);
  const maxRegion = Math.max(...regionCounts.map((item) => item[1]), 1);
  const maxMajor = Math.max(...majorCounts.map((item) => item[1]), 1);

  return (
    <InternalShell profile={profile} active="reports">
      <div className={shell.heading}>
        <div><span className={shell.pill}>REPORTING CENTER</span><h1>Laporan & Analitik</h1><p>Ringkasan operasional assessment, progres awardee, dan akses dokumen individual.</p></div>
        <form className={styles.periodFilter} method="get"><label>Periode<select name="period" defaultValue={selectedPeriod?.id || ""}>{periods.map((period) => <option key={period.id} value={period.id}>{period.name} · {period.academic_year} · S{period.semester}</option>)}</select></label><button type="submit">Tampilkan</button></form>
      </div>

      {!selectedPeriod && <div className={shell.notice}>Belum ada periode assessment. Buat periode terlebih dahulu dari menu Pengaturan.</div>}
      <div className={shell.metrics}>
        <article className={shell.metric}><span>COMPLETION</span><strong>{completion}%</strong><small>{completed} dari {awardees.length} awardee</small></article>
        <article className={shell.metric}><span>BERJALAN</span><strong>{inProgress}</strong><small>sesi belum final</small></article>
        <article className={shell.metric}><span>BELUM MULAI</span><strong>{notStarted}</strong><small>awardee tanpa sesi</small></article>
        <article className={shell.metric}><span>FOLLOW-UP AKTIF</span><strong>{activeFollowups}</strong><small>{mayViewPrivate ? `${prioritySignals} signal prioritas` : "sesuai cakupan akses"}</small></article>
      </div>

      <div className={styles.analyticsGrid}>
        <section className={shell.panel}><div className={shell.panelHeader}><div><h2>Sebaran Wilayah</h2><p>Komposisi awardee dalam cakupan akun.</p></div></div><div className={styles.rankList}>{regionCounts.length ? regionCounts.map(([label, count]) => <div className={styles.rank} key={label}><div><strong>{label}</strong><span>{count} awardee</span></div><i><b style={{ width: `${percent(count, maxRegion)}%` }} /></i></div>) : <div className={shell.empty}>Belum ada data wilayah.</div>}</div></section>
        <section className={shell.panel}><div className={shell.panelHeader}><div><h2>Jurusan Terbanyak</h2><p>Enam jurusan dengan awardee terbanyak.</p></div></div><div className={styles.rankList}>{majorCounts.length ? majorCounts.map(([label, count]) => <div className={styles.rank} key={label}><div><strong>{label}</strong><span>{count} awardee</span></div><i><b style={{ width: `${percent(count, maxMajor)}%` }} /></i></div>) : <div className={shell.empty}>Belum ada data jurusan.</div>}</div></section>
      </div>

      <section className={shell.panel}>
        <div className={shell.panelHeader}><div><h2>Status Awardee</h2><p>{selectedPeriod ? `${selectedPeriod.name} · ${selectedPeriod.academic_year} · Semester ${selectedPeriod.semester}` : "Belum ada periode terpilih."}</p></div>{mayExport && <span className={shell.status}>PDF individual aktif</span>}</div>
        {awardees.length ? <div className={shell.tableWrap}><table className={shell.table}><thead><tr><th>Awardee</th><th>Kampus / Jurusan</th><th>Status</th><th>Dokumen</th></tr></thead><tbody>{awardees.map((awardee) => { const session = sessionMap.get(awardee.id); const state = session?.status === "completed" ? "Selesai" : session?.status === "in_progress" ? "Berjalan" : "Belum mulai"; const statusClass = session?.status === "completed" ? shell.statusDone : session?.status === "in_progress" ? shell.statusProgress : ""; return <tr key={awardee.id}><td><Link className={shell.tableLink} href={`/dashboard/awardees/${awardee.id}`}>{awardee.full_name}</Link><div className={shell.muted}>{[awardee.region, awardee.cohort].filter(Boolean).join(" · ")}</div></td><td>{[awardee.campus, awardee.major].filter(Boolean).join(" · ") || "—"}</td><td><span className={`${shell.status} ${statusClass}`}>{state}</span></td><td>{mayExport && session?.status === "completed" ? <div className={styles.exportLinks}><a href={`/api/dashboard/reports/${awardee.id}/raw`}>Raw PDF</a><a href={`/api/dashboard/reports/${awardee.id}/comprehensive`}>Laporan PDF</a></div> : <span className={shell.muted}>—</span>}</td></tr>; })}</tbody></table></div> : <div className={shell.empty}>Belum ada awardee untuk dianalisis.</div>}
      </section>

      <div className={styles.note}>Laporan agregat hanya menampilkan data dalam cakupan role/assignment akun. Private coaching signal tidak ditampilkan untuk akun tanpa permission <b>assessment.view_private</b>. Ekspor PDF membutuhkan permission <b>assessment.export</b>.</div>
    </InternalShell>
  );
}
