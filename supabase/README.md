# Week 7 setup

Run [migrations/202610290001_week7_admin.sql](migrations/202610290001_week7_admin.sql)
for the current application. It includes the compatible definition of
`admin_delete_media`. **Do not reinstall the older `admin-delete-media.sql` after
the Week 7 migration:** the old function intentionally rejects the new foreign keys.
The migration has not been applied by this agent. See [the Week 7 handoff](../docs/week7-status.md).

The following instructions describe the earlier Week 6 setup for reference.

# Atomic media deletion — manual setup required

**The SQL has not been installed in Supabase. Production deletion is not fully functional until you complete the inspection and installation below.** The application intentionally reports a setup error if the RPC is absent; it never falls back to separate vote/media deletion requests.

## 1. Inspect the actual database

Run the entire read-only [`inspect-media-dependencies.sql`](./inspect-media-dependencies.sql) file in your shared project's Supabase SQL Editor. It returns column definitions, all foreign keys pointing to media or votes, and custom DELETE triggers/rules. It does not return private user records or credentials.

The inspected `coms6998e` **main branch SQL** defines:

- `public.captions.id`: bigint media ID.
- `public.caption_votes.caption_id`: bigint foreign key to `public.captions.id`, without cascading deletion. This is the known dependent record that prevents media deletion.
- Both tables' `user_id` fields reference `auth.users.id`. These are outgoing relationships: deleting media/votes must not delete users.
- `profiles.id` identifies the authenticated user; `profiles.is_superadmin` must be boolean `true`.

Live catalog access was not available during implementation. Repository definitions and the reported foreign-key failure do **not** prove there are no other live dependencies. Review the query results before installing. The expected incoming relationship is only `caption_votes.caption_id → captions.id`, with NO ACTION or RESTRICT, and no custom DELETE triggers/rules. If you see any others, stop and share those schema results for review; do not drop constraints or change RLS. The proposed function also checks these assumptions at runtime and refuses deletion on unexpected relationships or delete behavior.

## 2. Review and install the exact function

Open [`admin-delete-media.sql`](./admin-delete-media.sql), review the complete SQL, and run it manually in Supabase SQL Editor as the project owner (`postgres`). This installs `public.admin_delete_media(bigint, text)`, grants execution to `authenticated`, revokes default public/anonymous/service-role execution, and reloads the API schema cache. It changes no RLS policies, table permissions, foreign keys, columns, or existing data. Do not run any old application's migrations for this change.

The function uses `SECURITY DEFINER` with an empty search path because ordinary users cannot read the admin-role column or delete arbitrary media under the existing permissions. Execution privilege alone does not grant deletion: it independently checks the caller's verified `auth.uid()` against `profiles.is_superadmin IS TRUE`. It accepts no actor ID or role metadata. The role row is locked during the operation to prevent a role change partway through deletion.

The server action first runs the existing `requireAdmin()` guard, validates exact ID confirmation, then invokes the RPC with the user's server-side session. The database locks the selected media row, deletes **only** votes with that `caption_id`, and deletes **only** that media ID in one transaction. Concurrent new votes must respect the parent-row lock. An error rolls back both deletes. Unrelated media, votes, profiles and users are untouched. No browser database deletion call is added.

References: [Supabase function security](https://supabase.com/docs/guides/database/functions), [PostgREST transaction rollback](https://postgrest.org/en/stable/references/transactions.html), [PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html).

## 3. Deploy and verify

Deploy the updated `coms6998-admin` main branch. Keep the existing Google callback allowlist, public Supabase variables, and server-only service/Gemini keys. No new environment variable is required. Your existing profile must have boolean `is_superadmin = TRUE`.

Use disposable test media, never unrelated existing content:

1. Read users, media and ratings as a superadmin. Create AI media, reload, edit it, and reload again to confirm persistence.
2. Delete a disposable item with zero ratings. Type its exact ID after reading the warning. Expect a redirect to Media with a success notice and updated dashboard totals.
3. Publish a second disposable item using the existing app and give it multiple ratings from test accounts. Record its ID and a separate control item's ID and ratings.
4. Delete the rated test item through the admin app. Confirm that item and **all** votes for its ID are gone in Supabase. Confirm the control item, its votes, and all profiles/users remain. Check Ratings and Dashboard after navigating back.
5. Try a wrong confirmation ID, a missing item, an expired login and a non-superadmin account. None may delete anything. Revoke a test admin's flag manually and submit its previously opened form; access must be denied.

The app invalidates Media, Ratings and Dashboard views after success and redirects away from the deleted editor. A network interruption can leave the outcome unconfirmed; refresh before retrying. A missing RPC gives a specific setup message with no deletion attempted.

## Automated verification and limits

`npm test` covers existing users/media/ratings reads, AI creation, updates, auth/callback guards, action-level deletion authorization, confirmation, missing-function errors and view invalidation. `tests/deletion-sql.test.cjs` executes the **exact installation SQL and function** in an isolated PGlite PostgreSQL engine with fixture relationships from the repository. It verifies zero/multiple ratings, unrelated-row preservation, non-admin/anonymous denial, role revocation, confirmation, bigint IDs, transaction rollback (including a failure at the second DELETE), and rejection of unexpected dependencies. It checks that installation leaves fixture RLS flags and constraints unchanged. This is a development-only dependency and never connects to Supabase.

These tests establish local behavior, not the state of your live database. Live schema confirmation, manual SQL installation, full Google sign-in, and disposable live CRUD checks remain required before claiming all Assignment 6 capabilities are verified in production. No live records or policies were changed during this update.
