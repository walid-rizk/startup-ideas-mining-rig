'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AppHeader } from '@/components/app-header';
import IntakeSession from '@/components/mining/intake-session';
import { useSession } from '@/lib/session-context';
import { streamToText } from '@/lib/streaming';
import { renderMarkdownBlock } from '@/lib/markdown-render';
import Link from 'next/link';
import {
  Terminal,
  MessageSquare,
  CheckCircle,
  Compass,
  Play,
  Square,
  RefreshCw,
  Sparkles,
  Pencil,
  Eye,
  FileDown,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  Pickaxe,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ThesisFields {
  name: string;
  coreBet: string;
  whyNow: string;
  whyFounder: string;
  targetMarket: string;
  customer: string;
  scope: string;
  rulesOut: string;
}

function parseThesisCandidate(output: string, thesisNumber: number): ThesisFields | null {
  const num = String(thesisNumber);
  const nameMatch = output.match(new RegExp(`##\\s*Thesis\\s+${num}:\\s*(.+)`, 'i'));
  if (!nameMatch) return null;
  const name = nameMatch[1].trim()
    .replace(/\s*—\s*(The\s+)?(Grounded|Wild|Obvious|Timing|Counter)[^]*$/i, '')
    .replace(/\*+/g, '')
    .trim();

  const thesisBlock = output.match(
    new RegExp(`##\\s*Thesis\\s+${num}:[\\s\\S]*?(?=\\n##\\s|$)`, 'i')
  )?.[0] ?? '';

  const extract = (field: string): string => {
    const m = thesisBlock.match(new RegExp(`\\*\\*${field}:?\\*\\*\\s*([^\\n]+)`, 'i'));
    return m?.[1]?.trim().replace(/\*+/g, '').trim() ?? '';
  };

  return {
    name,
    coreBet: extract('Core Bet'),
    whyNow: extract('Why Now'),
    whyFounder: extract('Why This Founder'),
    targetMarket: extract('Target Market'),
    customer: extract('Customer'),
    scope: extract('Scope') || extract('Idea Surface'),
    rulesOut: extract('Rules Out'),
  };
}

function getThesisTag(output: string, thesisNumber: number): string {
  const num = String(thesisNumber);
  const match = output.match(new RegExp(`##\\s*Thesis\\s+${num}:[^—\\n]*—\\s*([^\\n]+)`, 'i'));
  return match?.[1]?.trim() ?? (thesisNumber === 1 ? 'The Grounded Pick' : 'The Wild Card');
}

function downloadMarkdown(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function IntakePage() {
  const { session, update, ready } = useSession();
  const [showChat, setShowChat] = useState(false);
  const [editContext, setEditContext] = useState(false);
  const [thesisOutput, setThesisOutput] = useState(session.thesis ?? '');
  const [thesisRunning, setThesisRunning] = useState(false);
  const [thesisError, setThesisError] = useState<string | null>(null);
  const [selectedThesis, setSelectedThesis] = useState<number | null>(null);
  const [thesesExpanded, setThesesExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (session.thesis) {
      setThesisOutput(session.thesis);
    }
  }, [session.thesis]);

  // Auto-detect which thesis was previously selected by checking Founder Context
  useEffect(() => {
    if (!session.thesis || selectedThesis !== null) return;
    const t1 = parseThesisCandidate(session.thesis, 1);
    const t2 = parseThesisCandidate(session.thesis, 2);
    const ctx = session.founderContext;
    if (t1 && ctx.includes(t1.coreBet)) { setSelectedThesis(1); setSaved(true); }
    else if (t2 && ctx.includes(t2.coreBet)) { setSelectedThesis(2); setSaved(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.thesis]);

  if (!ready) return null;

  const hasContext = session.founderContext.trim().length > 0;

  const runThesis = async () => {
    setThesisRunning(true);
    setThesisError(null);
    setThesisOutput('');
    setSelectedThesis(null);
    setThesesExpanded(false);
    setSaved(false);
    abortRef.current = new AbortController();
    try {
      const res = await fetch('/api/mining/thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userContext: session.founderContext,
          modelChoice: session.modelChoice,
        }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(`thesis-builder failed (${res.status})`);
      const full = await streamToText(res, setThesisOutput);
      update({ thesis: full });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') setThesisError('Stopped');
      else setThesisError(err instanceof Error ? err.message : 'Thesis generation failed');
    } finally {
      setThesisRunning(false);
    }
  };

  const stopThesis = () => abortRef.current?.abort();

  const restartInterview = () => {
    if (!window.confirm('This will clear your Founder Context, thesis, and interview history. Continue?')) return;
    update({ founderContext: '', thesis: null, intakeMessages: [] });
    setThesisOutput('');
    setSelectedThesis(null);
    setSaved(false);
    setEditContext(false);
    setShowChat(false);
  };

  const replaceSectionContent = (ctx: string, heading: string, newBody: string): string => {
    const re = new RegExp(`(## ${heading}\\n)[\\s\\S]*?(?=\\n## |$)`);
    if (re.test(ctx)) return ctx.replace(re, `$1${newBody}\n`);
    return ctx;
  };

  const selectThesis = (num: number) => {
    const fields = parseThesisCandidate(thesisOutput, num);
    if (!fields) return;
    setSelectedThesis(num);

    update((prev) => {
      let ctx = prev.founderContext;
      ctx = ctx.replace(/\n\n## Chosen Thesis[\s\S]*$/, '').trimEnd();
      if (fields.targetMarket.trim()) {
        ctx = replaceSectionContent(ctx, 'The Target', `Concrete: ${fields.targetMarket.trim()}`);
      }
      ctx = replaceSectionContent(ctx, 'The Lens', `Concrete: ${fields.name}\n\n${fields.coreBet}`);
      if (fields.customer.trim()) {
        ctx = replaceSectionContent(ctx, 'The Customer', `Concrete: ${fields.customer.trim()}`);
      }
      return { founderContext: ctx };
    });
    setSaved(true);
  };

  const thesis1 = thesisOutput ? parseThesisCandidate(thesisOutput, 1) : null;
  const thesis2 = thesisOutput ? parseThesisCandidate(thesisOutput, 2) : null;
  const tag1 = thesisOutput ? getThesisTag(thesisOutput, 1) : '';
  const tag2 = thesisOutput ? getThesisTag(thesisOutput, 2) : '';

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <AppHeader currentPhase="intake" />

      <main className="flex-1 p-6">
        {!hasContext ? (
          <div className="max-w-4xl mx-auto h-full flex items-center justify-center">
            <IntakeSession />
          </div>
        ) : showChat ? (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setShowChat(false)}
                variant="outline"
                size="sm"
                className="font-mono border-zinc-700"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Overview
              </Button>
              <span className="text-xs text-zinc-500 font-mono">
                Continue the interview or ask for specific changes to your context / thesis
              </span>
            </div>
            <IntakeSession />
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-5">
            {/* ─── Founder Context ─── */}
            <Card className="bg-zinc-900 border-zinc-800 p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span className="font-mono text-sm text-zinc-300">FOUNDER CONTEXT</span>
                  <Badge variant="outline" className="text-emerald-400 border-emerald-400/50 text-xs">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Ready
                  </Badge>
                  <span className="text-xs text-zinc-600 font-mono ml-1">
                    {session.founderContext.length.toLocaleString()} chars
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditContext((v) => !v)}
                    className="text-zinc-400 hover:text-zinc-100 font-mono text-xs"
                  >
                    {editContext ? (
                      <><Eye className="w-3.5 h-3.5 mr-1" />View</>
                    ) : (
                      <><Pencil className="w-3.5 h-3.5 mr-1" />Edit</>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadMarkdown(session.founderContext, `founder-context-${Date.now()}.md`)}
                    className="text-zinc-400 hover:text-zinc-100 font-mono text-xs"
                  >
                    <FileDown className="w-3.5 h-3.5 mr-1" />.md
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowChat(true)}
                    className="text-zinc-400 hover:text-cyan-400 font-mono text-xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5 mr-1" />
                    Continue Interview
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={restartInterview}
                    className="text-zinc-400 hover:text-red-400 font-mono text-xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />Restart
                  </Button>
                </div>
              </div>
              {editContext ? (
                <>
                  <Textarea
                    value={session.founderContext}
                    onChange={(e) => update({ founderContext: e.target.value })}
                    className="min-h-[500px] bg-zinc-950 border-zinc-700 text-zinc-300 font-mono text-sm leading-relaxed"
                    placeholder="# Founder Thesis: ..."
                  />
                  <p className="text-xs text-zinc-600 font-mono mt-2">
                    Edits auto-save and propagate to every downstream skill.
                  </p>
                </>
              ) : (
                <div className="bg-zinc-950 rounded-lg p-5 border border-zinc-800 max-h-[600px] overflow-y-auto">
                  {renderMarkdownBlock(session.founderContext)}
                </div>
              )}
            </Card>

            {/* ─── Divider ─── */}
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-700" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-zinc-950 px-4 text-xs font-mono text-zinc-500 uppercase tracking-wider">
                  Thesis Selection
                </span>
              </div>
            </div>

            {/* ─── Thesis ─── */}
            <Card className="bg-zinc-900 border-zinc-800 p-5">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                  <Compass className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-zinc-100">Thesis</h2>
                  <p className="text-sm text-zinc-400 mt-0.5">
                    2 candidate theses grounded in your profile. Click one to select it — it guides every downstream skill.
                    Or use <button onClick={() => setShowChat(true)} className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">Continue Interview</button> to describe your own and we&apos;ll sharpen it.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {!thesisRunning ? (
                    <Button
                      onClick={runThesis}
                      disabled={!hasContext}
                      variant={thesisOutput ? 'outline' : 'default'}
                      className={thesisOutput
                        ? 'font-mono border-zinc-700 hover:border-cyan-600 hover:text-cyan-400'
                        : 'bg-cyan-600 hover:bg-cyan-700 text-white font-mono'}
                    >
                      {thesisOutput ? (
                        <><RefreshCw className="w-4 h-4 mr-2" />Regenerate</>
                      ) : (
                        <><Play className="w-4 h-4 mr-2" />Generate</>
                      )}
                    </Button>
                  ) : (
                    <Button onClick={stopThesis} variant="destructive" className="font-mono">
                      <Square className="w-4 h-4 mr-2" />Stop
                    </Button>
                  )}
                </div>
              </div>

              {thesisError && <p className="text-xs text-red-400 font-mono mb-3">{thesisError}</p>}

              {thesis1 || thesis2 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { num: 1, fields: thesis1, tag: tag1 },
                    { num: 2, fields: thesis2, tag: tag2 },
                  ].map(({ num, fields, tag }) => {
                    if (!fields) return null;
                    const isSelected = selectedThesis === num;
                    const isExpanded = thesesExpanded;
                    return (
                      <div
                        key={num}
                        className={`rounded-lg border-2 transition-all flex flex-col ${
                          isSelected
                            ? 'border-cyan-500 bg-cyan-900/15'
                            : 'border-zinc-700 bg-zinc-950 hover:border-zinc-500'
                        }`}
                      >
                        {/* Compact summary — always visible */}
                        <div
                          className="p-4 cursor-pointer"
                          onClick={() => setThesesExpanded(!thesesExpanded)}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="outline" className={`text-xs font-mono ${
                              isSelected ? 'text-cyan-400 border-cyan-400/50' : 'text-zinc-400 border-zinc-600'
                            }`}>
                              {tag}
                            </Badge>
                            <div className="flex items-center gap-1.5">
                              {isSelected && <CheckCircle className="w-4 h-4 text-cyan-400" />}
                              {isExpanded
                                ? <ChevronUp className="w-4 h-4 text-zinc-500" />
                                : <ChevronDown className="w-4 h-4 text-zinc-500" />
                              }
                            </div>
                          </div>
                          <h3 className={`font-semibold text-sm mb-1.5 ${isSelected ? 'text-cyan-100' : 'text-zinc-200'}`}>
                            {fields.name}
                          </h3>
                          <p className="text-xs text-zinc-400 leading-relaxed">{fields.coreBet}</p>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-1.5 text-xs border-t border-zinc-800 pt-3">
                            {fields.whyNow && <div><span className="text-zinc-500 font-mono">WHY NOW:</span> <span className="text-zinc-300">{fields.whyNow}</span></div>}
                            {fields.whyFounder && <div><span className="text-zinc-500 font-mono">WHY YOU:</span> <span className="text-zinc-300">{fields.whyFounder}</span></div>}
                            {fields.targetMarket && <div><span className="text-zinc-500 font-mono">TARGET:</span> <span className="text-zinc-300">{fields.targetMarket}</span></div>}
                            {fields.customer && <div><span className="text-zinc-500 font-mono">CUSTOMER:</span> <span className="text-zinc-300">{fields.customer}</span></div>}
                            {fields.scope && <div><span className="text-zinc-500 font-mono">SCOPE:</span> <span className="text-zinc-300">{fields.scope}</span></div>}
                            {fields.rulesOut && <div><span className="text-zinc-500 font-mono">RULES OUT:</span> <span className="text-zinc-300">{fields.rulesOut}</span></div>}
                          </div>
                        )}

                        <div className="flex-1" />
                        {/* Select button */}
                        <div className="px-4 pb-3">
                          <button
                            onClick={() => selectThesis(num)}
                            className={`w-full text-xs font-mono py-1.5 rounded transition-colors ${
                              isSelected
                                ? 'bg-cyan-600/20 text-cyan-300 cursor-default'
                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                            }`}
                          >
                            {isSelected ? 'Selected' : 'Select this thesis'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : thesisRunning ? (
                <div className="bg-zinc-950 rounded-lg p-5 border border-zinc-800 min-h-[200px] max-h-[600px] overflow-y-auto">
                  {thesisOutput ? (
                    renderMarkdownBlock(thesisOutput)
                  ) : (
                    <span className="text-xs text-zinc-600 font-mono">
                      Generating thesis candidates...
                    </span>
                  )}
                </div>
              ) : (
                <div className="bg-zinc-950 rounded-lg p-8 border border-dashed border-zinc-800 text-center">
                  <Sparkles className="w-6 h-6 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500 font-mono">
                    Click Generate to create 2 thesis candidates from your Founder Context.
                  </p>
                </div>
              )}

              {saved && selectedThesis && (
                <p className="text-xs text-emerald-400 font-mono mt-3 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Thesis {selectedThesis} selected — Target, Lens, and Customer wired into your Founder Context.
                </p>
              )}
            </Card>

            {/* ─── Go to Mine ─── */}
            {hasContext && (
              <div className="flex justify-center pt-2">
                <Link href="/mine">
                  <Button className="bg-red-600 hover:bg-red-700 text-white font-mono px-8">
                    <Pickaxe className="w-4 h-4 mr-2" />
                    Start Mining
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-800 px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-xs text-zinc-600 font-mono">
          <span>Intake • Founder Context &amp; Thesis</span>
          <span>{session.modelChoice.provider} • {session.modelChoice.model}</span>
        </div>
      </footer>
    </div>
  );
}
