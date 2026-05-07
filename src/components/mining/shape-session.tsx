'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Loader2,
  Target,
  Users,
  Lightbulb,
  ListChecks,
  TrendingUp,
  XCircle,
  DollarSign,
  AlertTriangle,
  Rocket,
  LayoutDashboard,
  Download,
  FileDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ModelChoice } from '@/lib/types';
import { streamToText } from '@/lib/streaming';
import { extractTldr } from '@/lib/markdown-render';
import { marked } from 'marked';
import { usePhaseRun, startPhaseRun, updatePhaseOutput, completePhaseRun, failPhaseRun, stopPhaseRun, clearPhaseRun, getPhaseRun } from '@/lib/phase-status';

interface ShapeSessionProps {
  userContext: string;
  ideaId: string;
  idea: {
    title: string;
    content: string;
    critique?: string;
  };
  vcMemo?: string;
  marketResearch?: string;
  modelChoice: ModelChoice;
  initialPrd?: string;
  onComplete?: (prd: string) => void;
  onBack?: () => void;
}

export default function ShapeSession({ userContext, ideaId, idea, vcMemo, marketResearch, modelChoice, initialPrd, onComplete, onBack }: ShapeSessionProps) {
  const phaseRun = usePhaseRun('shape');
  const isActiveRun = phaseRun != null && phaseRun.ideaId === ideaId;
  const isShaping = !!(isActiveRun && phaseRun!.isRunning);
  const prdOutput = isActiveRun ? phaseRun!.output : (initialPrd ?? '');
  const error = isActiveRun ? (phaseRun!.error ?? null) : null;
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [prdOutput]);

  useEffect(() => {
    return () => {
      const run = getPhaseRun('shape');
      if (run && !run.isRunning) clearPhaseRun('shape');
    };
  }, []);

  // Strip markdown formatting
  const stripMarkdown = (text: string): string => {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^#+\s*/gm, '')
      .replace(/^\s*[-*]\s+/gm, '• ')
      .replace(/\*+/g, '')
      .trim();
  };

  // Format markdown with bold, checkboxes, and bullet rendering
  const formatMarkdown = (text: string): React.ReactNode => {
    // Split by lines first to handle line-based formatting
    const lines = text.split('\n');

    return lines.map((line, lineIndex) => {
      // Handle headers (### or ##)
      const h3Match = line.match(/^###\s+(.+)$/);
      if (h3Match) {
        return (
          <div key={lineIndex} className="text-zinc-200 font-semibold mt-3 mb-1">
            {formatInlineMarkdown(h3Match[1])}
          </div>
        );
      }

      const h2Match = line.match(/^##\s+(.+)$/);
      if (h2Match) {
        return (
          <div key={lineIndex} className="text-zinc-100 font-bold mt-4 mb-2">
            {formatInlineMarkdown(h2Match[1])}
          </div>
        );
      }

      // Handle checkboxes
      const uncheckedMatch = line.match(/^-?\s*\[\s*\]\s*(.+)$/);
      if (uncheckedMatch) {
        return (
          <div key={lineIndex} className="flex items-start gap-2 py-1">
            <span className="text-zinc-500">☐</span>
            <span>{formatInlineMarkdown(uncheckedMatch[1])}</span>
          </div>
        );
      }

      const checkedMatch = line.match(/^-?\s*\[x\]\s*(.+)$/i);
      if (checkedMatch) {
        return (
          <div key={lineIndex} className="flex items-start gap-2 py-1">
            <span className="text-emerald-400">☑</span>
            <span>{formatInlineMarkdown(checkedMatch[1])}</span>
          </div>
        );
      }

      // Handle bullet points
      const bulletMatch = line.match(/^[-•]\s+(.+)$/);
      if (bulletMatch) {
        return (
          <div key={lineIndex} className="flex items-start gap-2 py-1">
            <span className="text-zinc-500">•</span>
            <span>{formatInlineMarkdown(bulletMatch[1])}</span>
          </div>
        );
      }

      // Handle numbered lists
      const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (numberedMatch) {
        return (
          <div key={lineIndex} className="flex items-start gap-2 py-1">
            <span className="text-zinc-500 min-w-[1.5rem]">{numberedMatch[1]}.</span>
            <span>{formatInlineMarkdown(numberedMatch[2])}</span>
          </div>
        );
      }

      // Handle ❌ emoji lines (non-goals)
      if (line.trim().startsWith('❌')) {
        return (
          <div key={lineIndex} className="py-1">
            {formatInlineMarkdown(line)}
          </div>
        );
      }

      // Regular line with inline formatting
      if (line.trim()) {
        return (
          <div key={lineIndex} className="py-0.5">
            {formatInlineMarkdown(line)}
          </div>
        );
      }

      // Empty line
      return <div key={lineIndex} className="h-2" />;
    });
  };

  // Handle inline markdown (bold, italic)
  const formatInlineMarkdown = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-zinc-200">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const startShaping = async () => {
    if (phaseRun?.isRunning) return;
    const ac = new AbortController();
    const runId = startPhaseRun('shape', ideaId, ac);

    try {
      const response = await fetch('/api/mining/shape', {
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

      if (!response.ok) throw new Error('Failed to shape idea');

      const fullText = await streamToText(response, (text) => updatePhaseOutput('shape', runId, text));
      completePhaseRun('shape', runId);
      onComplete?.(fullText);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        failPhaseRun('shape', runId, 'Shaping stopped');
      } else {
        failPhaseRun('shape', runId, err instanceof Error ? err.message : 'Shaping failed');
      }
    }
  };

  const stopShaping = () => {
    stopPhaseRun('shape');
  };

  const downloadMarkdown = () => {
    const blob = new Blob([prdOutput], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prd-${idea.title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadWord = async () => {
    const bodyHtml = await marked.parse(prdOutput, { async: true });
    const fullHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>PRD — ${idea.title}</title>
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
    a.download = `prd-${idea.title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Parse sections from PRD output
  const parseSection = (label: string): string => {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`##\\s*${escapedLabel}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i'),
      new RegExp(`\\*\\*${escapedLabel}:?\\*\\*\\s*([\\s\\S]*?)(?=\\n##|\\n\\*\\*[A-Z]|$)`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = prdOutput.match(pattern);
      if (match && match[1].trim()) return match[1].trim();
    }
    return '';
  };

  // Parse table from content
  const parseTable = (content: string): { headers: string[], rows: string[][] } | null => {
    const lines = content.split('\n').filter(line => line.includes('|'));
    if (lines.length < 2) return null;

    const parseRow = (line: string): string[] =>
      line.split('|').map(cell => cell.trim()).filter(cell => cell && !cell.match(/^[-:]+$/));

    const headers = parseRow(lines[0]);
    const rows = lines.slice(2).map(parseRow).filter(row => row.length > 0);

    return headers.length > 0 ? { headers, rows } : null;
  };

  // Render section content
  const renderSectionContent = (content: string, isTable: boolean = false) => {
    if (isTable) {
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

    return (
      <div className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
        {formatMarkdown(content)}
      </div>
    );
  };

  const sections = [
    { key: 'overview', label: 'PRODUCT OVERVIEW', icon: LayoutDashboard, color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20' },
    { key: 'problem', label: 'PROBLEM STATEMENT', icon: Target, color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
    { key: 'user', label: 'TARGET USER', icon: Users, color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/20' },
    { key: 'solution', label: 'THE SOLUTION', icon: Lightbulb, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
    { key: 'journey', label: 'USER JOURNEY', icon: ListChecks, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/20' },
    { key: 'value', label: 'VALUE PROPOSITION', icon: TrendingUp, color: 'text-green-400', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/20' },
    { key: 'nongoals', label: 'NON-GOALS', icon: XCircle, color: 'text-zinc-400', bgColor: 'bg-zinc-500/10', borderColor: 'border-zinc-500/20' },
    { key: 'metrics', label: 'SUCCESS METRICS', icon: TrendingUp, color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20', isTable: true },
    { key: 'pricing', label: 'PRICING STRATEGY', icon: DollarSign, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500/20' },
    { key: 'risks', label: 'RISKS & MITIGATIONS', icon: AlertTriangle, color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/20', isTable: true },
    { key: 'launch', label: 'LAUNCH CHECKLIST', icon: Rocket, color: 'text-pink-400', bgColor: 'bg-pink-500/10', borderColor: 'border-pink-500/20' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Idea Summary Card */}
      <Card className="bg-zinc-900 border-zinc-800 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-zinc-100">{idea.title}</h2>
              <p className="text-sm text-zinc-500 mt-1">Phase 4: Shape into PRD</p>
            </div>
          </div>
          <div className="flex gap-2">
            {onBack && (
              <Button
                onClick={onBack}
                variant="outline"
                className="font-mono border-zinc-700"
              >
                ← Back
              </Button>
            )}
            {!isShaping ? (
              <Button
                onClick={startShaping}
                className="bg-blue-600 hover:bg-blue-700 text-white font-mono"
                disabled={isShaping}
              >
                <FileText className="w-4 h-4 mr-2" />
                {initialPrd ? 'REGENERATE PRD' : 'CREATE PRD'}
              </Button>
            ) : (
              <Button
                onClick={stopShaping}
                variant="destructive"
                className="font-mono"
              >
                STOP
              </Button>
            )}
          </div>
        </div>

        {/* Progress */}
        {isShaping && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Product Manager crafting PRD...
            </div>
          </div>
        )}
      </Card>

      {/* PRD Output */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Raw Output Panel */}
        <Card className="bg-zinc-950 border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText className={`w-4 h-4 ${isShaping ? 'text-blue-400 animate-pulse' : 'text-zinc-500'}`} />
              <span className="font-mono text-sm text-zinc-300">PRODUCT MANAGER OUTPUT</span>
              {isShaping && (
                <Badge variant="outline" className="text-blue-400 border-blue-400/50 text-xs">
                  SHAPING
                </Badge>
              )}
            </div>
            {prdOutput && !isShaping && (
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" onClick={downloadMarkdown} className="h-7 px-2 font-mono border-zinc-700 text-zinc-400 text-xs">
                  <FileDown className="w-3.5 h-3.5 mr-1" />.md
                </Button>
                <Button variant="outline" size="sm" onClick={downloadWord} className="h-7 px-2 font-mono border-zinc-700 text-zinc-400 text-xs">
                  <FileText className="w-3.5 h-3.5 mr-1" />Word
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(prdOutput)} className="h-7 px-2 font-mono border-zinc-700 text-zinc-400 text-xs">
                  <Download className="w-3.5 h-3.5 mr-1" />Copy
                </Button>
              </div>
            )}
          </div>
          <div
            ref={outputRef}
            className="h-[600px] overflow-y-auto bg-zinc-900/50 rounded-lg p-3 text-xs font-mono text-zinc-400 whitespace-pre-wrap"
          >
            {prdOutput || (
              <span className="text-zinc-600">
                Click &quot;{initialPrd ? 'Regenerate PRD' : 'Create PRD'}&quot; to begin shaping the product...
              </span>
            )}
          </div>
        </Card>

        {/* Structured PRD Panel */}
        <Card className="bg-zinc-950 border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <LayoutDashboard className="w-4 h-4 text-blue-400" />
            <span className="font-mono text-sm text-zinc-300">PRD SECTIONS</span>
          </div>
          <div className="max-h-[600px] overflow-y-auto space-y-3 pr-2">
            <AnimatePresence>
              {sections.map((section, index) => {
                const content = parseSection(section.label);
                if (!content && !isShaping) return null;

                return (
                  <motion.div
                    key={section.key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`rounded-lg p-4 border ${section.bgColor} ${section.borderColor}`}
                  >
                    <div className={`flex items-center gap-2 mb-3 ${section.color}`}>
                      <section.icon className="w-4 h-4" />
                      <span className="font-mono text-xs font-semibold">{section.label}</span>
                    </div>
                    {content ? (
                      <ShapeSectionWithTldr
                        content={content}
                        isTable={section.isTable}
                        renderBody={renderSectionContent}
                      />
                    ) : (
                      <div className="text-xs text-zinc-600 italic">
                        {isShaping ? 'Crafting...' : 'No data'}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {!prdOutput && !isShaping && (
              <div className="text-center text-zinc-600 text-sm font-mono py-12">
                PRD sections will appear here<br />
                after shaping starts.
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

function ShapeSectionWithTldr({
  content,
  isTable,
  renderBody,
}: {
  content: string;
  isTable: boolean | undefined;
  renderBody: (body: string, isTable?: boolean) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const { tldr, body } = extractTldr(content);
  if (!tldr) {
    return (
      <div className="max-h-[250px] overflow-y-auto">
        {renderBody(content, isTable)}
      </div>
    );
  }
  return (
    <div onClick={() => body && setExpanded((v) => !v)} className={body ? 'cursor-pointer' : ''}>
      <p className="text-sm text-zinc-100 leading-relaxed font-medium mb-1">{tldr}</p>
      {body && (
        <>
          {expanded && (
            <div className="mt-2 max-h-[350px] overflow-y-auto">
              {renderBody(body, isTable)}
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
