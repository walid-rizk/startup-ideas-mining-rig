// Per-skill user-message builders. The system prompt (from each skills/<name>/SKILL.md)
// defines role and output contract; the user message just supplies concrete inputs.

import type { IdeaResult } from "./types";

function section(label: string, body: string | null | undefined): string {
  if (!body) return "";
  return `## ${label}\n\n${body.trim()}\n\n---\n\n`;
}

function sectionOrMarker(label: string, body: string | null | undefined, absentMarker: string): string {
  if (body && body.trim()) return section(label, body);
  return section(label, absentMarker);
}

function todayLong(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Strong temporal anchor for any prompt whose output reasons about "now",
// "Why Now", market timing, or current competitors. LLMs default to their
// training cutoff (late 2023/early 2024) when asked about the present, so we
// override with the server clock and explicitly tell them not to fall back.
function temporalAnchor(): string {
  const today = todayLong();
  const year = new Date().getFullYear();
  return [
    `## Temporal Anchor`,
    ``,
    `**Today's date is ${today}.**`,
    `Your training data is older than this. Do NOT default to 2023/2024 framings or assume that is the current year.`,
    `Any "Why Now", market-timing, or competitor-status claim must be anchored to what is true as of ${year}.`,
    `If you are uncertain whether a capability, product, regulation, or trend exists or holds as of today, flag the uncertainty explicitly — do not fabricate a date or pretend an older state of the world is current.`,
    ``,
    `---`,
    ``,
  ].join("\n");
}

export function buildIntakeFirstTurn(): string {
  return [
    "Greet the founder briefly and ask your first question.",
    "Your goal over the next few turns is to extract enough signal to produce a complete Founder Context (see your Output Contract).",
    "Accept any of: typed text, pasted LinkedIn content, or resume content in the message.",
    "Don't drop a full questionnaire — ask the single most useful next question.",
  ].join("\n\n");
}

export function buildGeneratePrompt(opts: { userContext: string; batchNumber: number }): string {
  return [
    temporalAnchor(),
    section("Founder Context", opts.userContext),
    `Generate exactly 3 startup ideas for Batch #${opts.batchNumber}.`,
    `Use your Output Contract — ideas must be headed \`## IDEA ${opts.batchNumber}.1:\`, \`## IDEA ${opts.batchNumber}.2:\`, \`## IDEA ${opts.batchNumber}.3:\`.`,
    `Enforce the Founder-Market Fit rule strictly. At least 2 of 3 ideas must exploit an Unfair Advantage from the context.`,
    `Each **Why Now** must cite a specific technological or market shift that is true **as of today's date above** — not a 2023/2024 framing. If a model/API/regulation you want to cite may predate today, pick a more recent enabler or acknowledge your uncertainty.`,
  ].join("\n");
}

export function buildDevelopPrompt(opts: {
  userContext: string;
  seedIdea: string;
  batchNumber?: number;
}): string {
  const bn = opts.batchNumber ?? 0;
  return [
    temporalAnchor(),
    section("Founder Context", opts.userContext),
    section("Raw Idea from Founder", opts.seedIdea),
    `The founder has submitted their own raw idea above. Your job is to **develop and frame it** — NOT generate new ideas.`,
    `Output exactly ONE idea using your Output Contract, headed \`## IDEA ${bn}.1: <Title>\`.`,
    `Preserve the founder's core intent. Sharpen, flesh out, and fill in missing sections per your contract (Hook, Customer, Wedge, Unfair Advantage, etc.).`,
    `The **Why Now** must reflect today's date (above) — not a 2023/2024 framing. Anchor enablers to current capabilities.`,
    `If the founder's raw idea violates Founder-Market Fit or the Win Condition, still develop it — but flag the tension in the Unfair Advantage section so the VC critique can address it.`,
  ].join("\n");
}

export function buildCritiquePrompt(opts: { userContext: string; ideasMarkdown: string }): string {
  return [
    temporalAnchor(),
    section("Founder Context", opts.userContext),
    section("Ideas to Evaluate", opts.ideasMarkdown),
    `Produce one memo per idea using your Output Contract (\`## MEMO — IDEA [batch].[n]:\` headers). Every field in the contract is required — do not skip Comparable Companies, Market Sizing, Unit Economics First-Cut, Key Risks, or What Would Change My Mind.`,
    `Write as if this memo is being read by your investment committee — partners who will challenge vague claims. Take a position. No hedging.`,
    `Every memo must have a \`**Verdict:**\` line with exactly one of: STRONG_INVEST | INVEST | SOFT_PASS | STRONG_PASS.`,
    `Include Moat Score (1-10) and Founder Fit Score (1-10) as integers with one-sentence justifications.`,
    `Name at least 2 specific comparable companies by real name in each memo (with what happened to them — exit, flameout, still grinding). "Companies like this" or "similar SaaS tools" is banned.`,
    `Market Sizing must include concrete TAM/SAM/SOM numbers with basis (labeled proxies are fine; hand-waving is not).`,
    `Key Risks must be a bullet list of 3 distinct risks — regulatory, competitive (name names), technical, team, or timing.`,
    `What Would Change My Mind must name specific observable evidence in the next 90 days — not vibes.`,
    `Calibrate to the Win Condition in the Founder Context. Every Verdict Rationale must cite at least one Unfair Advantage by name.`,
  ].join("\n");
}

export function reconstructVcMemo(idea: Pick<IdeaResult, 'title' | 'verdict' | 'moatScore' | 'founderFitScore' | 'oneLiner' | 'bullCase' | 'bearCase' | 'comparableCompanies' | 'marketSizing' | 'unitEconomics' | 'hairOnFireCheck' | 'distributionPlan' | 'keyRisks' | 'whatWouldChangeMind' | 'verdictRationale'>): string {
  const lines: string[] = [`## VC Partner Memo: ${idea.title}`];
  if (idea.oneLiner) lines.push(`**One-Liner:** ${idea.oneLiner}`);
  if (idea.verdict) lines.push(`**Verdict:** ${idea.verdict}`);
  if (idea.moatScore != null) lines.push(`**Moat Score:** ${idea.moatScore}/10`);
  if (idea.founderFitScore != null) lines.push(`**Founder Fit Score:** ${idea.founderFitScore}/10`);
  if (idea.bullCase) lines.push(`**Bull Case:**\n${idea.bullCase}`);
  if (idea.bearCase) lines.push(`**Bear Case:**\n${idea.bearCase}`);
  if (idea.comparableCompanies) lines.push(`**Comparable Companies:**\n${idea.comparableCompanies}`);
  if (idea.marketSizing) lines.push(`**Market Sizing:**\n${idea.marketSizing}`);
  if (idea.unitEconomics) lines.push(`**Unit Economics First-Cut:**\n${idea.unitEconomics}`);
  if (idea.hairOnFireCheck) lines.push(`**Hair-on-Fire Check:**\n${idea.hairOnFireCheck}`);
  if (idea.distributionPlan) lines.push(`**Distribution Plan:**\n${idea.distributionPlan}`);
  if (idea.keyRisks) lines.push(`**Key Risks:**\n${idea.keyRisks}`);
  if (idea.whatWouldChangeMind) lines.push(`**What Would Change My Mind:**\n${idea.whatWouldChangeMind}`);
  if (idea.verdictRationale) lines.push(`**Verdict Rationale:**\n${idea.verdictRationale}`);
  return lines.join('\n\n');
}

export function buildVerifyPrompt(opts: {
  userContext: string;
  ideaMarkdown: string;
  vcMemo?: string | null;
}): string {
  return [
    temporalAnchor(),
    section("Founder Context", opts.userContext),
    section("Idea to Validate", opts.ideaMarkdown),
    sectionOrMarker("VC Partner Memo", opts.vcMemo, "No VC partner memo available for this idea."),
    `Produce a Market Research report per your Output Contract. Use web search for competitor and market size claims. Cite sources with dates. Label proxy reasoning explicitly.`,
    `Market size numbers and competitor status must be current as of today's date. Prefer sources dated within the last 18 months; flag any older figure as a proxy.`,
    `The Timing Verdict must be exactly one of: TOO_EARLY | JUST_RIGHT | SATURATED | TAR_PIT.`,
  ].join("\n");
}

export function buildShapePrompt(opts: {
  userContext: string;
  ideaMarkdown: string;
  vcMemo?: string | null;
  marketResearch?: string | null;
}): string {
  return [
    section("Founder Context", opts.userContext),
    section("Idea to Shape", opts.ideaMarkdown),
    sectionOrMarker("VC Partner Memo", opts.vcMemo, "No VC partner memo available for this idea."),
    sectionOrMarker("Market Research (Data Miner Report)", opts.marketResearch, "No data-miner report available for this idea."),
    `Produce a PRD per your Output Contract. Be brutal on MVP scope — P0 must be 3-5 features. Specify Time to First Value in minutes.`,
  ].join("\n");
}

export function buildBlueprintPrompt(opts: {
  userContext: string;
  ideaMarkdown: string;
  vcMemo?: string | null;
  marketResearch?: string | null;
  prd?: string | null;
}): string {
  return [
    section("Founder Context", opts.userContext),
    section("Idea", opts.ideaMarkdown),
    sectionOrMarker("VC Partner Memo", opts.vcMemo, "No VC partner memo available for this idea."),
    sectionOrMarker("Market Research (Data Miner Report)", opts.marketResearch, "No data-miner report available for this idea."),
    sectionOrMarker("PRD (Product Manager)", opts.prd, "No PRD available for this idea."),
    `Produce a Technical Blueprint per your Output Contract. Respect the founder's Constraints — if they're no-code, pick no-code tools. Name the Walking Skeleton first. Favor Buy over Build for commodity capabilities.`,
  ].join("\n");
}

export function buildThesisPrompt(opts: { userContext: string }): string {
  return [
    temporalAnchor(),
    section("Founder Context", opts.userContext),
    `Generate exactly 3 candidate theses per your Output Contract.`,
    `Before generating theses, emit a ## Market Pulse section with 3–5 macro trends relevant to this founder's domain **as of today's date above**. Draw on current AI capability shifts, regulatory changes, distribution changes, and infrastructure commoditisation — anchored to what is true now, not a 2023/2024 snapshot.`,
    `The 3 theses must be materially different on the three axes in your system prompt, and each must include a **Why Now** grounded in a specific current trend from the Market Pulse.`,
    `End with a ## Recommendation that names the best thesis for this founder given their Win Condition, and hand the choice back to them.`,
  ].join("\n");
}

export function buildSynthesizePrompt(opts: {
  userContext: string;
  survivorsMarkdown: string;
  marketResearch?: string | null;
  prd?: string | null;
  blueprint?: string | null;
  mode: "investor_brief" | "build_packet";
}): string {
  return [
    temporalAnchor(),
    section("Founder Context", opts.userContext),
    section("Survivor Ideas (with verdicts)", opts.survivorsMarkdown),
    sectionOrMarker("Market Research (Data Miner Report)", opts.marketResearch, "Founder skipped verification — no data-miner report available."),
    sectionOrMarker("PRD (Product Manager)", opts.prd, "Founder skipped shaping — no PRD available."),
    sectionOrMarker("Technical Blueprint (CTO)", opts.blueprint, "Founder skipped blueprint — no technical plan available."),
    `Use the date from the Temporal Anchor above in the \`*Date:*\` line of your output — verbatim. Do NOT substitute a different date.`,
    `Emit a ${opts.mode === "investor_brief" ? "**Investor Brief**" : "**Build Packet**"} per your Output Contract for that mode.`,
    `Curate, don't dump — pull the sharpest 20% of each artifact. Target ${opts.mode === "investor_brief" ? "~2000" : "~3000"} words.`,
  ].join("\n");
}
