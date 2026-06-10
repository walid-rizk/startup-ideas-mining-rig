import "server-only";
import { streamText, type ModelMessage, type ToolSet } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { loadSkill } from "./skills";
import { modelSupportsSampling, modelHasLiveSearch } from "./types";
import type { ModelChoice, SkillName } from "./types";

export class ProviderConfigError extends Error {}

function resolveModel(choice: ModelChoice) {
  if (choice.provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ProviderConfigError(
        "ANTHROPIC_API_KEY is not set. Add it to .env.local or choose a Gemini model.",
      );
    }
    return anthropic(choice.model);
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

// Provider-executed web search tools. Only called for models where
// modelHasLiveSearch() is true — keep the two in sync (src/lib/types.ts).
function liveSearchTools(choice: ModelChoice): ToolSet | undefined {
  if (choice.provider === "anthropic") {
    // webSearch_20250305 (GA) works across all current Claude models.
    // webSearch_20260209 couples to programmatic tool calling, which e.g.
    // Haiku 4.5 rejects — don't switch without re-running the live probe.
    return { web_search: anthropic.tools.webSearch_20250305({ maxUses: 8 }) };
  }
  if (choice.provider === "gemini") {
    // Tool key must be "google_search" (provider requirement).
    return { google_search: google.tools.googleSearch({}) };
  }
  return undefined;
}

export interface StreamSkillOptions {
  skill: SkillName;
  model: ModelChoice;
  userMessage?: string;
  messages?: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
  /**
   * Enable the provider's web search tool for this call (data-miner research).
   * No-op for models where modelHasLiveSearch() is false.
   */
  webSearch?: boolean;
  /**
   * Optional override appended to the skill's system prompt. Use for tasks that
   * need a variant persona (e.g. develop-one-seed-idea instead of generate-three)
   * where the skill's default contract actively fights the intended behavior.
   */
  systemAppend?: string;
}

/**
 * Central wrapper: load SKILL.md, resolve model, stream.
 * Returns a UI-message-stream (SSE) Response suitable for direct return from a
 * route handler. Clients parse it with streamToText() in src/lib/streaming.ts.
 */
export async function streamSkill(opts: StreamSkillOptions): Promise<Response> {
  try {
    const skill = await loadSkill(opts.skill);
    const model = resolveModel(opts.model);

    const messages: ModelMessage[] =
      opts.messages ??
      (opts.userMessage ? [{ role: "user", content: opts.userMessage }] : []);

    if (messages.length === 0) {
      return errorResponse(400, "No user message or message history provided.");
    }

    const systemPrompt = opts.systemAppend
      ? `${skill.systemPrompt}\n\n---\n\n## Task Override\n\n${opts.systemAppend}`
      : skill.systemPrompt;

    const tools =
      opts.webSearch && modelHasLiveSearch(opts.model)
        ? liveSearchTools(opts.model)
        : undefined;

    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      // Opus 4.7+ and Fable 5 reject sampling params with a 400; ai@6 omits
      // temperature when undefined (unlike ai@3, which defaulted it to 0).
      temperature: modelSupportsSampling(opts.model)
        ? (opts.temperature ?? 0.8)
        : undefined,
      maxOutputTokens: opts.maxTokens,
      tools,
    });

    return result.toUIMessageStreamResponse({
      // Default masks everything as "An error occurred." — surface the real
      // message so the client can show something actionable.
      onError: (error) =>
        error instanceof Error ? error.message : "LLM request failed",
    });
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
