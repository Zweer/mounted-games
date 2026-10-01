import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  experimental: {
    // Enables `app/global-not-found.tsx`: a full-document 404 for URLs that
    // match no route at all (incl. invalid `[locale]` segments, where
    // `[locale]/layout.tsx` throws `notFound()` before its `<html>/<body>`
    // exists). Required flag per Next 16 docs
    // (node_modules/next/dist/docs/.../file-conventions/not-found.md).
    globalNotFound: true,
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);

// OpenNext (@opennextjs/cloudflare): wire local Cloudflare bindings into
// `next dev` so `getCloudflareContext()` resolves the D1/KV bindings during
// local development, matching the Workers runtime. No-op at build/deploy time.
// See lib/runtime/workers-env.ts and design.md Phase C (OpenNext fallback).
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();
