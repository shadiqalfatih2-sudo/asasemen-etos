import InternalShell from "@/components/dashboard/InternalShell";
import AwardeeImport from "@/components/dashboard/AwardeeImport";
import styles from "@/components/dashboard/InternalShell.module.css";
import { canManageAssessments, requireInternalUser } from "@/lib/internal/auth";

export const dynamic = "force-dynamic";

type Awardee = {
  id: string;
  external_id: string | null;
  full_name: string;
  campus: string | null;
  major: string | null;
  cohort: string | null;
  region: string | null;
  phone_last4_hash: string | null;
};

export default async function AwardeesPage() {
  const { supabase, profile } = await requireInternalUser();
  const { data } = await supabase
    .from("awardees")
    .select("id,external_id,full_name,campus,major,cohort,region,phone_last4_hash")
    .eq("status", "active")
    .order("full_name", { ascending: true })
    .limit(1000);

  const awardees = (data ?? []) as Awardee[];
  const mayManage = canManageAssessments(profile);

  return (
    <InternalShell profile={profile} active="awardees">
      <div className={styles.heading}>
        <div>
          <span className={styles.pill}>AWARDEE DIRECTORY</span>
          <h1>Data Awardee</h1>
          <p>Identitas untuk akses assessment. Data yang terlihat mengikuti assignment dan role akun.</p>
        </div>
      </div>

      {mayManage && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><h2>Import Awardee</h2><p>CSV diproses aman; hanya hash 4 digit WhatsApp yang disimpan.</p></div>
          </div>
          <AwardeeImport />
        </section>
      )}

      {!mayManage && <div className={styles.notice}>Akun Anda memiliki akses lihat. Import atau perubahan data hanya tersedia untuk koordinator/superadmin atau permission assessment.manage.</div>}

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><h2>{awardees.length} Awardee</h2><p>Daftar awardee aktif dalam cakupan akses Anda.</p></div></div>
        {awardees.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>ID</th><th>Nama</th><th>Kampus / Jurusan</th><th>Angkatan</th><th>Wilayah</th><th>Verifikasi WA</th></tr></thead>
              <tbody>{awardees.map((awardee) => (
                <tr key={awardee.id}>
                  <td className={styles.muted}>{awardee.external_id || "—"}</td>
                  <td><strong>{awardee.full_name}</strong></td>
                  <td className={styles.muted}>{[awardee.campus, awardee.major].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{awardee.cohort || "—"}</td>
                  <td>{awardee.region || "—"}</td>
                  <td><span className={`${styles.status} ${awardee.phone_last4_hash ? styles.statusDone : ""}`}>{awardee.phone_last4_hash ? "Siap" : "Belum"}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className={styles.empty}>Belum ada awardee pada database project ini.</div>}
      </section>
    </InternalShell>
  );
}
