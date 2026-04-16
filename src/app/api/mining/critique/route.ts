import { streamSkill } from "@/lib/providers";
import { buildCritiquePrompt } from "@/lib/prompt-builders";
import { DEFAULT_MODEL } from "@/lib/types";
import type { ModelChoice } from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { userContext, ideas, modelChoice } = (await req.json()) as {
    userContext?: string;
    ideas?: string;
    modelChoice?: ModelChoice;
  };

  if (!userContext || !ideas) {
    return new Response(
      JSON.stringify({ error: "userContext and ideas are required" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  return streamSkill({
    skill: "vc-partner",
    model: modelChoice ?? DEFAULT_MODEL,
    userMessage: buildCritiquePrompt({ userContext, ideasMarkdown: ideas }),
    temperature: 0.6,
    maxTokens: 12000,
  });
}
