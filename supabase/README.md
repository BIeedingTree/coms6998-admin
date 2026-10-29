# Week 7 database status

The owner reports successful installation of
[`migrations/202610290001_week7_admin.sql`](migrations/202610290001_week7_admin.sql)
with “Success. No rows returned.” Treat it as installed. This verification update
requires **no SQL execution, schema changes, or RLS changes**.

The migration defines ten admin-only configuration/content tables. Requests and
Responses read existing media prompts/outputs directly; no new log tables exist.
Browser roles have no access to the new tables; authorized server operations use
the service-role client only after authenticating and verifying the superadmin role.

The installed `admin_delete_media(bigint, text)` is compatible with the admin
server action. It independently checks the signed-in user's database role and exact
ID confirmation, deletes only the selected media and its ratings in one transaction,
and clears optional example/media links while preserving example input/output.
Unknown dependencies are blocked and failures roll back all changes.

**Do not run the older `admin-delete-media.sql` over the installed migration.** It
is retained only as the Week 6 historical definition and for its isolated tests;
its catalog allowlist does not support the new example relationship.

Local PGlite tests execute the migration and verify table/column/FK mappings,
permissions, deletion behavior, and rollback. Those tests do not prove live
Supabase CRUD. The local service-role key and authenticated browser session are
unavailable; see [the remaining live checklist](../docs/week7-status.md).

`inspect-week7.sql` and `inspect-media-dependencies.sql` are read-only diagnostic
queries if an actual live mismatch is encountered. There is no need to run them
or reapply the migration merely because this application code was updated.
