import Image from "next/image";
import Link from "next/link";
import { ASSESSMENT_MODULES } from "@/lib/assessment/questions";

export default function HomePage() {
  return (
    <main className="site-home">
      <section className="hero-shell">
        <nav className="nav-wrap">
          <Link href="/" className="brand-mark brand-mark-light" aria-label="ETOS Palu Assessment Center">
            <span className="brand-lockup">
              <Image className="brand-logo brand-logo-light" src="/etos-logo.webp" alt="ETOS" width={168} height={53} priority />
              <span className="brand-region">Palu</span>
            </span>
            <small>Assessment Center</small>
          </Link>
          <div className="nav-links"><a href="#alur">Cara kerja</a><a href="#privasi">Privasi</a></div>
          <div className="nav-actions"><Link className="nav-login" href="/dashboard/login">Login</Link><Link className="nav-start" href="/assessment">Mulai</Link></div>
        </nav>

        <div className="hero-stage">
          <div className="hero-note">
            <span>ETOS AWARDEE DEVELOPMENT · PALU</span>
            <p>Ruang refleksi terarah untuk memahami diri, melihat pola perkembangan, dan menentukan langkah berikutnya.</p>
          </div>
          <div className="hero-cta">
            <h2>Tiga modul. Satu perjalanan yang lebih jelas.</h2>
            <Link href="/assessment">Mulai assessment</Link>
          </div>
        </div>

        <div className="hero-display">
          <h1>KENALI DIRI.<br /><em>TENTUKAN ARAH.</em></h1>
        </div>

        <div className="hero-modules" id="alur">
          {ASSESSMENT_MODULES.map((module, index) => (
            <article key={module.code}>
              <span>0{index + 1}</span>
              <div><strong>{module.title}</strong><p>{module.question}</p></div>
              <small>{module.items.length} pernyataan</small>
            </article>
          ))}
        </div>
      </section>

      <section className="principles" id="privasi">
        <div className="principles-intro"><span>ETOS PALU · ASSESSMENT CENTER</span><h2>Refleksi yang tenang, privat, dan bisa ditindaklanjuti.</h2></div>
        <div className="principles-grid">
          <article><span>01</span><h3>Bukan label</h3><p>Hasil digunakan sebagai bahan percakapan pengembangan, bukan diagnosis atau penilaian psikologis.</p></article>
          <article><span>02</span><h3>Privasi lebih dulu</h3><p>Jawaban sensitif hanya tersedia untuk pendamping yang memiliki kewenangan khusus.</p></article>
          <article><span>03</span><h3>Progres aman</h3><p>Jawaban tersimpan otomatis, dapat ditinjau kembali, dan bisa diperbaiki sebelum assessment diselesaikan.</p></article>
        </div>
      </section>
    </main>
  );
}
