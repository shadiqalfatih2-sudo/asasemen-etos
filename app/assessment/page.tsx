import Image from "next/image";
import Link from "next/link";
import AssessmentApp from "@/components/assessment/AssessmentApp";

export default function AssessmentPage() {
  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <Link href="/" className="brand-mark brand-mark-light" aria-label="ETOS Palu Assessment Center">
          <span className="brand-lockup">
            <Image className="brand-logo brand-logo-light" src="/etos-logo.webp" alt="ETOS" width={154} height={48} priority />
            <span className="brand-region">Palu</span>
          </span>
          <small>Assessment Center</small>
        </Link>
        <span className="secure-pill">Sesi privat</span>
      </header>
      <AssessmentApp />
    </main>
  );
}
