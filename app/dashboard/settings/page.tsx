import InternalShell from "@/components/dashboard/InternalShell";
import PeriodManager, { type PeriodRow } from "@/components/dashboard/PeriodManager";
import styles from "@/components/dashboard/InternalShell.module.css";
import { canManageAssessments, requireInternalUser } from "@/lib/internal/auth";

export const dynamic = "force-dynamic";

type AuditRow = { id: number; action: string; resource_type: string; resource_id: string | null; created_at: string; metadata: Record<string, unknown> | null };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default async function SettingsPage() {
  const { supabase, profile } = await requireInternalUser();
  const mayManage = canManageAssessments(profile);
  const { data: periodData } = await supabase
    .from("assessment_periods")
    .select("id,name,academic_year,semester,starts_at,ends_at,is_active,created_at")
    .order("created_at", { ascending: false });

  let audits: AuditRow[] = [];
  if (mayManage) {
    const { data } = await supabase
      .from("audit_logs")
      .select("id,action,resource_type,resource_id,created_at,metadata")
      .order("created_at", { ascending: false })
      .limit(30);
    audits = (data ?? []) as AuditRow[];
  }

  return (
    <InternalShell profile={profile} active="settings">
      <div className={styles.heading}>
        <div><span className={styles.pill}>ASSESSMENT CONTROL</span><h1>Periode & Pengaturan</h1><p>Kelola tahun ajaran, semester, periode aktif, dan jejak aktivitas penting.</p></div>
      </div>
      {!mayManage && <div className={styles.notice}>Akun Anda dapat melihat periode, tetapi perubahan periode hanya tersedia untuk koordinator, superadmin, atau permission assessment.manage.</div>}
      <PeriodManager initialPeriods={(periodData ?? []) as PeriodRow[]} canManage={mayManage} />

      {mayManage && <section className={styles.panel} style={{ marginTop: 20 }}>
        <div className={styles.panelHeader}><div><h2>Audit Aktivitas Terbaru</h2><p>Jejak perubahan dan ekspor penting untuk kontrol internal.</p></div><span className={styles.status}>{audits.length} aktivitas</span></div>
        {audits.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Waktu</th><th>Aksi</th><th>Resource</th><th>Referensi</th></tr></thead><tbody>{audits.map((item) => <tr key={item.id}><td>{formatDate(item.created_at)}</td><td><strong>{item.action}</strong></td><td className={styles.muted}>{item.resource_type}</td><td className={styles.muted}>{item.resource_id || "—"}</td></tr>)}</tbody></table></div> : <div className={styles.empty}>Belum ada audit log yang dapat ditampilkan.</div>}
      </section>}
    </InternalShell>
  );
}
