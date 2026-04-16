'use client';

import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Search,
  Loader2,
  TrendingUp,
  Users,
  AlertTriangle,
  Clock,
  Building2,
  MessageSquareQuote,
  Skull,
  CheckCircle,
  XCircle,
  BarChart3,
  ArrowRight,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import type { ModelChoice } from '@/lib/types';
import { streamToText } from '@/lib/streaming';

interface VerifySessionProps {
  userContext: string;
  idea: {
    title: string;
    content: string;
    critique?: string;
  };
  modelChoice: ModelChoice;
  initialReport?: string;
  onComplete?: (report: string) => void;
  onBack?: () => void;
}

export default function VerifySession({ userContext, idea, modelChoice, initialReport, onComplete, onBack }: VerifySessionProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [researchOutput, setResearchOutput] = useState(initialReport ?? '');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [researchOutput]);

  // Simulate progress while streaming
  useEffect(() => {
    if (isVerifying && progress < 90) {
      const timer = setInterval(() => {
        setProgress(p => Math.min(p + Math.random() * 5, 90));
      }, 500);
      return () => clearInterval(timer);
    }
  }, [isVerifying, progress]);

  const startVerification = async () => {
    setIsVerifying(true);
    setError(null);
    setResearchOutput('');
    setProgress(0);
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/mining/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userContext,
          idea: `## ${idea.title}\n\n${idea.content}\n\n### VC Analysis:\n${idea.critique || 'No critique available'}`,
          modelChoice,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error('Failed to verify idea');

      const fullText = await streamToText(response, setResearchOutput);
      setProgress(100);
      onComplete?.(fullText);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Verification stopped');
      } else {
        setError(err instanceof Error ? err.message : 'Verification failed');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const stopVerification = () => {
    abortControllerRef.current?.abort();
    setIsVerifying(false);
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

  const sections = [
    { key: 'market', label: 'MARKET SNAPSHOT', icon: BarChart3, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
    { key: 'competitors', label: 'COMPETITOR LANDSCAPE', icon: Building2, color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20' },
    { key: 'customer', label: 'CUSTOMER VOICE', icon: MessageSquareQuote, color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/20' },
    { key: 'graveyard', label: 'GRAVEYARD CHECK', icon: Skull, color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
    { key: 'risks', label: 'REGULATORY & STRUCTURAL RISKS', icon: AlertTriangle, color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' },
    { key: 'timing', label: 'TIMING VERDICT', icon: Clock, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/20' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Idea Summary Card */}
      <Card className="bg-zinc-900 border-zinc-800 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
              <Search className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-zinc-100">{idea.title}</h2>
              <p className="text-sm text-zinc-500 mt-1">Phase 3: Market Verification</p>
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
            {!isVerifying ? (
              <Button
                onClick={startVerification}
                className="bg-yellow-600 hover:bg-yellow-700 text-white font-mono"
                disabled={isVerifying}
              >
                <Search className="w-4 h-4 mr-2" />
                START VERIFICATION
              </Button>
            ) : (
              <Button
                onClick={stopVerification}
                variant="destructive"
                className="font-mono"
              >
                STOP
              </Button>
            )}
          </div>
        </div>

        {/* Progress */}
        {isVerifying && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-xs font-mono text-zinc-400">
              <span className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Data Miner analyzing market...
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}
      </Card>

      {/* Research Output */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Raw Output Panel */}
        <Card className="bg-zinc-950 border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Search className={`w-4 h-4 ${isVerifying ? 'text-yellow-400 animate-pulse' : 'text-zinc-500'}`} />
            <span className="font-mono text-sm text-zinc-300">DATA MINER OUTPUT</span>
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
                Click "Start Verification" to begin market research...
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
                    </div>
                    {content ? (
                      <div className="max-h-[300px] overflow-y-auto">
                        {renderSectionContent(section.key, content)}
                      </div>
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

      {/* Verdict Summary */}
      {researchOutput && !isVerifying && (
        <Card className="bg-zinc-900 border-zinc-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="font-mono text-lg text-zinc-100">Timing Verdict Summary</h3>
              <p className="text-xs text-zinc-500">Data Miner's final assessment</p>
            </div>
          </div>

          {(() => {
            const timing = parseSection('TIMING VERDICT');
            const marketSnapshot = parseSection('MARKET SNAPSHOT');
            const reRankingSection = parseSection('RE-RANKING SIGNAL');

            const getField = (sectionContent: string, fieldName: string): string => {
              const patterns = [
                new RegExp(`\\*\\*${fieldName}:?\\*\\*\\s*\\*?\\*?([^\\n]+)`, 'i'),
                new RegExp(`${fieldName}:?\\s+([^\\n]+)`, 'i'),
              ];
              for (const pattern of patterns) {
                const match = sectionContent.match(pattern);
                if (match?.[1]?.trim()) {
                  return match[1].trim().replace(/\*+/g, '').trim();
                }
              }
              return '';
            };

            const status = getField(timing, 'Status');
            const rationale = getField(timing, 'Rationale');
            const timingSignal = getField(marketSnapshot, 'Timing Signal');

            const statusColor = status === 'JUST_RIGHT' ? 'text-emerald-400'
              : status === 'TOO_EARLY' ? 'text-amber-400'
              : (status === 'SATURATED' || status === 'TAR_PIT') ? 'text-red-400'
              : 'text-zinc-100';

            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800">
                  <div className="text-xs text-zinc-500 font-mono mb-1">TIMING STATUS</div>
                  <div className={`text-base font-bold flex items-center gap-2 ${statusColor}`}>
                    {status === 'JUST_RIGHT' && <CheckCircle className="w-4 h-4" />}
                    {(status === 'SATURATED' || status === 'TAR_PIT') && <XCircle className="w-4 h-4" />}
                    {status || 'N/A'}
                  </div>
                </div>
                <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800">
                  <div className="text-xs text-zinc-500 font-mono mb-1">TIMING SIGNAL</div>
                  <div className="text-sm text-zinc-300">{timingSignal || 'N/A'}</div>
                </div>
                <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800">
                  <div className="text-xs text-zinc-500 font-mono mb-1">RE-RANKING</div>
                  <div className="text-sm text-zinc-300 whitespace-pre-wrap">{reRankingSection || 'N/A'}</div>
                </div>
                <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800 col-span-2 lg:col-span-1">
                  <div className="text-xs text-zinc-500 font-mono mb-1">RATIONALE</div>
                  <div className="text-sm text-zinc-300">{rationale || 'N/A'}</div>
                </div>
              </div>
            );
          })()}

          {/* Proceed to Shape */}
          <div className="mt-6 flex justify-end">
            <Link href="/shape">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white font-mono">
                <FileText className="w-4 h-4 mr-2" />
                Shape
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
