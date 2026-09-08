import Link from "next/link";
import { ASSESSMENT_MODULES } from "@/lib/assessment/questions";

export default function HomePage() {
  return (
    <main>
      <section className="hero-shell">
        <nav className="nav-wrap">
          <div className="brand-mark"><span>ETOS</span><small>Assessment Center</small></div>
          <Link className="ghost-button" href="/dashboard/login">Login Fasilitator</Link>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">AWARDEE DEVELOPMENT ASSESSMENT</span>
            <h1>Kenali dirimu.<br />Pahami kondisimu.<br /><em>Tentukan arahmu.</em></h1>
            <p>Assessment perkembangan awardee ETOS untuk membantu proses pengembangan diri dan pendampingan yang lebih personal.</p>
            <div className="hero-actions">
              <Link className="primary-button" href="/assessment">Mulai Assessment <span>→</span></Link>
              <span className="privacy-note">Aman · Privat · Pendampingan terarah</span>
            </div>
          </div>

          <div className="journey-card">
            <div className="journey-top"><span>Perjalanan refleksi</span><strong>3 Modul</strong></div>
            <div className="module-list">
              {ASSESSMENT_MODULES.map((module, index) => (
                <div className="module-row" key={module.code}>
                  <div className="module-number">0{index + 1}</div>
                  <div><strong>{module.title}</strong><p>{module.question}</p></div>
                  <span>{module.items.length} item</span>
                </div>
              ))}
            </div>
            <div className="journey-footer"><span>92 pernyataan reflektif</span><span>Autosave</span></div>
          </div>
        </div>
      </section>

      <section className="principles">
        <article><span>01</span><h2>Reflektif, bukan menghakimi</h2><p>Hasil asesmen menjadi bahan percakapan pengembangan, bukan label psikologis.</p></article>
        <article><span>02</span><h2>Privasi sebagai default</h2><p>Jawaban sensitif hanya dapat dilihat oleh peran yang memiliki izin khusus.</p></article>
        <article><span>03</span><h2>Dari insight ke tindak lanjut</h2><p>Temuan asesmen terhubung dengan catatan pendampingan dan rencana aksi.</p></article>
      </section>
    </main>
  );
}
