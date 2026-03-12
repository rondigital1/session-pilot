import type {
  AutonomyMode,
  RepoAnalysisResult,
  RepoFinding,
  SuggestionRecord,
} from "@/server/types/domain";

type SuggestionKind =
  | "tests"
  | "validation"
  | "lint"
  | "strict_types"
  | "ci"
  | "env"
  | "readme"
  | "large_file"
  | "todo"
  | "dirty_repo"
  | "generic";

function clampScore(score: number): number {
  return Math.max(1, Math.min(10, Math.round(score)));
}

function roundPriorityScore(score: number): number {
  return Number(score.toFixed(2));
}

function uniqueItems(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function classifyFinding(finding: RepoFinding): SuggestionKind {
  if (finding.title === "Missing automated test coverage") {
    return "tests";
  }

  if (finding.title === "Missing deterministic validation commands") {
    return "validation";
  }

  if (finding.title === "Missing lint enforcement") {
    return "lint";
  }

  if (finding.title === "TypeScript strict mode is disabled") {
    return "strict_types";
  }

  if (finding.title === "Missing CI workflow") {
    return "ci";
  }

  if (finding.title === "Missing environment example") {
    return "env";
  }

  if (finding.title === "Missing project README") {
    return "readme";
  }

  if (finding.title === "Large file hotspot" || finding.title === "Largest module review candidate") {
    return "large_file";
  }

  if (finding.title === "TODO hotspot") {
    return "todo";
  }

  if (finding.title === "Dirty repo checkout") {
    return "dirty_repo";
  }

  return "generic";
}

function getImpactScore(analysis: RepoAnalysisResult, finding: RepoFinding, kind: SuggestionKind): number {
  let score = finding.severity === "critical" ? 8 : finding.severity === "warning" ? 6 : 3;

  if (kind === "validation" || kind === "tests") {
    score += 2;
  }

  if (kind === "ci" && analysis.profile.validationCommands.length > 0) {
    score += 2;
  }

  if (kind === "lint" && analysis.profile.languages.includes("typescript")) {
    score += 1;
  }

  if (kind === "large_file" && analysis.profile.lineCount >= 1200) {
    score += 1;
  }

  if (kind === "dirty_repo") {
    score += 1;
  }

  return clampScore(score);
}

function getEffortScore(finding: RepoFinding, kind: SuggestionKind): number {
  const scopedFileCount = uniqueItems(finding.likelyFiles).length;
  let score = 4;

  switch (kind) {
    case "dirty_repo":
    case "readme":
    case "env":
      score = 2;
      break;
    case "lint":
    case "ci":
      score = 3;
      break;
    case "validation":
      score = 4;
      break;
    case "tests":
    case "todo":
      score = 5;
      break;
    case "strict_types":
      score = 6;
      break;
    case "large_file":
      score = 7;
      break;
    default:
      score = finding.category === "architecture" ? 7 : 4;
      break;
  }

  if (scopedFileCount >= 3) {
    score += 1;
  }

  return clampScore(score);
}

function getConfidenceScore(finding: RepoFinding, kind: SuggestionKind): number {
  const dedupedEvidence = Array.from(
    new Map(
      finding.evidence.map((item) => [`${item.label}:${item.detail}:${item.filePath ?? ""}`, item])
    ).values()
  );
  const evidenceWithFiles = dedupedEvidence.filter((item) => item.filePath).length;
  const scopedFileCount = uniqueItems(finding.likelyFiles).length;
  let score = 4 + Math.min(3, dedupedEvidence.length) + Math.min(2, evidenceWithFiles);

  if (scopedFileCount > 0) {
    score += 1;
  }

  if (scopedFileCount > 0 && scopedFileCount <= 3) {
    score += 1;
  }

  if (kind === "dirty_repo") {
    score += 1;
  }

  return clampScore(score);
}

function getRiskScore(
  analysis: RepoAnalysisResult,
  finding: RepoFinding,
  kind: SuggestionKind
): number {
  let score = 3;

  switch (kind) {
    case "dirty_repo":
    case "readme":
      score = 1;
      break;
    case "env":
    case "ci":
      score = 2;
      break;
    case "lint":
    case "validation":
      score = 3;
      break;
    case "tests":
      score = 4;
      break;
    case "todo":
      score = 5;
      break;
    case "strict_types":
      score = 6;
      break;
    case "large_file":
      score = 7;
      break;
    default:
      score = finding.category === "security" ? 6 : finding.category === "architecture" ? 7 : 3;
      break;
  }

  if (analysis.profile.isDirty && kind !== "dirty_repo") {
    score += 1;
  }

  return clampScore(score);
}

function getAutonomyMode(kind: SuggestionKind, finding: RepoFinding): AutonomyMode {
  if (kind === "large_file" || kind === "strict_types" || finding.category === "security") {
    return "manual_review";
  }

  if (kind === "tests" || kind === "todo" || kind === "dirty_repo" || finding.category === "backend") {
    return "guided";
  }

  return "safe_auto";
}

function toSuggestionTitle(kind: SuggestionKind, finding: RepoFinding): string {
  switch (kind) {
    case "tests":
      return "Add a bounded automated test path";
    case "validation":
      return "Define explicit validation commands";
    case "lint":
      return "Add a repo lint command";
    case "strict_types":
      return "Enable TypeScript strict mode incrementally";
    case "ci":
      return "Add a minimal CI workflow";
    case "env":
      return "Check in an environment template";
    case "readme":
      return "Add a short setup README";
    case "large_file":
      return "Refactor the largest module hotspot";
    case "todo":
      return "Burn down the top TODO hotspot";
    case "dirty_repo":
      return "Stabilize the working tree before execution";
    default:
      return finding.title;
  }
}

export function scoreSuggestionsFromAnalysis(
  analysis: RepoAnalysisResult
): Omit<SuggestionRecord, "id" | "repositoryId" | "analysisRunId" | "createdAt">[] {
  return analysis.findings
    .map((finding) => {
      const kind = classifyFinding(finding);
      const impactScore = getImpactScore(analysis, finding, kind);
      const effortScore = getEffortScore(finding, kind);
      const confidenceScore = getConfidenceScore(finding, kind);
      const riskScore = getRiskScore(analysis, finding, kind);
      const likelyFiles = uniqueItems(finding.likelyFiles).slice(0, 3);
      const evidence = Array.from(
        new Map(
          finding.evidence.map((item) => [`${item.label}:${item.detail}:${item.filePath ?? ""}`, item])
        ).values()
      ).slice(0, 4);
      const boundednessBonus =
        likelyFiles.length === 0 ? 0 : likelyFiles.length <= 2 ? 2 : 1;
      const priorityScore = roundPriorityScore(
        impactScore * 1.4 +
          confidenceScore * 1.25 +
          boundednessBonus * 1.5 -
          effortScore * 0.9 -
          riskScore * 0.7
      );

      return {
        title: toSuggestionTitle(kind, finding),
        category: finding.category,
        summary: finding.summary,
        evidence,
        impactScore,
        effortScore,
        confidenceScore,
        riskScore,
        priorityScore,
        autonomyMode: getAutonomyMode(kind, finding),
        likelyFiles,
      };
    })
    .sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      if (right.impactScore !== left.impactScore) {
        return right.impactScore - left.impactScore;
      }

      if (right.confidenceScore !== left.confidenceScore) {
        return right.confidenceScore - left.confidenceScore;
      }

      if (left.effortScore !== right.effortScore) {
        return left.effortScore - right.effortScore;
      }

      return left.title.localeCompare(right.title);
    })
    .slice(0, 10);
}
