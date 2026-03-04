import type { VercelRequest, VercelResponse } from "@vercel/node";
import { extractEntities } from "../lib/extractor.js";
import {
  checkPremiumNumber,
  checkAgcom,
  checkTellows,
  getPremiumDbStats,
} from "../lib/phone-checks.js";
import {
  checkUrlVoid,
  checkSucuri,
  checkSafeBrowsing,
  checkPhishingArmy,
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

    // 2. Phone number checks (all three in parallel for each number)
    const phoneResults = await Promise.all(
      phoneNumbers.map(async (num: string) => {
        const [premium, agcom, tellows] = await Promise.all([
          checkPremiumNumber(num),
          checkAgcom(num, text),
          checkTellows(num),
        ]);
        return {
          number: num,
          checks: { premiumCheck: premium, agcom, tellows },
        };
      })
    );

    // 3. URL checks (all four in parallel for each URL)
    const urlResults = await Promise.all(
      urls.map(async (url: string) => {
        const [urlVoid, sucuri, safeBrowsing, phishingArmy] = await Promise.all([
          checkUrlVoid(url),
          checkSucuri(url),
          checkSafeBrowsing(url),
          checkPhishingArmy(url),
        ]);
        return { url, checks: { urlVoid, sucuri, safeBrowsing, phishingArmy } };
      })
    );

    // 4. Gather debug info
    const dbStats = await getPremiumDbStats();

    return res.json({
      extracted: { phoneNumbers, urls },
      analysis: { phones: phoneResults, urls: urlResults },
      debug: {
        inputSnippet: text.substring(0, 200),
        extractedPhoneNumbers: phoneNumbers,
        extractedUrls: urls,
        premiumDb: dbStats,
      },
    });
  } catch (error: any) {
    console.error("Analysis error:", error);
    return res.status(500).json({
      error: error.message || "Errore interno del server",
      detail: error.stack,
    });
  }
}
