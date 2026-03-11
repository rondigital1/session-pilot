import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { stableStringify } from "@/server/utils/stableJson";

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

describe("stableStringify", () => {
  it("sorts nested object keys deterministically", () => {
    const left = {
      version: 1,
      repo: {
        defaultBranch: "main",
        isDirty: false,
        meta: {
          lastCommitMessage: "test",
          lastCommitHash: "abc123",
        },
      },
      signals: [
        {
          title: "No CI",
          evidence: "No workflow",
          key: "ci.missing",
        },
      ],
    };

    const right = {
      signals: [
        {
          evidence: "No workflow",
          key: "ci.missing",
          title: "No CI",
        },
      ],
      repo: {
        meta: {
          lastCommitHash: "abc123",
          lastCommitMessage: "test",
        },
        isDirty: false,
        defaultBranch: "main",
      },
      version: 1,
    };

    expect(stableStringify(left)).toBe(stableStringify(right));
    expect(sha256(stableStringify(left))).toBe(sha256(stableStringify(right)));
  });

  it("preserves array order while sorting object keys inside each entry", () => {
    const value = {
      signals: [
        { title: "B", key: "b" },
        { key: "a", title: "A" },
      ],
    };

    expect(stableStringify(value)).toBe(
      '{"signals":[{"key":"b","title":"B"},{"key":"a","title":"A"}]}'
    );
  });

  it("omits undefined object values the same way JSON.stringify does", () => {
    const value = {
      repo: {
        defaultBranch: undefined,
        isDirty: false,
      },
    };

    expect(stableStringify(value)).toBe('{"repo":{"isDirty":false}}');
  });

  it("serializes Date instances predictably", () => {
    const value = {
      createdAt: new Date("2026-03-10T12:00:00.000Z"),
    };

    expect(stableStringify(value)).toBe(
      '{"createdAt":"2026-03-10T12:00:00.000Z"}'
    );
  });
});
