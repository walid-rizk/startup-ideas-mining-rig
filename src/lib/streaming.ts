"use client";

// Reads the error body of a failed API response so the user sees the server's
// actionable message (e.g. "ANTHROPIC_API_KEY is not set...") instead of a
// generic fallback.
export async function ensureOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  let message = fallback;
  try {
    const json = await response.json();
    if (json && typeof json.error === "string" && json.error.trim()) {
      message = json.error;
    }
  } catch {
    // body wasn't JSON — keep the fallback
  }
  throw new Error(message);
}

// Parses the AI SDK v6 UI-message SSE stream (`data: {json}` events emitted by
// toUIMessageStreamResponse) into plain text, emitting incremental callbacks
// as chunks arrive. Accumulates `text-delta` events; throws on `error` events
// so callers surface the server's real failure message.
//
// Provider-executed web search reports its citations as `source-url` events,
// not text (Gemini grounding never inlines URLs; Anthropic only sometimes
// does). Those are collected and appended as a `## Sources` section so the
// persisted report carries its citations regardless of provider.
//
// Network chunks do not respect line boundaries, so an SSE line can be split
// across reads — we buffer the trailing partial line until the next chunk
// completes it. The decoder runs in streaming mode so multi-byte UTF-8
// characters split across chunks survive too.
export async function streamToText(
  response: Response,
  onChunk?: (accumulated: string) => void,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";
  const sources: Array<{ url: string; title?: string }> = [];

  const consumeLine = (line: string) => {
    if (!line.startsWith("data: ")) return;
    const payload = line.slice(6).trim();
    if (!payload || payload === "[DONE]") return;
    let chunk: { type?: string; delta?: unknown; errorText?: unknown; url?: unknown; title?: unknown };
    try {
      chunk = JSON.parse(payload);
    } catch {
      return; // malformed event — skip
    }
    if (chunk.type === "text-delta" && typeof chunk.delta === "string") {
      full += chunk.delta;
      onChunk?.(full);
    } else if (chunk.type === "source-url" && typeof chunk.url === "string") {
      if (!sources.some((s) => s.url === chunk.url)) {
        sources.push({
          url: chunk.url,
          title: typeof chunk.title === "string" && chunk.title.trim() ? chunk.title : undefined,
        });
      }
    } else if (chunk.type === "error") {
      throw new Error(
        typeof chunk.errorText === "string" && chunk.errorText.trim()
          ? chunk.errorText
          : "Stream error",
      );
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep the trailing partial line for the next chunk
      for (const line of lines) consumeLine(line);
    }

    buffer += decoder.decode(); // flush any remaining decoder state
    if (buffer) consumeLine(buffer);
  } finally {
    reader.releaseLock();
  }

  if (full && sources.length > 0) {
    const items = sources.map((s, i) => {
      const label = (s.title ?? s.url).replace(/[[\]]/g, "");
      return `${i + 1}. [${label}](${s.url})`;
    });
    full += `\n\n## Sources\n\n${items.join("\n")}`;
    onChunk?.(full);
  }

  return full;
}
