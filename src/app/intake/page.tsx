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
import {
  Terminal,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Compass,
  Play,
  Square,
  RefreshCw,
  Sparkles,
  Pencil,
  Eye,
  FileDown,
} from 'lucide-react';

function parseRecommendedThesis(output: string): string {
  const recSection = output.match(/##\s*Recommendation[\s\S]*$/i)?.[0] ?? '';
  const numMatch = recSection.match(/Thesis\s+([123])/i);
  if (!numMatch) return '';
  const num = numMatch[1];
  const coreBetMatch = output.match(
    new RegExp(`##\\s*Thesis\\s+${num}:[\\s\\S]*?\\*\\*Core Bet:\\*\\*\\s*([^\\n]+)`, 'i')
  );
  const nameMatch = output.match(new RegExp(`##\\s*Thesis\\s+${num}:\\s*(.+)`, 'i'));
  const name = nameMatch?.[1]?.trim() ?? '';
  const coreBet = coreBetMatch?.[1]?.trim().replace(/\*+/g, '').trim() ?? '';
  if (name && coreBet) return `${name}\n\n${coreBet}`;
  return name;
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
  const [chosen, setChosen] = useState('');
  const [saved, setSaved] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Seed the chosen-thesis textarea with the recommendation on first load
  useEffect(() => {
    if (session.thesis && !chosen) {
      setChosen(parseRecommendedThesis(session.thesis));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.thesis]);

  if (!ready) return null;

  const hasContext = session.founderContext.trim().length > 0;
  const hasThesis = !!session.thesis && session.thesis.trim().length > 0;
  const isFromInterview = hasThesis && thesisOutput === session.thesis;

  const runThesis = async () => {
    setThesisRunning(true);
    setThesisError(null);
    setThesisOutput('');
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
      const recommended = parseRecommendedThesis(full);
      if (recommended) setChosen(recommended);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') setThesisError('Stopped');
      else setThesisError(err instanceof Error ? err.message : 'Thesis generation failed');
    } finally {
      setThesisRunning(false);
    }
  };

  const stopThesis = () => abortRef.current?.abort();

  const saveChosenThesis = () => {
    if (!chosen.trim()) return;
    update((prev) => {
      const base = prev.founderContext.replace(/\n\n## Chosen Thesis[\s\S]*$/, '').trimEnd();
      return {
        thesis: chosen,
        founderContext: `${base}\n\n## Chosen Thesis\n${chosen.trim()}`,
      };
    });
    setSaved(true);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <AppHeader currentPhase="intake" />

      <main className="flex-1 p-6">
        {!hasContext ? (
          <div className="max-w-4xl mx-auto h-full flex items-center justify-center">
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
                      <>
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        View
                      </>
                    ) : (
                      <>
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Edit
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadMarkdown(session.founderContext, `founder-context-${Date.now()}.md`)}
                    className="text-zinc-400 hover:text-zinc-100 font-mono text-xs"
                  >
                    <FileDown className="w-3.5 h-3.5 mr-1" />
                    .md
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

            {/* ─── Thesis ─── */}
            <Card className="bg-zinc-900 border-zinc-800 p-5">
              <div className="flex items-start gap-4 mb-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                  <Compass className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-semibold text-zinc-100">Thesis</h2>
                    {isFromInterview && (
                      <Badge className="bg-cyan-900/40 text-cyan-300 border border-cyan-700/50 text-xs font-mono">
                        <Sparkles className="w-3 h-3 mr-1" />
                        From interview
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-zinc-400 mt-0.5">
                    3 candidate theses grounded in your profile and current industry trends. Pick one — it guides every downstream skill.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {thesisOutput && !thesisRunning && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadMarkdown(thesisOutput, `thesis-${Date.now()}.md`)}
                      className="text-zinc-400 hover:text-zinc-100 font-mono text-xs"
                    >
                      <FileDown className="w-3.5 h-3.5 mr-1" />
                      .md
                    </Button>
                  )}
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
                      <Square className="w-4 h-4 mr-2" />
                      Stop
                    </Button>
                  )}
                </div>
              </div>

              {thesisError && <p className="text-xs text-red-400 font-mono mb-3">{thesisError}</p>}

              <div className="bg-zinc-950 rounded-lg p-5 border border-zinc-800 min-h-[200px] max-h-[600px] overflow-y-auto">
                {thesisOutput ? (
                  renderMarkdownBlock(thesisOutput)
                ) : (
                  <span className="text-xs text-zinc-600 font-mono">
                    {thesisRunning
                      ? 'Generating thesis candidates...'
                      : 'Thesis candidates will appear here. Click Generate — or they will auto-populate after your interview.'}
                  </span>
                )}
              </div>
            </Card>

            {/* ─── Chosen Thesis ─── */}
            <Card className="bg-zinc-900 border-zinc-800 p-5">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className={`w-4 h-4 ${saved ? 'text-emerald-400' : 'text-zinc-500'}`} />
                <h3 className="font-mono text-sm text-zinc-200">Your Chosen Thesis</h3>
                {saved && (
                  <Badge className="bg-emerald-900/40 text-emerald-300 border border-emerald-700/50 text-xs ml-2">
                    Saved &amp; appended to Founder Context
                  </Badge>
                )}
              </div>
              <p className="text-xs text-zinc-500 mb-3">
                This thesis replaces <code className="text-zinc-400">## The Lens</code> in your Founder Context and guides every downstream skill.
              </p>
              <Textarea
                value={chosen}
                onChange={(e) => { setChosen(e.target.value); setSaved(false); }}
                placeholder="e.g., Automating tribal knowledge in boring B2B industries via Service-as-Software."
                className="min-h-[120px] bg-zinc-950 border-zinc-700 text-zinc-300 font-mono text-sm"
              />
              <div className="mt-3 flex justify-between items-center">
                <span className="text-xs text-zinc-500 font-mono">
                  {session.thesis
                    ? saved
                      ? 'Thesis confirmed and wired into your Founder Context.'
                      : 'Edit above, then confirm to wire it into every downstream skill.'
                    : 'No thesis saved yet.'}
                </span>
                <Button
                  onClick={saveChosenThesis}
                  disabled={!chosen.trim() || saved}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Confirm Thesis
                </Button>
              </div>
            </Card>

            {/* ─── Continue Interview (collapsible) ─── */}
            <Card className="bg-zinc-900 border-zinc-800">
              <button
                onClick={() => setShowChat((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-zinc-900/80 transition-colors rounded-t-lg"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-zinc-500" />
                  <span className="font-mono text-sm text-zinc-300">Continue Interview</span>
                  <span className="text-xs text-zinc-600 font-mono">
                    — add more signal via chat
                  </span>
                </div>
                {showChat ? (
                  <ChevronUp className="w-4 h-4 text-zinc-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-500" />
                )}
              </button>
              {showChat && (
                <div className="px-5 pb-5 border-t border-zinc-800 pt-4">
                  <IntakeSession />
                </div>
              )}
            </Card>
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
