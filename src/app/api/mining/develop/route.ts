import { streamSkill } from "@/lib/providers";
import { buildDevelopPrompt } from "@/lib/prompt-builders";
import { DEFAULT_MODEL } from "@/lib/types";
import type { ModelChoice } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { userContext, seedIdea, batchNumber = 0, seedIndex = 1, modelChoice } =
    (await req.json()) as {
      userContext?: string;
      seedIdea?: string;
      batchNumber?: number;
      seedIndex?: number;
      modelChoice?: ModelChoice;
    };

  if (!userContext || !seedIdea) {
    return new Response(
      JSON.stringify({ error: "userContext and seedIdea are required" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  return streamSkill({
    skill: "futurist",
    model: modelChoice ?? DEFAULT_MODEL,
    userMessage: buildDevelopPrompt({ userContext, seedIdea, batchNumber, seedIndex }),
    systemAppend: [
      `You are in **SEED-DEVELOPMENT MODE** — not batch generation.`,
      ``,
      `The following rules from your default contract are SUSPENDED for this turn:`,
      `- The "generate exactly 3 startup ideas per batch" rule — you will output exactly ONE.`,
      `- The Founder-Market Fit rejection rule (do not replace or reject the founder's idea for fit reasons).`,
      `- The "at least 2 of 3 ideas must exploit an unfair advantage" rule — this is one idea, driven by the founder's submission.`,
      ``,
      `Your job is narrower:`,
      `1. Read the "Raw Idea from Founder" section of the user message carefully.`,
      `2. Develop THAT idea — do not substitute a different idea you think fits the founder better.`,
      `3. Frame it using your standard Output Contract (Hook, Why Now, Problem, Solution, Target Customer, Revenue Model, Founder Fit, Combinatorial Angle, Expansion Path).`,
      `4. If the founder's idea has obvious founder-market-fit tension, flag it in the **Founder Fit** section so the VC critique can address it — but still develop it faithfully.`,
      ``,
      `Output exactly ONE idea, headed \`## IDEA ${batchNumber}.${seedIndex}: <Title>\`. No other ideas. No "here are some alternatives." Just the one idea the founder asked you to develop.`,
    ].join("\n"),
  });
}
