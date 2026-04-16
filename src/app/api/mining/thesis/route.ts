import { streamSkill } from "@/lib/providers";
import { buildThesisPrompt } from "@/lib/prompt-builders";
import { DEFAULT_MODEL } from "@/lib/types";
import type { ModelChoice } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { userContext, modelChoice } = (await req.json()) as {
    userContext?: string;
    modelChoice?: ModelChoice;
  };

  if (!userContext) {
    return new Response(JSON.stringify({ error: "userContext is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  return streamSkill({
    skill: "thesis-builder",
    model: modelChoice ?? DEFAULT_MODEL,
    userMessage: buildThesisPrompt({ userContext }),
    temperature: 0.8,
  });
}
