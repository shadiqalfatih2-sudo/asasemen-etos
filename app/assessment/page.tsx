import Link from "next/link";
import { ASSESSMENT_MODULES } from "@/lib/assessment/questions";

export default function AssessmentStartPage() {
  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <Link href="/" className="brand-mark"><span>ETOS</span><small>Assessment Center</small></Link>
        <span className="secure-pill">Sesi aman</span>
      </header>
      <section className="start-card">
        <span className="eyebrow">MULAI ASSESSMENT</span>
        <h1>Temukan nama Anda</h1>
        <p>Identitas awardee akan diverifikasi menggunakan 4 digit terakhir nomor WhatsApp. Nomor lengkap tidak ditampilkan di perangkat.</p>
        <div className="placeholder-field">Pencarian awardee akan aktif setelah Supabase project dihubungkan.</div>
        <div className="module-preview">
          {ASSESSMENT_MODULES.map((m, i) => <div key={m.code}><span>0{i+1}</span><strong>{m.title}</strong><small>{m.items.length} pernyataan</small></div>)}
        </div>
      </section>
    </main>
  );
}
