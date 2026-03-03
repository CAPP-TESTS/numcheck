import type { VercelRequest, VercelResponse } from "@vercel/node";
import { extractEntities } from "../lib/extractor.js";
import {
  checkPremiumNumber,
  checkAgcom,
  checkTellows,
} from "../lib/phone-checks.js";
import {
  checkUrlVoid,
  checkSucuri,
  checkSafeBrowsing,
} from "../lib/url-checks.js";

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // GET = health-check (useful for debugging deploy issues)
  if (req.method === "GET") {
    return res.json({ status: "ok" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Il campo 'text' è obbligatorio" });
    }

    // 1. Extract phone numbers and URLs
    const extracted = await extractEntities(text);
    const { phoneNumbers, urls } = extracted;

    // 2. Phone number checks (sequential: Premium → AGCOM → Tellows)
    const phoneResults: any[] = [];
    for (const num of phoneNumbers) {
      const result: any = {
        number: num,
        checks: { premiumCheck: { isPremium: false } },
      };

      const premium = await checkPremiumNumber(num);
      result.checks.premiumCheck = premium;

      if (!premium.isPremium) {
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
      detail: error.stack,
    });
  }
}
