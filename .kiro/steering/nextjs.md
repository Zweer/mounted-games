<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ
from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before
writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Next.js Conventions

## App Router

- Server Components by default — `'use client'` only for event handlers, hooks, browser APIs
- Colocate `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` in the route folder
- Route Handlers in `app/api/` using `route.ts`

## Data Fetching

- Server Components fetch data directly (no `useEffect`)
- Live views (event pages): client polls our own `/api/...` endpoint every ~10-15s.
  Do NOT poll the third-party sources from the client — only the server poller does that.
- Always validate input with Zod

## Components Structure

```
components/
├── ui/         # shadcn (auto-generated, don't touch, not linted)
├── features/   # feature-specific (ScoreBoard, EventCard, TeamProfile)
└── layouts/    # layout components (TopBar, BottomNav)
```

## Styling

- Tailwind CSS for all styling, no inline styles
- Dark mode via `class` strategy (system preference)
- **Mobile-first** responsive design — this is a mobile-first product

## Environment Variables

- Server-only: `process.env.VAR_NAME` (no prefix)
- Client-exposed: `NEXT_PUBLIC_` prefix
- Protect the poll route with a `CRON_SECRET` bearer token
- Never log or expose server env vars to the client

## Performance

- `next/image` for images, `next/link` for navigation
- Dynamic imports for heavy client components
- Metadata API for SEO
