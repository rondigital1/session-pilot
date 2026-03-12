import { randomUUID } from "crypto";
import {
  createAnalysisRun,
  getRepository,
  storeSuggestions,
  updateAnalysisRun,
  updateRepository,
} from "@/server/db/queries";
import { serializeAnalysisRun, serializeRepository, serializeSuggestion } from "@/server/serializers/orchestrator";
import { scoreSuggestionsFromAnalysis } from "@/server/suggestions/suggestionScoringService";
import { fingerprintRepository } from "./repoFingerprintService";
import type {
  RepoAnalysisResult,
  RepoFinding,
  RepoFindingEvidence,
  RepoProfile,
  RepositoryInventoryItem,
  SuggestionRecord,
} from "@/server/types/domain";

type InspectionResult = Awaited<ReturnType<typeof fingerprintRepository>>;

function createFinding(
  profile: RepoProfile,
  input: Omit<RepoFinding, "id">
): RepoFinding {
  return {
    id: `finding_${profile.repositoryId}_${Math.random().toString(36).slice(2, 10)}`,
    ...input,
  };
}

function createEvidence(
  label: string,
  detail: string,
  filePath?: string
): RepoFindingEvidence {
  return filePath ? { label, detail, filePath } : { label, detail };
}

function collectLikelyFiles(...groups: Array<Array<string | null | undefined>>): string[] {
  const files = groups.flat().filter((filePath): filePath is string => Boolean(filePath));
  return Array.from(new Set(files)).slice(0, 3);
}

function formatValidationCommands(profile: RepoProfile): string {
  return profile.validationCommands.length > 0
    ? profile.validationCommands.map((command) => command.join(" ")).join("; ")
    : "none detected";
}

function isJavascriptOrTypescriptRepo(profile: RepoProfile): boolean {
  return profile.languages.some((language) => language === "javascript" || language === "typescript");
}

function getPrimaryImplementationTargets(inspection: InspectionResult): string[] {
  if (inspection.entryFiles.length > 0) {
    return inspection.entryFiles.slice(0, 2);
  }

  return inspection.largestFiles.map((file) => file.path).slice(0, 2);
}

function buildFindings(
  profile: RepoProfile,
  inspection: InspectionResult
): RepoFinding[] {
  const findings: RepoFinding[] = [];
  const packageManifest = inspection.manifestFiles[0];
  const readmeFile = inspection.readmeFiles[0];
  const envExampleFile = inspection.envExampleFiles[0] ?? ".env.example";
  const typecheckConfig = inspection.typecheckConfigFiles[0] ?? "tsconfig.json";
  const ciTarget = inspection.ciFiles[0] ?? ".github/workflows/ci.yml";
  const primaryTargets = getPrimaryImplementationTargets(inspection);
  const primaryTarget = primaryTargets[0];
  const validationSummary = formatValidationCommands(profile);
  const envUsageFile = inspection.envUsageFiles[0];
  const testFile = inspection.testFiles[0];
  const hasEnvSurface = inspection.envUsageFiles.length > 0 || inspection.envLocalFiles.length > 0;

  if (!profile.hasTests && profile.fileCount > 0) {
    const severity =
      profile.lineCount >= 300 || profile.fileCount >= 10 || profile.validationCommands.length === 0
        ? "critical"
        : "warning";
    const evidence: RepoFindingEvidence[] = [
      createEvidence(
        "Test surface",
        inspection.testFiles.length > 0
          ? "Test files exist, but no bounded test command was inferred."
          : "No test files or test command were detected.",
        testFile
      ),
      createEvidence(
        "Validation plan",
        `Current validation commands: ${validationSummary}.`,
        packageManifest
      ),
    ];

    if (primaryTarget) {
      evidence.push(
        createEvidence(
          "Primary execution target",
          `${primaryTarget} is the best bounded place to anchor a first smoke or integration test.`,
          primaryTarget
        )
      );
    }

    findings.push(
      createFinding(profile, {
        category: "testing",
        severity,
        title: "Missing automated test coverage",
        summary: `Add a single automated test path first by wiring a test command and covering ${primaryTarget ?? "the main execution path"} with one smoke-level test.`,
        evidence,
        likelyFiles: collectLikelyFiles([packageManifest], [primaryTarget], [testFile]),
      })
    );
  }

  if (!profile.hasLint && isJavascriptOrTypescriptRepo(profile)) {
    findings.push(
      createFinding(profile, {
        category: "dx",
        severity: "warning",
        title: "Missing lint enforcement",
        summary: "Add one repo-level lint command for the current JS/TS stack before expanding other automation.",
        evidence: [
          createEvidence(
            "Lint command",
            "No lint script or known lint config was detected.",
            packageManifest ?? inspection.lintConfigFiles[0]
          ),
          createEvidence(
            "Scope",
            `${profile.languages.join(", ") || "Unknown"} source files are present, so formatting and correctness drift will accumulate without a baseline lint pass.`,
            primaryTarget
          ),
        ],
        likelyFiles: collectLikelyFiles(
          [packageManifest],
          inspection.lintConfigFiles,
          inspection.typecheckConfigFiles,
          [primaryTarget]
        ),
      })
    );
  }

  if (profile.hasTypecheck && !profile.typecheckStrict) {
    findings.push(
      createFinding(profile, {
        category: "backend",
        severity: "warning",
        title: "TypeScript strict mode is disabled",
        summary: `Enable TypeScript strict mode in ${typecheckConfig} and fix the first affected module rather than widening the change across the repo.`,
        evidence: [
          createEvidence("TypeScript config", `${typecheckConfig} exists for this repository.`, typecheckConfig),
          createEvidence("Strict mode", "compilerOptions.strict is not enabled.", typecheckConfig),
          createEvidence(
            "Likely follow-up target",
            `${primaryTarget ?? "The main TypeScript module"} will likely surface the first strictness issues.`,
            primaryTarget
          ),
        ],
        likelyFiles: collectLikelyFiles([typecheckConfig], [primaryTarget]),
      })
    );
  }

  if (!profile.hasCi && profile.validationCommands.length > 0) {
    findings.push(
      createFinding(profile, {
        category: "workflow",
        severity: "warning",
        title: "Missing CI workflow",
        summary: `Add a minimal CI workflow that runs the current validation commands only: ${validationSummary}.`,
        evidence: [
          createEvidence("CI config", "No supported CI workflow file was detected."),
          createEvidence("Validation plan", `Existing commands are available locally: ${validationSummary}.`, packageManifest),
        ],
        likelyFiles: collectLikelyFiles([ciTarget], [packageManifest]),
      })
    );
  }

  if (!profile.hasEnvExample && hasEnvSurface) {
    findings.push(
      createFinding(profile, {
        category: "security",
        severity: "warning",
        title: "Missing environment example",
        summary: `Check in ${envExampleFile} with the currently used runtime variables before asking automation to run the repo elsewhere.`,
        evidence: [
          createEvidence("Env template", "No .env.example or .env.sample file was detected."),
          createEvidence(
            "Runtime env usage",
            `${inspection.envUsageFiles.length} source file${inspection.envUsageFiles.length === 1 ? "" : "s"} reference environment variables.`,
            envUsageFile
          ),
          createEvidence(
            "Local env files",
            inspection.envLocalFiles.length > 0
              ? `Local-only env files exist: ${inspection.envLocalFiles.join(", ")}.`
              : "No checked-in env template was found alongside runtime env usage."
          ),
        ],
        likelyFiles: collectLikelyFiles([envExampleFile], [envUsageFile], [readmeFile]),
      })
    );
  }

  if (
    !profile.hasReadme &&
    (profile.validationCommands.length > 0 || hasEnvSurface || profile.fileCount >= 5)
  ) {
    findings.push(
      createFinding(profile, {
        category: "docs",
        severity: "info",
        title: "Missing project README",
        summary: "Add a short README that documents setup and the current validation commands instead of leaving automation to infer repo conventions.",
        evidence: [
          createEvidence("README", "No README.md-style file was detected."),
          createEvidence("Validation plan", `Current validation commands: ${validationSummary}.`, packageManifest),
        ],
        likelyFiles: collectLikelyFiles(["README.md"], [packageManifest], [envUsageFile]),
      })
    );
  }

  if (profile.validationCommands.length === 0 && profile.fileCount > 0) {
    const evidence: RepoFindingEvidence[] = [
      createEvidence("Validation commands", "No bounded lint, typecheck, or test command set was inferred.", packageManifest),
      createEvidence("Scripts", `Detected scripts: ${profile.scripts.join(", ") || "none"}.`, packageManifest),
    ];

    if (testFile) {
      evidence.push(
        createEvidence(
          "Existing tests",
          `${testFile} suggests there is testable behavior, but no command exposes it safely.`,
          testFile
        )
      );
    } else if (primaryTarget) {
      evidence.push(
        createEvidence(
          "Primary code path",
          `${primaryTarget} is the current execution surface, but no standard validation command covers it.`,
          primaryTarget
        )
      );
    }

    findings.push(
      createFinding(profile, {
        category: "workflow",
        severity: "critical",
        title: "Missing deterministic validation commands",
        summary: "Define explicit lint, typecheck, or test commands that automation can run without guessing shell steps.",
        evidence,
        likelyFiles: collectLikelyFiles([packageManifest], [testFile], [primaryTarget]),
      })
    );
  }

  const largestFile = inspection.largestFiles[0];
  const largestFileShare = largestFile ? largestFile.lines / Math.max(profile.lineCount, 1) : 0;
  if (largestFile && (largestFile.lines >= 600 || (largestFile.lines >= 350 && largestFileShare >= 0.3))) {
    findings.push(
      createFinding(profile, {
        category: "architecture",
        severity: "warning",
        title: "Large file hotspot",
        summary: `Start with ${largestFile.path}: it accounts for ${Math.round(largestFileShare * 100)}% of the scanned lines and is the most bounded refactor target.`,
        evidence: [
          createEvidence(
            "Largest file",
            `${largestFile.path} is ${largestFile.lines} lines, about ${Math.round(largestFileShare * 100)}% of the scanned source footprint.`,
            largestFile.path
          ),
          createEvidence(
            "Review scope",
            "A focused extraction from the largest module is safer than repo-wide architecture churn.",
            largestFile.path
          ),
        ],
        likelyFiles: collectLikelyFiles([largestFile.path]),
      })
    );
  }

  const todoHotspot = inspection.todoHotspots[0];
  if (todoHotspot && todoHotspot.count >= 3) {
    findings.push(
      createFinding(profile, {
        category: "dx",
        severity: "warning",
        title: "TODO hotspot",
        summary: `Resolve or externalize the concentrated TODO/FIXME backlog in ${todoHotspot.path} before adding more changes on top of it.`,
        evidence: [
          createEvidence(
            "TODO count",
            `${todoHotspot.path} contains ${todoHotspot.count} TODO-style markers.`,
            todoHotspot.path
          ),
          createEvidence(
            "Execution risk",
            "Deferred work concentrated in one file usually means behavior is still in flux.",
            todoHotspot.path
          ),
        ],
        likelyFiles: collectLikelyFiles([todoHotspot.path]),
      })
    );
  }

  if (profile.isDirty) {
    findings.push(
      createFinding(profile, {
        category: "workflow",
        severity: "info",
        title: "Dirty repo checkout",
        summary: "Stabilize the working tree before automated execution so new changes can be isolated and reviewed cleanly.",
        evidence: [
          createEvidence("Git status", "git status reported local modifications."),
          createEvidence("Execution safety", "Automation should avoid using the active checkout directly."),
        ],
        likelyFiles: [],
      })
    );
  }

  if (findings.length === 0 && largestFile) {
    findings.push(
      createFinding(profile, {
        category: "architecture",
        severity: "info",
        title: "Largest module review candidate",
        summary: `${largestFile.path} is the largest detected module and the best bounded place for a focused improvement pass.`,
        evidence: [
          createEvidence("Largest file", `${largestFile.path} is ${largestFile.lines} lines.`, largestFile.path),
          createEvidence("Grounding", "No higher-severity repository health gaps were detected."),
        ],
        likelyFiles: collectLikelyFiles([largestFile.path]),
      })
    );
  }

  return findings;
}

function buildAnalysisSummary(
  repository: RepositoryInventoryItem,
  profile: RepoProfile,
  findings: RepoFinding[]
): string {
  return [
    `${repository.name} was analyzed as a ${profile.stackTags.join(", ") || "mixed-stack"} repository.`,
    `Detected ${findings.length} grounded finding${findings.length === 1 ? "" : "s"} across ${new Set(findings.map((finding) => finding.category)).size} categories.`,
    `Validation commands: ${profile.validationCommands.length > 0 ? profile.validationCommands.map((command) => command.join(" ")).join("; ") : "none detected"}.`,
  ].join(" ");
}

export interface AnalyzeRepositoryResult {
  repository: RepositoryInventoryItem;
  analysis: RepoAnalysisResult;
  suggestions: SuggestionRecord[];
}

export async function analyzeRepository(
  repositoryId: string
): Promise<AnalyzeRepositoryResult> {
  const repositoryRow = await getRepository(repositoryId);

  if (!repositoryRow) {
    throw new Error("Repository not found");
  }

  const serializedRepository = serializeRepository(repositoryRow);
  const inspection = await fingerprintRepository(repositoryId, repositoryRow.path);
  const findings = buildFindings(inspection.profile, inspection);
  const summary = buildAnalysisSummary(serializedRepository, inspection.profile, findings);

  const runId = `analysis_${randomUUID()}`;
  await createAnalysisRun({
    id: runId,
    repositoryId,
    status: "running",
    fingerprintHash: inspection.fingerprintHash,
    profileJson: JSON.stringify(inspection.profile),
    findingsJson: JSON.stringify(findings),
    summary,
    error: null,
    createdAt: new Date(),
    completedAt: null,
  });

  const completedRun = await updateAnalysisRun(runId, {
    status: "completed",
    profileJson: JSON.stringify(inspection.profile),
    findingsJson: JSON.stringify(findings),
    summary,
    completedAt: new Date(),
  });

  if (!completedRun) {
    throw new Error("Failed to complete analysis run");
  }

  await updateRepository(repositoryId, {
    fingerprintHash: inspection.fingerprintHash,
    profileJson: JSON.stringify(inspection.profile),
    remoteOrigin: inspection.profile.remoteOrigin,
    defaultBranch: inspection.profile.defaultBranch,
    currentBranch: inspection.profile.currentBranch,
    isDirty: inspection.profile.isDirty,
    lastAnalyzedAt: new Date(),
  });

  const analysis = serializeAnalysisRun(completedRun);
  const suggestionDrafts = scoreSuggestionsFromAnalysis(analysis);
  const storedSuggestions = await storeSuggestions(
    suggestionDrafts.map((draft) => ({
      id: `suggestion_${randomUUID()}`,
      repositoryId,
      analysisRunId: runId,
      title: draft.title,
      category: draft.category,
      summary: draft.summary,
      evidenceJson: JSON.stringify(draft.evidence),
      impactScore: draft.impactScore,
      effortScore: draft.effortScore,
      confidenceScore: draft.confidenceScore,
      riskScore: draft.riskScore,
      priorityScore: draft.priorityScore,
      autonomyMode: draft.autonomyMode,
      likelyFilesJson: JSON.stringify(draft.likelyFiles),
      createdAt: new Date(),
    }))
  );

  return {
    repository: serializeRepository(
      {
        ...repositoryRow,
        fingerprintHash: inspection.fingerprintHash,
        profileJson: JSON.stringify(inspection.profile),
        remoteOrigin: inspection.profile.remoteOrigin ?? null,
        defaultBranch: inspection.profile.defaultBranch ?? null,
        currentBranch: inspection.profile.currentBranch ?? null,
        isDirty: inspection.profile.isDirty,
        lastAnalyzedAt: new Date(),
      },
      { lastAnalysisRunId: runId }
    ),
    analysis,
    suggestions: storedSuggestions.map(serializeSuggestion),
  };
}
