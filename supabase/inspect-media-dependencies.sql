-- READ ONLY. Run in the Supabase SQL Editor before installing the deletion RPC.
-- Returns schema metadata, not user data or credentials.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles', 'captions', 'caption_votes')
order by table_name, ordinal_position;

-- Incoming foreign keys: these can block deletion or cause cascading side effects.
select conrelid::regclass::text as dependent_table, conname,
       confrelid::regclass::text as referenced_table,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and confrelid in ('public.captions'::regclass, 'public.caption_votes'::regclass)
order by dependent_table, conname;

-- Review any custom DELETE triggers before proceeding.
select tgrelid::regclass::text as table_name, tgname,
       pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid in ('public.captions'::regclass, 'public.caption_votes'::regclass)
  and not tgisinternal and tgenabled <> 'D' and (tgtype::int & 8) <> 0
order by table_name, tgname;

select ev_class::regclass::text as table_name, rulename,
       pg_get_ruledef(oid) as definition
from pg_rewrite
where ev_class in ('public.captions'::regclass, 'public.caption_votes'::regclass)
  and ev_type = '4';
