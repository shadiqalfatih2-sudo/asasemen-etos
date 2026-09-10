import InternalShell from "@/components/dashboard/InternalShell";
import UserManager, { type AssignmentAwardee, type ManagedInternalUser } from "@/components/dashboard/UserManager";
import styles from "@/components/dashboard/InternalShell.module.css";
import { canManageUsers, requireInternalUser } from "@/lib/internal/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ProfileRow = { id: string; full_name: string; role: "superadmin" | "coordinator" | "facilitator"; permissions: string[] | null; region: string | null; is_active: boolean };
type AssignmentRow = { facilitator_id: string; awardee_id: string };
type AwardeeRow = { id: string; full_name: string; cohort: string | null; major: string | null };

export default async function UsersPage() {
  const { profile } = await requireInternalUser();
  const mayManage = canManageUsers(profile);

  if (!mayManage) return <InternalShell profile={profile} active="users"><div className={styles.heading}><div><span className={styles.pill}>ACCESS CONTROL</span><h1>Pengguna Internal</h1><p>Manajemen akun hanya tersedia untuk Superadmin.</p></div></div><div className={styles.notice}>Akun Anda tidak memiliki kewenangan mengelola pengguna internal.</div></InternalShell>;

  const admin = createAdminClient();
  const [profilesResult, assignmentsResult, awardeesResult, authUsersResult] = await Promise.all([
    admin.from("profiles").select("id,full_name,role,permissions,region,is_active").order("created_at", { ascending: true }),
    admin.from("facilitator_assignments").select("facilitator_id,awardee_id"),
    admin.from("awardees").select("id,full_name,cohort,major").eq("status", "active").order("full_name"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const emailById = new Map((authUsersResult.data?.users ?? []).map((user) => [user.id, user.email ?? ""]));
  const assignmentMap = new Map<string, string[]>();
  for (const row of (assignmentsResult.data ?? []) as AssignmentRow[]) assignmentMap.set(row.facilitator_id, [...(assignmentMap.get(row.facilitator_id) ?? []), row.awardee_id]);

  const users: ManagedInternalUser[] = ((profilesResult.data ?? []) as ProfileRow[]).map((item) => ({ id: item.id, email: emailById.get(item.id) ?? "", fullName: item.full_name, role: item.role, permissions: Array.isArray(item.permissions) ? item.permissions : [], region: item.region, isActive: item.is_active, awardeeIds: assignmentMap.get(item.id) ?? [] }));
  const awardees: AssignmentAwardee[] = ((awardeesResult.data ?? []) as AwardeeRow[]).map((item) => ({ id: item.id, fullName: item.full_name, cohort: item.cohort, major: item.major }));
  const managerKey = users.map((user) => user.id).join(":") || "empty";

  return <InternalShell profile={profile} active="users">
    <div className={styles.heading}><div><span className={styles.pill}>ACCESS CONTROL</span><h1>Pengguna Internal</h1><p>Kelola akun, role, permission sensitif, password sementara, dan assignment awardee dari satu tempat.</p></div></div>
    <UserManager key={managerKey} initialUsers={users} awardees={awardees} currentUserId={profile.id} />
  </InternalShell>;
}
