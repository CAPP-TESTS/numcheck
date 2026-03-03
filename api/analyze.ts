import type { VercelRequest, VercelResponse } from "@vercel/node";

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // GET = health-check (useful for debugging deploy issues)
  if (req.method === "GET") {
    return res.json({ status: "ok", env: { hasGeminiKey: !!process.env.GEMINI_API_KEY } });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Dynamic imports — avoids crash-at-load if a dependency has bundling issues
  let extractEntities: typeof import("../lib/extractor")["extractEntities"];
  let checkWindTre: typeof import("../lib/phone-checks")["checkWindTre"];
  let checkAgcom: typeof import("../lib/phone-checks")["checkAgcom"];
  let checkTellows: typeof import("../lib/phone-checks")["checkTellows"];
  let checkUrlVoid: typeof import("../lib/url-checks")["checkUrlVoid"];
  let checkSucuri: typeof import("../lib/url-checks")["checkSucuri"];
  let checkSafeBrowsing: typeof import("../lib/url-checks")["checkSafeBrowsing"];

  try {
    const extractor = await import("../lib/extractor");
    extractEntities = extractor.extractEntities;

    const phoneChecks = await import("../lib/phone-checks");
    checkWindTre = phoneChecks.checkWindTre;
    checkAgcom = phoneChecks.checkAgcom;
    checkTellows = phoneChecks.checkTellows;

    const urlChecks = await import("../lib/url-checks");
    checkUrlVoid = urlChecks.checkUrlVoid;
    checkSucuri = urlChecks.checkSucuri;
    checkSafeBrowsing = urlChecks.checkSafeBrowsing;
  } catch (importErr: any) {
    console.error("Import error:", importErr);
    return res.status(500).json({
      error: "Errore nel caricamento dei moduli",
      detail: importErr.message,
      stack: importErr.stack,
    });
  }

  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Il campo 'text' è obbligatorio" });
    }

    // 1. Extract phone numbers and URLs using Gemini
    const extracted = await extractEntities(text);
    const { phoneNumbers, urls } = extracted;

    // 2. Phone number checks (sequential: WindTre → AGCOM → Tellows)
    const phoneResults: any[] = [];
    for (const num of phoneNumbers) {
      const result: any = {
        number: num,
        checks: { windTrePremium: { isPremium: false } },
      };

      const windtre = await checkWindTre(num);
      result.checks.windTrePremium = windtre;

      if (!windtre.isPremium) {
        const agcom = await checkAgcom(num);
        result.checks.agcom = agcom;

        if (!agcom.found) {
          const tellows = await checkTellows(num);
          result.checks.tellows = tellows;
        }
      }

      phoneResults.push(result);
    }

    // 3. URL checks (all three in parallel for each URL)
    const urlResults = await Promise.all(
      urls.map(async (url: string) => {
        const [urlVoid, sucuri, safeBrowsing] = await Promise.all([
          checkUrlVoid(url),
          checkSucuri(url),
          checkSafeBrowsing(url),
        ]);
        return { url, checks: { urlVoid, sucuri, safeBrowsing } };
      })
    );

    return res.json({
      extracted: { phoneNumbers, urls },
      analysis: { phones: phoneResults, urls: urlResults },
    });
  } catch (error: any) {
    console.error("Analysis error:", error);
    return res.status(500).json({
      error: error.message || "Errore interno del server",
      stack: error.stack,
    });
  }
}
