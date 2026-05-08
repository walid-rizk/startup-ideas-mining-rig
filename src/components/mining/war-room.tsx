'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
  Pin,
  PinOff,
  ArrowUpCircle,
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import type { ModelChoice, IdeaResult as PublicIdeaResult, Verdict } from '@/lib/types';
import { streamToText } from '@/lib/streaming';
import { renderMarkdownBlock } from '@/lib/markdown-render';
import { useMiningStatus, setMiningStatus, setMiningAbort, getMiningAbort, getMiningStatus, useMiningOutput, setMiningOutput } from '@/lib/mining-status';

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
  pinned?: boolean;
  promoted?: boolean;
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
  marketTimingRationale?: string;
  distributionEdgeRationale?: string;
  scores?: {
    moat: number;
    founderFit: number;
    marketTiming: number;
    distributionEdge: number;
  };
}

interface WarRoomProps {
  userContext: string;
  modelChoice: ModelChoice;
  onComplete?: (survivors: PublicIdeaResult[], allIdeas: PublicIdeaResult[]) => void;
  onBatchComplete?: (survivors: PublicIdeaResult[], allIdeas: PublicIdeaResult[]) => void;
  onDiscard?: (idea: PublicIdeaResult) => void;
  onRestore?: (idea: PublicIdeaResult) => void;
  onDeletePermanently?: (idea: PublicIdeaResult) => void;
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
      pinned: idea.pinned ?? false,
      promoted: idea.promoted ?? false,
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
      marketTimingRationale: idea.marketTimingRationale,
      distributionEdgeRationale: idea.distributionEdgeRationale,
      scores: {
        moat: idea.moatScore ?? 0,
        founderFit: idea.founderFitScore ?? 0,
        marketTiming: idea.marketTimingScore ?? 0,
        distributionEdge: idea.distributionEdgeScore ?? 0,
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
    pinned: idea.pinned ?? false,
    promoted: idea.promoted ?? false,
    moatScore: idea.scores?.moat,
    founderFitScore: idea.scores?.founderFit,
    marketTimingScore: idea.scores?.marketTiming,
    distributionEdgeScore: idea.scores?.distributionEdge,
    moatRationale: idea.moatRationale,
    founderFitRationale: idea.founderFitRationale,
    marketTimingRationale: idea.marketTimingRationale,
    distributionEdgeRationale: idea.distributionEdgeRationale,
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

// Extract the batch number from an idea ID. Mined ideas use `${batch}-${n}-${ts}`
// so the prefix is the batch (1, 2, 3, ...). Custom ideas use `custom-${ts}-${n}` —
// those return NaN and are filtered out by callers.
function batchFromId(id: string): number {
  const n = Number(id.split('-')[0]);
  return Number.isFinite(n) ? n : NaN;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // Bold
    .replace(/\*([^*]+)\*/g, '$1')       // Italic
    .replace(/`([^`]+)`/g, '$1')         // Code
    .replace(/^#+\s*/gm, '')             // Headers
    .replace(/^\s*[-*]\s+/gm, '• ')      // List items
    .trim();
}

function parseIdeasFromText(text: string, batchNum: number): IdeaResult[] {
  const ideas: IdeaResult[] = [];
  const ts = Date.now();

  // Pattern matches: "## IDEA 1.1: Title" or "## IDEA 1: Title" or "### IDEA 1: Title"
  const ideaSections = text.split(/(?=##\s*IDEA\s+\d+[\.:]\d*)/i).filter(s => s.trim());

  for (let i = 0; i < ideaSections.length; i++) {
    const section = ideaSections[i];
    const headerMatch = section.match(/##\s*IDEA\s+(\d+)[\.:]\d*:?\s*(.+?)(?=\n)/i);
    if (headerMatch) {
      const title = headerMatch[2].trim().replace(/\*+$/, '').trim();
      if (title && !ideas.find(idea => idea.title === title)) {
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
    const altSections = text.split(/(?=###?\s*\d+\.)/i).filter(s => s.trim());
    for (let i = 0; i < altSections.length; i++) {
      const section = altSections[i];
      const headerMatch = section.match(/###?\s*(\d+)\.\s*(.+?)(?=\n)/i);
      if (headerMatch) {
        const title = headerMatch[2].trim().replace(/\*+$/, '').trim();
        if (title && !ideas.find(idea => idea.title === title)) {
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
      if (fullSection.includes('**The Hook**') || fullSection.includes('**Hook:**')) {
        const title = match[1].replace(/^IDEA\s*\d+[\.:]\s*/i, '').trim();
        if (title && !ideas.find(idea => idea.title === title)) {
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

function parseVerdicts(text: string, ideas: IdeaResult[]): IdeaResult[] {
  // Position-based section isolation: find where each idea's memo starts
  // in the raw text, sort by position, then slice between consecutive starts.
  // This is far more robust than split+find, which fails silently when the
  // model uses a non-standard header (e.g. `### MEMO`, `**MEMO...**`, no `##`).
  const findIdeaStart = (idea: IdeaResult): number => {
    const batchDotN = idea.id.replace('-', '.');
    const escaped = batchDotN.replace('.', '\\.');
    const candidates: RegExp[] = [
      new RegExp(`^[ \\t]*#{1,4}[ \\t]*[^\\n]*MEMO[^\\n]*IDEA[ \\t]+${escaped}\\b`, 'mi'),
      new RegExp(`^[ \\t]*#{1,4}[ \\t]*[^\\n]*IDEA[ \\t]+${escaped}\\b`, 'mi'),
      new RegExp(`^[ \\t]*\\*\\*[^\\n]*IDEA[ \\t]+${escaped}[^\\n]*\\*\\*`, 'mi'),
      new RegExp(`\\bIDEA[ \\t]+${escaped}\\b`, 'i'),
    ];
    for (const pat of candidates) {
      const m = text.match(pat);
      if (m && m.index !== undefined) {
        const before = text.slice(0, m.index);
        const lastNl = before.lastIndexOf('\n');
        return lastNl + 1;
      }
    }
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

    let verdict: Verdict | undefined;
    const verdictLine = section.match(/\*\*Verdict:\*\*\s*([\w_]+)/i);
    const vv = verdictLine?.[1]?.toUpperCase().replace(/\s+/g, '_');
    if (vv === 'STRONG_INVEST') verdict = 'STRONG_INVEST';
    else if (vv === 'INVEST') verdict = 'INVEST';
    else if (vv === 'SOFT_PASS') verdict = 'SOFT_PASS';
    else if (vv === 'STRONG_PASS') verdict = 'STRONG_PASS';

    if (!verdict) {
      if (/strong[\s_]invest/i.test(section)) verdict = 'STRONG_INVEST';
      else if (/\binvest\b/i.test(section)) verdict = 'INVEST';
      else if (/soft[\s_]pass/i.test(section)) verdict = 'SOFT_PASS';
      else if (/strong[\s_]pass|(?<!soft[\s_])\bpass\b/i.test(section)) verdict = 'STRONG_PASS';
    }

    const parseScore = (label: string): number => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = section.match(new RegExp(`\\*\\*${escaped}[^*]*\\*\\*:?\\s*(\\d+)`, 'i'))
        || section.match(new RegExp(`${escaped}[^:\\n]*:?\\s*(\\d+)`, 'i'));
      return m ? parseInt(m[1]) : 0;
    };
    const moatVal = parseScore('Moat Score');
    const fitVal = parseScore('Founder Fit Score');
    const timingVal = parseScore('Market Timing Score');
    const distVal = parseScore('Distribution Edge Score');

    const parseScoreRationale = (scoreLabel: string): string => {
      const escaped = scoreLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const line = section.match(
        new RegExp(`\\*\\*${escaped}:?\\*\\*\\s*\\d+[^\\n]*`, 'i'),
      )?.[0] ?? '';
      const r = line
        .replace(new RegExp(`\\*\\*${escaped}:?\\*\\*\\s*\\d+(?:/10)?`, 'i'), '')
        .replace(/^\s*[—–\-:]\s*/, '')
        .trim();
      return r;
    };
    const moatRationale = parseScoreRationale('Moat Score');
    const founderFitRationale = parseScoreRationale('Founder Fit Score');
    const marketTimingRationale = parseScoreRationale('Market Timing Score');
    const distributionEdgeRationale = parseScoreRationale('Distribution Edge Score');

    const extractBulletList = (fieldName: string): string => {
      const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = section.match(
        new RegExp(
          `\\*\\*${escaped}:?\\*\\*\\s*\\n?((?:\\s*[-*•][^\\n]*\\n?)+)`,
          'i',
        ),
      );
      if (m?.[1]) return m[1].trim();
      return extractField(section, fieldName);
    };

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
      marketTimingRationale,
      distributionEdgeRationale,
      scores: {
        moat: moatVal,
        founderFit: fitVal,
        marketTiming: timingVal,
        distributionEdge: distVal,
      },
    };
  });
}

export default function WarRoom({ userContext, modelChoice, onComplete, onBatchComplete, onDiscard, onRestore, onDeletePermanently, initialSurvivors, initialAllIdeas, discardedIdeas: externalDiscarded }: WarRoomProps) {
  const [phase, setPhase] = useState<MiningPhase>(() => {
    const g = getMiningStatus();
    if (g.isRunning) return g.phase;
    return initialSurvivors && initialSurvivors.length > 0 ? 'complete' : 'idle';
  });
  const [currentBatch, setCurrentBatch] = useState(() => getMiningStatus().currentBatch);
  const [maxBatches, setMaxBatches] = useState(3);
  const [survivors, setSurvivors] = useState<IdeaResult[]>(() =>
    initialSurvivors ? fromPublicIdeas(initialSurvivors).sort((a, b) => {
      const rankA = a.verdict ? VERDICT_CONFIG[a.verdict].rank : 99;
      const rankB = b.verdict ? VERDICT_CONFIG[b.verdict].rank : 99;
      return rankA - rankB;
    }) : []
  );
  const [allIdeas, setAllIdeas] = useState<IdeaResult[]>(() =>
    initialAllIdeas ? fromPublicIdeas(initialAllIdeas) : []
  );
  const [isRunning, setIsRunning] = useState(() => getMiningStatus().isRunning);

  // Streaming text and error live in a global store so they persist across navigations
  const miningOutput = useMiningOutput();
  const generatedIdeas = miningOutput.generatedIdeas;
  const critiqueOutput = miningOutput.critiqueOutput;
  const error = miningOutput.error;
  const [selectedIdea, setSelectedIdea] = useState<IdeaResult | null>(null);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customIdea, setCustomIdea] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const critiqueRef = useRef<HTMLDivElement>(null);
  const ownRunRef = useRef(false);
  const priorSurvivorCountRef = useRef(0);
  const globalMining = useMiningStatus();

  // Refs that shadow React state so async mining functions always see the
  // latest survivors/allIdeas (including mid-batch promotions, pins, discards).
  const survivorsRef = useRef(survivors);
  survivorsRef.current = survivors;
  const allIdeasRef = useRef(allIdeas);
  allIdeasRef.current = allIdeas;

  const [isDesktop, setIsDesktop] = useState(false);
  const [survivorsPct, setSurvivorsPctRaw] = useState(() => {
    if (typeof window === 'undefined') return 33.33;
    const saved = localStorage.getItem('mining-rig.survivors-pct');
    return saved ? parseFloat(saved) : 33.33;
  });
  const setSurvivorsPct = useCallback((v: number | ((prev: number) => number)) => {
    setSurvivorsPctRaw((prev) => {
      const next = typeof v === 'function' ? v(prev) : v;
      localStorage.setItem('mining-rig.survivors-pct', String(next));
      return next;
    });
  }, []);
  const dragRef = useRef<{ startX: number; startPct: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startPct: survivorsPct };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
      const dx = dragRef.current.startX - ev.clientX;
      const dPct = (dx / containerWidth) * 100;
      const newPct = Math.min(60, Math.max(33.33, dragRef.current.startPct + dPct));
      setSurvivorsPct(newPct);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [survivorsPct]);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const [targetSurvivors, setTargetSurvivors] = useState(4);

  const resyncFromProps = useCallback(() => {
    setSurvivors(initialSurvivors ? fromPublicIdeas(initialSurvivors).sort((a, b) => {
      const rankA = a.verdict ? VERDICT_CONFIG[a.verdict].rank : 99;
      const rankB = b.verdict ? VERDICT_CONFIG[b.verdict].rank : 99;
      return rankA - rankB;
    }) : []);
    setAllIdeas(initialAllIdeas ? fromPublicIdeas(initialAllIdeas) : []);
    setPhase(initialSurvivors && initialSurvivors.length > 0 ? 'complete' : 'idle');
    setMiningOutput({ generatedIdeas: '', critiqueOutput: '', error: null });
    setIsRunning(false);
  }, [initialSurvivors, initialAllIdeas]);

  // Sync local state from global store when an external run is in progress
  useEffect(() => {
    if (globalMining.isRunning && !ownRunRef.current) {
      setPhase(globalMining.phase);
      setCurrentBatch(globalMining.currentBatch);
      setIsRunning(true);
    }
  }, [globalMining.isRunning, globalMining.phase, globalMining.currentBatch]);

  const prevRunningRef = useRef(globalMining.isRunning);
  useEffect(() => {
    if (prevRunningRef.current && !globalMining.isRunning && !ownRunRef.current) {
      resyncFromProps();
    }
    prevRunningRef.current = globalMining.isRunning;
  }, [globalMining.isRunning, resyncFromProps]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [generatedIdeas]);

  useEffect(() => {
    if (critiqueRef.current) {
      critiqueRef.current.scrollTop = critiqueRef.current.scrollHeight;
    }
  }, [critiqueOutput]);

  const runBatch = async (batchNumber: number, priorIdeas?: string[]): Promise<IdeaResult[]> => {
    setPhase('generating');
    setMiningStatus({ phase: 'generating' });
    setMiningOutput({ generatedIdeas: '' });

    const generateResponse = await fetch('/api/mining/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userContext, batchNumber, modelChoice, priorIdeas }),
      signal: abortControllerRef.current?.signal,
    });

    if (!generateResponse.ok) throw new Error('Failed to generate ideas');

    const ideasText = await streamToText(generateResponse, (text) => setMiningOutput({ generatedIdeas: text }));
    const batchIdeas = parseIdeasFromText(ideasText, batchNumber);

    setPhase('critiquing');
    setMiningStatus({ phase: 'critiquing' });
    setMiningOutput({ critiqueOutput: '' });

    const critiqueResponse = await fetch('/api/mining/critique', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userContext, ideas: ideasText, modelChoice }),
      signal: abortControllerRef.current?.signal,
    });

    if (!critiqueResponse.ok) throw new Error('Failed to critique ideas');

    const critiqueText = await streamToText(critiqueResponse, (text) => setMiningOutput({ critiqueOutput: text }));
    return parseVerdicts(critiqueText, batchIdeas);
  };

  const startMining = async () => {
    if (globalMining.isRunning) return;

    ownRunRef.current = true;
    setIsRunning(true);
    setMiningOutput({ generatedIdeas: '', critiqueOutput: '', error: null });
    setCurrentBatch(0);
    setPhase('generating');
    abortControllerRef.current = new AbortController();
    setMiningAbort(abortControllerRef.current);
    setMiningStatus({ isRunning: true, phase: 'generating', currentBatch: 0 });

    try {
      const discardedTitles = (externalDiscarded ?? []).map(i => i.title).filter(Boolean);
      const priorSurvivorCount = survivorsRef.current.length;
      priorSurvivorCountRef.current = priorSurvivorCount;

      // Continue batch numbering across mining runs so IDEA labels (1.1, 1.2, ...)
      // don't collide with prior runs. Look at every idea ever generated (kept or
      // discarded) and start one above the highest seen.
      const seenBatches = [
        ...allIdeasRef.current.map(i => batchFromId(i.id)),
        ...(externalDiscarded ?? []).map(i => batchFromId(i.id)),
      ].filter((n) => Number.isFinite(n) && n > 0);
      const startBatch = (seenBatches.length > 0 ? Math.max(...seenBatches) : 0) + 1;
      let batch = startBatch;
      let batchInRun = 1;

      while (batchInRun <= maxBatches && (survivorsRef.current.length - priorSurvivorCount) < targetSurvivors) {
        setCurrentBatch(batchInRun);
        setMiningStatus({ currentBatch: batchInRun });

        const priorTitles = [
          ...discardedTitles,
          ...allIdeasRef.current.map(i => i.title).filter(Boolean),
        ];
        const batchResults = await runBatch(batch, priorTitles.length > 0 ? priorTitles : undefined);

        // Merge with CURRENT state (includes any mid-batch promotions/pins)
        const mergedAll = [...allIdeasRef.current, ...batchResults];
        setAllIdeas(mergedAll);
        allIdeasRef.current = mergedAll;

        const newSurvivors = batchResults.filter(
          idea => idea.verdict && VERDICT_CONFIG[idea.verdict]?.survives
        );

        const mergedSurvivors = [...survivorsRef.current, ...newSurvivors].sort((a, b) => {
          const rankA = a.verdict ? VERDICT_CONFIG[a.verdict].rank : 99;
          const rankB = b.verdict ? VERDICT_CONFIG[b.verdict].rank : 99;
          return rankA - rankB;
        });
        setSurvivors(mergedSurvivors);
        survivorsRef.current = mergedSurvivors;

        onBatchComplete?.(toPublicIdeas(mergedSurvivors), toPublicIdeas(mergedAll));

        if ((mergedSurvivors.length - priorSurvivorCount) >= targetSurvivors) {
          break;
        }

        batch++;
        batchInRun++;
      }

      setPhase('complete');
      setMiningStatus({ isRunning: false, phase: 'complete' });
      setMiningAbort(null);
      ownRunRef.current = false;
      onComplete?.(toPublicIdeas(survivorsRef.current), toPublicIdeas(allIdeasRef.current));
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setMiningOutput({ error: 'Mining stopped by user' });
      } else {
        setMiningOutput({ error: err instanceof Error ? err.message : 'Mining failed' });
      }
      setPhase('idle');
      setMiningStatus({ isRunning: false, phase: 'idle' });
      setMiningAbort(null);
      ownRunRef.current = false;
    } finally {
      setIsRunning(false);
    }
  };

  const stopMining = () => {
    const ac = getMiningAbort() ?? abortControllerRef.current;
    ac?.abort();
    setIsRunning(false);
    setPhase('idle');
    setMiningStatus({ isRunning: false, phase: 'idle' });
    setMiningAbort(null);
    ownRunRef.current = false;
  };

  const runCustomIdea = async () => {
    if (!customIdea.trim() || !userContext || globalMining.isRunning) return;
    ownRunRef.current = true;
    setIsRunning(true);
    setMiningOutput({ generatedIdeas: '', critiqueOutput: '', error: null });
    abortControllerRef.current = new AbortController();
    setMiningAbort(abortControllerRef.current);
    setMiningStatus({ isRunning: true, phase: 'generating', currentBatch: 0 });

    // Continuous numbering for user-submitted ideas: extract the second number
    // from each existing custom idea's `## IDEA 0.N:` header and pick max + 1.
    const customMarkdowns = [
      ...allIdeasRef.current.filter((i) => i.id.startsWith('custom-')).map((i) => i.content),
      ...(externalDiscarded ?? []).filter((i) => i.id.startsWith('custom-')).map((i) => i.rawMarkdown),
    ];
    const seenSeedIndices = customMarkdowns
      .map((md) => {
        const m = md.match(/##\s*IDEA\s+0[.:](\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => Number.isFinite(n) && n > 0);
    const seedIndex = (seenSeedIndices.length > 0 ? Math.max(...seenSeedIndices) : 0) + 1;

    try {
      setPhase('generating');
      const devRes = await fetch('/api/mining/develop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userContext,
          seedIdea: customIdea,
          batchNumber: 0,
          seedIndex,
          modelChoice,
        }),
        signal: abortControllerRef.current.signal,
      });
      if (!devRes.ok) throw new Error('Failed to develop idea');
      const ideaText = await streamToText(devRes, (text) => setMiningOutput({ generatedIdeas: text }));
      const framed = parseIdeasFromText(ideaText, 0);
      if (framed.length === 0) throw new Error('Could not parse developed idea');

      setPhase('critiquing');
      setMiningStatus({ phase: 'critiquing' });
      const critRes = await fetch('/api/mining/critique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userContext, ideas: ideaText, modelChoice }),
        signal: abortControllerRef.current.signal,
      });
      if (!critRes.ok) throw new Error('Failed to critique idea');
      const critText = await streamToText(critRes, (text) => setMiningOutput({ critiqueOutput: text }));
      const withVerdicts = parseVerdicts(critText, framed);

      const stamp = Date.now();
      const finalized = withVerdicts.map((i, idx) => ({
        ...i,
        id: `custom-${stamp}-${idx + 1}`,
        pinned: true,
      }));

      const newSurvivors = finalized.filter(
        (i) => i.verdict && VERDICT_CONFIG[i.verdict]?.survives,
      );
      const mergedSurvivors = [...survivorsRef.current, ...newSurvivors].sort((a, b) => {
        const rankA = a.verdict ? VERDICT_CONFIG[a.verdict].rank : 99;
        const rankB = b.verdict ? VERDICT_CONFIG[b.verdict].rank : 99;
        return rankA - rankB;
      });
      const mergedAll = [...allIdeasRef.current, ...finalized];

      setSurvivors(mergedSurvivors);
      survivorsRef.current = mergedSurvivors;
      setAllIdeas(mergedAll);
      allIdeasRef.current = mergedAll;
      setPhase('complete');
      setMiningStatus({ isRunning: false, phase: 'complete' });
      setMiningAbort(null);
      ownRunRef.current = false;
      onComplete?.(toPublicIdeas(mergedSurvivors), toPublicIdeas(mergedAll));

      setCustomIdea('');
      setShowCustomInput(false);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setMiningOutput({ error: 'Stopped by user' });
      } else {
        setMiningOutput({ error: err instanceof Error ? err.message : 'Custom idea run failed' });
      }
      setPhase('idle');
      setMiningStatus({ isRunning: false, phase: 'idle' });
      setMiningAbort(null);
      ownRunRef.current = false;
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

  const handleTogglePin = (idea: IdeaResult, e: React.MouseEvent) => {
    e.stopPropagation();
    const toggle = (s: IdeaResult) => (s.id === idea.id ? { ...s, pinned: !s.pinned } : s);
    const nextSurvivors = survivorsRef.current.map(toggle);
    const nextAll = allIdeasRef.current.map(toggle);
    survivorsRef.current = nextSurvivors;
    allIdeasRef.current = nextAll;
    setSurvivors(nextSurvivors);
    setAllIdeas(nextAll);
    onComplete?.(toPublicIdeas(nextSurvivors), toPublicIdeas(nextAll));
  };

  const sortByRank = (list: IdeaResult[]) =>
    [...list].sort((a, b) => {
      const rankA = a.verdict ? VERDICT_CONFIG[a.verdict].rank : 99;
      const rankB = b.verdict ? VERDICT_CONFIG[b.verdict].rank : 99;
      return rankA - rankB;
    });

  const handlePromote = (idea: IdeaResult, e: React.MouseEvent) => {
    e.stopPropagation();
    const promoted = { ...idea, promoted: true };
    const nextAll = allIdeasRef.current.map((i) => (i.id === idea.id ? promoted : i));
    const nextSurvivors = sortByRank([...survivorsRef.current, promoted]);
    survivorsRef.current = nextSurvivors;
    allIdeasRef.current = nextAll;
    setSurvivors(nextSurvivors);
    setAllIdeas(nextAll);
    onComplete?.(toPublicIdeas(nextSurvivors), toPublicIdeas(nextAll));
  };

  const handleDemote = (idea: IdeaResult, e: React.MouseEvent) => {
    e.stopPropagation();
    const demoted = { ...idea, promoted: false };
    const nextAll = allIdeasRef.current.map((i) => (i.id === idea.id ? demoted : i));
    const nextSurvivors = survivorsRef.current.filter((s) => s.id !== idea.id);
    survivorsRef.current = nextSurvivors;
    allIdeasRef.current = nextAll;
    setSurvivors(nextSurvivors);
    setAllIdeas(nextAll);
    onComplete?.(toPublicIdeas(nextSurvivors), toPublicIdeas(nextAll));
  };

  const handleRestore = (pub: PublicIdeaResult) => {
    const idea = fromPublicIdeas([pub])[0];
    const isSurvivor = (idea.verdict && VERDICT_CONFIG[idea.verdict]?.survives) || idea.promoted;
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
            {!isRunning && !globalMining.isRunning && (
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
            {isRunning || globalMining.isRunning ? (
              <Button
                onClick={stopMining}
                variant="destructive"
                className="font-mono"
              >
                <Square className="w-4 h-4 mr-2" />
                STOP
              </Button>
            ) : (
              <Button
                onClick={startMining}
                disabled={!userContext}
                className="bg-red-600 hover:bg-red-700 text-white font-mono"
              >
                <Play className="w-4 h-4 mr-2" />
                START MINING
              </Button>
            )}
          </div>
        </div>

        {/* Mining settings — only show when survivors already exist (subsequent runs) */}
        {!isRunning && !globalMining.isRunning && survivors.length > 0 && (
          <div className="flex flex-col items-end gap-1 mt-1.5 px-4 text-[11px] font-mono text-zinc-600">
            <label className="flex items-center gap-1.5">
              <span>batches</span>
              <select
                value={maxBatches}
                onChange={(e) => setMaxBatches(Number(e.target.value))}
                className="bg-transparent border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-500 focus:outline-none focus:border-zinc-600 appearance-none text-center w-10 cursor-pointer hover:border-zinc-600"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n} className="bg-zinc-900">{n}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span>max new survivors</span>
              <select
                value={targetSurvivors}
                onChange={(e) => setTargetSurvivors(Number(e.target.value))}
                className="bg-transparent border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-500 focus:outline-none focus:border-zinc-600 appearance-none text-center w-10 cursor-pointer hover:border-zinc-600"
              >
                {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                  <option key={n} value={n} className="bg-zinc-900">{n}</option>
                ))}
              </select>
            </label>
          </div>
        )}

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
              <span>{survivors.length - priorSurvivorCountRef.current} / {targetSurvivors} max new survivors</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}
      </div>

      {/* Main Content */}
      <div ref={containerRef} className="flex flex-col lg:flex-row divide-y lg:divide-y-0 divide-zinc-800">
        {/* Futurist Panel */}
        <div className="p-4 border-r border-zinc-800 overflow-hidden" style={{ width: isDesktop ? `${(100 - survivorsPct) / 2}%` : undefined }}>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className={`w-4 h-4 shrink-0 ${phase === 'generating' ? 'text-amber-400 animate-pulse' : 'text-zinc-500'}`} />
            <span className="font-mono text-sm text-zinc-300 whitespace-nowrap">FUTURIST</span>
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
        <div className="p-4 border-r border-zinc-800 overflow-hidden" style={{ width: isDesktop ? `${(100 - survivorsPct) / 2}%` : undefined }}>
          <div className="flex items-center gap-2 mb-3">
            <Gavel className={`w-4 h-4 shrink-0 ${phase === 'critiquing' ? 'text-green-400 animate-pulse' : 'text-zinc-500'}`} />
            <span className="font-mono text-sm text-zinc-300 whitespace-nowrap">VC PARTNER</span>
            {phase === 'critiquing' && (
              <Badge variant="outline" className="text-green-400 border-green-400/50 text-xs">
                CRITIQUING
              </Badge>
            )}
          </div>
          <div ref={critiqueRef} className="h-[400px] overflow-y-auto bg-zinc-900/50 rounded-lg p-3 text-xs font-mono text-zinc-400 whitespace-pre-wrap">
            {critiqueOutput || (
              <span className="text-zinc-600">Waiting for ideas to critique...</span>
            )}
          </div>
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={startDrag}
          className="hidden lg:flex w-1.5 cursor-col-resize items-center justify-center hover:bg-zinc-700/50 active:bg-zinc-600/50 transition-colors shrink-0 group"
          title="Drag to resize"
        >
          <div className="w-0.5 h-8 bg-zinc-700 rounded-full group-hover:bg-zinc-500 transition-colors" />
        </div>

        {/* Survivors Panel */}
        <div className="p-4 overflow-hidden" style={{ width: isDesktop ? `${survivorsPct}%` : undefined }}>
          <div className="flex items-center gap-2 mb-3">
            <Trophy className={`w-4 h-4 ${survivors.length > 0 ? 'text-emerald-400' : 'text-zinc-500'}`} />
            <span className="font-mono text-sm text-zinc-300">SURVIVORS</span>
            <Badge variant="outline" className="text-emerald-400 border-emerald-400/50 text-xs">
              {survivors.length}
            </Badge>
            {(survivors.length > 0 || allIdeas.length > 0) && !isRunning && (
              <button
                onClick={() => {
                  const unpinnedSurvivors = survivors.filter(s => !s.pinned);
                  const pinned = survivors.filter(s => s.pinned);
                  const pinnedIds = new Set(pinned.map(s => s.id));
                  const nonSurvivorCount = allIdeas.filter(i => !survivors.some(s => s.id === i.id)).length;
                  const clearCount = unpinnedSurvivors.length + nonSurvivorCount;
                  if (clearCount === 0) return;
                  const parts: string[] = [];
                  if (unpinnedSurvivors.length > 0) parts.push(`${unpinnedSurvivors.length} unpinned survivor${unpinnedSurvivors.length === 1 ? '' : 's'} to the discard pile`);
                  if (nonSurvivorCount > 0) parts.push(`${nonSurvivorCount} non-survivor idea${nonSurvivorCount === 1 ? '' : 's'}`);
                  const msg = pinned.length > 0
                    ? `This will clear ${parts.join(' and ')}. ${pinned.length} pinned idea${pinned.length === 1 ? '' : 's'} will be kept. Continue?`
                    : `This will clear ${parts.join(' and ')}. Are you sure?`;
                  if (!window.confirm(msg)) return;
                  const allToDiscard = allIdeas.filter(i => !pinnedIds.has(i.id));
                  for (const idea of allToDiscard) {
                    onDiscard?.(toPublicIdeas([idea])[0]);
                  }
                  setSurvivors(pinned);
                  setAllIdeas(prev => prev.filter(i => pinnedIds.has(i.id)));
                }}
                className="ml-auto p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Clear all ideas (pinned survivors are kept)"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="h-[400px] overflow-y-auto space-y-2">
            <AnimatePresence>
              {survivors.map((idea, index) => {
                const config = idea.verdict ? VERDICT_CONFIG[idea.verdict] : null;
                const isStrongInvest = idea.verdict === 'STRONG_INVEST';
                const isPromoted = idea.verdict === 'SOFT_PASS';
                return (
                  <motion.div
                    key={idea.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    onClick={() => setSelectedIdea(idea)}
                    className={`rounded-lg p-3 cursor-pointer transition-all hover:scale-[1.02] ${
                      isPromoted
                        ? 'bg-amber-900/15 border border-amber-700/50 hover:border-amber-500'
                        : isStrongInvest
                          ? 'bg-emerald-800/30 border-2 border-emerald-500/70 hover:border-emerald-400'
                          : 'bg-emerald-900/20 border border-emerald-800/50 hover:border-emerald-600'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <CheckCircle className={`w-4 h-4 shrink-0 ${isPromoted ? 'text-amber-400' : isStrongInvest ? 'text-emerald-300' : 'text-emerald-400'}`} />
                          <span className={`font-mono text-sm ${isPromoted ? 'text-amber-100' : isStrongInvest ? 'text-emerald-100 font-semibold' : 'text-emerald-100'}`}>
                            {idea.title}
                          </span>
                        </div>
                        {idea.scores && (idea.scores.moat > 0 || idea.scores.founderFit > 0) && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            <ScoreChip label="Moat" score={idea.scores.moat} />
                            <ScoreChip label="Fit" score={idea.scores.founderFit} />
                            {idea.scores.marketTiming > 0 && <ScoreChip label="Timing" score={idea.scores.marketTiming} />}
                            {idea.scores.distributionEdge > 0 && <ScoreChip label="Distro" score={idea.scores.distributionEdge} />}
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
                        {isPromoted ? (
                          <button
                            onClick={(e) => handleDemote(idea, e)}
                            className="p-1 rounded text-zinc-600 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                            title="Demote — return to soft pass"
                          >
                            <ArrowUpCircle className="w-3.5 h-3.5 rotate-180" />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => handleTogglePin(idea, e)}
                            className={`p-1 rounded transition-colors ${
                              idea.pinned
                                ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10'
                                : 'text-zinc-600 hover:text-amber-400 hover:bg-amber-400/10'
                            }`}
                            title={idea.pinned ? 'Unpin — will be wiped on next Start Mining' : 'Pin — preserve across Start Mining runs'}
                          >
                            {idea.pinned ? <Pin className="w-3.5 h-3.5 fill-current" /> : <Pin className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDiscard(idea, e)}
                          className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                          title="Discard idea"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-zinc-500 font-mono">
                      {isPromoted ? 'Founder override — promoted from Soft Pass · ' : idea.pinned ? '📌 Pinned — survives re-mining · ' : ''}Click for details →
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Failed ideas (Soft Pass and Strong Pass) — exclude promoted */}
            {allIdeas
              .filter(i => i.verdict && !VERDICT_CONFIG[i.verdict]?.survives && !survivors.some(s => s.id === i.id))
              .sort((a, b) => {
                const rankA = a.verdict ? VERDICT_CONFIG[a.verdict].rank : 99;
                const rankB = b.verdict ? VERDICT_CONFIG[b.verdict].rank : 99;
                return rankA - rankB;
              })
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
                      {isSoftPass && (
                        <button
                          onClick={(e) => handlePromote(idea, e)}
                          className="p-1 rounded text-zinc-600 hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors"
                          title="Promote to survivor — override the VC and proceed with this idea"
                        >
                          <ArrowUpCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
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
                        <button
                          onClick={() => {
                            if (confirm(`Permanently delete "${idea.title}"? This cannot be undone.`)) {
                              onDeletePermanently?.(idea);
                            }
                          }}
                          className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                          title="Delete permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
      {(phase === 'complete' || error) && !globalMining.isRunning && (
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/30">
          {error ? (
            <div className="text-red-400 font-mono text-sm">{error}</div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-emerald-400 font-mono text-sm">
                  <TrendingUp className="w-4 h-4" />
                  Mining complete! Found {survivors.length} investable ideas.
                </div>
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
                    <Button variant="outline" className="font-mono text-sm border-yellow-500/40 text-yellow-400 hover:text-yellow-300 hover:border-yellow-400 hover:bg-yellow-500/10">
                      <Search className="w-4 h-4 mr-2" />
                      Next: Verify
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
                  {selectedIdea.verdict && (VERDICT_CONFIG[selectedIdea.verdict]?.survives || selectedIdea.promoted) ? (
                    <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <h2 className="font-mono text-lg text-zinc-100">{selectedIdea.title}</h2>
                    {selectedIdea.verdict && (
                      <Badge className={`${VERDICT_CONFIG[selectedIdea.verdict]?.bgColor} text-white text-xs mt-0.5`}>
                        {VERDICT_CONFIG[selectedIdea.verdict]?.label}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Scores in header */}
                {selectedIdea.scores && (selectedIdea.scores.moat > 0 || selectedIdea.scores.founderFit > 0) && (
                  <div className="flex gap-2 shrink-0">
                    <div className="bg-zinc-800 rounded-lg px-3 py-2 text-center border border-zinc-700">
                      <div className="text-[10px] text-zinc-500 font-mono">MOAT</div>
                      <div className="text-lg font-bold text-zinc-100 leading-tight">
                        {selectedIdea.scores.moat}<span className="text-zinc-500 text-[10px]">/10</span>
                      </div>
                    </div>
                    <div className="bg-zinc-800 rounded-lg px-3 py-2 text-center border border-zinc-700">
                      <div className="text-[10px] text-zinc-500 font-mono">FIT</div>
                      <div className="text-lg font-bold text-zinc-100 leading-tight">
                        {selectedIdea.scores.founderFit}<span className="text-zinc-500 text-[10px]">/10</span>
                      </div>
                    </div>
                    {(selectedIdea.scores.marketTiming ?? 0) > 0 && (
                      <div className="bg-zinc-800 rounded-lg px-3 py-2 text-center border border-zinc-700">
                        <div className="text-[10px] text-zinc-500 font-mono">TIMING</div>
                        <div className="text-lg font-bold text-zinc-100 leading-tight">
                          {selectedIdea.scores.marketTiming}<span className="text-zinc-500 text-[10px]">/10</span>
                        </div>
                      </div>
                    )}
                    {(selectedIdea.scores.distributionEdge ?? 0) > 0 && (
                      <div className="bg-zinc-800 rounded-lg px-3 py-2 text-center border border-zinc-700">
                        <div className="text-[10px] text-zinc-500 font-mono">DISTRO</div>
                        <div className="text-lg font-bold text-zinc-100 leading-tight">
                          {selectedIdea.scores.distributionEdge}<span className="text-zinc-500 text-[10px]">/10</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selectedIdea.verdict && (VERDICT_CONFIG[selectedIdea.verdict]?.survives || selectedIdea.promoted) && (
                  <Link
                    href={`/verify?idea=${selectedIdea.id}`}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors text-xs font-mono"
                  >
                    <Search className="w-3.5 h-3.5" />
                    VERIFY
                  </Link>
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
                    // Robust field extractor: captures the first line after the label + any
                    // following lines that don't start with a new `**Field:**` header or `##`.
                    // Handles optional "The " prefix and optional surrounding quotes (e.g.
                    // `**The "Why Now":**`), and strips residual `":` / `:` artifacts that
                    // leak through when the model wraps the label in quotes.
                    const parseSection = (label: string): string => {
                      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                      const primary = new RegExp(
                        `\\*\\*(?:The\\s+)?["']?${escaped}["']?:?\\*\\*\\s*([^\\n]+(?:\\n(?!\\s*(?:\\*\\*|#))[^\\n]*)*)`,
                        'i',
                      );
                      // Fallback: anchored at line start so it doesn't match "Why Now" inside
                      // another label like **The "Why Now":**.
                      const fallback = new RegExp(
                        `(?:^|\\n)\\s*(?:The\\s+)?["']?${escaped}["']?:?\\s*([^\\n]+)`,
                        'i',
                      );
                      const m = content.match(primary) ?? content.match(fallback);
                      const raw = m?.[1]?.trim().replace(/\*+/g, '').trim() ?? '';
                      // Defensive: strip any leading quote/colon/punctuation that leaked through
                      return raw.replace(/^["'`:]+\s*/, '').trim();
                    };
                    const sections = [
                      { key: 'hook', label: 'The Hook', icon: '💡', color: 'text-amber-400', value: parseSection('The Hook') || parseSection('Hook') },
                      { key: 'whynow', label: 'Why Now', icon: '⚡', color: 'text-cyan-400', value: parseSection('Why Now') },
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
                      <HeadlineCard key={section.key} card={section} />
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
                      // Require at least one space after the bullet marker so we don't match
                      // horizontal rules (`---`) or `***` separators as bullets.
                      const m = section.match(
                        new RegExp(`\\*\\*${escaped}:?\\*\\*\\s*\\n?((?:\\s*[-*•][ \\t]+[^\\n]*\\n?)+)`, 'i'),
                      );
                      const isSeparator = (s: string) => /^[-*_=]{2,}\s*$/.test(s.trim());
                      if (!m?.[1]) {
                        const flat = extractField(section, fieldName);
                        return flat
                          ? flat
                              .split(/\n/)
                              .map((l) => l.trim())
                              .filter((l) => l && !isSeparator(l))
                          : [];
                      }
                      return m[1]
                        .split('\n')
                        .map((l) => l.replace(/^\s*[-*•]\s+/, '').replace(/\*+/g, '').trim())
                        .filter((l) => l && !isSeparator(l));
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
                    const marketTimingRationale = extractScoreRationale('Market Timing Score');
                    const distributionEdgeRationale = extractScoreRationale('Distribution Edge Score');

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
                            {(s.scores?.marketTiming ?? 0) > 0 && (
                              <ScoreTile label="Market Timing" score={s.scores?.marketTiming ?? 0} rationale={marketTimingRationale} icon="⏱️" />
                            )}
                            {(s.scores?.distributionEdge ?? 0) > 0 && (
                              <ScoreTile label="Distribution Edge" score={s.scores?.distributionEdge ?? 0} rationale={distributionEdgeRationale} icon="📡" />
                            )}
                          </div>
                        ) : null}
                        {found.map((c) => (
                          <HeadlineCard key={c.key} card={c} />
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

// Returns true if a string, after stripping all markdown/punctuation formatting,
// contains at least 2 real alphanumeric characters. Keeps us from showing a
// "Show detail" button whose content is just a stray dash, ellipsis, or asterisk.
function hasMeaningfulText(s: string): boolean {
  const alphaNum = s.replace(/[^\p{L}\p{N}]/gu, '');
  return alphaNum.length >= 2;
}

// Split a field value into a one-sentence headline and supporting bullet/paragraph detail.
// Works whether the model emits "headline\n- bullet\n- bullet" or a single paragraph.
function splitHeadline(raw: string): { headline: string; detail: string[] } {
  const text = raw.trim();
  if (!text) return { headline: '', detail: [] };
  const isSeparator = (s: string) => /^[-*_=]{2,}\s*$/.test(s.trim());
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !isSeparator(l));
  const headlineLine = lines[0]?.replace(/^\*+|\*+$/g, '').trim() ?? '';
  const rest = lines.slice(1);
  // Bullet lines must have a real marker followed by a space to avoid matching `---` or `***`.
  const bulletRest = rest
    .filter((l) => /^[-*•][ \t]+/.test(l))
    .map((l) => l.replace(/^[-*•]\s+/, '').replace(/\*+/g, '').trim())
    .filter(hasMeaningfulText);
  if (bulletRest.length > 0) return { headline: headlineLine, detail: bulletRest };
  // Otherwise collapse remaining lines into a single follow-up paragraph
  const rem = rest
    .map((l) => l.replace(/^[-*•]\s*/, '').replace(/\*+/g, '').trim())
    .filter(hasMeaningfulText)
    .join(' ')
    .trim();
  return {
    headline: headlineLine,
    detail: hasMeaningfulText(rem) ? [rem] : [],
  };
}

interface HeadlineCardData {
  key: string;
  label: string;
  icon: string;
  color: string;
  value: string;
  kind?: 'bullets' | 'quote';
}

function HeadlineCard({ card }: { card: HeadlineCardData }) {
  const [expanded, setExpanded] = useState(false);
  const { headline, detail } = splitHeadline(card.value);
  const clean = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1');
  // Only count detail items that will render real content after cleaning.
  const visibleDetail = detail.filter((d) => hasMeaningfulText(clean(d)));
  const hasDetail = visibleDetail.length > 0;

  return (
    <div
      className={`bg-zinc-900 rounded-lg p-3 border border-zinc-800${hasDetail ? ' cursor-pointer' : ''}`}
      onClick={() => hasDetail && setExpanded((v) => !v)}
    >
      <div className={`text-xs font-mono ${card.color} mb-1.5 flex items-center gap-2`}>
        <span>{card.icon}</span>
        <span>{card.label.toUpperCase()}</span>
      </div>
      <p className="text-sm text-zinc-100 leading-relaxed font-medium">
        {card.kind === 'quote' ? `"${clean(headline)}"` : clean(headline)}
      </p>
      {hasDetail && (
        <>
          {expanded && (
            <ul className="space-y-1 mt-2">
              {visibleDetail.map((d, i) => (
                <li key={i} className="text-sm text-zinc-400 leading-relaxed flex gap-2">
                  <span className="text-zinc-600 shrink-0">▸</span>
                  <span>{clean(d)}</span>
                </li>
              ))}
            </ul>
          )}
          <span className="mt-1.5 text-[11px] font-mono text-zinc-500">
            {expanded ? '− Hide detail' : `+ Show ${visibleDetail.length} detail${visibleDetail.length === 1 ? '' : 's'}`}
          </span>
        </>
      )}
    </div>
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
        <p className="text-xs text-zinc-400 leading-relaxed">{splitHeadline(rationale).headline}</p>
      )}
    </div>
  );
}
