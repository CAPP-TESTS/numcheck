import { GoogleGenAI, Type } from "@google/genai";

let ai: GoogleGenAI | null = null;

function getAi(): GoogleGenAI {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is required");
    ai = new GoogleGenAI({ apiKey: key });
  }
  return ai;
}

export interface ExtractedEntities {
  phoneNumbers: string[];
  urls: string[];
}

/**
 * Uses Gemini to extract phone numbers and URLs/domains from free-form text
 * (SMS or email body). Returns normalised phone numbers (Italian +39 assumed
 * when no country code is present) and domains without http(s) prefix.
 */
export async function extractEntities(
  text: string
): Promise<ExtractedEntities> {
  const ai = getAi();
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: `Extract all phone numbers and URLs from the following text.
For phone numbers, normalize them to a standard format (remove spaces, keep country code if present, otherwise assume Italian +39).
For URLs, extract just the domain name or the full URL without http/https prefix.

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
            description:
              "List of extracted phone numbers, normalized.",
          },
          urls: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              "List of extracted URLs or domains, without http:// or https://.",
          },
        },
      },
    },
  });

  const jsonStr = response.text?.trim() || "{}";
  const parsed = JSON.parse(jsonStr);
  return {
    phoneNumbers: parsed.phoneNumbers || [],
    urls: parsed.urls || [],
  };
}
