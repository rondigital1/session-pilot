/**
 * Response parsers for Claude agent interactions
 */

import type Anthropic from "@anthropic-ai/sdk";

export interface PlannedTask {
  title: string;
  description: string;
  estimatedMinutes: number;
  relatedSignals: string[];
  order?: number;
}

/**
 * Parse Claude's planning response into structured task objects
 *
 * Handles various response formats from Claude:
 * - Direct JSON array in a text block
 * - JSON wrapped in markdown code blocks
 * - Multiple content blocks (uses first text block with JSON)
 */
export function parsePlanningResponse(
  response: Anthropic.Messages.Message
): PlannedTask[] {
  const textContent = response.content.find((block) => block.type === "text");

  if (!textContent || textContent.type !== "text") {
    throw new Error("No text content in Claude response");
  }

  const jsonText = extractJsonFromText(textContent.text);
  const parsedTasks = parseJsonArray(jsonText);

  return validateAndNormalizeTasks(parsedTasks);
}

/**
 * Extract text content from a Claude response
 */
export function extractTextContent(
  response: Anthropic.Messages.Message
): string | null {
  const textContent = response.content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    return null;
  }
  return textContent.text.trim();
}

// Internal helpers

function extractJsonFromText(text: string): string {
  let jsonText = text.trim();

  // Handle markdown code blocks - Claude often wraps JSON in ```json ... ```
  const jsonBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }

  return jsonText;
}

function parseJsonArray(jsonText: string): unknown {
  try {
    return JSON.parse(jsonText);
  } catch (parseError) {
    // Try to find a JSON array anywhere in the text as a fallback
    const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        throw new Error(
          `Failed to parse planning response as JSON: ${parseError instanceof Error ? parseError.message : "Unknown error"}`
        );
      }
    }
    throw new Error(
      `Failed to parse planning response as JSON: ${parseError instanceof Error ? parseError.message : "Unknown error"}`
    );
  }
}

function validateAndNormalizeTasks(parsedTasks: unknown): PlannedTask[] {
  if (!Array.isArray(parsedTasks)) {
    throw new Error("Planning response is not an array of tasks");
  }

  return parsedTasks.map((task: unknown, index: number) => {
    if (typeof task !== "object" || task === null) {
      throw new Error(`Task at index ${index} is not an object`);
    }

    const taskObj = task as Record<string, unknown>;

    // Title is required
    if (typeof taskObj.title !== "string" || !taskObj.title.trim()) {
      throw new Error(`Task at index ${index} missing required 'title' field`);
    }

    // Validate and provide defaults for optional fields
    const description =
      typeof taskObj.description === "string"
        ? taskObj.description
        : "No description provided";

    const estimatedMinutes =
      typeof taskObj.estimatedMinutes === "number" &&
      taskObj.estimatedMinutes > 0
        ? taskObj.estimatedMinutes
        : 15;

    const relatedSignals = Array.isArray(taskObj.relatedSignals)
      ? taskObj.relatedSignals.filter(
          (id): id is string => typeof id === "string"
        )
      : [];

    const order =
      typeof taskObj.order === "number" ? taskObj.order : undefined;

    return {
      title: taskObj.title.trim(),
      description,
      estimatedMinutes,
      relatedSignals,
      order,
    };
  });
}
