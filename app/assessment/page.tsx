import Image from "next/image";
import Link from "next/link";
import AssessmentApp from "@/components/assessment/AssessmentApp";

export default function AssessmentPage() {
  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <Link href="/" className="brand-mark" aria-label="ETOS Assessment Center">
          <Image className="brand-logo" src="/etos-logo.webp" alt="ETOS" width={154} height={48} priority />
          <small>Assessment Center</small>
        </Link>
        <span className="secure-pill">🔒 Sesi aman</span>
      </header>
      <AssessmentApp />
    </main>
  );
}
