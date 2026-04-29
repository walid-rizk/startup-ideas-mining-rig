import { streamSkill } from "@/lib/providers";
import { buildBlueprintPrompt } from "@/lib/prompt-builders";
import { DEFAULT_MODEL } from "@/lib/types";
import type { ModelChoice } from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { userContext, idea, vcMemo, marketResearch, prd, modelChoice } = (await req.json()) as {
    userContext?: string;
    idea?: string;
    vcMemo?: string;
    marketResearch?: string;
    prd?: string;
    modelChoice?: ModelChoice;
  };

  if (!userContext || !idea) {
    return new Response(
      JSON.stringify({ error: "userContext and idea are required" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  return streamSkill({
    skill: "cto",
    model: modelChoice ?? DEFAULT_MODEL,
    userMessage: buildBlueprintPrompt({ userContext, ideaMarkdown: idea, vcMemo, marketResearch, prd }),
    temperature: 0.5,
    maxTokens: 16000,
  });
}
