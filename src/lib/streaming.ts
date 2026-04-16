"use client";

// Parses the Vercel AI SDK stream format (lines starting with `0:"..."`) into
// plain text, emitting incremental callbacks as chunks arrive.
export async function streamToText(
  response: Response,
  onChunk?: (accumulated: string) => void,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("0:")) continue;
      try {
        const text = JSON.parse(line.slice(2));
        full += text;
        onChunk?.(full);
      } catch {
        // Skip non-JSON lines
      }
    }
  }
  return full;
}
