import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
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
