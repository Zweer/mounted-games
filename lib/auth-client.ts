import { createAuthClient } from "better-auth/react";

/**
 * Browser-side Better Auth client. With no explicit `baseURL` it targets the
 * current origin, which is what we want for the monolith deployment.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
