import { describe, it, expect } from "vitest";
import { parseMarketConfidence, parseStressSeverity, scoreFromSignals } from "../session";
import type { IdeaResult } from "../types";

function idea(scores: Partial<IdeaResult>): IdeaResult {
  return { id: "1-1-1", title: "t", rawMarkdown: "", batchNumber: 1, ...scores };
}

describe("parseMarketConfidence", () => {
  it("reads the canonical bolded line", () => {
    expect(parseMarketConfidence("# Market Research: X\n\n**Market Confidence: STRONG**\nClaims hold up.")).toBe("STRONG");
  });

  it("reads all four levels case-insensitively", () => {
    for (const level of ["STRONG", "MODERATE", "WEAK", "INSUFFICIENT"] as const) {
      expect(parseMarketConfidence(`Market Confidence: ${level.toLowerCase()}`)).toBe(level);
    }
  });

  it("returns null when absent", () => {
    expect(parseMarketConfidence("no rating here")).toBeNull();
    expect(parseMarketConfidence(undefined)).toBeNull();
  });
});

describe("parseStressSeverity", () => {
  it("reads the canonical bolded line", () => {
    expect(parseStressSeverity("## Severity Rating\n\n**Overall: HIGH**\n")).toBe("HIGH");
  });

  it("accepts the unbolded defensive fallback", () => {
    expect(parseStressSeverity("Overall: low")).toBe("LOW");
  });

  it("returns null when absent", () => {
    expect(parseStressSeverity("Overall vibe is fine")).toBeNull();
  });
});

describe("scoreFromSignals", () => {
  const balanced = idea({ moatScore: 7, founderFitScore: 7, marketTimingScore: 7, distributionEdgeScore: 7 });
  const bottleneck = idea({ moatScore: 9, founderFitScore: 9, marketTimingScore: 9, distributionEdgeScore: 2 });

  it("uses the weighted-min blend so one catastrophic dimension drags the score", () => {
    // 0.7 × mean(7.25) + 0.3 × min(2) = 5.675 → 5.7
    expect(scoreFromSignals(bottleneck, null, null)?.score).toBe(5.7);
    expect(scoreFromSignals(balanced, null, null)?.score).toBe(7);
  });

  it("applies market confidence and stress severity adjustments", () => {
    expect(scoreFromSignals(balanced, "STRONG", "LOW")?.score).toBe(9); // 7 + 1.5 + 0.5
    expect(scoreFromSignals(balanced, "WEAK", "CRITICAL")?.score).toBe(2); // 7 - 2 - 3
  });

  it("clamps to the 0–10 range", () => {
    const weak = idea({ moatScore: 2, founderFitScore: 2, marketTimingScore: 2, distributionEdgeScore: 2 });
    expect(scoreFromSignals(weak, "WEAK", "CRITICAL")?.score).toBe(0);
  });

  it("is preliminary until BOTH diligence signals exist", () => {
    expect(scoreFromSignals(balanced, null, null)?.preliminary).toBe(true);
    expect(scoreFromSignals(balanced, "MODERATE", null)?.preliminary).toBe(true);
    expect(scoreFromSignals(balanced, null, "MODERATE")?.preliminary).toBe(true);
    expect(scoreFromSignals(balanced, "MODERATE", "MODERATE")?.preliminary).toBe(false);
  });

  it("returns null when no dimension scores exist", () => {
    expect(scoreFromSignals(idea({}), "STRONG", "LOW")).toBeNull();
  });
});
