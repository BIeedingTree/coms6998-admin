# Assignment 6 verification

## Completed

- `npm test`: **94 passing**, 0 failing. Executes real server modules with mocked Supabase and Gemini dependencies. Includes a create → read → update → read → delete → read round trip, authorization for all loaders/mutations, role revocation, validation, permission failures, rating foreign-key protection, large bigint IDs, and complete paginated statistics.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript checking. Uses Next.js 16.3.5's webpack compiler. Turbopack failed because this environment disallows its CSS compiler's local port/process operation.
- Browser against the actual production server: `/admin`, `/admin/users`, `/admin/media`, `/admin/media/new`, `/admin/media/1`, and `/admin/ratings` all redirected to `/login` without an authenticated session.
- Actual production login page rendered with the Google sign-in control.
- Visual inspection: simplified light blue/white UI, desktop dashboard and creation form, plus dashboard at a 390px iframe width. Authenticated-page visual checks used a separate temporary static render of the real components with isolated test data, never an authentication bypass in the application. No mock/demo data is shipped in application routes.
- Browser JavaScript scanned for the configured Gemini key: absent. No service-role key was available to scan; the server-only import boundary and successful build prevent client imports of its factory.
- `coms6998e` remains on clean `main`; no files, database schemas, RLS policies, grants, or storage settings were changed.

## Preview images

`login-preview.png` shows the actual application login page. `dashboard-preview.png` shows the actual dashboard components with an **isolated test fixture** (one test admin, no captions/ratings), not live statistics. These files are documentation only, outside Next.js public assets.

## Not yet verified live

- Google OAuth for this new application's callback URL.
- Live existence/value of `profiles.is_superadmin`.
- Superadmin/non-admin account behavior against the live database.
- Live AI generation and Supabase CRUD persistence.
- New Vercel deployment.

The missing server credential and configured superadmin session block those checks. Follow the README setup and live-check steps. The original repository's SQL was inspected only and was not executed. No live data was inserted, updated or deleted.

The optional terminal HTTP smoke script is included but was not completed: its sandboxed request could not reach localhost, and the escalated retry was interrupted. Equivalent logged-out route redirects were verified through the browser afterward; no HTTP status-code claim is made for that browser check.
