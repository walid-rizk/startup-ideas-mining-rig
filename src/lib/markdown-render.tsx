'use client';

import type { ReactNode } from 'react';

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
          ? 'text-base font-mono text-zinc-100 font-semibold mt-4 mb-2'
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

    // Bullet list
    if (/^[\s]*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\s]*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*[-*•]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`ul-${bk++}`} className="space-y-1 my-2 ml-1">
          {items.map((it, idx) => (
            <li key={idx} className="text-sm text-zinc-300 leading-relaxed flex gap-2">
              <span className="text-zinc-500 shrink-0">▸</span>
              <span>{renderInline(inline(it), `${bk}-${idx}`)}</span>
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
