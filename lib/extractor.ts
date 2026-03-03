export interface ExtractedEntities {
  phoneNumbers: string[];
  urls: string[];
}

/**
 * Extracts phone numbers and URLs/domains from free-form text (SMS or email
 * body) using regex. Returns normalised Italian phone numbers (+39 prefix
 * assumed when no country code is present) and domains without protocol.
 */
export async function extractEntities(
  text: string
): Promise<ExtractedEntities> {
  return {
    phoneNumbers: extractPhoneNumbers(text),
    urls: extractUrls(text),
  };
}

// ─── Phone numbers ──────────────────────────────────────────────────────────

/**
 * Matches Italian and international phone numbers in various formats:
 *   +39 02 1234567, 0039-333-1234567, 333.123.4567, 800 123456, etc.
 */
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.\-]?)?\(?\d{2,4}\)?[\s.\-]?\d{3,4}[\s.\-]?\d{3,7}/g;

function extractPhoneNumbers(text: string): string[] {
  const matches = text.match(PHONE_RE) || [];
  const seen = new Set<string>();
  const results: string[] = [];

  for (const raw of matches) {
    // Strip everything except digits and leading +
    let digits = raw.replace(/[^\d+]/g, "");

    // Skip sequences that are too short (likely not phones) or too long
    const pureDigits = digits.replace(/\D/g, "");
    if (pureDigits.length < 6 || pureDigits.length > 15) continue;

    // Normalise: add +39 if no country code
    if (digits.startsWith("+")) {
      // Already has country code — keep as-is
    } else if (digits.startsWith("0039")) {
      digits = "+" + digits.slice(2); // 0039 → +39
    } else {
      digits = "+39" + digits;
    }

    if (!seen.has(digits)) {
      seen.add(digits);
      results.push(digits);
    }
  }

  return results;
}

// ─── URLs / domains ─────────────────────────────────────────────────────────

/**
 * Matches URLs (with or without protocol) and bare domains:
 *   https://example.com/path, www.example.com, example.it
 */
const URL_RE =
  /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z]{2,10}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;

/** TLDs we want to recognise for bare domains (no protocol). */
const COMMON_TLDS = new Set([
  "com", "it", "org", "net", "eu", "info", "io", "co", "biz", "me",
  "dev", "app", "online", "store", "site", "xyz", "tech", "cloud",
]);

function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE) || [];
  const seen = new Set<string>();
  const results: string[] = [];

  for (const raw of matches) {
    // Strip protocol and www, keep domain + path
    let domain = raw
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "");

    if (!domain) continue;

    // For bare domains without protocol, verify TLD is plausible
    const tld = domain.split(".").pop()?.split("/")[0]?.toLowerCase();
    if (!raw.includes("://") && tld && !COMMON_TLDS.has(tld)) continue;

    if (!seen.has(domain)) {
      seen.add(domain);
      results.push(domain);
    }
  }

  return results;
}
