'use client';

import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Loader2,
  TrendingUp,
  AlertTriangle,
  Clock,
  Building2,
  MessageSquareQuote,
  Skull,
  BarChart3,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ModelChoice } from '@/lib/types';
import { modelHasLiveSearch } from '@/lib/types';
import { parseMarketConfidence as parseMarketConfidenceLevel } from '@/lib/session';
import { streamToText, ensureOk } from '@/lib/streaming';
import { extractTldr } from '@/lib/markdown-render';
import { usePhaseRun, startPhaseRun, updatePhaseOutput, completePhaseRun, failPhaseRun, stopPhaseRun, clearPhaseRun, getPhaseRun } from '@/lib/phase-status';

interface VerifySessionProps {
  userContext: string;
  ideaId: string;
  idea: {
    title: string;
    content: string;
    critique?: string;
  };
  vcMemo?: string;
  modelChoice: ModelChoice;
  initialReport?: string;
  onComplete?: (report: string) => void;
}

export default function VerifySession({ userContext, ideaId, idea, vcMemo, modelChoice, initialReport, onComplete }: VerifySessionProps) {
  const phaseRun = usePhaseRun('verify');
  const isActiveRun = phaseRun != null && phaseRun.ideaId === ideaId;
  const isVerifying = !!(isActiveRun && phaseRun!.isRunning);
  const researchOutput = isActiveRun ? phaseRun!.output : (initialReport ?? '');
  const error = isActiveRun ? (phaseRun!.error ?? null) : null;
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [researchOutput]);

  useEffect(() => {
    return () => {
      const run = getPhaseRun('verify');
      if (run && !run.isRunning) clearPhaseRun('verify');
    };
  }, []);

  const startVerification = async () => {
    if (phaseRun?.isRunning) return;
    const ac = new AbortController();
    const runId = startPhaseRun('verify', ideaId, ac);

    try {
      const response = await fetch('/api/mining/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userContext,
          idea: `## ${idea.title}\n\n${idea.content}`,
          vcMemo,
          modelChoice,
        }),
        signal: ac.signal,
      });

      await ensureOk(response, 'Failed to verify idea');

      const fullText = await streamToText(response, (text) => updatePhaseOutput('verify', runId, text));
      completePhaseRun('verify', runId);
      onComplete?.(fullText);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        failPhaseRun('verify', runId, 'Verification stopped');
      } else {
        failPhaseRun('verify', runId, err instanceof Error ? err.message : 'Verification failed');
      }
    }
  };

  const stopVerification = () => {
    stopPhaseRun('verify');
  };

  // Parse sections from research output
  const parseSection = (label: string): string => {
    // Escape special regex characters in label
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      // Match ## SECTION HEADER followed by content until next ## or end
      new RegExp(`##\\s*${escapedLabel}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i'),
      // Match **SECTION:** content
      new RegExp(`\\*\\*${escapedLabel}:?\\*\\*\\s*([\\s\\S]*?)(?=\\n##|$)`, 'i'),
      // Match SECTION: content (no bold)
      new RegExp(`${escapedLabel}:?\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = researchOutput.match(pattern);
      if (match && match[1].trim()) return match[1].trim();
    }
    return '';
  };

  // Strip markdown formatting and render clean text
  const formatMarkdown = (text: string): React.ReactNode => {
    // Split by bold markers and render with proper styling
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-zinc-200">{part.slice(2, -2)}</strong>;
      }
      // Also handle single * for italic
      if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  // Strip all markdown for plain text contexts
  const stripMarkdown = (text: string): string => {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // Bold
      .replace(/\*([^*]+)\*/g, '$1')       // Italic
      .replace(/`([^`]+)`/g, '$1')         // Code
      .replace(/^#+\s*/gm, '')             // Headers
      .replace(/^\s*[-*]\s+/gm, '• ')      // List items
      .trim();
  };

  // Parse markdown table to structured data
  const parseTable = (content: string): { headers: string[], rows: string[][] } | null => {
    const lines = content.split('\n').filter(line => line.includes('|'));
    if (lines.length < 2) return null;

    const parseRow = (line: string): string[] =>
      line.split('|').map(cell => cell.trim()).filter(cell => cell && !cell.match(/^[-:]+$/));

    const headers = parseRow(lines[0]);
    const rows = lines.slice(2).map(parseRow).filter(row => row.length > 0);

    return headers.length > 0 ? { headers, rows } : null;
  };

  // Render section content with special handling for tables
  const renderSectionContent = (sectionKey: string, content: string) => {
    // Special handling for competitor landscape - render as table
    if (sectionKey === 'competitors') {
      const table = parseTable(content);
      if (table && table.rows.length > 0) {
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-700">
                  {table.headers.map((header, i) => (
                    <th key={i} className="text-left p-2 text-zinc-400 font-semibold">
                      {stripMarkdown(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-b border-zinc-800/50">
                    {row.map((cell, j) => (
                      <td key={j} className="p-2 text-zinc-300">
                        {stripMarkdown(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
    }

    // Default: render as formatted text with markdown styling (no truncation)
    return (
      <div className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
        {formatMarkdown(content)}
      </div>
    );
  };

  const parseMarketConfidence = (): { level: string; color: string; bgColor: string; borderColor: string } | null => {
    const level = parseMarketConfidenceLevel(researchOutput);
    if (!level) return null;
    const config: Record<string, { color: string; bgColor: string; borderColor: string }> = {
      STRONG:       { color: 'text-emerald-300', bgColor: 'bg-emerald-500/20', borderColor: 'border-emerald-500/30' },
      MODERATE:     { color: 'text-amber-300', bgColor: 'bg-amber-500/20', borderColor: 'border-amber-500/30' },
      WEAK:         { color: 'text-red-300', bgColor: 'bg-red-500/20', borderColor: 'border-red-500/30' },
      INSUFFICIENT: { color: 'text-zinc-300', bgColor: 'bg-zinc-500/20', borderColor: 'border-zinc-500/30' },
    };
    return { level, ...config[level] };
  };

  const marketConfidence = parseMarketConfidence();

  const sections = [
    { key: 'market', label: 'MARKET SNAPSHOT', icon: BarChart3, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
    { key: 'competitors', label: 'COMPETITOR LANDSCAPE', icon: Building2, color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20' },
    { key: 'customer', label: 'CUSTOMER VOICE', icon: MessageSquareQuote, color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/20' },
    { key: 'graveyard', label: 'GRAVEYARD CHECK', icon: Skull, color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
    { key: 'risks', label: 'REGULATORY & STRUCTURAL RISKS', icon: AlertTriangle, color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' },
    { key: 'timing', label: 'TIMING VERDICT', icon: Clock, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/20' },
  ];

  const inferSignal = (sectionKey: string, content: string): 'strong' | 'mixed' | 'weak' | null => {
    const lower = content.toLowerCase();

    if (sectionKey === 'market') {
      if (/sizing check:\*?\*?\s*supported/i.test(content)) return 'strong';
      if (/sizing check:\*?\*?\s*refined/i.test(content)) return 'mixed';
      if (/sizing check:\*?\*?\s*(overstated|breaks)/i.test(content)) return 'weak';
      return 'mixed';
    }

    if (sectionKey === 'customer') {
      if (/evidence strength:\*?\*?\s*strong/i.test(content)) return 'strong';
      if (/evidence strength:\*?\*?\s*mixed/i.test(content)) return 'mixed';
      if (/evidence strength:\*?\*?\s*thin/i.test(content)) return 'weak';
      return 'mixed';
    }

    if (sectionKey === 'timing') {
      if (/status:\*?\*?\s*just_right/i.test(content)) return 'strong';
      if (/status:\*?\*?\s*too_early/i.test(content)) return 'mixed';
      if (/status:\*?\*?\s*(saturated|tar_pit)/i.test(content)) return 'weak';
      return 'mixed';
    }

    if (sectionKey === 'competitors') {
      if (lower.includes('no direct competitor') || lower.includes('white space') || lower.includes('blue ocean')) return 'strong';
      if (lower.includes('crowded') || lower.includes('dominated by') || lower.includes('red ocean')) return 'weak';
      return 'mixed';
    }

    if (sectionKey === 'graveyard') {
      if (lower.includes('no notable failures') || lower.includes('no dead startups')) return 'strong';
      if (lower.includes('multiple failures') || lower.includes('graveyard is full') || lower.includes('many have tried')) return 'weak';
      return 'mixed';
    }

    if (sectionKey === 'risks') {
      if (lower.includes('low risk') || lower.includes('minimal regulatory') || lower.includes('no major')) return 'strong';
      if (lower.includes('high risk') || lower.includes('significant regulatory') || lower.includes('major barrier') || lower.includes('legal minefield')) return 'weak';
      return 'mixed';
    }

    return null;
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-yellow-400" />
          <span className="font-mono text-sm text-zinc-300">MARKET RESEARCH</span>
          {marketConfidence && (
            <Badge className={`text-xs border ${marketConfidence.bgColor} ${marketConfidence.borderColor} ${marketConfidence.color}`}>
              {marketConfidence.level}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {!isVerifying ? (
            <Button
              onClick={startVerification}
              size="sm"
              className="bg-yellow-600 hover:bg-yellow-700 text-white font-mono text-xs"
            >
              <Search className="w-3.5 h-3.5 mr-1.5" />
              {initialReport || researchOutput ? 'RE-RUN VERIFICATION' : 'RUN VERIFICATION'}
            </Button>
          ) : (
            <Button
              onClick={stopVerification}
              size="sm"
              variant="destructive"
              className="font-mono text-xs"
            >
              STOP
            </Button>
          )}
        </div>
      </div>

      {/* No-live-search notice */}
      {!modelHasLiveSearch(modelChoice) && (
        <div className="flex items-start gap-2 text-xs text-amber-400/90 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            This model has no live web search — research runs on training knowledge only.
            Figures are labeled <span className="font-mono">Knowledge / Proxy / Inferred</span> and
            Market Confidence is capped at MODERATE. Treat numbers as starting points to verify, not facts.
          </span>
        </div>
      )}

      {/* Progress */}
      {isVerifying && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Data Miner analyzing market...
          </div>
        </div>
      )}

      {/* Research Output */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Raw Output Panel */}
        <Card className="bg-zinc-950 border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Search className={`w-4 h-4 ${isVerifying ? 'text-yellow-400 animate-pulse' : 'text-zinc-500'}`} />
            <span className="font-mono text-sm text-zinc-300">RAW OUTPUT</span>
            {isVerifying && (
              <Badge variant="outline" className="text-yellow-400 border-yellow-400/50 text-xs">
                RESEARCHING
              </Badge>
            )}
          </div>
          <div
            ref={outputRef}
            className="h-[500px] overflow-y-auto bg-zinc-900/50 rounded-lg p-3 text-xs font-mono text-zinc-400 whitespace-pre-wrap"
          >
            {researchOutput || (
              <span className="text-zinc-600">
                Click &quot;Run Verification&quot; to begin market research...
              </span>
            )}
          </div>
        </Card>

        {/* Structured Results Panel */}
        <Card className="bg-zinc-950 border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="font-mono text-sm text-zinc-300">RESEARCH INSIGHTS</span>
          </div>
          <div className="max-h-[600px] overflow-y-auto space-y-3 pr-2">
            {marketConfidence && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-lg p-4 border ${marketConfidence.bgColor} ${marketConfidence.borderColor}`}
              >
                <div className={`flex items-center gap-2 mb-2 ${marketConfidence.color}`}>
                  <TrendingUp className="w-4 h-4" />
                  <span className="font-mono text-xs font-semibold">MARKET CONFIDENCE</span>
                </div>
                <p className="text-sm text-zinc-100 leading-relaxed font-medium">{marketConfidence.level}</p>
                {(() => {
                  const m = researchOutput.match(/Market Confidence[:\s*]*(?:\*\*\s*)?(?:STRONG|MODERATE|WEAK|INSUFFICIENT)\s*\*?\*?\s*\n([^\n]+)/i);
                  return m ? <p className="text-xs text-zinc-400 mt-1">{m[1].replace(/^\*?\*?\s*/, '').replace(/\*?\*?\s*$/, '').trim()}</p> : null;
                })()}
              </motion.div>
            )}

            <AnimatePresence>
              {sections.map((section, index) => {
                const content = parseSection(section.label);
                if (!content && !isVerifying) return null;

                return (
                  <motion.div
                    key={section.key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`rounded-lg p-4 border ${section.bgColor} ${section.borderColor}`}
                  >
                    <div className={`flex items-center gap-2 mb-3 ${section.color}`}>
                      <section.icon className="w-4 h-4" />
                      <span className="font-mono text-xs font-semibold">{section.label}</span>
                      {content && <SignalBadge signal={inferSignal(section.key, content)} />}
                    </div>
                    {content ? (
                      <SectionWithTldr
                        sectionKey={section.key}
                        content={content}
                        renderBody={renderSectionContent}
                      />
                    ) : (
                      <div className="text-xs text-zinc-600 italic">
                        {isVerifying ? 'Analyzing...' : 'No data'}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {!researchOutput && !isVerifying && (
              <div className="text-center text-zinc-600 text-sm font-mono py-12">
                Research insights will appear here<br />
                after verification starts.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Error Display */}
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

function SignalBadge({ signal }: { signal: 'strong' | 'mixed' | 'weak' | null }) {
  if (!signal) return null;
  const config = {
    strong: { label: 'Strong', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    mixed: { label: 'Mixed', className: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    weak: { label: 'Weak', className: 'bg-red-500/20 text-red-300 border-red-500/30' },
  }[signal];
  return (
    <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${config.className}`}>
      {config.label}
    </span>
  );
}

function SectionWithTldr({
  sectionKey,
  content,
  renderBody,
}: {
  sectionKey: string;
  content: string;
  renderBody: (key: string, body: string) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const { tldr, body } = extractTldr(content);
  if (!tldr) {
    return (
      <div className="max-h-[300px] overflow-y-auto">
        {renderBody(sectionKey, content)}
      </div>
    );
  }
  return (
    <div onClick={() => body && setExpanded((v) => !v)} className={body ? 'cursor-pointer' : ''}>
      <p className="text-sm text-zinc-100 leading-relaxed font-medium mb-1">{tldr}</p>
      {body && (
        <>
          {expanded && (
            <div className="mt-2 max-h-[400px] overflow-y-auto">
              {renderBody(sectionKey, body)}
            </div>
          )}
          <span className="mt-1 text-[11px] font-mono text-zinc-500">
            {expanded ? '− Hide detail' : '+ Show detail'}
          </span>
        </>
      )}
    </div>
  );
}
