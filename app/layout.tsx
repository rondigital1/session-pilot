import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SessionPilot - Daily Coding Sessions",
  description: "Local-first tool for planning and tracking daily coding sessions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
