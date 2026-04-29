'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import VerifySession from '@/components/mining/verify-session';
import StressTestSession from '@/components/mining/stress-test-session';
import { AppHeader } from '@/components/app-header';
import { useSession } from '@/lib/session-context';
import { sortByProgress, computeIdeaScore } from '@/lib/session';
import type { IdeaResult } from '@/lib/types';
import { ArrowRight, Search, Trophy, ChevronRight, FileText, Loader2, Flame } from 'lucide-react';
import Link from 'next/link';
import { reconstructVcMemo } from '@/lib/prompt-builders';
import { usePhaseRun, getPhaseRun } from '@/lib/phase-status';

type VerifyTab = 'research' | 'stress-test';

export default function VerifyPage() {
  return <Suspense><VerifyPageInner /></Suspense>;
}

function VerifyPageInner() {
  const { session, update, ready } = useSession();
  const searchParams = useSearchParams();
  const [selectedIdea, setSelectedIdea] = useState<IdeaResult | null>(null);
  const [customIdea, setCustomIdea] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [activeTab, setActiveTab] = useState<VerifyTab>('research');
  const verifyRun = usePhaseRun('verify');
  const stressTestRun = usePhaseRun('stress-test');

  useEffect(() => {
    if (!ready) return;
    const vRun = getPhaseRun('verify');
    const stRun = getPhaseRun('stress-test');
    if (vRun?.isRunning) {
      const idea = session.survivors.find(s => s.id === vRun.ideaId);
      if (idea) {
        setSelectedIdea(idea);
        setActiveTab('research');
        return;
      }
    } else if (stRun?.isRunning) {
      const idea = session.survivors.find(s => s.id === stRun.ideaId);
      if (idea) {
        setSelectedIdea(idea);
        setActiveTab('stress-test');
        return;
      }
    }
    const ideaParam = searchParams.get('idea');
    if (ideaParam) {
      const idea = session.survivors.find(s => s.id === ideaParam);
      if (idea) {
        setSelectedIdea(idea);
        const tabParam = searchParams.get('tab');
        if (tabParam === 'stress-test') setActiveTab('stress-test');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready) return null;

  const survivors = sortByProgress(session.survivors, session);

  const handleVerifyComplete = (report: string) => {
    if (!selectedIdea) return;
    update((prev) => ({ verifications: { ...prev.verifications, [selectedIdea.id]: report } }));
  };

  const handleStressTestComplete = (report: string) => {
    if (!selectedIdea) return;
    update((prev) => ({ stressTests: { ...prev.stressTests, [selectedIdea.id]: report } }));
  };

  const handleCustomIdea = () => {
    if (!customIdea.trim()) return;
    const firstLine = customIdea.split('\n')[0].replace(/^#+\s*/, '').substring(0, 80) || 'Custom Idea';
    const idea: IdeaResult = {
      id: `custom-${Date.now()}`,
      title: firstLine,
      rawMarkdown: customIdea,
      batchNumber: 0,
      verdict: 'INVEST',
    };
    update((prev) => ({ survivors: [...prev.survivors, idea] }));
    setSelectedIdea(idea);
    setCustomIdea('');
    setShowCustomInput(false);
  };

  const ideaForSession = selectedIdea
    ? {
        title: selectedIdea.title,
        content: selectedIdea.rawMarkdown,
        critique: selectedIdea.bearCase || selectedIdea.bullCase || '',
      }
    : null;

  const vcMemo = selectedIdea ? reconstructVcMemo(selectedIdea) : undefined;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <AppHeader currentPhase="verify" />

      <main className="flex-1 p-6">
        {selectedIdea && ideaForSession ? (
          <div className="max-w-5xl mx-auto space-y-4">
            {/* Idea header + back button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-zinc-100">{selectedIdea.title}</h2>
                {(() => {
                  const sc = computeIdeaScore(selectedIdea, session);
                  if (!sc) return null;
                  const c = sc.score >= 7 ? 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10'
                    : sc.score >= 5 ? 'text-amber-400 border-amber-500/50 bg-amber-500/10'
                    : 'text-red-400 border-red-500/50 bg-red-500/10';
                  return <Badge variant="outline" className={`text-xs font-mono ${c}`}>{sc.preliminary ? `~${sc.score}` : sc.score}</Badge>;
                })()}
              </div>
              <Button
                onClick={() => setSelectedIdea(null)}
                variant="outline"
                size="sm"
                className="font-mono border-zinc-700"
              >
                ← Back
              </Button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
              <button
                onClick={() => setActiveTab('research')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-mono transition-colors ${
                  activeTab === 'research'
                    ? 'bg-yellow-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                <Search className="w-4 h-4" />
                Market Research
                {session.verifications[selectedIdea.id] && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                )}
                {verifyRun?.isRunning && verifyRun.ideaId === selectedIdea.id && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('stress-test')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-mono transition-colors ${
                  activeTab === 'stress-test'
                    ? 'bg-red-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                <Flame className="w-4 h-4" />
                Stress Test
                {session.stressTests[selectedIdea.id] && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                )}
                {stressTestRun?.isRunning && stressTestRun.ideaId === selectedIdea.id && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
              </button>
            </div>

            {/* Tab content */}
            {activeTab === 'research' ? (
              <VerifySession
                userContext={session.founderContext}
                ideaId={selectedIdea.id}
                idea={ideaForSession}
                vcMemo={vcMemo}
                modelChoice={session.modelChoice}
                initialReport={session.verifications[selectedIdea.id]}
                onComplete={handleVerifyComplete}
              />
            ) : (
              <StressTestSession
                userContext={session.founderContext}
                ideaId={selectedIdea.id}
                idea={ideaForSession}
                vcMemo={vcMemo}
                marketResearch={session.verifications[selectedIdea.id]}
                modelChoice={session.modelChoice}
                initialReport={session.stressTests[selectedIdea.id]}
                onComplete={handleStressTestComplete}
              />
            )}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            <Card className="bg-zinc-900 border-zinc-800 p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                  <Search className="w-6 h-6 text-yellow-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-zinc-100">Due Diligence</h2>
                  <p className="text-sm text-zinc-400 mt-1">
                    Select a survivor idea. Two lenses: <span className="text-yellow-400">Market Research</span> validates assumptions with data; <span className="text-red-400">Stress Test</span> finds the strongest reasons it fails.
                  </p>
                </div>
              </div>
            </Card>

            <div>
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-emerald-400" />
                <h3 className="font-mono text-lg text-zinc-200">Survivor Ideas</h3>
                <Badge variant="outline" className="text-emerald-400 border-emerald-400/50">
                  {survivors.length} ideas
                </Badge>
              </div>

              {survivors.length === 0 ? (
                <Card className="bg-zinc-900 border-zinc-800 border-dashed p-8 text-center">
                  <p className="text-sm text-zinc-400 mb-4">
                    No survivors yet. Run the <span className="text-zinc-200">Mine</span> phase to generate and critique ideas.
                  </p>
                  <Link href="/mine">
                    <Button className="bg-red-600 hover:bg-red-700 text-white font-mono">
                      Go to Mine
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </Card>
              ) : (
                <div className="space-y-3">
                  {survivors.map((idea) => {
                    const hasResearch = !!session.verifications[idea.id];
                    const hasStressTest = !!session.stressTests[idea.id];
                    const hasPRD = !!session.prds[idea.id];
                    const hasBlueprint = !!session.blueprints[idea.id];
                    const ideaScore = computeIdeaScore(idea, session);
                    const sc = ideaScore ? ideaScore.score : null;
                    const scColor = sc != null ? (sc >= 7 ? 'text-emerald-400' : sc >= 5 ? 'text-amber-400' : 'text-red-400') : 'text-zinc-500';
                    const scBg = sc != null ? (sc >= 7 ? 'bg-emerald-500/10 border-emerald-500/30' : sc >= 5 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30') : 'bg-zinc-800 border-zinc-700';
                    return (
                      <Card
                        key={idea.id}
                        onClick={() => setSelectedIdea(idea)}
                        className="p-4 cursor-pointer transition-all hover:scale-[1.01] bg-zinc-900/50 border-zinc-800 hover:border-zinc-600"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`shrink-0 w-11 h-11 rounded-lg border flex flex-col items-center justify-center ${ideaScore?.preliminary ? 'bg-zinc-800/50 border-zinc-700' : scBg}`}>
                              {ideaScore ? (
                                <>
                                  <span className={`text-base font-bold font-mono leading-none ${ideaScore.preliminary ? 'text-zinc-400' : scColor}`}>
                                    {ideaScore.preliminary ? '~' : ''}{ideaScore.score}
                                  </span>
                                  <span className="text-[7px] text-zinc-500 font-mono leading-none mt-0.5">
                                    {ideaScore.preliminary ? 'EST' : 'SCORE'}
                                  </span>
                                </>
                              ) : (
                                <span className="text-[9px] text-zinc-600 font-mono">—</span>
                              )}
                            </div>
                            <div>
                              <h4 className="font-semibold text-zinc-100">{idea.title}</h4>
                              <p className="text-xs text-zinc-500 mt-0.5">
                                {idea.rawMarkdown.substring(0, 120).replace(/\*\*/g, '')}...
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {verifyRun?.isRunning && verifyRun.ideaId === idea.id && (
                              <Badge className="bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 text-xs animate-pulse">
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                Verifying...
                              </Badge>
                            )}
                            {stressTestRun?.isRunning && stressTestRun.ideaId === idea.id && (
                              <Badge className="bg-red-500/20 text-red-300 border border-red-500/30 text-xs animate-pulse">
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                Testing...
                              </Badge>
                            )}
                            {hasResearch && <Badge variant="outline" className="text-yellow-400 border-yellow-400/50 text-xs">Researched</Badge>}
                            {hasStressTest && <Badge variant="outline" className="text-red-400 border-red-400/50 text-xs">Stress Tested</Badge>}
                            {hasPRD && <Badge variant="outline" className="text-blue-400 border-blue-400/50 text-xs">PRD</Badge>}
                            {hasBlueprint && <Badge variant="outline" className="text-purple-400 border-purple-400/50 text-xs">Blueprint</Badge>}
                            <ChevronRight className="w-5 h-5 text-zinc-500" />
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-zinc-800">
              {!showCustomInput ? (
                <Button
                  onClick={() => setShowCustomInput(true)}
                  variant="outline"
                  className="w-full border-dashed border-zinc-700 text-zinc-400 hover:text-zinc-100"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Or paste a custom idea to verify
                </Button>
              ) : (
                <Card className="bg-zinc-900 border-zinc-800 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-zinc-400" />
                    <span className="font-mono text-sm text-zinc-300">Custom Idea</span>
                  </div>
                  <Textarea
                    value={customIdea}
                    onChange={(e) => setCustomIdea(e.target.value)}
                    placeholder="Paste your idea here (include title, problem, solution, target customer, etc.)..."
                    className="min-h-[150px] bg-zinc-950 border-zinc-700 text-zinc-300 font-mono text-sm mb-3"
                  />
                  <div className="flex justify-end gap-2">
                    <Button onClick={() => setShowCustomInput(false)} variant="ghost" className="text-zinc-400">
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCustomIdea}
                      disabled={!customIdea.trim()}
                      className="bg-yellow-600 hover:bg-yellow-700 text-white"
                    >
                      Verify This Idea
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto flex justify-end mt-6">
          <Link href={selectedIdea ? `/shape?idea=${selectedIdea.id}` : '/shape'}>
            <Button variant="outline" className="font-mono text-sm border-blue-500/40 text-blue-400 hover:text-blue-300 hover:border-blue-400 hover:bg-blue-500/10">
              Next: Shape PRD
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </main>

      <footer className="border-t border-zinc-800 px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-xs text-zinc-600 font-mono">
          <span>Verify • Due Diligence</span>
          <span>{session.modelChoice.provider} • {session.modelChoice.model}</span>
        </div>
      </footer>
    </div>
  );
}
