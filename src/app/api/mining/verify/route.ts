import { streamSkill } from "@/lib/providers";
import { buildVerifyPrompt } from "@/lib/prompt-builders";
import { DEFAULT_MODEL, modelHasLiveSearch } from "@/lib/types";
import type { ModelChoice } from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { userContext, idea, vcMemo, modelChoice } = (await req.json()) as {
    userContext?: string;
    idea?: string;
    vcMemo?: string;
    modelChoice?: ModelChoice;
  };

  if (!userContext || !idea) {
    return new Response(
      JSON.stringify({ error: "userContext and idea are required" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const model = modelChoice ?? DEFAULT_MODEL;
  return streamSkill({
    skill: "data-miner",
    model,
    userMessage: buildVerifyPrompt({
      userContext,
      ideaMarkdown: idea,
      vcMemo,
      searchEnabled: modelHasLiveSearch(model),
    }),
    temperature: 0.4,
    maxTokens: 12000,
  });
}
