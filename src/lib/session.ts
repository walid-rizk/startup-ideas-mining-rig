"use client";
import { z } from "zod";
import type { Session, IdeaResult, Verdict, ModelChoice, ChatMessage } from "./types";
import { DEFAULT_MODEL } from "./types";

const STORAGE_KEY = "idea-mining-rig.session.v1";

// ─── Zod schemas (runtime validation for import) ────────────────────
const chatMessageSchema: z.ZodType<ChatMessage> = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const verdictSchema = z.enum([
  "STRONG_INVEST",
  "INVEST",
  "SOFT_PASS",
  "STRONG_PASS",
]);

const ideaResultSchema: z.ZodType<IdeaResult> = z.object({
  id: z.string(),
  title: z.string(),
  rawMarkdown: z.string(),
  batchNumber: z.number(),
  verdict: verdictSchema.optional(),
  moatScore: z.number().optional(),
  founderFitScore: z.number().optional(),
  moatRationale: z.string().optional(),
  founderFitRationale: z.string().optional(),
  oneLiner: z.string().optional(),
  bullCase: z.string().optional(),
  bearCase: z.string().optional(),
  comparableCompanies: z.string().optional(),
  marketSizing: z.string().optional(),
  unitEconomics: z.string().optional(),
  hairOnFireCheck: z.string().optional(),
  distributionPlan: z.string().optional(),
  keyRisks: z.string().optional(),
  whatWouldChangeMind: z.string().optional(),
  verdictRationale: z.string().optional(),
});

const modelChoiceSchema: z.ZodType<ModelChoice> = z.object({
  provider: z.enum(["anthropic", "gemini"]),
  model: z.string(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sessionSchema: z.ZodType<Session, any, any> = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  founderContext: z.string(),
  thesis: z.string().nullable(),
  modelChoice: modelChoiceSchema,
  intakeMessages: z.array(chatMessageSchema).default([]),
  survivors: z.array(ideaResultSchema),
  allIdeas: z.array(ideaResultSchema),
  discardedIdeas: z.array(ideaResultSchema).default([]),
  verifications: z.record(z.string(), z.string()),
  prds: z.record(z.string(), z.string()),
  blueprints: z.record(z.string(), z.string()),
  synthesis: z.string().nullable(),
});

// ─── Pure helpers ───────────────────────────────────────────────────
export function createEmptySession(): Session {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    founderContext: "",
    thesis: null,
    modelChoice: DEFAULT_MODEL,
    intakeMessages: [],
    survivors: [],
    allIdeas: [],
    discardedIdeas: [],
    verifications: {},
    prds: {},
    blueprints: {},
    synthesis: null,
  };
}

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = sessionSchema.parse(JSON.parse(raw));
    return parsed;
  } catch (err) {
    console.warn("[session] failed to load, starting fresh:", err);
    return null;
  }
}

export function saveSession(session: Session): void {
  if (typeof window === "undefined") return;
  const withTs = { ...session, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(withTs));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function exportSession(session: Session, filename?: string): void {
  const json = JSON.stringify(session, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ?? `idea-mining-rig-${session.id.slice(0, 8)}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importSessionFromFile(file: File): Promise<Session> {
  const text = await file.text();
  const raw = JSON.parse(text);
  return sessionSchema.parse(raw);
}

// ─── Derivation helpers ─────────────────────────────────────────────
export function ideaKey(idea: Pick<IdeaResult, "id">): string {
  return idea.id;
}

export function getVerdictRank(v: Verdict): number {
  switch (v) {
    case "STRONG_INVEST":
      return 0;
    case "INVEST":
      return 1;
    case "SOFT_PASS":
      return 2;
    case "STRONG_PASS":
      return 3;
  }
}
