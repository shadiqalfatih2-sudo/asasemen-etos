import Link from "next/link";

export default function FacilitatorLoginPage() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <Link href="/" className="brand-mark"><span>ETOS</span><small>Assessment Center</small></Link>
        <div><span className="eyebrow">AREA INTERNAL</span><h1>Login Fasilitator</h1><p>Masuk menggunakan akun internal ETOS. Akses data mengikuti role dan permission.</p></div>
        <form className="login-form">
          <label>Email<input type="email" placeholder="nama@etos.id" disabled /></label>
          <label>Password<input type="password" placeholder="••••••••" disabled /></label>
          <button type="button" disabled>Login</button>
        </form>
        <small>Form akan diaktifkan setelah Supabase Auth project baru terhubung.</small>
      </section>
    </main>
  );
}
