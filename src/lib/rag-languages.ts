export interface SupportedRagLanguage {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  isAsean?: boolean;
}

/**
 * Complete language catalog featuring English (Default), all official and major regional
 * ASEAN languages (Indonesia, Malaysia, Brunei, Singapore, Philippines, Vietnam, Thailand,
 * Myanmar, Cambodia, Laos, Timor-Leste), and major global languages.
 */
export const SUPPORTED_RAG_LANGUAGES: SupportedRagLanguage[] = [
  // Default & ASEAN Working Language
  { code: "en", name: "English", nativeName: "English", flag: "🇦🇺", isAsean: true },

  // Core ASEAN Official & National Languages
  { code: "id", name: "Indonesian (ASEAN)", nativeName: "Bahasa Indonesia", flag: "🇮🇩", isAsean: true },
  { code: "ms", name: "Malay — MY / BN / SG (ASEAN)", nativeName: "Bahasa Melayu", flag: "🇲🇾", isAsean: true },
  { code: "vi", name: "Vietnamese (ASEAN)", nativeName: "Tiếng Việt", flag: "🇻🇳", isAsean: true },
  { code: "th", name: "Thai (ASEAN)", nativeName: "ภาษาไทย", flag: "🇹🇭", isAsean: true },
  { code: "tl", name: "Filipino / Tagalog (ASEAN)", nativeName: "Filipino / Tagalog", flag: "🇵🇭", isAsean: true },
  { code: "my", name: "Burmese — Myanmar (ASEAN)", nativeName: "မြန်မာဘာသာ", flag: "🇲🇲", isAsean: true },
  { code: "km", name: "Khmer — Cambodia (ASEAN)", nativeName: "ភាសាខ្មែរ", flag: "🇰🇭", isAsean: true },
  { code: "lo", name: "Lao — Laos (ASEAN)", nativeName: "ພາສາລາວ", flag: "🇱🇦", isAsean: true },
  { code: "ta", name: "Tamil — SG / MY (ASEAN)", nativeName: "தமிழ்", flag: "🇸🇬", isAsean: true },
  { code: "zh-CN", name: "Mandarin Chinese — SG / MY (ASEAN)", nativeName: "简体中文", flag: "🇸🇬", isAsean: true },
  { code: "tet", name: "Tetum — Timor-Leste (ASEAN)", nativeName: "Tetun", flag: "🇹🇱", isAsean: true },

  // Major ASEAN Regional Languages
  { code: "ceb", name: "Cebuano / Bisaya — PH (ASEAN)", nativeName: "Cebuano", flag: "🇵🇭", isAsean: true },
  { code: "ilo", name: "Ilocano — PH (ASEAN)", nativeName: "Ilokano", flag: "🇵🇭", isAsean: true },
  { code: "jw", name: "Javanese — ID (ASEAN)", nativeName: "Basa Jawa", flag: "🇮🇩", isAsean: true },
  { code: "su", name: "Sundanese — ID (ASEAN)", nativeName: "Basa Sunda", flag: "🇮🇩", isAsean: true },

  // Additional Global & Asia-Pacific Languages
  { code: "zh-TW", name: "Chinese (Traditional)", nativeName: "繁體中文", flag: "🇹🇼" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳" },
  { code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
  { code: "pt", name: "Portuguese (Timor-Leste / Global)", nativeName: "Português", flag: "🇵🇹", isAsean: true },
  { code: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹" },
  { code: "ru", name: "Russian", nativeName: "Русский", flag: "🇷🇺" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", flag: "🇹🇷" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", flag: "🇳🇱" },
  { code: "pl", name: "Polish", nativeName: "Polski", flag: "🇵🇱" },
  { code: "el", name: "Greek", nativeName: "Ελληνικά", flag: "🇬🇷" },
];

export function getRagLanguageMeta(code: string): SupportedRagLanguage {
  const found = SUPPORTED_RAG_LANGUAGES.find(
    (l) => l.code.toLowerCase() === code.toLowerCase()
  );
  return (
    found ?? {
      code,
      name: code.toUpperCase(),
      nativeName: code.toUpperCase(),
      flag: "🌐",
    }
  );
}
