import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { InternalProfile } from "@/lib/internal/auth";
import styles from "./InternalShell.module.css";

export default function InternalShell({
  profile,
  active,
  children,
}: {
  profile: InternalProfile;
  active: "overview" | "awardees" | "assessments" | "assessment";
  children?: ReactNode;
}) {
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/dashboard" className={styles.brand} aria-label="ETOS Assessment Center">
          <Image className={styles.brandLogo} src="/etos-logo.webp" alt="ETOS" width={136} height={43} priority />
          <small>Assessment Center</small>
        </Link>
        <div className={styles.user}>
          <div className={styles.userText}>
            <strong>{profile.full_name}</strong>
            <small>{profile.role}</small>
          </div>
          <form action="/auth/signout" method="post">
            <button className={styles.logout} type="submit">Keluar</button>
          </form>
        </div>
      </header>
      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <nav className={styles.nav}>
            <Link className={active === "overview" ? styles.active : ""} href="/dashboard">Overview</Link>
            <Link className={active === "awardees" ? styles.active : ""} href="/dashboard/awardees">Awardee</Link>
            <Link className={active === "assessments" ? styles.active : ""} href="/dashboard/assessments">Assessment</Link>
            <Link className={active === "assessment" ? styles.active : ""} href="/assessment">Portal Awardee</Link>
          </nav>
        </aside>
        <section className={styles.content}>{children}</section>
      </div>
    </main>
  );
}
