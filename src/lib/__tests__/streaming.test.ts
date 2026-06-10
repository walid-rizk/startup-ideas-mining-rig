import { describe, it, expect } from "vitest";
import { streamToText, ensureOk } from "../streaming";

function responseFromChunks(chunks: Uint8Array[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(stream);
}

// Encodes texts as AI SDK v6 UI-message SSE events (what
// toUIMessageStreamResponse emits): `data: {json}\n\n` + [DONE] terminator.
function sse(...texts: string[]): string {
  const events = [
    `data: {"type":"start"}\n\n`,
    `data: {"type":"text-start","id":"t1"}\n\n`,
    ...texts.map((t) => `data: ${JSON.stringify({ type: "text-delta", id: "t1", delta: t })}\n\n`),
    `data: {"type":"text-end","id":"t1"}\n\n`,
    `data: {"type":"finish"}\n\n`,
    `data: [DONE]\n\n`,
  ];
  return events.join("");
}

describe("streamToText", () => {
  it("parses complete SSE events in a single chunk", async () => {
    const payload = new TextEncoder().encode(sse("Hello ", "world"));
    const text = await streamToText(responseFromChunks([payload]));
    expect(text).toBe("Hello world");
  });

  it("survives an event split across two network chunks", async () => {
    const bytes = new TextEncoder().encode(sse("Hello ", "world"));
    // Split mid-way through a text-delta event's JSON
    const splitAt = bytes.length - 60;
    const text = await streamToText(
      responseFromChunks([bytes.slice(0, splitAt), bytes.slice(splitAt)]),
    );
    expect(text).toBe("Hello world");
  });

  it("survives a multi-byte character split across chunks", async () => {
    const bytes = new TextEncoder().encode(sse("café ☕", " done"));
    // 0xe2 is the first byte of ☕ — split inside the character
    const splitAt = bytes.findIndex((b) => b === 0xe2) + 1;
    expect(splitAt).toBeGreaterThan(0);
    const text = await streamToText(
      responseFromChunks([bytes.slice(0, splitAt), bytes.slice(splitAt)]),
    );
    expect(text).toBe("café ☕ done");
  });

  it("ignores non-text protocol events", async () => {
    const raw =
      `data: {"type":"start"}\n\n` +
      `data: ${JSON.stringify({ type: "text-delta", id: "t1", delta: "a" })}\n\n` +
      `data: {"type":"tool-input-start","toolCallId":"x","toolName":"web_search"}\n\n` +
      `data: ${JSON.stringify({ type: "text-delta", id: "t1", delta: "b" })}\n\n` +
      `data: [DONE]\n\n`;
    const text = await streamToText(responseFromChunks([new TextEncoder().encode(raw)]));
    expect(text).toBe("ab");
  });

  it("throws the server's message on error events", async () => {
    const raw =
      `data: {"type":"start"}\n\n` +
      `data: ${JSON.stringify({ type: "error", errorText: "Invalid API key" })}\n\n`;
    await expect(
      streamToText(responseFromChunks([new TextEncoder().encode(raw)])),
    ).rejects.toThrow("Invalid API key");
  });

  it("emits cumulative text via onChunk", async () => {
    const bytes = new TextEncoder().encode(sse("a", "b", "c"));
    const seen: string[] = [];
    await streamToText(responseFromChunks([bytes]), (acc) => seen.push(acc));
    expect(seen).toEqual(["a", "ab", "abc"]);
  });
});

describe("ensureOk", () => {
  it("passes through ok responses", async () => {
    await expect(ensureOk(new Response("ok", { status: 200 }), "fallback")).resolves.toBeUndefined();
  });

  it("throws the server's JSON error message", async () => {
    const res = new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is not set." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
    await expect(ensureOk(res, "Failed to generate ideas")).rejects.toThrow(
      "ANTHROPIC_API_KEY is not set.",
    );
  });

  it("falls back when the body is not JSON", async () => {
    const res = new Response("<html>gateway error</html>", { status: 502 });
    await expect(ensureOk(res, "Failed to generate ideas")).rejects.toThrow(
      "Failed to generate ideas",
    );
  });
});
