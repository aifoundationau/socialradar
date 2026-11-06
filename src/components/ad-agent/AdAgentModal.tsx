"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSession } from "@/components/auth/SessionProvider";
import { Icon } from "@/components/ui/Icon";
import {
  alertError,
  alertInfo,
  btnPrimary,
  btnSecondary,
  card,
  field,
  label,
} from "@/components/ui/styles";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { autofindUserLocation, loadGeoConfig } from "@/lib/geo";
import type {
  AdAgentLocation,
  AdAgentProfile,
  AiCustomizeReplyDraftResponse,
  CustomizeRequestDoc,
} from "@/lib/contracts";

const emptySubscribe = () => () => { };
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export const QUICK_GEO_PRESETS: Array<{
  label: string;
  suburb: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
}> = [
    { label: "Sydney, NSW (AU)", suburb: "Sydney", state: "NSW", country: "AU", latitude: -33.8688, longitude: 151.2093 },
    { label: "Melbourne, VIC (AU)", suburb: "Melbourne", state: "VIC", country: "AU", latitude: -37.8136, longitude: 144.9631 },
    { label: "Brisbane, QLD (AU)", suburb: "Brisbane", state: "QLD", country: "AU", latitude: -27.4705, longitude: 153.026 },
    { label: "Perth, WA (AU)", suburb: "Perth", state: "WA", country: "AU", latitude: -31.9505, longitude: 115.8605 },
    { label: "Adelaide, SA (AU)", suburb: "Adelaide", state: "SA", country: "AU", latitude: -34.9285, longitude: 138.6007 },
    { label: "Gold Coast, QLD (AU)", suburb: "Gold Coast", state: "QLD", country: "AU", latitude: -28.0167, longitude: 153.4 },
    { label: "Canberra, ACT (AU)", suburb: "Canberra", state: "ACT", country: "AU", latitude: -35.2809, longitude: 149.13 },
    { label: "Auckland (NZ)", suburb: "Auckland", state: "AUK", country: "NZ", latitude: -36.8485, longitude: 174.7633 },
    { label: "Singapore (SG)", suburb: "Singapore", state: "SG", country: "SG", latitude: 1.3521, longitude: 103.8198 },
    { label: "London (GB)", suburb: "London", state: "ENG", country: "GB", latitude: 51.5072, longitude: -0.1276 },
    { label: "Los Angeles, CA (US)", suburb: "Los Angeles", state: "CA", country: "US", latitude: 34.0522, longitude: -118.2437 },
    { label: "New York, NY (US)", suburb: "New York", state: "NY", country: "US", latitude: 40.7128, longitude: -74.006 },
  ];

export interface AdAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "REGISTRATION" | "ORDERS";
}

export function AdAgentModal({ isOpen, onClose, initialTab = "REGISTRATION" }: AdAgentModalProps) {
  const isClient = useIsClient();
  const { user, role, isSuperAdmin } = useSession();
  const registeredEmail = (user?.email || "").toLowerCase().trim();
  const isSuper = role === "superadmin" || isSuperAdmin;
  const isMainAdmin = role === "admin";

  const [tab, setTab] = useState<"REGISTRATION" | "ORDERS">(initialTab);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detectingGeo, setDetectingGeo] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [myAgentProfile, setMyAgentProfile] = useState<AdAgentProfile | null>(null);
  const [assignedRequests, setAssignedRequests] = useState<CustomizeRequestDoc[]>([]);

  // Registration Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bankOrPayIdDetails, setBankOrPayIdDetails] = useState("");
  const [agentStatus, setAgentStatus] = useState<"active" | "inactive">("active");
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [suburb, setSuburb] = useState("Sydney");
  const [stateRegion, setStateRegion] = useState("NSW");
  const [country, setCountry] = useState("AU");
  const [latitude, setLatitude] = useState<number>(-33.8688);
  const [longitude, setLongitude] = useState<number>(151.2093);

  // Reply Composer State for Assigned Customize Orders
  const [activeReplyRequestId, setActiveReplyRequestId] = useState<string | null>(null);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replyStaffNotes, setReplyStaffNotes] = useState("");
  const [aiDrafting, setAiDrafting] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  // Recommended Services State (underneath Strategy Package Body)
  const [recGraphicArtEnabled, setRecGraphicArtEnabled] = useState(false);
  const [recGraphicArtNeeded, setRecGraphicArtNeeded] = useState("");
  const [recGraphicArtProvider, setRecGraphicArtProvider] = useState("");
  const [recGraphicArtPrice, setRecGraphicArtPrice] = useState("");

  const [recVideoWorkEnabled, setRecVideoWorkEnabled] = useState(false);
  const [recVideoWorkNeeded, setRecVideoWorkNeeded] = useState("");
  const [recVideoWorkProvider, setRecVideoWorkProvider] = useState("");
  const [recVideoWorkPrice, setRecVideoWorkPrice] = useState("");

  const [recOtherServicesNotes, setRecOtherServicesNotes] = useState("");

  function resetRecommendedServices() {
    setRecGraphicArtEnabled(false);
    setRecGraphicArtNeeded("");
    setRecGraphicArtProvider("");
    setRecGraphicArtPrice("");
    setRecVideoWorkEnabled(false);
    setRecVideoWorkNeeded("");
    setRecVideoWorkProvider("");
    setRecVideoWorkPrice("");
    setRecOtherServicesNotes("");
  }

  function buildRecommendedServicesText(): string {
    const sections: string[] = [];

    if (
      recGraphicArtEnabled ||
      recGraphicArtNeeded.trim() ||
      recGraphicArtProvider.trim() ||
      recGraphicArtPrice.trim()
    ) {
      const lines = ["[x] Custom Ad Graphic Art"];
      if (recGraphicArtNeeded.trim()) {
        lines.push(`    What May Be Needed : ${recGraphicArtNeeded.trim()}`);
      }
      if (recGraphicArtProvider.trim()) {
        lines.push(`    Service Provider   : ${recGraphicArtProvider.trim()}`);
      }
      if (recGraphicArtPrice.trim()) {
        lines.push(`    Price (Optional)   : ${recGraphicArtPrice.trim()}`);
      }
      sections.push(lines.join("\n"));
    }

    if (
      recVideoWorkEnabled ||
      recVideoWorkNeeded.trim() ||
      recVideoWorkProvider.trim() ||
      recVideoWorkPrice.trim()
    ) {
      const lines = ["[x] Custom Video Work"];
      if (recVideoWorkNeeded.trim()) {
        lines.push(`    What May Be Needed : ${recVideoWorkNeeded.trim()}`);
      }
      if (recVideoWorkProvider.trim()) {
        lines.push(`    Service Provider   : ${recVideoWorkProvider.trim()}`);
      }
      if (recVideoWorkPrice.trim()) {
        lines.push(`    Price (Optional)   : ${recVideoWorkPrice.trim()}`);
      }
      sections.push(lines.join("\n"));
    }

    if (recOtherServicesNotes.trim()) {
      sections.push(
        `Other Recommended Services, Providers & Estimate Pricing:\n${recOtherServicesNotes.trim()}`,
      );
    }

    if (sections.length === 0) return "";

    return [
      "----------------------------------------------------------------------",
      "RECOMMENDED SERVICES",
      "----------------------------------------------------------------------",
      sections.join("\n\n"),
      "----------------------------------------------------------------------",
    ].join("\n");
  }

  useEffect(() => {
    if (isOpen && initialTab) {
      setTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const geo = loadGeoConfig();
    setSuburb(geo.suburb || "Sydney");
    setStateRegion(geo.state || "NSW");
    setCountry(geo.country || "AU");
    setLatitude(typeof geo.latitude === "number" ? geo.latitude : -33.8688);
    setLongitude(typeof geo.longitude === "number" ? geo.longitude : 151.2093);
    if (user?.displayName && !name) {
      setName(user.displayName);
    }
    loadAgentData();
  }, [isOpen]);

  async function loadAgentData() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiFetch<{
        myAgentProfile: AdAgentProfile | null;
        assignedRequests: CustomizeRequestDoc[];
      }>("/api/ad-agent", { method: "GET" });

      if (data.myAgentProfile) {
        setMyAgentProfile(data.myAgentProfile);
        setName(data.myAgentProfile.name || user?.displayName || "");
        setPhone(data.myAgentProfile.phone || "");
        setBankOrPayIdDetails(data.myAgentProfile.bankOrPayIdDetails || "");
        setAgentStatus(data.myAgentProfile.status === "inactive" ? "inactive" : "active");
        if (data.myAgentProfile.location) {
          setSuburb(data.myAgentProfile.location.suburb || "Sydney");
          setStateRegion(data.myAgentProfile.location.state || "NSW");
          setCountry(data.myAgentProfile.location.country || "AU");
          setLatitude(data.myAgentProfile.location.latitude);
          setLongitude(data.myAgentProfile.location.longitude);
        }
      }
      if (Array.isArray(data.assignedRequests)) {
        setAssignedRequests(data.assignedRequests);
      }
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDetectGeolocation() {
    setDetectingGeo(true);
    setErrorMsg(null);
    try {
      const detected = await autofindUserLocation();
      setSuburb(detected.suburb || "Sydney");
      setStateRegion(detected.state || "NSW");
      setCountry(detected.country || "AU");
      setLatitude(typeof detected.latitude === "number" ? detected.latitude : -33.8688);
      setLongitude(typeof detected.longitude === "number" ? detected.longitude : 151.2093);
      setStatusMsg(
        `Geolocation detected: ${detected.suburb}, ${detected.state}, ${detected.country} (${(detected.latitude ?? -33.8688).toFixed(4)}, ${(detected.longitude ?? 151.2093).toFixed(4)}).`,
      );
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setDetectingGeo(false);
    }
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Please enter your Ad Agent full name.");
      return;
    }
    if (!phone.trim() || phone.trim().length < 3) {
      setErrorMsg("Please enter a valid contact phone number.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const locationPayload: AdAgentLocation = {
        suburb: suburb.trim() || "Sydney",
        state: stateRegion.trim() || "NSW",
        country: (country.trim() || "AU").toUpperCase(),
        latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : -33.8688,
        longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : 151.2093,
        label: `${suburb.trim() || "Sydney"}, ${stateRegion.trim() || "NSW"}, ${(country.trim() || "AU").toUpperCase()}`,
      };

      const res = await apiFetch<{
        success: boolean;
        agent: AdAgentProfile;
        assignedRole: string;
        ledger?: unknown[];
        adAgentLedger?: unknown[];
      }>("/api/ad-agent", {
        method: "POST",
        body: {
          action: "REGISTER_AD_AGENT",
          name: name.trim(),
          phone: phone.trim(),
          bankOrPayIdDetails: bankOrPayIdDetails.trim(),
          status: agentStatus,
          location: locationPayload,
        },
      });

      setMyAgentProfile(res.agent);
      setAgentStatus(res.agent.status === "inactive" ? "inactive" : "active");
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("ad-agent-ledger-updated", {
            detail: {
              agent: res.agent,
              ledger: res.ledger || res.adAgentLedger,
            },
          }),
        );
      }
      setStatusMsg(
        res.agent.status === "active"
          ? `Ad Agent profile saved and status is ON (Active) for ${res.agent.name} (${res.agent.email}) at ${res.agent.location.label}. Your details are now updated in the Ad Agent Distribution Ledger.`
          : `Ad Agent profile saved for ${res.agent.name} (${res.agent.email}). Your Ad Agent status is currently OFF (Paused) — turn it ON anytime to receive Customize orders.`,
      );
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleOwnStatus(targetStatus: "active" | "inactive") {
    setAgentStatus(targetStatus);
    if (!myAgentProfile) {
      setStatusMsg(
        targetStatus === "active"
          ? "Ad Agent status set to ON (Active). Click 'Register as Ad Agent' below to save."
          : "Ad Agent status set to OFF (Paused). Click 'Register as Ad Agent' below to save.",
      );
      return;
    }

    setTogglingStatus(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await apiFetch<{
        success: boolean;
        agent: AdAgentProfile;
        ledger?: unknown[];
        adAgentLedger?: unknown[];
      }>("/api/ad-agent", {
        method: "POST",
        body: {
          action: "AGENT_TOGGLE_OWN_STATUS",
          status: targetStatus,
        },
      });
      if (res.agent) {
        setMyAgentProfile(res.agent);
        setAgentStatus(res.agent.status);
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("ad-agent-ledger-updated", {
            detail: {
              agent: res.agent,
              ledger: res.ledger || res.adAgentLedger,
            },
          }),
        );
      }
      setStatusMsg(
        targetStatus === "active"
          ? "Ad Agent status turned ON (Active). You are now visible and receiving geolocation-matched Customize orders."
          : "Ad Agent status turned OFF (Paused). You will not receive new Customize orders until you turn your Ad Agent status back ON.",
      );
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setTogglingStatus(false);
    }
  }

  async function handleGenerateAiDraft(reqDoc: CustomizeRequestDoc) {
    setAiDrafting(true);
    setErrorMsg(null);
    try {
      const briefText = [
        `Brand Name: ${reqDoc.brandName}`,
        `Tone of Voice: ${reqDoc.toneOfVoice}`,
        `Product/Service: ${reqDoc.productServiceDescription}`,
        `Target Audience Avatar: ${reqDoc.targetAudienceAvatar}`,
        `Core Pain Points: ${reqDoc.corePainPoints.join("; ")}`,
        `Unique Mechanism/Offer: ${reqDoc.uniqueMechanismOrOffer}`,
        `Landing Pages: ${(reqDoc.landingPageUrls?.length ? reqDoc.landingPageUrls : [reqDoc.destinationUrl]).join(", ")}`,
        `Extra Details & Notes: ${reqDoc.extraDetailsAndNotes}`,
      ].join("\n");

      const res = await apiFetch<{
        success: boolean;
        draft: AiCustomizeReplyDraftResponse;
      }>("/api/admin/messages/ai-draft", {
        method: "POST",
        body: {
          customizeRequestId: reqDoc.requestId,
          customerEmail: reqDoc.userEmail,
          subject: `Customized Brand & Ad Strategy Package: ${reqDoc.brandName}`,
          customerBriefText: briefText,
          staffNotes: replyStaffNotes.trim() || undefined,
        },
      });

      if (res.draft) {
        setReplySubject(res.draft.subject);
        setReplyBody(res.draft.body);
      }
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setAiDrafting(false);
    }
  }

  async function handleSendCustomizeReply(reqDoc: CustomizeRequestDoc) {
    if (!replySubject.trim() || !replyBody.trim()) {
      setErrorMsg("Enter a subject and strategy reply body before sending.");
      return;
    }
    setSendingReply(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const recommendedBlock = buildRecommendedServicesText();
      const baseBody = replyBody.trim();
      const finalBody =
        recommendedBlock && !baseBody.includes("RECOMMENDED SERVICES")
          ? `${baseBody}\n\n${recommendedBlock}`
          : baseBody;

      await apiFetch("/api/ad-agent", {
        method: "POST",
        body: {
          action: "SEND_AGENT_CUSTOMIZE_REPLY",
          customizeRequestId: reqDoc.requestId,
          recipientEmail: reqDoc.userEmail,
          subject: replySubject.trim(),
          body: finalBody,
        },
      });
      setStatusMsg(
        `Delivered completed Customize Strategy for "${reqDoc.brandName}" to ${reqDoc.userEmail}.`,
      );
      setActiveReplyRequestId(null);
      setReplySubject("");
      setReplyBody("");
      setReplyStaffNotes("");
      resetRecommendedServices();
      await loadAgentData();
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSendingReply(false);
    }
  }

  if (!isOpen || !isClient) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ad-agent-modal-title"
      data-agent-id="ad-agent-modal"
      data-testid="ad-agent-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex w-full max-w-4xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] flex-col rounded-2xl border border-white/[0.14] bg-surface-container-high shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.08] px-5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <Icon name="mapPin" className="size-4" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="ad-agent-modal-title" className="text-title-sm font-bold text-on-surface">
                  Ad Agent Registration &amp; Customize Orders Panel
                </h2>
                <span className="rounded-full bg-primary/15 border border-primary/30 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
                  RBAC Role: Ad Agent
                </span>
              </div>
              <p className="text-[11px] font-mono text-on-surface-variant">
                Geolocation-matched Customize orders &amp; Ad Agent Redistribution Ledger
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Ad Agent panel"
            data-agent-id="close-ad-agent-modal-btn"
            data-testid="close-ad-agent-modal-btn"
            className="flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-white/[0.08] hover:text-on-surface"
          >
            <Icon name="x" className="size-5" />
          </button>
        </div>

        {/* Navigation Tabs & Ad Agent ON/OFF Status Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-surface-container px-5 py-2.5 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab("REGISTRATION")}
              data-agent-id="ad-agent-tab-registration"
              data-testid="ad-agent-tab-registration"
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-1.5 font-mono text-xs font-semibold transition ${tab === "REGISTRATION"
                  ? "border-primary/50 bg-primary/15 text-primary shadow-sm"
                  : "border-white/[0.06] bg-surface-container-high/60 text-on-surface-variant hover:text-on-surface"
                }`}
            >
              <Icon name="user" className="size-3.5" />
              <span>Ad Agent Registration &amp; Geolocation</span>
            </button>
            <button
              type="button"
              onClick={() => setTab("ORDERS")}
              data-agent-id="ad-agent-tab-orders"
              data-testid="ad-agent-tab-orders"
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-1.5 font-mono text-xs font-semibold transition ${tab === "ORDERS"
                  ? "border-primary/50 bg-primary/15 text-primary shadow-sm"
                  : "border-white/[0.06] bg-surface-container-high/60 text-on-surface-variant hover:text-on-surface"
                }`}
            >
              <Icon name="sparkles" className="size-3.5" />
              <span>Assigned Customize Orders ({assignedRequests.length})</span>
            </button>
          </div>

          {/* Ad Agent Self-Service Status Toggle (ON / OFF) */}
          <div
            className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-surface-container-highest/70 px-3 py-1.5"
            data-agent-id="ad-agent-self-status-toggle-bar"
            data-testid="ad-agent-self-status-toggle-bar"
          >
            <span className="font-mono text-[11px] font-semibold text-on-surface-variant">
              Ad Agent Status:
            </span>
            <div className="inline-flex items-center rounded-lg border border-white/10 bg-surface-container-lowest p-0.5 font-mono text-[11px]">
              <button
                type="button"
                disabled={togglingStatus}
                onClick={() => handleToggleOwnStatus("active")}
                aria-pressed={agentStatus === "active"}
                data-agent-id="ad-agent-status-on-btn"
                data-testid="ad-agent-status-on-btn"
                className={`rounded-md px-2.5 py-0.5 font-bold transition ${agentStatus === "active"
                    ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                  } disabled:opacity-50`}
              >
                ● ON
              </button>
              <button
                type="button"
                disabled={togglingStatus}
                onClick={() => handleToggleOwnStatus("inactive")}
                aria-pressed={agentStatus === "inactive"}
                data-agent-id="ad-agent-status-off-btn"
                data-testid="ad-agent-status-off-btn"
                className={`rounded-md px-2.5 py-0.5 font-bold transition ${agentStatus === "inactive"
                    ? "bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                  } disabled:opacity-50`}
              >
                ○ OFF
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {errorMsg && <p className={alertError}>{errorMsg}</p>}
          {statusMsg && <p className={alertInfo}>{statusMsg}</p>}

          {tab === "REGISTRATION" && (
            <div className="space-y-5">
              {/* Role & Status Banner */}
              <div
                className={`${card} p-4 border space-y-2.5 ${agentStatus === "active"
                    ? "border-primary/30 bg-primary/[0.04]"
                    : "border-amber-500/30 bg-amber-500/[0.04]"
                  }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Icon name="shield" className="size-4 text-primary" />
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-primary">
                      {isSuper
                        ? "Super Admin — Built-In Ad Agent (No Registration Required)"
                        : isMainAdmin
                          ? "Main Admin — Ad Agent Registration Enabled"
                          : myAgentProfile
                            ? agentStatus === "active"
                              ? "Registered Active Ad Agent (Status: ON)"
                              : "Registered Ad Agent (Status: OFF — Paused)"
                            : "Register as an AdRadarHQ Ad Agent"}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold border ${agentStatus === "active"
                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                          : "bg-amber-500/15 border-amber-500/30 text-amber-300"
                        }`}
                    >
                      {agentStatus === "active"
                        ? `ON (Active) · ${myAgentProfile?.redistributionPercentage ?? 30}% Redistribution Rate`
                        : `OFF (Paused) · ${myAgentProfile?.redistributionPercentage ?? 30}% Redistribution Rate`}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={togglingStatus}
                    onClick={() =>
                      handleToggleOwnStatus(agentStatus === "active" ? "inactive" : "active")
                    }
                    data-agent-id="ad-agent-toggle-status-btn"
                    data-testid="ad-agent-toggle-status-btn"
                    aria-label={
                      agentStatus === "active"
                        ? "Turn Ad Agent status OFF"
                        : "Turn Ad Agent status ON"
                    }
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-xs font-bold transition ${agentStatus === "active"
                        ? "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                        : "border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                      } disabled:opacity-50`}
                  >
                    <Icon name="refresh" className={`size-3.5 ${togglingStatus ? "animate-spin" : ""}`} />
                    <span>
                      {togglingStatus
                        ? "Updating Status…"
                        : agentStatus === "active"
                          ? "Turn Ad Agent Status OFF"
                          : "Turn Ad Agent Status ON"}
                    </span>
                  </button>
                </div>
                <p className="text-body-sm text-on-surface-variant">
                  {agentStatus === "inactive"
                    ? "Your Ad Agent status is currently OFF (Paused). Customers will not be matched to you for new Customize orders until you click 'Turn Ad Agent Status ON' above."
                    : isSuper
                      ? "As Super Admin, you are automatically an active Ad Agent with no registration required. You can turn your Ad Agent status OFF or back ON anytime, or update your geolocation coordinates and phone number below."
                      : isMainAdmin
                        ? "As Main Admin, you can register as an Ad Agent below while keeping your Main Admin privileges, and turn your Ad Agent status OFF or back ON whenever you want."
                        : "Register your Name, Phone Number, Registered Email, and Geolocation below. You can turn your Ad Agent status OFF anytime to pause new Customize orders, and turn it back ON whenever you are ready."}
                </p>
              </div>

              {/* Registration Form */}
              <form onSubmit={handleRegisterSubmit} className={`${card} p-5 space-y-4`}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className={label} htmlFor="ad-agent-name-input">
                      Ad Agent Full Name *
                    </label>
                    <input
                      id="ad-agent-name-input"
                      type="text"
                      required
                      maxLength={100}
                      placeholder="e.g. Sarah Jenkins"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={field}
                      data-agent-id="ad-agent-name-input"
                      data-testid="ad-agent-name-input"
                    />
                  </div>

                  <div>
                    <label className={label} htmlFor="ad-agent-phone-input">
                      Phone Number *
                    </label>
                    <input
                      id="ad-agent-phone-input"
                      type="tel"
                      required
                      maxLength={40}
                      placeholder="+61 400 000 000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={field}
                      data-agent-id="ad-agent-phone-input"
                      data-testid="ad-agent-phone-input"
                    />
                  </div>

                  <div>
                    <label className={label} htmlFor="ad-agent-email-input">
                      Registered Email *
                    </label>
                    <input
                      id="ad-agent-email-input"
                      type="email"
                      readOnly
                      value={registeredEmail}
                      className={`${field} opacity-75 cursor-not-allowed font-mono text-xs`}
                      data-agent-id="ad-agent-email-input"
                      data-testid="ad-agent-email-input"
                    />
                    <p className="mt-1 text-[11px] font-mono text-outline">
                      Locked to the email you registered with
                    </p>
                  </div>
                </div>

                {/* Geolocation Section */}
                <div className="rounded-xl border border-white/10 bg-surface-container p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-compact font-bold text-on-surface flex items-center gap-1.5">
                        <Icon name="mapPin" className="size-4 text-primary" />
                        <span>Ad Agent Geolocation (Used to Match Closest Customize Customers)</span>
                      </h4>
                      <p className="text-[11px] text-on-surface-variant">
                        Detect your exact GPS coordinates or select a preset city so customers near you are automatically routed to you.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDetectGeolocation}
                      disabled={detectingGeo}
                      data-agent-id="ad-agent-detect-geo-btn"
                      data-testid="ad-agent-detect-geo-btn"
                      className={`${btnSecondary} shrink-0 flex items-center gap-1.5 font-mono text-xs`}
                    >
                      <Icon name="mapPin" className="size-3.5 text-primary" />
                      <span>{detectingGeo ? "Detecting GPS..." : "Use My Current Geolocation"}</span>
                    </button>
                  </div>

                  {/* Quick City Presets */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[10px] text-outline mr-1">Quick Locations:</span>
                    {QUICK_GEO_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setSuburb(preset.suburb);
                          setStateRegion(preset.state);
                          setCountry(preset.country);
                          setLatitude(preset.latitude);
                          setLongitude(preset.longitude);
                        }}
                        className="rounded-lg border border-white/10 bg-surface-container-highest px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:border-primary/40 hover:text-on-surface transition"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                    <div className="sm:col-span-2">
                      <label className={label} htmlFor="ad-agent-suburb-input">
                        Suburb / City *
                      </label>
                      <input
                        id="ad-agent-suburb-input"
                        type="text"
                        required
                        value={suburb}
                        onChange={(e) => setSuburb(e.target.value)}
                        className={field}
                        data-agent-id="ad-agent-suburb-input"
                        data-testid="ad-agent-suburb-input"
                      />
                    </div>
                    <div>
                      <label className={label} htmlFor="ad-agent-state-input">
                        State / Region *
                      </label>
                      <input
                        id="ad-agent-state-input"
                        type="text"
                        required
                        value={stateRegion}
                        onChange={(e) => setStateRegion(e.target.value)}
                        className={field}
                        data-agent-id="ad-agent-state-input"
                        data-testid="ad-agent-state-input"
                      />
                    </div>
                    <div>
                      <label className={label} htmlFor="ad-agent-country-input">
                        Country Code *
                      </label>
                      <input
                        id="ad-agent-country-input"
                        type="text"
                        required
                        maxLength={4}
                        value={country}
                        onChange={(e) => setCountry(e.target.value.toUpperCase())}
                        className={`${field} font-mono uppercase`}
                        data-agent-id="ad-agent-country-input"
                        data-testid="ad-agent-country-input"
                      />
                    </div>
                    <div>
                      <label className={label}>Coordinates</label>
                      <div className="rounded-xl border border-white/10 bg-surface-container-highest px-2.5 py-2 font-mono text-[11px] text-primary truncate">
                        {Number(latitude).toFixed(3)}, {Number(longitude).toFixed(3)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bank Details or PayID Details Box */}
                <div className="rounded-xl border border-white/10 bg-surface-container p-4 space-y-2">
                  <label className={label} htmlFor="ad-agent-bank-payid-input">
                    Bank Details or PayID Details (For Redistribution Payouts)
                  </label>
                  <textarea
                    id="ad-agent-bank-payid-input"
                    rows={2}
                    maxLength={500}
                    placeholder="e.g. PayID: agent@agency.com (or +61 400 000 000) | Bank: Commonwealth Bank, BSB: 062-000, Account: 1234 5678, Account Name: Sarah Jenkins"
                    value={bankOrPayIdDetails}
                    onChange={(e) => setBankOrPayIdDetails(e.target.value)}
                    className={`${field} font-mono text-xs`}
                    data-agent-id="ad-agent-bank-payid-input"
                    data-testid="ad-agent-bank-payid-input"
                  />
                  <p className="text-[11px] font-mono text-outline">
                    Automatically populates in the Super Admin Ad Agent Distribution Ledger for redistribution payouts.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className={btnSecondary}
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={saving || loading}
                    data-agent-id="ad-agent-register-submit-btn"
                    data-testid="ad-agent-register-submit-btn"
                    className={`${btnPrimary} flex items-center gap-2`}
                  >
                    <Icon name="checkCircle" className="size-4" />
                    <span>
                      {saving
                        ? "Saving Ad Agent Profile..."
                        : myAgentProfile
                          ? "Update Ad Agent Profile & Geolocation"
                          : "Register as Ad Agent"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {tab === "ORDERS" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-body font-bold text-on-surface">
                    Customize Orders Assigned to You ({assignedRequests.length})
                  </h3>
                  <p className="text-compact text-on-surface-variant">
                    Review customer briefs matched to your geolocation, generate AI strategy drafts, and deliver completed packages to the customer&apos;s Message Panel.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadAgentData}
                  className={btnSecondary}
                  data-agent-id="ad-agent-refresh-orders-btn"
                  data-testid="ad-agent-refresh-orders-btn"
                >
                  <Icon name="refresh" className="size-3.5" />
                  <span>Refresh</span>
                </button>
              </div>

              {assignedRequests.length === 0 ? (
                <div className={`${card} p-8 text-center text-on-surface-variant`}>
                  <p className="text-body font-medium">No Customize orders assigned yet.</p>
                  <p className="text-compact mt-1 text-outline">
                    When a customer submits a Customize Brand Strategy brief and you are the closest active Ad Agent to their geolocation, their order will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {assignedRequests.map((reqDoc) => {
                    const isReplying = activeReplyRequestId === reqDoc.requestId;
                    return (
                      <div
                        key={reqDoc.requestId}
                        className={`${card} p-4 space-y-3 border border-white/10`}
                        data-testid={`ad-agent-order-${reqDoc.requestId}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-on-surface text-body">
                                {reqDoc.brandName}
                              </span>
                              <span className="rounded bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
                                ⚡ {reqDoc.tokensCharged} Tokens
                              </span>
                              <span
                                className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${reqDoc.status === "completed"
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : "bg-amber-500/20 text-amber-300"
                                  }`}
                              >
                                {reqDoc.status}
                              </span>
                            </div>
                            <p className="font-mono text-xs text-on-surface-variant mt-0.5">
                              Customer: <strong className="text-on-surface">{reqDoc.userEmail}</strong>
                              {reqDoc.customerLocation && (
                                <>
                                  {" "}· Customer Location:{" "}
                                  <strong className="text-primary">
                                    {reqDoc.customerLocation.suburb}, {reqDoc.customerLocation.state} ({reqDoc.customerLocation.country})
                                  </strong>
                                </>
                              )}
                              {typeof reqDoc.assignedDistanceKm === "number" && (
                                <> · Distance: {reqDoc.assignedDistanceKm} km</>
                              )}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              if (isReplying) {
                                setActiveReplyRequestId(null);
                              } else {
                                setActiveReplyRequestId(reqDoc.requestId);
                                setReplySubject(`Customized Brand & Ad Strategy Package: ${reqDoc.brandName}`);
                                setReplyBody("");
                              }
                            }}
                            data-agent-id={`ad-agent-open-reply-${reqDoc.requestId}`}
                            data-testid={`ad-agent-open-reply-${reqDoc.requestId}`}
                            className={btnPrimary}
                          >
                            <Icon name="sparkles" className="size-3.5" />
                            <span>{isReplying ? "Close Strategy Composer" : "Craft & Deliver Strategy"}</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs text-on-surface-variant rounded-xl bg-surface-container p-3 border border-white/[0.06]">
                          <div>
                            <strong className="text-on-surface">Product / Service:</strong>{" "}
                            {reqDoc.productServiceDescription}
                          </div>
                          <div>
                            <strong className="text-on-surface">Target Avatar:</strong>{" "}
                            {reqDoc.targetAudienceAvatar}
                          </div>
                          <div>
                            <strong className="text-on-surface">Unique Mechanism / Offer:</strong>{" "}
                            {reqDoc.uniqueMechanismOrOffer}
                          </div>
                          <div>
                            <strong className="text-on-surface">Extra Details:</strong>{" "}
                            {reqDoc.extraDetailsAndNotes}
                          </div>
                        </div>

                        {isReplying && (
                          <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-primary">
                                Deliver Customized Strategy to {reqDoc.userEmail}
                              </span>
                              <button
                                type="button"
                                disabled={aiDrafting}
                                onClick={() => handleGenerateAiDraft(reqDoc)}
                                data-agent-id={`ad-agent-ai-draft-${reqDoc.requestId}`}
                                data-testid={`ad-agent-ai-draft-${reqDoc.requestId}`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/20 px-3 py-1 font-mono text-xs font-bold text-primary hover:bg-primary/30 disabled:opacity-50"
                              >
                                <Icon name="sparkles" className="size-3.5" />
                                <span>{aiDrafting ? "Generating AI Strategy..." : "Generate AI Work Reply ✨"}</span>
                              </button>
                            </div>

                            <div>
                              <label className={label}>Optional Ad Agent Direction for AI</label>
                              <input
                                type="text"
                                placeholder="e.g. Emphasize local Australian market proof and TikTok UGC hooks"
                                value={replyStaffNotes}
                                onChange={(e) => setReplyStaffNotes(e.target.value)}
                                className={field}
                              />
                            </div>

                            <div>
                              <label className={label}>Subject *</label>
                              <input
                                type="text"
                                value={replySubject}
                                onChange={(e) => setReplySubject(e.target.value)}
                                className={field}
                              />
                            </div>

                            <div>
                              <label className={label}>Strategy Package Body (Plain Text) *</label>
                              <textarea
                                rows={8}
                                value={replyBody}
                                onChange={(e) => setReplyBody(e.target.value)}
                                data-agent-id={`ad-agent-strategy-body-${reqDoc.requestId}`}
                                data-testid={`ad-agent-strategy-body-${reqDoc.requestId}`}
                                className={`${field} font-mono text-xs`}
                                placeholder="Click 'Generate AI Work Reply ✨' above or write your customized brand strategy..."
                              />
                            </div>

                            {/* RECOMMENDED SERVICES SECTION (Underneath Strategy Package Body) */}
                            <div
                              className="rounded-xl border border-tertiary/35 bg-surface-container-highest/50 p-3.5 space-y-3"
                              data-agent-id={`ad-agent-recommended-services-${reqDoc.requestId}`}
                              data-testid={`ad-agent-recommended-services-${reqDoc.requestId}`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                                <div>
                                  <h5 className="font-mono text-xs font-bold uppercase tracking-wider text-tertiary flex items-center gap-1.5">
                                    <Icon name="sparkles" className="size-3.5 text-tertiary" />
                                    <span>Recommended Services</span>
                                  </h5>
                                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                                    Select recommended creative or production services below. Checked services and notes are automatically included with your Strategy Package.
                                  </p>
                                </div>
                              </div>

                              {/* 1. Custom Ad Graphic Art */}
                              <div className="rounded-lg border border-white/10 bg-surface-container-low p-3 space-y-2.5">
                                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={recGraphicArtEnabled}
                                    onChange={(e) => setRecGraphicArtEnabled(e.target.checked)}
                                    data-agent-id={`rec-graphic-art-checkbox-${reqDoc.requestId}`}
                                    data-testid={`rec-graphic-art-checkbox-${reqDoc.requestId}`}
                                    className="size-4 rounded border-white/20 bg-surface-container-lowest text-primary focus:ring-primary"
                                  />
                                  <span className="font-mono text-xs font-bold text-on-surface">
                                    Custom Ad Graphic Art
                                  </span>
                                </label>

                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                                  <div className="sm:col-span-6">
                                    <label className="block font-mono text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">
                                      What May Be Needed
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="e.g. 3x 4:5 static hero graphics + carousel cards"
                                      value={recGraphicArtNeeded}
                                      onChange={(e) => {
                                        setRecGraphicArtNeeded(e.target.value);
                                        if (e.target.value.trim() && !recGraphicArtEnabled) {
                                          setRecGraphicArtEnabled(true);
                                        }
                                      }}
                                      data-agent-id={`rec-graphic-art-needed-${reqDoc.requestId}`}
                                      data-testid={`rec-graphic-art-needed-${reqDoc.requestId}`}
                                      className={`${field} py-1.5 text-xs`}
                                    />
                                  </div>
                                  <div className="sm:col-span-3">
                                    <label className="block font-mono text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">
                                      Service Provider
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="e.g. Studio Name / Agent"
                                      value={recGraphicArtProvider}
                                      onChange={(e) => {
                                        setRecGraphicArtProvider(e.target.value);
                                        if (e.target.value.trim() && !recGraphicArtEnabled) {
                                          setRecGraphicArtEnabled(true);
                                        }
                                      }}
                                      data-agent-id={`rec-graphic-art-provider-${reqDoc.requestId}`}
                                      data-testid={`rec-graphic-art-provider-${reqDoc.requestId}`}
                                      className={`${field} py-1.5 text-xs`}
                                    />
                                  </div>
                                  <div className="sm:col-span-3">
                                    <label className="block font-mono text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">
                                      Price (Optional)
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="e.g. $250 AUD (optional)"
                                      value={recGraphicArtPrice}
                                      onChange={(e) => {
                                        setRecGraphicArtPrice(e.target.value);
                                        if (e.target.value.trim() && !recGraphicArtEnabled) {
                                          setRecGraphicArtEnabled(true);
                                        }
                                      }}
                                      data-agent-id={`rec-graphic-art-price-${reqDoc.requestId}`}
                                      data-testid={`rec-graphic-art-price-${reqDoc.requestId}`}
                                      className={`${field} py-1.5 text-xs font-mono`}
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* 2. Custom Video Work */}
                              <div className="rounded-lg border border-white/10 bg-surface-container-low p-3 space-y-2.5">
                                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={recVideoWorkEnabled}
                                    onChange={(e) => setRecVideoWorkEnabled(e.target.checked)}
                                    data-agent-id={`rec-video-work-checkbox-${reqDoc.requestId}`}
                                    data-testid={`rec-video-work-checkbox-${reqDoc.requestId}`}
                                    className="size-4 rounded border-white/20 bg-surface-container-lowest text-primary focus:ring-primary"
                                  />
                                  <span className="font-mono text-xs font-bold text-on-surface">
                                    Custom Video Work
                                  </span>
                                </label>

                                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                                  <div className="sm:col-span-6">
                                    <label className="block font-mono text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">
                                      What May Be Needed
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="e.g. 3x 15s vertical UGC reels with captions & hooks"
                                      value={recVideoWorkNeeded}
                                      onChange={(e) => {
                                        setRecVideoWorkNeeded(e.target.value);
                                        if (e.target.value.trim() && !recVideoWorkEnabled) {
                                          setRecVideoWorkEnabled(true);
                                        }
                                      }}
                                      data-agent-id={`rec-video-work-needed-${reqDoc.requestId}`}
                                      data-testid={`rec-video-work-needed-${reqDoc.requestId}`}
                                      className={`${field} py-1.5 text-xs`}
                                    />
                                  </div>
                                  <div className="sm:col-span-3">
                                    <label className="block font-mono text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">
                                      Service Provider
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="e.g. Video Creator / Agency"
                                      value={recVideoWorkProvider}
                                      onChange={(e) => {
                                        setRecVideoWorkProvider(e.target.value);
                                        if (e.target.value.trim() && !recVideoWorkEnabled) {
                                          setRecVideoWorkEnabled(true);
                                        }
                                      }}
                                      data-agent-id={`rec-video-work-provider-${reqDoc.requestId}`}
                                      data-testid={`rec-video-work-provider-${reqDoc.requestId}`}
                                      className={`${field} py-1.5 text-xs`}
                                    />
                                  </div>
                                  <div className="sm:col-span-3">
                                    <label className="block font-mono text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">
                                      Price (Optional)
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="e.g. $450 AUD (optional)"
                                      value={recVideoWorkPrice}
                                      onChange={(e) => {
                                        setRecVideoWorkPrice(e.target.value);
                                        if (e.target.value.trim() && !recVideoWorkEnabled) {
                                          setRecVideoWorkEnabled(true);
                                        }
                                      }}
                                      data-agent-id={`rec-video-work-price-${reqDoc.requestId}`}
                                      data-testid={`rec-video-work-price-${reqDoc.requestId}`}
                                      className={`${field} py-1.5 text-xs font-mono`}
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* 3. Other Recommended Services (Short Paragraph Box) */}
                              <div className="rounded-lg border border-white/10 bg-surface-container-low p-3 space-y-1.5">
                                <label
                                  htmlFor={`rec-other-services-notes-${reqDoc.requestId}`}
                                  className="block font-mono text-[10px] font-bold uppercase tracking-wider text-on-surface"
                                >
                                  Other Recommended Services, Who Provides Them &amp; Estimate Pricing (Optional)
                                </label>
                                <textarea
                                  id={`rec-other-services-notes-${reqDoc.requestId}`}
                                  rows={3}
                                  maxLength={1500}
                                  placeholder="Write a short paragraph on any other recommended services (e.g. landing page CRO, copywriting, media buying), who provides them, and estimate pricing (optional)..."
                                  value={recOtherServicesNotes}
                                  onChange={(e) => setRecOtherServicesNotes(e.target.value)}
                                  data-agent-id={`rec-other-services-notes-${reqDoc.requestId}`}
                                  data-testid={`rec-other-services-notes-${reqDoc.requestId}`}
                                  className={`${field} text-xs leading-relaxed`}
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setActiveReplyRequestId(null)}
                                className={btnSecondary}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={sendingReply || !replyBody.trim()}
                                onClick={() => handleSendCustomizeReply(reqDoc)}
                                data-agent-id={`ad-agent-send-reply-${reqDoc.requestId}`}
                                data-testid={`ad-agent-send-reply-${reqDoc.requestId}`}
                                className={btnPrimary}
                              >
                                {sendingReply ? "Sending Strategy..." : "Send Completed Strategy to Customer"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
