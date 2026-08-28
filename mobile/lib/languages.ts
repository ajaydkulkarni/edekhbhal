export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English", speechLocale: "en-US", rtl: false },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", speechLocale: "hi-IN", rtl: false },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी", speechLocale: "mr-IN", rtl: false },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી", speechLocale: "gu-IN", rtl: false },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা", speechLocale: "bn-IN", rtl: false },
  { code: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ", speechLocale: "pa-IN", rtl: false },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்", speechLocale: "ta-IN", rtl: false },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు", speechLocale: "te-IN", rtl: false },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ", speechLocale: "kn-IN", rtl: false },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം", speechLocale: "ml-IN", rtl: false },
  { code: "es", label: "Spanish", nativeLabel: "Español", speechLocale: "es-ES", rtl: false },
  { code: "fr", label: "French", nativeLabel: "Français", speechLocale: "fr-FR", rtl: false },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", speechLocale: "ar-SA", rtl: true }
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export function normalizeLanguage(value: string | null | undefined): LanguageCode {
  const code = (value ?? "en").trim().toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly { code: string }[]).some((item) => item.code === code)
    ? code as LanguageCode
    : "en";
}

export function languageInfo(code: string | null | undefined) {
  const normalized = normalizeLanguage(code);
  return SUPPORTED_LANGUAGES.find((item) => item.code === normalized) ?? SUPPORTED_LANGUAGES[0];
}
