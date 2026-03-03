import * as cheerio from "cheerio";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PremiumCheckResult {
  isPremium: boolean;
  /** "rosso" quando confermata numerazione a sovrapprezzo */
  alert?: "rosso";
  /** Operatore/fonte che ha confermato la numerazione (es. "WindTre", "Iliad") */
  operator?: string;
  /** Prefisso o arco di numerazione corrispondente */
  matchedPrefix?: string;
  /** Nome del centro servizi / operatore associato alla numerazione */
  service?: string;
  /** Riga originale dal PDF */
  context?: string;
  /** Debug info (only present when debug is enabled) */
  debug?: {
    cleanInput: string;
    totalEntries: number;
    matchStrategy: "prefix_table" | "raw_text" | "none";
  };
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

/** Stats about the loaded premium number database. */
export interface PremiumDbStats {
  totalEntries: number;
  rawTextLength: number;
  sampleEntries: Array<{
    prefix: string;
    operator: string;
    service: string;
  }>;
}

// ─── Number normalisation ───────────────────────────────────────────────────

/**
 * Normalizza il numero per le verifiche:
 *  - +39 / 0039 → rimuove il prefisso italiano, restituisce le cifre restanti
 *  - +XX / 00XX (diverso da +39/0039) → lascia il numero così com'è (solo cifre)
 *  - Nessun prefisso → passa direttamente il numero (solo cifre)
 */
function normalizeNumber(number: string): string {
  const trimmed = number.trim();
  if (trimmed.startsWith("+39")) {
    return trimmed.slice(3).replace(/\D/g, "");
  }
  if (trimmed.startsWith("0039")) {
    return trimmed.slice(4).replace(/\D/g, "");
  }
  // Qualsiasi altro caso: rimuovi solo i caratteri non-cifra
  return trimmed.replace(/[^\d]/g, "");
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
  /** Fonte/operatore da cui proviene l'entry */
  operator: string;
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
  "891",
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
 *
 * Handles spaces between digits in cells (e.g. "894 894" → "894894").
 */
function extractPremiumEntries(
  rows: TableRow[],
  operator: string
): PremiumEntry[] {
  const entries: PremiumEntry[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    // Try to find number-like tokens in each cell
    for (let ci = 0; ci < row.cells.length; ci++) {
      const cell = row.cells[ci];

      // Collapse single spaces between digits: "894 894" → "894894"
      const normalized = cell.replace(/(\d)\s+(\d)/g, "$1$2");

      // Match sequences of 3-10 digits (possibly with separators like dots/dashes)
      const numTokens = normalized.match(/\b\d[\d.\-/]{2,9}\b/g);
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
          operator,
        });
      }
    }
  }

  return entries;
}

// ─── Resilient PDF text extraction (v1 & v2 compatible) ─────────────────────

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const mod: any = await import("pdf-parse");

    // v2 class-based API
    if (mod.PDFParse && typeof mod.PDFParse === "function") {
      const parser = new mod.PDFParse({ data: buffer });
      const data = await parser.getText();
      const text = data.text || "";
      await parser.destroy();
      return text;
    }

    // v1 function-based API
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

// ─── PDF sources ─────────────────────────────────────────────────────────────

/** Iliad premium-number PDFs (fixed URLs, one per prefix family). */
const ILIAD_PDF_URLS = [
  "https://www.iliad.it/docs/892.pdf",
  "https://www.iliad.it/docs/893.pdf",
  "https://www.iliad.it/docs/894.pdf",
  "https://www.iliad.it/docs/895.pdf",
  "https://www.iliad.it/docs/899.pdf",
];

// ─── Data loading ────────────────────────────────────────────────────────────

interface PremiumData {
  entries: PremiumEntry[];
  rawText: string;
  /** Raw text with spaces between digits collapsed for fallback search */
  rawTextCompact: string;
}

let cachedData: PremiumData | null = null;

/** Scrape WindTre's surcharge page to discover PDF links. */
async function fetchWindTrePdfLinks(): Promise<string[]> {
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

/** Download one PDF, extract text and premium entries. */
async function parsePdf(
  url: string,
  operator: string
): Promise<{ entries: PremiumEntry[]; text: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`PDF fetch failed (${res.status}): ${url}`);
      return { entries: [], text: "" };
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const text = await extractPdfText(buffer);
    const rows = extractTableRows(text);
    const entries = extractPremiumEntries(rows, operator);
    return { entries, text };
  } catch (e) {
    console.error(`Failed to parse PDF ${url}:`, e);
    return { entries: [], text: "" };
  }
}

/** Load and merge premium-number data from both WindTre and Iliad. */
async function loadPremiumData(): Promise<PremiumData> {
  if (cachedData) return cachedData;

  // Fetch WindTre PDF links + parse all PDFs in parallel
  const windTreLinks = await fetchWindTrePdfLinks();

  const allJobs = [
    ...windTreLinks.map((url) => parsePdf(url, "WindTre")),
    ...ILIAD_PDF_URLS.map((url) => parsePdf(url, "Iliad")),
  ];

  const results = await Promise.all(allJobs);

  const allEntries: PremiumEntry[] = [];
  let allText = "";
  for (const r of results) {
    allEntries.push(...r.entries);
    allText += r.text + "\n";
  }

  // Pre-compute compact version (spaces between digits collapsed) for fallback
  const rawTextCompact = allText.replace(/(\d)\s+(\d)/g, "$1$2");

  cachedData = { entries: allEntries, rawText: allText, rawTextCompact };
  return cachedData;
}

// ─── Premium number check (WindTre + Iliad) ─────────────────────────────────

export async function checkPremiumNumber(
  number: string
): Promise<PremiumCheckResult> {
  try {
    const { entries, rawTextCompact } = await loadPremiumData();

    const clean = normalizeNumber(number);
    if (clean.length < 3) return { isPremium: false };

    // 1. Match against structured prefix list (longest match wins)
    let bestMatch: PremiumEntry | null = null;
    for (const entry of entries) {
      if (
        clean.startsWith(entry.prefix) ||
        entry.prefix.startsWith(clean)
      ) {
        if (!bestMatch || entry.prefix.length > bestMatch.prefix.length) {
          bestMatch = entry;
        }
      }
    }

    if (bestMatch) {
      return {
        isPremium: true,
        alert: "rosso",
        operator: bestMatch.operator,
        matchedPrefix: bestMatch.prefix,
        service: bestMatch.service,
        context: bestMatch.context,
        debug: {
          cleanInput: clean,
          totalEntries: entries.length,
          matchStrategy: "prefix_table",
        },
      };
    }

    // 2. Fallback: direct text search in compact raw PDF content
    //    (spaces between digits have been collapsed so "894 894" matches "894894")
    if (rawTextCompact.includes(clean)) {
      return {
        isPremium: true,
        alert: "rosso",
        matchedPrefix: clean,
        context: "Trovato nei database operatori (ricerca diretta)",
        debug: {
          cleanInput: clean,
          totalEntries: entries.length,
          matchStrategy: "raw_text",
        },
      };
    }

    return {
      isPremium: false,
      debug: {
        cleanInput: clean,
        totalEntries: entries.length,
        matchStrategy: "none",
      },
    };
  } catch (e) {
    console.error("Premium number check error:", e);
    return { isPremium: false };
  }
}

/** Returns stats about the loaded premium database (for debug panel). */
export async function getPremiumDbStats(): Promise<PremiumDbStats> {
  const data = await loadPremiumData();
  return {
    totalEntries: data.entries.length,
    rawTextLength: data.rawText.length,
    sampleEntries: data.entries.slice(0, 30).map((e) => ({
      prefix: e.prefix,
      operator: e.operator,
      service: e.service,
    })),
  };
}

// ─── AGCOM ROC call-center registry ──────────────────────────────────────────

export async function checkAgcom(number: string): Promise<AgcomResult> {
  try {
    const clean = normalizeNumber(number);
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
    let tellowsNum = normalizeNumber(number);
    // Tellows URL richiede il prefisso 39 per i numeri italiani
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
