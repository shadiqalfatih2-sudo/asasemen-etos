import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ETOS Palu Assessment Center",
  description: "Assessment perkembangan awardee ETOS Palu untuk pendampingan yang lebih personal.",
  icons: {
    icon: "/etos-favicon.png",
    shortcut: "/etos-favicon.png",
    apple: "/etos-favicon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
