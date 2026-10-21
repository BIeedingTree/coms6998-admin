/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setup, form } = require('./harness.cjs');
const valid = { situation: 'Ask for a meeting.', message_type: 'message', category: 'academic' };
const edit = { id: '1', caption_text: 'Revised caption', message_type: 'message', category: 'career' };
const caption = () => ({ id: '1', caption_text: 'Original', subject: null, message_type: 'message', category: 'academic', user_id: 'original-owner', is_public: true, published_at: '2026-01-01', prompt: 'Private original prompt' });
for (const [label, options, destination] of [
  ['anonymous', { user: null }, '/login'],
  ['invalid session', { authError: { message: 'expired' } }, '/login'],
  ['non-admin despite forged user metadata', { profile: { id: 'admin-id', is_superadmin: false } }, '/access-denied?reason=denied'],
  ['string true role', { profile: { id: 'admin-id', is_superadmin: 'true' } }, '/access-denied?reason=denied'],
  ['null role', { profile: { id: 'admin-id', is_superadmin: null } }, '/access-denied?reason=denied'],
  ['missing profile', { profile: null }, '/access-denied?reason=denied'],
  ['missing service key', { noServiceKey: true }, '/access-denied?reason=configuration'],
  ['missing role column', { roleError: { code: '42703' } }, '/access-denied?reason=configuration'],
]) {
  for (const method of ['generateMedia', 'updateMedia', 'deleteMedia']) test(`${label}: ${method} cannot write`, async () => {
    const env = setup(options);
    await assert.rejects(env.actions[method]({}, form({ ...valid, ...edit, confirmation: '1' })), error => error.message === 'REDIRECT:' + destination);
    assert.equal(env.calls.writes.length, 0); assert.equal(env.calls.ai.length, 0); assert.equal(env.calls.rpcs.length, 0);
    assert.ok(env.calls.queries.every(query => query.table === 'profiles'));
    if (!options.user && Object.hasOwn(options, 'user')) assert.equal(env.calls.factories, 0);
  });
  for (const method of ['getUsers', 'getMedia', 'getRatings', 'getDashboard', 'getCaption']) test(`${label}: ${method} cannot read admin data`, async () => {
    const env = setup(options);
    await assert.rejects(env.data[method](method === 'getCaption' ? '1' : {}), error => error.message === 'REDIRECT:' + destination);
    assert.ok(env.calls.queries.every(query => query.table === 'profiles'));
  });
}
test('CRUD round trip uses persisted rows, immutable ownership, and atomic deletion', async () => {
  const env = setup();
  const created = await env.actions.generateMedia({}, form({ ...valid, user_id: 'attacker', is_superadmin: 'true', is_public: 'true' }));
  assert.equal(created.id, '1'); assert.equal(env.tables.captions.length, 1);
  assert.equal(env.tables.captions[0].user_id, 'admin-id'); assert.equal(env.tables.captions[0].is_public, false); assert.equal(env.tables.captions[0].published_at, null);
  assert.equal((await env.data.getMedia({})).rows.length, 1);
  const updated = await env.actions.updateMedia({}, form({ ...edit, user_id: 'attacker', prompt: 'overwrite', is_public: 'true', is_superadmin: 'true' }));
  assert.ok(updated.message); assert.equal((await env.data.getCaption('1')).caption_text, 'Revised caption');
  assert.equal(env.tables.captions[0].user_id, 'admin-id'); assert.equal(env.tables.captions[0].is_public, false); assert.match(env.tables.captions[0].prompt, /Situation:/);
  await assert.rejects(env.actions.deleteMedia({}, form({ id: '1', confirmation: '1' })), /REDIRECT:\/admin\/media\?deleted=1/);
  assert.equal((await env.data.getMedia({})).count, 0);
  assert.ok(env.calls.writes.every(query => query.table === 'captions'));
});
test('updates preserve existing owner, prompt and publication', async () => {
  const env = setup({ captions: [caption()] }); await env.actions.updateMedia({}, form(edit));
  assert.equal(env.tables.captions[0].user_id, 'original-owner'); assert.equal(env.tables.captions[0].is_public, true); assert.equal(env.tables.captions[0].prompt, 'Private original prompt');
});
test('role revocation during AI generation prevents persistence and preserves redirect', async () => {
  const env = setup({ revokeDuringAI: true });
  await assert.rejects(env.actions.generateMedia({}, form(valid)), /REDIRECT:\/access-denied/);
  assert.equal(env.calls.writes.length, 0);
});
for (const value of ['', '0', '-1', '1.0', '1 OR 1=1', '9223372036854775808']) test('reject invalid record ID ' + JSON.stringify(value), async () => {
  const env = setup({ captions: [caption()] });
  assert.ok((await env.actions.updateMedia({}, form({ ...edit, id: value }))).error);
  assert.ok((await env.actions.deleteMedia({}, form({ id: value, confirmation: value }))).error);
  assert.equal(env.calls.writes.length, 0);
});
test('deletion requires exact confirmation and removes only selected media and its votes', async () => {
  const env = setup({ captions: [caption(), { ...caption(), id: '2' }], ratings: [{ id: '3', caption_id: '1', vote: 1, user_id: 'someone' }, { id: '4', caption_id: '1', vote: -1, user_id: 'another' }, { id: '5', caption_id: '2', vote: 1, user_id: 'someone' }] });
  assert.ok((await env.actions.deleteMedia({}, form({ id: '1', confirmation: 'yes' }))).error); assert.equal(env.calls.writes.length, 0);
  assert.equal(env.calls.rpcs.length, 0);
  await assert.rejects(env.actions.deleteMedia({}, form({ id: '1', confirmation: '1', user_id: 'forged' })), /REDIRECT:\/admin\/media\?deleted=1/);
  assert.equal(env.tables.captions.length, 1); assert.equal(env.tables.caption_votes.length, 1);
  assert.equal(env.tables.captions[0].id, '2'); assert.equal(env.tables.caption_votes[0].caption_id, '2');
  assert.equal(env.calls.rpcs[0].name, 'admin_delete_media');
  assert.equal(JSON.stringify(env.calls.rpcs[0].args), JSON.stringify({ p_media_id: '1', p_confirmation: '1' }));
  assert.ok(env.calls.refreshed.includes('/admin/media')); assert.ok(env.calls.refreshed.includes('/admin/ratings')); assert.ok(env.calls.refreshed.includes('/admin'));
});
for (const code of ['PGRST202', '42883', '42501', '23503', 'P0001']) test('failed deletion RPC preserves all rows and reports an error: ' + code, async () => {
  const env = setup({ captions: [caption()], ratings: [{ id: '3', caption_id: '1' }], rpcError: { code } });
  const result = await env.actions.deleteMedia({}, form({ id: '1', confirmation: '1' }));
  assert.ok(result.error); assert.equal(result.message, undefined);
  if (code === 'PGRST202' || code === '42883') assert.match(result.error, /not configured/);
  assert.equal(env.tables.captions.length, 1); assert.equal(env.tables.caption_votes.length, 1); assert.equal(env.calls.refreshed.length, 0);
});
test('role revocation before RPC is denied independently by the database', async () => {
  const env = setup({ captions: [caption()], revokeBeforeRPC: true });
  assert.match((await env.actions.deleteMedia({}, form({ id: '1', confirmation: '1' }))).error, /Permission denied/);
  assert.equal(env.tables.captions.length, 1);
});
test('ambiguous network failure never reports deletion success or a guaranteed rollback', async () => {
  const env = setup({ captions: [caption()], rpcThrows: true });
  assert.match((await env.actions.deleteMedia({}, form({ id: '1', confirmation: '1' }))).error, /Could not confirm deletion/);
  assert.equal(env.calls.refreshed.length, 0);
});
test('SDK transport errors also report an unconfirmed result', async () => {
  const env = setup({ captions: [caption()], rpcError: { message: 'Failed to fetch' } });
  assert.match((await env.actions.deleteMedia({}, form({ id: '1', confirmation: '1' }))).error, /Could not confirm deletion/);
  assert.equal(env.calls.refreshed.length, 0);
});
for (const options of [{ writeError: { code: '42501' } }, { zeroWrite: true }]) test('denied/zero-row writes never report success ' + JSON.stringify(options), async () => {
  const env = setup({ ...options, captions: [caption()] });
  for (const [method, values] of [['updateMedia', edit], ['deleteMedia', { id: '1', confirmation: '1' }], ['generateMedia', valid]]) {
    const state = await env.actions[method]({}, form(values)); assert.ok(state.error); assert.equal(state.message, undefined);
  }
  assert.equal(env.calls.refreshed.length, 0);
});
for (const options of [{ noAIKey: true }, { aiError: true }, { aiOutput: '{broken' }, { aiOutput: JSON.stringify({ subject: null, message: '' }) }, { aiOutput: JSON.stringify({ subject: 'invalid for text', message: 'message' }) }]) test('AI failure never inserts ' + JSON.stringify(options), async () => {
  const env = setup(options); assert.ok((await env.actions.generateMedia({}, form(valid))).error); assert.equal(env.calls.writes.length, 0);
});
test('email validation and conversion preserve schema constraints', async () => {
  const env = setup({ captions: [caption()] });
  for (const subject of ['', 'x'.repeat(201), 'two\nlines']) assert.ok((await env.actions.updateMedia({}, form({ ...edit, message_type: 'email', subject }))).error);
  assert.ok((await env.actions.updateMedia({}, form({ ...edit, message_type: 'email', subject: 'Meeting request' }))).message);
  assert.equal(env.tables.captions[0].subject, 'Meeting request');
  await env.actions.updateMedia({}, form(edit)); assert.equal(env.tables.captions[0].subject, null);
});
test('AI email creation validates and stores subject/body', async () => {
  const env = setup({ aiOutput: JSON.stringify({ subject: 'Meeting request', message: 'Could we meet?' }) });
  assert.ok((await env.actions.generateMedia({}, form({ ...valid, message_type: 'email' }))).message);
  assert.equal(env.tables.captions[0].subject, 'Meeting request');
});
test('invalid metadata and oversized requests do not call AI', async () => {
  const env = setup();
  for (const patch of [{ situation: '' }, { situation: 'x'.repeat(1001) }, { category: 'invented' }, { message_type: 'image' }]) assert.ok((await env.actions.generateMedia({}, form({ ...valid, ...patch }))).error);
  assert.equal(env.calls.ai.length, 0);
});
test('dashboard counts and rankings include every API page, private captions and both votes', async () => {
  const ratings = Array.from({ length: 1205 }, (_, i) => ({ id: i + 1, caption_id: i < 1100 ? '1' : '2', vote: i % 2 ? -1 : 1, user_id: 'admin-id' }));
  const env = setup({ ratings, captions: [caption(), { ...caption(), id: '2', is_public: false }], apiCap: 137 });
  const result = await env.data.getDashboard();
  assert.equal(result.media, 2); assert.equal(result.users, 1); assert.equal(result.published, 1); assert.equal(result.ratings, 1205); assert.equal(result.positive, 603); assert.equal(result.negative, 602);
  assert.equal(result.top[0].total, 1100); assert.equal(result.top[1].total, 105);
});
test('empty database produces genuine zero counts', async () => {
  const env = setup(); const result = await env.data.getDashboard(); assert.equal(result.media, 0); assert.equal(result.ratings, 0); assert.equal(result.top.length, 0);
});
test('database failures are errors, not invented zero statistics', async () => {
  const env = setup({ readError: { code: '42501' } });
  await assert.rejects(env.data.getDashboard(), /Permission denied/); await assert.rejects(env.data.getMedia({}), /Permission denied/);
});
test('users can be searched and paginated; ratings resolve the profile and caption', async () => {
  const profiles = Array.from({ length: 31 }, (_, i) => ({ id: i === 0 ? 'admin-id' : 'user-' + i, first_name: i === 0 ? 'Administrator' : 'Student', last_name: String(i), is_superadmin: i === 0 }));
  const env = setup({ profiles, captions: [caption()], ratings: [{ id: '1', caption_id: '1', user_id: 'user-1', vote: 1 }] });
  assert.equal((await env.data.getUsers({ page: '2' })).rows.length, 6); assert.equal((await env.data.getUsers({ q: 'Student' })).count, 30);
  const ratings = await env.data.getRatings({ vote: '1' }); assert.equal(ratings.rows.length, 1); assert.equal(ratings.profiles[0].id, 'user-1'); assert.equal(ratings.captions[0].id, '1');
  assert.equal((await env.data.getRatings({ vote: '-1' })).count, 0);
});
test('query normalization removes filter syntax and handles repeated query parameters', () => {
  const { data } = setup(); assert.equal(data.searchOptions({ q: 'a%,(id.eq.1)', page: '-9' }).page, 1); assert.ok(!/[%,()]/.test(data.searchOptions({ q: 'a%,(id.eq.1)' }).q)); assert.equal(data.searchOptions({ q: ['one', 'two'] }).q, '');
});
for (const [options, expected] of [[{}, '/admin'], [{ profile: null }, '/access-denied?reason=denied'], [{ user: null }, '/login?reason=auth'], [{ exchangeError: {} }, '/login?reason=auth']]) test('OAuth callback enforces authorization ' + expected, async () => {
  const env = setup(options); const { GET } = env.load('app/auth/callback/route.ts');
  const result = await GET(new Request('https://admin.example/auth/callback?code=test&next=https://evil.example'));
  assert.equal(result.url, 'https://admin.example' + expected); assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
});
test('bigint IDs retain exact values when reading and editing', async () => {
  const id = '9223372036854775806';
  const env = setup({ captions: [{ ...caption(), id }] });
  assert.equal((await env.data.getCaption(id)).id, id);
  assert.ok((await env.actions.updateMedia({}, form({ ...edit, id }))).message);
  assert.equal(env.tables.captions[0].id, id);
});
