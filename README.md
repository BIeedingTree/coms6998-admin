# Say It Better — Assignment 6 Admin

## Week 7 implementation

All Week 7 sections are implemented. **The owner reports the revised migration
installed successfully. Do not reapply it for this verification update.**
See [setup, schema, testing, and rubric status](docs/week7-status.md). The migration
is [supabase/migrations/202610290001_week7_admin.sql](supabase/migrations/202610290001_week7_admin.sql).
It creates ten admin-only configuration/content tables (including standalone image
metadata) and updates the existing atomic media-deletion RPC to allow the optional
example link to be cleared on media deletion. Requests and Responses read the
existing stored media prompts and outputs directly; no duplicate log tables or
replacement Gemini pipeline are introduced. No existing rows, foreign keys, or RLS policies are changed.


A separate Next.js, TypeScript, Tailwind CSS and Supabase application in `coms6998-admin`. It uses the same Supabase project as `coms6998e`, without modifying that repository, database schema, grants, or RLS policies.

**Rated-media deletion requires manual database setup:** review [the inspection and installation steps](supabase/README.md) before claiming production deletion is complete. No SQL has been applied automatically.

## Start locally

Use Node.js 22 (`nvm use` if available), then:

```sh
npm ci
cp .env.example .env.local
# Fill in the environment variables before starting.
npm run dev -- --port 3006
```

**For this local checkout, `.env.local` already contains the original app's Supabase URL, public anon key and Gemini key. Do not overwrite it with the blank example. Add the missing server-only `SUPABASE_SERVICE_ROLE_KEY` instead.** The file is ignored by Git.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Same Supabase project root URL as Assignment 5, e.g. `https://YOUR-PROJECT.supabase.co`; omit `/rest/v1/` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same public authentication key as Assignment 5 |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin data access; never use a `NEXT_PUBLIC_` prefix |
| `GEMINI_API_KEY` | Server-only AI generation, using the existing `gemini-3.5-flash-lite` model |

Open `http://localhost:3006`. Add `http://localhost:3006/auth/callback` to Supabase Authentication → URL Configuration → Redirect URLs. If using `127.0.0.1`, add that exact origin's callback too. Keep Assignment 5's settings in place.

Sign in with an existing superadmin account. The supplied schema confirms `profiles.is_superadmin` is a non-null boolean defaulting to false. The server requires it to be exactly `true`; this application cannot promote users. Live account testing remains pending an authenticated session.

## Features

- `/admin`: exact profile/media/rating totals, upvotes, downvotes, positive percentage, publication count, and the five most-rated media items. Rankings scan all rating pages rather than silently stopping at Supabase's response cap. Counts are current query results, not a transactional snapshot; concurrent activity can change them during a request.
- `/admin/users`: searchable, paginated profile table. Displays the verified existing fields: names, user ID, avatar availability and admin status. Profiles are read-only. Email and profile creation dates are not invented.
- `/admin/media`: searchable media library. AI generation creates a private record owned by the signed-in admin. Editing changes only media content, subject, message type and category. Ownership, saved prompt and publication are preserved. Delete requires typing the media ID and permanently removes its associated ratings in the same transaction after the reviewed SQL is installed.
- `/admin/ratings`: paginated, read-only votes with upvote/downvote filters and associated profile/media details.

New media can be published through the original application. Updates and deletions affect the shared database and therefore appear in Assignment 5 too.

## Database mapping and constraints

Inspected `coms6998e` on its clean `main` branch: Supabase browser/server clients, OAuth callback, server actions, profile UI, caption and rating helpers, and existing SQL files. No SQL from the original app was executed.

| Table | Fields used | Relationship |
| --- | --- | --- |
| `profiles` | `id`, `first_name`, `last_name`, `avatar_url`, requested `is_superadmin` | Profile `id` matches the verified Auth user ID |
| `captions` | `id`, `caption_text`, `subject`, `message_type`, `category`, `user_id`, `created_at`, `is_public`, `published_at`; `prompt` only on creation | `user_id` references `auth.users.id` |
| `caption_votes` | `id`, `caption_id`, `user_id`, `vote`, `created_at` | `caption_id` references `captions.id`; `user_id` references `auth.users.id` |

The original code supplies email/message/other types and academic/career/clubs/housing/social/other categories. Email subjects must be nonempty, single-line, at most 200 characters; other message types store a null subject. Media content is limited to 2,000 characters. Generated prompts retain the original app's request-extraction markers.

Bigint media/rating IDs are selected as text to avoid JavaScript integer rounding. User associations are resolved by ID, since the known foreign keys reference `auth.users`, not a direct PostgREST relationship to `profiles`.

**Images:** Week 7 adds standalone image CRUD under `avatars/admin-images/`, tracked by `admin_images`. Existing profile avatar references are available in a read-only view. No profiles are editable; referenced images are protected from admin deletion. The existing bucket is public, so standalone uploads are public too.

**Deleting rated media:** the existing foreign key has no declared `ON DELETE CASCADE`. The updated server action calls the proposed `admin_delete_media` RPC to delete the selected item and its votes atomically. The RPC rechecks the authenticated user’s database role and refuses unknown dependencies. Installation is manual; until it is installed, deletion returns a setup error. See [the exact SQL and required live-schema inspection](supabase/README.md). No foreign keys or RLS policies are changed.

## Server-side authorization

1. The Supabase SSR cookie client verifies the session with `auth.getUser()`.
2. Only after verified authentication, a private server-only client reads that user's `profiles.is_superadmin` value.
3. Only literal boolean `true` grants access. A missing profile, missing role field, failed lookup, forged client metadata, or missing server credential cannot grant access.
4. The authenticated admin client is returned only after that check. Every data loader and mutation calls this guard; layout checks are additional protection. Generation rechecks the role after the AI response before saving.
5. Logged-out requests redirect to `/login`; non-admin users go to `/access-denied`. Role/configuration failures have a distinct setup message. Errors never become invented zero totals or successful writes.

The original application's grants/RLS permit only limited own-user access and do not allow general media editing/deletion. The server-only service-role client intentionally bypasses RLS **after application authorization**, allowing administration without altering existing policies. This credential must belong to the same Supabase project. It is isolated by `server-only`, never passed to React client components, and never returned by an endpoint. Do not expose or log it.

Mutations are explicitly allowlisted for media, the six Week 7 CRUD resources, mix weights, and standalone images. Associated ratings are removed only as part of authorized atomic media deletion. There is no profile write, standalone rating mutation, role-setting route, arbitrary table endpoint, public test route, or authentication bypass. Supabase session refresh runs in `proxy.ts`; access is enforced again at the data/mutation boundary. Next.js Server Actions retain their built-in same-origin protections. Admin responses use private/no-store caching.

## Verification

```sh
npm test
npm run lint
npm run build
npm run start -- --hostname 127.0.0.1 --port 3006
# In another terminal:
node scripts/smoke-http.mjs
```

The production build uses Next.js's supported webpack compiler because this host's sandbox blocks the local process/port used by Turbopack's CSS compiler. This does not change the runtime or Vercel target.

Automated tests execute the real authorization, data and mutation modules against isolated in-memory Supabase/Gemini mocks. They cover denied access, CRUD persistence round trips, immutable ownership/publication, role revocation during generation, invalid inputs, failed and zero-row writes, atomic rated-media deletion and rollback, pagination, cross-table associations, complete rankings beyond the API row cap, and OAuth callback decisions. These tests do **not** prove live Google login, live AI responses, or live Supabase CRUD.

OAuth regression tests also execute the actual login button with the installed Supabase SDK. They verify the Auth endpoint, admin callback origin, public key initialization, and PKCE verifier persistence for both project-root and accidentally copied REST URLs. Server, proxy, and privileged clients are checked for consistent URL normalization.

The SQL tests execute the proposed deletion function in isolated local PostgreSQL via PGlite, including permission checks, unrelated-row preservation and rollback. The UI terminology test checks static labels and messages while preserving database identifiers. These checks do not replace live schema inspection and manual installation.

The HTTP smoke script is read-only and checks unauthenticated redirects for every admin page and login/callback responses. `TEST_ORIGIN` can override the default `http://127.0.0.1:3006`.

### Required live checks after configuration

1. Confirm the new callback URL is allowlisted. Sign in through Google with your superadmin account.
2. Compare users, media and votes in the dashboard with the Supabase tables. Check searching, pagination and rating filters.
3. Create a disposable private AI media item. Reload, reopen it, change its text/category, save, and reload again. Confirm the same record changed in Supabase.
4. After installing the reviewed deletion SQL, delete that unrated test item by typing its ID. Repeat with a disposable rated item: confirm all of its ratings are removed, while unrelated media, ratings and users remain.
5. Sign in with a non-admin account and open every `/admin` route directly. Access must be denied. Test anonymous access in a separate browser session.
6. Remove your test account's admin flag manually and submit an already-open edit form. The server must deny the mutation.

Do not use existing user content as disposable test data. No live database rows have been created, changed or deleted during implementation; the server credential and an authenticated superadmin session were unavailable.

## Separate Vercel deployment

Create a new Vercel project connected to **`coms6998-admin`**, using the Next.js preset and Node.js 22. Keep the Assignment 5 project separate. Set all four environment variables for the environments you will use; the service-role and Gemini keys must remain server-only. The build command is `npm run build`.

Add the new deployment's exact `https://YOUR-ADMIN-DOMAIN/auth/callback` to Supabase's redirect allowlist alongside the existing app URL. Keep the existing Supabase Site URL/provider settings unless the project owner has a separate reason to change them; Google still uses the same Supabase provider callback. Redeploy after setting environment variables, then complete the live checks above.

### Google login: "No API key found in request"

The inspected deployment bundled a `NEXT_PUBLIC_SUPABASE_URL` ending in `/rest/v1/`. Its public key was present and matched the working application's key. Both apps already use `supabase.auth.signInWithOAuth` and return to their own `/auth/callback`; the admin callback exchanges the code and enforces the server-side superadmin check.

The SDK appends `/auth/v1/authorize` to its configured project URL. The incorrect value therefore sent the browser to `/rest/v1/auth/v1/authorize`, where the REST gateway returned HTTP 401 with the missing-key message. A read-only check reproduced that response; the correct `/auth/v1/authorize` endpoint returned HTTP 302 to Google. No Google session was completed and no database data was changed by this check.

The shared configuration helper now normalizes the mistakenly copied REST URL to the project root for every Supabase client and rejects other unexpected URL shapes. It does not add credentials to redirect URLs or weaken authorization.

For deployment:

1. In Vercel, correct `NEXT_PUBLIC_SUPABASE_URL` to the project's root URL, with no `/rest/v1/`. Keep the matching public key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Ensure `SUPABASE_SERVICE_ROLE_KEY` is also configured as a **server-only** variable. It is required by the existing admin role/data guard after Google login; its absence is a separate configuration error, not the cause of this OAuth gateway error. Never prefix it with `NEXT_PUBLIC_`.
3. Build and deploy the updated `main` with those environment variables. Next.js embeds public variables at build time; changing Vercel settings cannot fix an already-built deployment. Use the current production domain or the newly created deployment URL, rather than an old immutable deployment URL.
4. Allowlist that origin's exact `/auth/callback` in Supabase Authentication → URL Configuration → Redirect URLs, keeping the original application's entries and provider settings. If signing in on a preview domain, allowlist its callback too and ensure the Preview environment has the required variables.
5. Manually confirm your existing profile has boolean `is_superadmin = TRUE`, then complete the live login and authorization checks above.

References: [Supabase SSR authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication), [PostgREST column casting](https://docs.postgrest.org/en/stable/references/api/tables_views.html#casting-columns).
