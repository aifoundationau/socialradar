/**
 * Headless DOM Automation & AI Assistant Task Engine (`window.__AD_RADAR_AGENT__`).
 *
 * Designed for 100% DOM readiness and model-agnostic AI Assistant orchestration
 * across all models (including Gemini 2.5 Flash-Lite, Claude Haiku 4.5, and gpt-6-luna).
 * Zero visual UI modifications — exposes structured capabilities, slot-filling
 * question definitions, visibility/stability pre-checks, and post-action DOM
 * mutation verification.
 */

export type AgentTaskId =
  | "SEARCH_ADS"
  | "MODEL_AND_REMIX_AD"
  | "CREATE_BRAND"
  | "SWITCH_ACTIVE_BRAND"
  | "DUPLICATE_BRAND"
  | "CLONE_GLOBAL_BRAND"
  | "DELETE_BRAND"
  | "SUBMIT_CUSTOMIZE_BRIEF"
  | "BUY_TOKEN_PACK"
  | "SEND_SUPERADMIN_MESSAGE"
  | "SEARCH_FAQS"
  | "CONFIGURE_GEO_TIME";

export interface AgentTaskSlot {
  name: string;
  required: boolean;
  type: "string" | "number" | "boolean" | "enum" | "string[]";
  enumValues?: string[];
  defaultValue?: unknown;
  description: string;
  questionToAsk: string;
}

export interface AgentDomStep {
  stepNumber: number;
  action: "navigate" | "click" | "fill" | "select" | "toggle" | "verify";
  targetAgentId: string;
  route?: string;
  slotKey?: string;
  description: string;
  expectedMutation: string;
}

export interface AgentTaskDefinition {
  taskId: AgentTaskId;
  title: string;
  route: string;
  description: string;
  tokenCostNote: string;
  confirmationRequiredBeforeFinalClick: boolean;
  slots: AgentTaskSlot[];
  steps: AgentDomStep[];
}

export interface DomPreCheckResult {
  agentId: string;
  exists: boolean;
  visible: boolean;
  enabled: boolean;
  layoutStable: boolean;
  tagName: string | null;
  ariaLabel: string | null;
  rect: { x: number; y: number; width: number; height: number } | null;
  reason?: string;
}

export interface DomActionResult {
  ok: boolean;
  action: "click" | "fill" | "select";
  agentId: string;
  preCheck: DomPreCheckResult;
  mutated: boolean;
  mutationSummary: string;
  error?: string;
}

export interface TaskReadinessEvaluation {
  taskId: AgentTaskId;
  ready: boolean;
  missingSlots: string[];
  invalidSlots: { slot: string; reason: string }[];
  /** Enforces the "one question at a time" rule for the AI assistant */
  nextQuestionToAsk: string | null;
  resolvedParams: Record<string, unknown>;
}

export const AGENT_TASK_DEFINITIONS: Record<AgentTaskId, AgentTaskDefinition> = {
  SEARCH_ADS: {
    taskId: "SEARCH_ADS",
    title: "Search Winning Ads on Radar",
    route: "/radar",
    description:
      "Search the Meta, TikTok, or Google Ad Library for winning ads by keyword, country, media format, and longevity filters.",
    tokenCostNote:
      "Base search is 1 token (+1 token for Proven 28+d, +2 tokens for Extended 60+d, +3 tokens for Top 90%+ Winners).",
    confirmationRequiredBeforeFinalClick: false,
    slots: [
      {
        name: "query",
        required: true,
        type: "string",
        description: "Keywords, hooks, or competitor brand name (2–100 chars).",
        questionToAsk:
          "What keyword, product niche, or competitor brand would you like me to search for on Ad Radar?",
      },
      {
        name: "platform",
        required: false,
        type: "enum",
        enumValues: ["META", "TIKTOK", "GOOGLE"],
        defaultValue: "META",
        description: "Ad library platform to search.",
        questionToAsk:
          "Which ad library should I search: Meta, TikTok, or Google?",
      },
      {
        name: "country",
        required: false,
        type: "enum",
        enumValues: ["AU", "US", "GB", "CA", "NZ", "ALL"],
        defaultValue: "AU",
        description: "Target country ISO code.",
        questionToAsk:
          "Which country's ads would you like to filter by (AU, US, GB, CA, NZ, or ALL)?",
      },
      {
        name: "mediaType",
        required: false,
        type: "enum",
        enumValues: ["ALL", "VIDEO", "IMAGE"],
        defaultValue: "ALL",
        description: "Ad media format filter.",
        questionToAsk:
          "Should I show All formats, Video ads only, or Image ads only?",
      },
      {
        name: "provenWinnersOnly",
        required: false,
        type: "boolean",
        defaultValue: true,
        description: "Filter for ads running 28+ days (+1 token).",
        questionToAsk:
          "Would you like to filter for Proven Winners running 28+ days (+1 token)?",
      },
      {
        name: "extendedLongevity",
        required: false,
        type: "boolean",
        defaultValue: false,
        description: "Filter for ads running 60+ days (+2 tokens).",
        questionToAsk:
          "Would you like to enable Extended Longevity (60+ days live, +2 tokens)?",
      },
      {
        name: "eliteWinnersOnly",
        required: false,
        type: "boolean",
        defaultValue: false,
        description: "Filter for Top Winners with 90%+ Matrix Score (+3 tokens).",
        questionToAsk:
          "Would you like to filter strictly for Top 90%+ Matrix Score Winners (+3 tokens)?",
      },
    ],
    steps: [
      {
        stepNumber: 1,
        action: "click",
        targetAgentId: "nav-link-radar",
        route: "/radar",
        description: "Navigate to the Radar workspace.",
        expectedMutation: "URL pathname is /radar and radar-search-input is visible.",
      },
      {
        stepNumber: 2,
        action: "click",
        targetAgentId: "radar-platform-{platform}",
        slotKey: "platform",
        description: "Select the target ad library platform (META, TIKTOK, or GOOGLE).",
        expectedMutation: "Platform radio button has aria-checked='true'.",
      },
      {
        stepNumber: 3,
        action: "fill",
        targetAgentId: "radar-search-input",
        slotKey: "query",
        description: "Fill the search keyword input.",
        expectedMutation: "radar-search-input value matches query.",
      },
      {
        stepNumber: 4,
        action: "select",
        targetAgentId: "radar-country-select",
        slotKey: "country",
        description: "Select target country.",
        expectedMutation: "radar-country-select value matches country.",
      },
      {
        stepNumber: 5,
        action: "select",
        targetAgentId: "radar-format-select",
        slotKey: "mediaType",
        description: "Select media format.",
        expectedMutation: "radar-format-select value matches mediaType.",
      },
      {
        stepNumber: 6,
        action: "click",
        targetAgentId: "radar-search-submit-button",
        description: "Submit the search.",
        expectedMutation: "Ad winner cards ([data-agent-id^='ad-winner-card-']) render in the feed.",
      },
    ],
  },

  MODEL_AND_REMIX_AD: {
    taskId: "MODEL_AND_REMIX_AD",
    title: "Model & Remix a Winning Ad for Active Brand",
    route: "/radar",
    description:
      "Select a winning ad card from the Radar results and generate 3 AI-remixed ad variations and storyboards in the Remix Studio.",
    tokenCostNote: "Generating a remix costs 3 tokens (Regenerating variations costs 1 token).",
    confirmationRequiredBeforeFinalClick: false,
    slots: [
      {
        name: "adId",
        required: true,
        type: "string",
        description: "The ID of the winning ad card to model (or 'first' for the #1 ranked winner).",
        questionToAsk:
          "Which ad from the search results would you like me to model and remix (for example, the #1 ranked winner or a specific advertiser)?",
      },
    ],
    steps: [
      {
        stepNumber: 1,
        action: "click",
        targetAgentId: "ad-model-button-{adId}",
        slotKey: "adId",
        description: "Click 'Model this ad' on the target ad card.",
        expectedMutation: "remix-studio-section scrolls into view for the selected ad.",
      },
      {
        stepNumber: 2,
        action: "click",
        targetAgentId: "remix-generate-button",
        description: "Click 'Generate remix' in the Remix Studio.",
        expectedMutation: "variation-tab-0, variation-tab-1, and variation-tab-2 appear with copy and storyboards.",
      },
    ],
  },

  CREATE_BRAND: {
    taskId: "CREATE_BRAND",
    title: "Create a Personal Brand Card",
    route: "/brands",
    description:
      "Create a new brand profile with product description, target customer avatar, core pain points, unique mechanism, tone of voice, and landing page URL.",
    tokenCostNote: "Creating a personal brand card is 100% free (0 tokens).",
    confirmationRequiredBeforeFinalClick: false,
    slots: [
      {
        name: "brandName",
        required: true,
        type: "string",
        description: "Brand or company name (1–100 chars).",
        questionToAsk: "What is the name of your brand or product?",
      },
      {
        name: "productServiceDescription",
        required: true,
        type: "string",
        description: "What you sell and what it does (10–2000 chars).",
        questionToAsk:
          "In a sentence or two, what product or service does this brand sell and what does it do?",
      },
      {
        name: "targetAudienceAvatar",
        required: true,
        type: "string",
        description: "Ideal customer avatar description (10–2000 chars).",
        questionToAsk:
          "Who is your ideal target customer (who they are and what they want)?",
      },
      {
        name: "corePainPoints",
        required: true,
        type: "string",
        description: "Customer pain points (one per line, up to 10).",
        questionToAsk:
          "What are the top 1 to 3 customer pain points your product solves?",
      },
      {
        name: "uniqueMechanismOrOffer",
        required: true,
        type: "string",
        description: "What makes your solution faster, better, or different (5–1000 chars).",
        questionToAsk:
          "What is your unique mechanism or core offer that makes your brand stand out from competitors?",
      },
      {
        name: "destinationUrl",
        required: true,
        type: "string",
        description: "Primary landing page URL starting with https://.",
        questionToAsk:
          "What is the primary landing page URL (https://...) where your ads will send traffic?",
      },
      {
        name: "toneOfVoice",
        required: false,
        type: "enum",
        enumValues: ["DIRECT_RESPONSE", "AUTHORITATIVE", "UGC_CASUAL", "URGENT"],
        defaultValue: "DIRECT_RESPONSE",
        description: "Copywriting tone of voice.",
        questionToAsk:
          "Which tone of voice should we use: Direct response, Authoritative, UGC / casual, or Urgent?",
      },
    ],
    steps: [
      {
        stepNumber: 1,
        action: "click",
        targetAgentId: "nav-link-brands",
        route: "/brands",
        description: "Navigate to My Brands.",
        expectedMutation: "my-brands-heading is visible.",
      },
      {
        stepNumber: 2,
        action: "click",
        targetAgentId: "new-brand-button",
        description: "Open the New Brand slide-over panel.",
        expectedMutation: "brand-slide-over dialog is open.",
      },
      {
        stepNumber: 3,
        action: "fill",
        targetAgentId: "brand-name-input",
        slotKey: "brandName",
        description: "Enter the brand name.",
        expectedMutation: "brand-name-input value updated.",
      },
      {
        stepNumber: 4,
        action: "select",
        targetAgentId: "tone-select",
        slotKey: "toneOfVoice",
        description: "Select the tone of voice.",
        expectedMutation: "tone-select value updated.",
      },
      {
        stepNumber: 5,
        action: "fill",
        targetAgentId: "product-service-input",
        slotKey: "productServiceDescription",
        description: "Enter the product/service description.",
        expectedMutation: "product-service-input value updated.",
      },
      {
        stepNumber: 6,
        action: "fill",
        targetAgentId: "target-customer-input",
        slotKey: "targetAudienceAvatar",
        description: "Enter the target customer avatar.",
        expectedMutation: "target-customer-input value updated.",
      },
      {
        stepNumber: 7,
        action: "fill",
        targetAgentId: "pain-points-input",
        slotKey: "corePainPoints",
        description: "Enter customer pain points (newline-separated).",
        expectedMutation: "pain-points-input value updated.",
      },
      {
        stepNumber: 8,
        action: "fill",
        targetAgentId: "unique-mechanism-input",
        slotKey: "uniqueMechanismOrOffer",
        description: "Enter the unique mechanism or offer.",
        expectedMutation: "unique-mechanism-input value updated.",
      },
      {
        stepNumber: 9,
        action: "fill",
        targetAgentId: "landing-url-input-0",
        slotKey: "destinationUrl",
        description: "Enter the primary landing page URL.",
        expectedMutation: "landing-url-input-0 value updated.",
      },
      {
        stepNumber: 10,
        action: "click",
        targetAgentId: "brand-submit-btn",
        description: "Submit the brand creation form.",
        expectedMutation: "brand-slide-over closes and new brand card renders in brands-grid.",
      },
    ],
  },

  SWITCH_ACTIVE_BRAND: {
    taskId: "SWITCH_ACTIVE_BRAND",
    title: "Switch Active Research Brand",
    route: "/brands",
    description: "Switch the active brand used for Matrix Match scoring and AI Remixes.",
    tokenCostNote: "Switching active brand is free (0 tokens).",
    confirmationRequiredBeforeFinalClick: false,
    slots: [
      {
        name: "brandId",
        required: true,
        type: "string",
        description: "The brandId to make active.",
        questionToAsk: "Which of your brands would you like to set as your active brand?",
      },
    ],
    steps: [
      {
        stepNumber: 1,
        action: "select",
        targetAgentId: "header-brand-switcher-select",
        slotKey: "brandId",
        description: "Select the active brand in the header switcher (or click make-active-brand-{brandId} on /brands).",
        expectedMutation: "Active brand updates in session state.",
      },
    ],
  },

  DUPLICATE_BRAND: {
    taskId: "DUPLICATE_BRAND",
    title: "Duplicate a Brand Card into a New Iteration",
    route: "/brands",
    description: "Clone an existing personal brand card into a new campaign version.",
    tokenCostNote: "Duplicating your own personal brand card is free (0 tokens).",
    confirmationRequiredBeforeFinalClick: false,
    slots: [
      {
        name: "brandId",
        required: true,
        type: "string",
        description: "ID of the personal brand to duplicate.",
        questionToAsk: "Which of your personal brand cards would you like to duplicate?",
      },
      {
        name: "versionName",
        required: true,
        type: "string",
        description: "Name for the duplicated brand version.",
        questionToAsk: "What name would you like to give this new brand version (e.g., 'Winter Campaign v2')?",
      },
    ],
    steps: [
      {
        stepNumber: 1,
        action: "click",
        targetAgentId: "duplicate-brand-btn-{brandId}",
        slotKey: "brandId",
        description: "Open the duplicate dialog for the chosen brand.",
        expectedMutation: "duplicate-brand-dialog becomes visible.",
      },
      {
        stepNumber: 2,
        action: "fill",
        targetAgentId: "duplicate-version-name-input",
        slotKey: "versionName",
        description: "Enter the new version name.",
        expectedMutation: "duplicate-version-name-input value matches versionName.",
      },
      {
        stepNumber: 3,
        action: "click",
        targetAgentId: "confirm-duplicate-btn",
        description: "Confirm creating the duplicate brand card.",
        expectedMutation: "duplicate-brand-dialog closes and the new duplicated card appears.",
      },
    ],
  },

  CLONE_GLOBAL_BRAND: {
    taskId: "CLONE_GLOBAL_BRAND",
    title: "Search & Copy a Community Brand from Global Library",
    route: "/brands",
    description: "Browse the Global Brand Library and copy a community brand card into your personal brands.",
    tokenCostNote: "Copying a global brand costs 1 token (configurable by SuperAdmin).",
    confirmationRequiredBeforeFinalClick: false,
    slots: [
      {
        name: "globalBrandId",
        required: true,
        type: "string",
        description: "The ID of the global brand to copy.",
        questionToAsk: "Which community brand from the Global Brand Library would you like to copy into your personal brands?",
      },
    ],
    steps: [
      {
        stepNumber: 1,
        action: "click",
        targetAgentId: "tab-global-brands",
        route: "/brands",
        description: "Switch to the Global Brand Library tab.",
        expectedMutation: "global-brands-grid is visible.",
      },
      {
        stepNumber: 2,
        action: "click",
        targetAgentId: "clone-global-brand-{globalBrandId}",
        slotKey: "globalBrandId",
        description: "Click 'Make a copy for myself' on the chosen global brand card.",
        expectedMutation: "Switches back to personal tab with the newly cloned brand card.",
      },
    ],
  },

  DELETE_BRAND: {
    taskId: "DELETE_BRAND",
    title: "Delete a Personal Brand Card (2-Step Confirm Delete)",
    route: "/brands",
    description: "Delete a personal brand card after explicit user confirmation.",
    tokenCostNote: "0 tokens.",
    confirmationRequiredBeforeFinalClick: true,
    slots: [
      {
        name: "brandId",
        required: true,
        type: "string",
        description: "ID of the brand card to delete.",
        questionToAsk: "Which brand card would you like to delete?",
      },
      {
        name: "userConfirmedDelete",
        required: true,
        type: "boolean",
        description: "Explicit confirmation from the user to permanently delete the brand card.",
        questionToAsk:
          "Please confirm: are you sure you want to permanently delete this brand card? (Your previous remixes will remain saved.)",
      },
    ],
    steps: [
      {
        stepNumber: 1,
        action: "click",
        targetAgentId: "delete-brand-btn-{brandId}",
        slotKey: "brandId",
        description: "Click Delete to reveal the confirmation box.",
        expectedMutation: "confirm-delete-box-{brandId} and confirm-delete-button become visible.",
      },
      {
        stepNumber: 2,
        action: "click",
        targetAgentId: "confirm-delete-button",
        description: "Click Confirm Delete after explicit user confirmation.",
        expectedMutation: "brand-card-{brandId} is removed from the DOM.",
      },
    ],
  },

  SUBMIT_CUSTOMIZE_BRIEF: {
    taskId: "SUBMIT_CUSTOMIZE_BRIEF",
    title: "Submit a Done-With-You Customize Strategy Brief",
    route: "/customize",
    description:
      "Submit a brand strategy & ad script brief to the Super Admin and Main Admin strategy team.",
    tokenCostNote: "Submitting a Customize brief costs 45 tokens (configurable by SuperAdmin).",
    confirmationRequiredBeforeFinalClick: true,
    slots: [
      {
        name: "brandName",
        required: true,
        type: "string",
        description: "Brand name (or pre-fill from an existing brand card).",
        questionToAsk:
          "Which brand is this Customize strategy brief for (would you like me to pre-fill from your active brand card, or enter a new brand name)?",
      },
      {
        name: "productServiceDescription",
        required: true,
        type: "string",
        description: "Product or service description (10–2000 chars).",
        questionToAsk: "What product or service are we creating the custom strategy for?",
      },
      {
        name: "targetAudienceAvatar",
        required: true,
        type: "string",
        description: "Target customer avatar (10–2000 chars).",
        questionToAsk: "Who is the target customer for this campaign?",
      },
      {
        name: "corePainPoints",
        required: true,
        type: "string",
        description: "Customer pain points (one per line).",
        questionToAsk: "What are the main customer pain points we should address?",
      },
      {
        name: "uniqueMechanismOrOffer",
        required: true,
        type: "string",
        description: "Unique mechanism or promotional offer.",
        questionToAsk: "What is the unique mechanism or promotional offer for this campaign?",
      },
      {
        name: "destinationUrl",
        required: true,
        type: "string",
        description: "Primary landing page URL (https://...).",
        questionToAsk: "What is the primary landing page URL (https://...) for this campaign?",
      },
      {
        name: "extraDetailsAndNotes",
        required: true,
        type: "string",
        description:
          "Extra details, creative angles, objections, or special instructions for the strategy team (10–2000 chars).",
        questionToAsk:
          "What extra details, creative angles, competitor inspirations, or specific instructions would you like our strategy team to focus on?",
      },
    ],
    steps: [
      {
        stepNumber: 1,
        action: "click",
        targetAgentId: "nav-link-customize",
        route: "/customize",
        description: "Navigate to the Customize page.",
        expectedMutation: "customize-page-container is visible.",
      },
      {
        stepNumber: 2,
        action: "fill",
        targetAgentId: "customize-brand-name-input",
        slotKey: "brandName",
        description: "Fill brand name.",
        expectedMutation: "customize-brand-name-input value updated.",
      },
      {
        stepNumber: 3,
        action: "fill",
        targetAgentId: "customize-product-service-input",
        slotKey: "productServiceDescription",
        description: "Fill product or service description.",
        expectedMutation: "customize-product-service-input value updated.",
      },
      {
        stepNumber: 4,
        action: "fill",
        targetAgentId: "customize-target-customer-input",
        slotKey: "targetAudienceAvatar",
        description: "Fill target customer avatar.",
        expectedMutation: "customize-target-customer-input value updated.",
      },
      {
        stepNumber: 5,
        action: "fill",
        targetAgentId: "customize-pain-points-input",
        slotKey: "corePainPoints",
        description: "Fill pain points.",
        expectedMutation: "customize-pain-points-input value updated.",
      },
      {
        stepNumber: 6,
        action: "fill",
        targetAgentId: "customize-unique-mechanism-input",
        slotKey: "uniqueMechanismOrOffer",
        description: "Fill unique mechanism or offer.",
        expectedMutation: "customize-unique-mechanism-input value updated.",
      },
      {
        stepNumber: 7,
        action: "fill",
        targetAgentId: "customize-landing-url-input-0",
        slotKey: "destinationUrl",
        description: "Fill landing page URL.",
        expectedMutation: "customize-landing-url-input-0 value updated.",
      },
      {
        stepNumber: 8,
        action: "fill",
        targetAgentId: "customize-extra-details-textarea",
        slotKey: "extraDetailsAndNotes",
        description: "Fill extra details and notes for the strategy team.",
        expectedMutation: "customize-extra-details-textarea value updated.",
      },
      {
        stepNumber: 9,
        action: "click",
        targetAgentId: "customize-submit-button",
        description: "Submit the Customize request.",
        expectedMutation: "customize-submit-success-banner appears and request is listed.",
      },
    ],
  },

  BUY_TOKEN_PACK: {
    taskId: "BUY_TOKEN_PACK",
    title: "Top Up Tokens via Stripe Checkout",
    route: "/wallet",
    description:
      "Purchase a standard token pack (10, 50, or 100 tokens) or a custom token quantity in Australian Dollars (AUD).",
    tokenCostNote: "Standard base rate is 1 Token = $1.00 AUD (invoiced in AUD via Stripe).",
    confirmationRequiredBeforeFinalClick: true,
    slots: [
      {
        name: "packId",
        required: true,
        type: "enum",
        enumValues: ["PACK_10", "PACK_50", "PACK_100", "PACK_CUSTOM"],
        description: "Token pack to purchase.",
        questionToAsk:
          "How many tokens would you like to top up: 10 tokens, 50 tokens, 100 tokens (Best Value), or a custom amount?",
      },
      {
        name: "customTokens",
        required: false,
        type: "number",
        description: "Custom integer quantity of tokens when packId is PACK_CUSTOM (1–100,000).",
        questionToAsk: "How many tokens would you like in your custom pack (whole integer between 1 and 100,000)?",
      },
    ],
    steps: [
      {
        stepNumber: 1,
        action: "click",
        targetAgentId: "nav-link-wallet",
        route: "/wallet",
        description: "Navigate to Wallet.",
        expectedMutation: "wallet-balance-section is visible.",
      },
      {
        stepNumber: 2,
        action: "fill",
        targetAgentId: "custom-token-input",
        slotKey: "customTokens",
        description: "If PACK_CUSTOM, enter the custom token quantity.",
        expectedMutation: "custom-token-input value matches customTokens.",
      },
      {
        stepNumber: 3,
        action: "click",
        targetAgentId: "buy-{packId}",
        slotKey: "packId",
        description: "Click the Buy button for the selected pack.",
        expectedMutation: "Redirects to Stripe Checkout session.",
      },
    ],
  },

  SEND_SUPERADMIN_MESSAGE: {
    taskId: "SEND_SUPERADMIN_MESSAGE",
    title: "Send a Plain-Text Message or Refund Request to Super Admin",
    route: "/radar",
    description:
      "Send a plain-text inquiry, feedback, or written refund request to the Super Admin (7-year statutory archive, no external links).",
    tokenCostNote: "Sending a message to Super Admin is free (0 tokens).",
    confirmationRequiredBeforeFinalClick: false,
    slots: [
      {
        name: "subject",
        required: true,
        type: "string",
        description: "Plain-text subject line (no URLs/links, 1–100 chars).",
        questionToAsk: "What is the subject of your message to the Super Admin?",
      },
      {
        name: "body",
        required: true,
        type: "string",
        description: "Plain-text message body (no URLs/links, 1–2000 chars).",
        questionToAsk:
          "What message would you like me to send to the Super Admin? (Please note: plain text only, without URLs or links.)",
      },
    ],
    steps: [
      {
        stepNumber: 1,
        action: "click",
        targetAgentId: "account-menu-button",
        description: "Open the account menu.",
        expectedMutation: "account-menu-popover is open.",
      },
      {
        stepNumber: 2,
        action: "click",
        targetAgentId: "open-supporter-button",
        description: "Open the Supporter Panel.",
        expectedMutation: "supporter-modal is visible.",
      },
      {
        stepNumber: 3,
        action: "click",
        targetAgentId: "supporter-tab-messages",
        description: "Select the Messages tab.",
        expectedMutation: "message-tab-compose is visible.",
      },
      {
        stepNumber: 4,
        action: "click",
        targetAgentId: "message-tab-compose",
        description: "Switch to Compose Message.",
        expectedMutation: "supporter-compose-subject is visible.",
      },
      {
        stepNumber: 5,
        action: "fill",
        targetAgentId: "supporter-compose-subject",
        slotKey: "subject",
        description: "Fill the message subject.",
        expectedMutation: "supporter-compose-subject value updated.",
      },
      {
        stepNumber: 6,
        action: "fill",
        targetAgentId: "supporter-compose-body",
        slotKey: "body",
        description: "Fill the plain-text message body.",
        expectedMutation: "supporter-compose-body value updated.",
      },
      {
        stepNumber: 7,
        action: "click",
        targetAgentId: "supporter-submit-message",
        description: "Send the message.",
        expectedMutation: "Message is submitted and switches to Inbox history.",
      },
    ],
  },

  SEARCH_FAQS: {
    taskId: "SEARCH_FAQS",
    title: "Open & Search Frequently Asked Questions (FAQs)",
    route: "/radar",
    description: "Open the FAQ modal from the top header and search or filter questions by category.",
    tokenCostNote: "0 tokens.",
    confirmationRequiredBeforeFinalClick: false,
    slots: [
      {
        name: "searchQuery",
        required: false,
        type: "string",
        defaultValue: "",
        description: "Optional keyword to search inside FAQs.",
        questionToAsk: "What topic or question would you like me to look up in the FAQs?",
      },
    ],
    steps: [
      {
        stepNumber: 1,
        action: "click",
        targetAgentId: "nav-link-faqs",
        description: "Click the FAQs button in the top header (or mobile-header-faqs on mobile).",
        expectedMutation: "faq-modal dialog is visible.",
      },
      {
        stepNumber: 2,
        action: "fill",
        targetAgentId: "faq-search-input",
        slotKey: "searchQuery",
        description: "Filter FAQs by keyword.",
        expectedMutation: "Matching faq-item-* cards are displayed.",
      },
    ],
  },

  CONFIGURE_GEO_TIME: {
    taskId: "CONFIGURE_GEO_TIME",
    title: "Configure Location, Suburb, Country & Clock Format",
    route: "/radar",
    description: "Open the footer Geo & Time popup to autofind location or set suburb, state, country, and clock/date format.",
    tokenCostNote: "0 tokens.",
    confirmationRequiredBeforeFinalClick: false,
    slots: [
      {
        name: "suburb",
        required: true,
        type: "string",
        description: "Suburb or city name.",
        questionToAsk: "Which suburb or city should I set for your location?",
      },
      {
        name: "state",
        required: true,
        type: "string",
        description: "State or region code (e.g. QLD, NSW, VIC, CA, NY).",
        questionToAsk: "Which state or region is that in?",
      },
      {
        name: "country",
        required: false,
        type: "enum",
        enumValues: ["AU", "NZ", "US", "GB", "CA", "SG"],
        defaultValue: "AU",
        description: "Country code.",
        questionToAsk: "Which country should I select (AU, NZ, US, GB, CA, or SG)?",
      },
      {
        name: "timeFormat",
        required: false,
        type: "enum",
        enumValues: ["12h", "24h"],
        defaultValue: "12h",
        description: "Clock display format.",
        questionToAsk: "Do you prefer a 12-hour or 24-hour clock format?",
      },
    ],
    steps: [
      {
        stepNumber: 1,
        action: "click",
        targetAgentId: "geo-chip-location",
        description: "Click the footer location chip to open GeoTimeModal.",
        expectedMutation: "geo-time-modal is open.",
      },
      {
        stepNumber: 2,
        action: "fill",
        targetAgentId: "geo-suburb-input",
        slotKey: "suburb",
        description: "Enter suburb or city.",
        expectedMutation: "geo-suburb-input value updated.",
      },
      {
        stepNumber: 3,
        action: "fill",
        targetAgentId: "geo-state-input",
        slotKey: "state",
        description: "Enter state or region.",
        expectedMutation: "geo-state-input value updated.",
      },
      {
        stepNumber: 4,
        action: "select",
        targetAgentId: "geo-country-select",
        slotKey: "country",
        description: "Select country.",
        expectedMutation: "geo-country-select value updated.",
      },
      {
        stepNumber: 5,
        action: "select",
        targetAgentId: "geo-time-format-select",
        slotKey: "timeFormat",
        description: "Select clock format.",
        expectedMutation: "geo-time-format-select value updated.",
      },
      {
        stepNumber: 6,
        action: "click",
        targetAgentId: "geo-save-button",
        description: "Save location and time settings.",
        expectedMutation: "geo-time-modal closes and geo-chip-location text updates.",
      },
    ],
  },
};

/**
 * Deterministic, model-agnostic intent detector.
 * Maps a natural-language user request to the matching `AgentTaskId` even on low-cost models.
 */
export function detectUserIntent(utterance: string): AgentTaskId | null {
  const q = utterance.toLowerCase().trim();
  if (!q) return null;

  if (/\b(faq|faqs|frequently asked|help|how does|what is base radar)\b/.test(q)) {
    return "SEARCH_FAQS";
  }
  if (/\b(customize|done-with-you|concierge|strategy brief|strategist)\b/.test(q)) {
    return "SUBMIT_CUSTOMIZE_BRIEF";
  }
  if (/\b(buy token|top up|top-up|purchase token|add token|stripe|more tokens)\b/.test(q)) {
    return "BUY_TOKEN_PACK";
  }
  if (/\b(refund|message admin|contact admin|message super admin|support message)\b/.test(q)) {
    return "SEND_SUPERADMIN_MESSAGE";
  }
  if (/\b(delete brand|remove brand)\b/.test(q)) {
    return "DELETE_BRAND";
  }
  if (/\b(duplicate brand|clone my brand|new version of brand|branch brand)\b/.test(q)) {
    return "DUPLICATE_BRAND";
  }
  if (/\b(global brand|community brand|copy global|clone global)\b/.test(q)) {
    return "CLONE_GLOBAL_BRAND";
  }
  if (/\b(switch brand|change active brand|make active|select brand)\b/.test(q)) {
    return "SWITCH_ACTIVE_BRAND";
  }
  if (/\b(create brand|new brand|add brand|brand card|brand profile)\b/.test(q)) {
    return "CREATE_BRAND";
  }
  if (/\b(remix|model this ad|deconstruct|storyboard|variations)\b/.test(q)) {
    return "MODEL_AND_REMIX_AD";
  }
  if (/\b(suburb|weather|time format|24-hour|12-hour|timezone|location)\b/.test(q)) {
    return "CONFIGURE_GEO_TIME";
  }
  if (/\b(search|find ad|winning ad|meta ad|tiktok ad|google ad|radar)\b/.test(q)) {
    return "SEARCH_ADS";
  }
  return null;
}

/**
 * Evaluates whether all required slots for a task are present and valid.
 * If any required slot is missing, returns `nextQuestionToAsk` (strictly ONE question at a time).
 */
export function evaluateTaskReadiness(
  taskId: AgentTaskId,
  providedParams: Record<string, unknown> = {},
): TaskReadinessEvaluation {
  const def = AGENT_TASK_DEFINITIONS[taskId];
  const missingSlots: string[] = [];
  const invalidSlots: { slot: string; reason: string }[] = [];
  const resolvedParams: Record<string, unknown> = {};

  for (const slot of def.slots) {
    const raw = providedParams[slot.name];
    const hasValue =
      raw !== undefined &&
      raw !== null &&
      (typeof raw !== "string" || raw.trim().length > 0);

    if (!hasValue) {
      if (slot.defaultValue !== undefined) {
        resolvedParams[slot.name] = slot.defaultValue;
      } else if (slot.required) {
        missingSlots.push(slot.name);
      }
      continue;
    }

    if (slot.type === "enum" && slot.enumValues) {
      const normalized = String(raw).toUpperCase();
      const match = slot.enumValues.find((v) => v.toUpperCase() === normalized);
      if (!match) {
        invalidSlots.push({
          slot: slot.name,
          reason: `Expected one of: ${slot.enumValues.join(", ")}`,
        });
        continue;
      }
      resolvedParams[slot.name] = match;
    } else if (slot.type === "number") {
      const num = Math.round(Number(raw));
      if (!Number.isFinite(num) || num < 1) {
        invalidSlots.push({
          slot: slot.name,
          reason: "Must be a positive whole integer.",
        });
        continue;
      }
      resolvedParams[slot.name] = num;
    } else {
      resolvedParams[slot.name] = raw;
    }
  }

  // Special check for BUY_TOKEN_PACK with PACK_CUSTOM
  if (
    taskId === "BUY_TOKEN_PACK" &&
    resolvedParams.packId === "PACK_CUSTOM" &&
    !resolvedParams.customTokens
  ) {
    missingSlots.push("customTokens");
  }

  let nextQuestionToAsk: string | null = null;
  if (invalidSlots.length > 0) {
    const firstInvalid = def.slots.find((s) => s.name === invalidSlots[0].slot);
    nextQuestionToAsk = firstInvalid
      ? `${firstInvalid.questionToAsk} (${invalidSlots[0].reason})`
      : invalidSlots[0].reason;
  } else if (missingSlots.length > 0) {
    const firstMissing = def.slots.find((s) => s.name === missingSlots[0]);
    nextQuestionToAsk = firstMissing?.questionToAsk ?? null;
  }

  return {
    taskId,
    ready: missingSlots.length === 0 && invalidSlots.length === 0,
    missingSlots,
    invalidSlots,
    nextQuestionToAsk,
    resolvedParams,
  };
}

/**
 * Resolves an element by `data-agent-id` (with fallback to `data-testid`).
 */
export function findAgentElement(agentId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return (
    document.querySelector<HTMLElement>(`[data-agent-id="${CSS.escape(agentId)}"]`) ??
    document.querySelector<HTMLElement>(`[data-testid="${CSS.escape(agentId)}"]`)
  );
}

/**
 * Pre-checks element existence, visibility, enabled state, and bounding-box geometry.
 */
export function preCheckElement(agentId: string): DomPreCheckResult {
  const el = findAgentElement(agentId);
  if (!el) {
    return {
      agentId,
      exists: false,
      visible: false,
      enabled: false,
      layoutStable: false,
      tagName: null,
      ariaLabel: null,
      rect: null,
      reason: `Element [data-agent-id="${agentId}"] not found in DOM.`,
    };
  }

  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const visible =
    style.display !== "none" &&
    style.visibility !== "hidden" &&
     parseFloat(style.opacity || "1") > 0 &&
    rect.width > 0 &&
    rect.height > 0;

  const disabled =
    (el as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled === true ||
    el.getAttribute("aria-disabled") === "true";

  return {
    agentId,
    exists: true,
    visible,
    enabled: !disabled,
    layoutStable: visible,
    tagName: el.tagName.toLowerCase(),
    ariaLabel:
      el.getAttribute("aria-label") ||
      el.textContent?.trim().slice(0, 80) ||
      null,
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    reason: !visible
      ? "Element is hidden or has zero dimensions."
      : disabled
        ? "Element is currently disabled."
        : undefined,
  };
}

/**
 * Waits across two animation frames to verify the element's bounding box is stationary.
 */
export async function waitForLayoutStability(agentId: string): Promise<DomPreCheckResult> {
  const first = preCheckElement(agentId);
  if (!first.exists || !first.visible) return first;

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const second = preCheckElement(agentId);
        if (!second.rect || !first.rect) {
          resolve({ ...second, layoutStable: false });
          return;
        }
        const stable =
          Math.abs(second.rect.x - first.rect.x) <= 2 &&
          Math.abs(second.rect.y - first.rect.y) <= 2 &&
          Math.abs(second.rect.width - first.rect.width) <= 2 &&
          Math.abs(second.rect.height - first.rect.height) <= 2;
        resolve({
          ...second,
          layoutStable: stable,
          reason: stable ? second.reason : "Element layout is still shifting.",
        });
      });
    });
  });
}

/**
 * Safely clicks an element by `data-agent-id` after pre-checking visibility and layout stability,
 * then verifies post-action DOM state.
 */
export async function clickAgentElement(agentId: string): Promise<DomActionResult> {
  const check = await waitForLayoutStability(agentId);
  if (!check.exists || !check.visible || !check.enabled || !check.layoutStable) {
    return {
      ok: false,
      action: "click",
      agentId,
      preCheck: check,
      mutated: false,
      mutationSummary: "Pre-check failed before click.",
      error: check.reason || "Element not ready for interaction.",
    };
  }

  const el = findAgentElement(agentId)!;
  let domChanged = false;
  const observer = new MutationObserver(() => {
    domChanged = true;
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  el.scrollIntoView({ block: "nearest", behavior: "auto" });
  el.click();

  await new Promise((r) => setTimeout(r, 60));
  observer.disconnect();

  return {
    ok: true,
    action: "click",
    agentId,
    preCheck: check,
    mutated: domChanged,
    mutationSummary: domChanged
      ? `Clicked [data-agent-id="${agentId}"] and verified DOM mutation.`
      : `Clicked [data-agent-id="${agentId}"] (navigation or state handler triggered).`,
  };
}

/**
 * Safely fills a React-controlled `<input>`, `<textarea>`, or `<select>` by `data-agent-id`
 * and verifies post-action value mutation.
 */
export async function fillAgentElement(
  agentId: string,
  value: string | number,
): Promise<DomActionResult> {
  const check = await waitForLayoutStability(agentId);
  if (!check.exists || !check.visible || !check.enabled || !check.layoutStable) {
    return {
      ok: false,
      action: "fill",
      agentId,
      preCheck: check,
      mutated: false,
      mutationSummary: "Pre-check failed before fill.",
      error: check.reason || "Element not ready for input.",
    };
  }

  const el = findAgentElement(agentId) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement;
  const strVal = String(value);

  const proto =
    el instanceof HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;

  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(el, strVal);
  } else {
    el.value = strVal;
  }

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));

  const mutated = el.value === strVal;
  return {
    ok: mutated,
    action: el instanceof HTMLSelectElement ? "select" : "fill",
    agentId,
    preCheck: check,
    mutated,
    mutationSummary: mutated
      ? `Updated [data-agent-id="${agentId}"] value to "${strVal}".`
      : `Failed to verify value on [data-agent-id="${agentId}"].`,
    error: mutated ? undefined : "Post-action value verification failed.",
  };
}

/**
 * Returns a snapshot of the live DOM state so an AI assistant can inspect what is currently on screen.
 */
export function getLiveDomState() {
  if (typeof document === "undefined") {
    return { pathname: "/", visibleInteractives: [], openDialogs: [] };
  }

  const allNodes = Array.from(
    document.querySelectorAll<HTMLElement>("[data-agent-id], [data-testid]"),
  );

  const visibleInteractives = allNodes
    .map((el) => {
      const id = el.getAttribute("data-agent-id") || el.getAttribute("data-testid") || "";
      if (!id) return null;
      const check = preCheckElement(id);
      if (!check.visible) return null;
      const val =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
          ? el.value
          : undefined;
      return {
        agentId: id,
        tag: check.tagName,
        ariaLabel: check.ariaLabel,
        enabled: check.enabled,
        value: val,
      };
    })
    .filter(Boolean);

  const openDialogs = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"], [popover]:popover-open'),
  ).map(
    (d) =>
      d.getAttribute("data-agent-id") ||
      d.getAttribute("data-testid") ||
      d.getAttribute("aria-labelledby") ||
      "dialog",
  );

  return {
    pathname: window.location.pathname,
    visibleInteractives,
    openDialogs,
  };
}

