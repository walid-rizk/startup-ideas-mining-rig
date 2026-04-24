import { streamSkill } from "@/lib/providers";
import { buildSynthesizePrompt } from "@/lib/prompt-builders";
import { DEFAULT_MODEL } from "@/lib/types";
import type { ModelChoice } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const {
    userContext,
    survivorsMarkdown,
    marketResearch,
    stressTest,
    prd,
    blueprint,
    mode = "build_packet",
    modelChoice,
  } = (await req.json()) as {
    userContext?: string;
    survivorsMarkdown?: string;
    marketResearch?: string;
    stressTest?: string;
    prd?: string;
    blueprint?: string;
    mode?: "investor_brief" | "build_packet";
    modelChoice?: ModelChoice;
  };

  if (!userContext || !survivorsMarkdown) {
    return new Response(
      JSON.stringify({ error: "userContext and survivorsMarkdown are required" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  return streamSkill({
    skill: "synthesizer",
    model: modelChoice ?? DEFAULT_MODEL,
    userMessage: buildSynthesizePrompt({
      userContext,
      survivorsMarkdown,
      marketResearch,
      stressTest,
      prd,
      blueprint,
      mode,
    }),
    temperature: 0.5,
  });
}
