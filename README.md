# Startup Idea Mining Rig

A Next.js app that autonomously identifies, validates, and specs startup ideas tailored to a specific founder's profile. Move through a guided pipeline (**Intake, Mine, Verify, Shape, Architect, Synthesize**), each phase invoking a domain-expert LLM skill.

## Why this exists

Most founder ideation is vibes-driven scrolling: read a few essays, jot down ideas, mostly forget them. The strongest ideas usually die because they never face a structured filter early enough.

This rig forces a generated idea through the same gauntlet a partner-stage VC would apply: a written investment memo with verdicts and 4-dimension scoring, then market research with cited sources, then an adversarial stress test, then a lean PRD and a technical blueprint. Each phase is an independent skill (markdown system prompt) calibrated for harshness: verdicts skew toward `PASS`, scores skew toward the bottleneck dimension, and ideas only survive when the founder actually has the unfair advantages to win.

It's for someone who wants to validate ideas quickly against their own profile, not for generic "give me 10 SaaS ideas" output.

<!-- Add a screenshot of the dashboard at docs/screenshot.png and uncomment:
![Dashboard](./docs/screenshot.png)
-->

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/walid-rizk/startup-ideas-mining-rig.git
cd startup-ideas-mining-rig
npm install
```

### 2. Add your API keys

Copy the example env file and add the key(s) for the provider you want to use. You only need the key(s) for the models you plan to select in the app. You don't need all three.

```bash
cp .env.example .env.local
```

Then open `.env.local` and fill in your key(s):

| Provider | Env Variable | Models | Get a Key |
|----------|-------------|--------|-----------|
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini 2.5 Flash, 2.5 Pro, 3.0 Flash, 3.0 Pro, 3.1 Flash | [Google AI Studio](https://aistudio.google.com/apikey) |
| Anthropic | `ANTHROPIC_API_KEY` | Claude Haiku 4.5, Sonnet 4.6, Opus 4.6, Opus 4.7, Opus 4.8, Fable 5 | [Anthropic Console](https://console.anthropic.com/settings/keys) |
| OpenAI | `OPENAI_API_KEY` | GPT 5.4 Mini, 5.4, 5.5 | [OpenAI Platform](https://platform.openai.com/api-keys) |

Your keys are stored locally in `.env.local`, which is gitignored and never leaves your machine.

### 3. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Select your preferred model from the toolbar dropdown, then start with Intake.

### Model selection matters

The quality of every phase (idea generation, VC critique, market research, stress testing, PRD, and blueprint) scales directly with model capability. Stronger models produce sharper ideas, more rigorous critiques, and more actionable deliverables. If you're doing a serious run, use the best model you have access to (e.g. Claude Opus over Haiku, Gemini Pro over Flash). You can always do exploratory runs with a cheaper model first, then re-run with a stronger one on ideas that survive.

## How It Works

| Phase | What Happens |
|-------|-------------|
| **Intake** | Conversational interview captures your background, win condition, and any thesis signals into a **Founder Context**. The Thesis Builder then proposes 2 candidate theses (Grounded Pick + Wild Card) for you to choose from |
| **Mine** | The Futurist generates 3 startup ideas per batch; the VC Partner writes investment memos with 4-dimension scoring (Moat, Founder Fit, Market Timing, Distribution Edge) and filters survivors. Max batches and target survivors are configurable (defaults: 3 batches, 4 survivors) |
| **Verify** | Two lenses per survivor: **Market Research** (Data Miner validates market size, competitors, customer evidence with **live web search** — Anthropic web_search, Google Search grounding, OpenAI Responses web_search; emits a Market Confidence rating and ends with a Sources section listing the URLs it actually consulted) and **Stress Test** (Devil's Advocate finds the strongest failure modes; emits a severity rating). A **Run all diligence** button batches both lenses across every survivor |
| **Shape** | The Product Manager produces a lean PRD with user journey, metrics, and launch checklist |
| **Architect** | The CTO creates a technical blueprint: stack, data model, API design, implementation phases |
| **Synthesize** | Rolls up all artifacts into an investor brief or build packet |

All session data is stored in your browser's IndexedDB. Use the toolbar to export/import sessions as JSON.

## Scoring

Ideas accumulate structured signals as they move through the pipeline:

| Signal | Source | Values |
|--------|--------|--------|
| **Verdict** | VC Partner (Mine) | STRONG_INVEST, INVEST, SOFT_PASS, STRONG_PASS |
| **4-Dimension Scores** | VC Partner (Mine) | Moat, Founder Fit, Market Timing, Distribution Edge (1-10 each) |
| **Market Confidence** | Data Miner (Verify) | STRONG, MODERATE, WEAK, INSUFFICIENT |
| **Stress Severity** | Stress Tester (Verify) | CRITICAL, HIGH, MODERATE, LOW |
| **Idea Score** | Dashboard (derived) | 0–10, evolves as phases complete |

The **Idea Score** is a composite 0–10 score displayed across all pages. The base is a weighted blend of the four VC dimension scores (`0.7 × mean + 0.3 × min`) so a single catastrophic dimension drags the score down rather than getting averaged out. Diligence phases then shift the score: Market Confidence (STRONG: +1.5, MODERATE: 0, WEAK: -2, INSUFFICIENT: -0.5), Stress Severity (LOW: +0.5, MODERATE: 0, HIGH: -1.5, CRITICAL: -3). Until *both* diligence phases (research + stress test) have run, the score is shown with a `~` prefix and `EST` label to flag it as preliminary; once both complete, the validated score appears in color (emerald 8+, cyan 6–7.9, amber 4–5.9, red <4).

The dashboard sorts survivors by Idea Score (best first). Per-phase pages (Verify, Shape, Architect, Synthesize) sort by phase progress first (more phases completed = higher rank), then by Idea Score as a tiebreaker, so you always know what to work on next.

## Privacy

The app has no backend database. Everything you generate (your Founder Context, ideas, memos, market research, PRDs, blueprints) lives in your browser's IndexedDB. The only network calls are to your selected LLM provider (Google, Anthropic, or OpenAI) using your own API key.

That means your founder profile and any idea-level prompts *are* sent to that provider as part of normal model calls. If your profile contains material you don't want shared with a third-party LLM, redact it before pasting into Intake. The app never logs or persists your data outside of your browser.

## Stack

- **Framework:** Next.js (App Router), React, TypeScript
- **LLM:** Vercel AI SDK with Anthropic, Google, and OpenAI providers
- **UI:** Tailwind CSS, shadcn/ui, Framer Motion
- **Persistence:** Browser IndexedDB (no backend database)

## License

MIT, see [LICENSE](LICENSE).
