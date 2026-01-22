/**
 * Claude API Client
 *
 * Low-level client configuration and initialization for the Anthropic API.
 * This module handles:
 * - Singleton client instance management
 * - API key validation
 * - Model configuration
 *
 * For session planning logic, see sessionPlanner.ts
 */

import Anthropic from "@anthropic-ai/sdk";

// =============================================================================
// Client Configuration
// =============================================================================

/** Default model for all Claude API calls */
export const DEFAULT_MODEL = "claude-sonnet-4-20250514";

/** Smaller/faster model for simple tasks (lower cost, faster) */
export const FAST_MODEL = "claude-3-5-haiku-20241022";

/** Maximum tokens for planning responses (reduced to minimize costs) */
export const PLANNING_MAX_TOKENS = 1024;

/** Maximum tokens for summary responses */
export const SUMMARY_MAX_TOKENS = 256;

// =============================================================================
// Singleton Client
// =============================================================================

let clientInstance: Anthropic | null = null;

/**
 * Get or create the Anthropic client
 *
 * Returns a singleton instance of the Anthropic client, creating it
 * on first call. Requires ANTHROPIC_API_KEY environment variable.
 *
 * @returns Configured Anthropic client instance
 * @throws Error if ANTHROPIC_API_KEY is not set
 *
 * @example
 * ```ts
 * const client = getClaudeClient();
 * const response = await client.messages.create({
 *   model: DEFAULT_MODEL,
 *   max_tokens: 1024,
 *   messages: [{ role: "user", content: "Hello" }]
 * });
 * ```
 */
export function getClaudeClient(): Anthropic {
  if (clientInstance) {
    return clientInstance;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required. " +
      "Get your API key from https://console.anthropic.com/"
    );
  }

  clientInstance = new Anthropic({ apiKey });
  return clientInstance;
}

/**
 * Reset the client instance
 *
 * Useful for testing or when API key changes. After calling this,
 * the next getClaudeClient() call will create a fresh client.
 */
export function resetClaudeClient(): void {
  clientInstance = null;
}

/**
 * Check if the Claude client is configured
 *
 * Returns true if ANTHROPIC_API_KEY is set, without creating the client.
 * Useful for health checks and configuration validation.
 */
export function isClaudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
