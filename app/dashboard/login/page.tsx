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
        <Link href="/" className="brand-mark" aria-label="ETOS Assessment Center">
          <Image className="brand-logo brand-logo-login" src="/etos-logo.webp" alt="ETOS" width={178} height={56} priority />
          <small>Assessment Center</small>
        </Link>
        <div>
          <span className="eyebrow">AREA INTERNAL</span>
          <h1>Login Fasilitator</h1>
          <p>Masuk menggunakan akun internal ETOS. Akses data otomatis mengikuti role, assignment, dan permission.</p>
        </div>
        <LoginForm />
        <small>Assessment sensitif hanya dapat dibuka oleh akun yang memiliki izin khusus.</small>
      </section>
    </main>
  );
}
