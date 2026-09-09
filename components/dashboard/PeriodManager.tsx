"use client";

import { useMemo, useState } from "react";
import styles from "./PeriodManager.module.css";

export type PeriodRow = {
  id: string;
  name: string;
  academic_year: string;
  semester: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
};

function inputDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function displayDate(value: string | null) {
  if (!value) return "Tidak dibatasi";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function PeriodManager({ initialPeriods, canManage }: { initialPeriods: PeriodRow[]; canManage: boolean }) {
  const [name, setName] = useState("");
  const [academicYear, setAcademicYear] = useState(String(new Date().getFullYear()));
  const [semester, setSemester] = useState("1");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [activate, setActivate] = useState(true);
  const [editing, setEditing] = useState<PeriodRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const active = useMemo(() => initialPeriods.find((item) => item.is_active) ?? null, [initialPeriods]);

  const refresh = () => window.setTimeout(() => window.location.reload(), 500);

  const createPeriod = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/dashboard/periods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, academicYear, semester: Number(semester), startsAt: startsAt || null, endsAt: endsAt || null, activate }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Periode belum dapat dibuat.");
      setMessage("Periode berhasil dibuat.");
      refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Periode belum dapat dibuat."); setBusy(false); }
  };

  const action = async (id: string, actionName: "activate" | "deactivate") => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/dashboard/periods", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: actionName }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Status periode belum dapat diperbarui.");
      setMessage(actionName === "activate" ? "Periode aktif berhasil diganti." : "Periode berhasil dinonaktifkan.");
      refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Status periode belum dapat diperbarui."); setBusy(false); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/dashboard/periods", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, action: "update", name: editing.name, academicYear: editing.academic_year, semester: editing.semester, startsAt: inputDate(editing.starts_at) || null, endsAt: inputDate(editing.ends_at) || null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Periode belum dapat diperbarui.");
      setMessage("Detail periode berhasil diperbarui.");
      setEditing(null);
      refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Periode belum dapat diperbarui."); setBusy(false); }
  };

  return (
    <div className={styles.layout}>
      <section className={styles.card}>
        <div className={styles.cardHeader}><div><span>PERIODE AKTIF</span><h2>{active?.name || "Belum ada periode aktif"}</h2><p>{active ? `${active.academic_year} · Semester ${active.semester}` : "Aktifkan satu periode agar awardee dapat memulai assessment."}</p></div>{active && <b>AKTIF</b>}</div>
        {active && <div className={styles.window}><div><small>Mulai</small><strong>{displayDate(active.starts_at)}</strong></div><div><small>Selesai</small><strong>{displayDate(active.ends_at)}</strong></div></div>}
      </section>

      {canManage && <section className={styles.card}>
        <div className={styles.cardHeader}><div><span>PERIODE BARU</span><h2>Tambah Tahun Ajaran / Semester</h2><p>Penanda ini menjadi konteks utama seluruh sesi assessment.</p></div></div>
        <div className={styles.formGrid}>
          <label className={styles.full}>Nama periode<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: Assessment ETOS 2026 Semester 2" /></label>
          <label>Tahun ajaran<input value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} placeholder="2026/2027" /></label>
          <label>Semester<select value={semester} onChange={(event) => setSemester(event.target.value)}><option value="1">Semester 1</option><option value="2">Semester 2</option></select></label>
          <label>Mulai<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
          <label>Selesai<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
          <label className={`${styles.full} ${styles.check}`}><input type="checkbox" checked={activate} onChange={(event) => setActivate(event.target.checked)} /><span>Jadikan periode ini aktif setelah dibuat</span></label>
        </div>
        <button className={styles.primary} disabled={busy || !name.trim() || !academicYear.trim()} onClick={() => void createPeriod()}>{busy ? "Menyimpan..." : "Buat periode"}</button>
      </section>}

      <section className={`${styles.card} ${styles.fullWidth}`}>
        <div className={styles.cardHeader}><div><span>HISTORI PERIODE</span><h2>Semua Periode Assessment</h2><p>Hanya satu periode yang dapat aktif pada satu waktu.</p></div><b>{initialPeriods.length} periode</b></div>
        <div className={styles.periodList}>
          {initialPeriods.length ? initialPeriods.map((period) => <article className={styles.period} key={period.id} data-active={period.is_active ? "true" : "false"}>
            <div><strong>{period.name}</strong><p>{period.academic_year} · Semester {period.semester}</p><small>{displayDate(period.starts_at)} → {displayDate(period.ends_at)}</small></div>
            <div className={styles.actions}>{period.is_active ? <span>Aktif</span> : <span data-muted="true">Arsip</span>}{canManage && <><button disabled={busy} onClick={() => setEditing(period)}>Edit</button>{period.is_active ? <button disabled={busy} onClick={() => void action(period.id, "deactivate")}>Nonaktifkan</button> : <button disabled={busy} onClick={() => void action(period.id, "activate")}>Aktifkan</button>}</>}</div>
          </article>) : <div className={styles.empty}>Belum ada periode.</div>}
        </div>
      </section>

      {editing && canManage && <div className={styles.modalBackdrop} role="presentation"><section className={styles.modal} role="dialog" aria-modal="true"><div className={styles.cardHeader}><div><span>EDIT PERIODE</span><h2>{editing.name}</h2></div><button className={styles.close} onClick={() => setEditing(null)}>×</button></div><div className={styles.formGrid}><label className={styles.full}>Nama<input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label><label>Tahun ajaran<input value={editing.academic_year} onChange={(event) => setEditing({ ...editing, academic_year: event.target.value })} /></label><label>Semester<select value={String(editing.semester)} onChange={(event) => setEditing({ ...editing, semester: Number(event.target.value) })}><option value="1">Semester 1</option><option value="2">Semester 2</option></select></label><label>Mulai<input type="datetime-local" value={inputDate(editing.starts_at)} onChange={(event) => setEditing({ ...editing, starts_at: event.target.value || null })} /></label><label>Selesai<input type="datetime-local" value={inputDate(editing.ends_at)} onChange={(event) => setEditing({ ...editing, ends_at: event.target.value || null })} /></label></div><div className={styles.modalActions}><button className={styles.secondary} onClick={() => setEditing(null)}>Batal</button><button className={styles.primary} disabled={busy || !editing.name.trim()} onClick={() => void saveEdit()}>{busy ? "Menyimpan..." : "Simpan perubahan"}</button></div></section></div>}

      {(error || message) && <div className={error ? styles.error : styles.success}>{error || message}</div>}
    </div>
  );
}
