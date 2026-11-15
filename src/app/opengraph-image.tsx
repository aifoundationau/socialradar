import { ImageResponse } from "next/og";
import { SEO_OG_IMAGE_ALT } from "@/lib/seo";

export const alt = SEO_OG_IMAGE_ALT;

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #0a0e17 0%, #131827 55%, #191d33 100%)",
          color: "#dfe2ef",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "rgba(128, 131, 255, 0.2)",
                border: "2px solid #8083ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#c0c1ff",
                fontSize: "22px",
                fontWeight: 700,
              }}
            >
              AR
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
              }}
            >
              <span
                style={{
                  fontSize: "26px",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "#ffffff",
                }}
              >
                AdRadarHQ
              </span>
              <span
                style={{
                  fontSize: "14px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#7bd0ff",
                }}
              >
                Ad Intelligence, Pay As You Go
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
            }}
          >
            <span
              style={{
                padding: "8px 16px",
                borderRadius: "999px",
                background: "rgba(168, 85, 247, 0.18)",
                border: "1px solid rgba(216, 180, 254, 0.35)",
                color: "#d8b4fe",
                fontSize: "16px",
                fontWeight: 600,
              }}
            >
              Meta
            </span>
            <span
              style={{
                padding: "8px 16px",
                borderRadius: "999px",
                background: "rgba(6, 182, 212, 0.18)",
                border: "1px solid rgba(103, 232, 249, 0.35)",
                color: "#67e8f9",
                fontSize: "16px",
                fontWeight: 600,
              }}
            >
              TikTok
            </span>
            <span
              style={{
                padding: "8px 16px",
                borderRadius: "999px",
                background: "rgba(59, 130, 246, 0.18)",
                border: "1px solid rgba(147, 197, 253, 0.35)",
                color: "#93c5fd",
                fontSize: "16px",
                fontWeight: 600,
              }}
            >
              Google &amp; YouTube
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            maxWidth: "980px",
          }}
        >
          <div
            style={{
              fontSize: "62px",
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              color: "#ffffff",
            }}
          >
            Model the ads that are already winning.
          </div>
          <div
            style={{
              fontSize: "26px",
              lineHeight: 1.4,
              color: "#c7c4d7",
            }}
          >
            Search 28+ &amp; 60+ day proven winners across Meta, TikTok, Google &amp; YouTube. Deconstruct top hooks and generate AI ad variations.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "24px",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            fontSize: "18px",
            color: "#908fa0",
          }}
        >
          <span>AI Creative Remix Studio • Local Ad Agents • Non-Expiring Tokens</span>
          <span style={{ color: "#c0c1ff", fontWeight: 600 }}>adradarhq.com</span>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
