"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { Icon } from "@/components/ui/Icon";
import { alertError, alertInfo, btnPrimary, btnSecondary, field, label } from "@/components/ui/styles";

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
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      const res = await apiFetch<{ success: boolean; message: string; messageId: string }>(
        "/api/contact",
        {
          method: "POST",
          body: {
            subject: subject.trim(),
            body: body.trim(),
          },
        }
      );
      setSuccessMsg(res.message);
      setSubject("");
      setBody("");
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
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Centered Responsively */}
      <div className="relative z-10 flex w-full max-w-lg max-h-[calc(100dvh-1.5rem)] sm:max-h-[min(90vh,42rem)] flex-col rounded-2xl border border-white/[0.14] bg-surface-container-high shadow-2xl overflow-hidden my-auto">
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
                Direct plain-text communication (7-Year Secure Archive)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close message window"
            data-testid="close-contact-modal-button"
            className="flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-white/[0.08] hover:text-on-surface"
          >
            <Icon name="x" className="size-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {errorMsg && <p className={alertError}>{errorMsg}</p>}
          {successMsg && <p className={alertInfo}>{successMsg}</p>}

          {/* Compliance & Policy Notice */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[12px] text-on-surface-variant leading-relaxed">
            <div className="flex items-center gap-1.5 font-semibold text-primary mb-1">
              <Icon name="shield" className="size-3.5" />
              <span>Security & 7-Year Statutory Compliance Policy</span>
            </div>
            <p>
              Messages are archived for <strong>7 years</strong> in accordance with Australian statutory regulations.
              To maintain system safety and confidentiality, <strong>file attachments are strictly prohibited</strong>.
              Plain text messages only.
            </p>
          </div>

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
              rows={6}
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
              onClick={onClose}
              className={btnSecondary}
              data-testid="contact-cancel-button"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
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
      </div>
    </div>,
    document.body
  );
}
