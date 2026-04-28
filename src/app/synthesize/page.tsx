'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AppHeader } from '@/components/app-header';
import { useSession } from '@/lib/session-context';
import { streamToText } from '@/lib/streaming';
import { renderMarkdownBlock } from '@/lib/markdown-render';
import { Package, Play, Square, Download, FileDown, Trophy, FileText, ChevronRight, Clock, ArrowLeft, Trash2, CheckCircle, Lock, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { IdeaResult, SynthesisEntry } from '@/lib/types';
import { reconstructVcMemo } from '@/lib/prompt-builders';
import { marked } from 'marked';
import { usePhaseRun, startPhaseRun, updatePhaseOutput, completePhaseRun, failPhaseRun, stopPhaseRun, clearPhaseRun, getPhaseRun } from '@/lib/phase-status';

function parseMarketConfidence(report: string | undefined): 'STRONG' | 'MODERATE' | 'WEAK' | 'INSUFFICIENT' | null {
  if (!report) return null;
  const match = report.match(/Market Confidence[:\s*]*(?:\*\*\s*)?(STRONG|MODERATE|WEAK|INSUFFICIENT)/i);
  return match ? (match[1].toUpperCase() as 'STRONG' | 'MODERATE' | 'WEAK' | 'INSUFFICIENT') : null;
}

function parseStressSeverity(report: string | undefined): 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | null {
  if (!report) return null;
  const match = report.match(/\*\*Overall:\s*(CRITICAL|HIGH|MODERATE|LOW)\*\*/i);
  return match ? (match[1].toUpperCase() as 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW') : null;
}

function computeIdeaScore(
  idea: IdeaResult,
  marketConfidence: 'STRONG' | 'MODERATE' | 'WEAK' | 'INSUFFICIENT' | null,
  stressSeverity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | null,
): number {
  const scores = [idea.moatScore, idea.founderFitScore, idea.marketTimingScore, idea.distributionEdgeScore]
    .filter((s): s is number => s != null && s > 0);
  if (scores.length === 0) return 0;
  let score = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (marketConfidence) {
    const adj: Record<string, number> = { STRONG: 1, MODERATE: 0, WEAK: -2, INSUFFICIENT: -0.5 };
    score += adj[marketConfidence];
  }
  if (stressSeverity) {
    const adj: Record<string, number> = { CRITICAL: -3, HIGH: -1.5, MODERATE: -0.5, LOW: 0.5 };
    score += adj[stressSeverity];
  }
  return Math.round(Math.max(0, Math.min(10, score)) * 10) / 10;
}

function survivorsToMarkdown(survivors: IdeaResult[]): string {
  return survivors
    .map((s, i) => {
      const verdict = s.verdict ? ` — ${s.verdict}` : '';
      const ideaBlock = `## Survivor ${i + 1}: ${s.title}${verdict}\n\n${s.rawMarkdown}`;
      const memo = reconstructVcMemo(s);
      return `${ideaBlock}\n\n### VC Partner Assessment\n\n${memo}`;
    })
    .join('\n\n---\n\n');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function SynthesizePage() {
  const { session, update, ready } = useSession();
  const phaseRun = usePhaseRun('synthesize');
  const [mode, setMode] = useState<'build_packet' | 'investor_brief'>(() => {
    const run = getPhaseRun('synthesize');
    return (run?.isRunning && run.extra?.mode) === 'investor_brief' ? 'investor_brief' : 'build_packet';
  });
  const [selectedId, setSelectedId] = useState<string>(() => {
    const run = getPhaseRun('synthesize');
    return run?.isRunning ? run.ideaId : (session.survivors[0]?.id ?? '');
  });
  const [viewingEntryId, setViewingEntryId] = useState<string | null>(null);

  const isRunning = phaseRun?.isRunning ?? false;
  const output = phaseRun ? phaseRun.output : '';
  const error = phaseRun?.error ?? null;

  useEffect(() => {
    if (!ready) return;
    const run = getPhaseRun('synthesize');
    if (run?.isRunning) {
      setSelectedId(run.ideaId);
      if (run.extra?.mode) setMode(run.extra.mode as 'build_packet' | 'investor_brief');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    return () => {
      const run = getPhaseRun('synthesize');
      if (run && !run.isRunning) clearPhaseRun('synthesize');
    };
  }, []);

  if (!ready) return null;

  const selected = session.survivors.find((s) => s.id === selectedId) ?? null;
  const marketResearch = selected ? session.verifications[selected.id] : undefined;
  const stressTest = selected ? session.stressTests[selected.id] : undefined;
  const prd = selected ? session.prds[selected.id] : undefined;
  const blueprint = selected ? session.blueprints[selected.id] : undefined;

  const viewingEntry = viewingEntryId ? session.syntheses.find((e) => e.id === viewingEntryId) : null;
  const displayOutput = viewingEntry ? viewingEntry.content : output;

  const openEntry = (entry: SynthesisEntry) => {
    setViewingEntryId(entry.id);
  };

  const closeEntry = () => {
    setViewingEntryId(null);
  };

  const deleteEntry = (entryId: string) => {
    update((prev) => ({
      syntheses: prev.syntheses.filter((e) => e.id !== entryId),
    }));
    if (viewingEntryId === entryId) closeEntry();
  };

  const run = async (overrideMode?: 'build_packet' | 'investor_brief') => {
    if (session.survivors.length === 0 || !selected) return;
    const capturedMode = overrideMode ?? mode;
    if (overrideMode) setMode(overrideMode);
    setViewingEntryId(null);
    const ac = new AbortController();
    const capturedId = selectedId;
    const capturedTitle = selected.title;
    const runId = startPhaseRun('synthesize', capturedId, ac, { mode: capturedMode });
    try {
      const res = await fetch('/api/mining/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userContext: session.founderContext,
          survivorsMarkdown: survivorsToMarkdown(session.survivors),
          marketResearch,
          stressTest,
          prd,
          blueprint,
          mode: capturedMode,
          modelChoice: session.modelChoice,
        }),
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`synthesizer failed (${res.status})`);
      const full = await streamToText(res, (text) => updatePhaseOutput('synthesize', runId, text));
      completePhaseRun('synthesize', runId);
      const entry: SynthesisEntry = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ideaId: capturedId,
        ideaTitle: capturedTitle,
        mode: capturedMode,
        content: full,
      };
      update((prev) => ({
        synthesis: full,
        syntheses: [entry, ...prev.syntheses],
      }));
      setViewingEntryId(entry.id);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') failPhaseRun('synthesize', runId, 'Stopped');
      else failPhaseRun('synthesize', runId, err instanceof Error ? err.message : 'Synthesis failed');
    }
  };

  const stop = () => stopPhaseRun('synthesize');

  const downloadMarkdown = () => {
    const blob = new Blob([displayOutput], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const prefix = viewingEntry ? viewingEntry.mode : mode;
    a.download = `${prefix}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadWord = async () => {
    const bodyHtml = await marked.parse(displayOutput, { async: true });
    const title = (viewingEntry?.mode ?? mode) === 'investor_brief' ? 'Investor Brief' : 'Build Packet';
    const fullHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #222; line-height: 1.5; }
    h1 { font-size: 22pt; color: #111; border-bottom: 2px solid #888; padding-bottom: 6pt; margin-top: 18pt; }
    h2 { font-size: 16pt; color: #111; margin-top: 18pt; border-bottom: 1px solid #bbb; padding-bottom: 4pt; }
    h3 { font-size: 13pt; color: #222; margin-top: 14pt; }
    h4 { font-size: 12pt; color: #333; margin-top: 12pt; }
    p { margin: 6pt 0; }
    ul, ol { margin: 6pt 0 6pt 18pt; }
    li { margin: 2pt 0; }
    blockquote { border-left: 3px solid #bbb; margin: 8pt 0; padding: 4pt 10pt; color: #555; font-style: italic; }
    code { font-family: Consolas, monospace; background: #f4f4f4; padding: 1pt 4pt; border-radius: 2pt; font-size: 10pt; }
    pre { font-family: Consolas, monospace; background: #f4f4f4; padding: 8pt; border-radius: 3pt; font-size: 10pt; white-space: pre-wrap; }
    table { border-collapse: collapse; margin: 8pt 0; }
    th, td { border: 1px solid #bbb; padding: 4pt 8pt; text-align: left; }
    th { background: #eee; }
    hr { border: none; border-top: 1px solid #ccc; margin: 12pt 0; }
    em { font-style: italic; }
    strong { font-weight: bold; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
    const blob = new Blob([fullHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${viewingEntry?.mode ?? mode}-${Date.now()}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const showOutput = displayOutput || isRunning;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <AppHeader currentPhase="synthesize" />

      <main className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Controls Card */}
          <Card className="bg-zinc-900 border-zinc-800 p-6">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Package className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-zinc-100">Package Your Work</h2>
                <p className="text-sm text-zinc-400">
                  Select a survivor that has completed all phases, then generate a Build Packet or Investor Brief.
                </p>
              </div>
            </div>

            {session.survivors.length === 0 ? (
              <div className="text-center py-6 text-sm text-zinc-500">
                No survivors yet. Run the mining gauntlet first.
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {[...session.survivors].sort((a, b) => {
                  const scoreA = computeIdeaScore(a, parseMarketConfidence(session.verifications[a.id]), parseStressSeverity(session.stressTests[a.id]));
                  const scoreB = computeIdeaScore(b, parseMarketConfidence(session.verifications[b.id]), parseStressSeverity(session.stressTests[b.id]));
                  return scoreB - scoreA;
                }).map((s) => {
                  const hasResearch = !!session.verifications[s.id];
                  const hasStress = !!session.stressTests[s.id];
                  const hasPrd = !!session.prds[s.id];
                  const hasBlueprint = !!session.blueprints[s.id];
                  const isReady = hasResearch && hasStress && hasPrd && hasBlueprint;
                  const isSelected = selectedId === s.id;
                  const phases = [
                    { label: 'Research', done: hasResearch },
                    { label: 'Stress Test', done: hasStress },
                    { label: 'PRD', done: hasPrd },
                    { label: 'Blueprint', done: hasBlueprint },
                  ];

                  return (
                    <div
                      key={s.id}
                      onClick={() => isReady && setSelectedId(s.id)}
                      className={`rounded-lg p-3 border transition-all ${
                        isSelected && isReady
                          ? 'border-emerald-500/60 bg-emerald-900/20'
                          : isReady
                            ? 'border-zinc-700 bg-zinc-800/50 cursor-pointer hover:border-zinc-500'
                            : 'border-zinc-800 bg-zinc-900/30 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isReady ? (
                          <CheckCircle className={`w-4 h-4 shrink-0 ${isSelected ? 'text-emerald-400' : 'text-zinc-500'}`} />
                        ) : (
                          <Lock className="w-4 h-4 shrink-0 text-zinc-600" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-medium truncate block ${isReady ? 'text-zinc-100' : 'text-zinc-500'}`}>
                            {s.title}
                          </span>
                          <div className="flex gap-2 mt-1">
                            {phases.map((p) => (
                              <span key={p.label} className={`text-[10px] font-mono ${p.done ? 'text-emerald-400' : 'text-zinc-600'}`}>
                                {p.done ? '✓' : '○'} {p.label}
                              </span>
                            ))}
                          </div>
                        </div>
                        {isSelected && isReady && !isRunning && (
                          <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <Button
                              onClick={() => run('build_packet')}
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-xs"
                            >
                              <Package className="w-3.5 h-3.5 mr-1.5" />
                              Build Packet
                            </Button>
                            <Button
                              onClick={() => run('investor_brief')}
                              size="sm"
                              className="bg-purple-600 hover:bg-purple-700 text-white font-mono text-xs"
                            >
                              <FileText className="w-3.5 h-3.5 mr-1.5" />
                              Investor Brief
                            </Button>
                          </div>
                        )}
                        {isSelected && isRunning && (
                          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                            <Button onClick={stop} variant="destructive" size="sm" className="font-mono text-xs">
                              <Square className="w-3.5 h-3.5 mr-1.5" />
                              Stop
                            </Button>
                          </div>
                        )}
                        {!isReady && (() => {
                          const nextPhase = !hasResearch
                            ? { href: `/verify?idea=${s.id}`, label: 'Research', color: 'text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10' }
                            : !hasStress
                              ? { href: `/verify?idea=${s.id}&tab=stress-test`, label: 'Stress Test', color: 'text-red-400 hover:text-red-300 hover:bg-red-500/10' }
                              : !hasPrd
                                ? { href: `/shape?idea=${s.id}`, label: 'PRD', color: 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10' }
                                : { href: `/blueprint?idea=${s.id}`, label: 'Blueprint', color: 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10' };
                          return (
                            <Link
                              href={nextPhase.href}
                              onClick={(e) => e.stopPropagation()}
                              className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-colors ${nextPhase.color}`}
                            >
                              Run {nextPhase.label}
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {error && <p className="text-xs text-red-400 font-mono mt-3">{error}</p>}
          </Card>

          {/* Output Card */}
          {showOutput && (
            <Card className="bg-zinc-900 border-zinc-800 p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {viewingEntry && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={closeEntry}
                      className="text-zinc-400 hover:text-zinc-200 -ml-2 mr-1"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                  )}
                  <Trophy className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-mono text-sm text-zinc-200">
                    {viewingEntry
                      ? `${viewingEntry.mode === 'investor_brief' ? 'Investor Brief' : 'Build Packet'} — ${viewingEntry.ideaTitle}`
                      : 'Synthesis Output'}
                  </h3>
                  {viewingEntry && (
                    <span className="text-[10px] font-mono text-zinc-500 ml-2">
                      {formatDate(viewingEntry.createdAt)}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!displayOutput}
                    onClick={downloadMarkdown}
                    className="font-mono border-zinc-700 text-zinc-300"
                  >
                    <FileDown className="w-4 h-4 mr-1" />
                    .md
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!displayOutput}
                    onClick={downloadWord}
                    className="font-mono border-zinc-700 text-zinc-300"
                  >
                    <FileText className="w-4 h-4 mr-1" />
                    Word
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!displayOutput}
                    onClick={() => navigator.clipboard.writeText(displayOutput)}
                    className="font-mono border-zinc-700 text-zinc-300"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Copy
                  </Button>
                </div>
              </div>
              <div className="bg-zinc-950 rounded-lg p-5 border border-zinc-800 min-h-[400px] max-h-[700px] overflow-y-auto">
                {displayOutput ? (
                  renderMarkdownBlock(displayOutput)
                ) : (
                  <span className="text-xs text-zinc-600 font-mono">Synthesizing...</span>
                )}
              </div>
            </Card>
          )}

          {/* Previous Syntheses */}
          {session.syntheses.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-zinc-500" />
                <h3 className="font-mono text-sm text-zinc-400">Previous Syntheses</h3>
                <span className="text-[10px] font-mono text-zinc-600">{session.syntheses.length}</span>
              </div>
              <div className="space-y-2">
                {session.syntheses.map((entry) => {
                  const isActive = viewingEntryId === entry.id;
                  return (
                    <Card
                      key={entry.id}
                      onClick={() => openEntry(entry)}
                      className={`p-4 cursor-pointer transition-all hover:scale-[1.005] ${
                        isActive
                          ? 'bg-emerald-900/20 border-emerald-700/50'
                          : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            entry.mode === 'investor_brief' ? 'bg-purple-500/10' : 'bg-emerald-500/10'
                          }`}>
                            {entry.mode === 'investor_brief' ? (
                              <FileText className={`w-4 h-4 ${isActive ? 'text-purple-300' : 'text-purple-400'}`} />
                            ) : (
                              <Package className={`w-4 h-4 ${isActive ? 'text-emerald-300' : 'text-emerald-400'}`} />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-zinc-100">{entry.ideaTitle}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                entry.mode === 'investor_brief'
                                  ? 'bg-purple-500/20 text-purple-300'
                                  : 'bg-emerald-500/20 text-emerald-300'
                              }`}>
                                {entry.mode === 'investor_brief' ? 'Investor Brief' : 'Build Packet'}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-500 mt-0.5">{formatDate(entry.createdAt)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteEntry(entry.id);
                            }}
                            className="text-zinc-600 hover:text-red-400 h-8 w-8 p-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                          <ChevronRight className="w-4 h-4 text-zinc-500" />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state — no output and no previous */}
          {!showOutput && session.syntheses.length === 0 && (
            <Card className="bg-zinc-900 border-zinc-800 border-dashed p-8 text-center">
              <p className="text-sm text-zinc-400">
                No syntheses yet. Select a survivor and click <span className="text-emerald-300">SYNTHESIZE</span> to generate your first one.
              </p>
            </Card>
          )}
        </div>
      </main>

      <footer className="border-t border-zinc-800 px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-zinc-600 font-mono">
          <span>Synthesizer • Final packaging step</span>
          <span>{session.modelChoice.provider} • {session.modelChoice.model}</span>
        </div>
      </footer>
    </div>
  );
}

