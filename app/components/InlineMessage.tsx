import type { ReactNode } from "react";

interface InlineMessageProps {
  tone?: "info" | "success" | "error";
  title?: string;
  children: ReactNode;
  className?: string;
}

export default function InlineMessage({
  tone = "info",
  title,
  children,
  className,
}: InlineMessageProps) {
  const classes = ["inline-message", `inline-message-${tone}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      {title && <p className="inline-message-title">{title}</p>}
      <div className="inline-message-body">{children}</div>
    </div>
  );
}
