import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Brand mark for iOS home screens, generated at build time (same technique as
// opengraph-image.tsx). iOS rounds the corners itself.
export default function AppleIcon() {
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
          background: "linear-gradient(135deg, #1a1a1a 0%, #2a1010 55%, #c0291f 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 64, fontWeight: 800, color: "#ff5a4d", display: "flex" }}>
          JP&apos;s
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, marginTop: 2, display: "flex" }}>
          HOT
        </div>
      </div>
    ),
    { ...size },
  );
}
