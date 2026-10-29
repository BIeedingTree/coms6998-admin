# Week 7 implementation and handoff — 2026-10-29

All requested sections are implemented in `coms6998-admin`. The Supabase migration
has **not** been applied, and authenticated live CRUD has **not** been tested.
No files in `coms6998e`, existing database rows, existing foreign keys, existing RLS
policies, authentication rules, or Vercel protection settings were changed.

## Required setup

1. In the existing shared Supabase project's SQL Editor, review and execute the
   complete file **`supabase/migrations/202610290001_week7_admin.sql`** as the project
   owner. It is transactional and rerunnable for the schema it defines. It creates
   ten tables and their constraints/indexes, enables RLS, denies browser roles
   all access, grants CRUD to `service_role`, and creates an invoker-security trigger
   to initialize a mix row when a chain is inserted. No default/demo records are
   inserted. No storage bucket or existing storage policy is created or changed.
2. The same migration replaces the existing `admin_delete_media` RPC definition,
   preserving its authenticated superadmin check and atomic vote/media deletion.
   It recognizes only the new example/media `ON DELETE SET NULL` FK in addition to
   the existing vote FK. Deleting media still deletes its associated ratings, clears
   linked examples' optional `media_id`, and retains their independent input/output.
   All changes roll back together on failure. Unknown dependencies remain blocked.
   **Do not reinstall the old Week 6 `supabase/admin-delete-media.sql` afterward**:
   its stricter catalog allowlist does not recognize the new example FK. The revised
   migration refuses an already-applied earlier draft instead of silently changing
   its constraints or dropping log tables. It is intended for the unapplied draft.
3. Ensure `SUPABASE_SERVICE_ROLE_KEY` is configured in `.env.local` and in the
   appropriate Vercel environment, alongside the existing public Supabase URL/key
   and server-only Gemini key. The local service-role key was unavailable during
   implementation. Never put it in a `NEXT_PUBLIC_` variable or commit it. Vercel's
   existing environment has not been inspected; do not replace working values.
4. Use the existing Google sign-in with a profile already marked superadmin. This
   implementation never grants anyone that role. Verify the current OAuth redirect
   URLs if deploying to a new hostname. No new callback configuration is needed
   when using the existing hostname.
5. Run the live checklist below. Create only disposable verification records; no
   historical generation activity is seeded or fabricated.

## Schema and behavior

| Table | Purpose / relationships | Admin interface |
| --- | --- | --- |
| `prompt_chains` | Unique name, description | Read list/detail |
| `prompt_chain_steps` | Chain, execution order, prompt, optional model; unique chain/order | Read list/detail and chain filter |
| `prompt_chain_mix` | One row per chain; numeric relative weight | Read/update weight only |
| `terms` | Unique term and definition | Full CRUD |
| `ai_generation_examples` | Name, input/output; optional chain/model/media | Full CRUD with reference dropdowns |
| `llm_models` | Existing API model metadata; provider, name, model key; unique provider/key | Full CRUD |
| `llm_providers` | Provider metadata such as Google; unique name | Full CRUD, dependent-model deletion guard |
| `allowed_signup_domains` | Normalized unique domain | Full CRUD |
| `whitelisted_emails` | Normalized unique email | Full CRUD |
| `admin_images` | Standalone object path, title/alt text, MIME, size, timestamp | Upload/read/update metadata/delete |

Existing `profiles`, `captions`, and `caption_votes` interfaces and their security
remain intact. Bigint media IDs are selected as text to preserve precision.
`assignment2_captions` is not used or changed.

Mix weights are nonnegative relative values up to 1,000,000, with up to four decimal
places. Zero disables participation in the configured mix; no sum of 1 or 100 is
required. **The current Gemini generator does not consume this configuration.**
The UI labels it as configuration only. Chains/steps are provisioned by the owner
or an application writer in Supabase, not created through read-only admin routes.
The insertion trigger creates the mix row, so admins need no mix create/delete UI.

## Existing Gemini data versus new configuration

Inspected `coms6998e/app/actions.ts`: `generateCaption` calls Google's Gemini API
with `model: "gemini-3.5-flash-lite"`, parses the JSON, then stores the prompt,
`caption_text`, `subject`, user ID, type/category, and publication fields in
`captions`. The database supplies `created_at`. The raw API response, provider/model
identity per generation, token usage, latency, failed calls, and request IDs are not
persisted. Project 1 and the admin Gemini generation actions are unchanged.

| Page | Actual source | Meaning / empty-state behavior |
| --- | --- | --- |
| Media | Existing `captions` | Existing CRUD remains intact |
| LLM Responses | Existing `captions.caption_text`, `subject`, user and media metadata | Real saved output; no new API call or copy. Media edits are reflected, so this is not the immutable original Gemini response. Legacy rows may have incomplete provenance. |
| Generation Requests | Existing `captions.prompt`, with media/user/type/category/saved date | Only non-null, nonempty stored prompts. Media IDs and saved dates are labeled as such, not invented request IDs or exact request start times. Older rows without prompts are omitted. |
| Users / Ratings / Dashboard | Existing profiles/media/votes | Preserved |
| Providers / Models | New catalog tables | Empty until metadata is entered. Google and `gemini-3.5-flash-lite` describe the inspected current code, not every historical media row. Editing metadata never configures, hosts, or invokes a model. |
| Prompt Chains / Steps / Mix | New configuration tables | Empty until configuration is provisioned. A new chain receives a mix row automatically. No execution pipeline is added. |
| Terms / Examples / Domains / Emails | New content/configuration tables | Empty until admins add records. Existing CRUD preserved. |
| Images | New standalone metadata plus existing Storage; profile view uses existing profiles | Standalone list empty until uploads; existing profile image links remain visible/read-only. |

**No read-only page waits for a future logging pipeline anymore.** The redundant
`generation_requests` and `llm_responses` CREATE statements have been removed from
the unapplied migration, not replaced with backfill, copies, views, or fake records.
Requests/Responses can use existing data even before the Week 7 migration is run
(assuming the existing admin server credential is configured). If there are no
stored prompts/outputs, their honest empty states appear. New successful media
saves from the unchanged generator naturally appear on refresh.

Unrecorded telemetry remains unavailable until a separately approved producer
actually logs it. No statuses, errors, model assignments, or historical requests
are inferred. Reading any of these pages never calls Gemini. Deleting a media row
removes its saved prompt/output from both views; there is no separate audit-history
archive to preserve. The media deletion confirmation explains this behavior.

Signup domains/emails are database-managed configuration lists only. They do not
change signup eligibility, OAuth, existing accounts, or superadmin privileges.

Every new loader and mutation independently calls the existing `requireAdmin()`.
Tables/fields/mutation modes are server-controlled allowlists. Read-only and mix
create/delete requests are rejected even if forged. No generic arbitrary-table API
or credential-bearing client code exists. Error messages cover missing migrations,
duplicates, invalid values, missing/dependent FKs, and permissions.

## Images

Uses the confirmed existing **public** `avatars` bucket, with newly generated UUID
paths under **`admin-images/`**. Existing profile paths are never treated as managed
standalone images, and no profile fields are updated. The profile-avatar view reads
existing profile references and provides view links with search/pagination.
Standalone uploads have a 4 MB limit, allowed MIME types, and file-header checks
for JPG/PNG/WebP/GIF; SVG and mismatched formats are rejected. Titles/alt text are
editable. Uploading first checks metadata-table availability and removes the new
object on a confirmed metadata insert failure. Ambiguous network failures report
the generated storage path for inspection rather than claiming success.

Deletion requires exact ID confirmation plus a browser confirmation dialog. The
server loads the stored object path, verifies the managed namespace, checks current
profile references (including ordinary signed/transformed URL paths), and refuses
linked objects. It deletes the storage object before its metadata; if cleanup fails,
the retained metadata supports a retry. Storage and PostgreSQL do not share a
transaction: concurrent out-of-band SQL changes to profile references must be
coordinated by the owner, and transport failures may require manual object cleanup.
The existing public bucket means uploads are public; this is stated in the UI.

## Rubric status

PASS below means implemented and locally validated. Live authenticated checks are
PENDING for every data feature until migration and server access are available.

| Requirement | Implementation | Live verification |
| --- | --- | --- |
| Users read/search/pagination | PASS, preserved | PENDING |
| Prompt chains list/details | PASS | PENDING |
| Prompt chain steps/order/content/chain filter | PASS | PENDING |
| Generated media and Week 6 CRUD/deletion | PASS, preserved with compatible RPC migration | PENDING |
| Generation requests from existing stored prompts, with explicit telemetry limits | PASS | PENDING |
| LLM responses from existing saved output/subject | PASS | PENDING |
| Prompt chain mix read/update/validation | PASS | PENDING |
| Terms CRUD | PASS | PENDING |
| AI generation examples CRUD/references | PASS | PENDING |
| LLM models CRUD/provider references | PASS | PENDING |
| LLM providers CRUD/dependency handling | PASS | PENDING |
| Signup domain CRUD/validation/duplicates | PASS | PENDING |
| Whitelisted email CRUD/validation/duplicates | PASS | PENDING |
| Image upload/read/metadata update/delete | PASS | PENDING |
| Grouped blue/white navigation, responsive layout, accessible forms | PASS | Authenticated browser interactions PENDING |
| Confirmation/loading/empty/error/success states | PASS | PENDING |
| Server-side authorization and restrictive new-table RLS | PASS, mock + isolated SQL tests | Live account checks PENDING |
| Original app/schema/data/policy preservation | PASS, code audit + isolated migration comparison | No live migration executed |
| Migration execution | Complete SQL delivered | PENDING, manual execution |
| Git push and deployment | See final chat report for commit/push | Deployment unverified unless stated there |

## Validation performed

- `npm test`: **176 passing**, zero failures. Existing tests plus server-action
  round trips for all six CRUD entities, all read-only loaders, mix validation,
  forged writes, revoked/missing authorization, search/pagination, FK errors, image
  upload/update/delete and failure cleanup. These application tests mock Supabase,
  Gemini, and Storage; they are not live integration tests.
- PGlite executes the actual migration twice in isolated PostgreSQL. Tests cover
  real constraints, actual SQL CRUD persistence, mix provisioning, denied browser
  roles, service-role grants, preservation of existing rows/FKs/RLS/policies,
  atomic media/vote/example-link rollback, preserved example input/output, refusal
  of unknown cascades, and safe refusal of incompatible earlier drafts.
  PGlite does not exercise the Supabase Storage service or deployed PostgREST.
- Corrected Requests/Responses list and detail components were rendered directly
  with existing-media fixtures, verifying provenance notices, content, and bigint
  links without requiring the new configuration tables. These are isolated tests.
- ESLint, explicit `npx tsc --noEmit`, and production webpack build: passed.
- Corrected production HTTP smoke: **43 admin URLs** redirected to `/login` without a session;
  including bigint media-backed detail URLs; login rendered Google sign-in and
  callback without code was rejected.
- Prior implementation React form components were statically rendered with isolated fixtures in
  `/tmp` for visual inspection at desktop and 390px widths. This was not a signed-in
  production browser test. No fixture routes or auth bypasses ship with the app.
- No live Supabase inserts, updates, deletes, file uploads, or migration execution.
- No Vercel deployment/protection settings were changed.

## Live acceptance checklist

1. Apply the migration and configure the server credential. Confirm no setup errors.
2. Create a disposable provider, then a model referencing it. Refresh both lists and
   detail pages; edit each; verify duplicate provider/model-key errors. Attempt to
   delete the referenced provider and confirm the dependent-model error.
3. Create/edit/refresh/delete a disposable term, domain, email, and example. Test
   invalid domain/email and duplicate values. Link an example to disposable media,
   delete the disposable media, and verify its ratings are removed while the example
   remains with unchanged input/output and a null media link. Unrelated rows must stay intact.
4. Provision a genuinely intended chain and its steps through Supabase. The new
   chain automatically receives a weight of 1. Inspect chain details, filter steps,
   update its mix weight, refresh, and verify it in Supabase. Test zero and invalid
   negative/oversized weights. Compare Requests/Responses against existing media:
   stored prompt, saved output/subject, exact media ID, user, and media saved date.
   Older media without prompts must be absent from Requests. Do not call Gemini
   just to populate these pages or assign historical model metadata.
5. Upload a disposable PNG/JPG, refresh, edit its title/alt text, refresh again, and
   delete with confirmation. Verify metadata and object removal. Check read-only
   existing avatar links. Never use another person's avatar as disposable test data.
6. Test authenticated non-admin denial for pages and forged server-action requests;
   revoke a test admin role and confirm an already-open form cannot save.
7. Confirm users/media/ratings/dashboard still behave correctly and unrelated data
   is unchanged. Verify GitHub/Vercel deployment once the pushed commit is built.
