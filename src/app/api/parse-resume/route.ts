import { extractText } from "unpdf";

export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File too large (max 10 MB)" }, { status: 413 });
  }
  if (file.type && file.type !== "application/pdf") {
    return Response.json({ error: "Only PDF files are supported" }, { status: 415 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = new Uint8Array(bytes);

  try {
    const { text } = await extractText(buffer, { mergePages: true });
    const cleaned = text
      .replace(/\x00/g, "")       // remove null bytes
      .replace(/[ \t]+/g, " ")    // collapse whitespace
      .replace(/\n{3,}/g, "\n\n") // collapse excess blank lines
      .trim();

    if (!cleaned || cleaned.length < 20) {
      return Response.json(
        { error: "Could not extract readable text from this PDF. Please paste your resume text directly." },
        { status: 422 },
      );
    }

    return Response.json({ text: cleaned });
  } catch {
    return Response.json(
      { error: "PDF parsing failed. Please paste your resume text directly." },
      { status: 422 },
    );
  }
}
