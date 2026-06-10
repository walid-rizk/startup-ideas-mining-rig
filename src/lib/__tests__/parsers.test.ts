import { describe, it, expect } from "vitest";
import {
  parseIdeasFromText,
  parseVerdicts,
  isolateMemoSection,
  ideaSectionKey,
  extractField,
  extractBullets,
  parseVerdictValue,
  parseScore,
  parseScoreRationale,
} from "../parsers";

// ─── Golden fixtures (match skills/futurist + skills/vc-partner contracts) ───

const FUTURIST_OUTPUT = `## IDEA 2.1: Voice Notes CRM for Solo Consultants

**The Hook:** Your call recordings already contain your CRM — nobody typed it.

**Problem:** Solo consultants lose follow-ups.
- Persona: fractional execs
- Cost: 5 hrs/week

## IDEA 2.2: Compliance Copilot for Insurance TPAs

**The Hook:** TPAs drown in state-by-state rule changes.

**Problem:** Claim handlers misapply rules.

## IDEA 2.3: Permit Navigator for Solar Installers

**The Hook:** Permitting is 30% of residential solar cost.

**Problem:** Installers wait weeks on AHJs.
`;

const MEMO_1 = `## MEMO — IDEA 2.1: Voice Notes CRM for Solo Consultants

**Verdict:** INVEST

**One-Liner:** It's Gong for solo consultants.

**Bull Case:** Becomes the system of record for solo advisory work.
- Voice capture is zero-behavior-change
- Expansion into proposals

**Bear Case:** Notion ships this as a feature.
- Distribution dies without an audience

**Comparable Companies:** This rhymes with Gong and Fathom.
- Gong: $7B+ valuation
- Clara Labs (graveyard): shut down 2020

**Market Sizing:** ~$1.2B SAM at 800k US solo consultants × $1.5k ACV.
- TAM: $4B basis labeled

**Unit Economics First-Cut:** Pricing $99/mo, ~80% GM.
- CAC: $300 proxy

**Moat Score:** 6 — accumulated call corpus creates switching costs after month 3.

**Founder Fit Score:** 8 — founder ran a consulting collective for 6 years.

**Market Timing Score:** 7 — transcription cost collapsed 10x in 18 months.

**Distribution Edge Score:** 4 — newsletter reaches 2k consultants but no proven channel beyond it.

**Hair-on-Fire Check:** Top-3 problem this quarter.
- Persona: fractional CFOs

**Distribution Plan:** Newsletter + community seeding.
- First 10 via warm intros

**Key Risks:**
- Incumbent: Fathom adds CRM sync
- Regulatory: call-recording consent (two-party states)
- Churn: solo users churn at 8%/mo

**What Would Change My Mind:** Flip to STRONG_INVEST with 5 paid design partners.
- $5k MRR in 90 days

**Verdict Rationale:** Matches Lifestyle win condition; underwriting the consulting-collective network.
`;

// Memo 2.2 deliberately PARAPHRASES the idea title in its header — isolation
// must succeed via the "IDEA 2.2" marker, not the title echo. This is the
// regression test for the id→`batch.n` derivation bug.
const MEMO_2 = `## MEMO — IDEA 2.2: TPA Compliance Bot

**Verdict:** SOFT_PASS

**One-Liner:** RegTech for the unglamorous middle of insurance.

**Bear Case:** Sales cycle outlasts runway.

**Moat Score:** 5 — rules corpus is replicable.

**Founder Fit Score:** 4 — no insurance network.

**Market Timing Score:** 6 — NAIC model law momentum.

**Distribution Edge Score:** 3 — cold outbound to TPA COOs.

**Key Risks:**
- Incumbent: Verisk expands down-market

**Verdict Rationale:** Founder lacks the distribution edge this requires.
`;

const MEMO_3 = `## MEMO — IDEA 2.3: Permit Navigator for Solar Installers

**Verdict:** STRONG_PASS

**One-Liner:** A tarpit with a graveyard.

**Moat Score:** 2 — AHJ data is public.

**Founder Fit Score:** 3 — no solar background.

**Market Timing Score:** 4 — NEM 3.0 crushed resi solar demand.

**Distribution Edge Score:** 2 — no channel.

**Verdict Rationale:** Violates the founder's Excludes signal on hardware-adjacent ops.
`;

const CRITIQUE_OUTPUT = `Here are my memos for this batch.

${MEMO_1}
${MEMO_2}
${MEMO_3}`;

function mineIdeas() {
  return parseIdeasFromText(FUTURIST_OUTPUT, 2);
}

describe("ideaSectionKey", () => {
  it("derives batch.n from mined ids (batch-n-timestamp)", () => {
    expect(ideaSectionKey("2-1-1733000000000")).toBe("2.1");
    expect(ideaSectionKey("12-3-99")).toBe("12.3");
  });

  it("does not include the timestamp segment", () => {
    expect(ideaSectionKey("1-2-1733000000000")).not.toContain("1733");
  });
});

describe("parseIdeasFromText", () => {
  it("extracts all 3 ideas with titles and batch-prefixed ids", () => {
    const ideas = mineIdeas();
    expect(ideas).toHaveLength(3);
    expect(ideas[0].title).toBe("Voice Notes CRM for Solo Consultants");
    expect(ideas[1].title).toBe("Compliance Copilot for Insurance TPAs");
    expect(ideas[2].title).toBe("Permit Navigator for Solar Installers");
    expect(ideas[0].id).toMatch(/^2-1-\d+$/);
    expect(ideas[2].id).toMatch(/^2-3-\d+$/);
  });

  it("keeps each idea's own content", () => {
    const ideas = mineIdeas();
    expect(ideas[0].content).toContain("Your call recordings");
    expect(ideas[0].content).not.toContain("TPAs drown");
  });
});

describe("parseVerdicts", () => {
  it("assigns each memo to the right idea, including paraphrased-title headers", () => {
    const results = parseVerdicts(CRITIQUE_OUTPUT, mineIdeas());
    expect(results[0].verdict).toBe("INVEST");
    expect(results[1].verdict).toBe("SOFT_PASS"); // isolated via IDEA 2.2 marker, not title
    expect(results[2].verdict).toBe("STRONG_PASS");
  });

  it("extracts the four dimension scores as integers", () => {
    const results = parseVerdicts(CRITIQUE_OUTPUT, mineIdeas());
    expect(results[0].scores).toEqual({ moat: 6, founderFit: 8, marketTiming: 7, distributionEdge: 4 });
    expect(results[2].scores).toEqual({ moat: 2, founderFit: 3, marketTiming: 4, distributionEdge: 2 });
  });

  it("extracts structured fields without cross-memo contamination", () => {
    const results = parseVerdicts(CRITIQUE_OUTPUT, mineIdeas());
    expect(results[0].oneLiner).toBe("It's Gong for solo consultants.");
    expect(results[1].oneLiner).toBe("RegTech for the unglamorous middle of insurance.");
    expect(results[0].critique).not.toContain("TPA Compliance Bot");
    expect(results[1].critique).not.toContain("Permit Navigator");
  });

  it("extracts key risks as a bullet block", () => {
    const results = parseVerdicts(CRITIQUE_OUTPUT, mineIdeas());
    expect(results[0].keyRisks).toContain("Fathom adds CRM sync");
    expect(results[0].keyRisks).toContain("two-party states");
  });

  it("extracts score rationales", () => {
    const results = parseVerdicts(CRITIQUE_OUTPUT, mineIdeas());
    expect(results[0].moatRationale).toContain("switching costs");
    expect(results[1].founderFitRationale).toContain("no insurance network");
  });

  it("leaves verdict undefined when no memo exists for an idea", () => {
    const ideas = mineIdeas();
    const orphan = { id: "2-9-123", title: "Idea That Got No Memo" };
    const results = parseVerdicts(CRITIQUE_OUTPUT, [...ideas, orphan]);
    expect(results[3].verdict).toBeUndefined();
    expect(results[3].critique).toBe("");
  });
});

describe("isolateMemoSection", () => {
  it("pulls one memo out of a bundled critique", () => {
    const isolated = isolateMemoSection(CRITIQUE_OUTPUT, "2-2-1733000000000", "Compliance Copilot for Insurance TPAs");
    expect(isolated).toContain("TPA Compliance Bot");
    expect(isolated).toContain("SOFT_PASS");
    expect(isolated).not.toContain("Gong for solo consultants");
    expect(isolated).not.toContain("Permit Navigator");
  });

  it("returns input unchanged when nothing matches", () => {
    const raw = "Some critique text without markers.";
    expect(isolateMemoSection(raw, "9-9-1", "Nope")).toBe(raw);
  });
});

describe("field extraction primitives", () => {
  it("extractField captures multi-line values up to the next field", () => {
    expect(extractField(MEMO_1, "Bull Case")).toContain("system of record");
    expect(extractField(MEMO_1, "Bull Case")).not.toContain("Notion ships");
  });

  it("extractBullets splits bullet items and ignores separators", () => {
    const bullets = extractBullets(MEMO_1, "Key Risks");
    expect(bullets).toHaveLength(3);
    expect(bullets[0]).toContain("Fathom");
  });

  it("parseScore reads bolded score lines", () => {
    expect(parseScore(MEMO_1, "Moat Score")).toBe(6);
    expect(parseScore(MEMO_1, "Distribution Edge Score")).toBe(4);
  });

  it("parseScoreRationale strips the score prefix", () => {
    const r = parseScoreRationale(MEMO_1, "Founder Fit Score");
    expect(r).toContain("consulting collective");
    expect(r).not.toMatch(/^8/);
  });

  it("parseVerdictValue handles all four enum values and falls back on prose", () => {
    expect(parseVerdictValue("**Verdict:** STRONG_INVEST")).toBe("STRONG_INVEST");
    expect(parseVerdictValue("**Verdict:** SOFT_PASS")).toBe("SOFT_PASS");
    expect(parseVerdictValue("I would soft pass on this.")).toBe("SOFT_PASS");
    expect(parseVerdictValue("")).toBeUndefined();
  });
});
