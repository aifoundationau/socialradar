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
 * Non-visual headless DOM Agent Bridge.
 * Renders null so SSR/hydration and the visual UI remain 100% untouched,
 * while exposing `window.__AD_RADAR_AGENT__` for AI assistant task discovery,
 * clarifying-question slot evaluation, and verified DOM actions.
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
  }, []);

  return null;
}
