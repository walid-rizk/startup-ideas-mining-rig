export const maxDuration = 30;

export async function POST(req: Request) {
  const { url } = (await req.json()) as { url?: string };

  if (!url || typeof url !== "string") {
    return Response.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("linkedin.com")) {
      return Response.json({ error: "Only LinkedIn URLs are supported" }, { status: 400 });
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return Response.json(
        { error: `LinkedIn returned ${res.status}. The profile may be private. Please copy-paste your profile content instead.` },
        { status: 422 },
      );
    }

    const html = await res.text();

    // LinkedIn embeds profile data in JSON-LD script tags and meta tags
    const chunks: string[] = [];

    // Extract JSON-LD structured data (richest source)
    const jsonLdMatches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    for (const m of jsonLdMatches) {
      try {
        const data = JSON.parse(m[1]);
        if (data["@type"] === "Person" || data.name) {
          if (data.name) chunks.push(`Name: ${data.name}`);
          if (data.jobTitle) chunks.push(`Title: ${data.jobTitle}`);
          if (data.description) chunks.push(`About: ${data.description}`);
          if (data.worksFor?.name) chunks.push(`Company: ${data.worksFor.name}`);
          if (data.alumniOf) {
            const schools = Array.isArray(data.alumniOf) ? data.alumniOf : [data.alumniOf];
            chunks.push(`Education: ${schools.map((s: { name?: string }) => s.name).filter(Boolean).join(", ")}`);
          }
        }
      } catch {
        // skip malformed JSON-LD
      }
    }

    // Extract og:title, og:description meta tags as fallback
    const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i);
    const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i);
    if (ogTitle && !chunks.some((c) => c.startsWith("Name:"))) {
      chunks.push(`Name/Title: ${ogTitle[1]}`);
    }
    if (ogDesc && !chunks.some((c) => c.startsWith("About:"))) {
      chunks.push(`Summary: ${ogDesc[1]}`);
    }

    // Extract visible text from the page as last resort (strip tags)
    if (chunks.length === 0) {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        const text = bodyMatch[1]
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 3000);
        if (text.length > 100) chunks.push(text);
      }
    }

    if (chunks.length === 0) {
      return Response.json(
        { error: "Could not extract profile content. LinkedIn may require sign-in for this profile. Please copy-paste your About and Experience sections instead." },
        { status: 422 },
      );
    }

    return Response.json({ text: chunks.join("\n\n") });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    return Response.json(
      { error: `Failed to fetch LinkedIn profile: ${message}. Please copy-paste your profile content instead.` },
      { status: 500 },
    );
  }
}
