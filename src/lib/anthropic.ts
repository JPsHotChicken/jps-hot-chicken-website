import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { GenerationError, GenerationFormatError } from "@/lib/model-reply";

/**
 * The one Claude client the dashboard talks through, and the error handling
 * around it.
 *
 * Nothing here decides what to ask — the callers do that. This decides how long
 * to wait, how often to try, and what the owner is told when it doesn't work.
 */

export const MODEL = "claude-opus-5";

export function isModelConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function assertConfigured(what: string) {
  if (!isModelConfigured()) {
    throw new GenerationError(
      `${what} isn't set up yet — add ANTHROPIC_API_KEY to the environment and restart.`,
    );
  }
}

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  // Two minutes per attempt, no silent retries: with the one retry for an
  // unreadable reply below, the worst case stays inside the page's own
  // `maxDuration`. A rate limit is reported rather than waited out.
  client ??= new Anthropic({ timeout: 120_000, maxRetries: 0 });
  return client;
}

/**
 * Run a call, asking once more if the reply doesn't parse, and turn whatever
 * goes wrong into a sentence for the page. A second unreadable reply is
 * reported rather than retried indefinitely on the owner's bill.
 */
export async function withOneRetry<T>(ask: () => Promise<T>, what: string): Promise<T> {
  try {
    try {
      return await ask();
    } catch (error) {
      if (!(error instanceof GenerationFormatError)) throw error;
      return await ask();
    }
  } catch (error) {
    if (error instanceof GenerationFormatError) {
      throw new GenerationError(`Couldn't read the ${what} that came back (${error.detail}). Try again.`);
    }
    // Already a sentence worth showing — "that isn't a spec sheet", and such.
    if (error instanceof GenerationError) throw error;
    if (error instanceof Anthropic.AuthenticationError) {
      throw new GenerationError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new GenerationError("Too many requests right now. Wait a minute and try again.");
    }
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      throw new GenerationError("The request timed out. Try again.");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("[anthropic] API error:", error.status, error.message);
      throw new GenerationError("The service returned an error. Try again shortly.");
    }
    throw error;
  }
}

/** Whether the API refused the request outright — a file it couldn't open. */
export const isBadRequest = (error: unknown): boolean =>
  error instanceof Anthropic.BadRequestError;

/** The text of a reply, with the two stop reasons that mean "nothing usable". */
export function replyText(response: {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
}): string {
  if (response.stop_reason === "refusal") {
    throw new GenerationFormatError("the model declined this request");
  }
  if (response.stop_reason === "max_tokens") {
    throw new GenerationFormatError("the reply was cut off");
  }
  return response.content.flatMap((block) => (block.type === "text" ? [block.text ?? ""] : [])).join("");
}
