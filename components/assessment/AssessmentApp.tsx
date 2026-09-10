"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type AnswerChange = { questionId: string; selected: boolean };
type SaveState = "idle" | "saving" | "saved" | "offline";
const PAGE_SIZE = 8;
const SAVE_DEBOUNCE_MS = 550;
const PENDING_KEY = "etos_assessment_pending_v2";

function readPending(): AnswerChange[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.questionId === "string" && typeof item.selected === "boolean") : [];
  } catch {
    return [];
  }
}

function writePending(items: AnswerChange[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_KEY, JSON.stringify(items));
}

function mergeAnswerChanges(...groups: AnswerChange[][]) {
  const merged = new Map<string, AnswerChange>();
  groups.flat().forEach((item) => merged.set(item.questionId, item));
  return [...merged.values()];
}

export default function AssessmentApp() {
  const [stage, setStage] = useState<"loading" | "select" | "verify" | "workspace" | "complete">("loading");
  const [awardees, setAwardees] = useState<Awardee[]>([]);
  const [selectedAwardee, setSelectedAwardee] = useState<Awardee | null>(null);
  const [query, setQuery] = useState("");
  const [cohortFilter, setCohortFilter] = useState("all");
  const [last4, setLast4] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<SessionPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [moduleIndex, setModuleIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedRef = useRef<Map<string, AnswerChange>>(new Map());
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const moveToFirstIncomplete = useCallback((payload: SessionPayload, ids: Set<string>) => {
    for (let m = 0; m < payload.modules.length; m += 1) {
      const questionIndex = payload.modules[m].questions.findIndex((question) => !ids.has(question.id));
      if (questionIndex >= 0) {
        setModuleIndex(m);
        setPageIndex(Math.floor(questionIndex / PAGE_SIZE));
        return;
      }
    }
    const lastModuleIndex = Math.max(payload.modules.length - 1, 0);
    const lastQuestionCount = payload.modules[lastModuleIndex]?.questions.length ?? 1;
    setModuleIndex(lastModuleIndex);
    setPageIndex(Math.max(Math.ceil(lastQuestionCount / PAGE_SIZE) - 1, 0));
  }, []);

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
    moveToFirstIncomplete(payload, nextAnswered);
    setStage(payload.session.status === "completed" ? "complete" : "workspace");
  }, [moveToFirstIncomplete]);

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
    let active = true;
    (async () => {
      const [sessionResult, awardeeResult] = await Promise.allSettled([loadSession(), loadAwardees()]);
      if (!active) return;
      if (sessionResult.status === "fulfilled" && sessionResult.value) return;
      if (awardeeResult.status === "rejected") setError(awardeeResult.reason instanceof Error ? awardeeResult.reason.message : "Data awardee belum dapat dimuat.");
      setStage("select");
    })();
    return () => { active = false; };
  }, [loadAwardees, loadSession]);

  const persistAnswers = useCallback(async (items: AnswerChange[]) => {
    const deduped = mergeAnswerChanges(items);
    if (!deduped.length) return true;
    setSaveState("saving");
    try {
      for (let index = 0; index < deduped.length; index += 50) {
        const chunk = deduped.slice(index, index + 50);
        const response = await fetch("/api/assessment/answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: chunk }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Gagal menyimpan jawaban.");
      }
      const savedIds = new Set(deduped.map((item) => item.questionId));
      writePending(readPending().filter((item) => !savedIds.has(item.questionId)));
      setSaveState("saved");
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setSaveState("idle"), 1500);
      return true;
    } catch {
      writePending(mergeAnswerChanges(readPending(), deduped));
      setSaveState("offline");
      return false;
    }
  }, []);

  const flushQueued = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const queued = [...queuedRef.current.values()];
    queuedRef.current.clear();
    return persistAnswers(mergeAnswerChanges(readPending(), queued));
  }, [persistAnswers]);

  const queueAnswer = useCallback((item: AnswerChange) => {
    queuedRef.current.set(item.questionId, item);
    writePending(mergeAnswerChanges(readPending(), [item]));
    setSaveState("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void flushQueued(); }, SAVE_DEBOUNCE_MS);
  }, [flushQueued]);

  useEffect(() => {
    if (stage !== "workspace") return;
    const flushOnline = () => { void flushQueued(); };
    if (navigator.onLine) flushOnline();
    window.addEventListener("online", flushOnline);
    return () => window.removeEventListener("online", flushOnline);
  }, [flushQueued, stage]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    const queued = [...queuedRef.current.values()];
    if (queued.length) writePending(mergeAnswerChanges(readPending(), queued));
  }, []);

  const cohorts = useMemo(() => [...new Set(awardees.map((awardee) => awardee.cohort).filter((value): value is string => Boolean(value)))].sort((a, b) => b.localeCompare(a)), [awardees]);

  const filteredAwardees = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("id");
    return awardees
      .filter((awardee) => cohortFilter === "all" || awardee.cohort === cohortFilter)
      .filter((awardee) => !needle || [awardee.full_name, awardee.campus, awardee.major, awardee.cohort, awardee.region].filter(Boolean).join(" ").toLocaleLowerCase("id").includes(needle))
      .slice(0, 40);
  }, [awardees, cohortFilter, query]);

  const verify = async () => {
    if (!selectedAwardee || last4.length !== 4) return;
    setBusy(true);
    setError("");
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
    } finally {
      setBusy(false);
    }
  };

  const module = workspace?.modules[moduleIndex];
  const totalPages = module ? Math.ceil(module.questions.length / PAGE_SIZE) : 0;
  const pageQuestions = module?.questions.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE) ?? [];
  const progress = workspace?.totalQuestions ? Math.round((answeredIds.size / workspace.totalQuestions) * 100) : 0;
  const missingCount = Math.max((workspace?.totalQuestions ?? 0) - answeredIds.size, 0);
  const selectedCount = Object.entries(answers).filter(([id, selected]) => answeredIds.has(id) && selected).length;
  const pageReviewedCount = pageQuestions.filter((question) => answeredIds.has(question.id)).length;

  const toggleQuestion = (questionId: string) => {
    const selected = !Boolean(answers[questionId]);
    setAnswers((current) => ({ ...current, [questionId]: selected }));
    setAnsweredIds((current) => new Set(current).add(questionId));
    queueAnswer({ questionId, selected });
  };

  const clearAnswers = async (questionIds: string[]) => {
    if (!questionIds.length) return true;
    setClearingId(questionIds.length === 1 ? questionIds[0] : "page");
    setError("");
    questionIds.forEach((id) => queuedRef.current.delete(id));
    writePending(readPending().filter((item) => !questionIds.includes(item.questionId)));
    try {
      const response = await fetch("/api/assessment/answers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Jawaban belum dapat dikosongkan.");
      setAnswers((current) => {
        const next = { ...current };
        questionIds.forEach((id) => delete next[id]);
        return next;
      });
      setAnsweredIds((current) => {
        const next = new Set(current);
        questionIds.forEach((id) => next.delete(id));
        return next;
      });
      setSaveState("saved");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Jawaban belum dapat dikosongkan.");
      return false;
    } finally {
      setClearingId(null);
    }
  };

  const confirmCurrentPage = async () => {
    const rows = pageQuestions.map((question) => ({ questionId: question.id, selected: Boolean(answers[question.id]) }));
    setAnsweredIds((current) => {
      const next = new Set(current);
      rows.forEach((row) => next.add(row.questionId));
      return next;
    });
    rows.forEach((row) => queuedRef.current.delete(row.questionId));
    if (saveTimerRef.current && queuedRef.current.size === 0) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    return persistAnswers(rows);
  };

  const next = async () => {
    setBusy(true);
    setError("");
    await confirmCurrentPage();
    if (!module) { setBusy(false); return; }
    if (pageIndex + 1 < totalPages) {
      setPageIndex((value) => value + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setBusy(false);
      return;
    }
    if (workspace && moduleIndex + 1 < workspace.modules.length) {
      setModuleIndex((value) => value + 1);
      setPageIndex(0);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/assessment/complete", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          await loadSession();
          throw new Error(data.error || "Masih ada pernyataan yang belum dikonfirmasi.");
        }
        throw new Error(data.error || "Assessment belum dapat diselesaikan.");
      }
      setStage("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assessment belum dapat diselesaikan.");
    } finally {
      setBusy(false);
    }
  };

  const previous = async () => {
    await flushQueued();
    if (pageIndex > 0) {
      setPageIndex((value) => value - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (workspace && moduleIndex > 0) {
      const previousModule = workspace.modules[moduleIndex - 1];
      setModuleIndex((value) => value - 1);
      setPageIndex(Math.max(Math.ceil(previousModule.questions.length / PAGE_SIZE) - 1, 0));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const jumpToModule = async (index: number) => {
    await flushQueued();
    const target = workspace?.modules[index];
    if (!target) return;
    const firstIncomplete = target.questions.findIndex((question) => !answeredIds.has(question.id));
    setModuleIndex(index);
    setPageIndex(firstIncomplete >= 0 ? Math.floor(firstIncomplete / PAGE_SIZE) : 0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const jumpToFirstIncomplete = async () => {
    if (!workspace) return;
    await flushQueued();
    moveToFirstIncomplete(workspace, answeredIds);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetCurrentPage = async () => {
    const ids = pageQuestions.map((question) => question.id).filter((id) => answeredIds.has(id));
    if (!ids.length) return;
    if (!window.confirm("Kosongkan jawaban pada halaman ini? Item akan kembali berstatus belum dijawab.")) return;
    await clearAnswers(ids);
  };

  const resetAccess = async () => {
    await flushQueued();
    await fetch("/api/assessment/logout", { method: "POST" });
    setWorkspace(null);
    setSelectedAwardee(null);
    setLast4("");
    setAnswers({});
    setAnsweredIds(new Set());
    setModuleIndex(0);
    setPageIndex(0);
    setError("");
    await loadAwardees();
    setStage("select");
  };

  if (stage === "loading") return (
    <div className={styles.loading}>
      <div className={styles.loadingMark}><span /></div>
      <strong>Menyiapkan ruang refleksi</strong>
      <p>Memuat progres dan menyambungkan autosave...</p>
    </div>
  );

  if (stage === "complete") return (
    <section className={styles.completeCard}>
      <div className={styles.completeGlow} />
      <div className={styles.completeIcon}>✓</div>
      <span className={styles.kicker}>PERJALANAN REFLEKSI SELESAI</span>
      <h1>Terima kasih, {workspace?.awardee.full_name?.split(" ")[0] || "Awardee"}.</h1>
      <p>Jawabanmu sudah tersimpan. Hasil ini akan menjadi bahan percakapan pendampingan dan pengembangan bersama ETOS.</p>
      <div className={styles.completeStats}><div><strong>92</strong><span>Pernyataan</span></div><div><strong>3</strong><span>Modul refleksi</span></div><div><strong>100%</strong><span>Tersimpan</span></div></div>
      <div className={styles.confidential}>🔒 Jawaban pribadi hanya dapat diakses oleh pihak yang memiliki kewenangan.</div>
      <button type="button" className={styles.secondaryButton} onClick={resetAccess}>Keluar dari sesi</button>
    </section>
  );

  if (stage === "workspace" && workspace && module) return (
    <section className={styles.workspace}>
      <div className={styles.workspaceTop}>
        <div className={styles.workspaceIntro}>
          <span className={styles.kicker}>{workspace.period.name}</span>
          <h1>{module.title}</h1>
          <p>{module.reflection_question}</p>
        </div>
        <div className={styles.userChip}><span>{workspace.awardee.full_name.slice(0, 1).toUpperCase()}</span><div><strong>{workspace.awardee.full_name}</strong><small>{[workspace.awardee.major, workspace.awardee.cohort].filter(Boolean).join(" • ")}</small></div></div>
      </div>

      <div className={styles.progressPanel}>
        <div className={styles.progressSummary}>
          <div><span>Progress keseluruhan</span><strong>{progress}%</strong></div>
          <div className={styles.progressNumbers}><span><b>{answeredIds.size}</b> terkonfirmasi</span><span><b>{missingCount}</b> belum dijawab</span><span><b>{selectedCount}</b> dipilih</span></div>
        </div>
        <div className={styles.progressTrack}><span style={{ width: `${progress}%` }} /></div>
        {missingCount > 0 && <button type="button" className={styles.incompleteJump} onClick={() => void jumpToFirstIncomplete()}>Tinjau yang belum dijawab →</button>}
      </div>

      <div className={styles.moduleNav}>{workspace.modules.map((item, index) => {
        const completed = item.questions.filter((question) => answeredIds.has(question.id)).length;
        const pct = Math.round((completed / Math.max(item.questions.length, 1)) * 100);
        return <button type="button" key={item.id} onClick={() => void jumpToModule(index)} className={index === moduleIndex ? styles.moduleActive : pct === 100 ? styles.moduleDone : ""}><span>0{index + 1}</span><strong>{item.title}</strong><small>{pct}%</small></button>;
      })}</div>

      {module.is_restricted && <div className={styles.privateNotice}><div>🔐</div><p><strong>Ruang refleksi privat</strong><span>Jawaban di bagian ini dilindungi lebih ketat dan hanya digunakan untuk pendampingan yang berwenang.</span></p></div>}

      <div className={styles.questionHeader}>
        <div><span>HALAMAN {pageIndex + 1} / {totalPages} · {pageReviewedCount}/{pageQuestions.length} DITINJAU</span><h2>Pilih yang paling menggambarkan dirimu.</h2><p>Tap kartu untuk memilih atau membatalkan pilihan. Kamu bisa kembali kapan saja sebelum assessment diselesaikan.</p></div>
        <div className={`${styles.saveState} ${saveState === "offline" ? styles.saveOffline : ""}`}><i />{saveState === "saving" ? "Menyimpan perubahan" : saveState === "saved" ? "Semua perubahan tersimpan" : saveState === "offline" ? "Offline · aman di perangkat" : "Autosave aktif"}</div>
      </div>

      <div className={styles.questionList}>{pageQuestions.map((question) => {
        const reviewed = answeredIds.has(question.id);
        const checked = reviewed && Boolean(answers[question.id]);
        return <article key={question.id} className={`${styles.questionCard} ${checked ? styles.questionSelected : reviewed ? styles.questionReviewed : ""}`}>
          <button type="button" className={styles.questionMain} onClick={() => toggleQuestion(question.id)} aria-pressed={checked}>
            <span className={styles.checkBox}>{checked ? "✓" : ""}</span>
            <span className={styles.questionCode}>{question.code}</span>
            <span className={styles.questionText}>{question.statement}</span>
          </button>
          <div className={styles.questionFoot}>
            <span data-state={checked ? "selected" : reviewed ? "reviewed" : "empty"}>{checked ? "Dipilih" : reviewed ? "Tidak dipilih" : "Belum ditinjau"}</span>
            {reviewed && <button type="button" onClick={() => void clearAnswers([question.id])} disabled={clearingId === question.id}>{clearingId === question.id ? "Mengosongkan..." : "Kosongkan jawaban"}</button>}
          </div>
        </article>;
      })}</div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <div className={styles.pageTools}>
        <div><strong>Butuh memperbaiki?</strong><span>Kembali ke halaman sebelumnya, hapus centang, atau kosongkan jawaban agar kembali menjadi belum dijawab.</span></div>
        <button type="button" onClick={() => void resetCurrentPage()} disabled={pageReviewedCount === 0 || clearingId === "page"}>{clearingId === "page" ? "Mengosongkan..." : "Reset jawaban halaman"}</button>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} onClick={() => void previous()} disabled={moduleIndex === 0 && pageIndex === 0}>← Kembali</button>
        <div className={styles.actionHint}><span>{pageReviewedCount}/{pageQuestions.length}</span><small>item ditinjau</small></div>
        <button type="button" className={styles.primaryButton} disabled={busy} onClick={next}>{busy ? "Menyimpan..." : moduleIndex === workspace.modules.length - 1 && pageIndex === totalPages - 1 ? "Selesaikan assessment ✓" : "Simpan & lanjut →"}</button>
      </div>
    </section>
  );

  if (stage === "verify" && selectedAwardee) return (
    <section className={styles.verifyCard}>
      <div className={styles.cardAccent} />
      <button type="button" className={styles.backLink} onClick={() => { setStage("select"); setError(""); setLast4(""); }}>← Ganti awardee</button>
      <div className={styles.verifyIdentity}><span className={styles.verifyAvatar}>{selectedAwardee.full_name.slice(0, 1).toUpperCase()}</span><div><span className={styles.kicker}>VERIFIKASI IDENTITAS</span><h1>{selectedAwardee.full_name}</h1><p>{[selectedAwardee.campus, selectedAwardee.major, selectedAwardee.cohort].filter(Boolean).join(" • ")}</p></div></div>
      <form onSubmit={(event) => { event.preventDefault(); void verify(); }} className={styles.verifyForm}>
        <label className={styles.codeLabel}><span>Masukkan 4 digit terakhir WhatsApp</span><small>Contoh: 08•• •••• <b>1234</b></small><input autoFocus inputMode="numeric" enterKeyHint="go" autoComplete="one-time-code" maxLength={4} value={last4} onChange={(event) => setLast4(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" aria-label="4 digit terakhir nomor WhatsApp" /></label>
        <div className={styles.verifyTips}><span>🔒 Hanya 4 digit</span><span>⚡ Verifikasi cepat</span><span>✓ Maks. 5 percobaan</span></div>
        <small className={styles.privacyText}>Nomor WhatsApp lengkap tidak ditampilkan dan tidak dikirim kembali ke browser.</small>
        {error && <div className={styles.errorBox}>{error}</div>}
        <button type="submit" className={styles.primaryButton} disabled={busy || last4.length !== 4}>{busy ? "Memverifikasi..." : "Verifikasi & mulai →"}</button>
      </form>
    </section>
  );

  return (
    <section className={styles.selectCard}>
      <div className={styles.cardAccent} />
      <div className={styles.selectHero}><div><span className={styles.kicker}>MULAI PERJALANAN REFLEKSI</span><h1>Temukan namamu.</h1><p>Pilih identitasmu, verifikasi 4 digit WhatsApp, lalu lanjutkan assessment dengan tenang. Progres tersimpan otomatis.</p></div><div className={styles.selectBadge}><strong>{awardees.length}</strong><span>Awardee aktif</span></div></div>
      <label className={styles.searchBox}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau jurusan..." /></label>
      {cohorts.length > 0 && <div className={styles.filterChips}><button type="button" data-active={cohortFilter === "all"} onClick={() => setCohortFilter("all")}>Semua</button>{cohorts.map((cohort) => <button type="button" key={cohort} data-active={cohortFilter === cohort} onClick={() => setCohortFilter(cohort)}>Angkatan {cohort}</button>)}</div>}
      <div className={styles.listMeta}><span>Menampilkan {filteredAwardees.length} awardee</span>{(query || cohortFilter !== "all") && <button type="button" onClick={() => { setQuery(""); setCohortFilter("all"); }}>Reset filter</button>}</div>
      {error && <div className={styles.errorBox}>{error}</div>}
      <div className={styles.awardeeList}>{filteredAwardees.length ? filteredAwardees.map((awardee) => <button type="button" key={awardee.id} className={styles.awardeeRow} onClick={() => { setSelectedAwardee(awardee); setStage("verify"); setError(""); }}><span className={styles.avatar}>{awardee.full_name.slice(0, 1).toUpperCase()}</span><span className={styles.awardeeInfo}><strong>{awardee.full_name}</strong><small>{[awardee.major, awardee.campus].filter(Boolean).join(" • ") || "Awardee ETOS"}</small><em>{awardee.cohort ? `Angkatan ${awardee.cohort}` : "ETOS"}</em></span><b>→</b></button>) : <div className={styles.emptyState}><strong>Tidak ada awardee yang cocok</strong><span>Coba ubah kata kunci atau reset filter angkatan.</span></div>}</div>
      <div className={styles.securityFoot}><span>🔒</span><p><strong>Privasi sebagai default.</strong> Jawaban tersimpan ke ETOS Assessment Center dan aksesnya dibatasi berdasarkan kewenangan pendamping.</p></div>
    </section>
  );
}
