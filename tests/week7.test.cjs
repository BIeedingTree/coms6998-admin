/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setup, form } = require('./harness.cjs');
const id = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const fixtures = {
  terms: { term: 'Tone', definition: 'Style of expression' },
  'generation-examples': { name: 'Example', input: 'Request', output: 'Response', chain_id: '', model_id: '', media_id: '' },
  'llm-models': { name: 'Model', model_key: 'test-model', provider_id: other },
  'llm-providers': { name: 'Provider' },
  'allowed-signup-domains': { domain: 'EXAMPLE.EDU' },
  'whitelisted-emails': { email: 'Admin@Example.edu' },
};
function context(options = {}) {
  const initial = setup();
  const { resources } = initial.load('lib/admin-resources.ts');
  const tables = Object.fromEntries(resources.map(r => [r.table, []]));
  return setup({ tables: { ...tables, ...options.tables }, ...options });
}
for (const [slug, fields] of Object.entries(fixtures)) {
  test(`${slug}: server create/read/update/delete round trip (mocked Supabase)`, async () => {
    const h = context(); const actions = h.load('app/admin/[section]/actions.ts');
    const r = h.load('lib/admin-resources.ts').resourceFor(slug);
    let result = await actions.saveResource(slug, null, {}, form(fields)); assert.ok(result.id, result.error);
    // The shared Week 6 fake allocates integer IDs. Set the fixture UUID to model the new DB default.
    h.tables[r.table][0].id = id;
    let read = await h.load('lib/admin-data.ts').getResource(slug, id); assert.equal(read.row.id, id);
    const field = Object.keys(fields)[0]; const changed = { ...fields, [field]: slug === 'allowed-signup-domains' ? 'new.edu' : slug === 'whitelisted-emails' ? 'new@example.edu' : 'Updated' };
    result = await actions.saveResource(slug, id, {}, form({ ...changed, is_superadmin: 'true', id: other })); assert.ok(result.message, result.error);
    read = await h.load('lib/admin-data.ts').getResource(slug, id); assert.equal(read.row[field], changed[field]); assert.equal(h.tables[r.table][0].is_superadmin, undefined);
    assert.match((await actions.deleteResource(slug, id, {}, form({ confirmation: other }))).error, /exact/);
    result = await actions.deleteResource(slug, id, {}, form({ confirmation: id })); assert.ok(result.message, result.error);
    assert.equal((await h.load('lib/admin-data.ts').listResource(slug, {})).count, 0);
  });
}
test('all read-only resources refuse forged mutations; mix allows only weight updates', async () => {
  const h = context({ tables: { prompt_chain_mix: [{ id, chain_id: other, weight: 1 }] } });
  const api = h.load('app/admin/[section]/actions.ts');
  for (const slug of ['prompt-chains','prompt-chain-steps','generation-requests','llm-responses','profiles','captions','__proto__']) {
    assert.ok((await api.saveResource(slug, id, {}, form({ name: 'bad' }))).error);
    assert.ok((await api.deleteResource(slug, id, {}, form({ confirmation: id }))).error);
  }
  assert.ok((await api.saveResource('prompt-chain-mix', null, {}, form({ weight: '1' }))).error);
  assert.ok((await api.saveResource('prompt-chain-mix', id, {}, form({ weight: '0', chain_id: id }))).message);
  assert.equal(h.tables.prompt_chain_mix[0].weight, 0); assert.equal(h.tables.prompt_chain_mix[0].chain_id, other);
  assert.ok((await api.deleteResource('prompt-chain-mix', id, {}, form({ confirmation: id }))).error);
});
test('validation rejects malformed values and normalizes unique access entries', () => {
  const h = context(); const { parseResource, resourceFor } = h.load('lib/admin-resources.ts');
  for (const domain of ['https://example.edu','a@b.edu','-bad.edu','bad-.edu','localhost','a..edu']) assert.ok(parseResource(resourceFor('allowed-signup-domains'), form({ domain })).error, domain);
  for (const email of ['a@@b.edu','.a@b.edu','a..b@b.edu','a.@b.edu','a@localhost','x y@b.edu']) assert.ok(parseResource(resourceFor('whitelisted-emails'), form({ email })).error, email);
  for (const weight of ['-1','NaN','Infinity','1000001','1.12345','1e2','']) assert.ok(parseResource(resourceFor('prompt-chain-mix'), form({ weight })).error, weight);
  assert.equal(parseResource(resourceFor('allowed-signup-domains'), form({ domain: ' EXAMPLE.EDU ' })).values.domain, 'example.edu');
  assert.ok(parseResource(resourceFor('generation-examples'), form({ ...fixtures['generation-examples'], media_id: '9223372036854775808' })).error);
  assert.ok(parseResource(resourceFor('llm-models'), form({ ...fixtures['llm-models'], provider_id: 'bad' })).error);
});
for (const options of [{ user: null }, { profile: { id, is_superadmin: false } }, { noServiceKey: true }]) {
  test(`new loaders and mutations reject unauthorized callers ${JSON.stringify(options)}`, async () => {
    const h = context(options); const api = h.load('app/admin/[section]/actions.ts'); const images = h.load('app/admin/images/actions.ts'); const data = h.load('lib/admin-data.ts');
    const calls = [() => data.listResource('terms', {}), () => data.getResource('terms', id), () => data.referenceOptions(h.load('lib/admin-resources.ts').resourceFor('llm-models')), () => api.saveResource('terms', null, {}, form(fixtures.terms)), () => api.deleteResource('terms', id, {}, form({ confirmation: id })), () => images.uploadImage({}, form({})), () => images.updateImage(id, {}, form({})), () => images.deleteImage(id, {}, form({ confirmation: id })), () => h.load('lib/admin-images.ts').listImages({})];
    for (const call of calls) await assert.rejects(call, /REDIRECT/);
    assert.equal(h.calls.writes.length, 0);
  });
}
test('provider dependencies and DB errors return actionable messages', async () => {
  const h = context({ tables: { llm_models: [{ id: other, provider_id: id }] } });
  const result = await h.load('app/admin/[section]/actions.ts').deleteResource('llm-providers', id, {}, form({ confirmation: id })); assert.match(result.error, /1 LLM model/); assert.equal(h.calls.writes.length, 0);
  for (const code of ['23503','23505','23514','42501','PGRST205']) {
    const x = context({ writeError: { code } });
    assert.ok((await x.load('app/admin/[section]/actions.ts').saveResource('terms', null, {}, form(fixtures.terms))).error);
  }
});
test('list search, pagination, exact IDs, steps filtering and setup errors', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: `00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`, term: `Term ${i}`, definition: 'Description', created_at: '2026-10-29' }));
  const h = context({ tables: { terms: rows, prompt_chain_steps: [{ id, chain_id: other, name: 'Step', step_order: 1 }] } });
  const data = h.load('lib/admin-data.ts');
  assert.equal((await data.listResource('terms', { page: '2' })).rows.length, 5);
  assert.equal((await data.listResource('terms', { q: 'Term 29' })).count, 1);
  assert.equal((await data.listResource('terms', { q: id })).count, 1);
  assert.equal((await data.listResource('prompt-chain-steps', { chain: other })).count, 1);
  assert.equal((await data.listResource('prompt-chain-steps', { chain: id })).count, 0);
  assert.match((await context({ readError: { code: 'PGRST205' } }).load('lib/admin-data.ts').listResource('terms', {})).error, /migration/);
});
test('image signatures, immutable storage paths, and metadata validation', () => {
  const { imageExtension, managedPath, imageMetadata } = context().load('lib/admin-images.ts');
  assert.equal(imageExtension(new Uint8Array([137,80,78,71,13,10,26,10]), 'image/png'), 'png');
  assert.equal(imageExtension(new Uint8Array([255,216,255]), 'image/png'), null);
  assert.equal(imageExtension(new Uint8Array([60,115,118,103]), 'image/svg+xml'), null);
  assert.equal(managedPath(`admin-images/${id}.png`), true); assert.equal(managedPath(`${id}/avatar.png`), false);
  assert.equal(imageMetadata(form({ title: ' ' })), null); assert.equal(imageMetadata(form({ title: 'Photo', alt_text: 'x'.repeat(1001) })), null);
});
function imageContext(options = {}) {
  const h = context({ tables: { admin_images: [] }, ...options });
  const objects = new Map(); const calls = [];
  h.db.storage = { from(bucket) { assert.equal(bucket, 'avatars'); return {
    getPublicUrl(path) { return { data: { publicUrl: `https://test.invalid/storage/v1/object/public/avatars/${path}` } }; },
    async upload(path, bytes) { calls.push(['upload',path]); if (options.uploadError) return { error: {} }; objects.set(path,bytes); return { error: null }; },
    async remove(paths) { calls.push(['remove',...paths]); if (options.removeError) return { error: {} }; paths.forEach(p => objects.delete(p)); return { error: null }; },
  }; } };
  return { ...h, objects, storageCalls: calls, imageActions: h.load('app/admin/images/actions.ts') };
}
const pngForm = () => { const value = form({ title:'Test image',alt_text:'Alt text' }); value.set('file',new File([new Uint8Array([137,80,78,71,13,10,26,10])],'test.png',{type:'image/png'})); return value; };
test('image upload/read/update/delete round trip with mocked storage and Supabase', async () => {
  const h = imageContext();
  let result = await h.imageActions.uploadImage({},pngForm()); assert.ok(result.message,result.error);
  const imageId = result.id; assert.equal(h.objects.size,1);
  let read = await h.load('lib/admin-images.ts').listImages({}); assert.equal(read.rows[0].id,imageId); assert.equal(read.rows[0].title,'Test image');
  result = await h.imageActions.updateImage(imageId,{},form({title:'Changed',alt_text:'Updated',storage_path:'victim/avatar.png'})); assert.ok(result.message,result.error);
  read = await h.load('lib/admin-images.ts').listImages({}); assert.equal(read.rows[0].title,'Changed'); assert.match(read.rows[0].storage_path,/^admin-images\//);
  assert.ok((await h.imageActions.deleteImage(imageId,{},form({confirmation:'wrong'}))).error);
  result = await h.imageActions.deleteImage(imageId,{},form({confirmation:imageId})); assert.ok(result.message,result.error);
  assert.equal(h.objects.size,0); assert.equal((await h.load('lib/admin-images.ts').listImages({})).rows.length,0);
});
test('images refuse linked profile objects and unknown namespaces; cleanup on metadata failure', async () => {
  const h = imageContext(); const saved = await h.imageActions.uploadImage({},pngForm());
  h.profile.avatar_url = h.db.storage.from('avatars').getPublicUrl(h.tables.admin_images[0].storage_path).data.publicUrl+'?v=1';
  assert.match((await h.imageActions.deleteImage(saved.id,{},form({confirmation:saved.id}))).error,/referenced by a profile/);
  assert.equal(h.objects.size,1);
  h.tables.admin_images[0].storage_path = 'profile/avatar.png';
  assert.match((await h.imageActions.deleteImage(saved.id,{},form({confirmation:saved.id}))).error,/Profile avatar paths/);
  const broken = imageContext({writeError:{code:'23514'}});
  assert.ok((await broken.imageActions.uploadImage({},pngForm())).error);
  assert.equal(broken.objects.size,0);
});
test('image upload failure and deletion failure retain safe state', async () => {
  const broken = imageContext({uploadError:true}); assert.ok((await broken.imageActions.uploadImage({},pngForm())).error); assert.equal(broken.tables.admin_images.length,0);
  const h = imageContext({removeError:true}); const saved = await h.imageActions.uploadImage({},pngForm());
  assert.match((await h.imageActions.deleteImage(saved.id,{},form({confirmation:saved.id}))).error,/metadata was retained/);
  assert.equal(h.tables.admin_images.length,1); assert.equal(h.objects.size,1);
  const invalid = pngForm(); invalid.set('file',new File(['<script>bad</script>'],'bad.png',{type:'image/png'}));
  assert.match((await h.imageActions.uploadImage({},invalid)).error,/does not match/);
});
for (const [slug, table, row] of [
  ['prompt-chains','prompt_chains',{name:'Chain',description:'Config'}],
  ['prompt-chain-steps','prompt_chain_steps',{chain_id:other,name:'Step',step_order:1,prompt:'Prompt',model_id:null}],
]) test(`${slug}: loads actual selected fields from its configured table (mocked transport)`, async () => {
  const h=context({tables:{[table]:[{id,...row}]}}); const data=h.load('lib/admin-data.ts');
  assert.equal((await data.listResource(slug,{})).count,1);
  const detail=await data.getResource(slug,id);
  for(const [key,value] of Object.entries(row)) assert.equal(detail.row[key],value);
  assert.equal(h.calls.writes.length,0);
});
for (const slug of ['generation-requests','llm-responses']) {
  test(`${slug}: reads stored Gemini fields with exact bigint IDs, never calls AI or new log tables`, async () => {
    const mediaId='9223372036854775807';
    const row={id:mediaId,prompt:'Situation:\nAn actual saved prompt',caption_text:'Saved Gemini output',subject:'Saved subject',user_id:other,message_type:'email',category:'academic',created_at:'2026-10-29T12:00:00Z'};
    const h=setup({captions:[row],profiles:[{id:'admin-id',is_superadmin:true},{id:other,first_name:'Existing',last_name:'User'}]});
    const data=h.load('lib/admin-data.ts');
    const list=await data.listResource(slug,{q:mediaId}); assert.equal(list.count,1); assert.equal(list.rows[0].id,mediaId);
    const detail=await data.getResource(slug,mediaId); assert.equal(detail.row.prompt,row.prompt);
    if(slug==='llm-responses') { assert.equal(detail.row.caption_text,row.caption_text); assert.equal(detail.row.subject,row.subject); }
    assert.equal(detail.row.status,undefined); assert.equal(detail.row.model_id,undefined);
    const options=await data.referenceOptions(detail.resource,detail.row); assert.equal(options.id[0].id,mediaId); assert.match(options.user_id[0].label,/Existing User/);
    assert.equal(h.calls.ai.length,0); assert.equal(h.calls.writes.length,0);
    assert.ok(h.calls.queries.every(q=>['captions','profiles'].includes(q.table)));
    await assert.rejects(data.getResource(slug,id),/NOT_FOUND/); // UUID is not a media ID.
    const actions=h.load('app/admin/[section]/actions.ts');
    assert.ok((await actions.saveResource(slug,mediaId,{},form({caption_text:'Forged'}))).error);
    assert.ok((await actions.deleteResource(slug,mediaId,{},form({confirmation:mediaId}))).error);
    assert.equal(h.calls.writes.length,0);
  });
  for (const options of [{user:null},{profile:{id:'admin-id',is_superadmin:false}}]) test(`${slug}: stored media stays behind superadmin authorization ${JSON.stringify(options)}`,async()=>{
    const h=setup(options); const data=h.load('lib/admin-data.ts');
    await assert.rejects(data.listResource(slug,{}),/REDIRECT/); await assert.rejects(data.getResource(slug,'1'),/REDIRECT/);
    assert.ok(h.calls.queries.every(q=>q.table==='profiles'));
  });
}
test('requests exclude missing prompts; responses preserve nullable subject and reflect edits/deletion',async()=>{
  const h=setup({captions:[{id:'1',prompt:null,caption_text:'Legacy content',subject:null},{id:'2',prompt:'',caption_text:'No prompt'},{id:'3',prompt:'Saved input',caption_text:'Initial output',subject:null}]});
  const data=h.load('lib/admin-data.ts');
  assert.equal((await data.listResource('generation-requests',{})).count,1);
  assert.equal((await data.listResource('llm-responses',{})).count,3);
  await assert.rejects(data.getResource('generation-requests','1'),/NOT_FOUND/);
  await assert.rejects(data.getResource('generation-requests','2'),/NOT_FOUND/);
  const response=await data.getResource('llm-responses','1'); assert.equal(response.row.subject,null); assert.equal(response.row.prompt,null);
  assert.match(response.resource.notice,/edited/); assert.match(response.resource.notice,/not an immutable/);
  h.tables.captions[2].caption_text='Edited output';
  assert.equal((await data.getResource('llm-responses','3')).row.caption_text,'Edited output');
  h.tables.captions.splice(2,1);
  assert.equal((await data.listResource('generation-requests',{})).count,0);
  await assert.rejects(data.getResource('llm-responses','3'),/NOT_FOUND/);
  assert.equal(h.calls.ai.length,0);
});
test('stored input/output search and pagination use the original table',async()=>{
  const h=setup({captions:Array.from({length:30},(_,i)=>({id:String(i+1),prompt:`Request ${i}`,caption_text:`Output ${i}`,subject:null}))});
  const data=h.load('lib/admin-data.ts');
  for(const slug of ['generation-requests','llm-responses']) assert.equal((await data.listResource(slug,{page:'2'})).rows.length,5);
  assert.equal((await data.listResource('generation-requests',{q:'Request 29'})).count,1);
  assert.equal((await data.listResource('llm-responses',{q:'Output 29'})).count,1);
});
test('observability list/detail pages render existing data and provenance without configuration tables',async()=>{
  const {renderToStaticMarkup}=require('react-dom/server');
  const mediaId='9223372036854775807';
  const h=setup({captions:[{id:mediaId,prompt:'Stored request text',caption_text:'Actual stored output',subject:'Saved subject',user_id:other,created_at:'2026-10-29T12:00:00Z'}]});
  const list=h.load('app/admin/[section]/page.tsx').default;
  const detail=h.load('app/admin/[section]/[id]/page.tsx').default;
  for(const section of ['generation-requests','llm-responses']) {
    const html=renderToStaticMarkup(await list({params:Promise.resolve({section}),searchParams:Promise.resolve({})}));
    assert.match(html,/Media saved/); assert.match(html,new RegExp(mediaId));
    const full=renderToStaticMarkup(await detail({params:Promise.resolve({section,id:mediaId}),searchParams:Promise.resolve({saved:'1'})}));
    assert.match(full,/Stored request text/); assert.match(full,/Media ID/); assert.doesNotMatch(full,/Record created in Supabase/);
    if(section==='llm-responses') { assert.match(full,/Actual stored output/); assert.match(full,/Saved subject/); assert.match(full,/not an immutable response archive/); }
    else assert.match(full,/request status/);
  }
  assert.equal(h.calls.ai.length,0); assert.equal(h.calls.writes.length,0);
});
