export interface DraftCandidate {
  adId: string;
  platform: "META" | "TIKTOK" | "GOOGLE";
  advertiserName: string;
  advertiserId: string;
  mediaType: "VIDEO" | "IMAGE" | "CAROUSEL" | "TEXT";
  mediaUrls: string[];
  thumbnailUrl: string;
  primaryCopy: string;
  headline: string;
  ctaText: string;
  landingPageUrl: string;
  countryCode: string;
  firstSeenDate: string;
  lastSeenDate: string;
  activeDaysCount: number;
  totalViews?: number;
  totalLikes?: number;
  duplicates: number;
}

interface VerticalTaxonomy {
  id: string;
  label: string;
  triggers: RegExp;
  googleDomains: string[];
  googleAdvertiserQueries: string[];
  positiveTerms: RegExp[];
  negativeTerms: RegExp[];
}

export interface ResolvedSearchIntent {
  categoryId: string;
  categoryLabel: string;
  isCategoryQuery: boolean;
  isSpecificBrand: boolean;
  brandLabel: string;
  googleDomains: string[];
  googleAdvertiserQueries: string[];
  positiveTerms: RegExp[];
  negativeTerms: RegExp[];
  wordBoundaryGuard: RegExp | null;
}

const AUTOMOTIVE_BRAND_DOMAINS: Record<string, string> = {
  toyota: "toyota.com.au",
  mazda: "mazda.com.au",
  hyundai: "hyundai.com",
  kia: "kia.com",
  ford: "ford.com.au",
  mitsubishi: "mitsubishi-motors.com.au",
  subaru: "subaru.com.au",
  nissan: "nissan.com.au",
  bmw: "bmw.com",
  mercedes: "mercedes-benz.com.au",
  audi: "audi.com.au",
  tesla: "tesla.com",
  byd: "bydautomotive.com.au",
  isuzu: "isuzuute.com.au",
  carsales: "carsales.com.au",
  carify: "carify.com",
};

const TAXONOMY: VerticalTaxonomy[] = [
  {
    id: "automotive",
    label: "Automotive & Vehicles",
    triggers: /\b(?:cars?|auto(?:motive|mobiles?)?|vehicles?|suvs?|utes?|trucks?|sedans?|ev|electric\s+cars?|used\s+cars?|new\s+cars?|car\s+sales|car\s+dealers?|car\s+loans?|car\s+hire|car\s+rentals?|toyota|mazda|hyundai|kia|ford|mitsubishi|subaru|nissan|volkswagen|bmw|mercedes|audi|tesla|byd|isuzu|honda|lexus|hilux|rav4|ranger|landcruiser|prado|corolla|camry|outlander|cx-5|sportage|tucson)\b/i,
    googleDomains: [
      "carsales.com.au",
      "drive.com.au",
      "toyota.com.au",
      "mazda.com.au",
      "hyundai.com",
      "kia.com",
      "ford.com.au",
    ],
    googleAdvertiserQueries: ["Carsales", "Toyota", "Mazda", "Hyundai", "Kia"],
    positiveTerms: [
      /\b(?:car|cars|carsales|carify|carmax|carvana|auto|automotive|vehicle|suv|ute|sedan|hatchback|truck|motor|drive|driving|dealer|dealership|lease|leasing|finance|toyota|mazda|hyundai|kia|ford|bmw|audi|mercedes|tesla|subaru|nissan|volkswagen|mitsubishi|isuzu|byd|hilux|rav4|ranger|landcruiser|prado|corolla|camry)\b/i,
    ],
    negativeTerms: [
      /\b(?:skincare|skin\s*care|cara\b|cerave|carpe\b|serum|moisturiz\w*|cleanser|lotion|cosmetic\w*|beauty|makeup|lipstick|shampoo|conditioner|hair\s*care|retinol|acne|wrinkle|collagen|carpet\w*|cardigan\w*|cartoon\w*|cardio)\b/i,
    ],
  },
  {
    id: "equestrian_pets",
    label: "Pets, Dogs & Equestrian",
    triggers: /\b(?:horses?|equestrian|saddle|pony|pet\s+food|dog\s+bed|dog\s+harness|dogs?|cats?|puppies|pet\s+supplies|kibble|horseland|petbarn|petcircle|lyka)\b/i,
    googleDomains: ["petcircle.com.au", "petbarn.com.au", "horseland.com.au", "lyka.com.au", "chewy.com"],
    googleAdvertiserQueries: ["Pet Circle", "Petbarn", "Horseland", "Lyka"],
    positiveTerms: [
      /\b(?:horse|horses|equine|equestrian|saddle|bridle|horseland|pet|pets|dog|dogs|puppy|cat|feline|canine|kibble|harness|leash|collar|vet|veterinary|petcircle|petbarn|lyka|chewy)\b/i,
    ],
    negativeTerms: [/\b(?:casino|betting|sportsbet|tabcorp|poker|slots|crypto|forex)\b/i],
  },
  {
    id: "skincare_beauty",
    label: "Skincare & Beauty",
    triggers: /\b(?:skincare|skin\s+care|sunscreen|spf|led\s+face\s+mask|face\s+mask|serum|retinol|moisturizer|cleanser|hair\s+oil|heatless\s+curler|collagen(?:\s+peptides)?|cerave|laroche|mecca|sephora|adore\s+beauty)\b/i,
    googleDomains: ["adorebeauty.com.au", "mecca.com", "laroche-posay.com.au", "cerave.com.au", "theordinary.com"],
    googleAdvertiserQueries: ["Adore Beauty", "La Roche-Posay", "CeraVe", "NIVEA", "Sephora"],
    positiveTerms: [
      /\b(?:skin|skincare|serum|moisturiz\w*|cleanser|spf|sunscreen|retinol|hyaluronic|niacinamide|collagen|peptide|dermatolog\w*|glow|acne|pore|wrinkle|led\s+mask|face\s+mask|beauty|hair\s+oil|curler)\b/i,
    ],
    negativeTerms: [/\b(?:carsales|forklift|excavator|mortgage|concrete)\b/i],
  },
  {
    id: "fitness_nutrition",
    label: "Fitness, Supplements & Recovery",
    triggers: /\b(?:protein(?:\s+powder)?|whey|creatine|magnesium(?:\s+spray)?|massage\s+gun|yoga\s+mat|mushroom\s+coffee|electrolytes?|pre\s+workout|myprotein|therabody|true\s+protein)\b/i,
    googleDomains: ["myprotein.com.au", "bulknutrients.com.au", "therabody.com", "lululemon.com.au", "trueprotein.com.au"],
    googleAdvertiserQueries: ["Bulk Nutrients", "Myprotein", "True Protein", "Therabody", "Optimum Nutrition"],
    positiveTerms: [
      /\b(?:protein|whey|isolate|creatine|supplement\w*|recovery|muscle|workout|fitness|gym|magnesium|massage\s+gun|percussive|theragun|yoga|mushroom\s+coffee|adaptogen|amino)\b/i,
    ],
    negativeTerms: [],
  },
  {
    id: "footwear_apparel",
    label: "Footwear & Activewear",
    triggers: /\b(?:running\s+shoes?|shoes?|sneakers?|trainers?|activewear|leggings?|gym\s+wear|nike|asics|hoka|new\s+balance|lululemon|gymshark|adidas)\b/i,
    googleDomains: ["nike.com", "asics.com", "hoka.com", "newbalance.com.au", "lululemon.com.au", "gymshark.com"],
    googleAdvertiserQueries: ["Nike", "ASICS", "HOKA", "New Balance", "Lululemon"],
    positiveTerms: [
      /\b(?:shoe|shoes|running|runner|sneaker\w*|trainer\w*|cushion\w*|marathon|activewear|legging\w*|apparel|nike|asics|hoka|new\s+balance|lululemon|gymshark|adidas|brooks)\b/i,
    ],
    negativeTerms: [],
  },
  {
    id: "oral_care",
    label: "Oral Care & Teeth Whitening",
    triggers: /\b(?:teeth\s+whitening|whitening\s+strips?|toothpaste|electric\s+toothbrush|oral\s+care|hismile|colgate|oral-b)\b/i,
    googleDomains: ["hismileteeth.com", "colgate.com.au", "oralb.com.au"],
    googleAdvertiserQueries: ["Hismile", "Colgate", "Oral-B"],
    positiveTerms: [/\b(?:teeth|tooth|whitening|smile|enamel|dental|hismile|colgate|oral-b|peroxide|PAP\+)\b/i],
    negativeTerms: [],
  },
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectSpecificAutomotiveBrand(lower: string): string | null {
  for (const b of Object.keys(AUTOMOTIVE_BRAND_DOMAINS)) {
    if (new RegExp(`\\b${escapeRegex(b)}\\b`, "i").test(lower)) {
      return b;
    }
  }
  return null;
}

/**
 * Stage 1: Resolves raw search query into semantic category intent, authoritative Google domains,
 * and word-boundary collision guards. Never creates fake ads or stock images.
 */
export function resolveSearchIntent(rawQuery: string): ResolvedSearchIntent {
  const clean = rawQuery.replace(/"/g, "").trim();
  const lower = clean.toLowerCase();

  const isCareQuery = /\b(?:skin\s*care|hair\s*care|personal\s*care|health\s*care|lawn\s*care|day\s*care|child\s*care)\b/i.test(lower);

  for (const vertical of TAXONOMY) {
    if (vertical.id === "automotive" && isCareQuery) continue;
    if (vertical.triggers.test(lower)) {
      const autoBrandKey = vertical.id === "automotive" ? detectSpecificAutomotiveBrand(lower) : null;
      const isGenericCategoryNoun = /^(?:cars?|auto(?:motive|mobiles?)?|vehicles?|suvs?|utes?|trucks?|sedans?|ev|electric\s+cars?|used\s+cars?|new\s+cars?|skincare|skin\s+care|sunscreen|running\s+shoes?|shoes?|activewear|pet\s+food|dog\s+bed|dog\s+harness|horses?|protein(?:\s+powder)?|teeth\s+whitening)$/i.test(lower);

      const specificDomain = autoBrandKey ? AUTOMOTIVE_BRAND_DOMAINS[autoBrandKey] : null;
      const orderedDomains = specificDomain
        ? [specificDomain, ...vertical.googleDomains.filter((d) => d !== specificDomain)]
        : vertical.googleDomains;

      return {
        categoryId: vertical.id,
        categoryLabel: vertical.label,
        isCategoryQuery: isGenericCategoryNoun,
        isSpecificBrand: !isGenericCategoryNoun,
        brandLabel: clean,
        googleDomains: orderedDomains,
        googleAdvertiserQueries: !isGenericCategoryNoun ? [clean, ...vertical.googleAdvertiserQueries] : vertical.googleAdvertiserQueries,
        positiveTerms: vertical.positiveTerms,
        negativeTerms: vertical.negativeTerms,
        wordBoundaryGuard: lower.length <= 4 ? new RegExp(`\\b${escapeRegex(lower)}(?:s|es)?\\b`, "i") : null,
      };
    }
  }

  const isShort = lower.length <= 4 && /^[a-z0-9]+$/i.test(lower);
  const wordBoundaryGuard = isShort ? new RegExp(`\\b${escapeRegex(lower)}(?:s|es)?\\b`, "i") : null;

  return {
    categoryId: "general",
    categoryLabel: clean,
    isCategoryQuery: false,
    isSpecificBrand: true,
    brandLabel: clean,
    googleDomains: [],
    googleAdvertiserQueries: [clean],
    positiveTerms: [new RegExp(`\\b${escapeRegex(lower)}`, "i")],
    negativeTerms: [],
    wordBoundaryGuard,
  };
}

/**
 * Stage 2: Evaluates whether a candidate Google advertiser name or domain is genuinely relevant
 * to the user's query (preventing prefix collisions like "car" -> "Cara HO" or "Skin Care").
 */
export function isRelevantGoogleAdvertiser(
  nameOrDomain: string,
  intent: ResolvedSearchIntent,
): boolean {
  const text = nameOrDomain.trim();
  if (!text) return false;

  if (intent.negativeTerms.some((neg) => neg.test(text))) {
    const hasPositive = intent.positiveTerms.some((pos) => pos.test(text));
    if (!hasPositive) return false;
  }

  if (intent.isCategoryQuery) {
    if (intent.positiveTerms.some((pos) => pos.test(text))) return true;
    if (intent.wordBoundaryGuard && intent.wordBoundaryGuard.test(text)) return true;
    return false;
  }

  if (intent.wordBoundaryGuard) {
    return intent.wordBoundaryGuard.test(text);
  }

  return true;
}

/**
 * Stage 3: Post-fetch semantic filter across real Google, TikTok, and Meta drafts.
 * Drops off-topic collision ads (such as skincare ads during a "car" search).
 */
export function filterRelevantDrafts<T extends DraftCandidate>(
  drafts: T[],
  intent: ResolvedSearchIntent,
): T[] {
  return drafts.filter((d) => {
    const corpus = `${d.advertiserName} ${d.headline} ${d.primaryCopy} ${d.landingPageUrl}`.trim();

    if (intent.negativeTerms.some((neg) => neg.test(corpus))) {
      const hasPositive = intent.positiveTerms.some((pos) => pos.test(corpus));
      if (!hasPositive) return false;
    }

    if (intent.wordBoundaryGuard && intent.categoryId === "automotive") {
      const hasAutoSignal =
        intent.positiveTerms.some((pos) => pos.test(corpus)) ||
        intent.wordBoundaryGuard.test(corpus);
      if (!hasAutoSignal) return false;
    }

    return true;
  });
}
