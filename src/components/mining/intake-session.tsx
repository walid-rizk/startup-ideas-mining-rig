'use client';

import { useChat } from 'ai/react';
import { useRef, useEffect, useState, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Terminal, Loader2, AlertCircle, Paperclip, FileText, X, CheckCircle, Compass } from 'lucide-react';
import { useSession } from '@/lib/session-context';
import { streamToText } from '@/lib/streaming';

const WELCOME_MESSAGE = {
  id: 'welcome-1',
  role: 'assistant' as const,
  content:
    "Welcome to the Startup Ideas Mining Rig. I am your Interviewer. I need to understand your background and goals to build your Founder Context.\n\nYou can either:\n• Answer my questions directly\n• Upload your resume (PDF, TXT, or DOCX) using the 📎 button\n• Share your LinkedIn profile URL and I'll look it up\n\nShall we begin?",
};

export default function IntakeSession() {
  const { session, update } = useSession();
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [thesisGenerating, setThesisGenerating] = useState(false);
  // Prevent re-triggering if thesis was already generated in this session
  const thesisTriggeredRef = useRef(!!session.thesis);
  // Track how many messages we've last persisted to avoid redundant saves
  const lastSavedCountRef = useRef(session.intakeMessages.length);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, append } = useChat({
    api: '/api/mining/intake',
    body: { modelChoice: session.modelChoice },
    // Restore previous conversation; fall back to welcome message for new sessions
    initialMessages:
      session.intakeMessages.length > 0 ? session.intakeMessages : [WELCOME_MESSAGE],
    onError: (err) => {
      console.error("Chat Error:", err);
    }
  });

  // Auto-detect a completed Founder Context block in the last assistant message,
  // persist it, then auto-generate thesis candidates and redirect to /thesis.
  useEffect(() => {
    if (isLoading) return;
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!last) return;
    const content = last.content;
    if (
      content.includes('## Founder DNA') &&
      content.length > 400 &&
      content !== session.founderContext
    ) {
      update({ founderContext: content });

      if (!thesisTriggeredRef.current) {
        thesisTriggeredRef.current = true;
        generateThesisAndRedirect(content);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isLoading]);

  const generateThesisAndRedirect = async (founderContext: string) => {
    setThesisGenerating(true);
    try {
      const res = await fetch('/api/mining/thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userContext: founderContext,
          modelChoice: session.modelChoice,
        }),
      });
      if (res.ok) {
        const thesisText = await streamToText(res, () => {});
        update({ thesis: thesisText });
      }
    } catch {
      // Non-fatal — user can regenerate from the intake page
    } finally {
      setThesisGenerating(false);
      router.push('/intake');
    }
  };

  // Persist conversation to session after each completed exchange
  useEffect(() => {
    if (isLoading) return;
    if (messages.length <= 1) return; // nothing beyond welcome to save
    if (messages.length === lastSavedCountRef.current) return;
    lastSavedCountRef.current = messages.length;
    update({
      intakeMessages: messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isLoading]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileLoading(true);

    try {
      let content = '';

      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        // Server-side PDF text extraction
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/parse-resume', { method: 'POST', body: form });
        const json = await res.json();
        if (!res.ok || json.error) {
          throw new Error(json.error ?? 'PDF parsing failed');
        }
        content = json.text;
      } else if (file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc')) {
        content = `[Word Document: ${file.name}]\n\nWord files can't be parsed automatically. Please paste your resume text below or use a PDF instead.`;
      } else {
        // Plain text, Markdown, etc.
        content = await file.text();
      }

      setAttachedFile({ name: file.name, content });
    } catch (err) {
      console.error('Error reading file:', err);
      alert(err instanceof Error ? err.message : 'Error reading file. Please paste the content directly.');
    } finally {
      setFileLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (attachedFile) {
      // Embed text content with clear delimiters — no filename or emoji that
      // could trigger the model's "I can't read files" heuristic.
      const preamble = input.trim()
        ? `${input}\n\n`
        : 'Here is my resume text. Please use it to build my Founder Context.\n\n';

      const message = `${preamble}--- RESUME START ---\n${attachedFile.content}\n--- RESUME END ---`;

      append({ role: 'user', content: message });
      setAttachedFile(null);

      // Clear the text input
      const inputEvent = { target: { value: '' } } as ChangeEvent<HTMLInputElement>;
      handleInputChange(inputEvent);
    } else if (input.trim()) {
      handleSubmit(e);
    }
  };

  const removeAttachment = () => {
    setAttachedFile(null);
  };

  return (
    <Card className="w-full max-w-4xl h-[700px] flex flex-col bg-zinc-950 border-zinc-800 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-emerald-500" />
          <h2 className="font-mono text-sm text-zinc-300 tracking-wider">INTAKE_SESSION_V1</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
          <span className="text-xs font-mono text-zinc-500">{isLoading ? 'PROCESSING' : 'ONLINE'}</span>
        </div>
      </div>

      {/* Chat Area - Native scroll */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ scrollBehavior: 'smooth' }}
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 text-sm font-mono whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-emerald-900/20 text-emerald-100 border border-emerald-800'
                  : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
              }`}
            >
              {/* Role label */}
              <div className={`text-xs mb-2 ${m.role === 'user' ? 'text-emerald-400' : 'text-cyan-400'}`}>
                {m.role === 'user' ? '> YOU' : '( ? _ ? ) INTERVIEWER'}
              </div>
              {m.content}
            </div>
          </div>
        ))}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
              <span className="text-xs font-mono text-zinc-500">Interviewer is thinking...</span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="flex justify-center p-4">
            <div className="bg-red-900/20 border border-red-800 text-red-200 text-xs font-mono p-2 rounded flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>CONNECTION ERROR: {error.message}</span>
            </div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {thesisGenerating && (
        <div className="px-4 py-2 bg-cyan-900/20 border-t border-cyan-800/40">
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Founder Context captured — generating thesis candidates, redirecting to Thesis...</span>
          </div>
        </div>
      )}
      {!thesisGenerating && session.founderContext && session.founderContext.includes('## Founder DNA') && (
        <div className="px-4 py-2 bg-emerald-900/20 border-t border-emerald-800/40">
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-300">
            <CheckCircle className="w-4 h-4" />
            <span>Founder Context captured — {session.founderContext.length.toLocaleString()} chars.</span>
            <Compass className="w-4 h-4 ml-2 text-cyan-400" />
            <span className="text-cyan-400">Thesis candidates ready.</span>
          </div>
        </div>
      )}

      {/* Attached File Preview */}
      {attachedFile && (
        <div className="px-4 py-2 bg-zinc-900/80 border-t border-zinc-800">
          <div className="flex items-center gap-2 text-xs font-mono">
            <FileText className="w-4 h-4 text-emerald-500" />
            <span className="text-zinc-300 truncate flex-1">{attachedFile.name}</span>
            <button
              onClick={removeAttachment}
              className="text-zinc-500 hover:text-red-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 bg-zinc-900/50 border-t border-zinc-800 shrink-0">
        <form onSubmit={handleFormSubmit} className="flex gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.pdf,.doc,.docx,text/plain,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Attach button */}
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || fileLoading}
            className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400"
            title="Attach resume (PDF, TXT, DOCX)"
          >
            {fileLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Paperclip className="w-4 h-4" />
            )}
          </Button>

          <Input
            value={input}
            onChange={handleInputChange}
            placeholder={attachedFile ? "Add a message (optional)..." : "Enter your response or paste resume..."}
            disabled={isLoading}
            className="flex-1 bg-zinc-950 border-zinc-800 text-zinc-300 font-mono focus-visible:ring-emerald-500/50 disabled:opacity-50"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || (!input.trim() && !attachedFile)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
        <div className="mt-2 text-xs text-zinc-600 font-mono flex items-center justify-between">
          <span>{isLoading ? '⏳ Waiting for response...' : 'Press Enter to send • 📎 to attach resume'}</span>
          {attachedFile && <span className="text-emerald-500">📄 File attached</span>}
        </div>
      </div>
    </Card>
  );
}
