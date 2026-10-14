// Sent on every response. Nothing here restricts what the app itself loads
// (no CSP — Next's inline bootstrap and Vercel Analytics would need nonces);
// these only close the cheap doors: MIME sniffing, being framed by another
// site, leaking full share-link URLs (?gm= carries a whole offseason) to
// third parties, and browser features the site never uses.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Engine + data are shipped as TS source from the workspace; let Next compile them.
  transpilePackages: ["@apron/cba-engine", "@apron/data"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
