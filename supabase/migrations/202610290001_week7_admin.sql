-- Week 7 admin configuration and observability. Run manually in Supabase SQL Editor.
-- Does not change existing tables, rows, foreign keys, RLS, auth, or storage policies.
-- Browser roles have no access to these tables. Verified superadmins use the
-- existing server-only service-role client. The existing authenticated deletion RPC is updated for the optional example link.
begin;
-- This revision is for the unapplied Week 7 draft. Never silently alter an
-- existing differently-defined FK or discard any pre-existing log data.
do $$ begin
  if to_regclass('public.generation_requests') is not null
     or to_regclass('public.llm_responses') is not null then
    raise exception 'Earlier Week 7 log tables exist. Review schema before applying this revised migration.';
  end if;
  if exists (select 1 from pg_constraint c
    where c.conrelid = to_regclass('public.ai_generation_examples')
      and c.contype = 'f' and c.confrelid = 'public.captions'::regclass
      and c.confdeltype <> 'n') then
    raise exception 'Existing example/media foreign key differs. Review schema before applying this revised migration.';
  end if;
end $$;
-- Provider/model catalog metadata only; nothing here executes or hosts AI models.
create table if not exists public.llm_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);
create table if not exists public.llm_models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.llm_providers(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 120),
  model_key text not null check (length(btrim(model_key)) between 1 and 200),
  created_at timestamptz not null default now(),
  unique(provider_id, model_key)
);
create table if not exists public.prompt_chains (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 120),
  description text check (length(description) <= 10000),
  created_at timestamptz not null default now()
);
create table if not exists public.prompt_chain_steps (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.prompt_chains(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 120),
  step_order integer not null check (step_order >= 1),
  prompt text not null check (length(btrim(prompt)) between 1 and 50000),
  model_id uuid references public.llm_models(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(chain_id, step_order)
);
create table if not exists public.prompt_chain_mix (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null unique references public.prompt_chains(id) on delete restrict,
  -- Relative weights, NOT percentages. Zero disables a chain. No sum constraint.
  weight numeric(12,4) not null default 1 check (weight between 0 and 1000000),
  created_at timestamptz not null default now()
);
-- Ensure each newly provisioned chain has an editable mix entry. Invoker security;
-- only service_role/owner can insert chains. No existing application rows touched.
create or replace function public.week7_initialize_chain_mix() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.prompt_chain_mix(chain_id) values (new.id) on conflict (chain_id) do nothing;
  return new;
end $$;
revoke all on function public.week7_initialize_chain_mix() from public, anon, authenticated;
drop trigger if exists week7_initialize_chain_mix on public.prompt_chains;
create trigger week7_initialize_chain_mix after insert on public.prompt_chains
for each row execute function public.week7_initialize_chain_mix();
create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(),
  term text not null unique check (length(btrim(term)) between 1 and 200),
  definition text not null check (length(btrim(definition)) between 1 and 10000),
  created_at timestamptz not null default now()
);
-- Requests/responses are read directly from existing media prompt/subject/output.
-- No duplicate logs, historical backfill, generation calls, or new history FKs.
create table if not exists public.ai_generation_examples (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  input text not null check (length(btrim(input)) between 1 and 50000),
  output text not null check (length(btrim(output)) between 1 and 50000),
  chain_id uuid references public.prompt_chains(id) on delete restrict,
  model_id uuid references public.llm_models(id) on delete restrict,
  -- Preserve the independent example text when its optional source media is deleted.
  media_id bigint references public.captions(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.allowed_signup_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique check (
    domain = lower(btrim(domain)) and length(domain) <= 253 and
    domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
  ),
  created_at timestamptz not null default now()
);
create table if not exists public.whitelisted_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (
    email = lower(btrim(email)) and length(email) <= 254 and
    email ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' and
    split_part(email, '@', 1) !~ '(^\.|\.$|\.\.)' and length(split_part(email, '@', 1)) <= 64
  ),
  created_at timestamptz not null default now()
);
-- Standalone objects only. Profile-owned paths and profile records stay read-only.
create table if not exists public.admin_images (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  alt_text text check (length(alt_text) <= 1000),
  storage_path text not null unique check (storage_path ~ '^admin-images/[0-9a-f-]{36}\.(jpg|png|webp|gif)$'),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif')),
  size_bytes integer not null check (size_bytes between 1 and 4194304),
  created_at timestamptz not null default now()
);
-- Fail closed: no anon/authenticated policies. Existing storage policies untouched.
do $$ declare t text; begin
  foreach t in array array['llm_providers','llm_models','prompt_chains','prompt_chain_steps',
    'prompt_chain_mix','terms','ai_generation_examples',
    'allowed_signup_domains','whitelisted_emails','admin_images'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;
create index if not exists week7_models_provider on public.llm_models(provider_id);
create index if not exists week7_steps_model on public.prompt_chain_steps(model_id);
create index if not exists week7_examples_chain on public.ai_generation_examples(chain_id);
create index if not exists week7_examples_model on public.ai_generation_examples(model_id);
create index if not exists week7_examples_media on public.ai_generation_examples(media_id);
-- Preserve Week 6 atomic deletion and allow only the known example SET NULL link.
create or replace function public.admin_delete_media(
  p_media_id bigint,
  p_confirmation text
)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id bigint;
  v_votes bigint;
  v_deleted bigint;
  v_fk record;
  v_expected_fk boolean := false;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  -- The role is read from the database, never from editable JWT metadata or
  -- a user ID supplied by the caller. Hold the role stable during deletion.
  perform p.id from public.profiles p
    where p.id = v_actor and p.is_superadmin is true
    for share;
  if not found then
    raise exception using errcode = '42501', message = 'Superadmin access required.';
  end if;
  if p_media_id is null or p_media_id <= 0
     or p_confirmation is distinct from p_media_id::text then
    raise exception using errcode = '22023', message = 'Exact media ID confirmation required.';
  end if;

  -- Prevent dependency-changing DDL while checking the catalog and deleting.
  -- Normal reads and writes remain possible on unrelated rows.
  lock table public.captions, public.caption_votes in row exclusive mode;
  for v_fk in
    select * from pg_catalog.pg_constraint
    where contype = 'f'
      and confrelid in ('public.captions'::regclass, 'public.caption_votes'::regclass)
  loop
    if v_fk.conrelid = 'public.caption_votes'::regclass
       and v_fk.confrelid = 'public.captions'::regclass
       and v_fk.conkey = array[(select attnum from pg_catalog.pg_attribute
         where attrelid = 'public.caption_votes'::regclass and attname = 'caption_id' and not attisdropped)]
       and v_fk.confkey = array[(select attnum from pg_catalog.pg_attribute
         where attrelid = 'public.captions'::regclass and attname = 'id' and not attisdropped)]
       and v_fk.confdeltype in ('a', 'r') and v_fk.convalidated then
      v_expected_fk := true;
    elsif v_fk.conrelid = 'public.ai_generation_examples'::regclass
       and v_fk.confrelid = 'public.captions'::regclass
       and v_fk.conkey = array[(select attnum from pg_catalog.pg_attribute
         where attrelid = v_fk.conrelid and attname = 'media_id' and not attisdropped)]
       and v_fk.confkey = array[(select attnum from pg_catalog.pg_attribute
         where attrelid = 'public.captions'::regclass and attname = 'id' and not attisdropped)]
       and v_fk.confdeltype = 'n' and v_fk.convalidated then
      -- Only detach the optional source link. Example input/output remain intact.
      null;
    else
      -- Do not silently cascade to unknown records, even if a future FK allows it.
      raise exception using errcode = 'P0001', message = 'Unexpected media dependency; schema review required.';
    end if;
  end loop;
  if not v_expected_fk then
    raise exception using errcode = 'P0001', message = 'Expected media relationship missing; schema review required.';
  end if;
  if exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid in ('public.captions'::regclass, 'public.caption_votes'::regclass)
      and not tgisinternal and tgenabled <> 'D' and (tgtype::int & 8) <> 0
  ) or exists (
    select 1 from pg_catalog.pg_rewrite
    where ev_class in ('public.captions'::regclass, 'public.caption_votes'::regclass)
      and ev_type = '4'
  ) then
    raise exception using errcode = 'P0001', message = 'Custom deletion behavior requires schema review.';
  end if;

  -- FOR UPDATE conflicts with the FK key-share lock of concurrent new votes.
  -- Votes already being inserted finish first; later inserts cannot become orphans.
  select c.id into v_id from public.captions c where c.id = p_media_id for update;
  if not found then return null; end if;

  delete from public.caption_votes where caption_id = v_id;
  get diagnostics v_votes = row_count;
  delete from public.captions where id = v_id;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception using errcode = 'P0001', message = 'Media deletion failed.';
  end if;
  -- Text IDs/counts retain bigint precision in JavaScript.
  return pg_catalog.jsonb_build_object('id', v_id::text, 'deleted_ratings', v_votes::text);
  -- No exception handler: any failure rolls back BOTH deletes in this RPC's
  -- single PostgREST transaction. Never split these into separate HTTP requests.
end;
$$;

alter function public.admin_delete_media(bigint, text) owner to postgres;
revoke all on function public.admin_delete_media(bigint, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_delete_media(bigint, text) to authenticated;

notify pgrst, 'reload schema';
commit;
