import { streamSkill } from "@/lib/providers";
import { buildShapePrompt } from "@/lib/prompt-builders";
import { DEFAULT_MODEL } from "@/lib/types";
import type { ModelChoice } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { userContext, idea, vcMemo, marketResearch, modelChoice } = (await req.json()) as {
    userContext?: string;
    idea?: string;
    vcMemo?: string;
    marketResearch?: string;
    modelChoice?: ModelChoice;
  };

  if (!userContext || !idea) {
    return new Response(
      JSON.stringify({ error: "userContext and idea are required" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  return streamSkill({
    skill: "product-manager",
    model: modelChoice ?? DEFAULT_MODEL,
    userMessage: buildShapePrompt({
      userContext,
      ideaMarkdown: idea,
      vcMemo,
      marketResearch,
    }),
    temperature: 0.7,
  });
}
