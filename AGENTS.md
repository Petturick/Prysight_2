<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# PrySight product invariants

PrySight is the application itself. The public root route `/` is the canonical sign in screen for signed out users. Do not add a corporate, landing, marketing, brochure or splash website in front of the application. `/login` may remain as an alias.

Do not replace `src/app/page.tsx` with a redirect to `/dashboard`. The root page must render `PrysightLoginScreen` for signed out users and may redirect authenticated users to `/dashboard`.

Preserve `src/components/auth/PrysightLoginScreen.tsx`, `public/prysight-logo.svg`, the password reset flow, `src/proxy.ts`, and the authentication route exclusions in `AppShell`.

This repository uses Next.js 16. Netlify and Bolt hosting must use the current automatic Next.js OpenNext adapter. Do not add or pin the legacy `@netlify/plugin-nextjs` package unless a deliberate migration requires it. Keep the normal Next.js build output in `.next` and keep Node 22 for production builds.

Never overwrite authentication, hosting, Stripe, Prisma, Supabase or database configuration as incidental cleanup. Any intentional change must preserve the direct PrySight login, authenticated dashboard routing, `/api/health`, server rendering and database connectivity.
