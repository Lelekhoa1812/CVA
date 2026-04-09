import type { NextConfig } from "next";

// Motivation vs Logic:
// Motivation: a deployment from the @cv-assistant scope may mount the app under a base path, so API routes must stay reachable.
// Logic: normalize the optional NEXT_PUBLIC_BASE_PATH, feed it to Next.js as the basePath, and keep the existing webpack tweaks intact.
function normalizeConfiguredBasePath(value?: string) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const trimmedTrailingSlash = trimmed.replace(/\/+$/, "");
  if (!trimmedTrailingSlash) return "";
  return trimmedTrailingSlash.startsWith("/") ? trimmedTrailingSlash : `/${trimmedTrailingSlash}`;
}

const configuredBasePath = normalizeConfiguredBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

const nextConfig: NextConfig = {
  ...(configuredBasePath ? { basePath: configuredBasePath } : {}),
  serverExternalPackages: ["mongoose"],
  webpack: (config) => {
    config.externals = [...(config.externals || []), "bcrypt"];
    return config;
  },
};

export default nextConfig;
