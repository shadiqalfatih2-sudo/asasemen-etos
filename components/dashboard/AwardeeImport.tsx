"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import styles from "./InternalShell.module.css";

type ImportRow = {
  externalId: string;
  fullName: string;
  campus: string;
  major: string;
  cohort: string;
  region: string;
  whatsapp: string;
};

function parseLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") { current += "\""; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(current.trim()); current = "";
    } else current += char;
  }
  values.push(current.trim());
  return values;
}

function parseCsv(text: string): ImportRow[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];
  const first = lines[0];
  const delimiter = first.includes("\t") ? "\t" : first.split(";").length > first.split(",").length ? ";" : ",";
  const headers = parseLine(first, delimiter).map((header) => header.trim().toLowerCase().replace(/\s+/g, "_"));

  const pick = (record: Record<string, string>, aliases: string[]) => aliases.map((alias) => record[alias]).find(Boolean) || "";

  return lines.slice(1).map((line) => {
    const values = parseLine(line, delimiter);
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    return {
      externalId: pick(record, ["external_id", "id_awardee", "id", "kode"]),
      fullName: pick(record, ["full_name", "nama", "nama_lengkap", "name"]),
      campus: pick(record, ["campus", "kampus", "universitas"]),
      major: pick(record, ["major", "jurusan", "program_studi", "prodi"]),
      cohort: pick(record, ["cohort", "angkatan", "tahun_angkatan"]),
      region: pick(record, ["region", "wilayah", "cabang"]),
      whatsapp: pick(record, ["whatsapp", "wa", "no_wa", "nomor_wa", "phone", "telepon", "last4"]),
    };
  }).filter((row) => row.fullName);
}

export default function AwardeeImport() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const validRows = useMemo(() => rows.filter((row) => row.fullName && row.whatsapp.replace(/\D/g, "").length >= 4), [rows]);

  const onFile = async (file?: File) => {
    setMessage(""); setError("");
    if (!file) return;
    if (file.size > 2_000_000) { setError("File terlalu besar. Maksimal 2 MB."); return; }
    const parsed = parseCsv(await file.text());
    setRows(parsed.slice(0, 500));
    setFileName(file.name);
    if (!parsed.length) setError("CSV belum dapat dibaca. Pastikan baris pertama berisi nama kolom.");
  };

  const submit = async () => {
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/dashboard/awardees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: rows }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import gagal.");
      setMessage(`${data.count} awardee berhasil disimpan. Sistem menyimpan 4 digit terakhir dan hash verifikasi; nomor WhatsApp lengkap tidak disimpan.`);
      setRows([]);
      setFileName("");
      window.setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import gagal.");
    } finally { setBusy(false); }
  };

  return (
    <div className={styles.importBox}>
      <div className={styles.importGrid}>
        <label className={styles.fileLabel}>
          File CSV Awardee
          <input type="file" accept=".csv,text/csv,text/plain" onChange={(event: ChangeEvent<HTMLInputElement>) => void onFile(event.target.files?.[0])} />
        </label>
        <button className={styles.primary} type="button" disabled={busy || !rows.length || validRows.length !== rows.length} onClick={submit}>
          {busy ? "Mengimpor..." : `Import ${rows.length || ""} Awardee`}
        </button>
      </div>
      <div className={styles.help}>
        Kolom yang dikenali: <b>nama/full_name</b>, kampus, jurusan/prodi, angkatan, wilayah/cabang, external_id, dan <b>whatsapp/no_wa</b>.
        Nomor WA boleh berupa nomor lengkap atau minimal 4 digit. Nomor lengkap hanya diproses di server; yang disimpan adalah 4 digit terakhir dan hash verifikasi.
        Maksimal 500 baris per import.
      </div>
      {fileName && <div className={styles.help}>File: {fileName} · {validRows.length}/{rows.length} baris siap.</div>}
      {message && <div className={styles.result}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}
      {!!rows.length && (
        <div className={styles.preview}>
          <table>
            <thead><tr><th>Nama</th><th>Kampus</th><th>Jurusan</th><th>Angkatan</th><th>Wilayah</th><th>Verifikasi</th></tr></thead>
            <tbody>
              {rows.slice(0, 6).map((row, index) => (
                <tr key={`${row.externalId}-${row.fullName}-${index}`}>
                  <td>{row.fullName}</td><td>{row.campus || "—"}</td><td>{row.major || "—"}</td><td>{row.cohort || "—"}</td><td>{row.region || "—"}</td>
                  <td>{row.whatsapp.replace(/\D/g, "").length >= 4 ? `•••• ${row.whatsapp.replace(/\D/g, "").slice(-4)}` : "WA kurang dari 4 digit"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
