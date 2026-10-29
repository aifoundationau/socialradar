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
export const RoleSchema = z.enum(["admin", "user"]);
export const TierSchema = z.enum(["starter", "growth", "agency"]);
export const CustomClaimsSchema = z
  .object({ role: RoleSchema, tier: TierSchema })
  .strict();
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

export const NormalizedAdSchema = z
  .object({
    adId: z.string().regex(/^(meta|tiktok|google)_[A-Za-z0-9_-]{1,200}$/),
    platform: PlatformSchema,
    advertiserName: z.string().max(300),
    advertiserId: z.string().max(200),
    mediaType: z.enum(["VIDEO", "IMAGE", "CAROUSEL"]),
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
export const RadarSearchRequestSchema = z
  .object({
    platform: PlatformSchema,
    query: safeText(2, 100),
    country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
    mediaType: z.enum(["ALL", "VIDEO", "IMAGE"]),
    provenWinnersOnly: z.boolean().default(false),
  })
  .strict();

export const RemixRequestSchema = z
  .object({ adId: NormalizedAdSchema.shape.adId, brandId: BrandIdSchema })
  .strict();

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
