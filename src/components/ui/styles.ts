// Shared Tailwind class strings so buttons, cards and fields look the same everywhere.
// Controls are 44px tall on phones (touch targets) and 32px on larger screens.

export const page = "mx-auto w-full max-w-6xl space-y-6 px-3 py-5 sm:px-6 sm:py-8";

export const card = "rounded-xl border border-white/[0.08] bg-surface-container-low p-4 sm:p-5";

export const monoLabel = "font-mono text-mono-label uppercase text-outline";

const btn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded px-4 text-body font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-container disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-8 sm:px-3";
export const btnPrimary = `${btn} border-t border-white/20 bg-primary text-on-primary shadow-[0_0_16px_rgba(192,193,255,0.25)] hover:bg-primary-fixed`;
export const btnSecondary = `${btn} border border-white/[0.08] bg-white/[0.03] text-on-surface hover:bg-white/[0.08]`;
export const btnDanger = `${btn} text-error hover:bg-error-container/30`;

export const label = "block text-body font-medium text-on-surface";
export const hint = "mt-1 text-compact text-outline";
// 16px text on phones stops iOS Safari zooming into focused inputs.
export const field =
  "mt-1.5 block w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 text-base text-on-surface outline-none transition placeholder:text-outline focus:border-primary-container focus:ring-1 focus:ring-primary-container sm:py-2 sm:text-body";
export const fieldError = "mt-1 text-compact text-error";

export const alertError = "rounded-lg border border-error/30 bg-error-container/20 px-4 py-3 text-body text-on-error-container";
export const alertSuccess = "rounded-lg border border-winner/30 bg-winner/10 px-4 py-3 text-body text-winner-soft";
export const alertInfo = "rounded-lg border border-white/10 bg-surface-container px-4 py-3 text-body text-on-surface-variant";
