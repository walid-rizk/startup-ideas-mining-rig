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

function encodeLines(...texts: string[]): string {
  return texts.map((t) => `0:${JSON.stringify(t)}\n`).join("");
}

describe("streamToText", () => {
  it("parses complete lines in a single chunk", async () => {
    const payload = new TextEncoder().encode(encodeLines("Hello ", "world"));
    const text = await streamToText(responseFromChunks([payload]));
    expect(text).toBe("Hello world");
  });

  it("survives a line split across two network chunks", async () => {
    const bytes = new TextEncoder().encode(encodeLines("Hello ", "world"));
    // Split mid-way through the second line's JSON string
    const splitAt = bytes.length - 5;
    const text = await streamToText(
      responseFromChunks([bytes.slice(0, splitAt), bytes.slice(splitAt)]),
    );
    expect(text).toBe("Hello world");
  });

  it("survives a multi-byte character split across chunks", async () => {
    const bytes = new TextEncoder().encode(encodeLines("café ☕", " done"));
    // 0xe2 is the first byte of ☕ — split inside the character
    const splitAt = bytes.findIndex((b) => b === 0xe2) + 1;
    expect(splitAt).toBeGreaterThan(0);
    const text = await streamToText(
      responseFromChunks([bytes.slice(0, splitAt), bytes.slice(splitAt)]),
    );
    expect(text).toBe("café ☕ done");
  });

  it("flushes a final line that has no trailing newline", async () => {
    const payload = new TextEncoder().encode(`0:${JSON.stringify("tail")}`);
    const text = await streamToText(responseFromChunks([payload]));
    expect(text).toBe("tail");
  });

  it("ignores non-text protocol lines", async () => {
    const raw = `0:${JSON.stringify("a")}\nd:{"finishReason":"stop"}\n0:${JSON.stringify("b")}\n`;
    const text = await streamToText(responseFromChunks([new TextEncoder().encode(raw)]));
    expect(text).toBe("ab");
  });

  it("emits cumulative text via onChunk", async () => {
    const bytes = new TextEncoder().encode(encodeLines("a", "b", "c"));
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
