'use client';

import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Flame,
  Loader2,
  AlertTriangle,
  Target,
  Shield,
  Crosshair,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ModelChoice } from '@/lib/types';
import { streamToText } from '@/lib/streaming';
import { usePhaseRun, startPhaseRun, updatePhaseOutput, completePhaseRun, failPhaseRun, stopPhaseRun, clearPhaseRun, getPhaseRun } from '@/lib/phase-status';

interface StressTestSessionProps {
  userContext: string;
  ideaId: string;
  idea: {
    title: string;
    content: string;
  };
  vcMemo?: string;
  marketResearch?: string;
  modelChoice: ModelChoice;
  initialReport?: string;
  onComplete?: (report: string) => void;
}

export default function StressTestSession({
  userContext,
  ideaId,
  idea,
  vcMemo,
  marketResearch,
  modelChoice,
  initialReport,
  onComplete,
}: StressTestSessionProps) {
  const phaseRun = usePhaseRun('stress-test');
  const isActiveRun = phaseRun != null && phaseRun.ideaId === ideaId;
  const isRunning = !!(isActiveRun && phaseRun!.isRunning);
  const output = isActiveRun ? phaseRun!.output : (initialReport ?? '');
  const error = isActiveRun ? (phaseRun!.error ?? null) : null;
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  useEffect(() => {
    return () => {
      const run = getPhaseRun('stress-test');
      if (run && !run.isRunning) clearPhaseRun('stress-test');
    };
  }, []);

  const startStressTest = async () => {
    if (phaseRun?.isRunning) return;
    const ac = new AbortController();
    const runId = startPhaseRun('stress-test', ideaId, ac);

    try {
      const response = await fetch('/api/mining/stress-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userContext,
          idea: `## ${idea.title}\n\n${idea.content}`,
          vcMemo,
          marketResearch,
          modelChoice,
        }),
        signal: ac.signal,
      });

      if (!response.ok) throw new Error('Failed to run stress test');

      const fullText = await streamToText(response, (text) => updatePhaseOutput('stress-test', runId, text));
      completePhaseRun('stress-test', runId);
      onComplete?.(fullText);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        failPhaseRun('stress-test', runId, 'Stress test stopped');
      } else {
        failPhaseRun('stress-test', runId, err instanceof Error ? err.message : 'Stress test failed');
      }
    }
  };

  const stopStressTest = () => {
    stopPhaseRun('stress-test');
  };

  const clean = (s: string) =>
    s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1');

  const parseSeverity = (): { level: string; color: string; bgColor: string; borderColor: string } | null => {
    const match = output.match(/(?:^|\n)\s*(?:\*\*)?\s*Overall\s*:\s*(?:\*\*\s*)?(CRITICAL|HIGH|MODERATE|LOW)\b/i);
    if (!match) return null;
    const level = match[1].toUpperCase();
    const config: Record<string, { color: string; bgColor: string; borderColor: string }> = {
      CRITICAL: { color: 'text-red-300', bgColor: 'bg-red-500/20', borderColor: 'border-red-500/30' },
      HIGH: { color: 'text-orange-300', bgColor: 'bg-orange-500/20', borderColor: 'border-orange-500/30' },
      MODERATE: { color: 'text-amber-300', bgColor: 'bg-amber-500/20', borderColor: 'border-amber-500/30' },
      LOW: { color: 'text-emerald-300', bgColor: 'bg-emerald-500/20', borderColor: 'border-emerald-500/30' },
    };
    return { level, ...config[level] };
  };

  interface KillShot {
    title: string;
    vector: string;
    scenario: string;
    evidence: string[];
    defuse: string;
  }

  const parseKillShots = (): KillShot[] => {
    const shots: KillShot[] = [];
    const regex = /##\s*Kill Shot #\d+:\s*(.+?)(?=\n)/gi;
    let match;
    const positions: Array<{ title: string; start: number }> = [];
    while ((match = regex.exec(output)) !== null) {
      positions.push({ title: match[1].trim(), start: match.index });
    }
    for (let i = 0; i < positions.length; i++) {
      const end = i + 1 < positions.length ? positions[i + 1].start : output.indexOf('## The Honest Summary', positions[i].start);
      const section = output.slice(positions[i].start, end > positions[i].start ? end : undefined);

      const vectorMatch = section.match(/\*\*Attack Vector:\*\*\s*(.+)/i);
      const scenarioMatch = section.match(/\*\*The Failure Scenario:\*\*\s*([\s\S]*?)(?=\n\*\*Evidence|\n##|$)/i);
      const evidenceMatch = section.match(/\*\*Evidence:\*\*\s*\n((?:\s*[-*•][^\n]*\n?)+)/i);
      const defuseMatch = section.match(/\*\*What the founder would need to prove[^*]*\*\*\s*([\s\S]*?)(?=\n##|$)/i);

      const evidence: string[] = [];
      if (evidenceMatch) {
        evidenceMatch[1].split('\n').forEach(line => {
          const cleaned = line.replace(/^\s*[-*•]\s+/, '').trim();
          if (cleaned) evidence.push(cleaned);
        });
      }

      shots.push({
        title: clean(positions[i].title),
        vector: clean(vectorMatch?.[1]?.trim() ?? ''),
        scenario: clean(scenarioMatch?.[1]?.trim() ?? ''),
        evidence: evidence.map(clean),
        defuse: clean(defuseMatch?.[1]?.trim() ?? ''),
      });
    }
    return shots;
  };

  const parseHonestSummary = (): string => {
    const match = output.match(/##\s*The Honest Summary\s*\n([\s\S]*?)$/i);
    return clean(match?.[1]?.trim() ?? '');
  };

  const severity = parseSeverity();
  const killShots = parseKillShots();
  const honestSummary = parseHonestSummary();

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-red-400" />
          <span className="font-mono text-sm text-zinc-300">STRESS TEST</span>
          {severity && (
            <Badge className={`text-xs border ${severity.bgColor} ${severity.borderColor} ${severity.color}`}>
              {severity.level}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {!isRunning ? (
            <Button
              onClick={startStressTest}
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white font-mono text-xs"
            >
              <Crosshair className="w-3.5 h-3.5 mr-1.5" />
              {initialReport || output ? 'RE-RUN STRESS TEST' : 'RUN STRESS TEST'}
            </Button>
          ) : (
            <Button
              onClick={stopStressTest}
              size="sm"
              variant="destructive"
              className="font-mono text-xs"
            >
              STOP
            </Button>
          )}
        </div>
      </div>

      {/* Progress */}
      {isRunning && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Devil&apos;s Advocate attacking...
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Raw output */}
        <Card className="bg-zinc-950 border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Flame className={`w-4 h-4 ${isRunning ? 'text-red-400 animate-pulse' : 'text-zinc-500'}`} />
            <span className="font-mono text-sm text-zinc-300">RAW OUTPUT</span>
            {isRunning && (
              <Badge variant="outline" className="text-red-400 border-red-400/50 text-xs">
                ATTACKING
              </Badge>
            )}
          </div>
          <div
            ref={outputRef}
            className="h-[500px] overflow-y-auto bg-zinc-900/50 rounded-lg p-3 text-xs font-mono text-zinc-400 whitespace-pre-wrap"
          >
            {output || (
              <span className="text-zinc-600">
                Run the stress test to find kill shots...
              </span>
            )}
          </div>
        </Card>

        {/* Structured insights */}
        <Card className="bg-zinc-950 border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-red-400" />
            <span className="font-mono text-sm text-zinc-300">ATTACK REPORT</span>
          </div>
          <div className="max-h-[600px] overflow-y-auto space-y-3 pr-2">
            {/* Severity card */}
            {severity && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-lg p-4 border ${severity.bgColor} ${severity.borderColor}`}
              >
                <div className={`flex items-center gap-2 mb-2 ${severity.color}`}>
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-mono text-xs font-semibold">SEVERITY RATING</span>
                </div>
                <p className="text-sm text-zinc-100 leading-relaxed font-medium">{severity.level}</p>
              </motion.div>
            )}

            {/* Kill shots */}
            <AnimatePresence>
              {killShots.map((shot, i) => (
                <KillShotCard key={i} shot={shot} index={i} isRunning={isRunning} />
              ))}
            </AnimatePresence>

            {/* Honest summary */}
            {honestSummary && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg p-4 border bg-zinc-500/5 border-zinc-500/20"
              >
                <div className="flex items-center gap-2 mb-2 text-zinc-400">
                  <Shield className="w-4 h-4" />
                  <span className="font-mono text-xs font-semibold">THE HONEST SUMMARY</span>
                </div>
                <p className="text-sm text-zinc-100 leading-relaxed font-medium">{honestSummary}</p>
              </motion.div>
            )}

            {!output && !isRunning && (
              <div className="text-center text-zinc-600 text-sm font-mono py-12">
                Attack report will appear here<br />
                after the stress test runs.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Error */}
      {error && (
        <Card className="bg-red-950/20 border-red-800/50 p-4">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-mono text-sm">{error}</span>
          </div>
        </Card>
      )}
    </div>
  );
}

function KillShotCard({ shot, index, isRunning }: {
  shot: { title: string; vector: string; scenario: string; evidence: string[]; defuse: string };
  index: number;
  isRunning: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = shot.evidence.length > 0 || !!shot.defuse;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: isRunning ? 0 : index * 0.1 }}
      className={`rounded-lg p-4 border bg-red-500/5 border-red-500/20 ${hasDetail ? 'cursor-pointer' : ''}`}
      onClick={() => hasDetail && setExpanded(v => !v)}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2 text-red-400">
        <Crosshair className="w-4 h-4" />
        <span className="font-mono text-xs font-semibold">KILL SHOT #{index + 1}</span>
        {shot.vector && (
          <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border bg-red-500/10 border-red-500/20 text-red-300">
            {shot.vector}
          </span>
        )}
      </div>

      {/* Headline — the title */}
      <p className="text-sm text-zinc-100 leading-relaxed font-medium">{shot.title}</p>

      {/* Scenario as subtitle (always visible — acts as TL;DR) */}
      {shot.scenario && (
        <p className="text-xs text-zinc-400 leading-relaxed mt-1.5">{shot.scenario}</p>
      )}

      {/* Expandable detail */}
      {hasDetail && (
        <>
          {expanded && (
            <div className="mt-3 space-y-3 border-t border-red-500/10 pt-3">
              {/* Evidence bullets */}
              {shot.evidence.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono text-red-400/70 mb-1.5 uppercase tracking-wide">Evidence</div>
                  <ul className="space-y-1.5">
                    {shot.evidence.map((e, j) => (
                      <li key={j} className="text-sm text-zinc-300 leading-relaxed flex gap-2">
                        <span className="text-red-400/60 shrink-0">▸</span>
                        <span>{e}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Defuse */}
              {shot.defuse && (
                <div>
                  <div className="text-[11px] font-mono text-emerald-400/70 mb-1.5 uppercase tracking-wide">To Defuse</div>
                  <p className="text-sm text-zinc-300 leading-relaxed">{shot.defuse}</p>
                </div>
              )}
            </div>
          )}
          <span className="mt-2 text-[11px] font-mono text-zinc-500 block">
            {expanded ? '− Hide detail' : '+ Show detail'}
          </span>
        </>
      )}
    </motion.div>
  );
}
