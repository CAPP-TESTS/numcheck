import express from "express";
import { createServer as createViteServer } from "vite";
import * as cheerio from "cheerio";
import { PDFParse } from "pdf-parse";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json());

let ai: GoogleGenAI | null = null;
function getAi() {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is required");
    ai = new GoogleGenAI({ apiKey: key });
  }
  return ai;
}

let cachedWindTreText: string | null = null;

async function getWindTrePremiumNumbersText() {
  if (cachedWindTreText) return cachedWindTreText;
  
  try {
    const response = await fetch("https://www.windtre.it/windtregroup/governance/servizi-a-sovrapprezzo");
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const pdfLinks: string[] = [];
    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (href && href.toLowerCase().endsWith(".pdf")) {
        const fullUrl = href.startsWith("http") ? href : `https://www.windtre.it${href}`;
        pdfLinks.push(fullUrl);
      }
    });
    
    let allText = "";
    for (const link of pdfLinks.slice(0, 4)) {
      try {
        const pdfRes = await fetch(link);
        const arrayBuffer = await pdfRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const parser = new PDFParse({ data: buffer });
        const data = await parser.getText();
        allText += data.text + "\n";
        await parser.destroy();
      } catch (e) {
        console.error(`Failed to parse PDF ${link}:`, e);
      }
    }
    
    cachedWindTreText = allText;
    return allText;
  } catch (e) {
    console.error("Failed to fetch WindTre page:", e);
    return "";
  }
}

async function checkWindTre(number: string): Promise<boolean> {
  const text = await getWindTrePremiumNumbersText();
  const cleanNumber = number.replace(/\D/g, "");
  if (cleanNumber.length < 4) return false;
  return text.includes(cleanNumber);
}

async function checkAgcom(number: string): Promise<any> {
  try {
    const cleanNumber = number.replace(/^\+39/, "").replace(/\D/g, "");
    const res = await fetch(`https://datiroc.agcom.it/api/getNumerazioniCallCenter/${cleanNumber}`);
    if (res.ok) {
      const text = await res.text();
      if (text && text.trim().startsWith("{")) {
        const data = JSON.parse(text);
        if (data && Object.keys(data).length > 0) {
          return data;
        }
      }
    }
  } catch (e) {
    console.error("AGCOM check failed:", e);
  }
  return null;
}

async function checkTellows(number: string): Promise<any> {
  try {
    let tellowsNumber = number.replace(/\D/g, "");
    if (!tellowsNumber.startsWith("39") && tellowsNumber.length <= 10) {
      tellowsNumber = "39" + tellowsNumber;
    }
    const res = await fetch(`https://www.tellows.it/num/%2B${tellowsNumber}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      
      const score = $("#tellowsscore").text().trim() || $("img[alt*='tellows score']").attr("alt") || "N/A";
      const name = $("a[href*='/caller/']").first().text().trim() || "Sconosciuto";
      const searchCount = $("div:contains('richieste')").last().text().trim().replace(/\s+/g, " ") || "";

      return {
        score,
        name,
        details: searchCount.substring(0, 100)
      };
    }
  } catch (e) {
    console.error("Tellows check failed:", e);
  }
  return null;
}

async function checkUrlVoid(url: string): Promise<any> {
  try {
    const cleanUrl = url.replace(/^https?:\/\//, "").split("/")[0];
    const res = await fetch(`https://www.urlvoid.com/scan/${cleanUrl}/`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      
      let blacklistStatus = "N/A";
      let domainRegistration = "N/A";
      
      $("table tbody tr").each((_, el) => {
        const rowText = $(el).text();
        if (rowText.includes("Blacklist Status")) {
          blacklistStatus = $(el).find("td").last().text().trim();
        }
        if (rowText.includes("Domain Registration")) {
          domainRegistration = $(el).find("td").last().text().trim();
        }
      });

      return {
        blacklistStatus,
        registration: domainRegistration
      };
    }
  } catch (e) {
    console.error("URLVoid check failed:", e);
  }
  return null;
}

app.post("/api/analyze", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const ai = getAi();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Extract all phone numbers and URLs from the following text. 
      For phone numbers, normalize them to a standard format (e.g., remove spaces, keep country code if present, otherwise assume Italian +39). 
      For URLs, extract just the domain name or the full URL without http/https if possible.
      
      Text:
      ${text}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            phoneNumbers: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of extracted phone numbers, normalized.",
            },
            urls: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of extracted URLs or domains, without http:// or https://.",
            },
          },
        },
      },
    });
    
    const jsonStr = response.text?.trim() || "{}";
    const extracted = JSON.parse(jsonStr);
    
    const phoneNumbers = extracted.phoneNumbers || [];
    const urls = extracted.urls || [];
    
    const phoneResults = [];
    for (const num of phoneNumbers) {
      let result: any = { number: num, checks: {} };
      
      // 1. WindTre Premium
      const isPremium = await checkWindTre(num);
      result.checks.windTrePremium = isPremium;
      
      // 2. AGCOM ROC
      if (!isPremium) {
        const agcomData = await checkAgcom(num);
        result.checks.agcom = agcomData;
        
        // 3. Tellows
        if (!agcomData) {
          const tellowsData = await checkTellows(num);
          result.checks.tellows = tellowsData;
        }
      }
      
      phoneResults.push(result);
    }
    
    const urlResults = [];
    for (const url of urls) {
      const urlData = await checkUrlVoid(url);
      urlResults.push({ url, checks: { urlVoid: urlData } });
    }

    res.json({
      extracted: { phoneNumbers, urls },
      analysis: {
        phones: phoneResults,
        urls: urlResults
      }
    });

  } catch (error: any) {
    console.error("Analysis error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
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
