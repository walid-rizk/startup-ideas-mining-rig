"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import WarRoom from "@/components/mining/war-room";
import { ArrowRight, Terminal } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/lib/session-context";
import { AppHeader } from "@/components/app-header";
import type { IdeaResult } from "@/lib/types";

export default function MinePage() {
  const { session, update, ready } = useSession();

  const handleComplete = (survivors: IdeaResult[], allIdeas: IdeaResult[]) => {
    update({ survivors, allIdeas });
  };

  const handleDiscard = (idea: IdeaResult) => {
    update((prev) => ({
      survivors: prev.survivors.filter((s) => s.id !== idea.id),
      allIdeas: prev.allIdeas.filter((s) => s.id !== idea.id),
      discardedIdeas: [...prev.discardedIdeas, idea],
    }));
  };

  const handleRestore = (idea: IdeaResult) => {
    update((prev) => ({
      discardedIdeas: prev.discardedIdeas.filter((d) => d.id !== idea.id),
      survivors: idea.verdict === 'STRONG_INVEST' || idea.verdict === 'INVEST'
        ? [...prev.survivors, idea]
        : prev.survivors,
      allIdeas: [...prev.allIdeas, idea],
    }));
  };

  if (!ready) return null;

  const hasContext = session.founderContext.trim().length > 0;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <AppHeader currentPhase="mine" />

      <main className="flex-1 p-6">
        {!hasContext ? (
          <div className="max-w-4xl mx-auto">
            <Card className="bg-zinc-900 border-zinc-800 p-8 text-center">
              <div className="w-12 h-12 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
                <Terminal className="w-6 h-6 text-amber-400" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-100 mb-2">
                Founder Context Required
              </h2>
              <p className="text-sm text-zinc-400 mb-6 max-w-md mx-auto">
                The Futurist reads your Founder Context before generating ideas. Set it up
                in Intake first.
              </p>
              <Link href="/intake">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono">
                  <Terminal className="w-4 h-4 mr-2" />
                  Go to Intake
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </Card>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Compact context reference */}
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono">
                <div className="flex items-center gap-2 min-w-0">
                  <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-zinc-400 shrink-0">Context:</span>
                  <span className="text-zinc-500 truncate">
                    {session.founderContext.replace(/[#*`]/g, '').split('\n').filter(Boolean)[0]?.substring(0, 140) ?? ''}
                  </span>
                </div>
                <Link href="/intake">
                  <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100 font-mono text-xs shrink-0">
                    Edit in Intake
                  </Button>
                </Link>
              </div>
            </div>

            <WarRoom
              userContext={session.founderContext}
              modelChoice={session.modelChoice}
              onComplete={handleComplete}
              onDiscard={handleDiscard}
              onRestore={handleRestore}
              initialSurvivors={session.survivors.length > 0 ? session.survivors : undefined}
              initialAllIdeas={session.allIdeas.length > 0 ? session.allIdeas : undefined}
              discardedIdeas={session.discardedIdeas}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-800 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-zinc-600 font-mono">
          <span>Mine (Spark &amp; Roast) • 3 Batches Max • 4 Survivors Target</span>
          <span>{session.modelChoice.provider} • {session.modelChoice.model}</span>
        </div>
      </footer>
    </div>
  );
}
