import { describe, expect, it } from "vitest";
import {
  formatSessionSummary,
  getSessionSummaryPreview,
  parseSessionSummary,
} from "@/lib/session";

describe("session summary formatting", () => {
  it("formats overview and task sections into a structured summary block", () => {
    const summary = formatSessionSummary({
      overview: "Wrapped the release candidate and left one follow-up item.",
      completedTasks: ["Polish onboarding", "Verify settings flow"],
      pendingTasks: ["Review errors"],
      notes: ["Blocked on one flaky request"],
    });

    expect(summary).toBe(`Overview:
Wrapped the release candidate and left one follow-up item.

Accomplished:
- Polish onboarding
- Verify settings flow

Still open:
- Review errors

Notes:
- Blocked on one flaky request`);
  });

  it("parses structured summaries and exposes the overview preview", () => {
    const summary = `Overview:
Wrapped the release candidate and left one follow-up item.

Accomplished:
- Polish onboarding
- Verify settings flow

Still open:
- Review errors`;

    expect(parseSessionSummary(summary)).toEqual([
      {
        title: "Overview",
        kind: "paragraph",
        content: ["Wrapped the release candidate and left one follow-up item."],
      },
      {
        title: "Accomplished",
        kind: "list",
        content: ["Polish onboarding", "Verify settings flow"],
      },
      {
        title: "Still open",
        kind: "list",
        content: ["Review errors"],
      },
    ]);
    expect(getSessionSummaryPreview(summary)).toBe(
      "Wrapped the release candidate and left one follow-up item."
    );
  });
});
