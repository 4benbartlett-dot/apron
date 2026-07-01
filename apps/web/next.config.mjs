/** @type {import('next').NextConfig} */
const nextConfig = {
  // Engine + data are shipped as TS source from the workspace; let Next compile them.
  transpilePackages: ["@apron/cba-engine", "@apron/data"],
};

export default nextConfig;
