'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import BlueprintSession from '@/components/mining/blueprint-session';
import { AppHeader } from '@/components/app-header';
import { useSession } from '@/lib/session-context';
import { sortByProgress, computeIdeaScore } from '@/lib/session';
import type { IdeaResult } from '@/lib/types';
import { ArrowRight, Code2, Trophy, ChevronRight, Sparkles, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { reconstructVcMemo } from '@/lib/prompt-builders';
import { usePhaseRun, getPhaseRun } from '@/lib/phase-status';

export default function BlueprintPage() {
  return <Suspense><BlueprintPageInner /></Suspense>;
}

function BlueprintPageInner() {
  const { session, update, ready } = useSession();
  const searchParams = useSearchParams();
  const [selectedIdea, setSelectedIdea] = useState<IdeaResult | null>(null);
  const [customIdea, setCustomIdea] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const blueprintRun = usePhaseRun('blueprint');

  useEffect(() => {
    if (!ready) return;
    const run = getPhaseRun('blueprint');
    if (run?.isRunning) {
      const idea = session.survivors.find(s => s.id === run.ideaId);
      if (idea) { setSelectedIdea(idea); return; }
    }
    const ideaParam = searchParams.get('idea');
    if (ideaParam) {
      const idea = session.survivors.find(s => s.id === ideaParam);
      if (idea) setSelectedIdea(idea);
    } else {
      setSelectedIdea(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, searchParams]);

  if (!ready) return null;

  const ideas = sortByProgress(session.survivors, session);

  const handleComplete = (blueprint: string) => {
    if (!selectedIdea) return;
    update((prev) => ({ blueprints: { ...prev.blueprints, [selectedIdea.id]: blueprint } }));
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
  const marketResearch = selectedIdea ? session.verifications[selectedIdea.id] : undefined;
  const prd = selectedIdea ? session.prds[selectedIdea.id] : undefined;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <AppHeader currentPhase="blueprint" />

      <main className="flex-1 p-6">
        {selectedIdea && ideaForSession ? (
          <BlueprintSession
            userContext={session.founderContext}
            ideaId={selectedIdea.id}
            idea={ideaForSession}
            vcMemo={vcMemo}
            marketResearch={marketResearch}
            prd={prd}
            modelChoice={session.modelChoice}
            initialBlueprint={session.blueprints[selectedIdea.id]}
            onComplete={handleComplete}
            onBack={() => setSelectedIdea(null)}
          />
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            <Card className="bg-zinc-900 border-zinc-800 p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <Code2 className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-zinc-100">Technical Blueprint</h2>
                  <p className="text-sm text-zinc-400 mt-1">
                    Select an idea to generate a technical build plan. The CTO agent will produce a walking-skeleton plan
                    with architecture, stack, and milestones.
                  </p>
                </div>
              </div>
            </Card>

            <div>
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-emerald-400" />
                <h3 className="font-mono text-lg text-zinc-200">Survivor Ideas</h3>
                <Badge variant="outline" className="text-emerald-400 border-emerald-400/50">
                  {ideas.length} ideas
                </Badge>
              </div>

              {ideas.length === 0 ? (
                <Card className="bg-zinc-900 border-zinc-800 border-dashed p-8 text-center">
                  <p className="text-sm text-zinc-400 mb-4">
                    No ideas yet. Run <span className="text-zinc-200">Mine</span> first.
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
                  {ideas.map((idea) => {
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
                            {hasResearch && <Badge variant="outline" className="text-yellow-400 border-yellow-400/50 text-xs">Researched</Badge>}
                            {hasStressTest && <Badge variant="outline" className="text-red-400 border-red-400/50 text-xs">Stress Tested</Badge>}
                            {hasPRD && <Badge variant="outline" className="text-blue-400 border-blue-400/50 text-xs">PRD</Badge>}
                            {blueprintRun?.isRunning && blueprintRun.ideaId === idea.id && (
                              <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs animate-pulse">
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                Architecting...
                              </Badge>
                            )}
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
                  <Sparkles className="w-4 h-4 mr-2" />
                  Or paste a custom idea to blueprint
                </Button>
              ) : (
                <Card className="bg-zinc-900 border-zinc-800 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-zinc-400" />
                    <span className="font-mono text-sm text-zinc-300">Custom Idea</span>
                  </div>
                  <Textarea
                    value={customIdea}
                    onChange={(e) => setCustomIdea(e.target.value)}
                    placeholder="Paste your idea here..."
                    className="min-h-[150px] bg-zinc-950 border-zinc-700 text-zinc-300 font-mono text-sm mb-3"
                  />
                  <div className="flex justify-end gap-2">
                    <Button onClick={() => setShowCustomInput(false)} variant="ghost" className="text-zinc-400">
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCustomIdea}
                      disabled={!customIdea.trim()}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      Blueprint This Idea
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto flex justify-end mt-6">
          <Link href="/synthesize">
            <Button variant="outline" className="font-mono text-sm border-emerald-500/40 text-emerald-400 hover:text-emerald-300 hover:border-emerald-400 hover:bg-emerald-500/10">
              Next: Synthesize
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </main>

      <footer className="border-t border-zinc-800 px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-zinc-600 font-mono">
          <span>Architect • Technical Build Plan</span>
          <span>{session.modelChoice.provider} • {session.modelChoice.model}</span>
        </div>
      </footer>
    </div>
  );
}
