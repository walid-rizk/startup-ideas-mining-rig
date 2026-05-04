'use client';

import { useChat } from 'ai/react';
import { useRef, useEffect, useState, useCallback, useMemo, ChangeEvent, memo } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Send, Terminal, Loader2, AlertCircle, Paperclip, FileText, X, CheckCircle, Compass } from 'lucide-react';
import { useSession } from '@/lib/session-context';
import { streamToText } from '@/lib/streaming';

const MessageBubble = memo(function MessageBubble({ role, content }: { role: string; content: string }) {
  return (
    <div
      className={`max-w-[80%] rounded-lg p-3 text-sm font-mono whitespace-pre-wrap ${
        role === 'user'
          ? 'bg-emerald-900/20 text-emerald-100 border border-emerald-800'
          : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
      }`}
    >
      <div className={`text-xs mb-2 ${role === 'user' ? 'text-emerald-400' : 'text-cyan-400'}`}>
        {role === 'user' ? '> YOU' : '( ? _ ? ) INTERVIEWER'}
      </div>
      {content}
    </div>
  );
});

const WELCOME_MESSAGE = {
  id: 'welcome-1',
  role: 'assistant' as const,
  content:
    "Welcome to the Startup Ideas Mining Rig. I am your Interviewer. I need to understand your background and goals to build your Founder Context.\n\nYou can either:\n• Answer my questions directly\n• Upload your resume (PDF, TXT, or DOCX) using the 📎 button\n\nShall we begin?",
};

export default function IntakeSession() {
  const { session, update } = useSession();
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  const prevCountRef = useRef(messages.length);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Scroll when a new message appears (not on every streaming token)
  useEffect(() => {
    const grew = messages.length > prevCountRef.current;
    prevCountRef.current = messages.length;
    if (!grew) return;

    const last = messages[messages.length - 1];
    if (last?.role === 'assistant' && lastAssistantRef.current) {
      lastAssistantRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // During streaming: use ResizeObserver on the streaming message to auto-scroll
  // as it grows — event-driven, no per-render overhead
  const isStreaming = isLoading && messages.length > 0 && messages[messages.length - 1].role === 'assistant';

  useEffect(() => {
    const target = lastAssistantRef.current;
    const container = chatContainerRef.current;
    if (!isStreaming || !target || !container) return;

    const observer = new ResizeObserver(() => {
      const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
      if (nearBottom) {
        container.scrollTop = container.scrollHeight;
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [isStreaming]);

  // Memoize completed messages — during streaming only the active message re-renders
  const completedCount = isStreaming ? messages.length - 1 : messages.length;
  const completedElements = useMemo(() => {
    const slice = messages.slice(0, completedCount);
    const lastAstIdx = (() => {
      for (let i = slice.length - 1; i >= 0; i--) {
        if (slice[i].role === 'assistant') return i;
      }
      return -1;
    })();
    return slice.map((m, idx) => (
      <div
        key={m.id}
        ref={!isStreaming && idx === lastAstIdx ? lastAssistantRef : undefined}
        className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
        style={{ contain: 'content' }}
      >
        <MessageBubble role={m.role} content={m.content} />
      </div>
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedCount]);

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, []);

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

  const linkedinUrlRegex = /https?:\/\/(?:www\.)?linkedin\.com\/in\/[\w-]+\/?/i;

  const fetchLinkedIn = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok || json.error) return null;
      return json.text as string;
    } catch {
      return null;
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (attachedFile) {
      const preamble = input.trim()
        ? `${input}\n\n`
        : 'Here is my resume text. Please use it to build my Founder Context.\n\n';

      const message = `${preamble}--- RESUME START ---\n${attachedFile.content}\n--- RESUME END ---`;

      append({ role: 'user', content: message });
      setAttachedFile(null);

      const inputEvent = { target: { value: '' } } as ChangeEvent<HTMLInputElement>;
      handleInputChange(inputEvent);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } else if (input.trim()) {
      const linkedinMatch = input.match(linkedinUrlRegex);
      if (linkedinMatch) {
        setFileLoading(true);
        const profileText = await fetchLinkedIn(linkedinMatch[0]);
        setFileLoading(false);

        if (profileText) {
          const otherText = input.replace(linkedinMatch[0], '').trim();
          const preamble = otherText
            ? `${otherText}\n\n`
            : 'Here is my LinkedIn profile. Please use it to build my Founder Context.\n\n';

          append({ role: 'user', content: `${preamble}--- LINKEDIN PROFILE ---\n${profileText}\n--- END LINKEDIN PROFILE ---` });

          const inputEvent = { target: { value: '' } } as ChangeEvent<HTMLInputElement>;
          handleInputChange(inputEvent);
          if (textareaRef.current) textareaRef.current.style.height = 'auto';
        } else {
          append({ role: 'user', content: `I tried sharing my LinkedIn profile (${linkedinMatch[0]}) but it couldn't be fetched automatically. Could you ask me the key questions to build my Founder Context instead?` });

          const inputEvent = { target: { value: '' } } as ChangeEvent<HTMLInputElement>;
          handleInputChange(inputEvent);
          if (textareaRef.current) textareaRef.current.style.height = 'auto';
        }
      } else {
        handleSubmit(e);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      }
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

      {/* Chat Area */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ willChange: 'scroll-position' }}
      >
        {completedElements}

        {isStreaming && (
          <div
            ref={lastAssistantRef}
            className="flex justify-start"
            style={{ contain: 'content' }}
          >
            <MessageBubble role="assistant" content={messages[messages.length - 1].content} />
          </div>
        )}

        {isLoading && !isStreaming && (
          <div className="flex justify-start">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
              <span className="text-xs font-mono text-zinc-500">Interviewer is thinking...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center p-4">
            <div className="bg-red-900/20 border border-red-800 text-red-200 text-xs font-mono p-2 rounded flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>CONNECTION ERROR: {error.message}</span>
            </div>
          </div>
        )}

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

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { handleInputChange(e as unknown as ChangeEvent<HTMLInputElement>); requestAnimationFrame(resizeTextarea); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() || attachedFile) handleFormSubmit(e);
              }
            }}
            placeholder={attachedFile ? "Add a message (optional)..." : "Enter your response or paste resume..."}
            disabled={isLoading}
            rows={1}
            className="flex-1 bg-zinc-950 border border-zinc-800 text-zinc-300 font-mono text-sm rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50"
            style={{ maxHeight: 200 }}
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
          <span>{isLoading ? '⏳ Waiting for response...' : 'Enter to send • Shift+Enter for new line • 📎 to attach resume'}</span>
          {attachedFile && <span className="text-emerald-500">📄 File attached</span>}
        </div>
      </div>
    </Card>
  );
}
