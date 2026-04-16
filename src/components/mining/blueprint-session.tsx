'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  Download,
  FileDown,
  Wrench,
  Box,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ModelChoice } from '@/lib/types';
import { streamToText } from '@/lib/streaming';

interface BlueprintSessionProps {
  userContext: string;
  idea: {
    title: string;
    content: string;
    critique?: string;
  };
  prd?: string;
  modelChoice: ModelChoice;
  initialBlueprint?: string;
  onComplete?: (blueprint: string) => void;
  onBack?: () => void;
}

export default function BlueprintSession({ userContext, idea, prd, modelChoice, initialBlueprint, onComplete, onBack }: BlueprintSessionProps) {
  const [isBuilding, setIsBuilding] = useState(false);
  const [blueprintOutput, setBlueprintOutput] = useState(initialBlueprint ?? '');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [blueprintOutput]);

  useEffect(() => {
    if (isBuilding && progress < 90) {
      const timer = setInterval(() => {
        setProgress(p => Math.min(p + Math.random() * 4, 90));
      }, 500);
      return () => clearInterval(timer);
    }
  }, [isBuilding, progress]);

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
    setIsBuilding(true);
    setError(null);
    setBlueprintOutput('');
    setProgress(0);
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/mining/blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userContext,
          idea: `## ${idea.title}\n\n${idea.content}\n\n### VC Analysis:\n${idea.critique || 'No critique available'}`,
          prd,
          modelChoice,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error('Failed to create blueprint');

      const fullText = await streamToText(response, setBlueprintOutput);
      setProgress(100);
      onComplete?.(fullText);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Blueprint generation stopped');
      } else {
        setError(err instanceof Error ? err.message : 'Blueprint generation failed');
      }
    } finally {
      setIsBuilding(false);
    }
  };

  const stopBlueprint = () => {
    abortControllerRef.current?.abort();
    setIsBuilding(false);
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

  // Convert markdown to HTML for export
  const markdownToHtml = (markdown: string): string => {
    return markdown
      .replace(/^## (.+)$/gm, '<h2 style="color: #1a1a1a; border-bottom: 2px solid #8b5cf6; padding-bottom: 8px; margin-top: 24px;">$1</h2>')
      .replace(/^### (.+)$/gm, '<h3 style="color: #374151; margin-top: 16px;">$1</h3>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace;">$1</code>')
      .replace(/```[\s\S]*?```/g, (match) => {
        const code = match.replace(/```\w*\n?/g, '').trim();
        return `<pre style="background: #1f2937; color: #e5e7eb; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: monospace; font-size: 12px;">${code}</pre>`;
      })
      .replace(/\|(.+)\|/g, (match) => {
        const cells = match.split('|').filter(c => c.trim());
        if (cells.some(c => /^[-:]+$/.test(c.trim()))) return '';
        const cellTags = cells.map(c => `<td style="border: 1px solid #e5e7eb; padding: 8px;">${c.trim()}</td>`).join('');
        return `<tr>${cellTags}</tr>`;
      })
      .replace(/- \[ \] (.+)/g, '<p style="margin: 4px 0;">☐ $1</p>')
      .replace(/- \[x\] (.+)/gi, '<p style="margin: 4px 0;">☑ $1</p>')
      .replace(/^- (.+)$/gm, '<li style="margin: 4px 0;">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li style="margin: 4px 0;">$2</li>')
      .replace(/\n\n/g, '</p><p style="margin: 12px 0;">')
      .replace(/\n/g, '<br/>');
  };

  // Export to Word
  const exportToWord = () => {
    const htmlContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
      <head>
        <meta charset="utf-8">
        <title>Technical Blueprint - ${idea.title}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 40px; }
          h1 { color: #5b21b6; border-bottom: 3px solid #8b5cf6; padding-bottom: 12px; }
          h2 { color: #4c1d95; border-bottom: 2px solid #c4b5fd; padding-bottom: 8px; margin-top: 32px; }
          h3 { color: #374151; margin-top: 20px; }
          pre { background: #1f2937; color: #e5e7eb; padding: 16px; border-radius: 8px; font-family: 'Consolas', monospace; font-size: 12px; white-space: pre-wrap; }
          code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: 'Consolas', monospace; }
          table { border-collapse: collapse; width: 100%; margin: 16px 0; }
          th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; }
          th { background-color: #f3f4f6; font-weight: 600; }
        </style>
      </head>
      <body>
        <h1>Technical Blueprint</h1>
        <h2 style="border: none; color: #6b7280; font-size: 18px;">${idea.title}</h2>
        <p style="color: #9ca3af; font-size: 12px;">Generated by Startup Idea Mining Rig • ${new Date().toLocaleDateString()}</p>
        <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
        ${markdownToHtml(blueprintOutput)}
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Blueprint-${idea.title.replace(/[^a-zA-Z0-9]/g, '-')}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export to PDF
  const exportToPdf = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to export PDF');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Technical Blueprint - ${idea.title}</title>
        <style>
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 40px; }
          h1 { color: #5b21b6; border-bottom: 3px solid #8b5cf6; padding-bottom: 12px; }
          h2 { color: #4c1d95; border-bottom: 2px solid #c4b5fd; padding-bottom: 8px; margin-top: 32px; page-break-after: avoid; }
          h3 { color: #374151; margin-top: 20px; page-break-after: avoid; }
          pre { background: #1f2937; color: #e5e7eb; padding: 16px; border-radius: 8px; font-family: 'Consolas', monospace; font-size: 11px; white-space: pre-wrap; page-break-inside: avoid; }
          code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: 'Consolas', monospace; }
          table { border-collapse: collapse; width: 100%; margin: 16px 0; }
          th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; }
          th { background-color: #f3f4f6; font-weight: 600; }
        </style>
      </head>
      <body>
        <h1>Technical Blueprint</h1>
        <h2 style="border: none; color: #6b7280; font-size: 18px; margin-top: 8px;">${idea.title}</h2>
        <p style="color: #9ca3af; font-size: 12px;">Generated by Startup Idea Mining Rig • ${new Date().toLocaleDateString()}</p>
        <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
        ${markdownToHtml(blueprintOutput)}
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
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
                CREATE BLUEPRINT
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
            <div className="flex justify-between text-xs font-mono text-zinc-400">
              <span className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                CTO architecting the build plan...
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}
      </Card>

      {/* Blueprint Output */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Raw Output Panel */}
        <Card className="bg-zinc-950 border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Code2 className={`w-4 h-4 ${isBuilding ? 'text-purple-400 animate-pulse' : 'text-zinc-500'}`} />
            <span className="font-mono text-sm text-zinc-300">CTO OUTPUT</span>
            {isBuilding && (
              <Badge variant="outline" className="text-purple-400 border-purple-400/50 text-xs">
                ARCHITECTING
              </Badge>
            )}
          </div>
          <div
            ref={outputRef}
            className="h-[600px] overflow-y-auto bg-zinc-900/50 rounded-lg p-3 text-xs font-mono text-zinc-400 whitespace-pre-wrap"
          >
            {blueprintOutput || (
              <span className="text-zinc-600">
                Click "Create Blueprint" to generate the technical plan...
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
                      <div className="max-h-[250px] overflow-y-auto">
                        {renderSectionContent(content, section.isTable)}
                      </div>
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

      {/* Quick Stats & Export */}
      {blueprintOutput && !isBuilding && (
        <Card className="bg-zinc-900 border-zinc-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Layers className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="font-mono text-lg text-zinc-100">Blueprint Summary</h3>
                <p className="text-xs text-zinc-500">CTO's technical recommendations</p>
              </div>
            </div>
          </div>

          {(() => {
            const overview = parseSection('TECHNICAL OVERVIEW');
            const titleMatch = blueprintOutput.match(/^#\s+Technical Blueprint:\s*(.+)$/m);
            const productName = titleMatch?.[1]?.trim().replace(/\*+/g, '').trim();
            const architecture = overview.match(/Architecture Style:?\s*\*?\*?([^\n*]+)/i)?.[1]?.replace(/\*+/g, '').trim();
            const complexity = overview.match(/Complexity Class:?\s*\*?\*?([^\n*]+)/i)?.[1]?.replace(/\*+/g, '').trim();
            const buildTime = overview.match(/Build Time Estimate[^:\n]*:?\s*\*?\*?([^\n*]+)/i)?.[1]?.replace(/\*+/g, '').trim();

            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800">
                  <div className="text-xs text-zinc-500 font-mono mb-1">PRODUCT</div>
                  <div className="text-base font-bold text-zinc-100 leading-tight">{productName || 'N/A'}</div>
                </div>
                <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800">
                  <div className="text-xs text-zinc-500 font-mono mb-1">ARCHITECTURE</div>
                  <div className="text-base font-bold text-zinc-100 leading-tight">{architecture || 'N/A'}</div>
                </div>
                <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800">
                  <div className="text-xs text-zinc-500 font-mono mb-1">COMPLEXITY</div>
                  <div className="text-base font-bold text-zinc-100 leading-tight">{complexity || 'N/A'}</div>
                </div>
                <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800">
                  <div className="text-xs text-zinc-500 font-mono mb-1">BUILD TIME</div>
                  <div className="text-base font-bold text-zinc-100 leading-tight">{buildTime || 'N/A'}</div>
                </div>
              </div>
            );
          })()}

          {/* Export Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
            <p className="text-sm text-zinc-500">Export your blueprint to share with your team</p>
            <div className="flex gap-3">
              <Button
                onClick={exportToWord}
                variant="outline"
                className="font-mono border-zinc-700 hover:border-purple-500 hover:text-purple-400"
              >
                <FileDown className="w-4 h-4 mr-2" />
                Export to Word
              </Button>
              <Button
                onClick={exportToPdf}
                variant="outline"
                className="font-mono border-zinc-700 hover:border-red-500 hover:text-red-400"
              >
                <Download className="w-4 h-4 mr-2" />
                Export to PDF
              </Button>
            </div>
          </div>
        </Card>
      )}

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
