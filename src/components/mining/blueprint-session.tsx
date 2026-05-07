'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Code2,
  Loader2,
  Database,
  Server,
  Layers,
  GitBranch,
  AlertTriangle,
  Rocket,
  FolderTree,
  Terminal,
  Cpu,
  Wrench,
  Box,
  Download,
  FileDown,
  FileText,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ModelChoice } from '@/lib/types';
import { streamToText } from '@/lib/streaming';
import { extractTldr } from '@/lib/markdown-render';
import { marked } from 'marked';
import { usePhaseRun, startPhaseRun, updatePhaseOutput, completePhaseRun, failPhaseRun, stopPhaseRun, clearPhaseRun, getPhaseRun } from '@/lib/phase-status';

interface BlueprintSessionProps {
  userContext: string;
  ideaId: string;
  idea: {
    title: string;
    content: string;
    critique?: string;
  };
  vcMemo?: string;
  marketResearch?: string;
  prd?: string;
  modelChoice: ModelChoice;
  initialBlueprint?: string;
  onComplete?: (blueprint: string) => void;
  onBack?: () => void;
}

export default function BlueprintSession({ userContext, ideaId, idea, vcMemo, marketResearch, prd, modelChoice, initialBlueprint, onComplete, onBack }: BlueprintSessionProps) {
  const phaseRun = usePhaseRun('blueprint');
  const isActiveRun = phaseRun != null && phaseRun.ideaId === ideaId;
  const isBuilding = !!(isActiveRun && phaseRun!.isRunning);
  const blueprintOutput = isActiveRun ? phaseRun!.output : (initialBlueprint ?? '');
  const error = isActiveRun ? (phaseRun!.error ?? null) : null;
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [blueprintOutput]);

  useEffect(() => {
    return () => {
      const run = getPhaseRun('blueprint');
      if (run && !run.isRunning) clearPhaseRun('blueprint');
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

  // Format markdown with proper rendering
  const formatMarkdown = (text: string): React.ReactNode => {
    const lines = text.split('\n');

    return lines.map((line, lineIndex) => {
      // Handle headers
      const h3Match = line.match(/^###\s+(.+)$/);
      if (h3Match) {
        return (
          <div key={lineIndex} className="text-zinc-200 font-semibold mt-3 mb-1">
            {formatInlineMarkdown(h3Match[1])}
          </div>
        );
      }

      // Handle code blocks start/end
      if (line.trim().startsWith('```')) {
        return <div key={lineIndex} className="h-1" />;
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

      // Handle bullet points
      const bulletMatch = line.match(/^[-•├└│]\s*(.+)$/);
      if (bulletMatch) {
        return (
          <div key={lineIndex} className="flex items-start gap-2 py-0.5 font-mono text-xs">
            <span className="text-zinc-600">{line.charAt(0)}</span>
            <span>{formatInlineMarkdown(bulletMatch[1])}</span>
          </div>
        );
      }

      // Handle numbered lists
      const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (numberedMatch) {
        return (
          <div key={lineIndex} className="flex items-start gap-2 py-1">
            <span className="text-purple-400 min-w-[1.5rem]">{numberedMatch[1]}.</span>
            <span>{formatInlineMarkdown(numberedMatch[2])}</span>
          </div>
        );
      }

      // Regular line
      if (line.trim()) {
        return (
          <div key={lineIndex} className="py-0.5">
            {formatInlineMarkdown(line)}
          </div>
        );
      }

      return <div key={lineIndex} className="h-2" />;
    });
  };

  const formatInlineMarkdown = (text: string): React.ReactNode => {
    // Handle inline code
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="bg-zinc-800 text-purple-300 px-1.5 py-0.5 rounded text-xs font-mono">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-zinc-200">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const startBlueprint = async () => {
    if (phaseRun?.isRunning) return;
    const ac = new AbortController();
    const runId = startPhaseRun('blueprint', ideaId, ac);

    try {
      const response = await fetch('/api/mining/blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userContext,
          idea: `## ${idea.title}\n\n${idea.content}`,
          vcMemo,
          marketResearch,
          prd,
          modelChoice,
        }),
        signal: ac.signal,
      });

      if (!response.ok) throw new Error('Failed to create blueprint');

      const fullText = await streamToText(response, (text) => updatePhaseOutput('blueprint', runId, text));
      completePhaseRun('blueprint', runId);
      onComplete?.(fullText);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        failPhaseRun('blueprint', runId, 'Blueprint generation stopped');
      } else {
        failPhaseRun('blueprint', runId, err instanceof Error ? err.message : 'Blueprint generation failed');
      }
    }
  };

  const stopBlueprint = () => {
    stopPhaseRun('blueprint');
  };

  const downloadMarkdown = () => {
    const blob = new Blob([blueprintOutput], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blueprint-${idea.title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadWord = async () => {
    const bodyHtml = await marked.parse(blueprintOutput, { async: true });
    const fullHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>Blueprint — ${idea.title}</title>
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
    a.download = `blueprint-${idea.title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Parse sections from blueprint output
  const parseSection = (label: string): string => {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`##\\s*${escapedLabel}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i'),
      new RegExp(`\\*\\*${escapedLabel}:?\\*\\*\\s*([\\s\\S]*?)(?=\\n##|\\n\\*\\*[A-Z]|$)`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = blueprintOutput.match(pattern);
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
    { key: 'overview', label: 'TECHNICAL OVERVIEW', icon: Cpu, color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/20' },
    { key: 'stack', label: 'THE STACK', icon: Layers, color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20' },
    { key: 'data', label: 'DATA MODEL', icon: Database, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
    { key: 'build', label: 'BUILD VS BUY', icon: Wrench, color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20', isTable: true },
    { key: 'api', label: 'API DESIGN', icon: Server, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/20', isTable: true },
    { key: 'risks', label: 'KEY TECHNICAL RISKS', icon: AlertTriangle, color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20', isTable: true },
    { key: 'phases', label: 'IMPLEMENTATION PHASES', icon: GitBranch, color: 'text-green-400', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/20' },
    { key: 'skeleton', label: 'WALKING SKELETON', icon: Box, color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/20' },
    { key: 'folder', label: 'FOLDER STRUCTURE', icon: FolderTree, color: 'text-zinc-400', bgColor: 'bg-zinc-500/10', borderColor: 'border-zinc-500/20' },
    { key: 'env', label: 'ENVIRONMENT VARIABLES', icon: Terminal, color: 'text-pink-400', bgColor: 'bg-pink-500/10', borderColor: 'border-pink-500/20' },
    { key: 'next', label: 'NEXT STEPS', icon: Rocket, color: 'text-indigo-400', bgColor: 'bg-indigo-500/10', borderColor: 'border-indigo-500/20' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Idea Summary Card */}
      <Card className="bg-zinc-900 border-zinc-800 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Code2 className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-zinc-100">{idea.title}</h2>
              <p className="text-sm text-zinc-500 mt-1">Phase 5: Technical Blueprint</p>
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
            {!isBuilding ? (
              <Button
                onClick={startBlueprint}
                className="bg-purple-600 hover:bg-purple-700 text-white font-mono"
                disabled={isBuilding}
              >
                <Code2 className="w-4 h-4 mr-2" />
                {initialBlueprint ? 'REGENERATE BLUEPRINT' : 'CREATE BLUEPRINT'}
              </Button>
            ) : (
              <Button
                onClick={stopBlueprint}
                variant="destructive"
                className="font-mono"
              >
                STOP
              </Button>
            )}
          </div>
        </div>

        {/* Progress */}
        {isBuilding && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              CTO architecting the build plan...
            </div>
          </div>
        )}
      </Card>

      {/* Blueprint Output */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Raw Output Panel */}
        <Card className="bg-zinc-950 border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Code2 className={`w-4 h-4 ${isBuilding ? 'text-purple-400 animate-pulse' : 'text-zinc-500'}`} />
              <span className="font-mono text-sm text-zinc-300">CTO OUTPUT</span>
              {isBuilding && (
                <Badge variant="outline" className="text-purple-400 border-purple-400/50 text-xs">
                  ARCHITECTING
                </Badge>
              )}
            </div>
            {blueprintOutput && !isBuilding && (
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" onClick={downloadMarkdown} className="h-7 px-2 font-mono border-zinc-700 text-zinc-400 text-xs">
                  <FileDown className="w-3.5 h-3.5 mr-1" />.md
                </Button>
                <Button variant="outline" size="sm" onClick={downloadWord} className="h-7 px-2 font-mono border-zinc-700 text-zinc-400 text-xs">
                  <FileText className="w-3.5 h-3.5 mr-1" />Word
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(blueprintOutput)} className="h-7 px-2 font-mono border-zinc-700 text-zinc-400 text-xs">
                  <Download className="w-3.5 h-3.5 mr-1" />Copy
                </Button>
              </div>
            )}
          </div>
          <div
            ref={outputRef}
            className="h-[600px] overflow-y-auto bg-zinc-900/50 rounded-lg p-3 text-xs font-mono text-zinc-400 whitespace-pre-wrap"
          >
            {blueprintOutput || (
              <span className="text-zinc-600">
                Click &quot;{initialBlueprint ? 'Regenerate Blueprint' : 'Create Blueprint'}&quot; to generate the technical plan...
              </span>
            )}
          </div>
        </Card>

        {/* Structured Blueprint Panel */}
        <Card className="bg-zinc-950 border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-purple-400" />
            <span className="font-mono text-sm text-zinc-300">BLUEPRINT SECTIONS</span>
          </div>
          <div className="max-h-[600px] overflow-y-auto space-y-3 pr-2">
            <AnimatePresence>
              {sections.map((section, index) => {
                const content = parseSection(section.label);
                if (!content && !isBuilding) return null;

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
                      <BlueprintSectionWithTldr
                        content={content}
                        isTable={section.isTable}
                        renderBody={renderSectionContent}
                      />
                    ) : (
                      <div className="text-xs text-zinc-600 italic">
                        {isBuilding ? 'Architecting...' : 'No data'}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {!blueprintOutput && !isBuilding && (
              <div className="text-center text-zinc-600 text-sm font-mono py-12">
                Blueprint sections will appear here<br />
                after generation starts.
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

function BlueprintSectionWithTldr({
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
