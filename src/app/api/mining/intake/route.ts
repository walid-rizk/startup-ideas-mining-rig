import { convertToModelMessages, type UIMessage } from "ai";
import { streamSkill } from "@/lib/providers";
import { DEFAULT_MODEL } from "@/lib/types";
import type { ModelChoice } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages, modelChoice } = (await req.json()) as {
    messages: UIMessage[];
    modelChoice?: ModelChoice;
  };

  return streamSkill({
    skill: "interviewer",
    model: modelChoice ?? DEFAULT_MODEL,
    messages: await convertToModelMessages(messages),
  });
}
