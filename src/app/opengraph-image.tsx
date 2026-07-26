import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { ImageResponse } from "next/og";
import { siteConfig } from "@/data/site";

export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

// Branded social share image, generated at build time from siteConfig.
// Matches the site favicon: the real orange "JP's" logo on a clean white card.
export default async function OpengraphImage() {
  // Colocated asset. Referencing it via `new URL(..., import.meta.url)` makes
  // Next trace the file into the serverless bundle; we then read it from disk
  // (fetch can't load file:// URLs on the Node runtime).
  const logoPath = fileURLToPath(new URL("./og-logo.png", import.meta.url));
  const logo = await readFile(logoPath);
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          fontFamily: "sans-serif",
          padding: "64px 72px",
          textAlign: "center",
        }}
      >
        <img src={logoSrc} width={560} height={311} alt="" style={{ objectFit: "contain" }} />
        <div
          style={{
            marginTop: 8,
            fontSize: 78,
            fontWeight: 800,
            letterSpacing: "1px",
            lineHeight: 1,
            color: "#1f2430",
            display: "flex",
          }}
        >
          HOT CHICKEN
        </div>
        <div
          style={{
            marginTop: 26,
            fontSize: 34,
            fontWeight: 600,
            color: "#ff6200",
            display: "flex",
          }}
        >
          {siteConfig.tagline}
        </div>
        <div
          style={{
            marginTop: 26,
            fontSize: 27,
            color: "#6b7280",
            display: "flex",
          }}
        >
          {siteConfig.locations.map((loc) => `${loc.city}, ${loc.state}`).join("  •  ")}
        </div>
        {/* Brand accent bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: 16,
            background: "#ff6200",
            display: "flex",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
