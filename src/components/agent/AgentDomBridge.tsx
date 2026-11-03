"use client";

import { useEffect } from "react";
import {
  AGENT_TASK_DEFINITIONS,
  clickAgentElement,
  detectUserIntent,
  evaluateTaskReadiness,
  fillAgentElement,
  getLiveDomState,
  preCheckElement,
  waitForLayoutStability,
} from "@/lib/dom-agent-bridge";

declare global {
  interface Window {
    __AD_RADAR_AGENT__?: {
      version: string;
      tasks: typeof AGENT_TASK_DEFINITIONS;
      detectUserIntent: typeof detectUserIntent;
      evaluateTaskReadiness: typeof evaluateTaskReadiness;
      preCheckElement: typeof preCheckElement;
      waitForLayoutStability: typeof waitForLayoutStability;
      click: typeof clickAgentElement;
      fill: typeof fillAgentElement;
      getLiveState: typeof getLiveDomState;
    };
  }
}

/**
 * Synchronizes `data-agent-id`, `data-testid`, and `aria-label` on any dynamically
 * mounted interactive elements (such as admin modals or popovers) with zero visual impact.
 */
function ensureInteractiveDomAttributes(root: ParentNode = document) {
  const interactives = root.querySelectorAll<HTMLElement>(
    "button, a[href], input, select, textarea, [role='button'], [role='tab'], [role='radio'], [role='switch']",
  );

  interactives.forEach((el, index) => {
    const existingAgentId = el.getAttribute("data-agent-id");
    const existingTestId = el.getAttribute("data-testid");

    if (existingAgentId && !existingTestId) {
      el.setAttribute("data-testid", existingAgentId);
    } else if (existingTestId && !existingAgentId) {
      el.setAttribute("data-agent-id", existingTestId);
    } else if (!existingAgentId && !existingTestId) {
      const labelSource =
        el.getAttribute("aria-label") ||
        el.getAttribute("id") ||
        el.getAttribute("name") ||
        el.getAttribute("placeholder") ||
        el.textContent?.trim().slice(0, 32) ||
        `${el.tagName.toLowerCase()}-${index}`;
      const slug = labelSource
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const derivedId = `auto-${el.tagName.toLowerCase()}-${slug || index}`;
      el.setAttribute("data-agent-id", derivedId);
      el.setAttribute("data-testid", derivedId);
    }

    if (!el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby")) {
      const fallbackLabel =
        el.getAttribute("title") ||
        el.getAttribute("placeholder") ||
        el.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ||
        el.getAttribute("data-agent-id");
      if (fallbackLabel) {
        el.setAttribute("aria-label", fallbackLabel);
      }
    }
  });
}

/**
 * Non-visual headless DOM Agent Bridge.
 * Leaves the visual UI 100% untouched while exposing structured task discovery,
 * clarifying-question slot evaluation, and verified DOM actions to AI assistants.
 */
export function AgentDomBridge() {
  useEffect(() => {
    window.__AD_RADAR_AGENT__ = {
      version: "1.0.0",
      tasks: AGENT_TASK_DEFINITIONS,
      detectUserIntent,
      evaluateTaskReadiness,
      preCheckElement,
      waitForLayoutStability,
      click: clickAgentElement,
      fill: fillAgentElement,
      getLiveState: getLiveDomState,
    };

    ensureInteractiveDomAttributes(document);

    const observer = new MutationObserver(() => {
      ensureInteractiveDomAttributes(document);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <script
      id="ad-radar-agent-manifest"
      type="application/json"
      data-agent-id="ad-radar-agent-manifest"
      data-testid="ad-radar-agent-manifest"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          version: "1.0.0",
          domReady: true,
          tasks: AGENT_TASK_DEFINITIONS,
        }),
      }}
    />
  );
}
