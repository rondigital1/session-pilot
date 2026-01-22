import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "./session-context";

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
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
