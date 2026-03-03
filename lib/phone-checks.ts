import * as cheerio from "cheerio";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WindTreResult {
  isPremium: boolean;
  matchedPrefix?: string;
  service?: string;
  context?: string;
}

export interface AgcomResult {
  found: boolean;
  data?: Record<string, unknown>;
}

export interface TellowsResult {
  found: boolean;
  score?: string;
  name?: string;
  details?: string;
}

// ─── PdfPlumber-style helpers ────────────────────────────────────────────────

interface TableRow {
  cells: string[];
  raw: string;
}

interface PremiumEntry {
  prefix: string;
  service: string;
  context: string;
}

/**
 * Splits raw PDF text into table-like rows by detecting column separators
 * (2+ consecutive spaces). This mimics pdfplumber's table detection logic:
 * rather than relying on invisible table grid lines, we treat significant
 * whitespace gaps as column boundaries.
 */
function extractTableRows(text: string): TableRow[] {
  const lines = text.split("\n");
  const rows: TableRow[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 3) continue;

    // Column separator heuristic: 2+ spaces between tokens
    const cells = trimmed
      .split(/\s{2,}/)
      .map((c) => c.trim())
      .filter(Boolean);

    rows.push({ cells, raw: trimmed });
  }

  return rows;
}

/** Known Italian premium / special-rate number prefixes (first 3 digits). */
const PREMIUM_STARTS = [
  "199",
  "899",
  "895",
  "892",
  "894",
  "893",
  "166",
  "144",
  "163",
  "164",
  "709",
  "178",
  "488",
  "840",
  "841",
  "848",
  "047",
];

function isPotentialPremiumNumber(num: string): boolean {
  return PREMIUM_STARTS.some((p) => num.startsWith(p));
}

/**
 * Extracts premium number entries from table rows in a pdfplumber-inspired way.
 * For each row, scans cells for number patterns and, when found, pairs the number
 * with textual context from adjacent cells (service name, cost description, etc.).
 */
function extractPremiumEntries(rows: TableRow[]): PremiumEntry[] {
  const entries: PremiumEntry[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    // Try to find number-like tokens in each cell
    for (let ci = 0; ci < row.cells.length; ci++) {
      const cell = row.cells[ci];
      // Match sequences of 3-10 digits (possibly with separators like dots/dashes)
      const numTokens = cell.match(/\b\d[\d.\-/]{2,9}\b/g);
      if (!numTokens) continue;

      for (const raw of numTokens) {
        const digits = raw.replace(/\D/g, "");
        if (digits.length < 3 || digits.length > 10) continue;
        if (!isPotentialPremiumNumber(digits)) continue;
        if (seen.has(digits)) continue;
        seen.add(digits);

        // Gather service description from the other cells in the same row
        const otherCells = row.cells
          .filter((_, i) => i !== ci)
          .filter((c) => /[a-zA-ZàèéìòùÀÈÉÌÒÙ]/.test(c));
        const service = otherCells.join(" – ") || "";

        entries.push({
          prefix: digits,
          service,
          context: row.raw,
        });
      }
    }
  }

  return entries;
}

// ─── Resilient PDF text extraction (v1 & v2 compatible) ─────────────────────

/**
 * Extracts text from a PDF buffer. Handles both pdf-parse v1 (default export
 * function) and v2 (named class PDFParse). Falls back gracefully if the
 * module is unavailable or the API changes.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import — cast to any so we can probe both v1 and v2 APIs at
    // runtime without TypeScript complaining about whichever version's types
    // happen to be installed.
    const mod: any = await import("pdf-parse");

    // v2 class-based API: import { PDFParse } from "pdf-parse"
    if (mod.PDFParse && typeof mod.PDFParse === "function") {
      const parser = new mod.PDFParse({ data: buffer });
      const data = await parser.getText();
      const text = data.text || "";
      await parser.destroy();
      return text;
    }

    // v1 function-based API: import pdfParse from "pdf-parse"
    const pdfParse = mod.default || mod;
    if (typeof pdfParse === "function") {
      const data = await pdfParse(buffer);
      return data.text || "";
    }

    console.error("pdf-parse: could not detect API version");
    return "";
  } catch (e) {
    console.error("pdf-parse extraction failed:", e);
    return "";
  }
}

// ─── WindTre premium number check ────────────────────────────────────────────

let cachedEntries: PremiumEntry[] | null = null;
let cachedRawText: string | null = null;

async function fetchPdfLinks(): Promise<string[]> {
  const response = await fetch(
    "https://www.windtre.it/windtregroup/governance/servizi-a-sovrapprezzo"
  );
  const html = await response.text();
  const $ = cheerio.load(html);

  const pdfLinks: string[] = [];
  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (href && href.toLowerCase().endsWith(".pdf")) {
      const fullUrl = href.startsWith("http")
        ? href
        : `https://www.windtre.it${href}`;
      if (!pdfLinks.includes(fullUrl)) {
        pdfLinks.push(fullUrl);
      }
    }
  });

  return pdfLinks.slice(0, 4);
}

async function loadWindTreData(): Promise<{
  entries: PremiumEntry[];
  rawText: string;
}> {
  if (cachedEntries && cachedRawText) {
    return { entries: cachedEntries, rawText: cachedRawText };
  }

  const pdfLinks = await fetchPdfLinks();
  const allEntries: PremiumEntry[] = [];
  let allText = "";

  for (const link of pdfLinks) {
    try {
      const pdfRes = await fetch(link);
      const arrayBuffer = await pdfRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const text = await extractPdfText(buffer);
      allText += text + "\n";

      // PdfPlumber-style: extract table rows then identify premium entries
      const rows = extractTableRows(text);
      const entries = extractPremiumEntries(rows);
      allEntries.push(...entries);
    } catch (e) {
      console.error(`Failed to parse PDF ${link}:`, e);
    }
  }

  cachedEntries = allEntries;
  cachedRawText = allText;
  return { entries: allEntries, rawText: allText };
}

export async function checkWindTre(number: string): Promise<WindTreResult> {
  try {
    const { entries, rawText } = await loadWindTreData();
    // Strip optional country code and non-digits
    const clean = number.replace(/^\+?39/, "").replace(/\D/g, "");
    if (clean.length < 3) return { isPremium: false };

    // 1. Match against structured prefix list (longest match wins)
    let bestMatch: PremiumEntry | null = null;
    for (const entry of entries) {
      if (clean.startsWith(entry.prefix)) {
        if (!bestMatch || entry.prefix.length > bestMatch.prefix.length) {
          bestMatch = entry;
        }
      }
    }

    if (bestMatch) {
      return {
        isPremium: true,
        matchedPrefix: bestMatch.prefix,
        service: bestMatch.service,
        context: bestMatch.context,
      };
    }

    // 2. Fallback: direct text search in the raw PDF content
    if (rawText.includes(clean)) {
      return {
        isPremium: true,
        matchedPrefix: clean,
        context: "Trovato nel database WindTre (ricerca diretta)",
      };
    }

    return { isPremium: false };
  } catch (e) {
    console.error("WindTre check error:", e);
    return { isPremium: false };
  }
}

// ─── AGCOM ROC call-center registry ──────────────────────────────────────────

export async function checkAgcom(number: string): Promise<AgcomResult> {
  try {
    const clean = number.replace(/^\+?39/, "").replace(/\D/g, "");
    const res = await fetch(
      `https://datiroc.agcom.it/api/getNumerazioniCallCenter/${clean}`
    );
    if (!res.ok) return { found: false };

    const text = await res.text();
    if (!text || !text.trim()) return { found: false };

    // The API returns JSON when the number is registered, nothing otherwise
    if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
      const data = JSON.parse(text);
      // Check both object and array responses
      if (Array.isArray(data) && data.length === 0) return { found: false };
      if (
        typeof data === "object" &&
        data !== null &&
        Object.keys(data).length > 0
      ) {
        return { found: true, data };
      }
    }
  } catch (e) {
    console.error("AGCOM check error:", e);
  }
  return { found: false };
}

// ─── Tellows reputation lookup ───────────────────────────────────────────────

export async function checkTellows(number: string): Promise<TellowsResult> {
  try {
    let tellowsNum = number.replace(/\D/g, "");
    // Ensure Italian prefix
    if (!tellowsNum.startsWith("39") && tellowsNum.length <= 10) {
      tellowsNum = "39" + tellowsNum;
    }

    const res = await fetch(
      `https://www.tellows.it/num/%2B${tellowsNum}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );

    if (!res.ok) return { found: false };

    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract score - try multiple selectors for robustness
    const score =
      $("#tellowsscore").text().trim() ||
      $(".score_result").text().trim() ||
      $("img[alt*='tellows']")
        .attr("alt")
        ?.replace(/[^\d]/g, "") ||
      "";

    // Extract caller name
    const name =
      $("a[href*='/caller/']").first().text().trim() ||
      $(".caller_name").first().text().trim() ||
      "";

    // Extract comment / search count details
    const details =
      $(".comments_count, .search_count, div:contains('richieste')")
        .last()
        .text()
        .trim()
        .replace(/\s+/g, " ")
        .substring(0, 200) || "";

    const hasData = !!(score || name);
    return {
      found: hasData,
      score: score || "N/A",
      name: name || "Sconosciuto",
      details: details || undefined,
    };
  } catch (e) {
    console.error("Tellows check error:", e);
  }
  return { found: false };
}
