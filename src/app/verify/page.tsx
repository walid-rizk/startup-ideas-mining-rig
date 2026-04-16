'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import VerifySession from '@/components/mining/verify-session';
import { AppHeader } from '@/components/app-header';
import { useSession } from '@/lib/session-context';
import { getVerdictRank } from '@/lib/session';
import type { IdeaResult } from '@/lib/types';
import { ArrowRight, Search, Trophy, ChevronRight, FileText } from 'lucide-react';
import Link from 'next/link';

export default function VerifyPage() {
  const { session, update, ready } = useSession();
  const [selectedIdea, setSelectedIdea] = useState<IdeaResult | null>(null);
  const [customIdea, setCustomIdea] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  if (!ready) return null;

  const survivors = [...session.survivors].sort(
    (a, b) => (a.verdict ? getVerdictRank(a.verdict) : 99) - (b.verdict ? getVerdictRank(b.verdict) : 99),
  );

  const handleComplete = (report: string) => {
    if (!selectedIdea) return;
    update((prev) => ({ verifications: { ...prev.verifications, [selectedIdea.id]: report } }));
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

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <AppHeader currentPhase="verify" />

      <main className="flex-1 p-6">
        {selectedIdea && ideaForSession ? (
          <VerifySession
            userContext={session.founderContext}
            idea={ideaForSession}
            modelChoice={session.modelChoice}
            initialReport={session.verifications[selectedIdea.id]}
            onComplete={handleComplete}
            onBack={() => setSelectedIdea(null)}
          />
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            <Card className="bg-zinc-900 border-zinc-800 p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                  <Search className="w-6 h-6 text-yellow-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-zinc-100">Market Verification</h2>
                  <p className="text-sm text-zinc-400 mt-1">
                    Select a survivor idea from Phase Mine to run through the Data Miner. The agent will research market
                    size, competitors, and validate your assumptions.
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
                    const hasReport = !!session.verifications[idea.id];
                    const isStrongInvest = idea.verdict === 'STRONG_INVEST';
                    return (
                      <Card
                        key={idea.id}
                        onClick={() => setSelectedIdea(idea)}
                        className={`p-4 cursor-pointer transition-all hover:scale-[1.01] ${
                          isStrongInvest
                            ? 'bg-emerald-900/20 border-emerald-700/50 hover:border-emerald-500'
                            : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                isStrongInvest ? 'bg-emerald-500/20' : 'bg-zinc-800'
                              }`}
                            >
                              <Trophy className={`w-5 h-5 ${isStrongInvest ? 'text-emerald-300' : 'text-zinc-400'}`} />
                            </div>
                            <div>
                              <h4 className="font-semibold text-zinc-100">{idea.title}</h4>
                              <p className="text-xs text-zinc-500 mt-0.5">
                                {idea.rawMarkdown.substring(0, 120).replace(/\*\*/g, '')}...
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {hasReport && <Badge className="bg-green-600 text-white text-xs">Verified</Badge>}
                            {idea.verdict && (
                              <Badge className={`${isStrongInvest ? 'bg-emerald-600' : 'bg-emerald-700'} text-white text-xs`}>
                                {isStrongInvest ? 'Strong Invest' : 'Invest'}
                              </Badge>
                            )}
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
      </main>

      <footer className="border-t border-zinc-800 px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-xs text-zinc-600 font-mono">
          <span>Verify • Market Research</span>
          <span>{session.modelChoice.provider} • {session.modelChoice.model}</span>
        </div>
      </footer>
    </div>
  );
}
