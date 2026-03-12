import type {
  RepoAnalysisResult,
  RepositoryInventoryItem,
  SuggestionRecord,
  TaskSpec,
} from "@/server/types/domain";

function fallbackLikelyFiles(
  suggestion: SuggestionRecord,
  analysis: RepoAnalysisResult
): string[] {
  if (suggestion.likelyFiles.length > 0) {
    return suggestion.likelyFiles;
  }

  if (analysis.profile.hasReadme) {
    return ["README.md"];
  }

  return ["package.json"];
}

function buildImplementationPlan(suggestion: SuggestionRecord): string[] {
  const plan: string[] = [
    "Inspect the cited files and confirm the current behavior against the evidence.",
  ];

  if (suggestion.category === "testing") {
    plan.push("Add or improve the narrowest test harness that proves the target behavior.");
    plan.push("Implement the smallest code changes needed to make the new or updated tests pass.");
  } else if (suggestion.category === "architecture") {
    plan.push("Break the hotspot into smaller units with clearer ownership boundaries.");
    plan.push("Preserve behavior while reducing coupling and simplifying future edits.");
  } else if (suggestion.category === "workflow") {
    plan.push("Add or tighten the project automation needed to enforce the missing check.");
    plan.push("Keep the workflow bounded to the repo’s existing toolchain and scripts.");
  } else if (suggestion.category === "docs") {
    plan.push("Document the concrete setup and validation path the evidence shows is currently missing.");
  } else {
    plan.push("Implement the improvement directly in the affected code paths.");
    plan.push("Keep the change bounded to the files implicated by the analysis.");
  }

  plan.push("Run the listed validation commands and capture any follow-up risk.");

  return plan;
}

function buildRisks(suggestion: SuggestionRecord): string[] {
  if (suggestion.category === "architecture") {
    return [
      "Behavioral regressions if the hotspot is split without preserving current call paths.",
      "Scope expansion if adjacent refactors are pulled in.",
    ];
  }

  if (suggestion.category === "workflow") {
    return [
      "False positives or flaky checks if the workflow runs the wrong command set.",
    ];
  }

  return [
    "Overfitting the change to the cited evidence without validating adjacent flows.",
  ];
}

export function buildTaskSpec(
  repository: RepositoryInventoryItem,
  analysis: RepoAnalysisResult,
  suggestion: SuggestionRecord
): TaskSpec {
  const likelyFiles = fallbackLikelyFiles(suggestion, analysis);
  const validationCommands = analysis.profile.validationCommands;

  return {
    suggestionId: suggestion.id,
    repositoryId: repository.id,
    title: suggestion.title,
    problem: suggestion.summary,
    evidence: suggestion.evidence.map((item) => `${item.label}: ${item.detail}`),
    goal: `Implement ${suggestion.title.toLowerCase()} in ${repository.name} with a bounded, reviewable change set.`,
    nonGoals: [
      "Do not rewrite unrelated modules.",
      "Do not change deployment or release workflows beyond the scoped improvement.",
      "Do not mutate the repository’s main checkout directly.",
    ],
    likelyFiles,
    implementationPlan: buildImplementationPlan(suggestion),
    acceptanceCriteria: [
      `The change resolves the evidence behind "${suggestion.title}".`,
      "The affected files remain readable and bounded.",
      "Relevant validation commands pass or any failures are explained in the result.",
    ],
    validationCommands,
    risks: buildRisks(suggestion),
  };
}
