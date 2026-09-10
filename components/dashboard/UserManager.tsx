"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./UserManager.module.css";

export type ManagedInternalUser = {
  id: string;
  email: string;
  fullName: string;
  role: "superadmin" | "coordinator" | "facilitator";
  permissions: string[];
  region: string | null;
  isActive: boolean;
  awardeeIds: string[];
};

export type AssignmentAwardee = { id: string; fullName: string; cohort: string | null; major: string | null };

type Draft = ManagedInternalUser & { password: string };
const PERMISSIONS = [
  { id: "assessment.view", label: "Lihat assessment", note: "Akses data dasar assessment." },
  { id: "assessment.view_private", label: "Lihat data privat", note: "Jawaban sensitif dan coaching signal." },
  { id: "assessment.export", label: "Ekspor laporan", note: "Unduh PDF dan laporan." },
  { id: "assessment.manage", label: "Kelola assessment", note: "Kelola awardee dan periode." },
  { id: "assessment.analytics", label: "Analitik", note: "Akses insight agregat." },
];

function defaults(role: Draft["role"]) {
  if (role === "superadmin") return PERMISSIONS.map((item) => item.id);
  if (role === "coordinator") return ["assessment.view", "assessment.export", "assessment.manage", "assessment.analytics"];
  return ["assessment.view"];
}

export default function UserManager({ initialUsers, awardees, currentUserId }: { initialUsers: ManagedInternalUser[]; awardees: AssignmentAwardee[]; currentUserId: string }) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [create, setCreate] = useState({ fullName: "", email: "", password: "", role: "facilitator" as Draft["role"], region: "Palu", permissions: ["assessment.view"] });

  const filteredAwardees = useMemo(() => {
    const needle = assignmentSearch.trim().toLowerCase();
    if (!needle) return awardees;
    return awardees.filter((item) => [item.fullName, item.major, item.cohort].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [assignmentSearch, awardees]);

  const createUser = async () => {
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/dashboard/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(create) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Akun belum dapat dibuat.");
      setSuccess("Akun internal berhasil dibuat. Pengguna dapat login dengan password sementara.");
      setCreate({ fullName: "", email: "", password: "", role: "facilitator", region: "Palu", permissions: ["assessment.view"] });
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Akun belum dapat dibuat."); }
    finally { setBusy(false); }
  };

  const startEdit = (user: ManagedInternalUser) => {
    setEditingId(user.id);
    setDraft({ ...user, password: "" });
    setAssignmentSearch("");
    setError(""); setSuccess("");
  };

  const updateDraftRole = (role: Draft["role"]) => {
    if (!draft) return;
    setDraft({ ...draft, role, permissions: defaults(role) });
  };

  const togglePermission = (id: string) => {
    if (!draft || draft.role === "superadmin" || id === "assessment.view") return;
    setDraft({ ...draft, permissions: draft.permissions.includes(id) ? draft.permissions.filter((item) => item !== id) : [...draft.permissions, id] });
  };

  const toggleAssignment = (awardeeId: string) => {
    if (!draft) return;
    setDraft({ ...draft, awardeeIds: draft.awardeeIds.includes(awardeeId) ? draft.awardeeIds.filter((id) => id !== awardeeId) : [...draft.awardeeIds, awardeeId] });
  };

  const saveUser = async () => {
    if (!draft) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/dashboard/users/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: draft.fullName, role: draft.role, region: draft.region, permissions: draft.permissions, isActive: draft.isActive, password: draft.password, awardeeIds: draft.awardeeIds }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Perubahan belum dapat disimpan.");
      setUsers((current) => current.map((item) => item.id === draft.id ? { ...draft, password: undefined } as ManagedInternalUser : item));
      setSuccess("Perubahan pengguna tersimpan.");
      setEditingId(null); setDraft(null);
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Perubahan belum dapat disimpan."); }
    finally { setBusy(false); }
  };

  return <div className={styles.manager}>
    <section className={styles.createCard}>
      <div className={styles.sectionHead}><div><span>AKUN BARU</span><h2>Tambah pengguna internal</h2><p>Buat akun operasional tanpa membuka dashboard Supabase.</p></div><b>SUPERADMIN ONLY</b></div>
      <div className={styles.createGrid}>
        <label>Nama lengkap<input value={create.fullName} onChange={(e) => setCreate({ ...create, fullName: e.target.value })} placeholder="Nama fasilitator" /></label>
        <label>Email<input type="email" value={create.email} onChange={(e) => setCreate({ ...create, email: e.target.value })} placeholder="nama@etos.id" /></label>
        <label>Password sementara<input type="password" value={create.password} onChange={(e) => setCreate({ ...create, password: e.target.value })} placeholder="Minimal 8 karakter" /></label>
        <label>Role<select value={create.role} onChange={(e) => { const role = e.target.value as Draft["role"]; setCreate({ ...create, role, permissions: defaults(role) }); }}><option value="facilitator">Fasilitator</option><option value="coordinator">Koordinator</option><option value="superadmin">Superadmin</option></select></label>
        <label>Wilayah<input value={create.region} onChange={(e) => setCreate({ ...create, region: e.target.value })} placeholder="Palu" /></label>
      </div>
      <div className={styles.permissionStrip}>{PERMISSIONS.map((item) => <label key={item.id} data-disabled={create.role === "superadmin" || item.id === "assessment.view"}><input type="checkbox" checked={create.role === "superadmin" || create.permissions.includes(item.id)} onChange={() => { if (create.role === "superadmin" || item.id === "assessment.view") return; setCreate({ ...create, permissions: create.permissions.includes(item.id) ? create.permissions.filter((id) => id !== item.id) : [...create.permissions, item.id] }); }} /><span><strong>{item.label}</strong><small>{item.note}</small></span></label>)}</div>
      <button className={styles.primary} disabled={busy || !create.fullName || !create.email || create.password.length < 8} onClick={createUser}>{busy ? "Memproses..." : "Buat akun internal →"}</button>
    </section>

    {(error || success) && <div className={error ? styles.error : styles.success}>{error || success}</div>}

    <section className={styles.userSection}>
      <div className={styles.sectionHead}><div><span>ACCESS CONTROL</span><h2>Pengguna & assignment</h2><p>{users.length} akun internal terdaftar.</p></div></div>
      <div className={styles.userList}>{users.length ? users.map((user) => <article key={user.id} className={styles.userCard} data-active={user.isActive}>
        <div className={styles.userSummary}><div className={styles.userAvatar}>{user.fullName.slice(0,1).toUpperCase()}</div><div className={styles.userIdentity}><strong>{user.fullName}{user.id === currentUserId && <em>Anda</em>}</strong><span>{user.email || "Email tidak tersedia"}</span><small>{user.region || "Semua wilayah"} · {user.awardeeIds.length} assignment</small></div><div className={styles.userBadges}><b data-role={user.role}>{user.role}</b><span data-active={user.isActive}>{user.isActive ? "Aktif" : "Nonaktif"}</span></div><button className={styles.editButton} onClick={() => startEdit(user)}>Kelola</button></div>
        {editingId === user.id && draft && <div className={styles.editor}>
          <div className={styles.editGrid}><label>Nama<input value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} /></label><label>Role<select value={draft.role} onChange={(e) => updateDraftRole(e.target.value as Draft["role"])}><option value="facilitator">Fasilitator</option><option value="coordinator">Koordinator</option><option value="superadmin">Superadmin</option></select></label><label>Wilayah<input value={draft.region || ""} onChange={(e) => setDraft({ ...draft, region: e.target.value })} /></label><label>Password baru <small>(opsional)</small><input type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} placeholder="Kosongkan bila tidak diubah" /></label></div>
          <div className={styles.toggleActive}><label><input type="checkbox" checked={draft.isActive} disabled={draft.id === currentUserId} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /><span>Akun aktif</span></label>{draft.id === currentUserId && <small>Akun yang sedang dipakai tidak dapat dinonaktifkan.</small>}</div>
          <div className={styles.editorBlock}><h3>Permission</h3><div className={styles.permissionStrip}>{PERMISSIONS.map((item) => <label key={item.id} data-disabled={draft.role === "superadmin" || item.id === "assessment.view"}><input type="checkbox" checked={draft.role === "superadmin" || draft.permissions.includes(item.id)} onChange={() => togglePermission(item.id)} /><span><strong>{item.label}</strong><small>{item.note}</small></span></label>)}</div></div>
          <div className={styles.editorBlock}><div className={styles.assignmentHead}><div><h3>Assignment Awardee</h3><p>Fasilitator hanya melihat awardee yang ditugaskan kepadanya.</p></div><input value={assignmentSearch} onChange={(e) => setAssignmentSearch(e.target.value)} placeholder="Cari awardee..." /></div><div className={styles.assignmentList}>{filteredAwardees.map((awardee) => <label key={awardee.id}><input type="checkbox" checked={draft.awardeeIds.includes(awardee.id)} onChange={() => toggleAssignment(awardee.id)} /><span><strong>{awardee.fullName}</strong><small>{[awardee.major, awardee.cohort && `Angkatan ${awardee.cohort}`].filter(Boolean).join(" · ")}</small></span></label>)}</div></div>
          <div className={styles.editorActions}><button className={styles.cancel} onClick={() => { setEditingId(null); setDraft(null); }}>Batal</button><button className={styles.primary} disabled={busy || !draft.fullName || (draft.password.length > 0 && draft.password.length < 8)} onClick={saveUser}>{busy ? "Menyimpan..." : "Simpan perubahan"}</button></div>
        </div>}
      </article>) : <div className={styles.empty}>Belum ada profil pengguna internal.</div>}</div>
    </section>
  </div>;
}
