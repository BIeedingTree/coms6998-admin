/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const sql = fs.readFileSync(require('node:path').join(__dirname, '../supabase/migrations/202610290001_week7_admin.sql'), 'utf8');
const admin = '00000000-0000-0000-0000-000000000001';
const member = '00000000-0000-0000-0000-000000000002';
test('Week 7 migration: real SQL in isolated PostgreSQL, never live Supabase', async t => {
  const pg = new PGlite(); t.after(() => pg.close());
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key references auth.users(id), is_superadmin boolean not null default false);
    create table public.captions(id bigint primary key, caption_text text, subject text,
      prompt text, user_id uuid references auth.users(id), message_type text not null default 'message',
      category text not null default 'other', created_at timestamptz default now());
    create table public.caption_votes(id bigint primary key, caption_id bigint references public.captions(id), user_id uuid references auth.users(id), vote smallint check(vote in (-1,1)), unique(caption_id,user_id));
    alter table public.profiles enable row level security; alter table public.captions enable row level security; alter table public.caption_votes enable row level security;
    create policy existing_profile_policy on public.profiles for select using (id = auth.uid());
    insert into auth.users values ('${admin}'),('${member}');
    insert into public.profiles values ('${admin}',true),('${member}',false);
    insert into public.captions(id,caption_text) values (1,'Original'),(2,'Other');
    insert into public.caption_votes values (1,1,'${member}',1),(2,2,'${admin}',-1);`);
  const oldSchema = async () => (await pg.query(`select c.relname,c.relrowsecurity,(select jsonb_agg(pg_get_constraintdef(oid) order by conname) from pg_constraint where conrelid=c.oid) constraints from pg_class c where c.oid in ('profiles'::regclass,'captions'::regclass,'caption_votes'::regclass) order by c.relname`)).rows;
  const oldRows = async () => (await pg.query('select (select jsonb_agg(p) from profiles p) profiles, (select jsonb_agg(c) from captions c) media, (select jsonb_agg(v) from caption_votes v) votes')).rows;
  const schema = await oldSchema(), rows = await oldRows();
  await pg.exec(sql); await pg.exec(sql);
  assert.deepEqual(await oldSchema(), schema); assert.deepEqual(await oldRows(), rows);
  assert.equal((await pg.query("select count(*)::int n from pg_policies where policyname='existing_profile_policy'")).rows[0].n, 1);
  const tables = ['llm_providers','llm_models','prompt_chains','prompt_chain_steps','prompt_chain_mix','terms','ai_generation_examples','allowed_signup_domains','whitelisted_emails','admin_images'];
  await t.test('every new table denies browser roles and permits service-role CRUD', async () => {
    for (const table of tables) {
      assert.equal((await pg.query('select relrowsecurity from pg_class where oid=$1::regclass',[table])).rows[0].relrowsecurity,true);
      for (const role of ['anon','authenticated']) {
        await pg.exec(`set role ${role}`);
        try { await assert.rejects(pg.query(`select * from public.${table}`), e => e.code === '42501'); }
        finally { await pg.exec('reset role'); }
        for (const privilege of ['INSERT','UPDATE','DELETE']) assert.equal((await pg.query('select has_table_privilege($1,$2,$3) ok',[role,table,privilege])).rows[0].ok,false);
      }
      assert.equal((await pg.query("select has_table_privilege('service_role',$1,'SELECT,INSERT,UPDATE,DELETE') ok",[table])).rows[0].ok,true);
    }
  });
  await t.test('every Week 7 page projection, search field, and form field matches the migration or existing media schema', async () => {
    const h = require('./harness.cjs').setup();
    const {resources} = h.load('lib/admin-resources.ts');
    const {fieldsFor} = h.load('lib/admin-data.ts');
    for (const resource of resources) {
      // Execute the real loader projection against PostgreSQL, including bigint casts.
      await pg.query(`select ${fieldsFor(resource)} from public.${resource.table} limit 0`);
      const columns = (await pg.query('select column_name from information_schema.columns where table_schema=$1 and table_name=$2',['public',resource.table])).rows.map(row => row.column_name);
      for (const field of [...resource.search,...resource.fields.map(f=>f.key)]) assert.ok(columns.includes(field),`${resource.slug}: ${field}`);
      for (const field of resource.fields.filter(f=>f.reference && !resource.source)) {
        const target = field.reference === 'media' ? 'captions' : resources.find(r=>r.slug===field.reference).table;
        const keys = (await pg.query(`select a.attname, c.confrelid::regclass::text target from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey) where c.contype='f' and c.conrelid=$1::regclass`,[resource.table])).rows;
        assert.ok(keys.some(k=>k.attname===field.key && k.target===target),`${resource.slug}: FK ${field.key} → ${target}`);
      }
    }
    await pg.query(`select ${h.load('lib/admin-images.ts').IMAGE_FIELDS} from public.admin_images limit 0`);
  });
  let provider, model, chain, example;
  async function insert(table, values) {
    const keys = Object.keys(values); return (await pg.query(`insert into public.${table}(${keys.join(',')}) values (${keys.map((_,i)=>`$${i+1}`).join(',')}) returning *`,Object.values(values))).rows[0];
  }
  await t.test('relational records persist and mix is provisioned with validated relative weights', async () => {
    provider = await insert('llm_providers',{name:'Test provider'});
    model = await insert('llm_models',{name:'Test model',model_key:'test-key',provider_id:provider.id});
    chain = await insert('prompt_chains',{name:'Test chain'});
    await insert('prompt_chain_steps',{name:'Step',step_order:1,prompt:'A real test prompt',chain_id:chain.id,model_id:model.id});
    await assert.rejects(insert('prompt_chain_steps',{name:'Duplicate order',step_order:1,prompt:'Prompt',chain_id:chain.id}),e=>e.code==='23505');
    assert.equal((await pg.query('select weight from prompt_chain_mix where chain_id=$1',[chain.id])).rows[0].weight,'1.0000');
    await pg.query('update prompt_chain_mix set weight=2.5 where chain_id=$1',[chain.id]);
    assert.equal((await pg.query('select weight from prompt_chain_mix where chain_id=$1',[chain.id])).rows[0].weight,'2.5000');
    await assert.rejects(pg.query('update prompt_chain_mix set weight=-1 where chain_id=$1',[chain.id]),e=>e.code==='23514');
    example = await insert('ai_generation_examples',{name:'Example',input:'Input',output:'Output',chain_id:chain.id,model_id:model.id,media_id:1});
    await assert.rejects(pg.query('delete from llm_providers where id=$1',[provider.id]),e=>['23503','23001'].includes(e.code));
    await assert.rejects(pg.query('delete from llm_models where id=$1',[model.id]),e=>['23503','23001'].includes(e.code));
  });
  await t.test('CRUD for terms, domains, emails, models, providers, examples and image metadata', async () => {
    const cases = [
      ['terms',{term:'Test',definition:'Definition'},'definition','Updated'],
      ['allowed_signup_domains',{domain:'example.edu'},'domain','new.edu'],
      ['whitelisted_emails',{email:'test@example.edu'},'email','new@example.edu'],
      ['llm_providers',{name:'Disposable'},'name','Renamed'],
      ['llm_models',{name:'Disposable model',model_key:'disposable',provider_id:provider.id},'name','Renamed'],
      ['ai_generation_examples',{name:'Disposable example',input:'In',output:'Out'},'output','Changed'],
      ['admin_images',{title:'Test image',storage_path:`admin-images/${admin}.png`,mime_type:'image/png',size_bytes:8},'title','New title'],
    ];
    await pg.exec('set role service_role');
    try {
      for (const [table, values, field, changed] of cases) {
        const row = await insert(table, values);
        assert.equal((await pg.query(`select count(*)::int n from ${table} where id=$1`,[row.id])).rows[0].n,1);
        await pg.query(`update ${table} set ${field}=$1 where id=$2`,[changed,row.id]);
        assert.equal((await pg.query(`select ${field} from ${table} where id=$1`,[row.id])).rows[0][field],changed);
        await pg.query(`delete from ${table} where id=$1`,[row.id]);
        assert.equal((await pg.query(`select count(*)::int n from ${table} where id=$1`,[row.id])).rows[0].n,0);
      }
    } finally { await pg.exec('reset role'); }
  });
  await t.test('database validates unique access lists, bad addresses and protected image paths', async () => {
    await insert('allowed_signup_domains',{domain:'unique.edu'});
    await assert.rejects(insert('allowed_signup_domains',{domain:'unique.edu'}),e=>e.code==='23505');
    for (const domain of ['EXAMPLE.EDU','https://a.edu','a..edu','-bad.edu']) await assert.rejects(insert('allowed_signup_domains',{domain}),e=>e.code==='23514');
    for (const email of ['a@@b.edu','.a@b.edu','a..b@b.edu','A@b.edu','a@localhost']) await assert.rejects(insert('whitelisted_emails',{email}),e=>e.code==='23514');
    await assert.rejects(insert('admin_images',{title:'Bad',storage_path:`${admin}/profile.png`,mime_type:'image/png',size_bytes:8}),e=>e.code==='23514');
    await assert.rejects(insert('terms',{term:' ',definition:'x'}),e=>e.code==='23514');
  });
  const removeMedia = async (actor, mediaId) => {
    await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
    await pg.exec('set role authenticated');
    try { return (await pg.query('select public.admin_delete_media($1,$2) result',[mediaId,String(mediaId)])).rows[0].result; }
    finally { await pg.exec('reset role'); }
  };
  await t.test('media deletion is atomic, preserves example text, and detaches only the selected media', async () => {
    const unrelated = await insert('ai_generation_examples',{name:'Unrelated',input:'Keep input',output:'Keep output',media_id:2});
    const originalExample = (await pg.query('select * from ai_generation_examples where id=$1',[example.id])).rows[0];
    await assert.rejects(removeMedia(member,1),e=>e.code==='42501');
    await assert.rejects(removeMedia('',1),e=>e.code==='42501');
    // Exercise a real mid-delete failure after votes are removed, during FK detachment.
    await pg.exec(`create function public.test_block_detach() returns trigger language plpgsql as $$begin raise exception 'Test-only failure'; end$$;
      create trigger test_block_detach before update on ai_generation_examples for each row execute function public.test_block_detach()`);
    await assert.rejects(removeMedia(admin,1),e=>e.code==='P0001');
    assert.equal((await pg.query('select count(*)::int n from caption_votes where caption_id=1')).rows[0].n,1);
    assert.deepEqual((await pg.query('select * from ai_generation_examples where id=$1',[example.id])).rows[0],originalExample);
    await pg.exec('drop trigger test_block_detach on ai_generation_examples; drop function public.test_block_detach()');
    assert.deepEqual(await removeMedia(admin,1),{id:'1',deleted_ratings:'1'});
    assert.equal((await pg.query('select count(*)::int n from captions where id=1')).rows[0].n,0);
    assert.equal((await pg.query('select count(*)::int n from caption_votes where caption_id=1')).rows[0].n,0);
    assert.deepEqual((await pg.query('select * from ai_generation_examples where id=$1',[example.id])).rows[0],{...originalExample,media_id:null});
    assert.equal((await pg.query('select media_id from ai_generation_examples where id=$1',[unrelated.id])).rows[0].media_id,2);
    assert.equal((await pg.query('select count(*)::int n from caption_votes where caption_id=2')).rows[0].n,1);
    assert.deepEqual(await removeMedia(admin,2),{id:'2',deleted_ratings:'1'});
  });
  await t.test('chain mix provisioning works for service_role; unknown cascade dependencies remain blocked', async () => {
    await pg.exec('set role service_role');
    try {
      const created = await insert('prompt_chains',{name:'Service provisioned chain'});
      assert.equal((await pg.query('select count(*)::int n from prompt_chain_mix where chain_id=$1',[created.id])).rows[0].n,1);
    } finally { await pg.exec('reset role'); }
    await pg.exec('create table public.unreviewed_dependency(id bigint primary key, media_id bigint references public.captions(id) on delete cascade)');
    await assert.rejects(removeMedia(admin,99),e=>e.code==='P0001');
    await pg.exec('drop table public.unreviewed_dependency');
  });

  await t.test('no redundant log tables; exactly one new media FK with SET NULL', async () => {
    assert.equal((await pg.query("select to_regclass('public.generation_requests') as requests, to_regclass('public.llm_responses') as responses")).rows[0].requests,null);
    assert.equal((await pg.query("select to_regclass('public.llm_responses') as responses")).rows[0].responses,null);
    const keys=(await pg.query("select conrelid::regclass::text as source,confdeltype from pg_constraint where contype='f' and confrelid='public.captions'::regclass order by source")).rows;
    assert.deepEqual(keys,[{source:'ai_generation_examples',confdeltype:'n'},{source:'caption_votes',confdeltype:'a'}]);
  });
  await t.test('an already-applied incompatible draft fails without rewriting its FK', async () => {
    await pg.exec('alter table ai_generation_examples drop constraint ai_generation_examples_media_id_fkey; alter table ai_generation_examples add constraint ai_generation_examples_media_id_fkey foreign key(media_id) references captions(id) on delete restrict');
    await assert.rejects(pg.exec(sql),/Existing example\/media foreign key differs/);
    await pg.exec('rollback');
    assert.equal((await pg.query("select confdeltype from pg_constraint where conname='ai_generation_examples_media_id_fkey'")).rows[0].confdeltype,'r');
  });

  await t.test('pre-existing log tables and their data are not silently dropped', async () => {
    await pg.exec("create table generation_requests(id bigint primary key, input text); insert into generation_requests values(1,'Keep this log')");
    await assert.rejects(pg.exec(sql),/Earlier Week 7 log tables exist/);
    await pg.exec('rollback');
    assert.equal((await pg.query('select input from generation_requests where id=1')).rows[0].input,'Keep this log');
  });

});
