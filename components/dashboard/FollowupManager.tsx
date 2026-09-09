"use client";

import { useMemo, useState } from "react";
import styles from "./AwardeeDetail.module.css";

type Followup = { id: string; category: string; signal: string | null; notes: string | null; action_plan: string | null; deadline: string | null; status: "open" | "in_progress" | "done" | "cancelled"; created_at: string };
type SessionOption = { id: string; label: string };

export default function FollowupManager({ awardeeId, followups, sessions, mayManage }: { awardeeId: string; followups: Followup[]; sessions: SessionOption[]; mayManage: boolean }) {
  const [category, setCategory] = useState("Pendampingan");
  const [signal, setSignal] = useState("");
  const [notes, setNotes] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [deadline, setDeadline] = useState("");
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const openCount = useMemo(() => followups.filter((item) => item.status === "open" || item.status === "in_progress").length, [followups]);

  const createFollowup = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/dashboard/followups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ awardeeId, sessionId: sessionId || null, category, signal, notes, actionPlan, deadline: deadline || null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Catatan belum dapat disimpan.");
      setMessage("Pendampingan berhasil disimpan.");
      window.setTimeout(() => window.location.reload(), 650);
    } catch (err) { setError(err instanceof Error ? err.message : "Catatan belum dapat disimpan."); } finally { setBusy(false); }
  };

  const updateStatus = async (id: string, status: Followup["status"]) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/dashboard/followups", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Status belum dapat diperbarui.");
      window.location.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Status belum dapat diperbarui."); setBusy(false); }
  };

  return (
    <div className={styles.followupLayout}>
      <div className={styles.sectionCard}>
        <div className={styles.sectionTitle}><div><span>RIWAYAT</span><h2>Pendampingan</h2></div><b>{openCount} aktif</b></div>
        {followups.length ? <div className={styles.followupList}>{followups.map((item) => <article className={styles.followupItem} key={item.id}>
          <div className={styles.followupTop}><div><strong>{item.category}</strong><small>{new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(item.created_at))}</small></div><span data-status={item.status}>{item.status === "in_progress" ? "Berjalan" : item.status === "done" ? "Selesai" : item.status === "cancelled" ? "Dibatalkan" : "Open"}</span></div>
          {item.signal && <p><b>Signal:</b> {item.signal}</p>}{item.notes && <p>{item.notes}</p>}{item.action_plan && <div className={styles.actionPlan}><b>Rencana aksi</b><span>{item.action_plan}</span></div>}{item.deadline && <small>Target: {item.deadline}</small>}
          {mayManage && item.status !== "done" && item.status !== "cancelled" && <div className={styles.inlineActions}>{item.status === "open" && <button disabled={busy} onClick={() => void updateStatus(item.id, "in_progress")}>Mulai</button>}<button disabled={busy} onClick={() => void updateStatus(item.id, "done")}>Tandai selesai</button></div>}
        </article>)}</div> : <div className={styles.emptyState}>Belum ada catatan pendampingan.</div>}
      </div>
      {mayManage && <div className={styles.sectionCard}>
        <div className={styles.sectionTitle}><div><span>FOLLOW-UP BARU</span><h2>Catat tindak lanjut</h2></div></div>
        <div className={styles.formGrid}>
          <label>Kategori<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Pendampingan" /></label>
          <label>Assessment<select value={sessionId} onChange={(event) => setSessionId(event.target.value)}><option value="">Tanpa sesi khusus</option>{sessions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label className={styles.fullField}>Signal / fokus<input value={signal} onChange={(event) => setSignal(event.target.value)} placeholder="Contoh: tekanan akademik, arah karier" /></label>
          <label className={styles.fullField}>Catatan<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="Ringkasan percakapan atau observasi pendampingan..." /></label>
          <label className={styles.fullField}>Rencana aksi<textarea value={actionPlan} onChange={(event) => setActionPlan(event.target.value)} rows={3} placeholder="Langkah konkret yang disepakati..." /></label>
          <label>Deadline<input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
        </div>
        {error && <div className={styles.formError}>{error}</div>}{message && <div className={styles.formSuccess}>{message}</div>}
        <button className={styles.submitButton} type="button" disabled={busy || !category.trim()} onClick={() => void createFollowup()}>{busy ? "Menyimpan..." : "Simpan tindak lanjut"}</button>
      </div>}
    </div>
  );
}
