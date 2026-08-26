import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Canonical-host redirect: apex → www (defense-in-depth; Vercel's domain
  // config should also mark www.jpshotchicken.com as the primary domain).
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "jpshotchicken.com" }],
        destination: "https://www.jpshotchicken.com/:path*",
        permanent: true,
      },
      // The privacy policy lives at /privacy; /privacy-policy is the other name
      // people (and Google's ad reviewers) try, so it points at the same page
      // instead of 404ing.
      {
        source: "/privacy-policy",
        destination: "/privacy",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
