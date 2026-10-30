"use client";

import { useRef } from "react";
import type { BrandProfile, NormalizedAd, RemixDoc } from "@/lib/contracts";
import { Icon } from "@/components/ui/Icon";
import { btnSecondary } from "@/components/ui/styles";
import { variationLetter } from "./VariationEditor";

// ---------- CSV ----------
// Cells that start with = + - @ would run as formulas in Excel or Sheets, so they get a leading quote.
function cell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n");
  // The byte-order mark makes Excel read the file as UTF-8.
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Shortens at a word boundary to fit an ad platform's character limit. */
function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max + 1).replace(/\s+\S*$/, "");
  return (cut || flat.slice(0, max)).replace(/[\s,;:–-]+$/, "");
}

const META_CTAS: [RegExp, string][] = [
  [/shop|buy/i, "SHOP_NOW"],
  [/order/i, "ORDER_NOW"],
  [/claim|offer|deal|discount|% off|trial|save/i, "GET_OFFER"],
  [/sign ?up|join|register/i, "SIGN_UP"],
  [/subscribe/i, "SUBSCRIBE"],
  [/download|install|get the app/i, "DOWNLOAD"],
  [/apply/i, "APPLY_NOW"],
  [/contact|call|message/i, "CONTACT_US"],
];
const metaCta = (label: string) => META_CTAS.find(([re]) => re.test(label))?.[1] ?? "LEARN_MORE";

type ExportInput = { remix: RemixDoc; ad: NormalizedAd; brand: BrandProfile | null };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "remix";

const EXPORTS: { id: string; label: string; hint: string; build: (input: ExportInput) => { name: string; rows: string[][] } }[] = [
  {
    id: "meta",
    label: "Meta Ads Manager",
    hint: "One ad per variation (bulk import)",
    build: ({ remix, ad, brand }) => {
      const campaign = `AdRadar · ${brand?.brandName ?? "Remix"}`;
      return {
        name: "meta-ads",
        rows: [
          ["Campaign Name", "Ad Set Name", "Ad Name", "Title", "Body", "Link", "Call to Action"],
          ...remix.variations.map((v, i) => [
            campaign,
            `${ad.advertiserName || "Source"} remix`,
            `${variationLetter(i)} · ${v.angleName}`,
            clip(v.headline, 40),
            v.primaryCopy,
            brand?.destinationUrl ?? "",
            metaCta(v.ctaButton),
          ]),
        ],
      };
    },
  },
  {
    id: "google",
    label: "Google Ads Editor",
    hint: "Responsive search ad from all 3 angles",
    build: ({ remix, brand }) => {
      const headlines = remix.variations.flatMap((v) => [clip(v.headline, 30), clip(v.ctaButton, 30)]);
      const descriptions = remix.variations.map((v) => clip(v.primaryCopy, 90));
      return {
        name: "google-ads",
        rows: [
          [
            "Campaign",
            "Ad group",
            "Ad type",
            ...headlines.map((_, i) => `Headline ${i + 1}`),
            ...descriptions.map((_, i) => `Description ${i + 1}`),
            "Final URL",
          ],
          [`AdRadar · ${brand?.brandName ?? "Remix"}`, "Remix", "Responsive search ad", ...headlines, ...descriptions, brand?.destinationUrl ?? ""],
        ],
      };
    },
  },
  {
    id: "storyboard",
    label: "Production brief",
    hint: "Every beat of all 3 storyboards",
    build: ({ remix }) => ({
      name: "storyboard",
      rows: [
        ["Variation", "Angle", "Headline", "Primary copy", "CTA", "Timestamp", "Visual", "Voiceover", "On-screen text"],
        ...remix.variations.flatMap((v, i) =>
          v.videoStoryboard.map((b) => [
            variationLetter(i),
            v.angleName,
            v.headline,
            v.primaryCopy,
            v.ctaButton,
            b.timestamp,
            b.visualAction,
            b.spokenAudio,
            b.onScreenText,
          ]),
        ),
      ],
    }),
  },
];

/** Client-side CSV export of a remix for Meta and Google bulk imports, plus a production brief. */
export function CsvExportButton({ onExported, ...input }: ExportInput & { onExported: (label: string) => void }) {
  const menu = useRef<HTMLDivElement>(null);

  return (
    <>
      <button type="button" popoverTarget="csv-export-menu" className={`${btnSecondary} hover:border-secondary hover:text-secondary`}>
        <Icon name="download" className="text-secondary" />
        Export CSV
        <Icon name="chevronDown" className="size-3.5" />
      </button>
      <div
        id="csv-export-menu"
        ref={menu}
        popover="auto"
        className="inset-x-3 top-auto bottom-[calc(4.5rem+env(safe-area-inset-bottom))] m-0 w-auto rounded-xl border border-white/[0.12] bg-surface-container-high p-1 text-on-surface shadow-[0_12px_32px_-4px_rgba(0,0,0,0.6)] sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-80 sm:-translate-x-1/2 sm:-translate-y-1/2"
      >
        <p className="px-3 pt-2 pb-1 font-mono text-mono-label text-outline uppercase">Export as CSV</p>
        {EXPORTS.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => {
              const { name, rows } = e.build(input);
              downloadCsv(`adradar-${slug(input.ad.advertiserName)}-${name}.csv`, rows);
              menu.current?.hidePopover();
              onExported(`${e.label} CSV downloaded`);
            }}
            className="flex min-h-12 w-full flex-col items-start justify-center rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
          >
            <span className="text-body font-medium">{e.label}</span>
            <span className="text-compact text-on-surface-variant">{e.hint}</span>
          </button>
        ))}
        <p className="px-3 pt-1 pb-2 text-compact text-outline">Import into a draft and review before publishing.</p>
      </div>
    </>
  );
}
