"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { Icon } from "@/components/ui/Icon";
import { alertError, btnPrimary, btnSecondary, field, label } from "@/components/ui/styles";
import { LINK_URL_PATTERN, type AdminMessage } from "@/lib/contracts";

const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

interface ContactAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ContactAdminModal({ isOpen, onClose }: ContactAdminModalProps) {
  const isClient = useIsClient();
  const [activeTab, setActiveTab] = useState<"COMPOSE" | "HISTORY">("COMPOSE");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const switchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clearTimerRef = useRef<NodeJS.Timeout | null>(null);

  const hasLinks = LINK_URL_PATTERN.test(subject) || LINK_URL_PATTERN.test(body);

  useEffect(() => {
    return () => {
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        handleModalClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      loadHistory();
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function handleModalClose() {
    if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    setErrorMsg(null);
    setSuccessMsg(null);
    onClose();
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const data = await apiFetch<{ messages: AdminMessage[] }>("/api/contact", { method: "GET" });
      if (data.messages) setMessages(data.messages);
    } catch {
      // Quietly ignore history load failure
    } finally {
      setLoadingHistory(false);
    }
  }

  if (!isOpen || !isClient) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hasLinks) {
      setErrorMsg("Plain text only. Upload links, URLs, and file attachments are strictly prohibited.");
      return;
    }
    if (!subject.trim()) {
      setErrorMsg("Subject is required.");
      return;
    }
    if (!body.trim()) {
      setErrorMsg("Message body is required.");
      return;
    }

    setSending(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await apiFetch<{ success: boolean; message: string; messageId: string }>(
        "/api/contact",
        {
          method: "POST",
          body: {
            subject: subject.trim(),
            body: body.trim(),
          },
        }
      );
      setSuccessMsg("Message Sent");
      setSubject("");
      setBody("");
      await loadHistory();

      // Show quick 'Message Sent' confirmation, then navigate to 'My Messages' panel
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
      switchTimerRef.current = setTimeout(() => {
        setActiveTab("HISTORY");
      }, 800);

      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => {
        setSuccessMsg(null);
      }, 5000);
    } catch (err) {
      setErrorMsg(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-modal-title"
      data-testid="contact-admin-modal"
      data-agent-id="contact-admin-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={handleModalClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Centered Responsively */}
      <div className="relative z-10 flex w-full max-w-lg max-h-[calc(100dvh-1.5rem)] sm:max-h-[min(90vh,44rem)] flex-col rounded-2xl border border-white/[0.14] bg-surface-container-high shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.08] px-5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Icon name="sparkles" className="size-4" />
            </span>
            <div>
              <h2 id="contact-modal-title" className="text-title-sm font-bold text-on-surface">
                Message Super Admin
              </h2>
              <p className="text-[11px] text-on-surface-variant font-mono">
                Plain-text only (7-Year Compliance Archive, No Upload Links)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            aria-label="Close message window"
            data-testid="close-contact-modal-button"
            className="flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-white/[0.08] hover:text-on-surface"
          >
            <Icon name="x" className="size-5" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex border-b border-white/[0.08] bg-surface-container-low px-5 pt-2">
          <button
            type="button"
            data-testid="tab-compose-message"
            data-agent-id="tab-compose-message"
            onClick={() => {
              setActiveTab("COMPOSE");
              setErrorMsg(null);
            }}
            className={`border-b-2 px-4 py-2 font-mono text-xs font-semibold transition ${
              activeTab === "COMPOSE"
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Compose Message
          </button>
          <button
            type="button"
            data-testid="tab-my-messages"
            data-agent-id="tab-my-messages"
            onClick={() => {
              setActiveTab("HISTORY");
              setErrorMsg(null);
            }}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2 font-mono text-xs font-semibold transition ${
              activeTab === "HISTORY"
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span>My Messages</span>
            {messages.length > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] text-primary">
                {messages.length}
              </span>
            )}
          </button>
        </div>

        {/* Form Body */}
        {activeTab === "COMPOSE" ? (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
            {errorMsg && <p className={alertError}>{errorMsg}</p>}
            {successMsg && (
              <div
                role="status"
                aria-live="polite"
                data-testid="compose-message-sent-banner"
                className="flex items-center gap-2 rounded-xl border border-secondary/40 bg-secondary/15 px-3.5 py-2.5 text-xs font-semibold text-secondary animate-fadeIn"
              >
                <Icon name="checkCircle" className="size-4 shrink-0 text-secondary" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Compliance & Policy Notice */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[12px] text-on-surface-variant leading-relaxed">
              <div className="flex items-center gap-1.5 font-semibold text-primary mb-1">
                <Icon name="shield" className="size-3.5" />
                <span>Security & 7-Year Statutory Compliance Policy</span>
              </div>
              <p>
                Messages are archived for <strong>7 years</strong> in accordance with Australian statutory regulations.
                To maintain system security, <strong>file uploads and external URLs are strictly prohibited</strong>.
                Plain text messages only.
              </p>
            </div>

            {hasLinks && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-300">
                <p className="font-semibold">Upload links / URLs detected</p>
                <p className="mt-0.5">Please remove links or URLs from the message. Plain text communication only.</p>
              </div>
            )}

            <div>
              <label htmlFor="contact-subject" className={label}>
                Subject
              </label>
              <input
                id="contact-subject"
                type="text"
                required
                maxLength={150}
                placeholder="e.g. Account inquiry, token question, or feedback"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={field}
                data-testid="contact-subject-input"
                data-agent-id="contact-subject-input"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="contact-body" className={label}>
                  Message (Plain Text Only)
                </label>
                <span className="font-mono text-[11px] text-on-surface-variant">
                  {body.length} / 2000
                </span>
              </div>
              <textarea
                id="contact-body"
                required
                rows={5}
                maxLength={2000}
                placeholder="Type your message to the Super Admin here..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className={`${field} font-sans leading-relaxed`}
                data-testid="contact-body-textarea"
                data-agent-id="contact-body-textarea"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={handleModalClose}
                className={btnSecondary}
                data-testid="contact-cancel-button"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending || hasLinks}
                className={btnPrimary}
                data-testid="contact-submit-button"
                data-agent-id="contact-submit-btn"
              >
                {sending ? (
                  <>
                    <Icon name="refresh" className="size-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Icon name="sparkles" className="size-4" />
                    Send Message
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div
            data-testid="my-messages-panel"
            data-agent-id="my-messages-panel"
            className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3"
          >
            {successMsg && (
              <div
                role="status"
                aria-live="polite"
                data-testid="my-messages-sent-banner"
                className="flex items-center gap-2 rounded-xl border border-secondary/40 bg-secondary/15 px-3.5 py-2.5 text-xs font-semibold text-secondary animate-fadeIn"
              >
                <Icon name="checkCircle" className="size-4 shrink-0 text-secondary" />
                <span>{successMsg}</span>
              </div>
            )}
            {loadingHistory ? (
              <div className="flex h-40 items-center justify-center text-on-surface-variant font-mono text-xs">
                <Icon name="refresh" className="size-4 animate-spin mr-2" />
                Loading message history…
              </div>
            ) : messages.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-surface-container-low p-8 text-center text-on-surface-variant text-sm">
                <p>No messages in your compliance history yet.</p>
                <p className="text-xs mt-1">Send a message to Super Admin using the Compose tab.</p>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.messageId}
                  className="rounded-xl border border-white/10 bg-surface-container-low p-3.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="font-semibold text-primary">
                      {m.direction === "admin_to_user" ? "Super Admin" : "You"}
                    </span>
                    <span className="text-on-surface-variant">
                      {new Date(m.createdAt).toLocaleDateString("en-AU")}
                    </span>
                  </div>
                  <h4 className="text-compact font-semibold text-on-surface">{m.subject}</h4>
                  <p className="text-compact text-on-surface-variant whitespace-pre-wrap leading-relaxed">
                    {m.body}
                  </p>
                  <div className="flex items-center justify-between pt-1 border-t border-white/[0.05] text-[10px] font-mono text-on-surface-variant">
                    <span>Status: {m.status}</span>
                    <span>Retained until {new Date(m.retentionUntil).toLocaleDateString("en-AU")}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
