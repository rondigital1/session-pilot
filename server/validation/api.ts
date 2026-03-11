import { z } from "zod";

const trimmedNonEmptyString = z
  .string()
  .trim()
  .min(1, "Value cannot be empty");

const optionalInputString = z.string().trim();
const nullableOptionalString = z.string().trim().nullable();

const taskStatusValues = ["pending", "in_progress", "completed", "skipped"] as const;

export const focusWeightsSchema = z
  .object({
    bugs: z.number().min(0).max(1),
    features: z.number().min(0).max(1),
    refactor: z.number().min(0).max(1),
  })
  .strict();

export const startSessionRequestSchema = z
  .object({
    workspaceId: trimmedNonEmptyString,
    userGoal: trimmedNonEmptyString.max(2000, "userGoal must be 2000 characters or less"),
    timeBudgetMinutes: z
      .number()
      .int("timeBudgetMinutes must be an integer")
      .min(15, "timeBudgetMinutes must be between 15 and 480")
      .max(480, "timeBudgetMinutes must be between 15 and 480"),
    focusWeights: focusWeightsSchema,
  })
  .strict();

export const createWorkspaceRequestSchema = z
  .object({
    name: trimmedNonEmptyString.max(100, "Workspace name must be 100 characters or less"),
    localPath: optionalInputString.optional(),
    githubRepo: optionalInputString.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasLocalPath = Boolean(value.localPath?.trim());
    const hasGitHubRepo = Boolean(value.githubRepo?.trim());

    if (!hasLocalPath && !hasGitHubRepo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either localPath or githubRepo must be provided",
      });
    }
  });

export const updateWorkspaceRequestSchema = z
  .object({
    name: trimmedNonEmptyString
      .max(100, "Workspace name must be 100 characters or less")
      .optional(),
    localPath: optionalInputString.optional(),
    githubRepo: optionalInputString.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.name === undefined &&
      value.localPath === undefined &&
      value.githubRepo === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one field to update",
      });
    }
  });

export const scanWorkspaceRequestSchema = z
  .object({
    path: optionalInputString.optional(),
    maxDepth: z
      .number()
      .int("maxDepth must be an integer")
      .min(1, "maxDepth must be a positive integer no greater than 10")
      .max(10, "maxDepth must be a positive integer no greater than 10")
      .optional(),
  })
  .strict();

export const improveScanRequestSchema = z
  .object({
    goalText: optionalInputString
      .max(2000, "goalText must be 2000 characters or less")
      .optional(),
    timeBudgetMinutes: z
      .number()
      .int("timeBudgetMinutes must be an integer")
      .min(15, "timeBudgetMinutes must be between 15 and 480")
      .max(480, "timeBudgetMinutes must be between 15 and 480")
      .optional(),
  })
  .strict();

export const ideaFeedbackRequestSchema = z
  .object({
    vote: z.enum(["up", "down"]),
    reason: optionalInputString
      .max(1000, "reason must be 1000 characters or less")
      .optional(),
  })
  .strict();

export const taskChecklistItemSchema = z
  .object({
    id: trimmedNonEmptyString.max(100, "Checklist item id must be 100 characters or less"),
    title: trimmedNonEmptyString.max(
      200,
      "Checklist item title must be 200 characters or less"
    ),
    done: z.boolean().optional(),
  })
  .strict();

export const taskContextLinkSchema = z
  .object({
    label: trimmedNonEmptyString.max(120, "Link label must be 120 characters or less"),
    url: z.string().trim().url("Link URL must be valid").max(1000),
  })
  .strict();

export const taskContextSchema = z
  .object({
    files: z
      .array(trimmedNonEmptyString.max(400, "File paths must be 400 characters or less"))
      .max(20, "No more than 20 files may be attached")
      .optional(),
    relatedIssues: z
      .array(trimmedNonEmptyString.max(200, "Issue references must be 200 characters or less"))
      .max(20, "No more than 20 issue references may be attached")
      .optional(),
    links: z
      .array(taskContextLinkSchema)
      .max(10, "No more than 10 links may be attached")
      .optional(),
  })
  .strict();

export const createTaskRequestSchema = z
  .object({
    title: trimmedNonEmptyString.max(200, "Task title must be 200 characters or less"),
    description: optionalInputString
      .max(4000, "Task description must be 4000 characters or less")
      .optional(),
    estimatedMinutes: z
      .number()
      .int("estimatedMinutes must be an integer")
      .min(1, "estimatedMinutes must be between 1 and 480")
      .max(480, "estimatedMinutes must be between 1 and 480")
      .optional(),
    checklist: z
      .array(taskChecklistItemSchema)
      .max(20, "No more than 20 checklist items may be attached")
      .optional(),
    context: taskContextSchema.optional(),
  })
  .strict();

export const updateTaskRequestSchema = z
  .object({
    taskId: trimmedNonEmptyString,
    status: z.enum(taskStatusValues).optional(),
    title: optionalInputString
      .max(200, "Task title must be 200 characters or less")
      .optional(),
    description: nullableOptionalString
      .refine(
        (value) => value === null || value.length <= 4000,
        "Task description must be 4000 characters or less"
      )
      .optional(),
    estimatedMinutes: z
      .number()
      .int("estimatedMinutes must be an integer")
      .min(1, "estimatedMinutes must be between 1 and 480")
      .max(480, "estimatedMinutes must be between 1 and 480")
      .nullable()
      .optional(),
    notes: nullableOptionalString
      .refine((value) => value === null || value.length <= 8000, "notes must be 8000 characters or less")
      .optional(),
    checklist: z
      .array(taskChecklistItemSchema)
      .max(20, "No more than 20 checklist items may be attached")
      .nullable()
      .optional(),
    context: taskContextSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.status === undefined &&
      value.title === undefined &&
      value.description === undefined &&
      value.estimatedMinutes === undefined &&
      value.notes === undefined &&
      value.checklist === undefined &&
      value.context === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "No task updates provided",
      });
    }

    if (value.title !== undefined && !value.title.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "title cannot be empty",
      });
    }
  });

export const generateChecklistRequestSchema = z
  .object({
    title: optionalInputString
      .max(200, "Task title must be 200 characters or less")
      .optional(),
    description: trimmedNonEmptyString.max(
      4000,
      "Task description must be 4000 characters or less"
    ),
  })
  .strict();

export const endSessionRequestSchema = z
  .object({
    summary: optionalInputString
      .max(6000, "summary must be 6000 characters or less")
      .optional(),
  })
  .strict();
