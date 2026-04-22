// ─── Skills ──────────────────────────────────────────────────────────
export type SkillName =
  | "interviewer"
  | "thesis-builder"
  | "futurist"
  | "vc-partner"
  | "data-miner"
  | "product-manager"
  | "cto"
  | "synthesizer";

export type SkillPhase = "intake" | "mine" | "verify" | "shape" | "blueprint" | "output";

export interface SkillMeta {
  name: SkillName;
  display_name: string;
  icon: string;
  color: string;
  version: string;
  phase: SkillPhase;
  capabilities: string[];
  output_format: string;
}

export interface Skill {
  name: SkillName;
  frontmatter: SkillMeta;
  systemPrompt: string;
}

// ─── Models / Providers ──────────────────────────────────────────────
export type Provider = "anthropic" | "gemini";

export interface ModelChoice {
  provider: Provider;
  model: string;
}

export const DEFAULT_MODEL: ModelChoice = {
  provider: "gemini",
  model: "gemini-2.5-flash",
};

export const MODEL_OPTIONS: Array<ModelChoice & { label: string }> = [
  { provider: "gemini", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash (free tier)" },
  { provider: "gemini", model: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { provider: "anthropic", model: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { provider: "anthropic", model: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

// ─── Verdicts ────────────────────────────────────────────────────────
export type Verdict = "STRONG_INVEST" | "INVEST" | "SOFT_PASS" | "STRONG_PASS";

export interface IdeaResult {
  id: string;
  title: string;
  rawMarkdown: string;
  batchNumber: number;

  verdict?: Verdict;
  pinned?: boolean;
  moatScore?: number;
  founderFitScore?: number;
  moatRationale?: string;
  founderFitRationale?: string;
  oneLiner?: string;
  bullCase?: string;
  bearCase?: string;
  comparableCompanies?: string;
  marketSizing?: string;
  unitEconomics?: string;
  hairOnFireCheck?: string;
  distributionPlan?: string;
  keyRisks?: string;
  whatWouldChangeMind?: string;
  verdictRationale?: string;
}

// ─── Chat message (used for persisting intake conversation) ──────────
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// ─── Synthesis ──────────────────────────────────────────────────────
export interface SynthesisEntry {
  id: string;
  createdAt: string;
  ideaId: string;
  ideaTitle: string;
  mode: 'build_packet' | 'investor_brief';
  content: string;
}

// ─── Session ─────────────────────────────────────────────────────────
export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;

  founderContext: string;
  thesis: string | null;
  modelChoice: ModelChoice;
  intakeMessages: ChatMessage[];

  survivors: IdeaResult[];
  allIdeas: IdeaResult[];

  discardedIdeas: IdeaResult[];

  verifications: Record<string, string>;
  prds: Record<string, string>;
  blueprints: Record<string, string>;
  synthesis: string | null;
  syntheses: SynthesisEntry[];
}

// ─── API shapes ──────────────────────────────────────────────────────
export interface SkillRequest {
  modelChoice?: ModelChoice;
  userContext?: string;
  idea?: { id: string; title: string; markdown: string };
  ideasMarkdown?: string;
  marketResearch?: string;
  prd?: string;
  blueprint?: string;
  batchNumber?: number;
  mode?: "investor_brief" | "build_packet";
  messages?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
}
