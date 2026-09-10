import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { InternalProfile } from "@/lib/internal/auth";
import styles from "./InternalShell.module.css";

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: "⌂", href: "/dashboard" },
  { id: "awardees", label: "Awardee", icon: "◎", href: "/dashboard/awardees" },
  { id: "assessments", label: "Assessment", icon: "✓", href: "/dashboard/assessments" },
  { id: "reports", label: "Laporan", icon: "↗", href: "/dashboard/reports" },
  { id: "settings", label: "Pengaturan", icon: "⚙", href: "/dashboard/settings" },
] as const;

export default function InternalShell({ profile, active, children }: { profile: InternalProfile; active: "overview" | "awardees" | "assessments" | "reports" | "settings" | "users" | "assessment"; children?: ReactNode }) {
  return <main className={styles.shell}>
    <header className={styles.topbar}>
      <Link href="/dashboard" className={styles.brand} aria-label="ETOS Assessment Center">
        <Image className={styles.brandLogo} src="/etos-logo.webp" alt="ETOS" width={136} height={43} priority />
        <small>Assessment Center</small>
      </Link>
      <div className={styles.user}>
        <div className={styles.userText}><strong>{profile.full_name}</strong><small>{profile.role} · {profile.region || "ETOS"}</small></div>
        <span className={styles.userAvatar}>{profile.full_name.slice(0,1).toUpperCase()}</span>
        <form action="/auth/signout" method="post"><button className={styles.logout} type="submit">Keluar</button></form>
      </div>
    </header>
    <div className={styles.body}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTitle}><span>WORKSPACE</span><small>Kelola perjalanan assessment</small></div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => <Link key={item.id} className={active === item.id ? styles.active : ""} href={item.href}><i>{item.icon}</i><span>{item.label}</span></Link>)}
          {profile.role === "superadmin" && <Link className={active === "users" ? styles.active : ""} href="/dashboard/users"><i>♙</i><span>Pengguna</span></Link>}
          <div className={styles.navDivider} />
          <Link className={active === "assessment" ? styles.active : ""} href="/assessment"><i>↗</i><span>Portal Awardee</span></Link>
        </nav>
        <div className={styles.sidebarFoot}><span>🔒</span><p>Data sensitif mengikuti role, permission, dan assignment.</p></div>
      </aside>
      <section className={styles.content}>{children}</section>
    </div>
  </main>;
}
