import * as cheerio from "cheerio";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UrlVoidResult {
  success: boolean;
  blacklistStatus?: string;
  registration?: string;
  ipAddress?: string;
  detections?: number;
  engines?: number;
}

export interface SucuriResult {
  success: boolean;
  riskLevel?: string;
  malware?: boolean;
  blacklisted?: boolean;
  details?: Record<string, unknown>;
}

export interface SafeBrowsingResult {
  success: boolean;
  safe?: boolean;
  /** "rosso" = sito non sicuro, "giallo" = alcune pagine non sicure, "grigio" = ok/nessun dato */
  alert?: "rosso" | "giallo" | "grigio";
  status?: string;
  details?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strips protocol and path, keeping only the domain for scanning services. */
function cleanDomain(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .trim();
}

// ─── A. URLVoid ──────────────────────────────────────────────────────────────

export async function checkUrlVoid(url: string): Promise<UrlVoidResult> {
  try {
    const domain = cleanDomain(url);
    const res = await fetch(`https://www.urlvoid.com/scan/${domain}/`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!res.ok) return { success: false };

    const html = await res.text();
    const $ = cheerio.load(html);

    let blacklistStatus = "N/A";
    let registration = "N/A";
    let ipAddress = "N/A";
    let detections = 0;
    let engines = 0;

    // Parse the report table
    $("table tr, table tbody tr").each((_, el) => {
      const label = $(el).find("td").first().text().trim().toLowerCase();
      const value = $(el).find("td").last().text().trim();

      if (label.includes("blacklist status") || label.includes("detection")) {
        blacklistStatus = value;
        // Try to extract detections count, e.g. "0/45" or "2/45"
        const match = value.match(/(\d+)\s*\/\s*(\d+)/);
        if (match) {
          detections = parseInt(match[1], 10);
          engines = parseInt(match[2], 10);
        }
      }
      if (
        label.includes("domain registration") ||
        label.includes("registr")
      ) {
        registration = value;
      }
      if (label.includes("ip address") || label.includes("ip addr")) {
        ipAddress = value;
      }
    });

    return {
      success: true,
      blacklistStatus,
      registration,
      ipAddress,
      detections,
      engines,
    };
  } catch (e) {
    console.error("URLVoid check error:", e);
    return { success: false };
  }
}

// ─── B. Sucuri SiteCheck ─────────────────────────────────────────────────────

export async function checkSucuri(url: string): Promise<SucuriResult> {
  try {
    const domain = cleanDomain(url);
    const res = await fetch(
      `https://sitecheck.sucuri.net/api/v3/?scan=${domain}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );

    if (!res.ok) return { success: false };

    const data = await res.json();

    // Sucuri API response structure
    const scan = data.scan || data;
    const warnings = data.warnings || {};
    const blacklists = data.blacklists || {};

    // Determine risk level
    const riskLevel =
      scan.risk_level ||
      scan.site?.risk_level ||
      (data.ratings?.risk?.result ?? "unknown");

    // Check for malware indicators
    const hasMalware =
      !!(scan.malware?.length) ||
      !!(warnings.malware?.length) ||
      scan.is_malware === true;

    // Check blacklist status
    const isBlacklisted =
      !!(blacklists.listed?.length) ||
      scan.is_blacklisted === true;

    return {
      success: true,
      riskLevel: String(riskLevel),
      malware: hasMalware,
      blacklisted: isBlacklisted,
      details: {
        scan: scan.site || scan,
        warnings: Object.keys(warnings).length > 0 ? warnings : undefined,
        blacklists:
          Object.keys(blacklists).length > 0 ? blacklists : undefined,
      },
    };
  } catch (e) {
    console.error("Sucuri check error:", e);
    return { success: false };
  }
}

// ─── C. Google Safe Browsing (Transparency Report) ───────────────────────────

export async function checkSafeBrowsing(
  url: string
): Promise<SafeBrowsingResult> {
  try {
    const domain = cleanDomain(url);

    // The Transparency Report uses an internal API endpoint
    const apiUrl = `https://transparencyreport.google.com/transparencyreport/api/v3/safebrowsing/status?site=${encodeURIComponent(domain)}`;
    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!res.ok) {
      // Fallback: try to scrape the human-readable page
      return await checkSafeBrowsingFallback(domain);
    }

    const text = await res.text();

    // Google API responses start with ")]}'\n" as an anti-XSSI prefix
    const jsonStr = text.replace(/^\)\]\}'\s*\n?/, "").trim();

    if (!jsonStr) {
      return await checkSafeBrowsingFallback(domain);
    }

    const data = JSON.parse(jsonStr);

    // The response is typically a nested array. The status code is usually
    // in position [0][1] or similar. Status meanings:
    // 0 or null → No unsafe content found
    // 1 → Some pages are unsafe
    // 2 → Site is unsafe
    let statusCode: number | null = null;
    let statusText = "Nessun dato disponibile";

    if (Array.isArray(data)) {
      // Navigate the nested array to find the status
      const inner = Array.isArray(data[0]) ? data[0] : data;
      // Typically: [["sb.ssr", domain, null, statusCode, ...]]
      for (const item of inner) {
        if (Array.isArray(item) && item.length >= 4) {
          statusCode = item[3];
          break;
        }
      }
    }

    let alert: "rosso" | "giallo" | "grigio" = "grigio";

    if (statusCode === null || statusCode === 0) {
      statusText = "Nessun contenuto non sicuro trovato";
      alert = "grigio";
    } else if (statusCode === 1) {
      statusText = "Alcune pagine di questo sito non sono sicure";
      alert = "giallo";
    } else if (statusCode === 2) {
      statusText = "Sito non sicuro";
      alert = "rosso";
    } else {
      statusText = `Stato: ${statusCode}`;
    }

    return {
      success: true,
      safe: statusCode === null || statusCode === 0,
      alert,
      status: statusText,
      details: `Google Safe Browsing status code: ${statusCode ?? "N/A"}`,
    };
  } catch (e) {
    console.error("Google Safe Browsing check error:", e);
    return { success: false };
  }
}

async function checkSafeBrowsingFallback(
  domain: string
): Promise<SafeBrowsingResult> {
  try {
    const pageUrl = `https://transparencyreport.google.com/safe-browsing/search?url=${encodeURIComponent(domain)}`;
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!res.ok) return { success: false };

    const html = await res.text();

    // Basic heuristic: look for safety indicators in the page
    const lowerHtml = html.toLowerCase();
    const isUnsafe =
      lowerHtml.includes("not safe") ||
      lowerHtml.includes("dangerous") ||
      lowerHtml.includes("pericoloso");

    return {
      success: true,
      safe: !isUnsafe,
      alert: isUnsafe ? "rosso" : "grigio",
      status: isUnsafe
        ? "Possibile sito pericoloso"
        : "Nessun problema rilevato",
      details: `Verificato tramite Google Transparency Report: ${pageUrl}`,
    };
  } catch (e) {
    console.error("Safe Browsing fallback error:", e);
    return { success: false };
  }
}
