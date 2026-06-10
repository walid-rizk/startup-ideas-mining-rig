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

// Parses the Vercel AI SDK stream format (lines starting with `0:"..."`) into
// plain text, emitting incremental callbacks as chunks arrive.
//
// Network chunks do not respect line boundaries, so a `0:"..."` line can be
// split across reads — we buffer the trailing partial line until the next
// chunk completes it. The decoder runs in streaming mode so multi-byte UTF-8
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

  const consumeLine = (line: string) => {
    if (!line.startsWith("0:")) return;
    try {
      const text = JSON.parse(line.slice(2));
      if (typeof text === "string") {
        full += text;
        onChunk?.(full);
      }
    } catch {
      // Malformed line — skip
    }
  };

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

  return full;
}
