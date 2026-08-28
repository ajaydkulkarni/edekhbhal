import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { normalizeLanguage } from "./languages";

export type OccurrenceTranslation = {
  language: string;
  providerConfigured: boolean;
  translated: boolean;
  scheduleName: string;
  sourceScheduleName: string;
  tasks: Array<{
    id: string;
    name: string;
    sourceName: string;
    descriptionText: string;
    sourceDescriptionText: string;
    nameTranslated: boolean;
    descriptionTranslated: boolean;
    translated: boolean;
  }>;
};

const cache = new Map<string, OccurrenceTranslation>();

export function useOccurrenceTranslation(occurrenceId: string | null | undefined, preferredLanguage: string | null | undefined) {
  const language = normalizeLanguage(preferredLanguage);
  const [data, setData] = useState<OccurrenceTranslation | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!occurrenceId || language === "en") {
      setData(null);
      setLoading(false);
      return;
    }

    const key = `${occurrenceId}:${language}`;
    const existing = cache.get(key);
    if (existing) {
      setData(existing);
      return;
    }

    setLoading(true);
    apiFetch<OccurrenceTranslation>(`/api/mobile/occurrences/${occurrenceId}/translation?language=${encodeURIComponent(language)}`)
      .then((result) => {
        cache.set(key, result);
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [occurrenceId, language]);

  return { data, loading, language };
}
