import { ImageResponse } from "next/og";

import { PSL_MARK } from "@/lib/branding";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: PSL_MARK.navy,
          borderRadius: 36,
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            color: PSL_MARK.white,
            letterSpacing: "0.12em",
            fontFamily:
              "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
            marginTop: -6,
          }}
        >
          PSL
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 22,
            left: 28,
            right: 28,
            height: 6,
            background: PSL_MARK.ice,
            borderRadius: 3,
          }}
        />
      </div>
    ),
    { ...size }
  );
}
