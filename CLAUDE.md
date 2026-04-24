# Idea Mining Rig

A Next.js app that autonomously identifies, validates, and specs startup ideas tailored to a specific founder's profile. Users move through a guided pipeline — Intake → Thesis → Mine → Verify → Shape → Architect → Synthesize — each phase invoking a domain-expert LLM "skill."

## Stack
- **Framework:** Next.js 16 (App Router, Turbopack), React 19, TypeScript
- **LLM:** Vercel AI SDK with Anthropic (`claude-sonnet-4-5`, `claude-haiku-4-5`) and Google (`gemini-2.5-flash`, `gemini-2.5-pro`) providers. Selected per-session via `SessionToolbar`.
- **UI:** Tailwind + shadcn/ui, Framer Motion, lucide-react
- **Persistence:** Browser localStorage (Zod-validated) — no backend database.
- **Validation:** Zod schemas on session load/import

## Architecture

### Skills (`skills/<name>/SKILL.md`)
Each skill is a markdown file with YAML frontmatter and a system-prompt body. They are the "Board of Directors" — role, output contract, and tone all baked into the prompt.

| Skill | Phase | Role |
| --- | --- | --- |
| `interviewer` | intake | Extracts founder profile via conversational intake |
| `thesis-builder` | intake | Distills intake into a structured Founder Thesis |
| `futurist` | mine | Generates startup ideas (3 per batch) fitting Founder DNA |
| `vc-partner` | mine | Writes investment memos (verdict + memo structure) |
| `data-miner` | verify | Market research, TAM/SAM/SOM, competitor analysis |
| `stress-tester` | verify | Devil's advocate — finds strongest failure modes for an idea |
| `product-manager` | shape | Produces a lean PRD for a selected idea |
| `cto` | blueprint | Technical build plan (architecture, stack, milestones) |
| `synthesizer` | output | Rolls up all artifacts into investor brief or build packet |

Skills are loaded at runtime by `src/lib/skills.ts` (`loadSkill(name)`) — parsed with `gray-matter`, cached in-memory, and validated against `SkillName` types.

### Provider layer (`src/lib/providers.ts`)
- `streamSkill({ skill, model, userMessage|messages, temperature, maxTokens })` — central wrapper.
- Loads the skill's system prompt, resolves the model, and returns a streaming `Response` via `streamText().toAIStreamResponse()`.
- Throws `ProviderConfigError` → 400 JSON response when API keys are missing.

### Prompt builders (`src/lib/prompt-builders.ts`)
Pure functions that construct the user-message body for each skill invocation. Keep user-message assembly here; keep role/contract in the `SKILL.md`.

### API routes (`src/app/api/mining/*`)
Thin handlers — each parses input, calls its prompt builder, and delegates to `streamSkill()`.
- `/api/mining/intake` — conversational intake (multi-turn messages)
- `/api/mining/thesis` — build founder thesis
- `/api/mining/generate` — futurist ideas (batch)
- `/api/mining/critique` — vc-partner memos
- `/api/mining/verify` — data-miner market research
- `/api/mining/stress-test` — stress-tester adversarial analysis
- `/api/mining/shape` — product-manager PRD
- `/api/mining/blueprint` — cto technical plan
- `/api/mining/synthesize` — synthesizer final packet

### Session state (`src/lib/session-context.tsx`, `src/lib/session.ts`)
Single `Session` object in React context, debounced-persisted to localStorage (`idea-mining-rig.session.v1`). Shape (see `src/lib/types.ts`):
```ts
{ id, createdAt, updatedAt, founderContext, thesis, modelChoice,
  intakeMessages, survivors, allIdeas, verifications, stressTests, prds, blueprints, synthesis }
```
Survivors carry structured fields parsed from the vc-partner memo (`verdict`, `moatScore`, `founderFitScore`, `marketTimingScore`, `distributionEdgeScore`, `oneLiner`, `bullCase`, `bearCase`, `comparableCompanies`, `marketSizing`, `unitEconomics`, `keyRisks`, etc.). Parsing logic lives in `src/components/mining/war-room.tsx` (`parseVerdicts`).

### Scoring & Confidence Pipeline
Ideas accumulate structured signals across phases:
- **VC Partner (Mine):** verdict + 4-dimension scores (Moat, Founder Fit, Market Timing, Distribution Edge, each 1-10)
- **Data Miner (Verify):** **Market Confidence** rating (STRONG / MODERATE / WEAK / INSUFFICIENT) — emitted as the first line after the report title, parsed by `parseMarketConfidence()` in both `verify-session.tsx` and `page.tsx`
- **Stress Tester (Verify):** **Stress Severity** rating (CRITICAL / HIGH / MODERATE / LOW) — emitted as `**Overall: [LEVEL]**`, parsed by `parseStressSeverity()` in both `stress-test-session.tsx` and `page.tsx`
- **Dashboard (derived):** **Composite Health** (High Confidence / Promising / Caution / At Risk) — computed by `computeIdeaHealth()` in `page.tsx` from the average of available VC scores, adjusted by market confidence (STRONG: +1, MODERATE: 0, WEAK: -2, INSUFFICIENT: -0.5) and stress severity (CRITICAL: -3, HIGH: -1.5, MODERATE: -0.5, LOW: +0.5). Only displayed after at least one diligence phase completes.

### Pages
| Route | Component driver | Purpose |
| --- | --- | --- |
| `/` | inline | Dashboard — thesis headline, survivors with scores + health badges + clickable pipeline phases (deep-link to specific idea via `?idea=<id>`), next-step nudge |
| `/intake` | `IntakeSession` + inline | Multi-turn chat to build founder context; also hosts the Thesis generator and Chosen Thesis editor (combined phase) |
| `/mine` | `WarRoom` | Gauntlet loop: generate + critique until 4 survivors or 3 batches. Survivors panel has a draggable resize handle (persisted to localStorage) |
| `/verify` | `VerifySession` + `StressTestSession` | Per-survivor due diligence: market research (data-miner) + stress test (devil's advocate) in tabs |
| `/shape` | `ShapeSession` | Per-survivor PRD |
| `/blueprint` | `BlueprintSession` | Per-survivor technical plan (displayed as "Architect") |
| `/synthesize` | inline | Package session → investor brief / build packet |

## Mine Phase — The Gauntlet (critical loop)
Implemented in `src/components/mining/war-room.tsx`:
1. POST to `/api/mining/generate` with `{ userContext, batchNumber }` → futurist returns 3 ideas (`## IDEA N.1`, `## IDEA N.2`, `## IDEA N.3`).
2. POST to `/api/mining/critique` with those ideas → vc-partner returns memos (`## MEMO — IDEA N.M`) with structured fields.
3. `parseVerdicts()` extracts per-idea structured fields using position-based slicing between `IDEA N.M` markers (do not regress to split-based parsing — it broke field isolation).
4. Filter: keep `STRONG_INVEST` + `INVEST`, discard `SOFT_PASS` + `STRONG_PASS`.
5. Repeat until ≥4 survivors OR 3 batches completed.

## Conventions
- **Output format:** every skill emits markdown. The vc-partner memo contract is the most structured — do not break field names without updating `parseVerdicts` and `IdeaResult` types in lockstep. The data-miner emits a `**Market Confidence: LEVEL**` line as the first line after the title (parsed by UI). The stress-tester emits `**Overall: LEVEL**` (parsed by UI).
- **Deep linking:** phase pages (`/verify`, `/shape`, `/blueprint`) accept `?idea=<id>` query params to auto-select a survivor. The verify page also accepts `&tab=stress-test` to open directly to the stress test tab.
- **Streaming:** all LLM responses stream. Use `streamToText(res, setOutput)` from `src/lib/streaming.ts` on the client.
- **Model choice:** every API call accepts `modelChoice` in the body; routes fall back to `DEFAULT_MODEL` (Gemini 2.5 Flash).
- **No database:** all state in localStorage. Import/export via JSON in `SessionToolbar`.
- **Founder context:** lives in `session.founderContext` (string) in browser localStorage — generated by the intake phase, edited on `/intake`. No server-side file.

## Running Phases in the Terminal (Claude Code)

You can invoke any skill directly in this terminal to smoke-test output without the Next.js UI. When asked to run a phase:

1. **Read the skill file** at `skills/<name>/SKILL.md` — adopt its system prompt as your persona for this turn, and obey its Output Contract exactly.
2. **Founder context** — ask the user to paste their Founder Context (or export it from the app's `/intake` page). There's no on-disk context file; the app stores it in browser localStorage.
3. **Produce output in markdown** matching the skill's contract. Do NOT write it to a file unless the user asks — print inline so they can review.
4. **Don't freelance.** The `SKILL.md` is the source of truth for role, tone, and format. If there's a conflict between `SKILL.md` and this file, `SKILL.md` wins.

### Phase commands

| User says | You do |
| --- | --- |
| `run intake` | Act as `interviewer`. Ask 3–5 high-leverage questions. On answer, synthesize into a Founder Context using the `thesis-builder` contract. |
| `run thesis` | Act as `thesis-builder`. Given a Founder Context (pasted by user), output a structured Founder Thesis. |
| `run mine` | Act as `futurist` for 1 batch (3 ideas, `## IDEA N.1..N.3`), then `vc-partner` (memos with verdicts). Filter to STRONG_INVEST/INVEST. Loop up to 3 batches or 4 survivors. |
| `run spark` | Act as `futurist` for one batch. Output 3 ideas. No critique. |
| `run roast <ideas>` | Act as `vc-partner`. Critique the provided ideas per the memo contract. |
| `run verify <idea>` | Act as `data-miner`. Fact-check market size / competitors. Use WebSearch. |
| `run stress-test <idea>` | Act as `stress-tester`. Find the 3-5 strongest failure modes. |
| `run shape <idea>` | Act as `product-manager`. Output a lean PRD. |
| `run blueprint <idea>` | Act as `cto`. Output a walking-skeleton technical plan. |
| `run synthesize` | Act as `synthesizer`. Roll up session artifacts into investor brief or build packet (ask which). |

### Terminal-mode conventions
- **Inputs:** All inputs (founder context, ideas, verifications, PRDs, etc.) come from user messages. There is no on-disk scratch state — if the user references "the current survivors," ask them to paste.
- **Outputs:** Default to inline markdown. Only write files when explicitly requested.
- **Web search:** `data-miner` phase should use WebSearch for market claims and cite sources.

## When modifying skills
1. Edit `skills/<name>/SKILL.md` — frontmatter drives typing, body drives behavior.
2. If you change the output contract, update the corresponding parser (`parseVerdicts` for vc-partner, etc.) and `IdeaResult` fields in `src/lib/types.ts` + `src/lib/session.ts` (Zod schema).
3. If you add a new skill: add to `SkillName` union, add folder under `skills/`, add route under `src/app/api/mining/`, add page + session component if user-facing.

## When modifying session shape
Update in all three places or imports will break:
- `src/lib/types.ts` — TypeScript `Session` interface
- `src/lib/session.ts` — Zod `sessionSchema` (use `.default(...)` for new fields so old sessions still load)
- `src/lib/session-context.tsx` — only if context API changes
