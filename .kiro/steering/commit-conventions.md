# Commit Conventions

**IMPORTANT:** the agent NEVER commits, pushes, or creates tags. The developer handles
all git operations manually. At the end of each task, suggest a commit message.

## Format

Conventional commits with gitmoji as **text codes** (not emoji):

```
type(scope): :emoji_code: short description

Detailed explanation of what changed and why.
```

## Types

- `feat` — New feature (`:sparkles:`)
- `fix` — Bug fix (`:bug:`)
- `perf` — Performance (`:zap:`)
- `docs` — Documentation (`:memo:`)
- `chore` — Maintenance (`:wrench:`, `:arrow_up:`, `:bookmark:`)
- `refactor` — Refactoring (`:recycle:`)
- `test` — Tests (`:white_check_mark:`)
- `style` — Formatting (`:art:`)
- `ci` — CI/CD (`:construction_worker:`)
- `build` — Build system (`:hammer:`)

## Scope

Module or area affected, e.g. `ingest`, `scraper`, `poller`, `db`, `auth`,
`crowdsource`, `web`, `stats`. Optional for cross-cutting changes.

## Rules

- Always use text codes (`:sparkles:`), never actual emoji (✨)
- Always include a body explaining **what** and **why**
- Breaking changes: `!` after type/scope + `BREAKING CHANGE:` in the footer
