'use client';

import { memo, useMemo, type ReactNode } from 'react';

// Pulls out a leading `**TL;DR:** ...` line (if present) from a section body.
// Returns { tldr, body } where tldr is the headline without the label, and body
// is the remaining markdown without the TL;DR line. `body` is empty if what
// remains after the TL;DR has no meaningful content (e.g., just punctuation).
export function extractTldr(raw: string): { tldr: string; body: string } {
  const text = raw.trim();
  if (!text) return { tldr: '', body: '' };
  const match = text.match(/^\s*\*\*TL;?DR:?\*\*\s*([^\n]+)\n?([\s\S]*)$/i);
  if (!match) return { tldr: '', body: text };
  const tldr = match[1].trim().replace(/\*+/g, '').trim();
  const rawBody = (match[2] ?? '').trim();
  // Detect bodies that are essentially empty (only punctuation / markdown artifacts).
  const alphaNum = rawBody.replace(/[^\p{L}\p{N}]/gu, '');
  const body = alphaNum.length >= 2 ? rawBody : '';
  return { tldr, body };
}

// Lightweight markdown-to-React renderer for the structured skill outputs in this app
// (ideas, memos, theses, founder context). Handles headers, bullets, bold/italic/code,
// and "**Label:** value" paragraphs. Not a full markdown parser.
export function renderMarkdownBlock(raw: string): ReactNode {
  const inline = (s: string) =>
    s
      .replace(/\*\*([^*]+)\*\*/g, '§§B§§$1§§/B§§')
      .replace(/\*([^*]+)\*/g, '§§I§§$1§§/I§§')
      .replace(/`([^`]+)`/g, '§§C§§$1§§/C§§');

  const renderInline = (s: string, keyBase: string): ReactNode[] => {
    const parts = s.split(/(§§\/?[BIC]§§)/).filter(Boolean);
    const out: ReactNode[] = [];
    let mode: 'B' | 'I' | 'C' | null = null;
    parts.forEach((p, i) => {
      if (p === '§§B§§') { mode = 'B'; return; }
      if (p === '§§/B§§') { mode = null; return; }
      if (p === '§§I§§') { mode = 'I'; return; }
      if (p === '§§/I§§') { mode = null; return; }
      if (p === '§§C§§') { mode = 'C'; return; }
      if (p === '§§/C§§') { mode = null; return; }
      const k = `${keyBase}-${i}`;
      if (mode === 'B') out.push(<strong key={k} className="text-zinc-100 font-semibold">{p}</strong>);
      else if (mode === 'I') out.push(<em key={k}>{p}</em>);
      else if (mode === 'C') out.push(<code key={k} className="bg-zinc-800 px-1 rounded text-xs">{p}</code>);
      else out.push(<span key={k}>{p}</span>);
    });
    return out;
  };

  const blocks: ReactNode[] = [];
  const lines = raw.split('\n');
  let i = 0;
  let bk = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }

    // Header
    const hdr = trimmed.match(/^(#{1,6})\s*(.+)$/);
    if (hdr) {
      const level = hdr[1].length;
      const text = hdr[2].replace(/\*+/g, '').trim();
      const cls = level === 1
        ? 'text-lg font-mono text-zinc-100 font-semibold mt-4 mb-2 pb-1 border-b border-zinc-800'
        : level === 2
          ? 'text-base font-mono text-zinc-100 font-semibold mt-6 mb-2 pt-4 border-t border-zinc-700/50'
          : 'text-sm font-mono text-zinc-200 font-semibold mt-3 mb-1';
      blocks.push(<div key={`h-${bk++}`} className={cls}>{text}</div>);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${bk++}`} className="my-4 border-zinc-800" />);
      i++;
      continue;
    }

    // Table
    if (/^\|.+\|/.test(trimmed)) {
      const tableRows: string[][] = [];
      while (i < lines.length && /^\|.+\|/.test(lines[i].trim())) {
        const row = lines[i].trim();
        if (/^\|[\s:|-]+\|$/.test(row)) { i++; continue; }
        const cells = row.split('|').slice(1, -1).map(c => c.trim());
        tableRows.push(cells);
        i++;
      }
      if (tableRows.length > 0) {
        const [header, ...body] = tableRows;
        blocks.push(
          <div key={`tbl-${bk++}`} className="my-3 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-zinc-700">
                  {header.map((cell, ci) => (
                    <th key={ci} className="text-left text-xs font-mono text-zinc-400 py-1.5 px-3 font-semibold">
                      {renderInline(inline(cell), `th-${bk}-${ci}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri} className="border-b border-zinc-800/50">
                    {row.map((cell, ci) => (
                      <td key={ci} className="text-zinc-300 py-1.5 px-3">
                        {renderInline(inline(cell), `td-${bk}-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }

    // Bullet list (with nesting support)
    if (/^[\s]*[-*•]\s+/.test(line)) {
      const items: { text: string; depth: number }[] = [];
      while (i < lines.length && /^[\s]*[-*•]\s+/.test(lines[i])) {
        const indent = lines[i].match(/^(\s*)/)?.[1].length ?? 0;
        const depth = Math.floor(indent / 2);
        items.push({ text: lines[i].replace(/^[\s]*[-*•]\s+/, ''), depth });
        i++;
      }
      blocks.push(
        <ul key={`ul-${bk++}`} className="space-y-1 my-2 ml-1">
          {items.map((it, idx) => (
            <li key={idx} className="text-sm text-zinc-300 leading-relaxed flex gap-2" style={{ paddingLeft: `${it.depth * 16}px` }}>
              <span className={`shrink-0 ${it.depth > 0 ? 'text-zinc-600' : 'text-zinc-500'}`}>{it.depth > 0 ? '◦' : '▸'}</span>
              <span>{renderInline(inline(it.text), `${bk}-${idx}`)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Paragraph (collect until blank line or non-paragraph start)
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^#{1,6}\s/.test(lines[i]) && !/^[\s]*[-*•]\s+/.test(lines[i]) && !/^---+\s*$/.test(lines[i].trim())) {
      paraLines.push(lines[i]);
      i++;
    }
    const paraText = paraLines.join(' ').trim();
    // Detect "**Label:** value" inline-label style
    const labelMatch = paraText.match(/^\*\*([^*]+?):?\*\*\s*(.+)$/);
    if (labelMatch) {
      blocks.push(
        <div key={`p-${bk++}`} className="text-sm text-zinc-300 leading-relaxed my-1.5">
          <span className="font-mono text-xs uppercase text-zinc-400 tracking-wide">{labelMatch[1].trim()}: </span>
          <span>{renderInline(inline(labelMatch[2]), `lbl-${bk}`)}</span>
        </div>,
      );
    } else {
      blocks.push(
        <p key={`p-${bk++}`} className="text-sm text-zinc-300 leading-relaxed my-2">
          {renderInline(inline(paraText), `para-${bk}`)}
        </p>,
      );
    }
  }

  return <div className="space-y-1">{blocks}</div>;
}

// Memoized component wrapper — re-renders only when `raw` changes.
// Prefer this in hot render paths (streaming output, large markdown blobs)
// where the parent re-renders frequently but the markdown is stable.
export const MarkdownBlock = memo(function MarkdownBlock({ raw }: { raw: string }) {
  const node = useMemo(() => renderMarkdownBlock(raw), [raw]);
  return <>{node}</>;
});
