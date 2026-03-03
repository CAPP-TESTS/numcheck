import express from "express";
import { createServer as createViteServer } from "vite";
import { extractEntities } from "./lib/extractor";
import {
  checkPremiumNumber,
  checkAgcom,
  checkTellows,
  getPremiumDbStats,
} from "./lib/phone-checks";
import {
  checkUrlVoid,
  checkSucuri,
  checkSafeBrowsing,
} from "./lib/url-checks";

const app = express();
const PORT = 3000;

app.use(express.json());

app.post("/api/analyze", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Il campo 'text' è obbligatorio" });
    }

    // 1. Extract phone numbers and URLs
    const extracted = await extractEntities(text);
    const { phoneNumbers, urls } = extracted;

    // 2. Phone number checks (sequential: Premium → AGCOM → Tellows)
    const phoneResults = [];
    for (const num of phoneNumbers) {
      const result: any = {
        number: num,
        checks: { premiumCheck: { isPremium: false } },
      };

      // Step 1: Premium number check (WindTre + Iliad)
      const premium = await checkPremiumNumber(num);
      result.checks.premiumCheck = premium;

      // Step 2: AGCOM (only if not premium)
      if (!premium.isPremium) {
        const agcom = await checkAgcom(num);
        result.checks.agcom = agcom;

        // Step 3: Tellows (only if not in AGCOM)
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
        return {
          url,
          checks: { urlVoid, sucuri, safeBrowsing },
        };
      })
    );

    // 4. Gather debug info
    const dbStats = await getPremiumDbStats();

    res.json({
      extracted: { phoneNumbers, urls },
      analysis: {
        phones: phoneResults,
        urls: urlResults,
      },
      debug: {
        inputSnippet: text.substring(0, 200),
        extractedPhoneNumbers: phoneNumbers,
        extractedUrls: urls,
        premiumDb: dbStats,
      },
    });
  } catch (error: any) {
    console.error("Analysis error:", error);
    res
      .status(500)
      .json({ error: error.message || "Errore interno del server" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
