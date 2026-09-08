import InternalShell from "@/components/dashboard/InternalShell";
import AwardeeImport from "@/components/dashboard/AwardeeImport";
import AwardeeManager, { type ManagedAwardee } from "@/components/dashboard/AwardeeManager";
import styles from "@/components/dashboard/InternalShell.module.css";
import { canManageAssessments, requireInternalUser } from "@/lib/internal/auth";

export const dynamic = "force-dynamic";

export default async function AwardeesPage() {
  const { supabase, profile } = await requireInternalUser();
  const { data } = await supabase
    .from("awardees")
    .select("id,external_id,full_name,campus,major,cohort,region,phone_last4")
    .eq("status", "active")
    .order("full_name", { ascending: true })
    .limit(1000);

  const awardees = (data ?? []) as ManagedAwardee[];
  const mayManage = canManageAssessments(profile);

  return (
    <InternalShell profile={profile} active="awardees">
      <div className={styles.heading}>
        <div>
          <span className={styles.pill}>AWARDEE DIRECTORY</span>
          <h1>Data Awardee</h1>
          <p>Tambah, edit, cari, dan kelola identitas awardee untuk akses assessment.</p>
        </div>
      </div>

      {!mayManage && <div className={styles.notice}>Akun Anda memiliki akses lihat. Tambah, edit, nonaktifkan, dan import hanya tersedia untuk koordinator/superadmin atau permission assessment.manage.</div>}

      <AwardeeManager initialAwardees={awardees} canManage={mayManage} />

      {mayManage && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><h2>Import Massal CSV</h2><p>Gunakan ini bila ingin memasukkan banyak awardee sekaligus.</p></div>
          </div>
          <AwardeeImport />
        </section>
      )}
    </InternalShell>
  );
}
