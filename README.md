# Startup Idea Mining Rig

A Next.js app that autonomously identifies, validates, and specs startup ideas tailored to a specific founder's profile. Move through a guided pipeline — **Intake, Mine, Verify, Shape, Architect, Synthesize** — each phase invoking a domain-expert LLM skill.

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/walid-rizk/startup-ideas-mining-rig.git
cd startup-ideas-mining-rig
npm install
```

### 2. Add your API keys

Copy the example env file and add the key(s) for the provider you want to use. You only need the key(s) for the models you plan to select in the app — you don't need all three.

```bash
cp .env.example .env.local
```

Then open `.env.local` and fill in your key(s):

| Provider | Env Variable | Models | Get a Key |
|----------|-------------|--------|-----------|
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini 2.5 Flash, 2.5 Pro, 3.0 Flash, 3.1 Flash | [Google AI Studio](https://aistudio.google.com/apikey) |
| Anthropic | `ANTHROPIC_API_KEY` | Claude Sonnet 4.5, Haiku 4.5, Opus 4.6, Opus 4.7 | [Anthropic Console](https://console.anthropic.com/settings/keys) |
| OpenAI | `OPENAI_API_KEY` | GPT 5.4, 5.5 | [OpenAI Platform](https://platform.openai.com/api-keys) |

Your keys are stored locally in `.env.local`, which is gitignored and never leaves your machine.

### 3. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Select your preferred model from the toolbar dropdown, then start with Intake.

## How It Works

| Phase | What Happens |
|-------|-------------|
| **Intake** | Conversational interview extracts your founder profile, then distills it into a structured Founder Thesis |
| **Mine** | The Futurist generates 3 startup ideas per batch; the VC Partner writes investment memos and filters survivors |
| **Verify** | The Data Miner researches market size, competitors, and customer evidence for each survivor |
| **Shape** | The Product Manager produces a lean PRD with user journey, metrics, and launch checklist |
| **Architect** | The CTO creates a technical blueprint — stack, data model, API design, implementation phases |
| **Synthesize** | Rolls up all artifacts into an investor brief or build packet |

All session data is stored in your browser's localStorage. Use the toolbar to export/import sessions as JSON.

## Stack

- **Framework:** Next.js (App Router), React, TypeScript
- **LLM:** Vercel AI SDK with Anthropic, Google, and OpenAI providers
- **UI:** Tailwind CSS, shadcn/ui, Framer Motion
- **Persistence:** Browser localStorage (no backend database)
