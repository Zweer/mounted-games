# Setup Tasks

## T1 — Next.js scaffold
- [ ] `create-next-app` (App Router, Turbopack, TypeScript, Tailwind)
- [ ] Biome init + scripts (`lint`, `lint:fix`); exclude `components/ui/`
- [ ] Base layout, dark/light mode (system), mobile-first shell (TopBar/BottomNav placeholders)

## T2 — shadcn/ui
- [ ] `shadcn init`
- [ ] Install the base component set used by the shell

## T3 — Database (Neon + Drizzle)
- [ ] Install Drizzle + `@neondatabase/serverless`
- [ ] `drizzle.config.ts`, `db/index.ts` (connection), empty `db/schema.ts`
- [ ] Scripts: `db:push`, `db:generate`, `db:studio`

## T4 — Auth (Better Auth)
- [ ] Install Better Auth + Drizzle adapter
- [ ] Auth tables in `db/schema.ts` (user + `role`/`status`, session, account, verification)
- [ ] `auth.ts` server config, auth route handler, auth client
- [ ] `middleware.ts` protecting contributor/admin routes

## T5 — Dev tooling
- [ ] lefthook (biome, lockfile-lint, typecheck) + commitlint
- [ ] Vitest config + a smoke test
- [ ] `.env.example` (`DATABASE_URL`, Better Auth secrets, `CRON_SECRET`, source base URLs)

## T6 — Verify
- [ ] `npm run build` green
- [ ] `npm run lint` green
- [ ] `db:push` succeeds against Neon
- [ ] Suggest a commit message
