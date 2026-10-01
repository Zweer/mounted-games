import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext Cloudflare adapter config.
 *
 * Adapts the standard `next build` output to a Cloudflare Worker — this is the
 * whole point of the ViNext -> OpenNext fallback (design.md Phase C): the app's
 * `app/[locale]`-as-root + next-intl structure is preserved verbatim, no
 * app-code change. Incremental-cache / tag-cache overrides are left at their
 * defaults for this migration (no ISR in this app yet); they can be wired to
 * KV / R2 in Phase D alongside the poller idle gate if needed.
 */
export default defineCloudflareConfig();
