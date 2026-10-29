-- Week 7 discovery only. Run in the existing project's Supabase SQL Editor.
-- Returns one JSON value to export. No application rows or credentials are read.
-- Does not create/alter tables, functions, policies, grants, or data.
begin read only;

select jsonb_pretty(jsonb_build_object(
  'relations', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select n.nspname as schema_name, c.relname as relation_name,
           c.relkind as relation_kind, c.relrowsecurity as rls_enabled,
           obj_description(c.oid, 'pg_class') as description
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p','v','m')
    order by c.relname
  ) t),
  'columns', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select table_schema, table_name, ordinal_position, column_name,
           data_type, udt_schema, udt_name, is_nullable, column_default,
           is_identity, identity_generation, is_generated, generation_expression,
           character_maximum_length, numeric_precision, numeric_scale
    from information_schema.columns where table_schema = 'public'
    order by table_name, ordinal_position
  ) t),
  'constraints', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select n.nspname as schema_name, c.relname as table_name,
           con.conname as constraint_name, con.contype as constraint_type,
           pg_get_constraintdef(con.oid, true) as definition,
           rn.nspname as referenced_schema, rc.relname as referenced_table,
           con.condeferrable as deferrable, con.condeferred as initially_deferred
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_class rc on rc.oid = con.confrelid
    left join pg_namespace rn on rn.oid = rc.relnamespace
    where n.nspname = 'public' or rn.nspname = 'public'
    order by n.nspname, c.relname, con.conname
  ) t),
  'indexes', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select schemaname, tablename, indexname, indexdef from pg_indexes
    where schemaname = 'public' order by tablename, indexname
  ) t),
  'enums', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select n.nspname as schema_name, typ.typname as enum_name,
           e.enumlabel as value, e.enumsortorder as sort_order
    from pg_enum e join pg_type typ on typ.oid = e.enumtypid
    join pg_namespace n on n.oid = typ.typnamespace
    where n.nspname = 'public' order by typ.typname, e.enumsortorder
  ) t),
  'triggers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select n.nspname as schema_name, c.relname as table_name, t.tgname,
           pg_get_triggerdef(t.oid, true) as definition
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname in ('public', 'auth')
    order by n.nspname, c.relname, t.tgname
  ) t),
  'policies', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies where schemaname in ('public', 'storage')
    order by schemaname, tablename, policyname
  ) t),
  'buckets', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select id, name, public, file_size_limit, allowed_mime_types
    from storage.buckets order by id
  ) t),
  'functions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
    select p.proname as name, pg_get_function_identity_arguments(p.oid) as arguments,
           pg_get_function_result(p.oid) as result, p.prosecdef as security_definer
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' order by p.proname
  ) t)
)) as week7_schema;

rollback;
