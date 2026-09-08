import Link from "next/link";
import AssessmentApp from "@/components/assessment/AssessmentApp";

export default function AssessmentPage() {
  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <Link href="/" className="brand-mark"><span>ETOS</span><small>Assessment Center</small></Link>
        <span className="secure-pill">🔒 Sesi aman</span>
      </header>
      <AssessmentApp />
    </main>
  );
}
