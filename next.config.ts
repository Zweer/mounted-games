import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  /* config options here */
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);

// OpenNext (@opennextjs/cloudflare): wire local Cloudflare bindings into
// `next dev` so `getCloudflareContext()` resolves the D1/KV bindings during
// local development, matching the Workers runtime. No-op at build/deploy time.
// See lib/runtime/workers-env.ts and design.md Phase C (OpenNext fallback).
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();
