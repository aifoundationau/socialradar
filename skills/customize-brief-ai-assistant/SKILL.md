---
name: customize-brief-ai-assistant
description: Interactive AI Agent assistant skill for "Customize your Brand Strategy with Professional Experts" (1. Complete Your Customize Brief). Conducts a guided 5-question popup interview and fills all 10 brief fields (Brand name, Tone of voice, Product or service, Target customer, Pain points, Unique mechanism or offer, Landing page URLs, Version or Campaign Tag, Geolocation for Closest Ad Agent Matching, and Extra Details & Descriptions to Think About), charged using the Super Admin configurable "Customization AI Fee" and compatible with all MCP AI models including Gemini 3.5 Flash-Lite, Claude Haiku 4.5, gpt-6-luna, and Gemini 3.8 Flash.
---

# Customize Brief AI Agent Assistant Skill (`customize-brief-ai-assistant`)

## 1. Purpose & Universal AI Model Compatibility
This skill guides the optional pop-up AI Agent assistant inside **`Customize your Brand Strategy with Professional Experts` → `1. Complete Your Customize Brief`** ([`CustomizeView.tsx`](../../src/components/customize/CustomizeView.tsx) & [`CustomizeAiAssistantModal.tsx`](../../src/components/customize/CustomizeAiAssistantModal.tsx)).

Every input and output contract uses strict JSON Schema (`additionalProperties: false` via Zod `.strict()`) and deterministic server-side fallback generation so behavior is consistent across all MCP-capable AI models, including **Gemini 3.5 Flash-Lite**, **Claude Haiku 4.5**, **gpt-6-luna**, and pinned **Gemini 3.8 Flash** (`gemini-3.8-flash`).

---

## 2. Token Billing (`Customization AI Fee`)
- **Action Type:** `CUSTOMIZE_AI_ASSISTANT`
- **System Config Key:** `system_config/global.serviceCosts.customizeAiAssistant` (default: `1` integer token).
- **Super Admin Control:** Configured under **Service Pricing → Customizable Product & Service Token Amounts → `Customization AI Fee`** in [`SuperAdminModal.tsx`](../../src/components/admin/SuperAdminModal.tsx).
- **Atomic Gate:** Executed via `withTokenGate(req, "CUSTOMIZE_AI_ASSISTANT", ...)` in [`src/app/api/customize/ai-assist/route.ts`](../../src/app/api/customize/ai-assist/route.ts) with mandatory `x-idempotency-key`, `customize_ai_drafts/{txId}` replay caching, and automatic full token refund on failure.

---

## 3. Guided 5-Question Pop-Up Interview
When the customer clicks the optional **`AI Agent Assistant`** button on `/customize`, the centered pop-up asks 5 short discovery questions (pre-seeded with any current form values or selected Brand Card):

1. **Brand, Landing Page URL(s) & Optional Campaign Tag:**
   - Brand name (`brandNameHint`)
   - One or more `https://` landing page URLs (`landingPageUrls`)
   - Optional Version / Campaign Tag (`versionHint`)
2. **Product or Service & Preferred Tone:**
   - What the business sells and how it works (`whatYouSell`)
   - Tone preference (`AUTO` or `"DIRECT_RESPONSE" | "AUTHORITATIVE" | "UGC_CASUAL" | "URGENT"`)
3. **Target Customer & Core Pain Points:**
   - Ideal buyer avatar and their main frustrations/objections (`idealCustomerAndPains`)
4. **Unique Mechanism or Offer:**
   - Differentiator, proprietary method, guarantee, or promotional offer (`uniqueOfferOrMechanism`)
5. **Your Location & Strategist Goals / Extra Notes:**
   - Suburb, State, Country, Latitude, Longitude (`location`, with `Use My Current Geolocation` GPS detection and quick location presets for Closest Ad Agent Matching)
   - Campaign goals, competitor angles, and creative notes for the assigned Ad Agent (`strategistGoalsAndNotes`)

---

## 4. 10-Field Brief Synthesis & Strict Output Schema
Calling `POST /api/customize/ai-assist` transforms the user's brief notes into a complete, ready-to-submit Customize brief validated by `CustomizeAiAssistResponseSchema`:

1. **Brand name** (`brandName`)
2. **Tone of voice** (`toneOfVoice`: `"DIRECT_RESPONSE" | "AUTHORITATIVE" | "UGC_CASUAL" | "URGENT"`)
3. **Product or service** (`productServiceDescription`)
4. **Target customer** (`targetAudienceAvatar`)
5. **Pain points** (`corePainPoints`: array of 3–6 crisp, conversion-focused buyer pain points)
6. **Unique mechanism or offer** (`uniqueMechanismOrOffer`)
7. **Landing page URLs** (`landingPageUrls` and primary `destinationUrl`, preserved from validated `https://` user inputs)
8. **Version or Campaign Tag (Optional)** (`version`)
9. **Your Location (Geolocation for Closest Ad Agent Matching)** (`customerLocation`: `{ suburb, state, country, latitude, longitude, label }`)
10. **Extra Details & Descriptions to Think About** (`extraDetailsAndNotes`: structured strategist brief including campaign objectives, hook directions, proof angles, and closest Ad Agent routing context)

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "brandName",
    "toneOfVoice",
    "productServiceDescription",
    "targetAudienceAvatar",
    "corePainPoints",
    "uniqueMechanismOrOffer",
    "extraDetailsAndNotes"
  ],
  "properties": {
    "brandName": { "type": "string", "minLength": 1, "maxLength": 100 },
    "toneOfVoice": {
      "type": "string",
      "enum": ["DIRECT_RESPONSE", "AUTHORITATIVE", "UGC_CASUAL", "URGENT"]
    },
    "productServiceDescription": { "type": "string", "minLength": 1, "maxLength": 2000 },
    "targetAudienceAvatar": { "type": "string", "minLength": 1, "maxLength": 2000 },
    "corePainPoints": {
      "type": "array",
      "minItems": 3,
      "maxItems": 6,
      "items": { "type": "string", "minLength": 3, "maxLength": 280 }
    },
    "uniqueMechanismOrOffer": { "type": "string", "minLength": 1, "maxLength": 1000 },
    "extraDetailsAndNotes": { "type": "string", "minLength": 1, "maxLength": 2000 }
  }
}
```
