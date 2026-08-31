# PrySight hosting recovery contract

PrySight is the application, not a marketing website. Signed out users must land on the PrySight login screen at `/`.

The production application runs on Next.js 16. Netlify and Bolt hosting should use the current automatic OpenNext adapter. The legacy `@netlify/plugin-nextjs` package is intentionally not pinned in this repository.

If a Bolt sync proposes to replace the root page with a redirect to `/dashboard`, remove the shared login component, remove the PrySight logo, remove password reset routes, or reintroduce the legacy Netlify plugin, reject that sync. Those changes represent a rollback to an older snapshot.

Canonical authentication files are `src/app/page.tsx`, `src/app/login/page.tsx`, `src/components/auth/PrysightLoginScreen.tsx`, `src/app/actions/authActions.ts`, `src/app/reset-password/page.tsx`, `src/lib/password-reset.ts`, `src/auth.ts`, `src/proxy.ts`, and `src/components/AppShell.tsx`.
