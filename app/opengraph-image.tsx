import { ImageResponse } from "next/og";

import { PSL_MARK, SITE_TITLE } from "@/lib/branding";

export const alt = SITE_TITLE;
export const size = { width: 1200, height: 630 };
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
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "72px 88px",
          background: `linear-gradient(135deg, ${PSL_MARK.navy} 0%, ${PSL_MARK.deepBlue} 55%, ${PSL_MARK.accentBlue} 100%)`,
          position: "relative",
        }}
      >
        {/* Soft ice accents */}
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -60,
            width: 360,
            height: 360,
            borderRadius: 999,
            background: PSL_MARK.ice,
            opacity: 0.08,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -120,
            left: 180,
            width: 420,
            height: 420,
            borderRadius: 999,
            background: PSL_MARK.ice,
            opacity: 0.06,
          }}
        />

        {/* Logo mark */}
        <div
          style={{
            display: "flex",
            width: 96,
            height: 96,
            borderRadius: 20,
            background: PSL_MARK.navy,
            border: `1px solid rgba(56, 189, 248, 0.35)`,
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            marginBottom: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 36,
              fontWeight: 700,
              color: PSL_MARK.white,
              letterSpacing: "0.14em",
              fontFamily:
                "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
            }}
          >
            PSL
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: 14,
              right: 14,
              height: 4,
              background: PSL_MARK.ice,
              borderRadius: 2,
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            color: PSL_MARK.white,
            letterSpacing: "-0.03em",
            fontFamily:
              "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
            lineHeight: 1.05,
          }}
        >
          PSL Labs
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 18,
            fontSize: 32,
            fontWeight: 500,
            color: "rgba(186, 230, 253, 0.92)",
            letterSpacing: "0.04em",
            fontFamily:
              "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          }}
        >
          Research Peptides
        </div>
      </div>
    ),
    { ...size }
  );
}
