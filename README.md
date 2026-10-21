# Say It Better — Assignment 6 Admin

A separate Next.js, TypeScript, Tailwind CSS and Supabase application in `coms6998-admin`. It uses the same Supabase project as `coms6998e`, without modifying that repository, database schema, grants, or RLS policies.

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
| `NEXT_PUBLIC_SUPABASE_URL` | Same Supabase project URL as Assignment 5 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same public authentication key as Assignment 5 |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin data access; never use a `NEXT_PUBLIC_` prefix |
| `GEMINI_API_KEY` | Server-only AI generation, using the existing `gemini-3.5-flash-lite` model |

Open `http://localhost:3006`. Add `http://localhost:3006/auth/callback` to Supabase Authentication → URL Configuration → Redirect URLs. If using `127.0.0.1`, add that exact origin's callback too. Keep Assignment 5's settings in place.

Manually set your own **existing** `profiles.is_superadmin` field to boolean `TRUE` in Supabase, as requested. This application cannot promote users. The original repository does not define that field in its checked-in SQL, so its existence in the live database still needs verification. If it does not exist, access remains closed; no migration is provided or applied.

## Features

- `/admin`: exact profile/caption/rating totals, upvotes, downvotes, positive percentage, publication count, and the five most-rated captions. Rankings scan all rating pages rather than silently stopping at Supabase's response cap. Counts are current query results, not a transactional snapshot; concurrent activity can change them during a request.
- `/admin/users`: searchable, paginated profile table. Displays the verified existing fields: names, user ID, avatar availability and admin status. Profiles are read-only. Email and profile creation dates are not invented.
- `/admin/media`: searchable caption library. AI generation creates a private record owned by the signed-in admin. Editing changes only caption text, subject, message type and category. Ownership, saved prompt and publication are preserved. Delete requires typing the caption ID.
- `/admin/ratings`: paginated, read-only votes with upvote/downvote filters and associated profile/caption details.

New captions can be published through the original application. Updates and deletions affect the shared database and therefore appear in Assignment 5 too.

## Database mapping and constraints

Inspected `coms6998e` on its clean `main` branch: Supabase browser/server clients, OAuth callback, server actions, profile UI, caption and rating helpers, and existing SQL files. No SQL from the original app was executed.

| Table | Fields used | Relationship |
| --- | --- | --- |
| `profiles` | `id`, `first_name`, `last_name`, `avatar_url`, requested `is_superadmin` | Profile `id` matches the verified Auth user ID |
| `captions` | `id`, `caption_text`, `subject`, `message_type`, `category`, `user_id`, `created_at`, `is_public`, `published_at`; `prompt` only on creation | `user_id` references `auth.users.id` |
| `caption_votes` | `id`, `caption_id`, `user_id`, `vote`, `created_at` | `caption_id` references `captions.id`; `user_id` references `auth.users.id` |

The original code supplies email/message/other types and academic/career/clubs/housing/social/other categories. Email subjects must be nonempty, single-line, at most 200 characters; other message types store a null subject. Captions are limited to 2,000 characters. Generated prompts retain the original app's request-extraction markers.

Bigint caption/rating IDs are selected as text to avoid JavaScript integer rounding. User associations are resolved by ID, since the known foreign keys reference `auth.users`, not a direct PostgREST relationship to `profiles`.

**Images:** the existing code uses the `avatars` storage bucket for profile photos. No caption image column or media upload bucket is established by the inspected code. Image uploads are therefore not added.

**Deleting rated captions:** the existing foreign key has no declared `ON DELETE CASCADE`. Supabase can reject deletion when related ratings exist. The app reports that constraint and preserves both caption and ratings. It never silently deletes ratings or changes constraints.

## Server-side authorization

1. The Supabase SSR cookie client verifies the session with `auth.getUser()`.
2. Only after verified authentication, a private server-only client reads that user's `profiles.is_superadmin` value.
3. Only literal boolean `true` grants access. A missing profile, missing role field, failed lookup, forged client metadata, or missing server credential cannot grant access.
4. The authenticated admin client is returned only after that check. Every data loader and mutation calls this guard; layout checks are additional protection. Generation rechecks the role after the AI response before saving.
5. Logged-out requests redirect to `/login`; non-admin users go to `/access-denied`. Role/configuration failures have a distinct setup message. Errors never become invented zero totals or successful writes.

The original application's grants/RLS permit only limited own-user access and do not allow general caption editing/deletion. The server-only service-role client intentionally bypasses RLS **after application authorization**, allowing administration without altering existing policies. This credential must belong to the same Supabase project. It is isolated by `server-only`, never passed to React client components, and never returned by an endpoint. Do not expose or log it.

Only caption mutations are exported. There is no profile write, rating write, role-setting route, arbitrary table endpoint, public test route, or authentication bypass. Supabase session refresh runs in `proxy.ts`; access is enforced again at the data/mutation boundary. Next.js Server Actions retain their built-in same-origin protections. Admin responses use private/no-store caching.

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

Automated tests execute the real authorization, data and mutation modules against isolated in-memory Supabase/Gemini mocks. They cover denied access, CRUD persistence round trips, immutable ownership/publication, role revocation during generation, invalid inputs, failed and zero-row writes, foreign-key deletion failures, pagination, cross-table associations, complete rankings beyond the API row cap, and OAuth callback decisions. These tests do **not** prove live Google login, live AI responses, or live Supabase CRUD.

The HTTP smoke script is read-only and checks unauthenticated redirects for every admin page and login/callback responses. `TEST_ORIGIN` can override the default `http://127.0.0.1:3006`.

### Required live checks after configuration

1. Confirm the new callback URL is allowlisted. Sign in through Google with your superadmin account.
2. Compare users, captions and votes in the dashboard with the Supabase tables. Check searching, pagination and rating filters.
3. Create a disposable private AI caption. Reload, reopen it, change its text/category, save, and reload again. Confirm the same record changed in Supabase.
4. Delete that unrated test caption by typing its ID. Reload and confirm the record is absent. If testing a rated caption's deletion, expect the related-record error and verify its ratings remain.
5. Sign in with a non-admin account and open every `/admin` route directly. Access must be denied. Test anonymous access in a separate browser session.
6. Remove your test account's admin flag manually and submit an already-open edit form. The server must deny the mutation.

Do not use existing user content as disposable test data. No live database rows have been created, changed or deleted during implementation; the server credential and an authenticated superadmin session were unavailable.

## Separate Vercel deployment

Create a new Vercel project connected to **`coms6998-admin`**, using the Next.js preset and Node.js 22. Keep the Assignment 5 project separate. Set all four environment variables for the environments you will use; the service-role and Gemini keys must remain server-only. The build command is `npm run build`.

Add the new deployment's exact `https://YOUR-ADMIN-DOMAIN/auth/callback` to Supabase's redirect allowlist alongside the existing app URL. Keep the existing Supabase Site URL/provider settings unless the project owner has a separate reason to change them; Google still uses the same Supabase provider callback. Redeploy after setting environment variables, then complete the live checks above. This implementation has not been pushed or deployed.

References: [Supabase SSR authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication), [PostgREST column casting](https://docs.postgrest.org/en/stable/references/api/tables_views.html#casting-columns).
