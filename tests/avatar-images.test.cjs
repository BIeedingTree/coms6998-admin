/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderToStaticMarkup } = require('react-dom/server');
const { setup } = require('./harness.cjs');

test('avatar page reads only profiles with existing images and links to read-only Users', async () => {
  const h = setup({ profiles: [
    { id: 'admin-id', first_name: 'Admin', last_name: 'User', avatar_url: 'https://example.invalid/admin.png', is_superadmin: true },
    { id: 'member-id', first_name: 'Member', last_name: 'User', avatar_url: null, is_superadmin: false },
  ] });
  const html = renderToStaticMarkup(await h.load('app/admin/images/page.tsx').default({ searchParams: Promise.resolve({}) }));
  assert.match(html, /Avatar Images/);
  assert.match(html, /admin\.png/);
  assert.match(html, /\/admin\/users\?q=admin-id/);
  assert.doesNotMatch(html, /member-id|Upload new image|Edit metadata|Standalone images/);
  assert.equal(h.calls.writes.length, 0);
  assert.ok(h.calls.queries.some(q => q.table === 'profiles'));
  assert.ok(!h.calls.queries.some(q => q.table === 'admin_images'));
});
test('non-superadmins cannot read avatar page data', async () => {
  const h = setup({ profile: { id: 'admin-id', is_superadmin: false } });
  await assert.rejects(h.load('app/admin/images/page.tsx').default({ searchParams: Promise.resolve({}) }), /REDIRECT|not authorized|denied/i);
});
