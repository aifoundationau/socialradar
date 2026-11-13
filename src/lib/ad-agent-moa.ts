import {
  AD_AGENT_REDISTRIBUTION_PERCENTS,
  AdAgentMoaDocumentSchema,
  sanitizeText,
  type AdAgentDistributionItem,
  type AdAgentMoaDocument,
  type AdAgentRedistributionPercent,
} from "./contracts";

function normalizeMoaInput(agent: AdAgentDistributionItem): AdAgentMoaDocument {
  const pctCandidate = Math.round(Number(agent.redistributionPercentage) || 30);
  const validPct: AdAgentRedistributionPercent = (
    AD_AGENT_REDISTRIBUTION_PERCENTS as readonly number[]
  ).includes(pctCandidate)
    ? (pctCandidate as AdAgentRedistributionPercent)
    : 30;

  const candidate = {
    agentId: sanitizeText(agent.agentId || "ad-agent").slice(0, 128) || "ad-agent",
    name: sanitizeText(agent.name || agent.email?.split("@")[0] || "Ad Agent").slice(0, 120) || "Ad Agent",
    email: sanitizeText(agent.email || "agent@adradarhq.com").toLowerCase().slice(0, 254),
    phone: sanitizeText(agent.phone || "Not specified").slice(0, 60) || "Not specified",
    suburb: agent.suburb ? sanitizeText(agent.suburb).slice(0, 120) : undefined,
    state: agent.state ? sanitizeText(agent.state).slice(0, 120) : undefined,
    country: agent.country ? sanitizeText(agent.country).toUpperCase().slice(0, 8) : "AU",
    locationLabel: sanitizeText(agent.locationLabel || "Australia").slice(0, 240) || "Australia",
    latitude: Number.isFinite(Number(agent.latitude))
      ? Math.max(-90, Math.min(90, Number(agent.latitude)))
      : -33.8688,
    longitude: Number.isFinite(Number(agent.longitude))
      ? Math.max(-180, Math.min(180, Number(agent.longitude)))
      : 151.2093,
    bankOrPayIdDetails: agent.bankOrPayIdDetails
      ? sanitizeText(agent.bankOrPayIdDetails).slice(0, 500)
      : undefined,
    redistributionPercentage: validPct,
    status: agent.status === "inactive" ? ("inactive" as const) : ("active" as const),
  };

  const parsed = AdAgentMoaDocumentSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }

  return {
    ...candidate,
    email: candidate.email.includes("@") ? candidate.email : "agent@adradarhq.com",
  };
}

/**
 * Generates a safe operating-system filename for the Ad Agent Memorandum of Agreement (.txt).
 */
export function getAdAgentMoaFileName(
  agent: Pick<AdAgentDistributionItem, "name" | "email">,
  now: Date = new Date()
): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dateStamp = `${yyyy}-${mm}-${dd}`;
  const safeName =
    (agent.name || agent.email?.split("@")[0] || "ad-agent")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "ad-agent";
  return `ad-agent-moa-${safeName}-${dateStamp}.txt`;
}

/**
 * Builds the plain-text Memorandum of Agreement (MOA) for an Ad Agent in the
 * Ad Agent Distribution Ledger (`Ad Agent & Customizations Value`).
 */
export function buildAdAgentMoaTextContent(
  agent: AdAgentDistributionItem,
  now: Date = new Date()
): string {
  const doc = normalizeMoaInput(agent);
  const moaRef = `MOA-ADAGENT-${now.getTime().toString(36).toUpperCase()}`;
  const labelParts = doc.locationLabel.split(",").map((p) => p.trim()).filter(Boolean);
  const suburb = doc.suburb || labelParts[0] || "Not specified";
  const state = doc.state || labelParts[1] || "Not specified";
  const country = doc.country || labelParts[2] || "AU";
  const payoutDetails =
    doc.bankOrPayIdDetails && doc.bankOrPayIdDetails.trim()
      ? doc.bankOrPayIdDetails.trim()
      : "Registered in Ad Agent Panel (Bank Account / PayID / Approved Payout Method)";

  const lines: string[] = [
    "================================================================================",
    "             ADRADARHQ — AD AGENT MEMORANDUM OF AGREEMENT (MOA)                 ",
    "================================================================================",
    `Document Reference : ${moaRef}`,
    `Issue Date (AEST)  : ${now.toLocaleString("en-AU")}`,
    `Name of Ad Agent   : ${doc.name}`,
    "",
    "--------------------------------------------------------------------------------",
    "THE AD AGENT MOU CONTAINS:",
    "--------------------------------------------------------------------------------",
    "",
    "1. Fulfilling Customer Customization Orders",
    "   - Brand Strategy Deliverables: When a customer orders a \"Customize Brand",
    "     Strategy\" service, the order is routed to the closest active Ad Agent by",
    "     geolocation (or chosen directly by the customer).",
    "   - Delivering Tailored Advice: The Ad Agent reviews the customer's target",
    "     audience, positioning, pain points, and brand notes, then crafts and",
    "     delivers a tailored ad strategy and creative directions back to the",
    "     customer's Message Panel (assisted by an AI drafting tool).",
    "",
    "2. Profile, Availability & Geolocation",
    "   - Profile & Service Area: Maintains their operating location (suburb, state,",
    "     coordinates), phone number, and specialties.",
    "   - Availability Toggle: Can toggle availability ON or OFF to accept or pause",
    "     incoming client orders.",
    "",
    "3. Earnings & Redistribution Ledger",
    "   - Token Redistribution: Earns a platform redistribution percentage (10% to",
    "     70%, set by Super Admin) for every completed customization order. To view",
    "     their distribution percentage, ad agents can log in and see their agreed",
    "     distribution amount under the Ad Agent Registration & Geolocation menu item.",
    "   - Distributions Tracking: Has access to a dedicated Distributions tab to view",
    "     completed orders, token totals, and accumulated earnings.",
    "   - Payouts: Receives payouts directly to their registered Bank Account or",
    "     PayID. If outside Australia, other payout methods are accepted. Payouts can",
    "     be on demand, but it is generally accepted that Ad Agents should wait until",
    "     their accounts reach $1000 before requesting a payout.",
    "   - Currency: Prices are in AUD for Australian Ad Agents.",
    "",
    "4. Contractor Directory Management",
    "   - Subcontractor Network: Maintains a personal directory of external creative",
    "     partners (e.g., custom ad graphic designers, video editors, copywriters)",
    "     with their rates and contact info.",
    "   - One-Click Recommendations: Quickly inserts trusted contractors directly",
    "     into customer strategy proposals.",
    "",
    "5. Legal & Operational Status",
    "   - Independent Contractors: Ad Agents are independent outsourced contractors",
    "     (not employees or legal representatives of Ad Radar HQ). Their strategy",
    "     advice, opinions, and subcontractor recommendations are strictly their own.",
    "   - Termination: MOA can be terminated at any time with mutual agreement.",
    "   - Non-Binding Status: This is not a legally binding contract.",
    "",
    "6. Proof of Work",
    "   - 30-Day Activity Requirement: If the Ad Agent has not logged into the web",
    "     app and conducted any contract work over a 30-day period, their independent",
    "     contractor status may be suspended.",
    "   - Prolonged Absence & Super Admin Discretion: An independent contractor may",
    "     contact Super Admin if they know they may not be able to complete any proof",
    "     of work obligations over a 30-day or prolonged period of time, and the",
    "     suspension may be lifted at the discretion of the Super Admin.",
    "",
    "--------------------------------------------------------------------------------",
    "AGREEMENT PARTIES & CONTACT DETAILS",
    "--------------------------------------------------------------------------------",
    "Agreement between the Ad Agent:",
    `  Name of Ad Agent          : ${doc.name}`,
    `  Email Address             : ${doc.email}`,
    `  Phone Number              : ${doc.phone}`,
    `  Operating Location        : ${doc.locationLabel}`,
    `  Suburb / State / Country  : ${suburb}, ${state}, ${country}`,
    `  Geolocation Coordinates   : ${doc.latitude.toFixed(4)}, ${doc.longitude.toFixed(4)}`,
    `  Agreed Redistribution %   : ${doc.redistributionPercentage}%`,
    `  Payout / Bank or PayID    : ${payoutDetails}`,
    `  Account Status            : ${doc.status.toUpperCase()}`,
    `  Ad Agent Reference ID     : ${doc.agentId}`,
    "",
    "and",
    "",
    "  David Robertson",
    "  The AI Foundation",
    "  ABN 36 339 516 584",
    "  Platform                  : AdRadarHQ (https://adradarhq.com)",
    "  Contact Email             : support@aifoundation.net.au",
    "",
    "--------------------------------------------------------------------------------",
    "SIGNATURES & EXECUTION",
    "--------------------------------------------------------------------------------",
    "Signed by the Ad Agent:",
    "",
    "Signature : _________________________________________",
    `Name      : ${doc.name}`,
    `Email     : ${doc.email}`,
    "Date      : _________________________________________",
    "",
    "",
    "Signed for and on behalf of The AI Foundation:",
    "",
    "Signature : _________________________________________",
    "Name      : David Robertson",
    "Entity    : The AI Foundation",
    "ABN       : 36 339 516 584",
    "Date      : _________________________________________",
    "",
    "================================================================================",
    "Copyright, all rights reserved, David Robertson — The AI Foundation",
    "================================================================================",
  ];

  return lines.join("\r\n");
}

/**
 * Triggers a browser `.txt` download of the Ad Agent's Memorandum of Agreement.
 */
export function downloadAdAgentMoaTextFile(
  agent: AdAgentDistributionItem,
  now: Date = new Date()
): { fileName: string; content: string } {
  const fileName = getAdAgentMoaFileName(agent, now);
  const content = buildAdAgentMoaTextContent(agent, now);

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  return { fileName, content };
}
