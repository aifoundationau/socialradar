export interface PolicyDoc {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  lastUpdated: string;
  sections: {
    heading: string;
    paragraphs: string[];
    bullets?: string[];
  }[];
}

export const POLICIES: Record<string, PolicyDoc> = {
  founder: {
    id: "founder",
    title: "Founder Welcome",
    subtitle: "From Founder David Robertson — The Story Behind AdRadarHQ",
    badge: "Leadership & Vision",
    lastUpdated: "November 2026",
    sections: [
      {
        heading: "Welcome to AdRadarHQ & AI Foundation",
        paragraphs: [
          "G'day and welcome! I am David Robertson, founder of AI Foundation and AdRadarHQ. When we set out to build this platform, our primary motivation was to level the playing field for ambitious entrepreneurs, agency operators, and businesses across Australia, New Zealand, and globally.",
          "For too long, deep ad library intelligence and high-converting marketing frameworks were walled off inside ultra-expensive enterprise tooling or guarded by elite media-buying agencies. AdRadarHQ changes that equation entirely.",
        ],
      },
      {
        heading: "Democratic Access & The Token Economy",
        paragraphs: [
          "We eliminated predatory monthly lock-in subscriptions. Instead, we architected a transparent, redistributive token model. You purchase tokens only when you need them, they never expire, and your resources fuel genuine intelligence searches and AI-driven creative deconstructions.",
          "As an Australian business founded in Brisbane/Sydney, we operate with relentless transparency, strict adherence to Australian Privacy Principles, and ISO-standard operational security.",
        ],
        bullets: [
          "No forced recurring retainers or hidden cancellation penalties.",
          "Tokens are priced and invoiced in Australian Dollars (default rate 1 Token = AUD $1) with whole numbers and local settlement.",
          "Australians and New Zealanders receive transparent, dedicated AUD pricing.",
          "Redistributive equity ledger ensuring partner accountability and statutory compliance.",
        ],
      },
      {
        heading: "Pairing Human Intuition with Ethical AI",
        paragraphs: [
          "Technology should amplify human creativity, not replace it. Our AI Remix Studio deconstructs proven multi-platform winners (Meta, TikTok, Google) and synthesizes bespoke, brand-aligned hook variants, storyboards, and scripts designed specifically for your brand voice.",
          "Thank you for being part of this journey as a Supporter. If you ever have feedback, questions, or ideas, message me directly through the platform.",
        ],
      },
    ],
  },

  terms: {
    id: "terms",
    title: "Terms of Service",
    subtitle: "Commercial Data Contract & Platform Governance",
    badge: "Binding Agreement",
    lastUpdated: "November 2026",
    sections: [
      {
        heading: "1. Acceptance of Terms & Australian Operations",
        paragraphs: [
          "These Terms of Service constitute a legally binding agreement between you (whether personally or on behalf of an entity) and AI Foundation ('Company', 'we', 'us', or 'our'), an Australian entity, concerning your access to and use of AdRadarHQ.",
          "By accessing or using AdRadarHQ, you agree that you have read, understood, and agreed to be bound by all of these Terms. If you do not agree, you are expressly prohibited from using the platform.",
        ],
      },
      {
        heading: "2. Token Economy, Australian Dollar Invoicing & Currency Conversion",
        paragraphs: [
          "AdRadarHQ operates on a strictly defined digital token ledger. You exchange money for a token, tokens mean more flexible payment options, as a payment may be distributed to multiple service providers across our infrastructure.",
          "Because AI Foundation is an Australian registered business headquartered in Australia, the default currency of the platform is Australian Dollars (AUD), and all invoices and checkout transactions are issued and settled in Australian Dollars (AUD).",
          "The default price for one token is AUD $1. From the SuperAdmin Control Panel, both the base token price and the token amount for all services and products that are sold (including Base Search, Proven Winners (28+d) filters, Extended Longevity filters, Elite Winner filters, AI Creative Remixes, and Global Brand Copies) are fully customizable.",
          "We never ever use decimals for token balances and AUD invoices; all platform token fees and invoices strictly use whole numbers. For international visitors viewing foreign exchange estimates, the currency conversion can show up to 2 decimal places.",
          "Geolocation sets the user's default region. Australians and New Zealanders accessing the platform from Australia or New Zealand view pricing strictly in AUD. If someone is outside of Australia or New Zealand, we use our currency converter for AUD to USD currency conversion to display the USD conversion (up to 2 decimal places) alongside the AUD price, while all formal invoices remain in Australian Dollars (AUD).",
          "Strict No Refunds Policy: All token purchases and subscription fees are final and strictly non-refundable upon payment confirmation. Because tokens are delivered immediately upon checkout and never expire, change-of-mind refunds and cash redemptions for unused balances are not provided. If a search or remix fails on our side due to upstream technical errors, tokens are refunded automatically back to your ledger. All formal communications sent to the Super Admin via the platform's secure messaging system are preserved under statutory 7-year audit retention and evaluated in accordance with non-excludable guarantees under the Australian Consumer Law (ACL).",
        ],
        bullets: [
          "Full disclaimer: all invoices and Stripe Checkout transactions are strictly billed and settled in Australian Dollars (AUD).",
          "Tokens represent flexible access credits: you exchange money for a token, tokens mean more flexible payment options, as a payment may be distributed to multiple service providers.",
          "Strict No Refunds: all purchases of digital tokens and subscriptions are final and non-refundable.",
          "Automatic failure refunds: upstream system or network failures automatically refund tokens back to your ledger.",
          "Tokens never expire and remain permanently credited to your account ledger.",
          "Zero-decimal standard: our business exclusively uses whole numbers and rounds up all calculations to make them whole numbers.",
        ],
      },
      {
        heading: "3. Permitted Use & Ad Intelligence Data",
        paragraphs: [
          "AdRadarHQ indexes public transparency repositories provided by Meta, TikTok, and Google. Users agree not to scrape, reverse-engineer, or attempt to bypass cryptographic token authentication gates.",
          "You retain full ownership of all customized Brand Profiles and AI-remixed creative assets generated for your brand.",
        ],
      },
      {
        heading: "4. Plain Text Communication & Security Rules",
        paragraphs: [
          "All in-app user communications and messages with the Super Admin are strictly restricted to plain text. External file uploads, executable binaries, and upload URLs are prohibited to prevent malicious injection.",
          "In compliance with statutory requirements, administrative communications are securely backed up for a statutory period of 7 years.",
        ],
      },
      {
        heading: "5. Promotional Timed Free Access & Eligible Countries (Monthly Subscribers)",
        paragraphs: [
          "From time to time, AdRadarHQ may activate promotional Timed Free Access campaigns (such as Free 15 Minutes, Free 30 Minutes, or Free 1 Hour windows) exclusively for active Monthly Subscribers based on the user's live geolocation.",
          "The list of countries that receive free access changes from time to time at the sole discretion of AdRadarHQ, so it is best to message AdRadarHQ directly via the platform's messaging system for a list of currently eligible countries.",
        ],
        bullets: [
          "Timed Free Access campaigns apply strictly to active Monthly Subscribers located within the campaign's selected countries as verified by user geolocation.",
          "The list of countries receiving free access changes from time to time — message AdRadarHQ for a list of countries.",
        ],
      },
      {
        heading: "6. Strict No Refunds Policy & Australian Consumer Law (ACL)",
        paragraphs: [
          "Strict No Refunds Policy: All purchases of digital tokens, token packs, custom token top-ups, and subscription tiers (including the monthly 1,000 token subscription) are final and strictly non-refundable once processed through Stripe.",
          "Immediate Digital Delivery & Perpetual Validity: Digital tokens are intangible digital units of utility delivered immediately upon successful transaction and credited directly to your cryptographic account ledger. Because digital tokens never expire, are immediately accessible, and can be utilized at any time across the platform's features, no refunds, cancellations, chargebacks, or cash redemptions are provided for change of mind, unused balances, or account closure.",
          "Automatic System Failure Token Re-credits: If an upstream technical error, third-party network timeout, or platform fault prevents an ad search, creative remix, or custom request from executing, the exact token cost deducted is automatically refunded back to your ledger balance in real time.",
          "Australian Consumer Law Guarantees: AI Foundation complies with the Competition and Consumer Act 2010 (Cth) and the Australian Consumer Law (ACL). Nothing in these Terms of Service purports to exclude, restrict, or modify any statutory consumer guarantees, rights, or remedies that cannot be lawfully excluded under the Australian Consumer Law.",
        ],
        bullets: [
          "Strict No Refunds: All digital token and subscription transactions are final and non-refundable upon payment confirmation.",
          "Zero Expiry Protection: Tokens never expire, ensuring perpetual value with zero maintenance fees or balance forfeitures.",
          "Immediate Delivery: Intangible digital goods are provisioned instantly into your account upon payment completion.",
          "Automatic failure refunds: Upstream technical failures automatically credit tokens back to your account ledger immediately.",
          "Australian Consumer Law (ACL): Non-excludable statutory consumer rights and statutory dispute processes are fully preserved.",
        ],
      },
      {
        heading: "7. Independent Contractor Status of Ad Agents & Disclaimer of Representation",
        paragraphs: [
          "Ad Agents are outsourced independent contractors who are only associated with Ad Radar HQ by the way of independent contractors. Ad Agents are neither employees, partners, agents, joint venturers, nor authorized legal representatives of Ad Radar HQ or AI Foundation.",
          "All advice, campaign strategies, creative directions, contractor recommendations, and opinions expressed or provided by Ad Agents (and their registered subcontractors) are strictly their own independent views and do not represent Ad Radar HQ, AI Foundation, or its officers.",
          "Ad Radar HQ acts solely as a software technology platform provider, delivering public ad library search indexing, creative workflow tools, and order coordination mechanisms. Ad Radar HQ does not endorse, guarantee, or assume legal liability for any specific third-party advice, contractor performance, creative deliverables, or commercial outcomes resulting from communications or engagements with independent Ad Agents.",
        ],
        bullets: [
          "Outsourced Independent Contractors: Ad Agents are independent contractors solely associated with Ad Radar HQ by way of independent contractor relationships.",
          "No Employment or Agency: Ad Agents are not employees, partners, or legal agents of Ad Radar HQ or AI Foundation.",
          "Independent Advice & Opinions: All advice, recommendations, strategies, and opinions provided by Ad Agents are strictly their own and do not represent Ad Radar HQ.",
          "Independent Subcontractors: Any contractors or third-party service providers listed or recommended by Ad Agents operate under their own independent commercial arrangements.",
        ],
      },
    ],
  },

  privacy: {
    id: "privacy",
    title: "Privacy Policy",
    subtitle: "Australian Privacy Principles (APP) & GDPR Standards",
    badge: "Privacy Act 1988 (Cth)",
    lastUpdated: "November 2026",
    sections: [
      {
        heading: "1. Australian Privacy Principles Commitment",
        paragraphs: [
          "AI Foundation is committed to protecting your personal information in accordance with the Australian Privacy Principles (APPs) set out in the Privacy Act 1988 (Cth) and international benchmarks including GDPR.",
          "We collect only the minimum data required to deliver high-integrity ad intelligence: your email, authentication profile, brand profiles, and token transactions.",
        ],
      },
      {
        heading: "2. Statutory 7-Year Retention on Compliance Records",
        paragraphs: [
          "In adherence with the Australian Corporations Act and taxation regulations, financial transaction logs, token ledgers, and communications with the Superadmin are cryptographically preserved for seven (7) years in tamper-evident database backups.",
          "Records cannot be prematurely deleted before their statutory expiry timestamp.",
        ],
      },
      {
        heading: "3. Zero Third-Party Data Selling",
        paragraphs: [
          "We do not sell, rent, or trade your personal data, brand identity details, or proprietary creative inputs to data brokers or advertising exchanges.",
          "Your Brand Profiles and remixed campaigns are strictly private and accessible only by your authenticated user ID.",
        ],
      },
    ],
  },

  aiPolicy: {
    id: "aiPolicy",
    title: "AI Policy (ISO/IEC 42001)",
    subtitle: "Artificial Intelligence Management System Standards",
    badge: "ISO/IEC 42001:2023",
    lastUpdated: "November 2026",
    sections: [
      {
        heading: "1. ISO/IEC 42001 Alignment & Ethical AI",
        paragraphs: [
          "AdRadarHQ's AI Remix Studio operates in alignment with ISO/IEC 42001:2023, the global standard for Artificial Intelligence Management Systems (AIMS).",
          "We ensure transparency, traceability, and ethical safety across all AI generation pipelines, ensuring generated advertising hooks and scripts are original, brand-compliant, and free from deceptive persuasion tactics.",
        ],
      },
      {
        heading: "2. Multi-Model Architecture & Guardrails",
        paragraphs: [
          "Our architecture enforces universal compatibility across high-efficiency foundation models (including Gemini 2.5 Flash-Lite, Claude Haiku 4.5, and gpt-6-luna).",
          "All prompt pipelines implement deterministic Zod schemas with additionalProperties: false, sanitizing inputs and stripping forbidden control characters.",
        ],
        bullets: [
          "Human-in-the-loop oversight: AI generates variations; the user decides execution.",
          "Zero hallucinated metrics: Engagement estimates are velocity-derived using verified multi-day ad library longevity data.",
          "Responsible copyright and fair-use adherence regarding source ad library references.",
        ],
      },
    ],
  },

  securityPolicy: {
    id: "securityPolicy",
    title: "Security Policy (ISO/IEC 27001)",
    subtitle: "Information Security Management System & Threat Protection",
    badge: "ISO/IEC 27001:2022",
    lastUpdated: "November 2026",
    sections: [
      {
        heading: "1. ISO/IEC 27001 Information Security Standards",
        paragraphs: [
          "Our infrastructure adheres to the principles of ISO/IEC 27001:2022. We implement defense-in-depth controls across authentication, data storage, cryptographic claims validation, and serverless edge delivery.",
        ],
      },
      {
        heading: "2. Cryptographic Role-Based Access Control (RBAC)",
        paragraphs: [
          "Authority within AdRadarHQ is governed by strict, cryptographically signed Firebase Custom Claims. The Superadmin role is strictly reserved for the verified database administrator email.",
          "All API mutations are enforced with idempotency keys (`x-idempotency-key`) preventing race conditions, balance tampering, and replay vulnerabilities.",
        ],
        bullets: [
          "Zero hardcoded credentials: All secrets are managed via encrypted environment variables and rotated periodically.",
          "TLS 1.3 encryption in transit and AES-256 encryption at rest on Cloud Firestore Standard (nam5).",
          "Cloud Firestore Security Rules strictly enforcing owner-scoped reads and zero client-side database write permissions.",
        ],
      },
    ],
  },
};

