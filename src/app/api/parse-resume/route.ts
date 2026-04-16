import { extractText } from "unpdf";

export const maxDuration = 30;

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return Response.json({ error: "No file provided" }, { status: 400 });
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

    console.log(`[parse-resume] extracted ${cleaned.length} chars from ${file.name}`);
    return Response.json({ text: cleaned });
  } catch {
    return Response.json(
      { error: "PDF parsing failed. Please paste your resume text directly." },
      { status: 422 },
    );
  }
}
