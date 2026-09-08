"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./AssessmentApp.module.css";

type Awardee = { id: string; full_name: string; campus?: string | null; major?: string | null; cohort?: string | null; region?: string | null; photo_url?: string | null };
type Question = { id: string; code: string; statement: string; dimension: string; sort_order: number; sensitivity: "standard" | "private" | "signal" };
type Module = { id: string; code: string; title: string; subtitle?: string | null; reflection_question?: string | null; sort_order: number; is_restricted: boolean; questions: Question[] };
type SessionPayload = {
  session: { status: "in_progress" | "completed" | "expired"; completedAt?: string | null };
  awardee: Awardee;
  period: { id: string; name: string; academic_year: string; semester: number };
  modules: Module[];
  answers: { questionId: string; selected: boolean; updatedAt: string }[];
  totalQuestions: number;
};

type SaveState = "idle" | "saving" | "saved" | "offline";
const PAGE_SIZE = 8;
const PENDING_KEY = "etos_assessment_pending_v1";

function readPending(): { questionId: string; selected: boolean }[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); } catch { return []; }
}

function writePending(items: { questionId: string; selected: boolean }[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_KEY, JSON.stringify(items));
}

export default function AssessmentApp() {
  const [stage, setStage] = useState<"loading" | "select" | "verify" | "workspace" | "complete">("loading");
  const [awardees, setAwardees] = useState<Awardee[]>([]);
  const [selectedAwardee, setSelectedAwardee] = useState<Awardee | null>(null);
  const [query, setQuery] = useState("");
  const [last4, setLast4] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [workspace, setWorkspace] = useState<SessionPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [moduleIndex, setModuleIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const hydrateWorkspace = useCallback((payload: SessionPayload) => {
    const nextAnswers: Record<string, boolean> = {};
    const nextAnswered = new Set<string>();
    for (const answer of payload.answers || []) {
      nextAnswers[answer.questionId] = answer.selected;
      nextAnswered.add(answer.questionId);
    }
    setWorkspace(payload);
    setAnswers(nextAnswers);
    setAnsweredIds(nextAnswered);
    setStage(payload.session.status === "completed" ? "complete" : "workspace");
  }, []);

  const loadAwardees = useCallback(async () => {
    const response = await fetch("/api/assessment/awardees", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Gagal memuat awardee.");
    setAwardees(data.awardees || []);
  }, []);

  const loadSession = useCallback(async () => {
    const response = await fetch("/api/assessment/session", { cache: "no-store" });
    if (!response.ok) return false;
    const payload = (await response.json()) as SessionPayload;
    hydrateWorkspace(payload);
    return true;
  }, [hydrateWorkspace]);

  useEffect(() => {
    (async () => {
      try {
        if (await loadSession()) return;
        await loadAwardees();
        setStage("select");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
        setStage("select");
      }
    })();
  }, [loadAwardees, loadSession]);

  const saveAnswers = useCallback(async (items: { questionId: string; selected: boolean }[]) => {
    if (!items.length) return true;
    setSaveState("saving");
    try {
      const response = await fetch("/api/assessment/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: items }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal menyimpan jawaban.");
      const pending = readPending().filter((queued) => !items.some((saved) => saved.questionId === queued.questionId));
      writePending(pending);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1800);
      return true;
    } catch {
      const merged = new Map(readPending().map((item) => [item.questionId, item]));
      items.forEach((item) => merged.set(item.questionId, item));
      writePending([...merged.values()]);
      setSaveState("offline");
      return false;
    }
  }, []);

  useEffect(() => {
    if (stage !== "workspace") return;
    const flush = () => {
      const pending = readPending();
      if (pending.length) void saveAnswers(pending);
    };
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [saveAnswers, stage]);

  const filteredAwardees = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("id");
    if (!needle) return awardees.slice(0, 30);
    return awardees.filter((awardee) => [awardee.full_name, awardee.campus, awardee.major, awardee.cohort].filter(Boolean).join(" ").toLocaleLowerCase("id").includes(needle)).slice(0, 30);
  }, [awardees, query]);

  const verify = async () => {
    if (!selectedAwardee || last4.length !== 4) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/assessment/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ awardeeId: selectedAwardee.id, last4 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Verifikasi gagal.");
      if (!(await loadSession())) throw new Error("Sesi berhasil dibuat tetapi workspace belum dapat dimuat.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verifikasi gagal.");
    } finally { setBusy(false); }
  };

  const module = workspace?.modules[moduleIndex];
  const totalPages = module ? Math.ceil(module.questions.length / PAGE_SIZE) : 0;
  const pageQuestions = module?.questions.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE) ?? [];
  const progress = workspace?.totalQuestions ? Math.round((answeredIds.size / workspace.totalQuestions) * 100) : 0;

  const toggleQuestion = (questionId: string) => {
    const selected = !Boolean(answers[questionId]);
    setAnswers((current) => ({ ...current, [questionId]: selected }));
    setAnsweredIds((current) => new Set(current).add(questionId));
    window.setTimeout(() => void saveAnswers([{ questionId, selected }]), 250);
  };

  const confirmCurrentPage = async () => {
    const rows = pageQuestions.map((question) => ({ questionId: question.id, selected: Boolean(answers[question.id]) }));
    setAnsweredIds((current) => {
      const next = new Set(current);
      rows.forEach((row) => next.add(row.questionId));
      return next;
    });
    await saveAnswers(rows);
  };

  const next = async () => {
    setBusy(true); setError("");
    await confirmCurrentPage();
    if (!module) { setBusy(false); return; }
    if (pageIndex + 1 < totalPages) {
      setPageIndex((value) => value + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setBusy(false); return;
    }
    if (workspace && moduleIndex + 1 < workspace.modules.length) {
      setModuleIndex((value) => value + 1);
      setPageIndex(0);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setBusy(false); return;
    }

    try {
      const response = await fetch("/api/assessment/complete", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Assessment belum dapat diselesaikan.");
      setStage("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assessment belum dapat diselesaikan.");
    } finally { setBusy(false); }
  };

  const previous = () => {
    if (pageIndex > 0) { setPageIndex((value) => value - 1); return; }
    if (workspace && moduleIndex > 0) {
      const previousModule = workspace.modules[moduleIndex - 1];
      setModuleIndex((value) => value - 1);
      setPageIndex(Math.max(Math.ceil(previousModule.questions.length / PAGE_SIZE) - 1, 0));
    }
  };

  const resetAccess = async () => {
    await fetch("/api/assessment/logout", { method: "POST" });
    setWorkspace(null); setSelectedAwardee(null); setLast4(""); setAnswers({}); setAnsweredIds(new Set()); setModuleIndex(0); setPageIndex(0); setError("");
    await loadAwardees(); setStage("select");
  };

  if (stage === "loading") return <div className={styles.loading}><span /><p>Menyiapkan assessment...</p></div>;

  if (stage === "complete") return (
    <section className={styles.completeCard}>
      <div className={styles.completeIcon}>✓</div>
      <span className={styles.kicker}>ASSESSMENT COMPLETE</span>
      <h1>Terima kasih, {workspace?.awardee.full_name?.split(" ")[0] || "Awardee"}.</h1>
      <p>Jawabanmu sudah tersimpan dan akan menjadi salah satu bahan pendampingan serta pengembangan selama perjalanan bersama ETOS.</p>
      <div className={styles.confidential}>Jawaban pribadi hanya dapat diakses oleh pihak yang memiliki kewenangan.</div>
      <button type="button" className={styles.secondaryButton} onClick={resetAccess}>Keluar dari sesi</button>
    </section>
  );

  if (stage === "workspace" && workspace && module) return (
    <section className={styles.workspace}>
      <div className={styles.workspaceTop}>
        <div><span className={styles.kicker}>{workspace.period.name}</span><h1>{module.title}</h1><p>{module.reflection_question}</p></div>
        <div className={styles.userChip}><strong>{workspace.awardee.full_name}</strong><small>{[workspace.awardee.campus, workspace.awardee.cohort].filter(Boolean).join(" • ")}</small></div>
      </div>
      <div className={styles.progressWrap}><div className={styles.progressMeta}><span>Progress keseluruhan</span><strong>{progress}%</strong></div><div className={styles.progressTrack}><span style={{ width: `${progress}%` }} /></div></div>
      <div className={styles.moduleNav}>{workspace.modules.map((item, index) => <span key={item.id} className={index === moduleIndex ? styles.moduleActive : index < moduleIndex ? styles.moduleDone : ""}>0{index + 1} · {item.title}</span>)}</div>
      {module.is_restricted && <div className={styles.privateNotice}><strong>PRIVATE ASSESSMENT</strong><span>Bagian ini memiliki perlindungan akses lebih tinggi dan digunakan untuk kebutuhan pendampingan.</span></div>}
      <div className={styles.questionHeader}><div><span>Halaman {pageIndex + 1} dari {totalPages}</span><h2>Pilih pernyataan yang paling menggambarkan dirimu.</h2></div><div className={`${styles.saveState} ${saveState === "offline" ? styles.saveOffline : ""}`}>{saveState === "saving" ? "Menyimpan..." : saveState === "saved" ? "✓ Tersimpan" : saveState === "offline" ? "Offline · tersimpan di perangkat" : "Autosave aktif"}</div></div>
      <div className={styles.questionList}>{pageQuestions.map((question) => {
        const checked = Boolean(answers[question.id]);
        return <button type="button" key={question.id} className={`${styles.questionCard} ${checked ? styles.questionSelected : ""}`} onClick={() => toggleQuestion(question.id)} aria-pressed={checked}>
          <span className={styles.checkBox}>{checked ? "✓" : ""}</span><span className={styles.questionCode}>{question.code}</span><span className={styles.questionText}>{question.statement}</span>
        </button>;
      })}</div>
      {error && <div className={styles.errorBox}>{error}</div>}
      <div className={styles.actions}><button type="button" className={styles.secondaryButton} onClick={previous} disabled={moduleIndex === 0 && pageIndex === 0}>Kembali</button><button type="button" className={styles.primaryButton} disabled={busy} onClick={next}>{busy ? "Menyimpan..." : moduleIndex === workspace.modules.length - 1 && pageIndex === totalPages - 1 ? "Selesaikan assessment" : "Simpan & lanjut →"}</button></div>
    </section>
  );

  if (stage === "verify" && selectedAwardee) return (
    <section className={styles.verifyCard}>
      <button type="button" className={styles.backLink} onClick={() => { setStage("select"); setError(""); setLast4(""); }}>← Ganti awardee</button>
      <span className={styles.kicker}>VERIFIKASI IDENTITAS</span><h1>{selectedAwardee.full_name}</h1><p>{[selectedAwardee.campus, selectedAwardee.major, selectedAwardee.cohort].filter(Boolean).join(" • ")}</p>
      <label className={styles.codeLabel}>4 digit terakhir nomor WhatsApp<input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={last4} onChange={(event) => setLast4(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" /></label>
      <small className={styles.privacyText}>Nomor WhatsApp lengkap tidak pernah ditampilkan atau dikirim kembali ke browser.</small>
      {error && <div className={styles.errorBox}>{error}</div>}
      <button type="button" className={styles.primaryButton} disabled={busy || last4.length !== 4} onClick={verify}>{busy ? "Memverifikasi..." : "Verifikasi & lanjut →"}</button>
    </section>
  );

  return (
    <section className={styles.selectCard}>
      <span className={styles.kicker}>MULAI ASSESSMENT</span><h1>Temukan namamu.</h1><p>Pilih identitas awardee, lalu verifikasi menggunakan 4 digit terakhir nomor WhatsApp.</p>
      <label className={styles.searchBox}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, kampus, jurusan, atau angkatan..." /></label>
      {error && <div className={styles.errorBox}>{error}</div>}
      <div className={styles.awardeeList}>{filteredAwardees.length ? filteredAwardees.map((awardee) => <button type="button" key={awardee.id} className={styles.awardeeRow} onClick={() => { setSelectedAwardee(awardee); setStage("verify"); setError(""); }}><span className={styles.avatar}>{awardee.full_name.slice(0, 1).toUpperCase()}</span><span><strong>{awardee.full_name}</strong><small>{[awardee.campus, awardee.major, awardee.cohort].filter(Boolean).join(" • ") || "Awardee ETOS"}</small></span><b>→</b></button>) : <div className={styles.emptyState}><strong>Belum ada data awardee</strong><span>Data awardee aktif perlu dimasukkan ke Assessment Center terlebih dahulu.</span></div>}</div>
      <div className={styles.securityFoot}><span>🔒</span><p><strong>Privasi terjaga.</strong> Jawaban disimpan langsung ke database ETOS Assessment Center dan dilindungi berdasarkan kewenangan akses.</p></div>
    </section>
  );
}
