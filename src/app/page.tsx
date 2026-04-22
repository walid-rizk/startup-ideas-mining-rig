'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AppHeader } from '@/components/app-header';
import { useSession } from '@/lib/session-context';
import { getVerdictRank } from '@/lib/session';
import type { IdeaResult as PublicIdeaResult } from '@/lib/types';
import { renderMarkdownBlock } from '@/lib/markdown-render';
import {
  Pickaxe,
  Package,
  ArrowRight,
  Terminal,
  CheckCircle,
  Circle,
  Trophy,
  Sparkles,
  Compass,
  Trash2,
  Undo2,
  ChevronDown,
  ChevronUp,
  Pin,
  Lightbulb,
  Search,
  FileText,
  Code2,
} from 'lucide-react';

export default function Home() {
  const { session, update, ready } = useSession();
  const [showFullContext, setShowFullContext] = useState(false);
  const [showDiscarded, setShowDiscarded] = useState(false);
  if (!ready) return null;

  const discardIdea = (idea: PublicIdeaResult) => {
    update((prev) => ({
      survivors: prev.survivors.filter((s) => s.id !== idea.id),
      allIdeas: prev.allIdeas.filter((s) => s.id !== idea.id),
      discardedIdeas: [...prev.discardedIdeas, idea],
    }));
  };

  const togglePin = (idea: PublicIdeaResult) => {
    update((prev) => ({
      survivors: prev.survivors.map((s) => (s.id === idea.id ? { ...s, pinned: !s.pinned } : s)),
      allIdeas: prev.allIdeas.map((s) => (s.id === idea.id ? { ...s, pinned: !s.pinned } : s)),
    }));
  };

  const restoreIdea = (idea: PublicIdeaResult) => {
    update((prev) => ({
      discardedIdeas: prev.discardedIdeas.filter((d) => d.id !== idea.id),
      survivors: idea.verdict === 'STRONG_INVEST' || idea.verdict === 'INVEST'
        ? [...prev.survivors, idea]
        : prev.survivors,
      allIdeas: [...prev.allIdeas, idea],
    }));
  };

  const deleteIdeaPermanently = (idea: PublicIdeaResult) => {
    if (!confirm(`Permanently delete "${idea.title}"? This cannot be undone.`)) return;
    update((prev) => {
      const verifications = { ...prev.verifications };
      delete verifications[idea.id];
      const prds = { ...prev.prds };
      delete prds[idea.id];
      const blueprints = { ...prev.blueprints };
      delete blueprints[idea.id];
      return {
        discardedIdeas: prev.discardedIdeas.filter((d) => d.id !== idea.id),
        verifications,
        prds,
        blueprints,
      };
    });
  };

  const hasIntake = session.founderContext.trim().length > 0;
  const hasThesis = !!session.thesis && session.thesis.trim().length > 0;
  const survivors = [...session.survivors].sort(
    (a, b) =>
      (a.verdict ? getVerdictRank(a.verdict) : 99) -
      (b.verdict ? getVerdictRank(b.verdict) : 99),
  );

  const verifiedCount = survivors.filter((s) => !!session.verifications[s.id]).length;
  const shapedCount = survivors.filter((s) => !!session.prds[s.id]).length;
  const blueprintedCount = survivors.filter((s) => !!session.blueprints[s.id]).length;

  const nextStep = (() => {
    if (!hasIntake) return { href: '/intake', label: 'Start Intake', reason: 'Tell the rig who you are before it can generate ideas for you.' };
    if (!hasThesis) return { href: '/intake', label: 'Build Thesis', reason: 'Pick the angle that will guide idea generation.' };
    if (survivors.length === 0) return { href: '/mine', label: 'Start Mining', reason: 'Run the Gauntlet to surface investable ideas.' };
    if (verifiedCount < survivors.length) return { href: '/verify', label: 'Verify Survivors', reason: `${survivors.length - verifiedCount} survivor${survivors.length - verifiedCount === 1 ? '' : 's'} still need${survivors.length - verifiedCount === 1 ? 's' : ''} market validation.` };
    if (shapedCount < survivors.length) return { href: '/shape', label: 'Shape PRDs', reason: `${survivors.length - shapedCount} survivor${survivors.length - shapedCount === 1 ? '' : 's'} still need${survivors.length - shapedCount === 1 ? 's' : ''} a PRD.` };
    if (blueprintedCount < survivors.length) return { href: '/blueprint', label: 'Architect Blueprints', reason: `${survivors.length - blueprintedCount} survivor${survivors.length - blueprintedCount === 1 ? '' : 's'} still need${survivors.length - blueprintedCount === 1 ? 's' : ''} a technical plan.` };
    if (!session.synthesis) return { href: '/synthesize', label: 'Synthesize', reason: 'Package the session into an investor brief or build packet.' };
    return { href: '/synthesize', label: 'Review Synthesis', reason: 'All phases complete. Revisit the final packet or rerun any phase.' };
  })();

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <AppHeader currentPhase="home" />

      {/* Main */}
      <main className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {!hasIntake ? (
            <EmptyState />
          ) : (
            <>
              {/* Next step nudge */}
              <Card className="bg-gradient-to-br from-zinc-900 to-zinc-900/50 border-zinc-800 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                      <Sparkles className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-zinc-500 font-mono mb-1">NEXT STEP</div>
                      <h2 className="text-lg font-semibold text-zinc-100">{nextStep.label}</h2>
                      <p className="text-sm text-zinc-400 mt-1">{nextStep.reason}</p>
                    </div>
                  </div>
                  <Link href={nextStep.href} className="shrink-0">
                    <Button className="bg-amber-600 hover:bg-amber-700 text-white font-mono">
                      Go
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </Card>

              {/* Thesis card */}
              <Card className="bg-zinc-900 border-zinc-800 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-cyan-400" />
                    <span className="font-mono text-sm text-zinc-300">FOUNDER CONTEXT</span>
                    {hasThesis && (
                      <Badge variant="outline" className="text-cyan-400 border-cyan-400/50 text-xs">
                        Thesis Ready
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowFullContext((v) => !v)}
                      className="text-zinc-400 hover:text-zinc-100 font-mono text-xs"
                    >
                      {showFullContext ? 'Hide Context' : 'View Context'}
                    </Button>
                    <Link href="/intake">
                      <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100 font-mono text-xs">
                        {hasThesis ? 'Edit in Intake' : 'Build Thesis'}
                      </Button>
                    </Link>
                  </div>
                </div>
                {showFullContext ? (
                  <div className="bg-zinc-950 rounded-lg p-5 border border-zinc-800 max-h-[600px] overflow-y-auto">
                    {renderMarkdownBlock(session.founderContext)}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                    {session.founderContext.substring(0, 500).replace(/[#*`]/g, '').trim()}
                    {session.founderContext.length > 500 && '…'}
                  </p>
                )}
              </Card>

              {/* Lifetime stats */}
              {(session.allIdeas.length + session.discardedIdeas.length) > 0 && (
                <LifetimeStats
                  ideasMined={session.allIdeas.length + session.discardedIdeas.length}
                  survivors={
                    [...session.allIdeas, ...session.discardedIdeas].filter(
                      (i) => i.verdict === 'STRONG_INVEST' || i.verdict === 'INVEST',
                    ).length
                  }
                  verified={Object.keys(session.verifications).length}
                  prds={Object.keys(session.prds).length}
                  blueprints={Object.keys(session.blueprints).length}
                />
              )}

              {/* Survivors matrix */}
              <Card className="bg-zinc-900 border-zinc-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-emerald-400" />
                    <span className="font-mono text-sm text-zinc-300">SURVIVORS</span>
                    <Badge variant="outline" className="text-emerald-400 border-emerald-400/50 text-xs">
                      {survivors.length}
                    </Badge>
                  </div>
                  <div className="flex gap-2 text-xs font-mono text-zinc-500">
                    <span>{verifiedCount}/{survivors.length} verified</span>
                    <span className="text-zinc-700">•</span>
                    <span>{shapedCount}/{survivors.length} shaped</span>
                    <span className="text-zinc-700">•</span>
                    <span>{blueprintedCount}/{survivors.length} blueprinted</span>
                  </div>
                </div>

                {survivors.length === 0 ? (
                  <div className="bg-zinc-950 rounded-lg p-8 border border-dashed border-zinc-800 text-center">
                    <Pickaxe className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                    <p className="text-sm text-zinc-400 mb-4">
                      No survivors yet. Run Mine to surface investable ideas.
                    </p>
                    <Link href="/mine">
                      <Button className="bg-red-600 hover:bg-red-700 text-white font-mono" size="sm">
                        Start Mining
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Matrix header */}
                    <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto] gap-3 px-3 py-1 text-xs text-zinc-600 font-mono uppercase tracking-wide">
                      <div>Idea</div>
                      <div className="w-14 text-center">Moat</div>
                      <div className="w-20 text-center">Founder&nbsp;Fit</div>
                      <div className="w-28 text-center">Verdict</div>
                      <div className="w-16 text-center">Verify</div>
                      <div className="w-16 text-center">Shape</div>
                      <div className="w-16 text-center">Architect</div>
                      <div className="w-16"></div>
                    </div>
                    {survivors.map((s) => {
                      const verified = !!session.verifications[s.id];
                      const shaped = !!session.prds[s.id];
                      const blueprinted = !!session.blueprints[s.id];
                      const isStrong = s.verdict === 'STRONG_INVEST';
                      return (
                        <div
                          key={s.id}
                          className={`grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto] gap-3 items-center px-3 py-2.5 rounded-lg border transition-colors ${
                            isStrong
                              ? 'bg-emerald-900/10 border-emerald-800/50'
                              : 'bg-zinc-950 border-zinc-800'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-sm text-zinc-200 truncate font-medium">{s.title}</div>
                            {s.oneLiner && (
                              <div className="text-xs text-zinc-500 truncate italic mt-0.5">&quot;{s.oneLiner}&quot;</div>
                            )}
                          </div>
                          <DashboardScore score={s.moatScore ?? 0} width="w-14" />
                          <DashboardScore score={s.founderFitScore ?? 0} width="w-20" />
                          <div className="w-28 flex justify-center">
                            <Badge className={`text-[10px] whitespace-nowrap ${isStrong ? 'bg-emerald-600' : 'bg-emerald-700'} text-white`}>
                              {isStrong ? 'STRONG INVEST' : 'INVEST'}
                            </Badge>
                          </div>
                          <PhaseCell href="/verify" done={verified} />
                          <PhaseCell href="/shape" done={shaped} />
                          <PhaseCell href="/blueprint" done={blueprinted} />
                          <div className="w-16 flex justify-center gap-1">
                            <button
                              onClick={() => togglePin(s)}
                              className={`p-1 rounded transition-colors ${
                                s.pinned
                                  ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10'
                                  : 'text-zinc-600 hover:text-amber-400 hover:bg-amber-400/10'
                              }`}
                              title={s.pinned ? 'Unpin — will be wiped on next Start Mining' : 'Pin — preserve across Start Mining runs'}
                            >
                              <Pin className={`w-3.5 h-3.5 ${s.pinned ? 'fill-current' : ''}`} />
                            </button>
                            <button
                              onClick={() => discardIdea(s)}
                              className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                              title="Discard idea"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Synthesis row */}
                {survivors.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm text-zinc-300 font-mono">SYNTHESIS</span>
                      {session.synthesis ? (
                        <Badge className="bg-emerald-600 text-white text-xs">Generated</Badge>
                      ) : (
                        <Badge variant="outline" className="text-zinc-500 border-zinc-700 text-xs">Not generated</Badge>
                      )}
                      <span className="text-xs text-zinc-500 font-mono ml-1">
                        (one packet per run — pick a focus survivor on the Synthesize page)
                      </span>
                    </div>
                    <Link href="/synthesize">
                      <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100 font-mono text-xs">
                        {session.synthesis ? 'View / Regenerate' : 'Generate'}
                        <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                )}

                {/* Discarded pile */}
                {session.discardedIdeas.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-zinc-800">
                    <button
                      onClick={() => setShowDiscarded((v) => !v)}
                      className="w-full flex items-center justify-between text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors py-1"
                    >
                      <div className="flex items-center gap-1.5">
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Discarded ({session.discardedIdeas.length})</span>
                      </div>
                      {showDiscarded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {showDiscarded && (
                      <div className="mt-2 space-y-1.5">
                        {session.discardedIdeas.map((idea) => (
                          <div
                            key={idea.id}
                            className="rounded-lg px-3 py-2 bg-zinc-950 border border-zinc-800/50 flex items-center gap-3 opacity-60"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="font-mono text-xs text-zinc-500 line-through truncate block">
                                {idea.title}
                              </span>
                              {idea.verdict && (
                                <span className="text-[10px] text-zinc-600 font-mono">
                                  was {idea.verdict.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => restoreIdea(idea)}
                              className="p-1 rounded text-zinc-500 hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors shrink-0"
                              title="Restore idea"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteIdeaPermanently(idea)}
                              className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
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
              </Card>
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-zinc-800 px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-zinc-600 font-mono">
          <span>Dashboard</span>
          <span>{session.modelChoice.provider} • {session.modelChoice.model}</span>
        </div>
      </footer>
    </div>
  );
}

function dashboardScoreColor(score: number): string {
  if (score >= 9) return 'text-emerald-300';
  if (score >= 7) return 'text-green-300';
  if (score >= 5) return 'text-amber-300';
  if (score >= 3) return 'text-orange-300';
  if (score > 0) return 'text-red-300';
  return 'text-zinc-600';
}

function DashboardScore({ score, width = 'w-14' }: { score: number; width?: string }) {
  return (
    <div className={`${width} text-center`}>
      <span className={`text-sm font-bold font-mono ${dashboardScoreColor(score)}`}>
        {score > 0 ? score : '—'}
      </span>
    </div>
  );
}

function PhaseCell({ href, done }: { href: string; done: boolean }) {
  return (
    <Link href={href} className="w-16 flex justify-center" title={done ? 'Done — click to revisit' : 'Not yet — click to run'}>
      {done ? (
        <CheckCircle className="w-5 h-5 text-emerald-400 hover:text-emerald-300 transition-colors" />
      ) : (
        <Circle className="w-5 h-5 text-zinc-600 hover:text-zinc-400 transition-colors" />
      )}
    </Link>
  );
}

function LifetimeStats({
  ideasMined,
  survivors,
  verified,
  prds,
  blueprints,
}: {
  ideasMined: number;
  survivors: number;
  verified: number;
  prds: number;
  blueprints: number;
}) {
  const stats = [
    { label: 'Mined', value: ideasMined, icon: Lightbulb, color: 'text-orange-400', bar: 'bg-orange-500' },
    { label: 'Survived', value: survivors, icon: Trophy, color: 'text-emerald-400', bar: 'bg-emerald-500' },
    { label: 'Verified', value: verified, icon: Search, color: 'text-yellow-400', bar: 'bg-yellow-500' },
    { label: 'PRDs', value: prds, icon: FileText, color: 'text-blue-400', bar: 'bg-blue-500' },
    { label: 'Blueprints', value: blueprints, icon: Code2, color: 'text-purple-400', bar: 'bg-purple-500' },
  ];

  const max = Math.max(...stats.map((s) => s.value), 1);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Pickaxe className="w-3 h-3 text-zinc-600" />
        <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-widest">All-time totals</span>
      </div>
      <div className="grid grid-cols-5 gap-2">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 flex items-center gap-2.5">
          <stat.icon className={`w-3.5 h-3.5 ${stat.color} shrink-0`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className={`text-lg font-bold font-mono leading-none ${stat.color}`}>{stat.value}</span>
              <span className="text-[10px] text-zinc-500 font-mono uppercase">{stat.label}</span>
            </div>
            <div className="w-full h-0.5 rounded-full bg-zinc-800 mt-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full ${stat.bar} transition-all duration-500`}
                style={{ width: `${(stat.value / max) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="bg-gradient-to-br from-zinc-900 to-zinc-900/50 border-zinc-800 p-10 text-center">
      <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 mx-auto mb-6 flex items-center justify-center">
        <Terminal className="w-8 h-8 text-zinc-900" />
      </div>
      <h2 className="text-2xl font-semibold text-zinc-100 mb-3">Welcome to the Rig</h2>
      <p className="text-sm text-zinc-400 max-w-xl mx-auto leading-relaxed mb-6">
        This is an autonomous startup-idea validator. It mines ideas tailored to your background,
        roasts them like a VC, verifies market assumptions, and produces a PRD and technical blueprint —
        all without you reading a hundred Medium articles.
      </p>
      <p className="text-sm text-zinc-500 mb-8">
        Start by telling the Interviewer who you are.
      </p>
      <Link href="/intake">
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono">
          <Terminal className="w-4 h-4 mr-2" />
          Start Intake
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </Link>
      <p className="text-xs text-zinc-600 font-mono mt-6">
        Or import an existing session JSON via the toolbar above.
      </p>
    </Card>
  );
}
