-- MANUAL REVIEW AND INSTALL ONLY. Do not run through an automatic migration.
-- First run inspect-media-dependencies.sql and review every incoming FK/trigger.
-- Expected dependency: caption_votes.caption_id -> captions.id (NO ACTION/RESTRICT).
-- Creates only this RPC and its function permissions. No RLS, table grants,
-- foreign keys, columns, or existing data are changed by installation.
begin;

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
