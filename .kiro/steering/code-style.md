# Code Style

## TypeScript

- Strict mode, no `any`, explicit return types on exported functions
- ES modules only
- `interface` for object shapes, `type` for unions/intersections
- Validate all external input (scraped data, request bodies, env) with Zod
- camelCase for variables/functions, PascalCase for types/classes
- kebab-case for file names

## Formatting

- Biome for lint + format (NOT ESLint/Prettier)
- Double quotes, semicolons
- 2-space indent
- `components/ui/` (shadcn, auto-generated) excluded from linting

## Testing

- Vitest, AAA pattern (Arrange, Act, Assert)
- Scrapers/parsers tested against **fixed HTML fixtures** (captured sample pages),
  never against the live sites
- Test files colocated as `*.test.ts` next to the module under test
