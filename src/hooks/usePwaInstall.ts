"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export type PlatformType = "desktop_chrome" | "android" | "ios" | "other";

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function getSnapshot(): boolean {
  return deferredPrompt !== null;
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function usePwaInstall() {
  const [platform, setPlatform] = useState<PlatformType>("desktop_chrome");
  const [isInstalled, setIsInstalled] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const canPrompt = useSyncExternalStore(subscribe, getSnapshot, () => false);

  useEffect(() => {
    // Detect platform
    const ua = navigator.userAgent || "";
    const isIos =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);

    if (isIos) {
      setPlatform("ios");
    } else if (isAndroid) {
      setPlatform("android");
    } else {
      setPlatform("desktop_chrome");
    }

    // Detect if already running in standalone mode (PWA installed)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    function handleDisplayModeChange(e: MediaQueryListEvent) {
      setIsInstalled(e.matches);
    }
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    mediaQuery.addEventListener("change", handleDisplayModeChange);

    // Register service worker if supported
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => {
          // Service worker registered
        })
        .catch((err) => {
          console.warn("[pwa] SW registration failed:", err);
        });
    }

    // Listen for beforeinstallprompt event (Chromium desktop & Android)
    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      notify();
    }

    function handleAppInstalled() {
      deferredPrompt = null;
      setIsInstalled(true);
      notify();
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      mediaQuery.removeEventListener("change", handleDisplayModeChange);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function triggerInstall(): Promise<boolean> {
    if (!deferredPrompt) {
      // If native prompt is unavailable (e.g. iOS or manual install), open guide modal
      setIsModalOpen(true);
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        deferredPrompt = null;
        setIsInstalled(true);
        notify();
        setIsModalOpen(false);
        return true;
      }
      return false;
    } catch (err) {
      console.warn("[pwa] prompt error:", err);
      setIsModalOpen(true);
      return false;
    }
  }

  return {
    platform,
    isInstalled,
    canPrompt,
    isModalOpen,
    openModal: () => setIsModalOpen(true),
    closeModal: () => setIsModalOpen(false),
    triggerInstall,
  };
}

