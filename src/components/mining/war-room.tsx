'use client';

import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';
import {
  Lightbulb,
  Gavel,
  Trophy,
  Play,
  Square,
  Loader2,
  CheckCircle,
  XCircle,
  Sparkles,
  TrendingUp,
  ArrowRight,
  Search,
  PenLine,
  Trash2,
  Undo2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import type { ModelChoice, IdeaResult as PublicIdeaResult, Verdict } from '@/lib/types';
import { streamToText } from '@/lib/streaming';
import { renderMarkdownBlock } from '@/lib/markdown-render';

type MiningPhase = 'idle' | 'generating' | 'critiquing' | 'complete';

const VERDICT_CONFIG: Record<Verdict, { label: string; color: string; bgColor: string; survives: boolean; rank: number }> = {
  STRONG_INVEST: { label: 'Strong Invest', color: 'text-emerald-300', bgColor: 'bg-emerald-600', survives: true, rank: 1 },
  INVEST: { label: 'Invest', color: 'text-emerald-400', bgColor: 'bg-emerald-700', survives: true, rank: 2 },
  SOFT_PASS: { label: 'Soft Pass', color: 'text-amber-400', bgColor: 'bg-amber-700', survives: false, rank: 3 },
  STRONG_PASS: { label: 'Strong Pass', color: 'text-red-400', bgColor: 'bg-red-700', survives: false, rank: 4 },
};

interface IdeaResult {
  id: string;
  title: string;
  content: string;
  critique?: string;
  verdict?: Verdict;
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
  moatRationale?: string;
  founderFitRationale?: string;
  scores?: {
    moat: number;
    founderFit: number;
  };
}

interface WarRoomProps {
  userContext: string;
  modelChoice: ModelChoice;
  onComplete?: (survivors: PublicIdeaResult[], allIdeas: PublicIdeaResult[]) => void;
  onDiscard?: (idea: PublicIdeaResult) => void;
  onRestore?: (idea: PublicIdeaResult) => void;
  initialSurvivors?: PublicIdeaResult[];
  initialAllIdeas?: PublicIdeaResult[];
  discardedIdeas?: PublicIdeaResult[];
}

function fromPublicIdeas(ideas: PublicIdeaResult[]): IdeaResult[] {
  return ideas.map((idea) => {
    const parts = idea.rawMarkdown.split('\n\n---\n\n');
    return {
      id: idea.id,
      title: idea.title,
      content: parts[0] || idea.rawMarkdown,
      critique: parts.length > 1 ? parts.slice(1).join('\n\n---\n\n') : '',
      verdict: idea.verdict,
      oneLiner: idea.oneLiner,
      bullCase: idea.bullCase,
      bearCase: idea.bearCase,
      comparableCompanies: idea.comparableCompanies,
      marketSizing: idea.marketSizing,
      unitEconomics: idea.unitEconomics,
      hairOnFireCheck: idea.hairOnFireCheck,
      distributionPlan: idea.distributionPlan,
      keyRisks: idea.keyRisks,
      whatWouldChangeMind: idea.whatWouldChangeMind,
      verdictRationale: idea.verdictRationale,
      moatRationale: idea.moatRationale,
      founderFitRationale: idea.founderFitRationale,
      scores: {
        moat: idea.moatScore ?? 0,
        founderFit: idea.founderFitScore ?? 0,
      },
    };
  });
}

function toPublicIdeas(ideas: IdeaResult[]): PublicIdeaResult[] {
  return ideas.map((idea) => ({
    id: idea.id,
    title: idea.title,
    rawMarkdown: [idea.content, idea.critique ? `\n\n---\n\n${idea.critique}` : ''].join(''),
    batchNumber: Number(idea.id.split('-')[0]) || 1,
    verdict: idea.verdict,
    moatScore: idea.scores?.moat,
    founderFitScore: idea.scores?.founderFit,
    moatRationale: idea.moatRationale,
    founderFitRationale: idea.founderFitRationale,
    oneLiner: idea.oneLiner,
    bullCase: idea.bullCase,
    bearCase: idea.bearCase,
    comparableCompanies: idea.comparableCompanies,
    marketSizing: idea.marketSizing,
    unitEconomics: idea.unitEconomics,
    hairOnFireCheck: idea.hairOnFireCheck,
    distributionPlan: idea.distributionPlan,
    keyRisks: idea.keyRisks,
    whatWouldChangeMind: idea.whatWouldChangeMind,
    verdictRationale: idea.verdictRationale,
  }));
}

export default function WarRoom({ userContext, modelChoice, onComplete, onDiscard, onRestore, initialSurvivors, initialAllIdeas, discardedIdeas: externalDiscarded }: WarRoomProps) {
  const [phase, setPhase] = useState<MiningPhase>(() =>
    initialSurvivors && initialSurvivors.length > 0 ? 'complete' : 'idle'
  );
  const [currentBatch, setCurrentBatch] = useState(0);
  const [maxBatches] = useState(3);
  const [generatedIdeas, setGeneratedIdeas] = useState<string>('');
  const [critiqueOutput, setCritiqueOutput] = useState<string>('');
  const [survivors, setSurvivors] = useState<IdeaResult[]>(() =>
    initialSurvivors ? fromPublicIdeas(initialSurvivors) : []
  );
  const [allIdeas, setAllIdeas] = useState<IdeaResult[]>(() =>
    initialAllIdeas ? fromPublicIdeas(initialAllIdeas) : []
  );
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<IdeaResult | null>(null);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customIdea, setCustomIdea] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const targetSurvivors = 4;

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [generatedIdeas, critiqueOutput]);

  // Strip markdown formatting for clean display
  const stripMarkdown = (text: string): string => {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // Bold
      .replace(/\*([^*]+)\*/g, '$1')       // Italic
      .replace(/`([^`]+)`/g, '$1')         // Code
      .replace(/^#+\s*/gm, '')             // Headers
      .replace(/^\s*[-*]\s+/gm, '• ')      // List items
      .trim();
  };


  const parseIdeasFromText = (text: string, batchNum: number): IdeaResult[] => {
    const ideas: IdeaResult[] = [];

    // Split text by idea headers to capture full content
    // Pattern matches: "## IDEA 1.1: Title" or "## IDEA 1: Title" or "### IDEA 1: Title"
    const ideaSections = text.split(/(?=##\s*IDEA\s+\d+[\.:]\d*)/i).filter(s => s.trim());

    for (let i = 0; i < ideaSections.length; i++) {
      const section = ideaSections[i];

      // Extract title from the header
      const headerMatch = section.match(/##\s*IDEA\s+(\d+)[\.:]\d*:?\s*(.+?)(?=\n)/i);
      if (headerMatch) {
        const title = headerMatch[2].trim().replace(/\*+$/, '').trim();
        if (title && !ideas.find(idea => idea.title === title)) {
          ideas.push({
            id: `${batchNum}-${ideas.length + 1}`,
            title,
            content: section.trim(), // Capture full section content
          });
        }
      }
    }

    // Fallback: try alternative patterns if no ideas found
    if (ideas.length === 0) {
      const altSections = text.split(/(?=###?\s*\d+\.)/i).filter(s => s.trim());
      for (let i = 0; i < altSections.length; i++) {
        const section = altSections[i];
        const headerMatch = section.match(/###?\s*(\d+)\.\s*(.+?)(?=\n)/i);
        if (headerMatch) {
          const title = headerMatch[2].trim().replace(/\*+$/, '').trim();
          if (title && !ideas.find(idea => idea.title === title)) {
            ideas.push({
              id: `${batchNum}-${ideas.length + 1}`,
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
        if (fullSection.includes('**The Hook**') || fullSection.includes('**Hook:**')) {
          const title = match[1].replace(/^IDEA\s*\d+[\.:]\s*/i, '').trim();
          if (title && !ideas.find(idea => idea.title === title)) {
            ideas.push({
              id: `${batchNum}-${ideas.length + 1}`,
              title,
              content: fullSection.trim(),
            });
          }
        }
      }
    }

    console.log(`Parsed ${ideas.length} ideas from batch ${batchNum}:`, ideas.map(i => i.title));
    return ideas;
  };

  const parseVerdicts = (text: string, ideas: IdeaResult[]): IdeaResult[] => {
    // Position-based section isolation: find where each idea's memo starts
    // in the raw text, sort by position, then slice between consecutive starts.
    // This is far more robust than split+find, which fails silently when the
    // model uses a non-standard header (e.g. `### MEMO`, `**MEMO...**`, no `##`).
    const findIdeaStart = (idea: IdeaResult): number => {
      const batchDotN = idea.id.replace('-', '.');
      const escaped = batchDotN.replace('.', '\\.');
      const candidates: RegExp[] = [
        // Preferred: header line with MEMO + IDEA N.M
        new RegExp(`^[ \\t]*#{1,4}[ \\t]*[^\\n]*MEMO[^\\n]*IDEA[ \\t]+${escaped}\\b`, 'mi'),
        // Any header line with IDEA N.M
        new RegExp(`^[ \\t]*#{1,4}[ \\t]*[^\\n]*IDEA[ \\t]+${escaped}\\b`, 'mi'),
        // Bolded header variant: **MEMO — IDEA N.M...**
        new RegExp(`^[ \\t]*\\*\\*[^\\n]*IDEA[ \\t]+${escaped}[^\\n]*\\*\\*`, 'mi'),
        // Any occurrence of "IDEA N.M" as a fallback (line start preferred)
        new RegExp(`\\bIDEA[ \\t]+${escaped}\\b`, 'i'),
      ];
      for (const pat of candidates) {
        const m = text.match(pat);
        if (m && m.index !== undefined) {
          // Walk back to the start of that line
          const before = text.slice(0, m.index);
          const lastNl = before.lastIndexOf('\n');
          return lastNl + 1;
        }
      }
      // Final fallback: search by full title
      const titleIdx = text.indexOf(idea.title);
      if (titleIdx >= 0) {
        const before = text.slice(0, titleIdx);
        const lastNl = before.lastIndexOf('\n');
        return lastNl + 1;
      }
      return -1;
    };

    const starts = ideas
      .map((idea) => ({ idea, start: findIdeaStart(idea) }))
      .filter((p) => p.start >= 0)
      .sort((a, b) => a.start - b.start);

    const sectionMap = new Map<string, string>();
    for (let i = 0; i < starts.length; i++) {
      const end = i + 1 < starts.length ? starts[i + 1].start : text.length;
      sectionMap.set(starts[i].idea.id, text.slice(starts[i].start, end).trim());
    }

    // Extract a field value — stops at the next **Field:** line OR any ## header
    const extractField = (section: string, fieldName: string): string => {
      const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `\\*\\*${escaped}:?\\*\\*\\s*([^\\n]+(?:\\n(?!\\s*(?:\\*\\*|#))[^\\n]*)*)`,
        'i'
      );
      const match = section.match(pattern);
      return match?.[1]?.trim().replace(/\*+/g, '').trim() ?? '';
    };

    return ideas.map(idea => {
      const section = sectionMap.get(idea.id) ?? '';

      // Parse verdict from the **Verdict:** line (exact match preferred)
      let verdict: Verdict | undefined;
      const verdictLine = section.match(/\*\*Verdict:\*\*\s*([\w_]+)/i);
      const vv = verdictLine?.[1]?.toUpperCase().replace(/\s+/g, '_');
      if (vv === 'STRONG_INVEST') verdict = 'STRONG_INVEST';
      else if (vv === 'INVEST') verdict = 'INVEST';
      else if (vv === 'SOFT_PASS') verdict = 'SOFT_PASS';
      else if (vv === 'STRONG_PASS') verdict = 'STRONG_PASS';

      // Fallback verdict scan if line-level match failed
      if (!verdict) {
        if (/strong[\s_]invest/i.test(section)) verdict = 'STRONG_INVEST';
        else if (/\binvest\b/i.test(section)) verdict = 'INVEST';
        else if (/soft[\s_]pass/i.test(section)) verdict = 'SOFT_PASS';
        else if (/strong[\s_]pass|(?<!soft[\s_])\bpass\b/i.test(section)) verdict = 'STRONG_PASS';
      }

      // Parse scores
      const moatMatch = section.match(/\*\*Moat Score[^*]*\*\*:?\s*(\d+)/i)
        || section.match(/Moat Score[^:\n]*:?\s*(\d+)/i);
      const fitMatch = section.match(/\*\*Founder Fit Score[^*]*\*\*:?\s*(\d+)/i)
        || section.match(/Founder Fit Score[^:\n]*:?\s*(\d+)/i);

      // Extract score justifications (the " — [one-sentence]" trailing text)
      const parseScoreRationale = (scoreLabel: string): string => {
        const escaped = scoreLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const line = section.match(
          new RegExp(`\\*\\*${escaped}:?\\*\\*\\s*\\d+[^\\n]*`, 'i'),
        )?.[0] ?? '';
        // Strip "**Label:** 8/10" prefix, leaving just the rationale text after "—" or "-" or ":"
        const r = line
          .replace(new RegExp(`\\*\\*${escaped}:?\\*\\*\\s*\\d+(?:/10)?`, 'i'), '')
          .replace(/^\s*[—–\-:]\s*/, '')
          .trim();
        return r;
      };
      const moatRationale = parseScoreRationale('Moat Score');
      const founderFitRationale = parseScoreRationale('Founder Fit Score');

      // Extract bullet list fields (Key Risks) — capture until next **Field:** or ##
      const extractBulletList = (fieldName: string): string => {
        const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const m = section.match(
          new RegExp(
            `\\*\\*${escaped}:?\\*\\*\\s*\\n?((?:\\s*[-*•][^\\n]*\\n?)+)`,
            'i',
          ),
        );
        if (m?.[1]) return m[1].trim();
        // Fallback: treat as regular field if bullets missing
        return extractField(section, fieldName);
      };

      // Parse VC critique summary fields
      const oneLiner = extractField(section, 'One-Liner') || extractField(section, 'One Liner');
      const bullCase = extractField(section, 'Bull Case');
      const bearCase = extractField(section, 'Bear Case');
      const comparableCompanies = extractField(section, 'Comparable Companies');
      const marketSizing = extractField(section, 'Market Sizing');
      const unitEconomics =
        extractField(section, 'Unit Economics First-Cut') ||
        extractField(section, 'Unit Economics');
      const hairOnFireCheck = extractField(section, 'Hair-on-Fire Check');
      const distributionPlan = extractField(section, 'Distribution Plan');
      const keyRisks = extractBulletList('Key Risks');
      const whatWouldChangeMind =
        extractField(section, 'What Would Change My Mind') ||
        extractField(section, "What Would Change My Mind");
      const verdictRationale = extractField(section, 'Verdict Rationale');

      return {
        ...idea,
        verdict,
        critique: section,
        oneLiner,
        bullCase,
        bearCase,
        comparableCompanies,
        marketSizing,
        unitEconomics,
        hairOnFireCheck,
        distributionPlan,
        keyRisks,
        whatWouldChangeMind,
        verdictRationale,
        moatRationale,
        founderFitRationale,
        scores: {
          moat: moatMatch ? parseInt(moatMatch[1]) : 0,
          founderFit: fitMatch ? parseInt(fitMatch[1]) : 0,
        },
      };
    });
  };

  const runBatch = async (batchNumber: number): Promise<IdeaResult[]> => {
    // Phase 1: Generate ideas
    setPhase('generating');
    setGeneratedIdeas('');

    const generateResponse = await fetch('/api/mining/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userContext, batchNumber, modelChoice }),
      signal: abortControllerRef.current?.signal,
    });

    if (!generateResponse.ok) throw new Error('Failed to generate ideas');

    const ideasText = await streamToText(generateResponse, setGeneratedIdeas);
    const batchIdeas = parseIdeasFromText(ideasText, batchNumber);

    // Phase 2: Critique ideas
    setPhase('critiquing');
    setCritiqueOutput('');

    const critiqueResponse = await fetch('/api/mining/critique', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userContext, ideas: ideasText, modelChoice }),
      signal: abortControllerRef.current?.signal,
    });

    if (!critiqueResponse.ok) throw new Error('Failed to critique ideas');

    const critiqueText = await streamToText(critiqueResponse, setCritiqueOutput);
    return parseVerdicts(critiqueText, batchIdeas);
  };

  const startMining = async () => {
    setIsRunning(true);
    setError(null);
    setSurvivors([]);
    setAllIdeas([]);
    setCurrentBatch(0);
    abortControllerRef.current = new AbortController();

    try {
      let currentSurvivors: IdeaResult[] = [];
      let allBatchIdeas: IdeaResult[] = [];
      let batch = 1;

      while (batch <= maxBatches && currentSurvivors.length < targetSurvivors) {
        setCurrentBatch(batch);

        const batchResults = await runBatch(batch);

        // Update all ideas
        allBatchIdeas = [...allBatchIdeas, ...batchResults];
        setAllIdeas(prev => [...prev, ...batchResults]);

        // Filter survivors (only STRONG_INVEST and INVEST verdicts survive)
        const newSurvivors = batchResults.filter(
          idea => idea.verdict && VERDICT_CONFIG[idea.verdict]?.survives
        );

        // Add new survivors and sort by rank (STRONG_INVEST first, then INVEST)
        currentSurvivors = [...currentSurvivors, ...newSurvivors].sort((a, b) => {
          const rankA = a.verdict ? VERDICT_CONFIG[a.verdict].rank : 99;
          const rankB = b.verdict ? VERDICT_CONFIG[b.verdict].rank : 99;
          return rankA - rankB;
        });
        setSurvivors(currentSurvivors);

        // Check if we have enough survivors
        if (currentSurvivors.length >= targetSurvivors) {
          break;
        }

        batch++;
      }

      setPhase('complete');
      onComplete?.(toPublicIdeas(currentSurvivors), toPublicIdeas(allBatchIdeas));
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Mining stopped by user');
      } else {
        setError(err instanceof Error ? err.message : 'Mining failed');
      }
      setPhase('idle');
    } finally {
      setIsRunning(false);
    }
  };

  const stopMining = () => {
    abortControllerRef.current?.abort();
    setIsRunning(false);
    setPhase('idle');
  };

  const runCustomIdea = async () => {
    if (!customIdea.trim() || !userContext) return;
    setIsRunning(true);
    setError(null);
    setGeneratedIdeas('');
    setCritiqueOutput('');
    abortControllerRef.current = new AbortController();

    try {
      // Phase 1: Futurist develops the raw idea
      setPhase('generating');
      const devRes = await fetch('/api/mining/develop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userContext,
          seedIdea: customIdea,
          batchNumber: 0,
          modelChoice,
        }),
        signal: abortControllerRef.current.signal,
      });
      if (!devRes.ok) throw new Error('Failed to develop idea');
      const ideaText = await streamToText(devRes, setGeneratedIdeas);
      const framed = parseIdeasFromText(ideaText, 0);
      if (framed.length === 0) throw new Error('Could not parse developed idea');

      // Phase 2: VC Partner critiques
      setPhase('critiquing');
      const critRes = await fetch('/api/mining/critique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userContext, ideas: ideaText, modelChoice }),
        signal: abortControllerRef.current.signal,
      });
      if (!critRes.ok) throw new Error('Failed to critique idea');
      const critText = await streamToText(critRes, setCritiqueOutput);
      const withVerdicts = parseVerdicts(critText, framed);

      // Reassign unique IDs (batch 0 collides across submissions)
      const stamp = Date.now();
      const finalized = withVerdicts.map((i, idx) => ({
        ...i,
        id: `custom-${stamp}-${idx + 1}`,
      }));

      // Merge into state — survivors only if INVEST/STRONG_INVEST
      const newSurvivors = finalized.filter(
        (i) => i.verdict && VERDICT_CONFIG[i.verdict]?.survives,
      );
      const mergedSurvivors = [...survivors, ...newSurvivors].sort((a, b) => {
        const rankA = a.verdict ? VERDICT_CONFIG[a.verdict].rank : 99;
        const rankB = b.verdict ? VERDICT_CONFIG[b.verdict].rank : 99;
        return rankA - rankB;
      });
      const mergedAll = [...allIdeas, ...finalized];

      setSurvivors(mergedSurvivors);
      setAllIdeas(mergedAll);
      setPhase('complete');
      onComplete?.(toPublicIdeas(mergedSurvivors), toPublicIdeas(mergedAll));

      setCustomIdea('');
      setShowCustomInput(false);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Stopped by user');
      } else {
        setError(err instanceof Error ? err.message : 'Custom idea run failed');
      }
      setPhase('idle');
    } finally {
      setIsRunning(false);
    }
  };

  const [showDiscarded, setShowDiscarded] = useState(false);

  const handleDiscard = (idea: IdeaResult, e: React.MouseEvent) => {
    e.stopPropagation();
    setSurvivors((prev) => prev.filter((s) => s.id !== idea.id));
    setAllIdeas((prev) => prev.filter((s) => s.id !== idea.id));
    const pub = toPublicIdeas([idea])[0];
    onDiscard?.(pub);
  };

  const handleRestore = (pub: PublicIdeaResult) => {
    const idea = fromPublicIdeas([pub])[0];
    const isSurvivor = idea.verdict && VERDICT_CONFIG[idea.verdict]?.survives;
    if (isSurvivor) {
      setSurvivors((prev) => [...prev, idea].sort((a, b) => {
        const rankA = a.verdict ? VERDICT_CONFIG[a.verdict].rank : 99;
        const rankB = b.verdict ? VERDICT_CONFIG[b.verdict].rank : 99;
        return rankA - rankB;
      }));
    }
    setAllIdeas((prev) => [...prev, idea]);
    onRestore?.(pub);
  };

  const progress = ((currentBatch - 1) / maxBatches) * 100 +
    (phase === 'generating' ? 15 : phase === 'critiquing' ? 30 : 0);

  return (
    <Card className="w-full max-w-6xl mx-auto bg-zinc-950 border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="font-mono text-lg text-zinc-100">WAR_ROOM</h2>
              <p className="text-xs text-zinc-500 font-mono">PHASE MINE: THE GAUNTLET</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!isRunning && (
              <Button
                onClick={() => setShowCustomInput((v) => !v)}
                disabled={!userContext}
                variant="outline"
                className="font-mono border-zinc-700 text-zinc-300 hover:text-zinc-100"
              >
                <PenLine className="w-4 h-4 mr-2" />
                {showCustomInput ? 'Hide' : 'Your Idea'}
              </Button>
            )}
            {!isRunning ? (
              <Button
                onClick={startMining}
                disabled={!userContext}
                className="bg-red-600 hover:bg-red-700 text-white font-mono"
              >
                <Play className="w-4 h-4 mr-2" />
                START MINING
              </Button>
            ) : (
              <Button
                onClick={stopMining}
                variant="destructive"
                className="font-mono"
              >
                <Square className="w-4 h-4 mr-2" />
                STOP
              </Button>
            )}
          </div>
        </div>

        {/* Custom idea submission */}
        {showCustomInput && !isRunning && (
          <div className="mt-4 bg-zinc-950 border border-zinc-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <PenLine className="w-4 h-4 text-zinc-400" />
              <span className="font-mono text-sm text-zinc-300">
                Submit Your Own Idea
              </span>
              <span className="text-xs text-zinc-500 font-mono">
                — Futurist will frame it, VC Partner will critique it
              </span>
            </div>
            <Textarea
              value={customIdea}
              onChange={(e) => setCustomIdea(e.target.value)}
              placeholder="A sentence or a paragraph — problem, customer, rough wedge. The Futurist will develop it into the standard idea format."
              className="min-h-[100px] bg-zinc-900 border-zinc-700 text-zinc-300 font-mono text-sm mb-2"
            />
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setShowCustomInput(false);
                  setCustomIdea('');
                }}
                variant="ghost"
                className="text-zinc-400 font-mono"
              >
                Cancel
              </Button>
              <Button
                onClick={runCustomIdea}
                disabled={!customIdea.trim()}
                className="bg-red-600 hover:bg-red-700 text-white font-mono"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Frame &amp; Critique
              </Button>
            </div>
          </div>
        )}

        {/* Progress */}
        {isRunning && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-xs font-mono text-zinc-400">
              <span>Batch {currentBatch} of {maxBatches}</span>
              <span>{survivors.length} / {targetSurvivors} survivors</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800">
        {/* Futurist Panel */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className={`w-4 h-4 ${phase === 'generating' ? 'text-amber-400 animate-pulse' : 'text-zinc-500'}`} />
            <span className="font-mono text-sm text-zinc-300">FUTURIST</span>
            {phase === 'generating' && (
              <Badge variant="outline" className="text-amber-400 border-amber-400/50 text-xs">
                GENERATING
              </Badge>
            )}
          </div>
          <div
            ref={outputRef}
            className="h-[400px] overflow-y-auto bg-zinc-900/50 rounded-lg p-3 text-xs font-mono text-zinc-400 whitespace-pre-wrap"
          >
            {generatedIdeas || (
              <span className="text-zinc-600">Waiting to generate ideas...</span>
            )}
          </div>
        </div>

        {/* VC Partner Panel */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Gavel className={`w-4 h-4 ${phase === 'critiquing' ? 'text-green-400 animate-pulse' : 'text-zinc-500'}`} />
            <span className="font-mono text-sm text-zinc-300">VC PARTNER</span>
            {phase === 'critiquing' && (
              <Badge variant="outline" className="text-green-400 border-green-400/50 text-xs">
                CRITIQUING
              </Badge>
            )}
          </div>
          <div className="h-[400px] overflow-y-auto bg-zinc-900/50 rounded-lg p-3 text-xs font-mono text-zinc-400 whitespace-pre-wrap">
            {critiqueOutput || (
              <span className="text-zinc-600">Waiting for ideas to critique...</span>
            )}
          </div>
        </div>

        {/* Survivors Panel */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className={`w-4 h-4 ${survivors.length > 0 ? 'text-emerald-400' : 'text-zinc-500'}`} />
            <span className="font-mono text-sm text-zinc-300">SURVIVORS</span>
            <Badge variant="outline" className="text-emerald-400 border-emerald-400/50 text-xs">
              {survivors.length} / {targetSurvivors}
            </Badge>
          </div>
          <div className="h-[400px] overflow-y-auto space-y-2">
            <AnimatePresence>
              {survivors.map((idea, index) => {
                const config = idea.verdict ? VERDICT_CONFIG[idea.verdict] : null;
                const isStrongInvest = idea.verdict === 'STRONG_INVEST';
                return (
                  <motion.div
                    key={idea.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    onClick={() => setSelectedIdea(idea)}
                    className={`rounded-lg p-3 cursor-pointer transition-all hover:scale-[1.02] ${
                      isStrongInvest
                        ? 'bg-emerald-800/30 border-2 border-emerald-500/70 hover:border-emerald-400'
                        : 'bg-emerald-900/20 border border-emerald-800/50 hover:border-emerald-600'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <CheckCircle className={`w-4 h-4 shrink-0 ${isStrongInvest ? 'text-emerald-300' : 'text-emerald-400'}`} />
                          <span className={`font-mono text-sm ${isStrongInvest ? 'text-emerald-100 font-semibold' : 'text-emerald-100'}`}>
                            {idea.title}
                          </span>
                        </div>
                        {idea.scores && (idea.scores.moat > 0 || idea.scores.founderFit > 0) && (
                          <div className="flex gap-2 mt-1.5">
                            <ScoreChip label="Moat" score={idea.scores.moat} />
                            <ScoreChip label="Fit" score={idea.scores.founderFit} />
                          </div>
                        )}
                        {idea.oneLiner && (
                          <p className="mt-1.5 text-xs text-zinc-400 italic leading-snug line-clamp-2">
                            "{idea.oneLiner}"
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={`${config?.bgColor || 'bg-emerald-600'} text-white text-xs`}>
                          {config?.label || 'INVEST'}
                        </Badge>
                        <button
                          onClick={(e) => handleDiscard(idea, e)}
                          className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                          title="Discard idea"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-zinc-500 font-mono">Click for details →</div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Failed ideas (Soft Pass and Strong Pass) */}
            {allIdeas
              .filter(i => i.verdict && !VERDICT_CONFIG[i.verdict]?.survives)
              .map((idea) => {
                const config = idea.verdict ? VERDICT_CONFIG[idea.verdict] : null;
                const isSoftPass = idea.verdict === 'SOFT_PASS';
                return (
                  <div
                    key={idea.id}
                    onClick={() => setSelectedIdea(idea)}
                    className={`rounded-lg p-3 cursor-pointer transition-all hover:opacity-80 ${
                      isSoftPass
                        ? 'bg-amber-900/10 border border-amber-800/30 opacity-70'
                        : 'bg-zinc-900/50 border border-zinc-800 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <XCircle className={`w-4 h-4 ${config?.color || 'text-red-400'}`} />
                      <span className={`font-mono text-sm flex-1 ${isSoftPass ? 'text-zinc-400' : 'text-zinc-500 line-through'}`}>
                        {idea.title}
                      </span>
                      <Badge
                        variant="outline"
                        className={`${config?.color || 'text-red-400'} border-current/50 text-xs`}
                      >
                        {config?.label || 'PASS'}
                      </Badge>
                      <button
                        onClick={(e) => handleDiscard(idea, e)}
                        className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        title="Discard idea"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

            {survivors.length === 0 && !isRunning && phase !== 'complete' && (
              <div className="text-center text-zinc-600 text-sm font-mono py-8">
                No survivors yet.<br />Start mining to find winning ideas.
              </div>
            )}

            {/* Discarded pile */}
            {externalDiscarded && externalDiscarded.length > 0 && (
              <div className="mt-3 pt-3 border-t border-zinc-800">
                <button
                  onClick={() => setShowDiscarded((v) => !v)}
                  className="w-full flex items-center justify-between text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors py-1"
                >
                  <div className="flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Discarded ({externalDiscarded.length})</span>
                  </div>
                  {showDiscarded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showDiscarded && (
                  <div className="mt-2 space-y-1.5">
                    {externalDiscarded.map((idea) => (
                      <div
                        key={idea.id}
                        className="rounded-lg p-2.5 bg-zinc-900/30 border border-zinc-800/50 flex items-center gap-2 opacity-60"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                        <span className="font-mono text-xs text-zinc-500 flex-1 truncate line-through">
                          {idea.title}
                        </span>
                        <button
                          onClick={() => handleRestore(idea)}
                          className="p-1 rounded text-zinc-500 hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                          title="Restore idea"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      {(phase === 'complete' || error) && (
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/30">
          {error ? (
            <div className="text-red-400 font-mono text-sm">{error}</div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-mono text-sm">
                <TrendingUp className="w-4 h-4" />
                Mining complete! Found {survivors.length} investable ideas.
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={startMining}
                  variant="outline"
                  className="font-mono border-zinc-700"
                >
                  Run Another Round
                </Button>
                {survivors.length > 0 && (
                  <Link href="/verify">
                    <Button className="bg-yellow-600 hover:bg-yellow-700 text-white font-mono">
                      <Search className="w-4 h-4 mr-2" />
                      Verify
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Idea Detail — full-screen overlay with two-column layout */}
      <AnimatePresence>
        {selectedIdea && (
          <motion.div
            key="idea-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setSelectedIdea(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-6xl h-[90vh] bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="shrink-0 px-6 py-4 border-b border-zinc-800 bg-zinc-900/60 flex items-center gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {selectedIdea.verdict && VERDICT_CONFIG[selectedIdea.verdict]?.survives ? (
                    <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <h2 className="font-mono text-lg text-zinc-100 truncate">{selectedIdea.title}</h2>
                    {selectedIdea.verdict && (
                      <Badge className={`${VERDICT_CONFIG[selectedIdea.verdict]?.bgColor} text-white text-xs mt-0.5`}>
                        {VERDICT_CONFIG[selectedIdea.verdict]?.label}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Scores in header */}
                {selectedIdea.scores && (selectedIdea.scores.moat > 0 || selectedIdea.scores.founderFit > 0) && (
                  <div className="flex gap-3 shrink-0">
                    <div className="bg-zinc-800 rounded-lg px-4 py-2 text-center border border-zinc-700">
                      <div className="text-xs text-zinc-500 font-mono">MOAT</div>
                      <div className="text-xl font-bold text-zinc-100 leading-tight">
                        {selectedIdea.scores.moat}<span className="text-zinc-500 text-xs">/10</span>
                      </div>
                    </div>
                    <div className="bg-zinc-800 rounded-lg px-4 py-2 text-center border border-zinc-700">
                      <div className="text-xs text-zinc-500 font-mono">FIT</div>
                      <div className="text-xl font-bold text-zinc-100 leading-tight">
                        {selectedIdea.scores.founderFit}<span className="text-zinc-500 text-xs">/10</span>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setSelectedIdea(null)}
                  className="shrink-0 p-2 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Two-column body */}
              <div className="flex-1 flex overflow-hidden divide-x divide-zinc-800">

                {/* LEFT — Futurist Proposal */}
                <div className="w-1/2 overflow-y-auto p-6 space-y-3">
                  <div className="flex items-center gap-2 mb-4 sticky top-0 bg-zinc-950 pb-2">
                    <Lightbulb className="w-4 h-4 text-amber-400" />
                    <span className="font-mono text-sm text-zinc-300">FUTURIST PROPOSAL</span>
                  </div>
                  {(() => {
                    const content = selectedIdea.content || '';
                    const parseSection = (label: string): string => {
                      const patterns = [
                        new RegExp(`\\*\\*${label}:?\\*\\*\\s*([^*]+?)(?=\\*\\*|$)`, 'i'),
                        new RegExp(`${label}:?\\s*([^\\n]+)`, 'i'),
                      ];
                      for (const pattern of patterns) {
                        const match = content.match(pattern);
                        if (match) return match[1].trim();
                      }
                      return '';
                    };
                    const sections = [
                      { key: 'hook', label: 'The Hook', icon: '💡', color: 'text-amber-400', value: parseSection('The Hook') || parseSection('Hook') },
                      { key: 'whynow', label: 'Why Now', icon: '⚡', color: 'text-cyan-400', value: parseSection('Why Now') || parseSection('The "Why Now"') },
                      { key: 'problem', label: 'Problem', icon: '🎯', color: 'text-red-400', value: parseSection('Problem') },
                      { key: 'solution', label: 'Solution', icon: '✨', color: 'text-emerald-400', value: parseSection('Solution') },
                      { key: 'target', label: 'Target Customer', icon: '👥', color: 'text-blue-400', value: parseSection('Target Customer') || parseSection('Target') },
                      { key: 'revenue', label: 'Revenue Model', icon: '💰', color: 'text-yellow-400', value: parseSection('Revenue Model') || parseSection('Revenue') },
                      { key: 'advantage', label: 'Unfair Advantage', icon: '🛡️', color: 'text-purple-400', value: parseSection('Unfair Advantage') || parseSection('Competitive Advantage') },
                      { key: 'combinatorial', label: 'Combinatorial Angle', icon: '🔀', color: 'text-pink-400', value: parseSection('Combinatorial Angle') || parseSection('Combinatorial') },
                      { key: 'founder', label: 'Founder Fit', icon: '🤝', color: 'text-orange-400', value: parseSection('Founder Fit') },
                      { key: 'expansion', label: 'Expansion Path', icon: '📈', color: 'text-green-400', value: parseSection('Expansion Path') || parseSection('Expansion') },
                    ];
                    const foundSections = sections.filter(s => s.value);
                    if (foundSections.length === 0) {
                      return (
                        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                          <pre className="text-sm text-zinc-400 font-mono whitespace-pre-wrap">{content || 'No proposal content available.'}</pre>
                        </div>
                      );
                    }
                    return foundSections.map((section) => (
                      <div key={section.key} className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                        <div className={`text-xs font-mono ${section.color} mb-1 flex items-center gap-2`}>
                          <span>{section.icon}</span>
                          <span>{section.label.toUpperCase()}</span>
                        </div>
                        <p className="text-sm text-zinc-300 leading-relaxed">{stripMarkdown(section.value)}</p>
                      </div>
                    ));
                  })()}
                </div>

                {/* RIGHT — VC Critique */}
                <div className="w-1/2 overflow-y-auto p-6 space-y-3">
                  <div className="flex items-center gap-2 mb-4 sticky top-0 bg-zinc-950 pb-2">
                    <Gavel className="w-4 h-4 text-green-400" />
                    <span className="font-mono text-sm text-zinc-300">VC PARTNER CRITIQUE</span>
                  </div>

                  {(() => {
                    const s = selectedIdea;

                    // Always re-isolate + re-parse at render time so old contaminated
                    // persisted data (bundled critique, wrong stored fields) is corrected.
                    const isolateMyMemo = (raw: string): string => {
                      if (!raw) return '';
                      const batchDotN = s.id.replace('-', '.');
                      const esc = batchDotN.replace('.', '\\.');
                      const startPatterns = [
                        new RegExp(`^[ \\t]*#{1,4}[ \\t]*[^\\n]*MEMO[^\\n]*IDEA[ \\t]+${esc}\\b`, 'mi'),
                        new RegExp(`^[ \\t]*#{1,4}[ \\t]*[^\\n]*IDEA[ \\t]+${esc}\\b`, 'mi'),
                        new RegExp(`^[ \\t]*\\*\\*[^\\n]*IDEA[ \\t]+${esc}[^\\n]*\\*\\*`, 'mi'),
                        new RegExp(`\\bIDEA[ \\t]+${esc}\\b`, 'i'),
                      ];
                      let startIdx = -1;
                      for (const p of startPatterns) {
                        const m = raw.match(p);
                        if (m && m.index !== undefined) {
                          const before = raw.slice(0, m.index);
                          startIdx = before.lastIndexOf('\n') + 1;
                          break;
                        }
                      }
                      if (startIdx < 0) return raw;
                      // Start next-memo search from the line AFTER our header to avoid re-matching self
                      const firstNl = raw.indexOf('\n', startIdx);
                      const searchFrom = firstNl >= 0 ? firstNl + 1 : startIdx + 1;
                      const after = raw.slice(searchFrom);
                      const nextMatch = after.match(/^[ \t]*(?:#{1,4}|\*\*)[ \t]*[^\n]*IDEA[ \t]+\d+\.\d+\b/mi);
                      let endIdx = raw.length;
                      if (nextMatch && nextMatch.index !== undefined) {
                        endIdx = searchFrom + nextMatch.index;
                      }
                      return raw.slice(startIdx, endIdx).trim();
                    };

                    const memo = isolateMyMemo(s.critique || '');

                    // Re-extract every field from the isolated memo so we don't trust
                    // stored structured fields (which may carry old contamination).
                    const extractField = (section: string, fieldName: string): string => {
                      const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                      const pat = new RegExp(
                        `\\*\\*${escaped}:?\\*\\*\\s*([^\\n]+(?:\\n(?!\\s*(?:\\*\\*|#))[^\\n]*)*)`,
                        'i',
                      );
                      const m = section.match(pat);
                      return m?.[1]?.trim().replace(/\*+/g, '').trim() ?? '';
                    };
                    const extractBullets = (section: string, fieldName: string): string[] => {
                      const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                      const m = section.match(
                        new RegExp(`\\*\\*${escaped}:?\\*\\*\\s*\\n?((?:\\s*[-*•][^\\n]*\\n?)+)`, 'i'),
                      );
                      if (!m?.[1]) {
                        const flat = extractField(section, fieldName);
                        return flat
                          ? flat.split(/\n/).map((l) => l.trim()).filter(Boolean)
                          : [];
                      }
                      return m[1]
                        .split('\n')
                        .map((l) => l.replace(/^\s*[-*•]\s*/, '').replace(/\*+/g, '').trim())
                        .filter(Boolean);
                    };
                    const extractScoreRationale = (label: string): string => {
                      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                      const line = memo.match(
                        new RegExp(`\\*\\*${escaped}:?\\*\\*\\s*\\d+[^\\n]*`, 'i'),
                      )?.[0] ?? '';
                      return line
                        .replace(new RegExp(`\\*\\*${escaped}:?\\*\\*\\s*\\d+(?:/10)?`, 'i'), '')
                        .replace(/^\s*[—–\-:]\s*/, '')
                        .trim();
                    };

                    const oneLiner = extractField(memo, 'One-Liner') || extractField(memo, 'One Liner');
                    const bullCase = extractField(memo, 'Bull Case');
                    const bearCase = extractField(memo, 'Bear Case');
                    const comparableCompanies = extractField(memo, 'Comparable Companies');
                    const marketSizing = extractField(memo, 'Market Sizing');
                    const unitEconomics =
                      extractField(memo, 'Unit Economics First-Cut') ||
                      extractField(memo, 'Unit Economics');
                    const hairOnFireCheck = extractField(memo, 'Hair-on-Fire Check');
                    const distributionPlan = extractField(memo, 'Distribution Plan');
                    const keyRiskBullets = extractBullets(memo, 'Key Risks');
                    const whatWouldChangeMind = extractField(memo, 'What Would Change My Mind');
                    const verdictRationale = extractField(memo, 'Verdict Rationale');
                    const moatRationale = extractScoreRationale('Moat Score');
                    const founderFitRationale = extractScoreRationale('Founder Fit Score');

                    const cards: Array<{ key: string; label: string; icon: string; color: string; value: string; kind?: 'bullets' | 'quote' }> = [
                      { key: 'verdict', label: 'Verdict Rationale', icon: '⚖️', color: 'text-amber-400', value: verdictRationale },
                      { key: 'oneliner', label: 'One-Liner', icon: '💬', color: 'text-cyan-400', value: oneLiner, kind: 'quote' },
                      { key: 'bull', label: 'Bull Case', icon: '🐂', color: 'text-green-400', value: bullCase },
                      { key: 'bear', label: 'Bear Case', icon: '🐻', color: 'text-red-400', value: bearCase },
                      { key: 'comps', label: 'Comparable Companies', icon: '📊', color: 'text-indigo-400', value: comparableCompanies },
                      { key: 'sizing', label: 'Market Sizing (TAM / SAM / SOM)', icon: '🌍', color: 'text-emerald-400', value: marketSizing },
                      { key: 'unit', label: 'Unit Economics', icon: '💰', color: 'text-yellow-400', value: unitEconomics },
                      { key: 'hof', label: 'Hair-on-Fire Check', icon: '🔥', color: 'text-pink-400', value: hairOnFireCheck },
                      { key: 'dist', label: 'Distribution Plan', icon: '📡', color: 'text-blue-400', value: distributionPlan },
                      { key: 'change', label: 'What Would Change My Mind', icon: '🔄', color: 'text-cyan-400', value: whatWouldChangeMind },
                    ];

                    const found = cards.filter((c) => c.value);
                    const hasAnyCard = found.length > 0 || keyRiskBullets.length > 0;

                    if (!hasAnyCard) {
                      return (
                        <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                          {memo ? renderMarkdownBlock(memo) : (
                            <p className="text-sm text-zinc-500 italic">No critique available.</p>
                          )}
                        </div>
                      );
                    }

                    return (
                      <>
                        {/* Prominent scores row */}
                        {(s.scores?.moat ?? 0) > 0 || (s.scores?.founderFit ?? 0) > 0 ? (
                          <div className="grid grid-cols-2 gap-3 mb-1">
                            <ScoreTile label="Moat Score" score={s.scores?.moat ?? 0} rationale={moatRationale} icon="🛡️" />
                            <ScoreTile label="Founder Fit" score={s.scores?.founderFit ?? 0} rationale={founderFitRationale} icon="🤝" />
                          </div>
                        ) : null}
                        {found.map((c) => (
                          <div key={c.key} className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                            <div className={`text-xs font-mono ${c.color} mb-1 flex items-center gap-2`}>
                              <span>{c.icon}</span>
                              <span>{c.label.toUpperCase()}</span>
                            </div>
                            <p className="text-sm text-zinc-300 leading-relaxed">
                              {c.kind === 'quote' ? `"${stripMarkdown(c.value)}"` : stripMarkdown(c.value)}
                            </p>
                          </div>
                        ))}
                        {keyRiskBullets.length > 0 && (
                          <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                            <div className="text-xs font-mono text-rose-400 mb-1 flex items-center gap-2">
                              <span>⚠️</span><span>KEY RISKS</span>
                            </div>
                            <ul className="space-y-1 mt-1">
                              {keyRiskBullets.map((b, i) => (
                                <li key={i} className="text-sm text-zinc-300 leading-relaxed flex gap-2">
                                  <span className="text-rose-400 shrink-0">▸</span>
                                  <span>{stripMarkdown(b)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {memo && (
                          <details>
                            <summary className="text-xs font-mono text-zinc-500 cursor-pointer hover:text-zinc-300 py-2 select-none">
                              Full VC memo ▸
                            </summary>
                            <div className="mt-2 bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                              {renderMarkdownBlock(memo)}
                            </div>
                          </details>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function scoreColor(score: number): { text: string; bg: string; bar: string } {
  if (score >= 9) return { text: 'text-emerald-300', bg: 'bg-emerald-500/20', bar: 'bg-emerald-400' };
  if (score >= 7) return { text: 'text-green-300', bg: 'bg-green-500/20', bar: 'bg-green-400' };
  if (score >= 5) return { text: 'text-amber-300', bg: 'bg-amber-500/20', bar: 'bg-amber-400' };
  if (score >= 3) return { text: 'text-orange-300', bg: 'bg-orange-500/20', bar: 'bg-orange-400' };
  return { text: 'text-red-300', bg: 'bg-red-500/20', bar: 'bg-red-400' };
}

function ScoreChip({ label, score }: { label: string; score: number }) {
  const c = scoreColor(score);
  return (
    <div className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 ${c.bg}`}>
      <span className="text-[10px] font-mono text-zinc-400 uppercase">{label}</span>
      <span className={`text-sm font-bold font-mono leading-none ${c.text}`}>{score}</span>
      <span className="text-[10px] text-zinc-500 font-mono">/10</span>
    </div>
  );
}

function ScoreTile({
  label,
  score,
  rationale,
  icon,
}: {
  label: string;
  score: number;
  rationale: string;
  icon: string;
}) {
  const c = scoreColor(score);
  const pct = (score / 10) * 100;
  return (
    <div className={`rounded-lg p-4 border ${c.bg} border-zinc-800`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-mono text-zinc-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className={`text-3xl font-bold font-mono leading-none ${c.text}`}>{score}</span>
        <span className="text-sm text-zinc-500 font-mono">/10</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-zinc-800 mb-2">
        <div
          className={`h-full rounded-full ${c.bar} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {rationale && (
        <p className="text-xs text-zinc-400 leading-relaxed">{rationale}</p>
      )}
    </div>
  );
}
