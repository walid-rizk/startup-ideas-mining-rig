"use client";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload, Trash2 } from "lucide-react";
import { useSession } from "@/lib/session-context";
import { MODEL_OPTIONS } from "@/lib/types";

export function SessionToolbar({ compact = false }: { compact?: boolean }) {
  const { session, update, reset, exportSession, importSession } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importSession(file);
    } catch (err) {
      alert(
        `Import failed: ${err instanceof Error ? err.message : "invalid session file"}`,
      );
    } finally {
      e.target.value = "";
    }
  };

  const handleReset = () => {
    if (confirm("Clear this session? Survivors, PRDs, and blueprints will be lost.")) {
      reset();
    }
  };

  const currentKey = `${session.modelChoice.provider}:${session.modelChoice.model}`;

  return (
    <div className="flex items-center gap-2 text-xs">
      <select
        value={currentKey}
        onChange={(e) => {
          const [provider, model] = e.target.value.split(":") as [
            "anthropic" | "gemini",
            string,
          ];
          update({ modelChoice: { provider, model } });
        }}
        className="bg-zinc-950 border border-zinc-700 text-zinc-300 rounded px-2 py-1 font-mono"
        aria-label="Model"
      >
        {MODEL_OPTIONS.map((opt) => (
          <option key={`${opt.provider}:${opt.model}`} value={`${opt.provider}:${opt.model}`}>
            {opt.label}
          </option>
        ))}
      </select>

      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImport}
      />

      <Button
        variant="ghost"
        size="sm"
        className="text-zinc-400 hover:text-zinc-100"
        onClick={() => fileRef.current?.click()}
        title="Import session"
      >
        <Upload className="w-4 h-4" />
        {!compact && <span className="ml-1">Import</span>}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="text-zinc-400 hover:text-zinc-100"
        onClick={exportSession}
        title="Export session"
      >
        <Download className="w-4 h-4" />
        {!compact && <span className="ml-1">Export</span>}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="text-zinc-500 hover:text-red-400"
        onClick={handleReset}
        title="Clear session"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
