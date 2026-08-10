/**
 * Schema barrel. Re-exports every domain model + the relation graph so the
 * single entry point stays `@/db/schema` for drizzle-kit, the Drizzle client
 * (`@/db`) and the Better Auth adapter. Add new domains under `db/models/*`
 * and export them here.
 */

export * from "./models/auth";
export * from "./models/competition";
export * from "./models/crowdsource";
export * from "./models/enums";
export * from "./models/ingestion";
export * from "./models/participant";
export * from "./models/reference";
export * from "./models/result";
export * from "./relations";
