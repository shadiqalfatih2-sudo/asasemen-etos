import Link from "next/link";
import InternalShell from "@/components/dashboard/InternalShell";
import styles from "@/components/dashboard/InternalShell.module.css";
import { requireInternalUser } from "@/lib/internal/auth";

export const dynamic = "force-dynamic";

type AwardeeRow = {
  id: string;
  full_name: string;
  campus: string | null;
  major: string | null;
  cohort: string | null;
};

type SessionRow = {
  awardee_id: string;
  status: "in_progress" | "completed" | "expired";
  completed_at: string | null;
  last_activity_at: string;
};

export default async function DashboardPage() {
  const { supabase, profile } = await requireInternalUser();

  const [{ data: period }, { data: awardeeData }] = await Promise.all([
    supabase
      .from("assessment_periods")
      .select("id,name,academic_year,semester")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("awardees")
      .select("id,full_name,campus,major,cohort")
      .eq("status", "active")
      .order("full_name", { ascending: true })
      .limit(500),
  ]);

  const awardees = (awardeeData ?? []) as AwardeeRow[];
  let sessions: SessionRow[] = [];

  if (period?.id && awardees.length) {
    const { data } = await supabase
      .from("assessment_sessions")
      .select("awardee_id,status,completed_at,last_activity_at")
      .eq("period_id", period.id)
      .in("awardee_id", awardees.map((item) => item.id));
    sessions = (data ?? []) as SessionRow[];
  }

  const statusMap = new Map(sessions.map((session) => [session.awardee_id, session]));
  const completed = sessions.filter((session) => session.status === "completed").length;
  const inProgress = sessions.filter((session) => session.status === "in_progress").length;
  const notStarted = Math.max(awardees.length - completed - inProgress, 0);
  const completionRate = awardees.length ? Math.round((completed / awardees.length) * 100) : 0;

  return (
    <InternalShell profile={profile} active="overview">
      <div className={styles.heading}>
        <div>
          <span className={styles.pill}>INTERNAL DASHBOARD</span>
          <h1>Assessment Overview</h1>
          <p>{period ? `${period.name} · ${period.academic_year} · Semester ${period.semester}` : "Belum ada periode assessment aktif."}</p>
        </div>
        <Link className={styles.actionLink} href="/dashboard/awardees">Kelola Awardee →</Link>
      </div>

      {!awardees.length && (
        <div className={styles.notice}>
          Database awardee masih kosong. Import data awardee terlebih dahulu agar portal assessment dapat digunakan.
        </div>
      )}

      <div className={styles.metrics}>
        <article className={styles.metric}><span>AWARDEE</span><strong>{awardees.length}</strong><small>dalam cakupan akses</small></article>
        <article className={styles.metric}><span>SELESAI</span><strong>{completed}</strong><small>{completionRate}% completion</small></article>
        <article className={styles.metric}><span>BERJALAN</span><strong>{inProgress}</strong><small>assessment aktif</small></article>
        <article className={styles.metric}><span>BELUM MULAI</span><strong>{notStarted}</strong><small>perlu tindak lanjut</small></article>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div><h2>Progress Awardee</h2><p>Status terkini pada periode assessment aktif.</p></div>
          <Link className={styles.actionLink} href="/dashboard/awardees">Lihat semua</Link>
        </div>
        {awardees.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Nama</th><th>Kampus / Jurusan</th><th>Angkatan</th><th>Status</th></tr></thead>
              <tbody>
                {awardees.slice(0, 12).map((awardee) => {
                  const session = statusMap.get(awardee.id);
                  const state = session?.status === "completed" ? "Selesai" : session?.status === "in_progress" ? "Berjalan" : "Belum mulai";
                  const statusClass = session?.status === "completed" ? styles.statusDone : session?.status === "in_progress" ? styles.statusProgress : "";
                  return (
                    <tr key={awardee.id}>
                      <td><strong>{awardee.full_name}</strong></td>
                      <td className={styles.muted}>{[awardee.campus, awardee.major].filter(Boolean).join(" · ") || "—"}</td>
                      <td>{awardee.cohort || "—"}</td>
                      <td><span className={`${styles.status} ${statusClass}`}>{state}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className={styles.empty}>Belum ada data awardee.</div>}
      </section>

      <div className={styles.twoCol}>
        <article className={styles.infoCard}><h3>Jawaban terproteksi</h3><p>Jawaban modul sensitif mengikuti permission <b>assessment.view_private</b> dan tidak terbuka untuk akun tanpa kewenangan.</p></article>
        <article className={styles.infoCard}><h3>Autosave aktif</h3><p>Setiap halaman assessment dikonfirmasi ke Supabase. Saat koneksi putus, perubahan sementara disimpan di perangkat lalu dikirim kembali ketika online.</p></article>
      </div>
    </InternalShell>
  );
}
