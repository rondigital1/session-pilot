import Link from "next/link";

interface AppShellProps {
  active?: "session" | "task";
  showTaskNav?: boolean;
  onManageWorkspaces?: () => void;
  children: React.ReactNode;
}

export default function AppShell({
  active = "session",
  showTaskNav = false,
  onManageWorkspaces,
  children,
}: AppShellProps) {
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="brand">
          <Link className="brand-mark" href="/">
            SessionPilot
          </Link>
          <span className="brand-tag">Daily coding sessions, mapped clearly.</span>
        </div>
        <nav className="shell-nav">
          <Link
            className={`nav-link ${active === "session" ? "active" : ""}`}
            href="/"
          >
            Session
          </Link>
          {showTaskNav && (
            <span
              className={`nav-link ${active === "task" ? "active" : ""}`}
              aria-current={active === "task" ? "page" : undefined}
            >
              Task Detail
            </span>
          )}
          {onManageWorkspaces && (
            <button
              className="nav-link"
              onClick={onManageWorkspaces}
              type="button"
            >
              Workspaces
            </button>
          )}
        </nav>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  );
}
