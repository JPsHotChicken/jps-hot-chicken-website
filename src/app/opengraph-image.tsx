import { ImageResponse } from "next/og";
import { siteConfig } from "@/data/site";

export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Branded social share image, generated at build time from siteConfig.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1a1a1a 0%, #2a1010 60%, #c0291f 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
          padding: "80px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 110,
            fontWeight: 800,
            letterSpacing: "-2px",
            lineHeight: 1,
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          <span style={{ color: "#ff5a4d" }}>JP&apos;s&nbsp;</span>
          <span>Hot Chicken</span>
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 40,
            color: "rgba(255,255,255,0.85)",
            display: "flex",
          }}
        >
          {siteConfig.tagline}
        </div>
        <div
          style={{
            marginTop: 48,
            fontSize: 30,
            color: "rgba(255,255,255,0.7)",
            display: "flex",
          }}
        >
          {siteConfig.address.city}, {siteConfig.address.state}
        </div>
      </div>
    ),
    { ...size },
  );
}
