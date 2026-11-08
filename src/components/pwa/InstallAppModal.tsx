"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { btnPrimary, btnSecondary } from "@/components/ui/styles";
import { usePwaInstall, type PlatformType } from "@/hooks/usePwaInstall";

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InstallAppModal({ isOpen, onClose }: InstallAppModalProps) {
  const isClient = useIsClient();
  const { platform, isInstalled, canPrompt, triggerInstall } = usePwaInstall();
  const [activeDevice, setActiveDevice] = useState<PlatformType>("desktop_chrome");
  const [installing, setInstalling] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);

  useEffect(() => {
    if (platform) {
      setActiveDevice(platform);
    }
  }, [platform]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !isClient) return null;

  async function handleDirectInstall() {
    setInstalling(true);
    const success = await triggerInstall();
    setInstalling(false);
    if (success) {
      setInstalledSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1800);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-app-dialog-title"
      data-agent-id="install-app-modal"
      data-testid="install-app-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-xl flex-col rounded-3xl border border-white/10 bg-[#0e111a] shadow-2xl overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4 bg-[#141722]/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8083ff]/20 to-[#7bd0ff]/20 border border-[#8083ff]/30 text-primary">
              <Icon name="download" className="size-5 text-[#8083ff]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="install-app-dialog-title" className="text-title-sm sm:text-title-md font-bold text-on-surface">
                  Download AdRadarHQ App
                </h2>
                {isInstalled && (
                  <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                    Installed
                  </span>
                )}
              </div>
              <p className="text-xs text-on-surface-variant font-mono">
                Install on Chrome Laptop/Desktop, Android, and iPhone
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close download modal"
            data-agent-id="close-install-modal-btn"
            data-testid="close-install-modal-btn"
            className="flex size-8 items-center justify-center rounded-xl text-on-surface-variant transition hover:bg-white/[0.06] hover:text-on-surface"
          >
            <Icon name="x" className="size-4" />
          </button>
        </div>

        {/* Device Switcher Tabs */}
        <div className="flex items-center border-b border-white/[0.08] bg-[#10131d] px-3 py-2 gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveDevice("desktop_chrome")}
            data-agent-id="tab-device-desktop"
            data-testid="tab-device-desktop"
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-xs font-semibold transition ${
              activeDevice === "desktop_chrome"
                ? "bg-primary/20 border border-primary/40 text-primary"
                : "text-on-surface-variant hover:text-on-surface hover:bg-white/[0.04]"
            }`}
          >
            <Icon name="monitor" className="size-3.5" />
            <span>Chrome (Laptop/PC)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveDevice("android")}
            data-agent-id="tab-device-android"
            data-testid="tab-device-android"
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-xs font-semibold transition ${
              activeDevice === "android"
                ? "bg-primary/20 border border-primary/40 text-primary"
                : "text-on-surface-variant hover:text-on-surface hover:bg-white/[0.04]"
            }`}
          >
            <Icon name="smartphone" className="size-3.5" />
            <span>Android</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveDevice("ios")}
            data-agent-id="tab-device-ios"
            data-testid="tab-device-ios"
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-xs font-semibold transition ${
              activeDevice === "ios"
                ? "bg-primary/20 border border-primary/40 text-primary"
                : "text-on-surface-variant hover:text-on-surface hover:bg-white/[0.04]"
            }`}
          >
            <Icon name="smartphone" className="size-3.5" />
            <span>iPhone / iPad</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {installedSuccess ? (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center space-y-3">
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
                <Icon name="checkCircle" className="size-6" />
              </span>
              <h3 className="text-title-sm font-bold text-emerald-300">
                AdRadarHQ App Successfully Installed!
              </h3>
              <p className="text-xs text-on-surface-variant">
                You can now launch AdRadarHQ directly from your desktop, taskbar, or home screen with instant ad spy performance.
              </p>
            </div>
          ) : (
            <>
              {/* TAB 1: DESKTOP CHROME */}
              {activeDevice === "desktop_chrome" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-primary/20 bg-primary/[0.05] p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
                        <Icon name="monitor" className="size-4" />
                      </span>
                      <h3 className="text-sm font-bold text-on-surface">
                        Google Chrome on Laptop &amp; Desktop
                      </h3>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      Install AdRadarHQ as a standalone desktop app on macOS, Windows, Linux, or ChromeOS. It launches in its own dedicated window without browser tab clutter.
                    </p>
                  </div>

                  {canPrompt ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={handleDirectInstall}
                        disabled={installing}
                        data-agent-id="install-pwa-direct-btn"
                        data-testid="install-pwa-direct-btn"
                        className={`${btnPrimary} w-full py-3 justify-center gap-2 text-sm font-bold shadow-lg shadow-primary/20`}
                      >
                        <Icon name="download" className="size-4" />
                        <span>{installing ? "Installing App…" : "1-Click Install for Chrome Desktop"}</span>
                      </button>
                      <p className="text-[11px] text-center text-on-surface-variant font-mono">
                        Clicking install adds AdRadarHQ directly to your Applications / Desktop.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/[0.08] bg-surface-container-high/40 p-4 space-y-3">
                      <h4 className="text-xs font-bold text-on-surface uppercase font-mono tracking-wider">
                        How to Install via Chrome Address Bar:
                      </h4>
                      <ol className="space-y-2.5 text-xs text-on-surface-variant">
                        <li className="flex items-start gap-2.5">
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 font-mono text-[11px] font-bold text-primary">
                            1
                          </span>
                          <span>
                            Look at the right side of the <strong>Google Chrome address bar</strong> (next to the bookmark star ⭐️).
                          </span>
                        </li>
                        <li className="flex items-start gap-2.5">
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 font-mono text-[11px] font-bold text-primary">
                            2
                          </span>
                          <span>
                            Click the <strong>Install icon (monitor with down arrow ⤓)</strong>.
                          </span>
                        </li>
                        <li className="flex items-start gap-2.5">
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 font-mono text-[11px] font-bold text-primary">
                            3
                          </span>
                          <span>
                            Click <strong>Install</strong> to add AdRadarHQ to your dock, taskbar, and desktop.
                          </span>
                        </li>
                      </ol>

                      <div className="rounded-xl border border-white/[0.06] bg-black/20 p-2.5 text-[11px] text-on-surface-variant font-mono">
                        💡 <strong>Alternative:</strong> Click Chrome Menu <strong>(⋮)</strong> → <strong>Cast, save, and share</strong> → <strong>Install AdRadarHQ…</strong>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: ANDROID */}
              {activeDevice === "android" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-primary/20 bg-primary/[0.05] p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
                        <Icon name="smartphone" className="size-4" />
                      </span>
                      <h3 className="text-sm font-bold text-on-surface">
                        Android (Samsung Galaxy, Google Pixel, etc.)
                      </h3>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      Install AdRadarHQ directly on your Android phone or tablet. Works just like a native app from Google Play, running in full screen with zero URL bar.
                    </p>
                  </div>

                  {canPrompt && (
                    <button
                      type="button"
                      onClick={handleDirectInstall}
                      disabled={installing}
                      data-agent-id="install-pwa-android-btn"
                      data-testid="install-pwa-android-btn"
                      className={`${btnPrimary} w-full py-3 justify-center gap-2 text-sm font-bold shadow-lg shadow-primary/20`}
                    >
                      <Icon name="download" className="size-4" />
                      <span>{installing ? "Installing on Android…" : "1-Click Install for Android"}</span>
                    </button>
                  )}

                  <div className="rounded-2xl border border-white/[0.08] bg-surface-container-high/40 p-4 space-y-3">
                    <h4 className="text-xs font-bold text-on-surface uppercase font-mono tracking-wider">
                      Steps to Install in Chrome for Android:
                    </h4>
                    <ol className="space-y-2.5 text-xs text-on-surface-variant">
                      <li className="flex items-start gap-2.5">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 font-mono text-[11px] font-bold text-primary">
                          1
                        </span>
                        <span>
                          Open <strong>socialradar.aifoundation.net.au</strong> in Chrome on your Android device.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 font-mono text-[11px] font-bold text-primary">
                          2
                        </span>
                        <span>
                          Tap the <strong>three dots menu (⋮)</strong> in the top-right corner.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 font-mono text-[11px] font-bold text-primary">
                          3
                        </span>
                        <span>
                          Tap <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 font-mono text-[11px] font-bold text-primary">
                          4
                        </span>
                        <span>
                          Confirm by tapping <strong>Install</strong>. The AdRadarHQ icon appears on your home screen!
                        </span>
                      </li>
                    </ol>
                  </div>
                </div>
              )}

              {/* TAB 3: IPHONE / IPAD (IOS) */}
              {activeDevice === "ios" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-primary/20 bg-primary/[0.05] p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
                        <Icon name="smartphone" className="size-4" />
                      </span>
                      <h3 className="text-sm font-bold text-on-surface">
                        Apple iPhone &amp; iPad (iOS Safari &amp; Chrome)
                      </h3>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      Apple iOS allows you to install AdRadarHQ directly to your Home Screen without going through the App Store. It runs in full-screen standalone mode.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/[0.08] bg-surface-container-high/40 p-4 space-y-3.5">
                    <h4 className="text-xs font-bold text-on-surface uppercase font-mono tracking-wider">
                      3 Simple Steps to Add to iPhone Home Screen:
                    </h4>

                    <div className="space-y-3">
                      <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/20 font-mono text-xs font-bold text-primary">
                          1
                        </span>
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                            <span>Tap the <strong>Share</strong> button</span>
                            <span className="inline-flex items-center justify-center rounded bg-white/10 px-1.5 py-0.5 text-primary">
                              <Icon name="share" className="size-3" />
                            </span>
                          </p>
                          <p className="text-[11px] text-on-surface-variant">
                            In Safari, find it in the bottom navigation bar. In Chrome on iOS, find it at the top right of the URL bar.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/20 font-mono text-xs font-bold text-primary">
                          2
                        </span>
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-on-surface">
                            Scroll down and tap <strong>&quot;Add to Home Screen&quot; ⊕</strong>
                          </p>
                          <p className="text-[11px] text-on-surface-variant">
                            This creates the official AdRadarHQ app launcher on your iOS device.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/20 font-mono text-xs font-bold text-primary">
                          3
                        </span>
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-on-surface">
                            Tap <strong>&quot;Add&quot;</strong> in the top-right corner
                          </p>
                          <p className="text-[11px] text-on-surface-variant">
                            AdRadarHQ will appear on your iPhone screen with our high-resolution icon!
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* App Features List */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <Icon name="checkCircle" className="size-3.5 shrink-0" />
                    <span>Instant Launch</span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    Fast loading without opening browser tabs
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <Icon name="checkCircle" className="size-3.5 shrink-0" />
                    <span>Full-Screen Ad Spy</span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    No browser bars, 100% focused workspace
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.08] px-5 py-3.5 bg-[#141722]/80">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[11px] text-on-surface-variant">
              AdRadarHQ PWA · Universal Web App
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-agent-id="done-install-modal-btn"
            data-testid="done-install-modal-btn"
            className={`${btnSecondary} text-xs font-mono`}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

