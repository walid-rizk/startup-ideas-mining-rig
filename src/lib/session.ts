"use client";
import { z } from "zod";
import type { Session, IdeaResult, Verdict, ModelChoice, ChatMessage, SynthesisEntry } from "./types";
import { DEFAULT_MODEL } from "./types";

const STORAGE_KEY = "idea-mining-rig.session.v1";
const IDB_NAME = "idea-mining-rig";
const IDB_STORE = "session";
const IDB_KEY = "current";

// ─── IndexedDB helpers ─────────────────────────────────────────────
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

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
  pinned: z.boolean().optional(),
  promoted: z.boolean().optional(),
  moatScore: z.number().optional(),
  founderFitScore: z.number().optional(),
  marketTimingScore: z.number().optional(),
  distributionEdgeScore: z.number().optional(),
  moatRationale: z.string().optional(),
  founderFitRationale: z.string().optional(),
  marketTimingRationale: z.string().optional(),
  distributionEdgeRationale: z.string().optional(),
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
  provider: z.enum(["anthropic", "gemini", "openai"]),
  model: z.string(),
});

const synthesisEntrySchema: z.ZodType<SynthesisEntry> = z.object({
  id: z.string(),
  createdAt: z.string(),
  ideaId: z.string(),
  ideaTitle: z.string(),
  mode: z.enum(["build_packet", "investor_brief"]),
  content: z.string(),
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
  stressTests: z.record(z.string(), z.string()).default({}),
  prds: z.record(z.string(), z.string()),
  blueprints: z.record(z.string(), z.string()),
  synthesis: z.string().nullable(),
  syntheses: z.array(synthesisEntrySchema).default([]),
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
    stressTests: {},
    prds: {},
    blueprints: {},
    synthesis: null,
    syntheses: [],
  };
}

function deduplicateIdeas(
  ideas: IdeaResult[],
  maps: Record<string, string>[],
): { ideas: IdeaResult[]; maps: Record<string, string>[] } {
  const seen = new Set<string>();
  const remapped: Record<string, string>[] = maps.map((m) => ({ ...m }));
  const deduped = ideas.map((idea) => {
    if (!seen.has(idea.id)) {
      seen.add(idea.id);
      return idea;
    }
    const newId = `${idea.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    seen.add(newId);
    for (const m of remapped) {
      if (idea.id in m) {
        m[newId] = m[idea.id];
      }
    }
    return { ...idea, id: newId };
  });
  return { ideas: deduped, maps: remapped };
}

function hydrateSession(raw: unknown): Session | null {
  try {
    const parsed = sessionSchema.parse(raw);

    const { ideas: survivors, maps: [v1, st1, p1, b1] } = deduplicateIdeas(
      parsed.survivors,
      [parsed.verifications, parsed.stressTests, parsed.prds, parsed.blueprints],
    );
    parsed.survivors = survivors;
    parsed.verifications = v1;
    parsed.stressTests = st1;
    parsed.prds = p1;
    parsed.blueprints = b1;

    const { ideas: allIdeas } = deduplicateIdeas(parsed.allIdeas, []);
    parsed.allIdeas = allIdeas;

    const { ideas: discarded } = deduplicateIdeas(parsed.discardedIdeas, []);
    parsed.discardedIdeas = discarded;

    if (parsed.synthesis && parsed.syntheses.length === 0) {
      parsed.syntheses = [{
        id: crypto.randomUUID(),
        createdAt: parsed.updatedAt,
        ideaId: parsed.survivors[0]?.id ?? 'unknown',
        ideaTitle: parsed.survivors[0]?.title ?? 'Unknown Idea',
        mode: 'build_packet',
        content: parsed.synthesis,
      }];
    }

    return parsed;
  } catch (err) {
    console.warn("[session] failed to parse:", err);
    return null;
  }
}

export async function loadSession(): Promise<Session | null> {
  if (typeof window === "undefined") return null;
  try {
    // Try IndexedDB first
    const idbData = await idbGet<unknown>(IDB_KEY);
    if (idbData) return hydrateSession(idbData);

    // Migrate from localStorage if present
    const lsRaw = window.localStorage.getItem(STORAGE_KEY);
    if (lsRaw) {
      const parsed = JSON.parse(lsRaw);
      const session = hydrateSession(parsed);
      if (session) {
        await idbSet(IDB_KEY, { ...session, updatedAt: new Date().toISOString() });
        window.localStorage.removeItem(STORAGE_KEY);
        console.info("[session] migrated from localStorage to IndexedDB");
      }
      return session;
    }

    return null;
  } catch (err) {
    console.warn("[session] failed to load, starting fresh:", err);
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  if (typeof window === "undefined") return;
  const withTs = { ...session, updatedAt: new Date().toISOString() };
  await idbSet(IDB_KEY, withTs);
}

export async function clearSession(): Promise<void> {
  if (typeof window === "undefined") return;
  await idbDelete(IDB_KEY);
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

export type PhaseData = {
  verifications: Record<string, string>;
  stressTests: Record<string, string>;
  prds: Record<string, string>;
  blueprints: Record<string, string>;
};

export type MarketConfidence = 'STRONG' | 'MODERATE' | 'WEAK' | 'INSUFFICIENT';
export type StressSeverity = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';

export function parseMarketConfidence(report: string | undefined): MarketConfidence | null {
  if (!report) return null;
  const m = report.match(/Market Confidence[:\s*]*(?:\*\*\s*)?(STRONG|MODERATE|WEAK|INSUFFICIENT)/i);
  return m ? (m[1].toUpperCase() as MarketConfidence) : null;
}

export function parseStressSeverity(report: string | undefined): StressSeverity | null {
  if (!report) return null;
  // Accept bolded `**Overall: LEVEL**` (canonical) and unbolded `Overall: LEVEL` (defensive
  // fallback for models that drop the bold formatting).
  const m = report.match(/(?:^|\n)\s*(?:\*\*)?\s*Overall\s*:\s*(?:\*\*\s*)?(CRITICAL|HIGH|MODERATE|LOW)\b/i);
  return m ? (m[1].toUpperCase() as StressSeverity) : null;
}

const MARKET_ADJ: Record<MarketConfidence, number> = { STRONG: 1.5, MODERATE: 0, WEAK: -2, INSUFFICIENT: -0.5 };
const STRESS_ADJ: Record<StressSeverity, number> = { CRITICAL: -3, HIGH: -1.5, MODERATE: 0, LOW: 0.5 };

// Weighted-min blend: an idea with a single catastrophic dimension shouldn't
// hide behind three strong ones. 9/9/9/2 → 5.7, not 7.25.
function dimensionBase(scores: number[]): number {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...scores);
  return 0.7 * mean + 0.3 * min;
}

export function scoreFromSignals(
  idea: IdeaResult,
  conf: MarketConfidence | null,
  sev: StressSeverity | null,
): { score: number; preliminary: boolean } | null {
  const s = [idea.moatScore, idea.founderFitScore, idea.marketTimingScore, idea.distributionEdgeScore]
    .filter((v): v is number => v != null && v > 0);
  if (s.length === 0) return null;
  let score = dimensionBase(s);

  if (conf) score += MARKET_ADJ[conf];
  if (sev) score += STRESS_ADJ[sev];

  const preliminary = conf == null && sev == null;
  return { score: Math.round(Math.max(0, Math.min(10, score)) * 10) / 10, preliminary };
}

export function computeIdeaScore(
  idea: IdeaResult,
  phases: PhaseData,
): { score: number; preliminary: boolean } | null {
  return scoreFromSignals(
    idea,
    parseMarketConfidence(phases.verifications[idea.id]),
    parseStressSeverity(phases.stressTests[idea.id]),
  );
}

export function sortByProgress(ideas: IdeaResult[], phases: PhaseData): IdeaResult[] {
  return [...ideas].sort((a, b) => {
    const countPhases = (id: string) =>
      (phases.verifications[id] ? 1 : 0) +
      (phases.stressTests[id] ? 1 : 0) +
      (phases.prds[id] ? 1 : 0) +
      (phases.blueprints[id] ? 1 : 0);
    const progressDiff = countPhases(b.id) - countPhases(a.id);
    if (progressDiff !== 0) return progressDiff;
    const scoreA = computeIdeaScore(a, phases)?.score ?? 0;
    const scoreB = computeIdeaScore(b, phases)?.score ?? 0;
    return scoreB - scoreA;
  });
}
