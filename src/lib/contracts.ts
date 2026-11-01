/**
 * Runtime mirror of /data-contracts.md. Every object is `.strict()`
 * (equivalent to JSON Schema `additionalProperties: false`).
 */
import { z } from "zod";

// ---------- Shared primitives ----------
// Strip ASCII control chars (except \n and \t) and trim.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
export const sanitizeText = (s: string) => s.replace(CONTROL_CHARS, "").trim();

export const safeText = (min: number, max: number) =>
  z.string().transform(sanitizeText).pipe(z.string().min(min).max(max));

export const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .regex(/^https:\/\/[^\s<>"']+$/, "Must be an https:// URL");

export const isoDate = z.iso.datetime({ offset: true });
export const tokenInt = z.number().int();
export const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);

// ---------- 1. UserAuth & Token Ledger ----------
export const RoleSchema = z.enum(["admin", "superadmin", "supporter", "user"]);
export const TierSchema = z.enum(["supporter", "starter", "growth", "agency"]);
export const CustomClaimsSchema = z
  .object({
    role: RoleSchema,
    tier: TierSchema,
    isSuperAdmin: z.boolean().optional(),
    admin: z.boolean().optional(),
    superadmin: z.boolean().optional(),
  })
  .passthrough();
export type CustomClaims = z.infer<typeof CustomClaimsSchema>;

export const UserDocSchema = z
  .object({
    uid: z.string().regex(/^[A-Za-z0-9]{1,128}$/),
    email: z.email().max(254),
    tokenBalance: tokenInt.min(0),
    activeBrandId: z.string().max(128),
    stripeCustomerId: z.union([z.literal(""), z.string().regex(/^cus_[A-Za-z0-9]+$/)]),
    updatedAt: isoDate,
  })
  .strict();
export type UserDoc = z.infer<typeof UserDocSchema>;

export const TokenTxTypeSchema = z.enum(["TOPUP", "RADAR_SEARCH", "AI_REMIX", "REFUND"]);
export type TokenTxType = z.infer<typeof TokenTxTypeSchema>;

export const TokenTransactionDocSchema = z
  .object({
    txId: z.string().min(1).max(160),
    uid: z.string().min(1).max(128),
    type: TokenTxTypeSchema,
    delta: tokenInt.refine((n) => n !== 0, "delta must be non-zero"),
    balanceAfter: tokenInt.min(0),
    referenceId: z.string().max(256),
    createdAt: isoDate,
  })
  .strict();
export type TokenTransactionDoc = z.infer<typeof TokenTransactionDocSchema>;

// ---------- 2. Normalized Ad ----------
export const PlatformSchema = z.enum(["META", "TIKTOK", "GOOGLE"]);
export type Platform = z.infer<typeof PlatformSchema>;

export const MatrixScoreBreakdownSchema = z
  .object({
    brandFitScore: tokenInt.min(0).max(100),
    hookStrengthScore: tokenInt.min(0).max(100),
    longevityScore: tokenInt.min(0).max(100),
    compositeScore: tokenInt.min(0).max(100),
    resonanceReason: z.string().max(500),
    totalViews: tokenInt.min(0).optional(),
    highlightKeywords: z.array(z.string().max(60)).max(20).default([]),
  })
  .strict();
export type MatrixScoreBreakdown = z.infer<typeof MatrixScoreBreakdownSchema>;

export const NormalizedAdSchema = z
  .object({
    adId: z.string().regex(/^(meta|tiktok|google)_[A-Za-z0-9_-]{1,200}$/),
    platform: PlatformSchema,
    advertiserName: z.string().max(300),
    advertiserId: z.string().max(200),
    mediaType: z.enum(["VIDEO", "IMAGE", "CAROUSEL", "TEXT"]),
    mediaUrls: z.array(httpsUrl).max(20),
    thumbnailUrl: z.union([z.literal(""), httpsUrl]),
    primaryCopy: z.string().max(5000),
    headline: z.string().max(500),
    ctaText: z.string().max(100),
    landingPageUrl: z.union([z.literal(""), httpsUrl]),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    firstSeenDate: isoDate,
    lastSeenDate: isoDate,
    activeDaysCount: tokenInt.min(1),
    winningScore: tokenInt.min(0).max(100),
    totalViews: tokenInt.min(0).optional(),
    highlightKeywords: z.array(z.string().max(60)).max(20).default([]),
    matrixScore: MatrixScoreBreakdownSchema.optional(),
  })
  .strict();
export type NormalizedAd = z.infer<typeof NormalizedAdSchema>;

// ---------- 3. Brand Profile ----------
export const ToneOfVoiceSchema = z.enum(["DIRECT_RESPONSE", "AUTHORITATIVE", "UGC_CASUAL", "URGENT"]);

export const BrandProfileInputSchema = z
  .object({
    brandName: safeText(1, 100),
    productServiceDescription: safeText(1, 2000),
    targetAudienceAvatar: safeText(1, 2000),
    corePainPoints: z.array(safeText(1, 300)).min(1).max(10),
    uniqueMechanismOrOffer: safeText(1, 1000),
    toneOfVoice: ToneOfVoiceSchema,
    destinationUrl: httpsUrl,
    landingPageUrls: z.array(httpsUrl).max(50).default([]),
  })
  .strict();
export const BrandIdSchema = z.string().regex(/^[A-Za-z0-9]{1,128}$/);
export const BrandProfileSchema = BrandProfileInputSchema.extend({ brandId: BrandIdSchema }).strict();
export type BrandProfile = z.infer<typeof BrandProfileSchema>;

// ---------- 4. AI Deconstruction & Remix ----------
export const PersuasionFrameworkSchema = z.enum([
  "PAS",
  "AIDA",
  "UGC_STORY",
  "US_VS_THEM",
  "SOCIAL_PROOF_STACK",
]);

export const StoryboardBeatSchema = z
  .object({
    timestamp: z.string().max(40),
    visualAction: z.string().max(1000),
    spokenAudio: z.string().max(1000),
    onScreenText: z.string().max(300),
  })
  .strict();

export const VariationSchema = z
  .object({
    angleName: z.string().max(200),
    primaryCopy: z.string().max(5000),
    headline: z.string().max(300),
    ctaButton: z.string().max(60),
    videoStoryboard: z.array(StoryboardBeatSchema).min(1).max(20),
    imageGenerationPrompt: z.string().max(3000),
  })
  .strict();

export const AdRemixBlueprintSchema = z
  .object({
    deconstruction: z
      .object({
        hookAnalysis: z.string().max(3000),
        pacingStructure: z.array(z.string().max(500)).min(1).max(30),
        persuasionFramework: PersuasionFrameworkSchema,
        whyItWorks: z.string().max(3000),
      })
      .strict(),
    variations: z.array(VariationSchema).length(3),
  })
  .strict();
export type AdRemixBlueprint = z.infer<typeof AdRemixBlueprintSchema>;

export const RemixDocSchema = AdRemixBlueprintSchema.extend({
  remixId: z.string().min(1).max(160),
  uid: z.string().min(1).max(128),
  sourceAdId: NormalizedAdSchema.shape.adId,
  brandId: BrandIdSchema,
}).strict();
export type RemixDoc = z.infer<typeof RemixDocSchema>;

// ---------- 5. API Request Payloads ----------
/** "Proven winners" are ads that have been running for at least this many days. */
export const PROVEN_WINNER_DAYS = 28;
export const EXTENDED_WINNER_DAYS = 60;
export const ELITE_SCORE_THRESHOLD = 90;

export const MediaFilterSchema = z.enum(["ALL", "VIDEO", "IMAGE"]);
export type MediaFilter = z.infer<typeof MediaFilterSchema>;

export const RadarSearchRequestSchema = z
  .object({
    platform: PlatformSchema,
    query: safeText(2, 100),
    country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
    mediaType: MediaFilterSchema,
    provenWinnersOnly: z.boolean().default(true),
    extendedLongevity: z.boolean().default(false),
    eliteWinnersOnly: z.boolean().default(false),
    brandId: z.string().trim().max(128).default(""),
  })
  .strict();
export type RadarSearchRequest = z.infer<typeof RadarSearchRequestSchema>;

export interface RadarSearchResponse {
  ads: NormalizedAd[];
  /** How many ads matched before the "proven winners" filter. */
  unfilteredCount: number;
  cached: boolean;
  queryHash: string;
  fetchedAt: string;
  /** Plain-language caveat about the results (e.g. TikTok only covers Europe), or "". */
  notice: string;
  balanceAfter: number;
}

/** `radar_cache/{queryHash}`: the normalized results of one upstream search, served for 24 hours. */
export const RadarCacheDocSchema = z
  .object({
    queryHash: z.string().regex(/^[a-f0-9]{64}$/),
    platform: PlatformSchema,
    query: z.string().max(100),
    country: z.string().regex(/^[A-Z]{2}$/),
    mediaType: MediaFilterSchema,
    ads: z.array(NormalizedAdSchema).max(100),
    notice: z.string().max(500),
    createdAt: isoDate,
    expiresAt: isoDate,
  })
  .strict();
export type RadarCacheDoc = z.infer<typeof RadarCacheDocSchema>;

export const RemixRequestSchema = z
  .object({ adId: NormalizedAdSchema.shape.adId, brandId: BrandIdSchema })
  .strict();
export type RemixRequest = z.infer<typeof RemixRequestSchema>;

export interface RemixResponse {
  remix: RemixDoc;
  /** The source ad as remixed (Google ads gain their creative and copy here). Absent on replays. */
  ad?: NormalizedAd;
  balanceAfter: number;
}

export const BrandDeleteRequestSchema = z.object({ brandId: BrandIdSchema }).strict();

export const ActiveBrandRequestSchema = z
  .object({ activeBrandId: z.union([z.literal(""), BrandIdSchema]) })
  .strict();

export const TokenPackIdSchema = z.enum(["PACK_100", "PACK_500", "PACK_2000"]);
export type TokenPackId = z.infer<typeof TokenPackIdSchema>;

export const CheckoutRequestSchema = z.object({ packId: TokenPackIdSchema }).strict();

/** Metadata the server stamps on every Checkout Session; the webhook trusts nothing else. */
export const TopupMetadataSchema = z
  .object({
    uid: UserDocSchema.shape.uid,
    packId: TokenPackIdSchema,
    tokens: z.coerce.number().pipe(tokenInt.min(1).max(1_000_000)),
  })
  .strict();

export const ErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_INPUT",
  "INSUFFICIENT_TOKENS",
  "UPSTREAM_FAILURE",
  "INTERNAL",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

// ---------- 6. Super Admin & System Config ----------
export const ServiceCostsSchema = z
  .object({
    searchStandard: tokenInt.min(0),
    searchExtendedDays: tokenInt.min(0),
    searchEliteScore: tokenInt.min(0),
    aiRemix: tokenInt.min(0),
  })
  .strict();
export type ServiceCosts = z.infer<typeof ServiceCostsSchema>;

export const SystemConfigSchema = z
  .object({
    isTokenSystemEnabled: z.boolean(),
    isAudEnabled: z.boolean(),
    isUsdEnabled: z.boolean(),
    serviceCosts: ServiceCostsSchema,
    updatedAt: isoDate,
  })
  .strict();
export type SystemConfig = z.infer<typeof SystemConfigSchema>;

// ---------- 7. Redistributive Ledger & Equity Partners ----------
export const EquityPartnerSchema = z
  .object({
    partnerId: z.string().min(1).max(64),
    name: z.string().trim().max(100).default(""),
    email: z.string().trim().toLowerCase().email().max(254),
    percentage: z.number().min(0.01).max(100),
    notes: z.string().trim().max(500).default(""),
    status: z.enum(["active", "inactive"]).default("active"),
    createdAt: isoDate,
  })
  .strict();
export type EquityPartner = z.infer<typeof EquityPartnerSchema>;

export const StripePurchaseRecordSchema = z
  .object({
    purchaseId: z.string().min(1).max(128),
    uid: z.string().min(1).max(128),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    packId: z.string().min(1).max(64),
    tokens: tokenInt.positive(),
    amountCents: z.number().int().nonnegative(),
    currency: z.string().trim().toLowerCase().min(3).max(4).default("aud"),
    createdAt: isoDate,
  })
  .strict();
export type StripePurchaseRecord = z.infer<typeof StripePurchaseRecordSchema>;

export const PartnerDistributionSchema = z
  .object({
    partnerId: z.string(),
    name: z.string(),
    email: z.string(),
    percentage: z.number(),
    ownedTokens: tokenInt,
    ownedCents: z.number().int(),
    ownedAudCents: z.number().int(),
    ownedUsdCents: z.number().int(),
    status: z.enum(["active", "inactive"]),
  })
  .strict();
export type PartnerDistribution = z.infer<typeof PartnerDistributionSchema>;

export const RedistributiveLedgerSummarySchema = z
  .object({
    totalTokens: tokenInt,
    totalGrossCents: z.number().int(),
    totalGrossAudCents: z.number().int(),
    totalGrossUsdCents: z.number().int(),
    totalPurchasesCount: z.number().int(),
    allocatedPercentage: z.number(),
    treasuryPercentage: z.number(),
    treasuryTokens: tokenInt,
    treasuryCents: z.number().int(),
    treasuryAudCents: z.number().int(),
    treasuryUsdCents: z.number().int(),
    distributions: z.array(PartnerDistributionSchema),
  })
  .strict();
export type RedistributiveLedgerSummary = z.infer<typeof RedistributiveLedgerSummarySchema>;

// ---------- 8. Admin Messaging (7-Year Plain Text Retention) ----------
export const AdminMessageSchema = z
  .object({
    messageId: z.string().min(1).max(128),
    uid: z.string().min(1).max(128),
    senderEmail: z.string().trim().toLowerCase().email().max(254),
    subject: z.string().trim().min(1).max(150),
    body: z.string().trim().min(1).max(2000), // strictly plain text only, no attachments
    status: z.enum(["unread", "read", "archived"]).default("unread"),
    createdAt: isoDate,
    retentionUntil: isoDate, // strictly 7 years from createdAt for statutory compliance
  })
  .strict();
export type AdminMessage = z.infer<typeof AdminMessageSchema>;

export const CreateAdminMessageRequestSchema = z
  .object({
    subject: z.string().trim().min(1, "Subject is required").max(150),
    body: z.string().trim().min(1, "Message text is required").max(2000),
  })
  .strict();
export type CreateAdminMessageRequest = z.infer<typeof CreateAdminMessageRequestSchema>;
