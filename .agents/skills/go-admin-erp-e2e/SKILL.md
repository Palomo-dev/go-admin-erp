---
name: go-admin-erp-e2e
description: End-to-end testing notes for the go-admin-erp Next.js app, including auth fallback, module bypass, theme toggle, skeleton-state capture, and responsive overflow checks.
---

## Devin Secrets Needed
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or use the known key from `.env.local`)

## Useful environment details
- Repo: `/home/ubuntu/repos/go-admin-erp`
- Server: `http://localhost:3000` (use `PORT=3001` if 3000 busy)
- Test account: `andrespalacio07@hotmail.com` / `12345678`
- Organization: `Donde Checho Restaurant` (id `120`)
- Supabase auth cookie: `sb-jgmgphmzusbluqhuqihj-auth-token`
- CDP endpoint is dynamic; fetch `http://localhost:29229/json/version` first.
- If `/_next/static/chunks/...` returns 400/404 after a rebuild, kill any stale `next-server` processes and restart `PORT=3000 npm run start`; `kill_shell` may leave the server process behind.

## Auth setup
1. Login via Supabase REST `POST /auth/v1/token?grant_type=password`.
2. Set the auth cookie and localStorage keys (`organizacionActiva`, `currentOrganizationId`, `currentOrganizationName`, `userData`, `theme`).

## Module access bypass
- Clear `org_id` and `organization` cookies before navigating to `/app/*` routes so inactive modules render.

## Capturing skeleton loading states
- `AppLayout` and `app/layout.tsx` no longer show full-page `animate-spin` spinners; they render `PageSkeletons` while `subscriptionChecked` is false.
- To see page-level shadcn `<Skeleton>` / `PageSkeletons`, allow these core Supabase requests to complete first:
  - `/auth/v1/*`
  - `/rest/v1/organizations`
  - `/rest/v1/organization_members`
  - `/rest/v1/branches`
  - `/rest/v1/profiles`
  - `/rest/v1/subscriptions`
  - `/rest/v1/modules`
  - `/rest/v1/organization_modules`
  - `/rest/v1/organization_module_pages`
  - `/rpc/get_current_plan`
- Block module data requests (`/rest/v1/<module-table>` and other `/rpc/*`) with `page.setRequestInterception` while taking screenshots, then abort them.
- Shadcn `Skeleton` elements have `animate-pulse` and class `bg-primary/10`; `PageSkeletons` produce many `Card`-wrapped skeletons.

## Theme toggle
- `next-themes` uses `attribute="class"` and `storageKey="theme"`.
- Setting `localStorage.theme` and `html.classList` before navigation is unreliable; prefer clicking the header theme toggle (title contains "oscuro", "claro", or "tema") once on `/app/roles` or `/app/inicio`, then navigating to the target route so `next-themes` persists the resolved theme.
- `page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])` can help when `theme` is set to `system`.

## Responsive overflow checks
- `document.documentElement.scrollWidth === window.innerWidth` and `window.scrollTo(100,0)` returning `scrollX === 0` is a good first check, but hidden `overflow-x-auto` table wrappers can still produce visual overflow without expanding `html.scrollWidth`.
