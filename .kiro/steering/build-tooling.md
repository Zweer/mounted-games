# Build & Tooling

## Scripts

```bash
npm run dev           # next dev --turbopack
npm run build         # next build
npm run lint          # biome check .
npm run lint:fix      # biome check --write .
npm run db:push       # drizzle-kit push
npm run db:generate   # drizzle-kit generate
npm run db:studio     # drizzle-kit studio
npm test              # vitest
```

## Linting & Formatting

- **Biome** for lint + format (NOT ESLint/Prettier)
- Double quotes, semicolons, 2-space indent
- `components/ui/` excluded from linting (auto-generated shadcn)

## Package Manager

- **npm** only (no yarn, pnpm, bun)
- Lock file: `package-lock.json`
- Always use the latest stable version of each dependency at install time; check
  `npm outdated` before a release and bump.

## Database

- **Drizzle ORM** with `@neondatabase/serverless`
- Schema: one file per domain in `db/models/*.ts`, relation graph in `db/relations.ts`,
  re-exported by the barrel `db/schema.ts` (the entry point for drizzle-kit, `@/db` and
  Better Auth). Migrations output in `db/`.
- `drizzle-kit push` for development; `generate` + `migrate` for production
- Keep the schema **vendor-neutral Postgres** (no Neon/Supabase-specific features)
  so the DB stays portable.

## Git Hooks

- **lefthook** pre-commit: biome, lockfile-lint, typecheck
- **commitlint** for conventional commit messages
