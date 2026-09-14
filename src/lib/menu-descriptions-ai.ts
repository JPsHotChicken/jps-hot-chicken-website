import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import {
  GenerationFormatError,
  TASTE_DIMENSIONS,
  parseGeneration,
  type Generation,
  type ResolvedRecipe,
} from "@/lib/menu-descriptions";

/**
 * The one model call behind "Generate".
 *
 * The recipe goes in as JSON, the menu copy and taste profile come back as JSON.
 * Nothing is regenerated automatically — this only runs when the owner presses
 * the button, because each press is a paid call and because a regenerated
 * description replaces any hand edits.
 */

const MODEL = "claude-opus-5";

export function isGeneratorConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM_PROMPT = `You are writing for a restaurant menu. You will receive a structured recipe as JSON. Each component is either an ingredient — with its amount, unit, optional prep note, flavor and texture tags, and an intensity from 1 (barely noticeable) to 5 (dominates the dish) — or a sub-recipe, with the amount used, the batch_yield one batch of it makes, and its own components.

Return JSON only, no prose or markdown fences, with this shape:

{
  "description_short": "one sentence, under 20 words, for menus with tight space",
  "description_long": "two to three sentences, for online ordering and printed menus",
  "taste_profile": {
    "sweet": 0-5, "salty": 0-5, "sour": 0-5, "bitter": 0-5,
    "umami": 0-5, "spicy": 0-5, "smoky": 0-5, "tangy": 0-5, "richness": 0-5
  },
  "texture_notes": ["short phrases"],
  "pairs_with": ["two or three suggestions"]
}

Rules:
- Only reference ingredients actually present in the recipe. Never invent an ingredient, cooking method, or origin story.
- Weight the taste profile by each component's amount and its intensity rating — a pinch of cayenne is not the same as two tablespoons.
- For components that are themselves recipes, treat their contents as part of the dish. The amount used compared with the sub-recipe's batch_yield tells you how much of each of its ingredients ends up in the dish.
- Write plainly. No "artisanal", "crafted", "elevated", "symphony of flavors", or similar.`;

const SCORE = { type: "integer", enum: [0, 1, 2, 3, 4, 5] };

// Structured output guarantees the reply parses to this shape. Score ranges are
// an enum because the schema dialect has no minimum/maximum.
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    description_short: { type: "string" },
    description_long: { type: "string" },
    taste_profile: {
      type: "object",
      properties: Object.fromEntries(TASTE_DIMENSIONS.map((dimension) => [dimension, SCORE])),
      required: [...TASTE_DIMENSIONS],
      additionalProperties: false,
    },
    texture_notes: { type: "array", items: { type: "string" } },
    pairs_with: { type: "array", items: { type: "string" } },
  },
  required: ["description_short", "description_long", "taste_profile", "texture_notes", "pairs_with"],
  additionalProperties: false,
};

/** Raised with a sentence fit to show on the builder. */
export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationError";
  }
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  // Two minutes per attempt, no silent retries: with the one retry for an
  // unreadable reply below, the worst case stays inside the builder page's
  // five-minute `maxDuration`. A rate limit is reported rather than waited out.
  client ??= new Anthropic({ timeout: 120_000, maxRetries: 0 });
  return client;
}

async function askOnce(recipe: ResolvedRecipe): Promise<Generation> {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // If the model declines, the API re-runs the request on its recommended
    // fallback model instead of returning an empty refusal.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [{ role: "user", content: JSON.stringify(recipe, null, 2) }],
  });

  if (response.stop_reason === "refusal") {
    throw new GenerationFormatError("the model declined to describe this recipe");
  }
  if (response.stop_reason === "max_tokens") {
    throw new GenerationFormatError("the reply was cut off");
  }

  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
  return parseGeneration(text);
}

/**
 * Describe a recipe. A reply that doesn't parse is asked for once more; a
 * second failure is reported rather than retried indefinitely on the owner's
 * bill.
 */
export async function generateDescription(recipe: ResolvedRecipe): Promise<Generation> {
  if (!isGeneratorConfigured()) {
    throw new GenerationError(
      "Generation isn't set up yet — add ANTHROPIC_API_KEY to the environment and restart.",
    );
  }

  try {
    try {
      return await askOnce(recipe);
    } catch (error) {
      if (!(error instanceof GenerationFormatError)) throw error;
      return await askOnce(recipe);
    }
  } catch (error) {
    if (error instanceof GenerationFormatError) {
      throw new GenerationError(
        `Couldn't read the description that came back (${error.detail}). Try again.`,
      );
    }
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
      console.error("[menu-descriptions] Anthropic API error:", error.status, error.message);
      throw new GenerationError("The description service returned an error. Try again shortly.");
    }
    throw error;
  }
}
