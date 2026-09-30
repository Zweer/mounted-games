import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getEnv } from "@/lib/runtime/workers-env";

// Workers hold secrets on the request `env`, not `process.env`; fall back to
// `process.env` for local dev / Node. `db` is the runtime-aware handle (D1 on
// Workers, better-sqlite3 in dev/test) from `@/db`. NOTE: this runs at
// module-init, outside any request, so on Workers `getEnv()` returns an empty
// env here (OpenNext's getCloudflareContext has no context at init) and the
// `process.env` fallback supplies the config — set BETTER_AUTH_* as Worker vars.
const workerEnv = getEnv();

export const auth = betterAuth({
  baseURL: workerEnv.BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL,
  secret: workerEnv.BETTER_AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    // `role` and `status` back the crowdsourcing approval flow (later spec).
    // They are server-managed, so they are not accepted as sign-up input.
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "viewer",
        input: false,
      },
      status: {
        type: "string",
        required: false,
        defaultValue: "approved",
        input: false,
      },
    },
  },
  // Keep this last so Set-Cookie headers from server actions are handled.
  plugins: [nextCookies()],
});
