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
    subtitle: "From Founder David Robertson — The Story Behind AdRadar",
    badge: "Leadership & Vision",
    lastUpdated: "November 2026",
    sections: [
      {
        heading: "Welcome to AdRadar & AI Foundation",
        paragraphs: [
          "G'day and welcome! I am David Robertson, founder of AI Foundation and AdRadar. When we set out to build this platform, our primary motivation was to level the playing field for ambitious entrepreneurs, agency operators, and businesses across Australia, New Zealand, and globally.",
          "For too long, deep ad library intelligence and high-converting marketing frameworks were walled off inside ultra-expensive enterprise tooling or guarded by elite media-buying agencies. AdRadar changes that equation entirely.",
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
          "These Terms of Service constitute a legally binding agreement between you (whether personally or on behalf of an entity) and AI Foundation ('Company', 'we', 'us', or 'our'), an Australian entity, concerning your access to and use of AdRadar.",
          "By accessing or using AdRadar, you agree that you have read, understood, and agreed to be bound by all of these Terms. If you do not agree, you are expressly prohibited from using the platform.",
        ],
      },
      {
        heading: "2. Token Economy, Australian Dollar Invoicing & Currency Conversion",
        paragraphs: [
          "AdRadar operates on a strictly defined digital token ledger. You exchange money for a token, tokens mean more flexible payment options, as a payment may be distributed to multiple service providers across our infrastructure.",
          "Because AI Foundation is an Australian registered business headquartered in Australia, the default currency of the platform is Australian Dollars (AUD), and all invoices and checkout transactions are issued and settled in Australian Dollars (AUD).",
          "The default price for one token is AUD $1. From the SuperAdmin Control Panel, both the base token price and the token amount for all services and products that are sold (including Base Search, Proven Winners (28+d) filters, Extended Longevity filters, Elite Winner filters, AI Creative Remixes, and Global Brand Copies) are fully customizable.",
          "We never ever use decimals for token balances and AUD invoices; all platform token fees and invoices strictly use whole numbers. For international visitors viewing foreign exchange estimates, the currency conversion can show up to 2 decimal places.",
          "Geolocation sets the user's default region. Australians and New Zealanders accessing the platform from Australia or New Zealand view pricing strictly in AUD. If someone is outside of Australia or New Zealand, we use our currency converter for AUD to USD currency conversion to display the USD conversion (up to 2 decimal places) alongside the AUD price, while all formal invoices remain in Australian Dollars (AUD).",
          "Refund Rules: If a search or remix fails on our side, tokens are refunded automatically. All formal refund requests are to be made in writing by sending a message to the Super Admin via the platform's secure messaging system. Requests are preserved under statutory 7-year audit retention and evaluated in accordance with the Australian Consumer Law (ACL).",
        ],
        bullets: [
          "Full disclaimer: all invoices and Stripe Checkout transactions are strictly billed and settled in Australian Dollars (AUD).",
          "Tokens represent flexible access credits: you exchange money for a token, tokens mean more flexible payment options, as a payment may be distributed to multiple service providers.",
          "Refund rules: all refund requests are to be made in writing by sending a message to the Super Admin.",
          "Automatic failure refunds: upstream system or network failures automatically refund tokens back to your ledger.",
          "Tokens never expire and remain permanently credited to your account ledger.",
          "Zero-decimal standard: our business exclusively uses whole numbers and rounds up all calculations to make them whole numbers.",
        ],
      },
      {
        heading: "3. Permitted Use & Ad Intelligence Data",
        paragraphs: [
          "AdRadar indexes public transparency repositories provided by Meta, TikTok, and Google. Users agree not to scrape, reverse-engineer, or attempt to bypass cryptographic token authentication gates.",
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
          "AdRadar's AI Remix Studio operates in alignment with ISO/IEC 42001:2023, the global standard for Artificial Intelligence Management Systems (AIMS).",
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
          "Authority within AdRadar is governed by strict, cryptographically signed Firebase Custom Claims. The Superadmin role is strictly reserved for the verified database administrator email.",
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

