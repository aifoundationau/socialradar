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
export const RoleSchema = z.enum(["admin", "superadmin", "moderator", "agency", "supporter", "user"]);
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

export const TokenTxTypeSchema = z.enum(["TOPUP", "RADAR_SEARCH", "AI_REMIX", "REFUND", "BRAND_CLONE"]);
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
    totalLikes: tokenInt.min(0).optional(),
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
    totalLikes: tokenInt.min(0).optional(),
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
    isGlobal: z.boolean().default(false),
    version: z.string().max(50).optional(),
    authorUid: z.string().optional(),
    authorEmail: z.string().optional(),
    clonedFromBrandId: z.string().optional(),
    createdAt: isoDate.optional(),
    updatedAt: isoDate.optional(),
  })
  .strict();
export const BrandIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const BrandProfileSchema = BrandProfileInputSchema.extend({ brandId: BrandIdSchema }).strict();
export type BrandProfile = z.infer<typeof BrandProfileSchema>;

export const BrandDuplicateRequestSchema = z
  .object({
    brandId: BrandIdSchema,
    versionName: safeText(1, 100).optional(),
  })
  .strict();
export type BrandDuplicateRequest = z.infer<typeof BrandDuplicateRequestSchema>;

export const BrandCloneRequestSchema = z
  .object({
    globalBrandId: BrandIdSchema,
  })
  .strict();
export type BrandCloneRequest = z.infer<typeof BrandCloneRequestSchema>;

export const GlobalBrandSearchQuerySchema = z
  .object({
    q: z.string().max(100).optional(),
    tone: ToneOfVoiceSchema.optional(),
    limit: tokenInt.min(1).max(100).default(50),
  })
  .strict();
export type GlobalBrandSearchQuery = z.infer<typeof GlobalBrandSearchQuerySchema>;

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

export const TokenPackIdSchema = z.enum(["PACK_10", "PACK_50", "PACK_100", "PACK_CUSTOM"]);
export type TokenPackId = z.infer<typeof TokenPackIdSchema>;

export const CheckoutRequestSchema = z
  .object({
    packId: TokenPackIdSchema,
    customTokens: tokenInt.min(1).max(1_000_000).optional(),
  })
  .strict()
  .refine(
    (data) => data.packId !== "PACK_CUSTOM" || (typeof data.customTokens === "number" && data.customTokens >= 1),
    { message: "customTokens is required when packId is PACK_CUSTOM" }
  );
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

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
    brandClone: tokenInt.min(0).default(5),
  })
  .strict();
export type ServiceCosts = z.infer<typeof ServiceCostsSchema>;

export const SystemConfigSchema = z
  .object({
    isTokenSystemEnabled: z.boolean(),
    isAudEnabled: z.boolean(),
    isUsdEnabled: z.boolean(),
    audCentsPerToken: tokenInt.min(1).default(100),
    usdCentsPerToken: tokenInt.min(1).optional(),
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
export const LINK_URL_PATTERN = /(?:https?:\/\/|ftp:\/\/|www\.|data:|[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?|\[.*?\]\(.*?\))/i;

export const AdminMessageSchema = z
  .object({
    messageId: z.string().min(1).max(128),
    uid: z.string().min(1).max(128),
    senderEmail: z.string().trim().toLowerCase().email().max(254),
    recipientEmail: z.string().trim().toLowerCase().email().max(254).optional(),
    recipientUid: z.string().max(128).optional(),
    direction: z.enum(["user_to_admin", "admin_to_user"]).default("user_to_admin"),
    subject: z.string().trim().min(1).max(150),
    body: z.string().trim().min(1).max(2000), // strictly plain text only, no attachments, no upload links
    status: z.enum(["unread", "read", "archived"]).default("unread"),
    createdAt: isoDate,
    retentionUntil: isoDate, // strictly 7 years from createdAt for statutory compliance
  })
  .strict();
export type AdminMessage = z.infer<typeof AdminMessageSchema>;

export const CreateAdminMessageRequestSchema = z
  .object({
    subject: z
      .string()
      .trim()
      .min(1, "Subject is required")
      .max(150)
      .refine((s) => !LINK_URL_PATTERN.test(s), {
        message: "Plain text only. Links, URLs, and file uploads are strictly prohibited.",
      }),
    body: z
      .string()
      .trim()
      .min(1, "Message text is required")
      .max(2000)
      .refine((b) => !LINK_URL_PATTERN.test(b), {
        message: "Plain text only. Links, URLs, and file uploads are strictly prohibited.",
      }),
  })
  .strict();
export type CreateAdminMessageRequest = z.infer<typeof CreateAdminMessageRequestSchema>;

export const SendAdminMessageRequestSchema = z
  .object({
    recipientEmail: z.string().trim().toLowerCase().email("Valid recipient email is required").max(254),
    subject: z
      .string()
      .trim()
      .min(1, "Subject is required")
      .max(150)
      .refine((s) => !LINK_URL_PATTERN.test(s), {
        message: "Plain text only. Links, URLs, and file uploads are strictly prohibited.",
      }),
    body: z
      .string()
      .trim()
      .min(1, "Message text is required")
      .max(2000)
      .refine((b) => !LINK_URL_PATTERN.test(b), {
        message: "Plain text only. Links, URLs, and file uploads are strictly prohibited.",
      }),
  })
  .strict();
export type SendAdminMessageRequest = z.infer<typeof SendAdminMessageRequestSchema>;

// ---------- 9. Role-Based Access Control (RBAC) Matrix ----------
export const RbacPermissionSchema = z.enum([
  "view_analytics",
  "manage_config",
  "manage_ledger",
  "flush_cache",
  "manage_messages",
  "manage_rbac",
  "manage_users",
  "search_radar",
  "ai_remix",
  "manage_brands",
]);
export type RbacPermission = z.infer<typeof RbacPermissionSchema>;

export const RBAC_PERMISSIONS_LIST: RbacPermission[] = [
  "view_analytics",
  "manage_config",
  "manage_ledger",
  "flush_cache",
  "manage_messages",
  "manage_rbac",
  "manage_users",
  "search_radar",
  "ai_remix",
  "manage_brands",
];

export const RBAC_ROLES_LIST = [
  "superadmin",
  "admin",
  "moderator",
  "agency",
  "supporter",
] as const;
export type RbacRole = (typeof RBAC_ROLES_LIST)[number];

export const RbacMatrixSchema = z.record(
  z.string(),
  z.array(RbacPermissionSchema)
);
export type RbacMatrix = Record<RbacRole, RbacPermission[]>;

export const RbacConfigDocSchema = z
  .object({
    matrix: RbacMatrixSchema,
    updatedAt: isoDate,
    updatedBy: z.string().max(254),
  })
  .strict();
export type RbacConfigDoc = z.infer<typeof RbacConfigDocSchema>;

export const UpdateRolePermissionsRequestSchema = z
  .object({
    action: z.literal("UPDATE_ROLE_PERMISSIONS"),
    role: z.enum(["admin", "moderator", "agency", "supporter"]),
    permissions: z.array(RbacPermissionSchema),
  })
  .strict();
export type UpdateRolePermissionsRequest = z.infer<typeof UpdateRolePermissionsRequestSchema>;

export const AssignUserRoleRequestSchema = z
  .object({
    action: z.literal("ASSIGN_USER_ROLE"),
    email: z.string().trim().toLowerCase().email().max(254),
    role: z.enum(["admin", "moderator", "agency", "supporter"]),
  })
  .strict();
export type AssignUserRoleRequest = z.infer<typeof AssignUserRoleRequestSchema>;

// ---------- 10. Frequently Asked Questions (FAQs) ----------
export const FaqItemSchema = z
  .object({
    faqId: z.string().min(1).max(64),
    question: z.string().trim().min(1, "Question is required").max(200),
    answer: z.string().trim().min(1, "Answer is required").max(2000),
    category: z.string().trim().max(64).default("General"),
    order: z.number().int().default(0),
    enabled: z.boolean().default(true),
    createdAt: isoDate,
    updatedAt: isoDate,
  })
  .strict();
export type FaqItem = z.infer<typeof FaqItemSchema>;

export const CreateFaqRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(200),
    answer: z.string().trim().min(1).max(2000),
    category: z.string().trim().max(64).default("General"),
    order: z.number().int().default(0),
    enabled: z.boolean().default(true),
  })
  .strict();
export type CreateFaqRequest = z.infer<typeof CreateFaqRequestSchema>;

export const UpdateFaqRequestSchema = z
  .object({
    faqId: z.string().min(1).max(64),
    patch: z
      .object({
        question: z.string().trim().min(1).max(200).optional(),
        answer: z.string().trim().min(1).max(2000).optional(),
        category: z.string().trim().max(64).optional(),
        order: z.number().int().optional(),
        enabled: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();
export type UpdateFaqRequest = z.infer<typeof UpdateFaqRequestSchema>;
