import { prisma } from "./prisma";
import { sha256 } from "./security";

export const SUPPORTED_LANGUAGE_CODES = [
  "en", "hi", "mr", "gu", "bn", "pa", "ta", "te", "kn", "ml", "es", "fr", "ar"
] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];

export function normalizeSupportedLanguage(value: string | null | undefined): SupportedLanguageCode {
  const normalized = (value ?? "en").trim().toLowerCase();
  return (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(normalized)
    ? normalized as SupportedLanguageCode
    : "en";
}

export function translationProviderConfigured() {
  return Boolean(
    process.env.GOOGLE_TRANSLATE_API_KEY?.trim() ||
    process.env.TRANSLATION_API_URL?.trim()
  );
}

export function htmlToPlainText(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type ProviderResult = { text: string; provider: string };

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'");
}

async function translateWithGoogle(text: string, target: SupportedLanguageCode): Promise<ProviderResult | null> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  if (!key) return null;

  const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ q: text, source: "en", target, format: "text" })
  });
  if (!response.ok) throw new Error(`Google translation failed (${response.status}).`);
  const payload = await response.json() as {
    data?: { translations?: Array<{ translatedText?: string }> };
  };
  const translated = payload.data?.translations?.[0]?.translatedText;
  if (!translated) throw new Error("Google translation returned no translated text.");
  return { text: decodeEntities(translated), provider: "GOOGLE" };
}

async function translateWithConfiguredApi(text: string, target: SupportedLanguageCode): Promise<ProviderResult | null> {
  const configured = process.env.TRANSLATION_API_URL?.trim();
  if (!configured) return null;
  const url = configured.endsWith("/translate") ? configured : `${configured.replace(/\/$/, "")}/translate`;
  const apiKey = process.env.TRANSLATION_API_KEY?.trim();
  const body: Record<string, unknown> = {
    q: text,
    source: "en",
    target,
    format: "text"
  };
  if (apiKey) body.api_key = apiKey;

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Translation service failed (${response.status}).`);
  const payload = await response.json() as { translatedText?: string; translation?: string };
  const translated = payload.translatedText ?? payload.translation;
  if (!translated) throw new Error("Translation service returned no translated text.");
  return { text: translated, provider: "CONFIGURED_API" };
}

async function providerTranslate(text: string, target: SupportedLanguageCode) {
  const google = await translateWithGoogle(text, target);
  if (google) return google;
  return translateWithConfiguredApi(text, target);
}

export async function translateCached(input: {
  organizationId: string;
  sourceType: string;
  sourceId: string;
  fieldName: string;
  language: string | null | undefined;
  text: string;
}) {
  const language = normalizeSupportedLanguage(input.language);
  const source = input.text.trim();
  if (!source || language === "en") {
    return { text: source, translated: false, provider: "SOURCE" as const };
  }

  const sourceHash = sha256(source);
  const existing = await prisma.contentTranslation.findFirst({
    where: {
      organizationId: input.organizationId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      fieldName: input.fieldName,
      language
    }
  });

  if (existing?.sourceHash === sourceHash) {
    return {
      text: existing.translatedText,
      translated: true,
      provider: existing.provider ?? "CACHE"
    };
  }

  try {
    const result = await providerTranslate(source, language);
    if (!result) return { text: source, translated: false, provider: "UNCONFIGURED" as const };

    const translatedText = result.text.trim() || source;
    if (existing) {
      await prisma.contentTranslation.update({
        where: { id: existing.id },
        data: { sourceHash, translatedText, provider: result.provider }
      });
    } else {
      await prisma.contentTranslation.create({
        data: {
          organizationId: input.organizationId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          fieldName: input.fieldName,
          language,
          sourceHash,
          translatedText,
          provider: result.provider
        }
      });
    }
    return { text: translatedText, translated: true, provider: result.provider };
  } catch (error) {
    console.error("Translation failed", {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      fieldName: input.fieldName,
      language,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { text: source, translated: false, provider: "ERROR" as const };
  }
}
