/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const sql = fs.readFileSync(path.join(__dirname, '../supabase/admin-delete-media.sql'), 'utf8');
const admin = '00000000-0000-0000-0000-000000000001';
const member = '00000000-0000-0000-0000-000000000002';

test('review-only deletion SQL runs in isolated PostgreSQL (never connects to Supabase)', async t => {
  const pg = new PGlite();
  t.after(() => pg.close());
  // Only the columns/relationships used by the function; taken from the existing
  // application's SQL. auth.uid() emulates PostgREST's verified JWT subject.
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table auth.users (id uuid primary key);
    create table public.profiles (id uuid primary key references auth.users(id), is_superadmin boolean);
    create table public.captions (id bigint primary key, caption_text text, user_id uuid references auth.users(id));
    create table public.caption_votes (
      id bigint primary key, caption_id bigint not null references public.captions(id),
      user_id uuid not null references auth.users(id), vote smallint not null check (vote in (1, -1)),
      unique (caption_id, user_id)
    );
    alter table public.profiles enable row level security;
    alter table public.captions enable row level security;
    alter table public.caption_votes enable row level security;
    insert into auth.users values ('${admin}'), ('${member}');
    insert into public.profiles values ('${admin}', true), ('${member}', false);
  `);
  const security = async () => (await pg.query(`select c.relname, c.relrowsecurity,
    coalesce((select jsonb_agg(pg_get_constraintdef(oid) order by conname)
      from pg_constraint where conrelid = c.oid), '[]') as constraints
    from pg_class c where c.oid in ('public.captions'::regclass, 'public.caption_votes'::regclass, 'public.profiles'::regclass)
    order by c.relname`)).rows;
  const before = await security();
  await pg.exec(sql);
  assert.deepEqual(await security(), before, 'installation must not alter RLS or constraints');
  const snapshot = async () => (await pg.query(`select
    (select jsonb_agg(c order by id) from public.captions c) as media,
    (select jsonb_agg(v order by id) from public.caption_votes v) as votes,
    (select jsonb_agg(p order by id) from public.profiles p) as profiles,
    (select jsonb_agg(u order by id) from auth.users u) as users`)).rows;
  const call = async (id = '1', confirmation = id, actor = admin, role = 'authenticated') => {
    await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [actor ?? '']);
    await pg.exec(`set role ${role}`);
    try { return (await pg.query('select public.admin_delete_media($1::bigint, $2::text) as result', [id, confirmation])).rows[0].result; }
    finally { await pg.exec('reset role'); }
  };
  async function seed() {
    await pg.exec(`truncate public.caption_votes, public.captions;
      update public.profiles set is_superadmin = (id = '${admin}');
      insert into public.captions values (1, 'Selected', '${member}'), (2, 'Unrelated', '${admin}');
      insert into public.caption_votes values (10, 1, '${admin}', 1), (11, 1, '${member}', -1), (12, 2, '${member}', 1);`);
  }
  await t.test('multiple ratings: deletes selected media and ALL its votes; preserves unrelated records', async () => {
    await seed(); const initial = (await snapshot())[0];
    assert.deepEqual(await call(), { id: '1', deleted_ratings: '2' });
    const final = (await snapshot())[0];
    assert.deepEqual(final.media, initial.media.filter(row => row.id === 2));
    assert.deepEqual(final.votes, initial.votes.filter(row => row.caption_id === 2));
    assert.deepEqual(final.profiles, initial.profiles); assert.deepEqual(final.users, initial.users);
  });
  await t.test('zero ratings: deletes media and preserves other votes', async () => {
    await seed(); await pg.exec('delete from public.caption_votes where caption_id = 1');
    assert.deepEqual(await call(), { id: '1', deleted_ratings: '0' });
    assert.equal((await snapshot())[0].votes.length, 1);
  });
  for (const [label, actor, role] of [['non-superadmin', member, 'authenticated'], ['no identity', null, 'authenticated'], ['anonymous', admin, 'anon'], ['service role', admin, 'service_role']]) {
    await t.test(label + ' cannot execute deletion', async () => {
      await seed(); const initial = await snapshot();
      await assert.rejects(call('1', '1', actor, role), error => error.code === '42501');
      assert.deepEqual(await snapshot(), initial);
    });
  }
  await t.test('revoked database role blocks an existing authenticated session', async () => {
    await seed(); await pg.exec(`update public.profiles set is_superadmin = false where id = '${admin}'`);
    const initial = await snapshot();
    await assert.rejects(call(), error => error.code === '42501');
    assert.deepEqual(await snapshot(), initial);
  });
  for (const confirmation of ['yes', '2', '', null]) await t.test('exact confirmation required: ' + JSON.stringify(confirmation), async () => {
    await seed(); const initial = await snapshot();
    await assert.rejects(call('1', confirmation), error => error.code === '22023');
    assert.deepEqual(await snapshot(), initial);
  });
  await t.test('missing media does not delete votes or report success', async () => {
    await seed(); const initial = await snapshot(); assert.equal(await call('999'), null);
    assert.deepEqual(await snapshot(), initial);
  });
  await t.test('large bigint ID is returned without rounding', async () => {
    await seed(); await pg.exec("insert into public.captions(id) values (9223372036854775806)");
    assert.deepEqual(await call('9223372036854775806'), { id: '9223372036854775806', deleted_ratings: '0' });
  });
  await t.test('transaction failure after deletion rolls back both media and votes', async () => {
    await seed(); const initial = await snapshot();
    await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [admin]);
    await pg.exec('begin; set local role authenticated;');
    await pg.query('select public.admin_delete_media(1, $1)', ['1']);
    await assert.rejects(pg.query('select 1/0'), error => error.code === '22012');
    await pg.exec('rollback');
    assert.deepEqual(await snapshot(), initial);
  });
  await t.test('failure at the media DELETE rolls back the preceding vote DELETE', async () => {
    await seed(); const initial = await snapshot();
    // Fault injection in this local test only: keep the exact function body,
    // but temporarily remove its owner's permission to perform the SECOND delete.
    await pg.exec(`create role deletion_test_owner bypassrls;
      grant usage on schema public, auth to deletion_test_owner;
      grant select, update on public.profiles, public.captions to deletion_test_owner;
      grant select, update, delete on public.caption_votes to deletion_test_owner;
      alter function public.admin_delete_media(bigint, text) owner to deletion_test_owner;`);
    try {
      await assert.rejects(call(), error => error.code === '42501' && /captions/.test(error.message));
      assert.deepEqual(await snapshot(), initial);
    } finally {
      await pg.exec('alter function public.admin_delete_media(bigint, text) owner to postgres; drop owned by deletion_test_owner; drop role deletion_test_owner;');
    }
  });
  for (const target of ['captions', 'caption_votes']) await t.test('unknown cascading dependency on ' + target + ' fails safely', async () => {
    await seed();
    await pg.exec(`create table public.unexpected_dependency (parent_id bigint references public.${target}(id) on delete cascade);
      insert into public.unexpected_dependency values (${target === 'captions' ? 1 : 10});`);
    try {
      const initial = await snapshot();
      await assert.rejects(call(), error => error.code === 'P0001');
      assert.deepEqual(await snapshot(), initial);
      assert.equal((await pg.query('select * from public.unexpected_dependency')).rows.length, 1);
    } finally { await pg.exec('drop table public.unexpected_dependency'); }
  });
  await t.test('unreviewed DELETE trigger is rejected without running it', async () => {
    await seed();
    await pg.exec(`create function public.unexpected_delete() returns trigger language plpgsql as $$ begin raise exception 'Must not run'; end; $$;
      create trigger unexpected_delete before delete on public.captions for each row execute function public.unexpected_delete();`);
    try {
      const initial = await snapshot(); await assert.rejects(call(), error => error.code === 'P0001' && /schema review/.test(error.message));
      assert.deepEqual(await snapshot(), initial);
    } finally { await pg.exec('drop trigger unexpected_delete on public.captions; drop function public.unexpected_delete()'); }
  });
  assert.deepEqual(await security(), before, 'tests leave the original constraints/RLS unchanged');
});
