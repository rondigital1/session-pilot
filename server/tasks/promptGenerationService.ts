import type {
  ExecutionProviderId,
  PromptGenerationResult,
  RepoAnalysisResult,
  RepositoryInventoryItem,
  TaskSpec,
} from "@/server/types/domain";

function formatValidationCommands(commands: string[][]): string {
  if (commands.length === 0) {
    return "- No deterministic validation command was detected; explain what you validated manually.";
  }

  return commands.map((command) => `- ${command.join(" ")}`).join("\n");
}

export function buildAgentPrompt(
  repository: RepositoryInventoryItem,
  analysis: RepoAnalysisResult,
  taskSpec: TaskSpec,
  providerId: ExecutionProviderId
): PromptGenerationResult {
  const prompt = [
    "You are executing a bounded repository improvement task.",
    "",
    "Repo context",
    `- Repository: ${repository.name}`,
    `- Path: ${repository.path}`,
    `- Current branch: ${analysis.profile.currentBranch ?? "unknown"}`,
    `- Default branch: ${analysis.profile.defaultBranch ?? "unknown"}`,
    `- Dirty source checkout: ${analysis.profile.isDirty ? "yes" : "no"}`,
    `- Stack tags: ${analysis.profile.stackTags.join(", ") || "none detected"}`,
    "",
    "Exact goal",
    `- ${taskSpec.goal}`,
    "",
    "Inspect first",
    ...taskSpec.likelyFiles.map((filePath) => `- ${filePath}`),
    "",
    "Constraints",
    "- Work only inside the isolated git worktree provided for this task.",
    "- Do not modify unrelated files.",
    "- Keep the implementation production-oriented and readable.",
    "- Use explicit types and fully braced if-statements.",
    "- Never rewrite the entire project when a bounded change will satisfy the task.",
    "",
    "Implementation requirements",
    ...taskSpec.implementationPlan.map((step) => `- ${step}`),
    "",
    "Acceptance criteria",
    ...taskSpec.acceptanceCriteria.map((criterion) => `- ${criterion}`),
    "",
    "Validation commands",
    formatValidationCommands(taskSpec.validationCommands),
    "",
    "Output requirements",
    "- Summarize the code changes made.",
    "- Report validation results with exact commands run.",
    "- Call out any residual risks or follow-up work.",
    "",
    "Evidence to ground against",
    ...taskSpec.evidence.map((item) => `- ${item}`),
    "",
    `Execution provider: ${providerId}`,
  ].join("\n");

  return {
    providerId,
    prompt,
  };
}
