'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  Code2,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import type { ModelChoice } from '@/lib/types';
import { streamToText } from '@/lib/streaming';

interface ShapeSessionProps {
  userContext: string;
  idea: {
    title: string;
    content: string;
    critique?: string;
  };
  marketResearch?: string;
  modelChoice: ModelChoice;
  initialPrd?: string;
  onComplete?: (prd: string) => void;
  onBack?: () => void;
}

export default function ShapeSession({ userContext, idea, marketResearch, modelChoice, initialPrd, onComplete, onBack }: ShapeSessionProps) {
  const [isShaping, setIsShaping] = useState(false);
  const [prdOutput, setPrdOutput] = useState(initialPrd ?? '');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [prdOutput]);

  useEffect(() => {
    if (isShaping && progress < 90) {
      const timer = setInterval(() => {
        setProgress(p => Math.min(p + Math.random() * 4, 90));
      }, 500);
      return () => clearInterval(timer);
    }
  }, [isShaping, progress]);

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

  // Convert markdown to HTML for export
  const markdownToHtml = (markdown: string): string => {
    return markdown
      // Headers
      .replace(/^## (.+)$/gm, '<h2 style="color: #1a1a1a; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; margin-top: 24px;">$1</h2>')
      .replace(/^### (.+)$/gm, '<h3 style="color: #374151; margin-top: 16px;">$1</h3>')
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // Tables
      .replace(/\|(.+)\|/g, (match) => {
        const cells = match.split('|').filter(c => c.trim());
        if (cells.some(c => /^[-:]+$/.test(c.trim()))) return '';
        const cellTags = cells.map(c => `<td style="border: 1px solid #e5e7eb; padding: 8px;">${c.trim()}</td>`).join('');
        return `<tr>${cellTags}</tr>`;
      })
      // Checkboxes
      .replace(/- \[ \] (.+)/g, '<p style="margin: 4px 0;">☐ $1</p>')
      .replace(/- \[x\] (.+)/gi, '<p style="margin: 4px 0;">☑ $1</p>')
      // List items
      .replace(/^- (.+)$/gm, '<li style="margin: 4px 0;">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li style="margin: 4px 0;">$2</li>')
      // Paragraphs
      .replace(/\n\n/g, '</p><p style="margin: 12px 0;">')
      // Line breaks
      .replace(/\n/g, '<br/>');
  };

  // Export to Word document
  const exportToWord = () => {
    const htmlContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
      <head>
        <meta charset="utf-8">
        <title>PRD - ${idea.title}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 40px; }
          h1 { color: #1e40af; border-bottom: 3px solid #3b82f6; padding-bottom: 12px; }
          h2 { color: #1e3a5f; border-bottom: 2px solid #93c5fd; padding-bottom: 8px; margin-top: 32px; }
          h3 { color: #374151; margin-top: 20px; }
          table { border-collapse: collapse; width: 100%; margin: 16px 0; }
          th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; }
          th { background-color: #f3f4f6; font-weight: 600; }
          ul, ol { margin: 12px 0; padding-left: 24px; }
          li { margin: 6px 0; }
          strong { color: #1e3a5f; }
        </style>
      </head>
      <body>
        <h1>Product Requirements Document</h1>
        <h2 style="border: none; color: #6b7280; font-size: 18px;">${idea.title}</h2>
        <p style="color: #9ca3af; font-size: 12px;">Generated by Startup Idea Mining Rig • ${new Date().toLocaleDateString()}</p>
        <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
        ${markdownToHtml(prdOutput)}
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PRD-${idea.title.replace(/[^a-zA-Z0-9]/g, '-')}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export to PDF (using print dialog)
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
        <title>PRD - ${idea.title}</title>
        <style>
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 40px; }
          h1 { color: #1e40af; border-bottom: 3px solid #3b82f6; padding-bottom: 12px; }
          h2 { color: #1e3a5f; border-bottom: 2px solid #93c5fd; padding-bottom: 8px; margin-top: 32px; page-break-after: avoid; }
          h3 { color: #374151; margin-top: 20px; page-break-after: avoid; }
          table { border-collapse: collapse; width: 100%; margin: 16px 0; }
          th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; }
          th { background-color: #f3f4f6; font-weight: 600; }
          ul, ol { margin: 12px 0; padding-left: 24px; }
          li { margin: 6px 0; }
          strong { color: #1e3a5f; }
          .header { margin-bottom: 32px; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Product Requirements Document</h1>
          <h2 style="border: none; color: #6b7280; font-size: 18px; margin-top: 8px;">${idea.title}</h2>
          <p style="color: #9ca3af; font-size: 12px;">Generated by Startup Idea Mining Rig • ${new Date().toLocaleDateString()}</p>
        </div>
        <hr style="border: 1px solid #e5e7eb; margin: 24px 0;" />
        ${markdownToHtml(prdOutput)}
        <div class="footer">
          <p>This PRD was generated using the Startup Idea Mining Rig powered by AI.</p>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  const startShaping = async () => {
    setIsShaping(true);
    setError(null);
    setPrdOutput('');
    setProgress(0);
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/mining/shape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userContext,
          idea: `## ${idea.title}\n\n${idea.content}\n\n### VC Analysis:\n${idea.critique || 'No critique available'}`,
          marketResearch,
          modelChoice,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error('Failed to shape idea');

      const fullText = await streamToText(response, setPrdOutput);
      setProgress(100);
      onComplete?.(fullText);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Shaping stopped');
      } else {
        setError(err instanceof Error ? err.message : 'Shaping failed');
      }
    } finally {
      setIsShaping(false);
    }
  };

  const stopShaping = () => {
    abortControllerRef.current?.abort();
    setIsShaping(false);
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
                CREATE PRD
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
            <div className="flex justify-between text-xs font-mono text-zinc-400">
              <span className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Product Manager crafting PRD...
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}
      </Card>

      {/* PRD Output */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Raw Output Panel */}
        <Card className="bg-zinc-950 border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className={`w-4 h-4 ${isShaping ? 'text-blue-400 animate-pulse' : 'text-zinc-500'}`} />
            <span className="font-mono text-sm text-zinc-300">PRODUCT MANAGER OUTPUT</span>
            {isShaping && (
              <Badge variant="outline" className="text-blue-400 border-blue-400/50 text-xs">
                SHAPING
              </Badge>
            )}
          </div>
          <div
            ref={outputRef}
            className="h-[600px] overflow-y-auto bg-zinc-900/50 rounded-lg p-3 text-xs font-mono text-zinc-400 whitespace-pre-wrap"
          >
            {prdOutput || (
              <span className="text-zinc-600">
                Click "Create PRD" to begin shaping the product...
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
                      <div className="max-h-[250px] overflow-y-auto">
                        {renderSectionContent(content, section.isTable)}
                      </div>
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

      {/* Quick Stats */}
      {prdOutput && !isShaping && (
        <Card className="bg-zinc-900 border-zinc-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-mono text-lg text-zinc-100">PRD Summary</h3>
              <p className="text-xs text-zinc-500">Product Manager's key outputs</p>
            </div>
          </div>

          {(() => {
            const overview = parseSection('PRODUCT OVERVIEW');
            const productName = overview.match(/Product Name:?\s*\*?\*?([^\n*]+)/i)?.[1]?.replace(/\*+/g, '').trim();
            const tagline = overview.match(/Tagline:?\s*\*?\*?([^\n*]+)/i)?.[1]?.replace(/\*+/g, '').trim();

            const metrics = parseSection('SUCCESS METRICS');
            const northStar = metrics.match(/North Star.*?\n\*?\*?([^\n*]+)/i)?.[1]?.replace(/\*+/g, '').trim();

            const pricing = parseSection('PRICING STRATEGY');
            const model = pricing.match(/Model:?\s*\*?\*?([^\n*]+)/i)?.[1]?.replace(/\*+/g, '').trim();

            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800">
                  <div className="text-xs text-zinc-500 font-mono mb-1">PRODUCT NAME</div>
                  <div className="text-lg font-bold text-zinc-100">{productName || 'N/A'}</div>
                </div>
                <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800 col-span-2 lg:col-span-1">
                  <div className="text-xs text-zinc-500 font-mono mb-1">TAGLINE</div>
                  <div className="text-sm text-zinc-300">{tagline || 'N/A'}</div>
                </div>
                <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800">
                  <div className="text-xs text-zinc-500 font-mono mb-1">PRICING MODEL</div>
                  <div className="text-lg font-bold text-zinc-100">{model || 'N/A'}</div>
                </div>
                <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800">
                  <div className="text-xs text-zinc-500 font-mono mb-1">NORTH STAR</div>
                  <div className="text-sm text-zinc-300">{northStar || 'N/A'}</div>
                </div>
              </div>
            );
          })()}

          {/* Export Buttons */}
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-zinc-500">Export your PRD to share with your team</p>
            <div className="flex gap-3">
              <Button
                onClick={exportToWord}
                variant="outline"
                className="font-mono border-zinc-700 hover:border-blue-500 hover:text-blue-400"
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

          {/* Proceed to Architect */}
          <div className="mt-6 pt-6 border-t border-zinc-800 flex justify-end">
            <Link href="/blueprint">
              <Button className="bg-purple-600 hover:bg-purple-700 text-white font-mono">
                <Code2 className="w-4 h-4 mr-2" />
                Architect
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
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
