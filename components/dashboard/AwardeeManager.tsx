"use client";

import { useMemo, useState, type FormEvent } from "react";
import styles from "./AwardeeManager.module.css";

export type ManagedAwardee = {
  id: string;
  external_id: string | null;
  full_name: string;
  campus: string | null;
  major: string | null;
  cohort: string | null;
  region: string | null;
  phone_last4: string | null;
};

type FormState = {
  externalId: string;
  fullName: string;
  whatsapp: string;
  major: string;
  campus: string;
  cohort: string;
  region: string;
};

const EMPTY: FormState = {
  externalId: "",
  fullName: "",
  whatsapp: "",
  major: "",
  campus: "",
  cohort: "",
  region: "",
};

export default function AwardeeManager({ initialAwardees, canManage }: { initialAwardees: ManagedAwardee[]; canManage: boolean }) {
  const [rows, setRows] = useState(initialAwardees);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("id");
    if (!needle) return rows;
    return rows.filter((row) => [row.external_id, row.full_name, row.campus, row.major, row.cohort, row.region]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("id")
      .includes(needle));
  }, [rows, query]);

  const setField = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const reset = () => {
    setEditingId(null);
    setForm(EMPTY);
    setError("");
    setMessage("");
  };

  const edit = (awardee: ManagedAwardee) => {
    setEditingId(awardee.id);
    setForm({
      externalId: awardee.external_id || "",
      fullName: awardee.full_name,
      whatsapp: "",
      major: awardee.major || "",
      campus: awardee.campus || "",
      cohort: awardee.cohort || "",
      region: awardee.region || "",
    });
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(editingId ? `/api/dashboard/awardees/${editingId}` : "/api/dashboard/awardees", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record: form }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Data awardee gagal disimpan.");

      const saved = data.awardee as ManagedAwardee;
      setRows((current) => editingId
        ? current.map((row) => row.id === saved.id ? saved : row).sort((a, b) => a.full_name.localeCompare(b.full_name, "id"))
        : [...current, saved].sort((a, b) => a.full_name.localeCompare(b.full_name, "id")));
      setMessage(editingId ? "Perubahan awardee berhasil disimpan." : "Awardee berhasil ditambahkan dan siap untuk verifikasi assessment.");
      setEditingId(null);
      setForm(EMPTY);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Data awardee gagal disimpan.");
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (awardee: ManagedAwardee) => {
    if (!canManage || busy) return;
    const confirmed = window.confirm(`Nonaktifkan ${awardee.full_name}? Data assessment yang sudah ada tidak akan dihapus.`);
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/dashboard/awardees/${awardee.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Awardee gagal dinonaktifkan.");
      setRows((current) => current.filter((row) => row.id !== awardee.id));
      if (editingId === awardee.id) reset();
      setMessage(`${awardee.full_name} dinonaktifkan dari daftar awardee aktif.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Awardee gagal dinonaktifkan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.manager}>
      {canManage && (
        <section className={styles.editorCard}>
          <div className={styles.editorTop}>
            <div>
              <span className={styles.kicker}>{editingId ? "EDIT AWARDEE" : "INPUT MANUAL"}</span>
              <h2>{editingId ? "Perbarui data awardee" : "Tambah awardee baru"}</h2>
              <p>Nama, nomor HP/WhatsApp, dan jurusan menjadi data utama. Nomor lengkap hanya diproses untuk mengambil 4 digit terakhir.</p>
            </div>
            {editingId && <button className={styles.secondaryButton} type="button" onClick={reset}>Batal Edit</button>}
          </div>

          <form className={styles.form} onSubmit={submit}>
            <label className={styles.wide}>Nama Lengkap <span>*</span><input value={form.fullName} onChange={(e) => setField("fullName", e.target.value)} placeholder="Nama awardee" required /></label>
            <label>No. HP / WhatsApp <span>*</span><input value={form.whatsapp} onChange={(e) => setField("whatsapp", e.target.value)} placeholder={editingId ? "Kosongkan jika tidak berubah" : "Contoh: 0812 3456 7890"} required={!editingId} inputMode="tel" /></label>
            <label>Jurusan / Prodi <span>*</span><input value={form.major} onChange={(e) => setField("major", e.target.value)} placeholder="Contoh: Teknik Informatika" required /></label>
            <label>Kampus<input value={form.campus} onChange={(e) => setField("campus", e.target.value)} placeholder="Universitas / kampus" /></label>
            <label>Angkatan<input value={form.cohort} onChange={(e) => setField("cohort", e.target.value)} placeholder="Contoh: 2026" /></label>
            <label>Wilayah / Cabang<input value={form.region} onChange={(e) => setField("region", e.target.value)} placeholder="Contoh: Palu" /></label>
            <label>ID Awardee<input value={form.externalId} onChange={(e) => setField("externalId", e.target.value)} placeholder="Opsional" /></label>
            <div className={styles.formAction}>
              <small>{editingId ? "Isi nomor HP hanya jika ingin menggantinya." : "Nomor penuh tidak disimpan di database."}</small>
              <button className={styles.primaryButton} disabled={busy} type="submit">{busy ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Tambah Awardee"}</button>
            </div>
          </form>
          {message && <div className={styles.success}>{message}</div>}
          {error && <div className={styles.error}>{error}</div>}
        </section>
      )}

      <section className={styles.listCard}>
        <div className={styles.listTop}>
          <div><h2>{rows.length} Awardee Aktif</h2><p>Cari berdasarkan nama, jurusan, kampus, angkatan, wilayah, atau ID.</p></div>
          <input className={styles.search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari awardee..." />
        </div>

        {filtered.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Nama</th><th>Jurusan / Kampus</th><th>WA</th><th>Angkatan</th><th>Wilayah</th><th>ID</th>{canManage && <th>Aksi</th>}</tr></thead>
              <tbody>{filtered.map((awardee) => (
                <tr key={awardee.id}>
                  <td><strong>{awardee.full_name}</strong></td>
                  <td><strong className={styles.major}>{awardee.major || "—"}</strong><small>{awardee.campus || "Kampus belum diisi"}</small></td>
                  <td>{awardee.phone_last4 ? <span className={styles.phone}>•••• {awardee.phone_last4}</span> : <span className={styles.missing}>Belum</span>}</td>
                  <td>{awardee.cohort || "—"}</td>
                  <td>{awardee.region || "—"}</td>
                  <td><code>{awardee.external_id || "—"}</code></td>
                  {canManage && <td><div className={styles.rowActions}><button type="button" onClick={() => edit(awardee)}>Edit</button><button className={styles.danger} type="button" onClick={() => void deactivate(awardee)}>Nonaktifkan</button></div></td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className={styles.empty}>Tidak ada awardee yang cocok dengan pencarian.</div>}
      </section>
    </div>
  );
}
