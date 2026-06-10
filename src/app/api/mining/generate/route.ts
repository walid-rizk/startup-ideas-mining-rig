import { streamSkill } from "@/lib/providers";
import { buildGeneratePrompt } from "@/lib/prompt-builders";
import { DEFAULT_MODEL } from "@/lib/types";
import type { ModelChoice } from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { userContext, batchNumber = 1, modelChoice, priorIdeas } = (await req.json()) as {
    userContext?: string;
    batchNumber?: number;
    modelChoice?: ModelChoice;
    priorIdeas?: string[];
  };

  if (!userContext) {
    return new Response(JSON.stringify({ error: "userContext is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  return streamSkill({
    skill: "futurist",
    model: modelChoice ?? DEFAULT_MODEL,
    userMessage: buildGeneratePrompt({ userContext, batchNumber, priorIdeas }),
    // 3 fully-templated ideas can exceed the Anthropic provider's 4096 default.
    maxTokens: 8000,
  });
}
