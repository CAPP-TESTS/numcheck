import express from "express";
import { createServer as createViteServer } from "vite";
import { extractEntities } from "./lib/extractor";
import {
  checkWindTre,
  checkAgcom,
  checkTellows,
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

    // 1. Extract phone numbers and URLs using Gemini
    const extracted = await extractEntities(text);
    const { phoneNumbers, urls } = extracted;

    // 2. Phone number checks (sequential: WindTre → AGCOM → Tellows)
    const phoneResults = [];
    for (const num of phoneNumbers) {
      const result: any = {
        number: num,
        checks: { windTrePremium: { isPremium: false } },
      };

      // Step 1: WindTre premium
      const windtre = await checkWindTre(num);
      result.checks.windTrePremium = windtre;

      // Step 2: AGCOM (only if not premium)
      if (!windtre.isPremium) {
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

    res.json({
      extracted: { phoneNumbers, urls },
      analysis: {
        phones: phoneResults,
        urls: urlResults,
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
