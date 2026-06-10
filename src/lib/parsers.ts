// Pure parsing functions for skill outputs (futurist ideas, vc-partner memos).
// Shared by the War Room mining loop, the idea-detail overlay, and tests.
// These implement the output contracts documented in skills/*/SKILL.md — keep
// them in lockstep with the templates there.

import type { Verdict } from "./types";

// ─── Idea parsing (futurist output) ─────────────────────────────────

export interface ParsedIdea {
  id: string;
  title: string;
  content: string;
}

export function parseIdeasFromText(text: string, batchNum: number): ParsedIdea[] {
  const ideas: ParsedIdea[] = [];
  const ts = Date.now();

  // Pattern matches: "## IDEA 1.1: Title" or "## IDEA 1: Title" or "### IDEA 1: Title"
  const ideaSections = text.split(/(?=##\s*IDEA\s+\d+[.:]\d*)/i).filter((s) => s.trim());

  for (const section of ideaSections) {
    const headerMatch = section.match(/##\s*IDEA\s+(\d+)[.:]\d*:?\s*(.+?)(?=\n)/i);
    if (headerMatch) {
      const title = headerMatch[2].trim().replace(/\*+$/, "").trim();
      if (title && !ideas.find((idea) => idea.title === title)) {
        ideas.push({
          id: `${batchNum}-${ideas.length + 1}-${ts}`,
          title,
          content: section.trim(),
        });
      }
    }
  }

  // Fallback: try alternative patterns if no ideas found
  if (ideas.length === 0) {
    const altSections = text.split(/(?=###?\s*\d+\.)/i).filter((s) => s.trim());
    for (const section of altSections) {
      const headerMatch = section.match(/###?\s*(\d+)\.\s*(.+?)(?=\n)/i);
      if (headerMatch) {
        const title = headerMatch[2].trim().replace(/\*+$/, "").trim();
        if (title && !ideas.find((idea) => idea.title === title)) {
          ideas.push({
            id: `${batchNum}-${ideas.length + 1}-${ts}`,
            title,
            content: section.trim(),
          });
        }
      }
    }
  }

  // Second fallback: look for "The Hook" pattern
  if (ideas.length === 0) {
    const hookPattern = /##\s*(.+?)\n([\s\S]*?)(?=##|$)/gi;
    let match;
    while ((match = hookPattern.exec(text)) !== null) {
      const fullSection = match[0];
      if (fullSection.includes("**The Hook**") || fullSection.includes("**Hook:**")) {
        const title = match[1].replace(/^IDEA\s*\d+[.:]\s*/i, "").trim();
        if (title && !ideas.find((idea) => idea.title === title)) {
          ideas.push({
            id: `${batchNum}-${ideas.length + 1}-${ts}`,
            title,
            content: fullSection.trim(),
          });
        }
      }
    }
  }

  return ideas;
}

// ─── Memo isolation (vc-partner output) ─────────────────────────────

// Mined idea IDs are `${batch}-${n}-${timestamp}`; the memo headers reference
// `IDEA batch.n`. Custom-idea IDs (`custom-...`) produce a key that never
// matches a header — those isolate via the title fallback instead.
export function ideaSectionKey(id: string): string {
  return id.split("-").slice(0, 2).join(".");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Returns the offset of the line on which this idea's memo starts, or -1.
function findSectionStart(text: string, id: string, title: string): number {
  const key = escapeRegex(ideaSectionKey(id));
  const candidates: RegExp[] = [
    new RegExp(`^[ \\t]*#{1,4}[ \\t]*[^\\n]*MEMO[^\\n]*IDEA[ \\t]+${key}\\b`, "mi"),
    new RegExp(`^[ \\t]*#{1,4}[ \\t]*[^\\n]*IDEA[ \\t]+${key}\\b`, "mi"),
    new RegExp(`^[ \\t]*\\*\\*[^\\n]*IDEA[ \\t]+${key}[^\\n]*\\*\\*`, "mi"),
    new RegExp(`\\bIDEA[ \\t]+${key}\\b`, "i"),
  ];
  for (const pat of candidates) {
    const m = text.match(pat);
    if (m && m.index !== undefined) {
      const before = text.slice(0, m.index);
      return before.lastIndexOf("\n") + 1;
    }
  }
  // Fallback: locate the memo by the idea's exact title.
  const titleIdx = title ? text.indexOf(title) : -1;
  if (titleIdx >= 0) {
    const before = text.slice(0, titleIdx);
    return before.lastIndexOf("\n") + 1;
  }
  return -1;
}

// Position-based section isolation: find where each idea's memo starts, sort
// by position, then slice between consecutive starts. Far more robust than
// split+find, which fails silently on non-standard headers.
export function sliceMemoSections(
  text: string,
  ideas: Array<{ id: string; title: string }>,
): Map<string, string> {
  const starts = ideas
    .map((idea) => ({ idea, start: findSectionStart(text, idea.id, idea.title) }))
    .filter((p) => p.start >= 0)
    .sort((a, b) => a.start - b.start);

  const sectionMap = new Map<string, string>();
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].start : text.length;
    sectionMap.set(starts[i].idea.id, text.slice(starts[i].start, end).trim());
  }
  return sectionMap;
}

// Render-time variant for a single idea: re-isolates this idea's memo from a
// possibly-bundled stored critique (corrects old contaminated persisted data).
// Returns the input unchanged when no section boundary can be found.
export function isolateMemoSection(raw: string, id: string, title = ""): string {
  if (!raw) return "";
  const startIdx = findSectionStart(raw, id, title);
  if (startIdx < 0) return raw;
  // Start next-memo search from the line AFTER our header to avoid re-matching self
  const firstNl = raw.indexOf("\n", startIdx);
  const searchFrom = firstNl >= 0 ? firstNl + 1 : startIdx + 1;
  const after = raw.slice(searchFrom);
  const nextMatch = after.match(/^[ \t]*(?:#{1,4}|\*\*)[ \t]*[^\n]*IDEA[ \t]+\d+\.\d+\b/mi);
  let endIdx = raw.length;
  if (nextMatch && nextMatch.index !== undefined) {
    endIdx = searchFrom + nextMatch.index;
  }
  return raw.slice(startIdx, endIdx).trim();
}

// ─── Field extraction ───────────────────────────────────────────────

// Captures the first line after a `**Field:**` label plus any following lines
// that don't start a new `**Field:**` header or `##` heading.
export function extractField(section: string, fieldName: string): string {
  const escaped = escapeRegex(fieldName);
  const pattern = new RegExp(
    `\\*\\*${escaped}:?\\*\\*\\s*([^\\n]+(?:\\n(?!\\s*(?:\\*\\*|#))[^\\n]*)*)`,
    "i",
  );
  const match = section.match(pattern);
  return match?.[1]?.trim().replace(/\*+/g, "").trim() ?? "";
}

const isSeparatorLine = (s: string) => /^[-*_=]{2,}\s*$/.test(s.trim());

// Returns the bullet items under a `**Field:**` label as individual strings.
// Bullet markers require a trailing space so `---`/`***` separators don't match.
export function extractBullets(section: string, fieldName: string): string[] {
  const escaped = escapeRegex(fieldName);
  const m = section.match(
    new RegExp(`\\*\\*${escaped}:?\\*\\*\\s*\\n?((?:\\s*[-*•][ \\t]+[^\\n]*\\n?)+)`, "i"),
  );
  if (!m?.[1]) {
    const flat = extractField(section, fieldName);
    return flat
      ? flat
          .split(/\n/)
          .map((l) => l.trim())
          .filter((l) => l && !isSeparatorLine(l))
      : [];
  }
  return m[1]
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s+/, "").replace(/\*+/g, "").trim())
    .filter((l) => l && !isSeparatorLine(l));
}

// Like extractBullets but preserved as one block (raw bullet markdown) — used
// where the UI renders the list itself.
export function extractBulletBlock(section: string, fieldName: string): string {
  const escaped = escapeRegex(fieldName);
  const m = section.match(
    new RegExp(`\\*\\*${escaped}:?\\*\\*\\s*\\n?((?:\\s*[-*•][^\\n]*\\n?)+)`, "i"),
  );
  if (m?.[1]) return m[1].trim();
  return extractField(section, fieldName);
}

export function parseScore(section: string, label: string): number {
  const escaped = escapeRegex(label);
  const m =
    section.match(new RegExp(`\\*\\*${escaped}[^*]*\\*\\*:?\\s*(\\d+)`, "i")) ||
    section.match(new RegExp(`${escaped}[^:\\n]*:?\\s*(\\d+)`, "i"));
  return m ? parseInt(m[1]) : 0;
}

export function parseScoreRationale(section: string, scoreLabel: string): string {
  const escaped = escapeRegex(scoreLabel);
  const line = section.match(new RegExp(`\\*\\*${escaped}:?\\*\\*\\s*\\d+[^\\n]*`, "i"))?.[0] ?? "";
  return line
    .replace(new RegExp(`\\*\\*${escaped}:?\\*\\*\\s*\\d+(?:/10)?`, "i"), "")
    .replace(/^\s*[—–\-:]\s*/, "")
    .trim();
}

export function parseVerdictValue(section: string): Verdict | undefined {
  const verdictLine = section.match(/\*\*Verdict:\*\*\s*([\w_]+)/i);
  const vv = verdictLine?.[1]?.toUpperCase().replace(/\s+/g, "_");
  if (vv === "STRONG_INVEST") return "STRONG_INVEST";
  if (vv === "INVEST") return "INVEST";
  if (vv === "SOFT_PASS") return "SOFT_PASS";
  if (vv === "STRONG_PASS") return "STRONG_PASS";

  // Defensive fallback when the bolded Verdict line is missing entirely.
  if (/strong[\s_]invest/i.test(section)) return "STRONG_INVEST";
  if (/\binvest\b/i.test(section)) return "INVEST";
  if (/soft[\s_]pass/i.test(section)) return "SOFT_PASS";
  if (/strong[\s_]pass|(?<!soft[\s_])\bpass\b/i.test(section)) return "STRONG_PASS";
  return undefined;
}

// ─── Full memo parsing ──────────────────────────────────────────────

export interface MemoScores {
  moat: number;
  founderFit: number;
  marketTiming: number;
  distributionEdge: number;
}

export interface MemoFields {
  verdict?: Verdict;
  critique: string;
  oneLiner: string;
  bullCase: string;
  bearCase: string;
  comparableCompanies: string;
  marketSizing: string;
  unitEconomics: string;
  hairOnFireCheck: string;
  distributionPlan: string;
  keyRisks: string;
  whatWouldChangeMind: string;
  verdictRationale: string;
  moatRationale: string;
  founderFitRationale: string;
  marketTimingRationale: string;
  distributionEdgeRationale: string;
  scores: MemoScores;
}

export function parseMemoFields(section: string): MemoFields {
  return {
    verdict: parseVerdictValue(section),
    critique: section,
    oneLiner: extractField(section, "One-Liner") || extractField(section, "One Liner"),
    bullCase: extractField(section, "Bull Case"),
    bearCase: extractField(section, "Bear Case"),
    comparableCompanies: extractField(section, "Comparable Companies"),
    marketSizing: extractField(section, "Market Sizing"),
    unitEconomics:
      extractField(section, "Unit Economics First-Cut") ||
      extractField(section, "Unit Economics"),
    hairOnFireCheck: extractField(section, "Hair-on-Fire Check"),
    distributionPlan: extractField(section, "Distribution Plan"),
    keyRisks: extractBulletBlock(section, "Key Risks"),
    whatWouldChangeMind: extractField(section, "What Would Change My Mind"),
    verdictRationale: extractField(section, "Verdict Rationale"),
    moatRationale: parseScoreRationale(section, "Moat Score"),
    founderFitRationale: parseScoreRationale(section, "Founder Fit Score"),
    marketTimingRationale: parseScoreRationale(section, "Market Timing Score"),
    distributionEdgeRationale: parseScoreRationale(section, "Distribution Edge Score"),
    scores: {
      moat: parseScore(section, "Moat Score"),
      founderFit: parseScore(section, "Founder Fit Score"),
      marketTiming: parseScore(section, "Market Timing Score"),
      distributionEdge: parseScore(section, "Distribution Edge Score"),
    },
  };
}

export function parseVerdicts<T extends { id: string; title: string }>(
  text: string,
  ideas: T[],
): (T & MemoFields)[] {
  const sectionMap = sliceMemoSections(text, ideas);
  return ideas.map((idea) => {
    const section = sectionMap.get(idea.id) ?? "";
    return { ...idea, ...parseMemoFields(section) };
  });
}
