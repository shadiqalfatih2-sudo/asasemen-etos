import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import LoginForm from "@/components/dashboard/LoginForm";
import { getInternalUser } from "@/lib/internal/auth";

export const dynamic = "force-dynamic";

export default async function FacilitatorLoginPage() {
  const auth = await getInternalUser();
  if (auth) redirect("/dashboard");

  return (
    <main className="login-shell">
      <section className="login-card">
        <Link href="/" className="brand-mark" aria-label="ETOS Palu Assessment Center">
          <span className="brand-lockup">
            <Image className="brand-logo brand-logo-login" src="/etos-logo.webp" alt="ETOS" width={178} height={56} priority />
            <span className="brand-region">Palu</span>
          </span>
          <small>Assessment Center</small>
        </Link>
        <div>
          <span className="eyebrow">AKSES SUPERADMIN</span>
          <h1>Masuk dengan PIN.</h1>
          <p>Gunakan PIN 6 digit untuk membuka Dashboard ETOS Palu. Tidak perlu email atau password terpisah.</p>
        </div>
        <LoginForm />
        <small>Sesi Superadmin disimpan aman pada perangkat ini dan akan berakhir otomatis.</small>
      </section>
    </main>
  );
}
