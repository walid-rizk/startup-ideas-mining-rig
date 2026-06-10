import "server-only";
import { streamText, type CoreMessage } from "ai";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { loadSkill } from "./skills";
import { modelSupportsSampling } from "./types";
import type { ModelChoice, SkillName } from "./types";

export class ProviderConfigError extends Error {}

// Opus 4.7+, and Fable 5 reject temperature/top_p/top_k with a 400 error.
// ai@3.x always sends a temperature (it defaults undefined to 0 in
// prepareCallSettings), so the only reliable place to drop the params on
// this SDK version is the fetch layer.
const anthropicNoSampling = createAnthropic({
  fetch: async (url, init) => {
    if (init?.body && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body);
        delete body.temperature;
        delete body.top_p;
        delete body.top_k;
        init = { ...init, body: JSON.stringify(body) };
      } catch {
        // non-JSON body — send unchanged
      }
    }
    return fetch(url, init);
  },
});

function resolveModel(choice: ModelChoice) {
  if (choice.provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ProviderConfigError(
        "ANTHROPIC_API_KEY is not set. Add it to .env.local or choose a Gemini model.",
      );
    }
    return modelSupportsSampling(choice)
      ? anthropic(choice.model)
      : anthropicNoSampling(choice.model);
  }
  if (choice.provider === "gemini") {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new ProviderConfigError(
        "GOOGLE_GENERATIVE_AI_API_KEY is not set. Add it to .env.local or choose an Anthropic model.",
      );
    }
    return google(choice.model);
  }
  if (choice.provider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new ProviderConfigError(
        "OPENAI_API_KEY is not set. Add it to .env.local or choose another provider.",
      );
    }
    return openai(choice.model);
  }
  throw new ProviderConfigError(`Unknown provider: ${(choice as ModelChoice).provider}`);
}

export interface StreamSkillOptions {
  skill: SkillName;
  model: ModelChoice;
  userMessage?: string;
  messages?: CoreMessage[];
  temperature?: number;
  maxTokens?: number;
  /**
   * Optional override appended to the skill's system prompt. Use for tasks that
   * need a variant persona (e.g. develop-one-seed-idea instead of generate-three)
   * where the skill's default contract actively fights the intended behavior.
   */
  systemAppend?: string;
}

/**
 * Central wrapper: load SKILL.md, resolve model, stream.
 * Returns a Response suitable for direct return from a route handler.
 */
export async function streamSkill(opts: StreamSkillOptions): Promise<Response> {
  try {
    const skill = await loadSkill(opts.skill);
    const model = resolveModel(opts.model);

    const messages: CoreMessage[] =
      opts.messages ??
      (opts.userMessage ? [{ role: "user", content: opts.userMessage }] : []);

    if (messages.length === 0) {
      return errorResponse(400, "No user message or message history provided.");
    }

    const systemPrompt = opts.systemAppend
      ? `${skill.systemPrompt}\n\n---\n\n## Task Override\n\n${opts.systemAppend}`
      : skill.systemPrompt;

    const result = await streamText({
      model,
      system: systemPrompt,
      messages,
      temperature: opts.temperature ?? 0.8,
      maxTokens: opts.maxTokens,
    });

    return result.toAIStreamResponse();
  } catch (err) {
    if (err instanceof ProviderConfigError) {
      return errorResponse(400, err.message);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[streamSkill] error:", err);
    return errorResponse(500, message);
  }
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
